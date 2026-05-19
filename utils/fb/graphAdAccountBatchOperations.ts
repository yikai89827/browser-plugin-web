import type { BatchDrawerSubmitPayload } from '../../site/src/lib/batchOperationTypes';
import { getConfiguredGraphBatchStepDelayMs } from './batchStepDelayMs';
import {
  currencyOffset,
  detectSpendCapUnit,
  formatSpendCapMajorLabel,
  spendCapRawToMinor,
  type SpendCapNormalizeHints,
} from './spendCapCurrency';

/** Marketing API 写 spend_cap 用主单位（美元）；删限额用 spend_cap_action */
type SpendCapPostAction = 'set' | 'delete_cap' | 'reset_spent';

function formatSpendCapMajorForPost(minor: number, currency?: string | null): string {
  const offset = currencyOffset(currency);
  const major = Math.max(0, minor) / offset;
  if (Math.abs(major - Math.round(major)) < 1e-6) return String(Math.round(major));
  return major.toFixed(2);
}
import { fbControlLog } from '../fbControlLog';
import { fetchFacebookMeNumericId } from './graphFetchMe';
import { graphFetch } from './graphExternalFetch';
import { redactUrlForLog } from './tokenDebugLog';
import {
  assignBusinessUserToAdAccount,
  buildAdAccountAssignedUsersReadUrl,
  fetchAdAccountOwnerBusinessId,
  formatNotBusinessScopedUserHint,
  inviteBusinessUserByEmail,
  parsePrimaryBmIdFromText,
  postBusinessPartnerAgency,
  resolveBusinessIdForAdAccount,
  resolveBusinessIdsForAccounts,
  resolveBusinessUserIdForPersonalInBusinesses,
  searchBusinessUserByEmailInBusinesses,
  type AssignedUserLookupRow,
  type GraphBusinessUserMatch,
} from './graphBusinessManagement';

const GRAPH_VERSION = 'v21.0';

/** 批量结果卡类型：广告账户 Graph 结果 / 检测好友（UID 预检）结果 */
export type AdAccountBatchResultKind = 'ad_account' | 'friend_uid';

export type AdAccountBatchResultRow = {
  accountId: string;
  status: string;
  detail: string;
  /** 默认按广告账户展示；friend_uid 时第二行标题为「检测账号」 */
  resultKind?: AdAccountBatchResultKind;
  /** 好友预检：展示用户原始输入（主页链接或 UID） */
  displayInput?: string;
  /** 当前登录 Facebook 主页链接（检测好友卡展示） */
  currentFbProfileUrl?: string | null;
  /** 好友预检：尚未请求 Graph，仅用于占位与遮盖层 */
  friendCheckPending?: boolean;
};

/** Graph 单 UID 预检一行 */
export type UidGraphVerifyDetailRow = {
  uid: string;
  ok: boolean;
  /** 成功：面向操作的说明；失败：面向用户的固定说明（不暴露 Graph 原文） */
  detail: string;
  /** 用户输入的原始值（主页链接或 UID），用于结果卡展示 */
  displayInput?: string;
};

export type VerifyFacebookUserIdsForBatchResult = {
  ok: boolean;
  message: string;
  rows: UidGraphVerifyDetailRow[];
  currentUserProfileUrl: string | null;
};

/** 批量 Graph 可选能力（站点经扩展桥接注入） */
export type GraphBatchOperationOptions = {
  /** vanity 主页：扩展内 Comet 解析数字 uid */
  resolveProfileNumericId?: (profileUrl: string) => Promise<string | null>;
  /** 站点从 BM 列等带入的 BM id，用于 assigned_users 的 business 参数 */
  accountBmHintIds?: string[];
};

function actPath(accountId: string): string {
  const raw = String(accountId).replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : String(accountId);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** 个人主页域名：不含 business / developers 等，避免误把路径当成用户名 */
function isFacebookProfileHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'facebook.com' ||
    h === 'www.facebook.com' ||
    h === 'm.facebook.com' ||
    h === 'mbasic.facebook.com' ||
    h === 'web.facebook.com' ||
    h === 'touch.facebook.com' ||
    h === 'free.facebook.com' ||
    h === 'zero.facebook.com' ||
    h === 'fb.com' ||
    h === 'www.fb.com'
  );
}

/** 路径首段若为这些词，则不是个人 vanity 用户名 */
const FB_PROFILE_PATH_EXCLUDED = new Set(
  [
    'profile.php',
    'people',
    'groups',
    'pages',
    'pg',
    'events',
    'watch',
    'marketplace',
    'messages',
    'reels',
    'stories',
    'gaming',
    'jobs',
    'friends',
    'notifications',
    'live',
    'saved',
    'bookmarks',
    'dialog',
    'plugins',
    'share',
    'sharer',
    'legal',
    'help',
    'ads',
    'business',
    'payments',
    'pay',
    'fundraisers',
    'oculus',
    'me',
    'photos',
    'videos',
    'photo',
    'video',
    'posts',
    'permalink.php',
    'story.php',
    'photo.php',
    'video.php',
    'p.php',
    'h.php',
    'r.php',
    'fr',
    'login.php',
    'login',
    'logout',
    'recover',
    'checkpoint',
    'settings',
    'policies',
    'terms',
    'about',
    'privacy',
    'developers',
    'instantgames',
    'games',
    'reg',
    'signup',
  ].map((s) => s.toLowerCase())
);

function looksLikeFacebookVanityUsername(segment: string): boolean {
  if (!segment || segment.length > 50 || segment.length < 1) return false;
  if (!/^[a-zA-Z0-9.]+$/.test(segment)) return false;
  if (FB_PROFILE_PATH_EXCLUDED.has(segment.toLowerCase())) return false;
  return true;
}

/**
 * 从一行解析 Graph「用户」节点可用的标识：纯数字 UID、`profile.php?id=`、
 * `https://www.facebook.com/用户名` 等 vanity 主页、以及 `people/…/数字` 等。
 */
