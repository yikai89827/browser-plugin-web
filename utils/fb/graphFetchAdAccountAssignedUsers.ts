import {
  buildAdAccountAssignedUsersReadUrl,
  fetchBusinessUserProfile,
  fetchBusinessUsersIndex,
  resolveBusinessIdForAdAccount,
  resolvePersonalFacebookIdFromBusinessUser,
} from './graphBusinessManagement';
import { fetchFacebookSelfUserIdsForExclude } from './graphFetchMe';
import { describeToken, redactUrlForLog } from './tokenDebugLog';
import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';
const MAX_PAGES = 25;

function actPath(accountId: string): string {
  const raw = accountId.replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : accountId;
}

/** 将 Graph JSON 错误体整理为可读字符串（避免 message 为对象时出现 [object Object]） */
function graphErrorToString(json: unknown, httpStatus: number): string {
  if (json != null && typeof json === 'object' && 'error' in json) {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err != null && typeof err === 'object') {
      const o = err as Record<string, unknown>;
      const parts: string[] = [];
      const m = o.message;
      if (typeof m === 'string' && m.trim()) parts.push(m.trim());
      else if (m != null) {
        try {
          parts.push(JSON.stringify(m));
        } catch {
          parts.push(String(m));
        }
      }
      const u = o.error_user_msg;
      if (typeof u === 'string' && u.trim()) parts.push(String(u).trim());
      if (typeof o.code === 'number') parts.push(`code=${o.code}`);
      if (typeof o.error_subcode === 'number') parts.push(`subcode=${o.error_subcode}`);
      if (parts.length) return parts.join(' | ');
    }
  }
  return `HTTP ${httpStatus}`;
}

export type AdAccountAssignedUsersQueryOptions = {
  /** BM id 提示（表格「所属 BM」列等），用于 assigned_users 的 business 参数 */
  hintBmIds?: string[];
};

/** assigned_users 详情行（表格管理员/隐藏管理员抽屉） */
export type AdAccountAssignedUserDetail = {
  assignedUserId: string;
  facebookUserId?: string;
  name?: string;
  email?: string;
  tasks: string[];
};

type GraphAssignedUserRow = {
  id?: string;
  tasks?: unknown;
  user?: { id?: string; name?: string; email?: string };
};

function parseAssignedUserDetail(row: GraphAssignedUserRow): AdAccountAssignedUserDetail | null {
  const assignedUserId = row.id != null ? String(row.id).trim() : '';
  if (!assignedUserId) return null;
  const facebookUserId =
    row.user?.id != null && /^\d{5,}$/.test(String(row.user.id).trim())
      ? String(row.user.id).trim()
      : undefined;
  const name =
    row.user?.name != null && String(row.user.name).trim()
      ? String(row.user.name).trim()
      : undefined;
  const email =
    row.user?.email != null && String(row.user.email).includes('@')
      ? String(row.user.email).trim()
      : undefined;
  return {
    assignedUserId,
    facebookUserId,
    name,
    email,
    tasks: normalizeAssignedUserTasks(row.tasks),
  };
}

function detailRowExcluded(row: AdAccountAssignedUserDetail, excludeSet: Set<string>): boolean {
  if (excludeSet.has(row.assignedUserId)) return true;
  if (row.facebookUserId && excludeSet.has(row.facebookUserId)) return true;
  return false;
}

/**
 * 分页拉取 `act_{id}/assigned_users` 详情（用于「隐藏管理员」列与抽屉）。
 */
