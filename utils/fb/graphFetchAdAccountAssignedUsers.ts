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

/**
 * 分页统计 `act_{id}/assigned_users` 人数（用于「隐藏管理员」列）。
 * 需 token 具备相应广告账户权限。
 */
export async function fetchAdAccountAssignedUserCount(
  accessToken: string,
  accountId: string
): Promise<number> {
  const path = actPath(accountId);
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}/assigned_users?fields=id&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  let total = 0;
  let pages = 0;
  console.info('[fbControl:graph] 拉取 assigned_users', {
    graphVersion: GRAPH_VERSION,
    path,
    token: describeToken(accessToken),
  });
  while (url && pages < MAX_PAGES) {
    pages += 1;
    console.info(`[fbControl:graph] assigned_users 第 ${pages} 页`, { url: redactUrlForLog(url) });
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      data?: { id?: string }[];
      paging?: { next?: string };
      error?: unknown;
    };
    if (!res.ok || json.error) {
      const msg = graphErrorToString(json, res.status);
      console.error(
        `[fbControl:graph] assigned_users 错误 http=${res.status} msg=${msg}`
      );
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    total += batch.length;
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  console.info('[fbControl:graph] assigned_users 计数完成', { accountId, total, pages });
  return total;
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

function rowHasManageTask(tasks: unknown): boolean {
  return normalizeAssignedUserTasks(tasks).includes('MANAGE');
}

export type ManageAdminCountOptions = {
  /** 排除当前登录用户，避免「自己在每个户上都是 MANAGE」导致户户显示 1 */
  excludeFacebookUserId?: string | null;
};

/**
 * 统计 `assigned_users` 中带 `MANAGE` 任务的人数（与表格「管理员」列一致，非全部协作者数）。
 * 默认排除当前 token 对应用户，只统计**其他**具备 MANAGE 的人数。
 */
export async function fetchAdAccountManageAdminCount(
  accessToken: string,
  accountId: string,
  options?: ManageAdminCountOptions
): Promise<number> {
  const path = actPath(accountId);
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}/assigned_users?fields=id,tasks&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  let total = 0;
  let pages = 0;
  const ex = options?.excludeFacebookUserId?.trim() || null;
  while (url && pages < MAX_PAGES) {
    pages += 1;
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      data?: { id?: string; tasks?: unknown }[];
      paging?: { next?: string };
      error?: unknown;
    };
    if (!res.ok || json.error) {
      const msg = graphErrorToString(json, res.status);
      console.error(
        `[fbControl:graph] assigned_users(tasks) 错误 accountId=${accountId} http=${res.status} msg=${msg}`
      );
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    for (const row of batch) {
      const uid = row.id != null ? String(row.id) : '';
      if (ex && uid === ex) continue;
      if (rowHasManageTask(row.tasks)) total += 1;
    }
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return total;
}