function parseOneFacebookUserRefFromLine(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  if (/^\d{5,}$/.test(t)) return t;

  let urlStr = t;
  if (!/^https?:\/\//i.test(urlStr) && /facebook\.com/i.test(urlStr)) {
    urlStr = urlStr.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  }

  try {
    const u = new URL(urlStr);
    if (isFacebookProfileHost(u.hostname)) {
      const pathname = (u.pathname || '/').replace(/\/+$/, '') || '/';
      if (pathname.toLowerCase().includes('profile.php')) {
        const id = u.searchParams.get('id');
        if (id && /^\d{5,}$/.test(id)) return id;
        return null;
      }

      const segments = pathname.split('/').filter(Boolean);
      if (segments.length >= 1 && segments[0].toLowerCase() === 'people' && segments.length >= 3) {
        const last = segments[segments.length - 1];
        if (/^\d{5,}$/.test(last)) return last;
      }

      if (segments.length >= 1) {
        const first = segments[0];
        if (/^\d{5,}$/.test(first)) return first;
        if (looksLikeFacebookVanityUsername(first)) return first;
      }
    }
  } catch {
    /* 非 URL，走下方兜底 */
  }

  const m1 = t.match(/[?&]id=(\d{5,})/i);
  if (m1) return m1[1];
  const m2 = t.match(/facebook\.com\/(?:profile\.php\?[^#]*id=|people\/[^/]+\/|)(\d{5,})(?:\/|\?|#|$)/i);
  if (m2) return m2[1];

  return null;
}

/**
 * 从多行文本解析 Facebook 用户标识，并保留原始行（用于 Graph `?id=完整主页 URL` 解析）。
 */
export type FacebookUserRefWithSource = { ref: string; sourceLine: string };

/** 好友预检结果卡：优先展示用户粘贴的原始行（链接或 ID） */
export function friendCheckDisplayInput(ref: string, sourceLine?: string): string {
  const line = sourceLine?.trim();
  if (line) return line;
  return ref.trim();
}

export function parseFacebookUserRefsWithLinesFromText(text: string): FacebookUserRefWithSource[] {
  const out: FacebookUserRefWithSource[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const ref = parseOneFacebookUserRefFromLine(line);
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      out.push({ ref, sourceLine: line });
    }
  }
  return out;
}

/**
 * 从多行文本解析 Facebook 用户标识（数字 UID 或 vanity 用户名），用于预检与授权接口。
 * 注意：Graph 对 `GET /{username}` 常不可用，好友预检会结合 `?id=主页 URL` 等方式解析。
 */
export function parseFacebookUserIdsFromText(text: string): string[] {
  return parseFacebookUserRefsWithLinesFromText(text).map((p) => p.ref);
}

/**
 * 当 `GET /{username}` 不可用（如 100/33）时，用根路径 `?id=编码后的主页 URL` 尝试解析数字 id（Open Graph 风格）。
 */
function profileUrlsForOgLookup(userRef: string, sourceLine?: string): string[] {
  const ref = userRef.trim();
  const urls = new Set<string>();
  const add = (u: string) => {
    const t = u.trim();
    if (t) urls.add(t);
  };
  if (/^https?:\/\//i.test(ref)) add(ref);
  if (sourceLine && /^https?:\/\//i.test(sourceLine.trim())) add(sourceLine.trim());
  if (!/^\d+$/.test(ref)) {
    add(`https://www.facebook.com/${ref}`);
    add(`https://m.facebook.com/${ref}`);
    add(`https://facebook.com/${ref}`);
    add(`https://www.facebook.com/${ref}/`);
  }
  return Array.from(urls);
}

/** Graph `POST .../assigned_users` 的 `tasks` 仅允许（见 #100）：MANAGE、ADVERTISE、ANALYZE、DRAFT、AA_ANALYZE；不得含 VIEW */
const ASSIGNED_USER_TASKS_ALLOWED = new Set(['MANAGE', 'ADVERTISE', 'ANALYZE', 'DRAFT', 'AA_ANALYZE']);

/** 与批量抽屉子选项对应：管理员 / 广告管理员 / 分析员 */
export function adAccountTasksForSubId(subId: string | undefined): string[] {
  switch (subId) {
    case 'ad_admin':
      return ['ADVERTISE', 'ANALYZE'];
    case 'analyst':
      return ['ANALYZE'];
    case 'admin':
    default:
      return ['MANAGE', 'ADVERTISE', 'ANALYZE'];
  }
}

function sanitizeAssignedUserTasksForPost(tasks: string[]): string[] {
  return tasks.map((t) => String(t).toUpperCase()).filter((t) => ASSIGNED_USER_TASKS_ALLOWED.has(t));
}

/** 把 Graph `error` 拼成可读字符串（优先 Meta 面向用户的 title/msg，便于批量结果里展示失败原因）。 */
function formatGraphErrorBody(json: Record<string, unknown>, httpStatus: number): string {
  const err = json.error as {
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    code?: number;
    error_subcode?: number;
  } | undefined;
  if (!err || (!err.message && !err.error_user_msg && !err.error_user_title)) {
    return `HTTP ${httpStatus}`;
  }
  const parts: string[] = [];
  const title = err.error_user_title != null ? String(err.error_user_title).trim() : '';
  const userMsg = err.error_user_msg != null ? String(err.error_user_msg).trim() : '';
  const tech = err.message != null ? String(err.message).trim() : '';
  if (title) parts.push(title);
  if (userMsg) parts.push(userMsg);
  if (tech && tech !== userMsg) parts.push(tech);
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
  return parts.join(' | ');
}

/** 批量 UID 操作结果：汇总行 + 每条失败完整拼接（不截断）。 */
function formatPartialBatchDetail(ok: number, total: number, errs: string[], successDetail: string): string {
  if (errs.length === 0) return successDetail;
  return `${ok}/${total} 成功。${errs.join('；')}`;
}

async function graphJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
  fbControlLog('fb:graph-batch', 'request', { url: redactUrlForLog(url), method: init.method || 'GET' });
  const res = await graphFetch(url, init);
  const json = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, json, status: res.status };
}

async function graphFacebookObjectIdFromProfileUrl(
  accessToken: string,
  profileUrl: string
): Promise<string | null> {
  const idParam = encodeURIComponent(profileUrl);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/?id=${idParam}&fields=id&access_token=${encodeURIComponent(accessToken)}`;
  const { ok, json } = await graphJson(url, { method: 'GET' });
  if (!ok || json.error) return null;
  const oid = json.id != null ? String(json.id).trim() : '';
  return /^\d+$/.test(oid) ? oid : null;
}

/** 将用户名或非规范引用解析为数字用户 id（Marketing API assigned_users 等需要数字 id） */
async function resolveFacebookUserRefToNumericId(
  accessToken: string,
  userRef: string,
  cache: Map<string, string>,
  sourceLine?: string,
  opts?: GraphBatchOperationOptions
): Promise<string> {
  const key = userRef.trim();
  if (/^\d{5,}$/.test(key)) return key;
  const hit = cache.get(key);
  if (hit) return hit;

  let lastFail: { json: Record<string, unknown>; status: number } | null = null;
  const candidates = [key, key.toLowerCase()].filter((v, i, a) => a.indexOf(v) === i);
  for (const c of candidates) {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      c
    )}?fields=id&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json, status } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) {
      lastFail = { json, status };
      continue;
    }
    const sid = json.id != null ? String(json.id).trim() : '';
    if (/^\d+$/.test(sid)) {
      cache.set(key, sid);
      return sid;
    }
  }

  for (const profileUrl of profileUrlsForOgLookup(key, sourceLine)) {
    const ogId = await graphFacebookObjectIdFromProfileUrl(accessToken, profileUrl);
    if (!ogId) continue;
    const confirmUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      ogId
    )}?fields=id&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json, status } = await graphJson(confirmUrl, { method: 'GET' });
    if (!ok || json.error) {
      lastFail = { json, status };
      continue;
    }
    const sid = json.id != null ? String(json.id).trim() : '';
    if (/^\d+$/.test(sid)) {
      cache.set(key, sid);
      return sid;
    }
  }

  if (opts?.resolveProfileNumericId) {
    for (const profileUrl of profileUrlsForOgLookup(key, sourceLine)) {
      try {
        const numeric = await opts.resolveProfileNumericId(profileUrl);
        if (numeric && /^\d{5,}$/.test(numeric)) {
          cache.set(key, numeric);
          return numeric;
        }
      } catch {
        /* 尝试下一 URL */
      }
    }
  }

  if (lastFail) {
    throw new Error(formatGraphErrorBody(lastFail.json, lastFail.status));
  }
  throw new Error('Graph 未返回有效的用户 id');
}

/** 将 UID 预检结果转为抽屉结果卡行（检测好友关系） */
export function mapUidVerifyRowsToFriendBatchResultRows(
  rows: UidGraphVerifyDetailRow[],
  currentUserProfileUrl: string | null
): AdAccountBatchResultRow[] {
  return rows.map((r) => ({
    accountId: r.uid,
    displayInput: r.displayInput ?? r.uid,
    status: r.ok ? '成功' : '失败',
    detail: r.detail,
    resultKind: 'friend_uid',
    currentFbProfileUrl: currentUserProfileUrl,
  }));
}

/**
 * 好友预检进度展示：已完成行 + 未检测占位行（由 UI 显示「程序正在努力检测中」遮盖层）。
 */
export function mapFriendCheckRowsWithPending(
  completed: UidGraphVerifyDetailRow[],
  pendingRefs: FacebookUserRefWithSource[],
  currentUserProfileUrl: string | null
): AdAccountBatchResultRow[] {
  const done = mapUidVerifyRowsToFriendBatchResultRows(completed, currentUserProfileUrl);
  const pending: AdAccountBatchResultRow[] = pendingRefs.map(({ ref, sourceLine }) => ({
    accountId: ref,
    displayInput: friendCheckDisplayInput(ref, sourceLine),
    status: '检测中',
    detail: '',
    resultKind: 'friend_uid',
    currentFbProfileUrl: currentUserProfileUrl,
    friendCheckPending: true,
  }));
  return [...done, ...pending];
}

/** 好友预检成功/失败面向用户的固定文案（不向用户展示 Graph 技术错误） */
const FRIEND_CHECK_OK_DETAIL = '与当前Facebook社交账号是好友。';
const FRIEND_CHECK_FAIL_DETAIL = '与当前Facebook社交账号不是好友';

/** 当前登录用户主页链接（结果卡「当前账号」） */
export async function fetchFriendCheckCurrentUserProfileUrl(accessToken: string): Promise<string | null> {
  try {
    const meId = await fetchFacebookMeNumericId(accessToken);
    return meId ? `https://www.facebook.com/profile.php?id=${meId}` : null;
  } catch {
    return null;
  }
}

/** 单条好友预检：仅请求 `id`（避免 `name` 等字段在无权限时误判失败）；非数字用户名再尝试小写路径，失败时用 `?id=主页 URL` 解析数字 id 再查。 */
export async function verifyFacebookUserIdForFriendCheck(
  accessToken: string,
  ref: string,
  sourceLine?: string
): Promise<UidGraphVerifyDetailRow> {
  const trimmed = ref.trim();
  const displayInput = friendCheckDisplayInput(trimmed, sourceLine);
  const candidates: string[] = [];
  if (/^\d{5,}$/.test(trimmed)) {
    candidates.push(trimmed);
  } else {
    candidates.push(trimmed);
    const lower = trimmed.toLowerCase();
    if (lower !== trimmed) candidates.push(lower);
  }

  const tried = new Set<string>();
  for (const candidate of candidates) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      candidate
    )}?fields=id&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (ok && !json.error) {
      const graphId =
        json.id != null && String(json.id).trim() !== '' ? String(json.id).trim() : '';
      if (graphId) {
        return { uid: graphId, ok: true, detail: FRIEND_CHECK_OK_DETAIL, displayInput };
      }
    }
  }

  for (const profileUrl of profileUrlsForOgLookup(trimmed, sourceLine)) {
    const ogId = await graphFacebookObjectIdFromProfileUrl(accessToken, profileUrl);
    if (!ogId) continue;
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      ogId
    )}?fields=id&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (ok && !json.error) {
      const graphId =
        json.id != null && String(json.id).trim() !== '' ? String(json.id).trim() : '';
      if (graphId) {
        return { uid: graphId, ok: true, detail: FRIEND_CHECK_OK_DETAIL, displayInput };
      }
    }
  }

  return { uid: trimmed, ok: false, detail: FRIEND_CHECK_FAIL_DETAIL, displayInput };
}

