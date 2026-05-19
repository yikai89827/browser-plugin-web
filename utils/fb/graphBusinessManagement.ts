import { fbControlLog } from '../fbControlLog';
import { graphFetch } from './graphExternalFetch';
import { redactUrlForLog } from './tokenDebugLog';

const GRAPH_VERSION = 'v21.0';

export type GraphBusinessUserMatch = {
  businessUserId: string;
  email: string;
  name?: string;
  businessId: string;
};

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

async function graphJson(
  url: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
  fbControlLog('fb:business-mgmt', 'request', { url: redactUrlForLog(url), method: init.method || 'GET' });
  const res = await graphFetch(url, init);
  const json = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, json, status: res.status };
}

export function parseBmIdsFromText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (/^\d{5,}$/.test(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function parsePrimaryBmIdFromText(text: string): string | undefined {
  return parseBmIdsFromText(text)[0];
}

function actPath(accountId: string): string {
  const raw = String(accountId).replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : String(accountId);
}

/** 解析广告账户关联的 BM（owner 优先，用于 agencies / business_users） */
export async function fetchAdAccountOwnerBusinessId(
  accessToken: string,
  accountId: string
): Promise<string | null> {
  const act = actPath(accountId);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}?fields=owner_business,business&access_token=${encodeURIComponent(accessToken)}`;
  const { ok, json } = await graphJson(url, { method: 'GET' });
  if (!ok || json.error) return null;
  const owner = json.owner_business as { id?: string | number } | undefined;
  const biz = json.business as { id?: string | number } | undefined;
  const id = owner?.id ?? biz?.id;
  return id != null ? String(id).trim() : null;
}

/** 将合作伙伴 BM 加为当前 BM 的代理商（广告权限） */
export async function postBusinessPartnerAgency(
  accessToken: string,
  ownerBusinessId: string,
  partnerBusinessId: string,
  permittedTasks: string[] = ['ADVERTISE', 'ANALYZE']
): Promise<{ id?: string; alreadyLinked?: boolean }> {
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('business', partnerBusinessId);
  body.set('permitted_tasks', JSON.stringify(permittedTasks));
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${ownerBusinessId}/agencies`;
  const { ok, json, status } = await graphJson(url, { method: 'POST', body });
  if (ok && !json.error) {
    const id = json.id != null ? String(json.id) : undefined;
    return { id };
  }
  const msg = formatGraphErrorBody(json, status);
  if (/already|exist|duplicate|已|重复/i.test(msg)) {
    return { alreadyLinked: true };
  }
  throw new Error(msg);
}

export type BusinessUserProfile = {
  businessUserId: string;
  name?: string;
  email?: string;
  facebookUserId?: string;
};

function isNumericGraphId(v: unknown): boolean {
  const s = v != null ? String(v).trim() : '';
  return /^\d{5,}$/.test(s);
}

/** 从 BusinessUser / assigned_users 节点 JSON 解析个人 Facebook 数字 UID（与商务用户 id 区分） */
function parsePersonalFacebookIdFromNode(
  json: Record<string, unknown>,
  businessUserId: string
): string | undefined {
  const buId = String(businessUserId).trim();
  const user = json.user as { id?: string } | undefined;
  if (user?.id != null && isNumericGraphId(user.id)) {
    const uid = String(user.id).trim();
    if (uid !== buId) return uid;
  }
  if (json.uid != null && isNumericGraphId(json.uid)) {
    const uid = String(json.uid).trim();
    if (uid !== buId) return uid;
  }
  return undefined;
}

/** 分页拉取 BM 内 business_users，建立 businessUserId → 资料索引 */
export async function fetchBusinessUsersIndex(
  accessToken: string,
  businessId: string
): Promise<Map<string, BusinessUserProfile>> {
  const map = new Map<string, BusinessUserProfile>();
  const bid = String(businessId).trim();
  if (!/^\d{5,}$/.test(bid)) return map;
  const fieldAttempts = ['id,name,email,user{id}', 'id,name,email'];
  for (const fields of fieldAttempts) {
    map.clear();
    let url = `https://graph.facebook.com/${GRAPH_VERSION}/${bid}/business_users?fields=${fields}&limit=500&access_token=${encodeURIComponent(accessToken)}`;
    let listOk = true;
    for (let page = 0; page < 20 && url; page++) {
      const { ok, json } = await graphJson(url, { method: 'GET' });
      if (!ok || json.error) {
        listOk = false;
        break;
      }
      const rows = Array.isArray((json as { data?: unknown[] }).data)
        ? ((json as {
            data: { id?: string; email?: string; name?: string; user?: { id?: string } }[];
          }).data ?? [])
        : [];
      for (const row of rows) {
        const businessUserId = row.id != null ? String(row.id).trim() : '';
        if (!businessUserId || map.has(businessUserId)) continue;
        const email =
          row.email != null && String(row.email).includes('@') ? String(row.email).trim() : undefined;
        const name = row.name != null && String(row.name).trim() ? String(row.name).trim() : undefined;
        const facebookUserId =
          row.user?.id != null && isNumericGraphId(row.user.id)
            ? String(row.user.id).trim()
            : undefined;
        map.set(businessUserId, { businessUserId, name, email, facebookUserId });
      }
      const next = (json as { paging?: { next?: string } }).paging?.next;
      url = typeof next === 'string' && next.length ? next : '';
    }
    if (listOk && map.size) return map;
  }
  return map;
}

/** 按商务用户编号补全名称/邮箱/个人 UID（assigned_users 未展开 user 时） */
export async function fetchBusinessUserProfile(
  accessToken: string,
  businessUserId: string
): Promise<BusinessUserProfile | null> {
  const buId = String(businessUserId).trim();
  if (!/^\d{5,}$/.test(buId)) return null;
  const fieldSets = [
    'name,email,user{id,name,email}',
    'user{id}',
    'name,email,uid',
    'name,email',
    'id,name,email',
  ];
  for (const fields of fieldSets) {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${buId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) continue;
    const name =
      json.name != null && String(json.name).trim() ? String(json.name).trim() : undefined;
    const email =
      json.email != null && String(json.email).includes('@') ? String(json.email).trim() : undefined;
    const user = json.user as { id?: string; name?: string; email?: string } | undefined;
    const facebookUserId = parsePersonalFacebookIdFromNode(json, buId);
    const userName =
      user?.name != null && String(user.name).trim() ? String(user.name).trim() : undefined;
    const userEmail =
      user?.email != null && String(user.email).includes('@') ? String(user.email).trim() : undefined;
    return {
      businessUserId: buId,
      name: name ?? userName,
      email: email ?? userEmail,
      facebookUserId,
    };
  }
  return null;
}

/**
 * 由 BM 商务用户编号反查个人 Facebook UID（`/{personalId}/business_users` 的反向）。
 * 在 assigned_users 无法展开 `user{id}` 时依次尝试单节点与 BM 列表。
 */
export async function resolvePersonalFacebookIdFromBusinessUser(
  accessToken: string,
  businessId: string,
  businessUserId: string,
  emailHint?: string
): Promise<string | null> {
  const buId = String(businessUserId).trim();
  const bid = String(businessId).trim();
  if (!isNumericGraphId(buId) || !isNumericGraphId(bid)) return null;

  const profile = await fetchBusinessUserProfile(accessToken, buId);
  if (profile?.facebookUserId) return profile.facebookUserId;

  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${bid}/business_users?fields=id,email,user{id}&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 20 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? ((json as { data: { id?: string; email?: string; user?: { id?: string } }[] }).data ?? [])
      : [];
    for (const row of rows) {
      const rowId = row.id != null ? String(row.id).trim() : '';
      if (rowId !== buId) continue;
      if (row.user?.id != null && isNumericGraphId(row.user.id)) {
        const uid = String(row.user.id).trim();
        if (uid !== buId) return uid;
      }
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }

  const viaPersonalEdge = await findBusinessUserIdViaUserBusinessUsersEdge(accessToken, buId, bid);
  if (viaPersonalEdge && viaPersonalEdge !== buId) {
    return buId;
  }

  const email = emailHint?.trim();
  if (email?.includes('@')) {
    const hit = await findBusinessUserByEmail(accessToken, bid, email);
    if (hit?.businessUserId === buId) {
      const again = await fetchBusinessUserProfile(accessToken, buId);
      if (again?.facebookUserId) return again.facebookUserId;
    }
  }

  return null;
}

/** 用 BM 邮箱索引校验商务用户 id 是否与邮箱一致（有邮箱时） */
export async function validateBusinessUserIdInBm(
  accessToken: string,
  businessId: string,
  businessUserId: string,
  emailHint?: string
): Promise<boolean> {
  const buId = String(businessUserId).trim();
  const bid = String(businessId).trim();
  if (!isNumericGraphId(buId) || !isNumericGraphId(bid)) return false;
  const email = emailHint?.trim();
  if (!email?.includes('@')) {
    return (await fetchBusinessUserProfile(accessToken, buId)) != null;
  }
  const hit = await findBusinessUserByEmail(accessToken, bid, email);
  return hit?.businessUserId === buId;
}

/** 分页拉取 BM 内 business_users，按邮箱匹配 */
export async function findBusinessUserByEmail(
  accessToken: string,
  businessId: string,
  email: string
): Promise<GraphBusinessUserMatch | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}/business_users?fields=id,name,email&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 20 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? ((json as { data: { id?: string; email?: string; name?: string }[] }).data ?? [])
      : [];
    for (const row of rows) {
      const em = row.email != null ? String(row.email).trim().toLowerCase() : '';
      if (em === target && row.id) {
        return {
          businessUserId: String(row.id),
          email: row.email != null ? String(row.email) : email,
          name: row.name != null ? String(row.name) : undefined,
          businessId,
        };
      }
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return null;
}

