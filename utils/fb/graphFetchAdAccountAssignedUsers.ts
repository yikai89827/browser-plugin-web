import { describeToken, redactUrlForLog } from './tokenDebugLog';
import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';
const MAX_PAGES = 25;

function actPath(accountId: string): string {
  const raw = accountId.replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : accountId;
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
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      console.error('[fbControl:graph] assigned_users 错误', { httpStatus: res.status, message: msg });
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