export async function verifyFacebookUserIdsForBatch(
  accessToken: string,
  uidsText: string
): Promise<VerifyFacebookUserIdsForBatchResult> {
  const pairs = parseFacebookUserRefsWithLinesFromText(uidsText);
  const currentUserProfileUrl = await fetchFriendCheckCurrentUserProfileUrl(accessToken);

  if (!pairs.length) {
    return {
      ok: false,
      message:
        '未能解析出有效的 Facebook 用户（每行一个：纯数字 UID、profile.php?id= 链接、或 www.facebook.com/用户名 主页链接）',
      rows: [],
      currentUserProfileUrl,
    };
  }

  const rows: UidGraphVerifyDetailRow[] = [];
  for (const { ref, sourceLine } of pairs) {
    rows.push(await verifyFacebookUserIdForFriendCheck(accessToken, ref, sourceLine));
  }

  const allOk = rows.every((r) => r.ok);
  const failCount = rows.filter((r) => !r.ok).length;
  const message = allOk
    ? `${rows.length} 个用户检测通过，可再次点击「确定」执行批量授权。`
    : `部分账号未通过好友预检（${failCount}/${rows.length}）。`;

  return { ok: allOk, message, rows, currentUserProfileUrl };
}

function uidPairsForBatchPayload(payload: BatchDrawerSubmitPayload): FacebookUserRefWithSource[] {
  if (payload.authorizedUsers?.length) {
    return payload.authorizedUsers.map((u) => ({
      ref: u.uid.trim(),
      sourceLine: u.sourceLine?.trim() || u.displayInput.trim(),
    }));
  }
  return parseFacebookUserRefsWithLinesFromText(payload.uidsText);
}

function displayLabelForUidRef(
  ref: string,
  sourceLine: string | undefined,
  payload: BatchDrawerSubmitPayload
): string {
  const auth = payload.authorizedUsers?.find(
    (u) => u.uid === ref || u.sourceLine === sourceLine || u.displayInput === sourceLine
  );
  if (auth) return auth.displayInput;
  return friendCheckDisplayInput(ref, sourceLine);
}

/**
 * 将用户输入（个人 UID / 主页）换算为 assigned_users API 所需的商务用户编号。
 */