export type PendingBusinessInvite = {
  id?: string;
  email: string;
  role?: string;
};

/** 查询 BM 内「待接受」邀请（Graph: pending_users） */
export async function fetchPendingBusinessInvites(
  accessToken: string,
  businessId: string
): Promise<PendingBusinessInvite[]> {
  const out: PendingBusinessInvite[] = [];
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}/pending_users?fields=id,email,role&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 20 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? ((json as { data: { id?: string; email?: string; role?: string }[] }).data ?? [])
      : [];
    for (const row of rows) {
      const email = row.email != null ? String(row.email).trim() : '';
      if (!email) continue;
      out.push({
        id: row.id != null ? String(row.id) : undefined,
        email,
        role: row.role != null ? String(row.role) : undefined,
      });
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return out;
}

export async function findPendingBusinessInviteByEmail(
  accessToken: string,
  businessId: string,
  email: string
): Promise<PendingBusinessInvite | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const pending = await fetchPendingBusinessInvites(accessToken, businessId);
  return pending.find((p) => p.email.trim().toLowerCase() === target) ?? null;
}

/** 邀请邮箱加入 BM（对方接受后才可分配广告账户权限） */
export async function inviteBusinessUserByEmail(
  accessToken: string,
  businessId: string,
  email: string,
  role: 'EMPLOYEE' | 'ADMIN' = 'EMPLOYEE'
): Promise<{ id?: string; pending?: boolean }> {
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('email', email.trim());
  body.set('role', role);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}/business_users`;
  const { ok, json, status } = await graphJson(url, { method: 'POST', body });
  if (ok && !json.error) {
    return { id: json.id != null ? String(json.id) : undefined };
  }
  const msg = formatGraphErrorBody(json, status);
  if (/pending|invite|invitation|已邀请/i.test(msg)) {
    return { pending: true };
  }
  throw new Error(msg);
}

const ASSIGNED_USER_TASKS_ALLOWED = new Set(['MANAGE', 'ADVERTISE', 'ANALYZE', 'DRAFT', 'AA_ANALYZE']);

/** 为广告账户分配 BM 用户（business user id） */
export async function assignBusinessUserToAdAccount(
  accessToken: string,
  accountId: string,
  businessUserId: string,
  tasks: string[] = ['ADVERTISE', 'ANALYZE']
): Promise<void> {
  const safeTasks = tasks.map((t) => String(t).toUpperCase()).filter((t) => ASSIGNED_USER_TASKS_ALLOWED.has(t));
  if (!safeTasks.length) {
    throw new Error('授权 tasks 为空');
  }
  const act = actPath(accountId);
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('user', businessUserId);
  body.set('tasks', JSON.stringify(safeTasks));
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users`;
  const { ok, json, status } = await graphJson(url, { method: 'POST', body });
  if (!ok || json.error) {
    throw new Error(formatGraphErrorBody(json, status));
  }
}