export async function fetchAdAccountAssignedUserDetails(
  accessToken: string,
  accountId: string,
  options?: AdAccountAssignedUsersQueryOptions
): Promise<AdAccountAssignedUserDetail[]> {
  const path = actPath(accountId);
  const businessId = await resolveBusinessIdForAdAccount(
    accessToken,
    accountId,
    options?.hintBmIds ?? []
  );
  let fields = 'id,tasks,user{id,name,email}';
  let url = buildAdAccountAssignedUsersReadUrl(accountId, businessId, fields, accessToken);
  const out: AdAccountAssignedUserDetail[] = [];
  const seen = new Set<string>();
  let pages = 0;
  console.info('[fbControl:graph] 拉取 assigned_users 详情', {
    graphVersion: GRAPH_VERSION,
    path,
    businessId,
    token: describeToken(accessToken),
  });
  while (url && pages < MAX_PAGES) {
    pages += 1;
    console.info(`[fbControl:graph] assigned_users 详情第 ${pages} 页`, { url: redactUrlForLog(url) });
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      data?: GraphAssignedUserRow[];
      paging?: { next?: string };
      error?: unknown;
    };
    if (!res.ok || json.error) {
      if (pages === 1 && fields.includes('user{')) {
        fields = 'id,tasks';
        url = buildAdAccountAssignedUsersReadUrl(accountId, businessId, fields, accessToken);
        continue;
      }
      const msg = graphErrorToString(json, res.status);
      console.error(`[fbControl:graph] assigned_users 详情错误 http=${res.status} msg=${msg}`);
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    for (const row of batch) {
      const detail = parseAssignedUserDetail(row);
      if (!detail || seen.has(detail.assignedUserId)) continue;
      seen.add(detail.assignedUserId);
      out.push(detail);
    }
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  const enriched = await enrichAssignedUserDetails(accessToken, businessId, out);
  console.info('[fbControl:graph] assigned_users 详情完成', { accountId, total: enriched.length, pages });
  return enriched;
}

const ENRICH_CONCURRENCY = 6;

async function enrichAssignedUserDetails(
  accessToken: string,
  businessId: string,
  rows: AdAccountAssignedUserDetail[]
): Promise<AdAccountAssignedUserDetail[]> {
  if (!rows.length) return rows;
  const index = await fetchBusinessUsersIndex(accessToken, businessId);
  const out: AdAccountAssignedUserDetail[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= rows.length) return;
      out[i] = await enrichOneAssignedUserDetail(accessToken, businessId, rows[i], index);
    }
  }
  const n = Math.min(ENRICH_CONCURRENCY, rows.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function enrichOneAssignedUserDetail(
  accessToken: string,
  businessId: string,
  row: AdAccountAssignedUserDetail,
  businessIndex: Map<string, { name?: string; email?: string; facebookUserId?: string }>
): Promise<AdAccountAssignedUserDetail> {
  const hit = businessIndex.get(row.assignedUserId);
  let name = row.name ?? hit?.name;
  let email = row.email ?? hit?.email;
  let facebookUserId = row.facebookUserId ?? hit?.facebookUserId;
  if (!name || !email || !facebookUserId) {
    const profile = await fetchBusinessUserProfile(accessToken, row.assignedUserId);
    if (profile) {
      name = name ?? profile.name;
      email = email ?? profile.email;
      facebookUserId = facebookUserId ?? profile.facebookUserId;
    }
  }
  if (!facebookUserId) {
    const resolved = await resolvePersonalFacebookIdFromBusinessUser(
      accessToken,
      businessId,
      row.assignedUserId,
      email
    );
    if (resolved) facebookUserId = resolved;
  }
  return { ...row, name, email, facebookUserId };
}

/**
 * 「隐藏管理员」：已分配协作者中**无 MANAGE** 的人员（多为仅投广/分析），且不含当前登录用户。
 * 与「管理员」列互补：有 MANAGE 的他人只出现在管理员列，此处应为 0。
 */
export async function fetchAdAccountHiddenAdminDetails(
  accessToken: string,
  accountId: string,
  options?: ManageAdminCountOptions
): Promise<AdAccountAssignedUserDetail[]> {
  const excludeSet = await resolveManageAdminExcludeSet(accessToken, options);
  const all = await fetchAdAccountAssignedUserDetails(accessToken, accountId, options);
  return all.filter((row) => {
    if (detailRowExcluded(row, excludeSet)) return false;
    return !row.tasks.includes('MANAGE');
  });
}

/**
 * 分页统计「隐藏管理员」人数（与 `fetchAdAccountHiddenAdminDetails` 一致）。
 */
export async function fetchAdAccountHiddenAdminCount(
  accessToken: string,
  accountId: string,
  options?: ManageAdminCountOptions
): Promise<number> {
  const rows = await fetchAdAccountHiddenAdminDetails(accessToken, accountId, options);
  return rows.length;
}

/** @deprecated 使用 fetchAdAccountHiddenAdminCount；保留别名避免外部误用「全部协作者」口径 */
export async function fetchAdAccountAssignedUserCount(
  accessToken: string,
  accountId: string,
  options?: AdAccountAssignedUsersQueryOptions
): Promise<number> {
  return fetchAdAccountHiddenAdminCount(accessToken, accountId, options);
}

function normalizeAssignedUserTasks(tasks: unknown): string[] {
  if (Array.isArray(tasks)) return tasks.map((t) => String(t).toUpperCase());
  if (typeof tasks === 'string') {
    const t = tasks.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const p = JSON.parse(t) as unknown;
        if (Array.isArray(p)) return p.map((x) => String(x).toUpperCase());
      } catch {
        /* ignore */
      }
      return [];
    }
    if (t.includes(',')) {
      return t
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    return [t.toUpperCase()];
  }
  return [];
}