async function resolveAssignedApiUserId(
  accessToken: string,
  accountId: string,
  userRef: string,
  idCache: Map<string, string>,
  sourceLine?: string,
  opts?: GraphBatchOperationOptions
): Promise<{ businessUserId: string; businessId: string }> {
  const personalId = await resolveFacebookUserRefToNumericId(
    accessToken,
    userRef,
    idCache,
    sourceLine,
    opts
  );
  const cacheKey = `bu:${accountId}:${personalId}`;
  const cached = idCache.get(cacheKey);
  const hintBmIds = opts?.accountBmHintIds ?? [];
  const businessId = await resolveBusinessIdForAdAccount(accessToken, accountId, hintBmIds);
  if (cached) {
    return { businessUserId: cached, businessId };
  }

  const assignedRows = await fetchAssignedUserRows(accessToken, accountId, hintBmIds);
  const allBms = await resolveBusinessIdsForAccounts(accessToken, [accountId], hintBmIds);
  const bmList = allBms.length ? allBms : [businessId];
  const hit = await resolveBusinessUserIdForPersonalInBusinesses(
    accessToken,
    personalId,
    bmList,
    assignedRows
  );
  if (hit) {
    idCache.set(cacheKey, hit.businessUserId);
    return { businessUserId: hit.businessUserId, businessId: hit.businessId };
  }

  throw new Error(
    `无法将 UID ${personalId} 自动换算为商务用户编号。请确认对方已加入 BM（${businessId}）且已被分配到此广告账户。`
  );
}

async function postAssignedUser(
  accessToken: string,
  accountId: string,
  userRef: string,
  tasks: string[],
  idCache: Map<string, string>,
  sourceLine?: string,
  opts?: GraphBatchOperationOptions
): Promise<void> {
  const { businessUserId, businessId } = await resolveAssignedApiUserId(
    accessToken,
    accountId,
    userRef,
    idCache,
    sourceLine,
    opts
  );
  const act = actPath(accountId);
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('user', businessUserId);
  body.set('business', businessId);
  const safeTasks = sanitizeAssignedUserTasksForPost(tasks);
  if (!safeTasks.length) {
    throw new Error('授权 tasks 为空：请使用 MANAGE / ADVERTISE / ANALYZE / DRAFT / AA_ANALYZE 之一');
  }
  body.set('tasks', JSON.stringify(safeTasks));
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users`;
  const res = await graphFetch(url, { method: 'POST', body });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const raw = formatGraphErrorBody(json, res.status);
    throw new Error(formatNotBusinessScopedUserHint(raw));
  }
}

type AssignedUserListRow = AssignedUserLookupRow;

/** 分页拉取广告账户已分配用户（含个人 UID 映射，用于删除时换算商务用户 id） */
async function fetchAssignedUserRows(
  accessToken: string,
  accountId: string,
  hintBmIds: string[] = []
): Promise<AssignedUserListRow[]> {
  const businessId = await resolveBusinessIdForAdAccount(accessToken, accountId, hintBmIds);
  let url = buildAdAccountAssignedUsersReadUrl(
    accountId,
    businessId,
    'id,user{id,name,email}',
    accessToken
  );
  const out: AssignedUserListRow[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 25 && url; page++) {
    let { ok, json, status } = await graphJson(url, { method: 'GET' });
    if (!ok && page === 0) {
      url = buildAdAccountAssignedUsersReadUrl(accountId, businessId, 'id', accessToken);
      ({ ok, json, status } = await graphJson(url, { method: 'GET' }));
    }
    if (!ok) {
      throw new Error(formatGraphErrorBody(json, status));
    }
    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? (json as { data: { id?: string; user?: { id?: string; email?: string } }[] }).data
      : [];
    for (const row of rows) {
      const assignedUserId = row.id != null ? String(row.id).trim() : '';
      if (!assignedUserId || seen.has(assignedUserId)) continue;
      seen.add(assignedUserId);
      const fbUid =
        row.user?.id != null && /^\d{5,}$/.test(String(row.user.id).trim())
          ? String(row.user.id).trim()
          : undefined;
      const email =
        row.user?.email != null && String(row.user.email).includes('@')
          ? String(row.user.email).trim()
          : undefined;
      out.push({ assignedUserId, facebookUserId: fbUid, email });
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return out;
}

/** 分页拉取广告账户已分配用户 id（用于批量删权限） */
async function fetchAssignedUserIds(
  accessToken: string,
  accountId: string,
  hintBmIds: string[] = []
): Promise<string[]> {
  const rows = await fetchAssignedUserRows(accessToken, accountId, hintBmIds);
  return rows.map((r) => r.assignedUserId);
}

async function deleteAssignedUser(
  accessToken: string,
  accountId: string,
  userRef: string,
  idCache: Map<string, string>,
  sourceLine?: string,
  opts?: GraphBatchOperationOptions
): Promise<void> {
  const { businessUserId: userId, businessId } = await resolveAssignedApiUserId(
    accessToken,
    accountId,
    userRef,
    idCache,
    sourceLine,
    opts
  );
  const act = actPath(accountId);
  const q = new URLSearchParams({
    user: userId,
    business: businessId,
    access_token: accessToken,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users?${q.toString()}`;
  const res = await graphFetch(url, { method: 'DELETE' });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const raw = formatGraphErrorBody(json, res.status);
    throw new Error(formatNotBusinessScopedUserHint(raw));
  }
}

async function postAdAccountField(
  accessToken: string,
  accountId: string,
  fields: Record<string, string>
): Promise<void> {
  const act = actPath(accountId);
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, v);
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}`;
  const res = await graphFetch(url, { method: 'POST', body });
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string } | undefined;
  if (!res.ok || err?.message) {
    throw new Error(formatGraphErrorBody(json, res.status));
  }
}

/**
 * 广告账户改名：与 Ads Manager 一致走 `adsmanager-graph`，并带 `suppress_http_code=1`
 *（HTTP 可能始终为 200，必须以响应 JSON 是否含 `error` 判断成败）。
 */
export async function renameAdAccountViaAdsManagerGraph(
  accessToken: string,
  accountId: string,
  newName: string
): Promise<void> {
  const act = actPath(accountId);
  const query = new URLSearchParams({
    name: newName,
    access_token: accessToken,
    suppress_http_code: '1',
    locale: 'en_US',
    format: 'json',
    pretty: '0',
    transport: 'cors',
  });
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('name', newName);
  body.set('suppress_http_code', '1');
  body.set('locale', 'en_US');

  const url = `https://adsmanager-graph.facebook.com/${GRAPH_VERSION}/${act}?${query.toString()}`;
  fbControlLog('fb:graph-batch', 'adsmanager rename', { url: redactUrlForLog(url), method: 'POST' });
  const res = await graphFetch(url, { method: 'POST', body });
  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`重命名接口返回非 JSON（HTTP ${res.status}）`);
  }
  if (json.error !== undefined && json.error !== null) {
    const msg = formatGraphErrorBody(json, res.status);
    throw new Error(msg !== `HTTP ${res.status}` ? msg : JSON.stringify(json.error));
  }
  if (json.success === false) {
    throw new Error(`重命名失败（success=false）：${JSON.stringify(json).slice(0, 500)}`);
  }
}