/** 在多个 BM 中查找邮箱对应的 business user */
export async function searchBusinessUserByEmailInBusinesses(
  accessToken: string,
  businessIds: string[],
  email: string
): Promise<GraphBusinessUserMatch | null> {
  const seen = new Set<string>();
  for (const bmId of businessIds) {
    const id = bmId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hit = await findBusinessUserByEmail(accessToken, id, email);
    if (hit) return hit;
  }
  return null;
}

/** 当前 token 可管理的 BM 列表（用于扩大邮箱搜索范围） */
export async function fetchAccessibleBusinessIds(accessToken: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/me/businesses?fields=id&limit=100&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 15 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: { id?: string }[] }).data)
      ? (json as { data: { id?: string }[] }).data
      : [];
    for (const row of rows) {
      const id = row.id != null ? String(row.id).trim() : '';
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return out;
}

/** POST business_users 邀请：应用/token 无 business_management 等权限（subcode 1752203） */
export function isBmInvitePermissionError(message: string): boolean {
  const t = (message || '').trim();
  if (!t) return false;
  return (
    /subcode\s*=\s*1752203/i.test(t) ||
    /Application does not have permission/i.test(t) ||
    (/code\s*=\s*10/i.test(t) &&
      (/权限无效|你没有完成这项操作的必要权限/i.test(t) || /permission/i.test(t)))
  );
}