export type ManageAdminCountOptions = AdAccountAssignedUsersQueryOptions & {
  /** 排除当前登录用户（单 id，兼容旧调用） */
  excludeFacebookUserId?: string | null;
  /** 排除多个候选 id（与 excludeFacebookUserId 合并），应对 /me 与 assigned_users id 形态不一致 */
  excludeFacebookUserIds?: readonly string[] | null;
};

/**
 * 统计 `assigned_users` 中带 `MANAGE` 任务的人数（与表格「管理员」列一致，非全部协作者数）。
 * 默认排除当前 token 对应用户，只统计**其他**具备 MANAGE 的人数。
 */
function buildManageAdminExcludeSet(options?: ManageAdminCountOptions): Set<string> {
  const excludeSet = new Set<string>();
  if (options?.excludeFacebookUserIds?.length) {
    for (const x of options.excludeFacebookUserIds) {
      const t = String(x).trim();
      if (t) excludeSet.add(t);
    }
  }
  if (options?.excludeFacebookUserId?.trim()) {
    excludeSet.add(options.excludeFacebookUserId.trim());
  }
  return excludeSet;
}

async function resolveManageAdminExcludeSet(
  accessToken: string,
  options?: ManageAdminCountOptions
): Promise<Set<string>> {
  const excludeSet = buildManageAdminExcludeSet(options);
  if (!excludeSet.size) {
    for (const id of await fetchFacebookSelfUserIdsForExclude(accessToken)) {
      excludeSet.add(id);
    }
  }
  return excludeSet;
}

function isManageAdminDetail(row: AdAccountAssignedUserDetail, excludeSet: Set<string>): boolean {
  if (detailRowExcluded(row, excludeSet)) return false;
  return row.tasks.includes('MANAGE');
}

/**
 * 拉取带 MANAGE 的其他管理员详情（与「管理员」列计数口径一致）。
 */
export async function fetchAdAccountManageAdminDetails(
  accessToken: string,
  accountId: string,
  options?: ManageAdminCountOptions
): Promise<AdAccountAssignedUserDetail[]> {
  const excludeSet = await resolveManageAdminExcludeSet(accessToken, options);
  const all = await fetchAdAccountAssignedUserDetails(accessToken, accountId, options);
  return all.filter((row) => isManageAdminDetail(row, excludeSet));
}

export async function fetchAdAccountManageAdminCount(
  accessToken: string,
  accountId: string,
  options?: ManageAdminCountOptions
): Promise<number> {
  const rows = await fetchAdAccountManageAdminDetails(accessToken, accountId, options);
  return rows.length;
}