/**
 * 在 Meta 侧更新广告账户名称：
 * 1. 优先 Marketing API `POST graph.facebook.com/.../act_{id}` 与 `name`（与用户 token 常见权限一致）；
 * 2. 失败时再尝试 Ads Manager Graph（与后台部分路径一致）。
 */
export async function renameAdAccountOnFacebook(
  accessToken: string,
  accountId: string,
  newName: string
): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('新名称不能为空');
  }
  try {
    await postAdAccountField(accessToken, accountId, { name: trimmed });
    fbControlLog('fb:graph-batch', 'rename via Marketing Graph OK', {
      accountIdPreview: String(accountId).replace(/^act_/i, '').slice(0, 12),
    });
    return;
  } catch (firstErr: unknown) {
    const m1 = firstErr instanceof Error ? firstErr.message : String(firstErr);
    fbControlLog('fb:graph-batch', 'rename Marketing Graph failed, fallback adsmanager-graph', {
      accountIdPreview: String(accountId).replace(/^act_/i, '').slice(0, 12),
      detail: m1.slice(0, 200),
    });
  }
  await renameAdAccountViaAdsManagerGraph(accessToken, accountId, trimmed);
}

type AdAccountSpendCapContext = {
  raw: number;
  minor: number;
  unit: ReturnType<typeof detectSpendCapUnit>;
  currency: string;
  amountSpentMinor: number;
};

function spendCapHintsFromPayload(
  payload: BatchDrawerSubmitPayload,
  accountId: string
): SpendCapNormalizeHints {
  const h = payload.accountSpendCapHints?.[accountId];
  return {
    spendCapMinor: h?.spendCapMinor,
    amountSpentMinor: h?.amountSpentMinor,
    currency: h?.currency,
  };
}

export type SpendCapRecordPatch = {
  accountId: string;
  spendCapMinor: number;
  paymentThresholdMinor: number;
  spendingLimit?: string;
  currency?: string;
};

export function spendCapRecordPatchFromMinor(
  accountId: string,
  minor: number,
  currency?: string
): SpendCapRecordPatch {
  const m = Math.max(0, Math.round(minor));
  return {
    accountId,
    spendCapMinor: m,
    paymentThresholdMinor: m,
    spendingLimit: m > 0 ? String(m) : undefined,
    currency,
  };
}

/** 从 Graph 读取 spend_cap 并转为列表展示字段 */
export async function fetchSpendCapRecordPatch(
  accessToken: string,
  accountId: string,
  hints?: SpendCapNormalizeHints
): Promise<SpendCapRecordPatch> {
  const ctx = await fetchAdAccountSpendCapContext(accessToken, accountId, hints);
  const minor = ctx?.minor ?? 0;
  return spendCapRecordPatchFromMinor(accountId, minor, ctx?.currency);
}

async function postSpendCapMinor(
  accessToken: string,
  accountId: string,
  targetMinor: number,
  hints?: SpendCapNormalizeHints,
  action: SpendCapPostAction = 'set'
): Promise<{ beforeMinor: number; afterMinor: number; currency: string }> {
  const ctx = await fetchAdAccountSpendCapContext(accessToken, accountId, hints);
  if (!ctx) throw new Error('无法读取当前 spend_cap');
  const beforeMinor = ctx.minor;
  const beforeSpent = ctx.amountSpentMinor;

  if (action === 'delete_cap') {
    await postAdAccountField(accessToken, accountId, { spend_cap_action: 'delete' });
  } else if (action === 'reset_spent') {
    await postAdAccountField(accessToken, accountId, { spend_cap_action: 'reset' });
  } else {
    await postAdAccountField(accessToken, accountId, {
      spend_cap: formatSpendCapMajorForPost(targetMinor, ctx.currency),
    });
  }

  const afterCtx = await fetchAdAccountSpendCapContext(accessToken, accountId, hints);
  if (!afterCtx) {
    throw new Error('写入后无法读取 spend_cap，请稍后在 Meta 广告管理工具中核对');
  }
  const tol = currencyOffset(ctx.currency);

  if (action === 'delete_cap') {
    if (afterCtx.raw > 0 || afterCtx.minor > tol * 2) {
      throw new Error(
        `删除花费上限未生效（Graph 仍返回 spend_cap=${afterCtx.raw}，约 ${formatSpendCapMajorLabel(afterCtx.minor, ctx.currency)}）。` +
          '请在广告管理工具中手动删除，或确认 token 有 ads_management 权限。'
      );
    }
  } else if (action === 'reset_spent') {
    if (afterCtx.amountSpentMinor > tol * 2 && afterCtx.amountSpentMinor >= beforeSpent) {
      throw new Error(
        `账户已花费清零可能未生效（amount_spent 仍为 ${formatSpendCapMajorLabel(afterCtx.amountSpentMinor, ctx.currency)}）`
      );
    }
  } else if (Math.abs(afterCtx.minor - targetMinor) > tol * 2) {
    throw new Error(
      `限额可能未生效（期望 ${formatSpendCapMajorLabel(targetMinor, ctx.currency)}，读取为 ${formatSpendCapMajorLabel(afterCtx.minor, ctx.currency)}）`
    );
  }
  return { beforeMinor, afterMinor: afterCtx.minor, currency: ctx.currency };
}