export function formatBmInvitePermissionHint(message: string): string {
  if (!isBmInvitePermissionError(message)) return message;
  return (
    `${message}\n\n` +
    '说明：通过 Graph API 邀请 BM 成员需要 access_token 具备 business_management，且 Facebook 应用需对该 BM 授权并通过能力审核。' +
    '从浏览器抓取的 token 通常只能做广告账户操作，无法代发 BM 邀请邮件。\n' +
    '建议：在 business.facebook.com → 设置 → 用户 中由 BM 管理员手动邀请对方；对方接受后再回到本工具执行授权。'
  );
}

/** Marketing API：assigned_users 要求目标为 BM 内用户（subcode 1752100） */
export function isNotBusinessScopedUserError(message: string): boolean {
  const t = (message || '').trim();
  if (!t) return false;
  return (
    /subcode\s*=\s*1752100/i.test(t) ||
    /不属于业务账户范畴/i.test(t) ||
    /business user or system user/i.test(t)
  );
}

export function formatNotBusinessScopedUserHint(message: string): string {
  if (!isNotBusinessScopedUserError(message)) return message;
  return (
    `${message}\n\n` +
    '说明：已尝试将个人 UID 自动换算为 BM 商务用户编号但仍未成功。' +
    '请确认对方已加入该广告账户所属的商务管理平台，且已被分配到此广告账户；' +
    '或在 business.facebook.com → 广告账户 → 用户 中手动操作。'
  );
}

/** assigned_users 列表行（用于个人 UID → 商务用户 id 匹配） */
export type AssignedUserLookupRow = {
  assignedUserId: string;
  facebookUserId?: string;
  email?: string;
};

/**
 * Graph：`GET /{personal-user-id}/business_users` → 该用户在指定 BM 下的商务用户编号。
 * @see https://stackoverflow.com/questions/48079175
 */