async function fetchAdAccountSpendCapContext(
  accessToken: string,
  accountId: string,
  hints?: SpendCapNormalizeHints
): Promise<AdAccountSpendCapContext | null> {
  const act = actPath(accountId);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}?fields=spend_cap,currency,amount_spent&access_token=${encodeURIComponent(accessToken)}`;
  fbControlLog('fb:graph-batch', 'GET spend_cap', { url: redactUrlForLog(url) });
  const res = await graphFetch(url);
  const json = (await res.json()) as {
    spend_cap?: string | number;
    currency?: string;
    amount_spent?: string | number;
    error?: { message?: string };
  };
  if (!res.ok || json.error?.message) return null;
  const rawVal = json.spend_cap;
  const amountSpentRaw = json.amount_spent;
  const amountSpentMinor =
    amountSpentRaw != null && amountSpentRaw !== ''
      ? parseInt(String(amountSpentRaw).replace(/[^\d-]/g, ''), 10)
      : 0;

  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return {
      raw: 0,
      minor: 0,
      unit: 'minor',
      currency: String(json.currency ?? 'USD'),
      amountSpentMinor: Number.isFinite(amountSpentMinor) ? amountSpentMinor : 0,
    };
  }
  const raw =
    typeof rawVal === 'number'
      ? rawVal
      : parseInt(String(rawVal).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(raw)) return null;
  const currency = String(json.currency ?? hints?.currency ?? 'USD');
  const mergedHints: SpendCapNormalizeHints = {
    ...hints,
    currency,
    amountSpentMinor:
      Number.isFinite(amountSpentMinor) && amountSpentMinor > 0
        ? amountSpentMinor
        : hints?.amountSpentMinor,
  };
  const unit = detectSpendCapUnit(raw, mergedHints);
  const minor = spendCapRawToMinor(raw, mergedHints);
  return {
    raw,
    minor,
    unit,
    currency,
    amountSpentMinor: Number.isFinite(amountSpentMinor) ? amountSpentMinor : 0,
  };
}

function parseSpendCapMinors(text: string, accountCount: number): number[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const n = parseInt(l.replace(/[,_\s]/g, ''), 10);
      return Number.isFinite(n) ? n : NaN;
    })
    .filter((n) => !Number.isNaN(n));

  if (!lines.length) return null;
  if (lines.length === 1) return Array.from({ length: accountCount }, () => lines[0]);
  if (lines.length !== accountCount) return null;
  return lines;
}

/**
 * 执行账户管理批量操作（与 fbspider 类工具一致：优先走 Marketing Graph）。
 */
export async function executeAdAccountBatchOperation(
  accessToken: string,
  payload: BatchDrawerSubmitPayload,
  opts?: GraphBatchOperationOptions
): Promise<AdAccountBatchResultRow[]> {
  /** `useDefaultInterval` 为 true 时用 `config/fbControlBatch.json` / `VITE_FB_BATCH_STEP_DELAY_MS`；为 false 则立即（0） */
  const delayMs = payload.useDefaultInterval ? getConfiguredGraphBatchStepDelayMs() : 0;
  const accounts = [...payload.selectedAccountIds];
  const results: AdAccountBatchResultRow[] = [];

  const pushResult = (
    accountId: string,
    status: string,
    detail: string,
    displayInput?: string
  ) => {
    results.push({
      accountId,
      status,
      detail,
      ...(displayInput ? { displayInput } : {}),
    });
  };

  /** 将 vanity 用户名等解析为数字 id，同一批操作内去重请求 */
  const userIdResolveCache = new Map<string, string>();
  const graphOpts: GraphBatchOperationOptions = {
    ...(opts ?? {}),
    accountBmHintIds: [
      ...(opts?.accountBmHintIds ?? []),
      ...(payload.accountBmHintIds ?? []),
    ],
  };
  const bmHints = graphOpts.accountBmHintIds ?? [];

  switch (payload.operationId) {
    case 'add_ad_permissions': {
      const uidPairs = uidPairsForBatchPayload(payload);
      if (!uidPairs.length) {
        throw new Error('请填写至少一个 Facebook 用户 UID 或主页链接');
      }
      const authDisplay =
        payload.authorizedUsers?.map((u) => u.displayInput).join('\n') ||
        uidPairs.map((p) => displayLabelForUidRef(p.ref, p.sourceLine, payload)).join('\n');
      const tasks = adAccountTasksForSubId(payload.subId);
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const { ref, sourceLine } of uidPairs) {
          const label = displayLabelForUidRef(ref, sourceLine, payload);
          try {
            await postAssignedUser(
              accessToken,
              accountId,
              ref,
              tasks,
              userIdResolveCache,
              sourceLine,
              opts
            );
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail = formatPartialBatchDetail(
          ok,
          uidPairs.length,
          errs,
          `已为 ${uidPairs.length} 个用户添加权限（${tasks.join(',')}）`
        );
        pushResult(accountId, status, detail, authDisplay);
      }
      break;
    }

    case 'remove_ad_permissions':
    case 'remove_admin': {
      const uidPairs = parseFacebookUserRefsWithLinesFromText(payload.uidsText);
      if (!uidPairs.length) {
        throw new Error('请填写要移除的用户 UID（每行一个）');
      }
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const { ref, sourceLine } of uidPairs) {
          try {
            await deleteAssignedUser(accessToken, accountId, ref, userIdResolveCache, sourceLine, graphOpts);
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${ref}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail = formatPartialBatchDetail(
          ok,
          uidPairs.length,
          errs,
          `已移除 ${uidPairs.length} 个用户的账户权限`
        );
        pushResult(accountId, status, detail);
      }
      break;
    }

    case 'remove_perm_their': {
      const me = await fetchFacebookMeNumericId(accessToken);
      const removeCurrent = payload.removeAuthForm?.deleteCurrentFacebookPerm === true;
      const targetPairs = parseFacebookUserRefsWithLinesFromText(payload.uidsText);
      if (!targetPairs.length) {
        throw new Error('请填写至少一个要移除权限的 Facebook 用户 UID 或主页链接');
      }
      const targetNumericIds: string[] = [];
      for (const { ref, sourceLine } of targetPairs) {
        targetNumericIds.push(
          await resolveFacebookUserRefToNumericId(accessToken, ref, userIdResolveCache, sourceLine, graphOpts)
        );
      }
      let targetUids = targetNumericIds;
      if (!removeCurrent && me) {
        targetUids = targetUids.filter((u) => u !== me);
      }
      if (!targetUids.length) {
        throw new Error('未勾选「删除当前 Facebook 账号的权限」时，请至少填写一条他人 UID');
      }
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const uid of targetUids) {
          try {
            await deleteAssignedUser(accessToken, accountId, uid, userIdResolveCache, undefined, graphOpts);
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const n = targetUids.length;
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail = formatPartialBatchDetail(ok, n, errs, `已按列表尝试移除 ${n} 个用户的权限`);
        pushResult(accountId, status, detail);
      }
      break;
    }

    case 'remove_perm_except_self': {
      const me = await fetchFacebookMeNumericId(accessToken);
      if (!me) {
        throw new Error('无法获取当前用户 id，无法执行「除了自己，删除所有」');
      }
      for (const accountId of accounts) {
        try {
          const uids = (await fetchAssignedUserIds(accessToken, accountId, bmHints)).filter(
            (u) => u !== me
          );
          if (!uids.length) {
            pushResult(accountId, '成功', '除当前账号外无其他协作者');
            continue;
          }
          const errs: string[] = [];
          let ok = 0;
          for (const uid of uids) {
            try {
              await deleteAssignedUser(accessToken, accountId, uid, userIdResolveCache, undefined, graphOpts);
              ok++;
              if (delayMs) await sleep(delayMs);
            } catch (e: unknown) {
              errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
          const detail = formatPartialBatchDetail(
            ok,
            uids.length,
            errs,
            `已移除 ${uids.length} 个协作者（已保留当前账号）`
          );
          pushResult(accountId, status, detail);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_self': {
      const me = await fetchFacebookMeNumericId(accessToken);
      if (!me) {
        throw new Error('无法获取当前用户 id，无法执行「删除自己」');
      }
      for (const accountId of accounts) {
        try {
          await deleteAssignedUser(accessToken, accountId, me, userIdResolveCache, undefined, graphOpts);
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', '已移除当前账号在本广告账户上的权限');
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_except_them': {
      const me = await fetchFacebookMeNumericId(accessToken);
      const removeCurrent = payload.removeAuthForm?.deleteCurrentFacebookPerm === true;
      const keepPairs = parseFacebookUserRefsWithLinesFromText(payload.uidsText);
      if (!keepPairs.length) {
        throw new Error('请填写至少一个要保留的 Facebook 用户 UID 或主页链接');
      }
      const keep = new Set<string>();
      for (const { ref, sourceLine } of keepPairs) {
        keep.add(
          await resolveFacebookUserRefToNumericId(accessToken, ref, userIdResolveCache, sourceLine, graphOpts)
        );
      }
      for (const accountId of accounts) {
        try {
          const assigned = await fetchAssignedUserIds(accessToken, accountId, bmHints);
          let toRemove = assigned.filter((u) => !keep.has(u));
          if (!removeCurrent && me) {
            toRemove = toRemove.filter((u) => u !== me);
          }
          if (!toRemove.length) {
            pushResult(accountId, '成功', '无其余协作者需移除（或均在保留列表中）');
            continue;
          }
          const errs: string[] = [];
          let ok = 0;
          for (const uid of toRemove) {
            try {
              await deleteAssignedUser(accessToken, accountId, uid, userIdResolveCache, undefined, graphOpts);
              ok++;
              if (delayMs) await sleep(delayMs);
            } catch (e: unknown) {
              errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          const n = toRemove.length;
          const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
          const detail = formatPartialBatchDetail(
            ok,
            n,
            errs,
            `已移除 ${n} 个协作者（已保留列表中的账号）`
          );
          pushResult(accountId, status, detail);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_bm': {
      const hint = '「删除BM」需 Business Manager Graph，当前版本未接入';
      for (const accountId of accounts) {
        pushResult(accountId, '跳过', hint);
      }
      break;
    }

    case 'set_limit': {
      const form = payload.spendLimitForm;
      if (form) {
        const deltaMinor = form.amountMinor ?? null;
        if (deltaMinor == null || deltaMinor <= 0) {
          throw new Error('请填写有效的额度金额');
        }
        for (const accountId of accounts) {
          try {
            const hints = spendCapHintsFromPayload(payload, accountId);
            const ctx = await fetchAdAccountSpendCapContext(accessToken, accountId, hints);
            if (!ctx) {
              throw new Error('无法读取当前 spend_cap');
            }
            const curMinor = ctx.minor;
            let targetMinor: number;
            if (form.kind === 'increase') {
              targetMinor = curMinor <= 0 ? deltaMinor : curMinor + deltaMinor;
            } else {
              if (curMinor <= 0) {
                throw new Error('当前为不限额（spend_cap=0），无法减少额度');
              }
              targetMinor = Math.max(0, curMinor - deltaMinor);
            }
            const { afterMinor } = await postSpendCapMinor(
              accessToken,
              accountId,
              targetMinor,
              hints
            );
            if (delayMs) await sleep(delayMs);
            const beforeLabel = formatSpendCapMajorLabel(curMinor, ctx.currency);
            const afterLabel = formatSpendCapMajorLabel(afterMinor, ctx.currency);
            const deltaLabel = formatSpendCapMajorLabel(deltaMinor, ctx.currency);
            const verb = form.kind === 'increase' ? '增加' : '减少';
            pushResult(
              accountId,
              '成功',
              `花费上限：${beforeLabel} → ${afterLabel}（${verb} ${deltaLabel}）`
            );
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }
      const caps = parseSpendCapMinors(payload.uidsText, accounts.length);
      if (!caps) {
        throw new Error('请填写 spend_cap（最小货币单位整数）：单行表示全部账户同一限额，或与选中行数相同的行数一一对应');
      }
      for (let i = 0; i < accounts.length; i++) {
        const accountId = accounts[i];
        try {
          const hints = spendCapHintsFromPayload(payload, accountId);
          const ctx = await fetchAdAccountSpendCapContext(accessToken, accountId, hints);
          const currency = ctx?.currency ?? 'USD';
          await postAdAccountField(accessToken, accountId, {
            spend_cap: formatSpendCapMajorForPost(caps[i], currency),
          });
          if (delayMs) await sleep(delayMs);
          pushResult(
            accountId,
            '成功',
            `spend_cap 已设为 ${formatSpendCapMajorLabel(caps[i], currency)}`
          );
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'reset_limit': {
      const rf = payload.resetLimitForm;
      if (rf?.mode === 'set_absolute') {
        const cap = rf.amountMinor;
        if (cap == null || cap < 0) {
          throw new Error('请填写有效的限额（最小货币单位）');
        }
        for (const accountId of accounts) {
          try {
            const hints = spendCapHintsFromPayload(payload, accountId);
            const { afterMinor, currency } = await postSpendCapMinor(
              accessToken,
              accountId,
              cap,
              hints
            );
            if (delayMs) await sleep(delayMs);
            pushResult(
              accountId,
              '成功',
              `花费上限已设为 ${formatSpendCapMajorLabel(afterMinor, currency)}`
            );
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }
      const zeroLabel = '不限额';
      for (const accountId of accounts) {
        try {
          const hints = spendCapHintsFromPayload(payload, accountId);
          const capAction: SpendCapPostAction =
            rf?.mode === 'delete_restriction' ? 'delete_cap' : 'reset_spent';
          const { beforeMinor, afterMinor, currency } = await postSpendCapMinor(
            accessToken,
            accountId,
            0,
            hints,
            capAction
          );
          if (delayMs) await sleep(delayMs);
          const beforeLabel =
            beforeMinor <= 0 ? zeroLabel : formatSpendCapMajorLabel(beforeMinor, currency);
          const afterLabel =
            afterMinor <= 0 ? zeroLabel : formatSpendCapMajorLabel(afterMinor, currency);
          const modeNote =
            rf?.mode === 'delete_restriction'
              ? '已删除花费上限（spend_cap_action=delete）'
              : '已重置账户已花费（spend_cap_action=reset）';
          pushResult(accountId, '成功', `${modeNote}：${beforeLabel} → ${afterLabel}`);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'add_to_bm': {
      const lines = payload.uidsText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      let bmId: string | undefined;
      for (const line of lines) {
        if (/^\d{5,}$/.test(line)) {
          bmId = line;
          break;
        }
        const parsed = parseFacebookUserIdsFromText(line)[0];
        if (parsed) {
          bmId = parsed;
          break;
        }
      }
      if (!bmId) {
        throw new Error('请填写有效的 Business Manager ID（纯数字 BM ID，至少一行）');
      }
      const mode = payload.subId === 'bm_claim' ? 'claim' : 'share';

      if (mode === 'claim') {
        for (const accountId of accounts) {
          try {
            const body = new URLSearchParams();
            body.set('access_token', accessToken);
            body.set('adaccount_id', actPath(accountId));
            const url = `https://graph.facebook.com/${GRAPH_VERSION}/${bmId}/owned_ad_accounts`;
            const res = await graphFetch(url, { method: 'POST', body });
            const json = (await res.json()) as Record<string, unknown>;
            if (!res.ok || (json.error as { message?: string } | undefined)?.message) {
              pushResult(accountId, '失败', formatGraphErrorBody(json, res.status));
            } else {
              pushResult(accountId, '成功', `BM 认领已请求（${bmId}，不可移除类）`);
            }
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }

      const idsJson = JSON.stringify(accounts.map((id) => actPath(id)));
      const body = new URLSearchParams();
      body.set('access_token', accessToken);
      body.set('adaccount_ids', idsJson);
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${bmId}/adaccounts`;
      const res = await graphFetch(url, { method: 'POST', body });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || (json.error as { message?: string } | undefined)?.message) {
        const msg = formatGraphErrorBody(json, res.status);
        for (const accountId of accounts) {
          pushResult(accountId, '失败', msg);
        }
      } else {
        for (const accountId of accounts) {
          pushResult(accountId, '成功', `已请求加入 BM ${bmId}（分享给 BM，可移除类）`);
        }
      }
      break;
    }

    case 'account_rename': {
      const names = payload.uidsText
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!names.length) {
        throw new Error('请填写新账号名称（每行一个；仅一行时全部账户使用同一名称）');
      }
      const singleForAll = names.length === 1;
      for (let i = 0; i < accounts.length; i++) {
        const accountId = accounts[i];
        const name = singleForAll ? names[0] : names[i];
        if (!name) {
          pushResult(accountId, '失败', `缺少第 ${i + 1} 行新名称（已选 ${accounts.length} 个账户，需 ${accounts.length} 行）`);
          continue;
        }
        try {
          await renameAdAccountOnFacebook(accessToken, accountId, name);
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', `名称已更新为「${name}」`);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'update_business': {
      const form = payload.updateBusinessForm;
      if (!form) {
        throw new Error('请至少勾选一项要修改的信息');
      }
      if (!form.modifyCurrency && !form.modifyBmInfo && !form.modifyTimezone) {
        throw new Error('请至少勾选一项要修改的信息');
      }
      for (const accountId of accounts) {
        const parts: string[] = [];
        const errs: string[] = [];
        try {
          if (form.modifyCurrency) {
            try {
              await postAdAccountField(accessToken, accountId, { currency: form.currency });
              parts.push(`币种→${form.currency}`);
            } catch (e: unknown) {
              errs.push(`币种: ${e instanceof Error ? e.message : String(e)}`);
            }
            if (delayMs) await sleep(delayMs);
          }
          if (form.modifyTimezone) {
            try {
              await postAdAccountField(accessToken, accountId, { timezone_name: form.timezone });
              parts.push(`时区→${form.timezone}`);
            } catch (e: unknown) {
              errs.push(`时区: ${e instanceof Error ? e.message : String(e)}`);
            }
            if (delayMs) await sleep(delayMs);
          }
          if (form.modifyBmInfo) {
            const b = form.bmInfo;
            parts.push(
              `BM 公司信息已记录（${b.countryCode} / ${b.companyName}）；完整地址与税号需 Business API，当前版本未写入 Graph`
            );
          }
          if (!parts.length && errs.length) {
            pushResult(accountId, '失败', errs.join('；'));
          } else if (errs.length) {
            pushResult(accountId, '部分成功', `${parts.join('；')}。${errs.join('；')}`);
          } else {
            pushResult(accountId, '成功', parts.join('；'));
          }
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'bm_partner': {
      const partnerBmId = parsePrimaryBmIdFromText(payload.uidsText);
      if (!partnerBmId) {
        throw new Error('请填写有效的 Business Manager ID（纯数字 BM ID，至少一行）');
      }
      const permittedTasks =
        payload.subId === 'assign_partner_ads' ? ['ADVERTISE', 'ANALYZE'] : ['ADVERTISE', 'ANALYZE'];
      const ownerBmByAccount = new Map<string, string>();
      for (const accountId of accounts) {
        const ownerBm = await fetchAdAccountOwnerBusinessId(accessToken, accountId);
        if (ownerBm) ownerBmByAccount.set(accountId, ownerBm);
      }
      const agencyDone = new Set<string>();
      for (const accountId of accounts) {
        const ownerBm = ownerBmByAccount.get(accountId);
        if (!ownerBm) {
          pushResult(accountId, '失败', '无法读取该广告账户所属 Business Manager ID');
          continue;
        }
        try {
          if (!agencyDone.has(ownerBm)) {
            const r = await postBusinessPartnerAgency(
              accessToken,
              ownerBm,
              partnerBmId,
              permittedTasks
            );
            agencyDone.add(ownerBm);
            if (delayMs) await sleep(delayMs);
            const agencyNote = r.alreadyLinked
              ? `合作伙伴 BM ${partnerBmId} 已与所属 BM ${ownerBm} 关联`
              : `已向所属 BM ${ownerBm} 添加合作伙伴 BM ${partnerBmId}`;
            pushResult(
              accountId,
              '成功',
              `${agencyNote}（权限：${permittedTasks.join(', ')}）`
            );
          } else {
            pushResult(
              accountId,
              '成功',
              `合作伙伴 BM ${partnerBmId} 已关联至所属 BM ${ownerBm}（本批其余同 BM 账户已处理）`
            );
          }
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'account_push': {
      const push = payload.accountPushForm;
      const email = push?.recipientEmail?.trim() || payload.uidsText.trim();
      if (!email) {
        throw new Error('请先搜索并确认接收者邮箱');
      }
      const hintBms = payload.accountBmHintIds ?? [];
      const businessIds = await resolveBusinessIdsForAccounts(accessToken, accounts, hintBms);
      if (!businessIds.length) {
        throw new Error('无法确定广告账户所属 Business Manager，请在商务管理平台打开对应 BM 后重试');
      }
      let recipient: GraphBusinessUserMatch | null = null;
      if (push?.recipientUserId) {
        recipient = {
          businessUserId: push.recipientUserId,
          email,
          name: push.recipientDisplayName,
          businessId: businessIds[0],
        };
      } else {
        recipient = await searchBusinessUserByEmailInBusinesses(accessToken, businessIds, email);
      }
      if (!recipient) {
        const inviteBm = businessIds[0];
        try {
          await inviteBusinessUserByEmail(accessToken, inviteBm, email, 'EMPLOYEE');
          for (const accountId of accounts) {
            pushResult(
              accountId,
              '部分成功',
              `已向 BM ${inviteBm} 发送邀请邮件 ${email}；对方接受邀请后请再次执行推送以分配广告权限`
            );
          }
        } catch (e: unknown) {
          throw new Error(
            `未在 BM 中找到邮箱 ${email}，且邀请失败：${e instanceof Error ? e.message : String(e)}`
          );
        }
        break;
      }
      const tasks = ['ADVERTISE', 'ANALYZE'];
      const label = recipient.name ? `${recipient.name} (${recipient.email})` : recipient.email;
      for (const accountId of accounts) {
        try {
          await assignBusinessUserToAdAccount(
            accessToken,
            accountId,
            recipient.businessUserId,
            tasks
          );
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', `已推送：${label} 获得广告权限（${tasks.join(', ')}）`);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'batch_payment_records':
    default: {
      for (const accountId of accounts) {
        pushResult(
          accountId,
          '跳过',
          `操作「${payload.operationId}」需 Business 合作伙伴/推送等接口，当前版本未接 Graph，请用 Meta 后台或 fbspider 完整流程`
        );
      }
      break;
    }
  }

  return results;
}