export async function findBusinessUserIdViaUserBusinessUsersEdge(
  accessToken: string,
  personalFacebookId: string,
  businessId: string
): Promise<string | null> {
  const pid = String(personalFacebookId).trim();
  const bid = String(businessId).trim();
  if (!/^\d{5,}$/.test(pid) || !/^\d{5,}$/.test(bid)) return null;
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/business_users?fields=id,business{id}&limit=100&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 20 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? (json as { data: { id?: string; business?: { id?: string } }[] }).data
      : [];
    for (const row of rows) {
      const buId = row.id != null ? String(row.id).trim() : '';
      const bizId = row.business?.id != null ? String(row.business.id).trim() : '';
      if (buId && bizId === bid) return buId;
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return null;
}

/** 尝试读取 Facebook 用户主邮箱（用于在个人 UID → BM 商务用户之间映射） */
export async function fetchFacebookUserPrimaryEmail(
  accessToken: string,
  facebookUserId: string
): Promise<string | null> {
  const uid = String(facebookUserId).trim();
  if (!/^\d{5,}$/.test(uid)) return null;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${uid}?fields=email&access_token=${encodeURIComponent(accessToken)}`;
  const { ok, json } = await graphJson(url, { method: 'GET' });
  if (!ok || json.error) return null;
  const email = json.email != null ? String(json.email).trim() : '';
  return email.includes('@') ? email : null;
}

/**
 * 将个人 Facebook UID 换算为指定 BM 下的商务用户编号（供 assigned_users POST/DELETE）。
 * 依次尝试：广告账户协作者列表 → /{uid}/business_users → BM 邮箱匹配。
 */
export async function resolveBusinessUserIdForPersonalInBusiness(
  accessToken: string,
  businessId: string,
  personalFacebookId: string,
  assignedOnAccount: AssignedUserLookupRow[] = []
): Promise<string | null> {
  const pid = String(personalFacebookId).trim();
  const bid = String(businessId).trim();
  if (!pid || !/^\d{5,}$/.test(pid) || !/^\d{5,}$/.test(bid)) return null;

  for (const row of assignedOnAccount) {
    if (row.assignedUserId === pid || row.facebookUserId === pid) {
      return row.assignedUserId;
    }
  }

  const personalEmail = (await fetchFacebookUserPrimaryEmail(accessToken, pid))?.toLowerCase();
  if (personalEmail) {
    for (const row of assignedOnAccount) {
      const em = row.email?.trim().toLowerCase();
      if (em && em === personalEmail) return row.assignedUserId;
    }
  }

  const viaEdge = await findBusinessUserIdViaUserBusinessUsersEdge(accessToken, pid, bid);
  if (viaEdge) return viaEdge;

  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${bid}/business_users?fields=id,email&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 20 && url; page++) {
    const { ok, json } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) break;
    const rows = Array.isArray((json as { data?: { id?: string; email?: string }[] }).data)
      ? (json as { data: { id?: string; email?: string }[] }).data
      : [];
    for (const row of rows) {
      const buId = row.id != null ? String(row.id).trim() : '';
      if (!buId) continue;
      if (buId === pid) return buId;
      if (personalEmail) {
        const em = row.email != null ? String(row.email).trim().toLowerCase() : '';
        if (em && em === personalEmail) return buId;
      }
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }

  if (personalEmail) {
    const hit = await findBusinessUserByEmail(accessToken, bid, personalEmail);
    if (hit?.businessUserId) return hit.businessUserId;
  }
  return null;
}

/** 在多个 BM 中解析个人 UID 对应的商务用户编号 */
export async function resolveBusinessUserIdForPersonalInBusinesses(
  accessToken: string,
  personalFacebookId: string,
  businessIds: string[],
  assignedOnAccount: AssignedUserLookupRow[] = []
): Promise<{ businessUserId: string; businessId: string } | null> {
  const seen = new Set<string>();
  for (const raw of businessIds) {
    const bid = String(raw).trim();
    if (!bid || !/^\d{5,}$/.test(bid) || seen.has(bid)) continue;
    seen.add(bid);
    const buId = await resolveBusinessUserIdForPersonalInBusiness(
      accessToken,
      bid,
      personalFacebookId,
      assignedOnAccount
    );
    if (buId) return { businessUserId: buId, businessId: bid };
  }
  return null;
}

/** @deprecated 使用 resolveBusinessUserIdForPersonalInBusiness */
export async function findBusinessUserIdForPersonalFacebookId(
  accessToken: string,
  businessId: string,
  personalFacebookId: string
): Promise<string | null> {
  return resolveBusinessUserIdForPersonalInBusiness(accessToken, businessId, personalFacebookId);
}

/**
 * 读取/删除 `act_xxx/assigned_users` 时 Meta 要求 `business`（所属 BM id）。
 */
export async function resolveBusinessIdForAdAccount(
  accessToken: string,
  accountId: string,
  hintBmIds: string[] = []
): Promise<string> {
  const owner = await fetchAdAccountOwnerBusinessId(accessToken, accountId);
  if (owner) return owner;
  const ids = await resolveBusinessIdsForAccounts(accessToken, [accountId], hintBmIds);
  if (ids[0]) return ids[0];
  throw new Error(
    '(#100) assigned_users 需要 business 参数，但无法确定该广告账户所属 Business Manager。请在 business.facebook.com 打开对应 BM 后重试。'
  );
}

/** 构建带 business 的 assigned_users 列表 URL（分页 next 由 Graph 返回，通常已含 business） */
export function buildAdAccountAssignedUsersReadUrl(
  accountId: string,
  businessId: string,
  fields: string,
  accessToken: string,
  limit = 500
): string {
  const act = actPath(accountId);
  const q = new URLSearchParams({
    fields,
    business: businessId,
    limit: String(limit),
    access_token: accessToken,
  });
  return `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users?${q.toString()}`;
}

export async function resolveBusinessIdsForAccounts(
  accessToken: string,
  accountIds: string[],
  hintBmIds: string[] = []
): Promise<string[]> {
  const seen = new Set<string>();
  const add = (id: string | undefined | null) => {
    const t = id != null ? String(id).trim() : '';
    if (t && /^\d{5,}$/.test(t)) seen.add(t);
  };
  for (const h of hintBmIds) add(h);
  for (const accountId of accountIds) {
    add(await fetchAdAccountOwnerBusinessId(accessToken, accountId));
  }
  if (!seen.size) {
    for (const id of await fetchAccessibleBusinessIds(accessToken)) {
      add(id);
    }
  }
  return [...seen];
}
