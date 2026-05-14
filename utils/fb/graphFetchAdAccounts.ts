import { formatUserRoleZh } from './adAccountDisplayMaps';
import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import { describeToken, redactUrlForLog } from './tokenDebugLog';
import { fetchAdAccountManageAdminCount } from './graphFetchAdAccountAssignedUsers';
import { mapGraphApiAdAccountToRecord, normalizeAccountId } from './mapGraphAdAccount';
import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

/** Graph 拉取列表后，并发统计各户「带 MANAGE 的 assigned_users」人数，避免「管理员」列恒为 0 */
const ADMIN_COUNT_ENRICH_CONCURRENCY = 10;

async function enrichManageAdminCounts(accessToken: string, rows: FbAdAccountRecord[]): Promise<void> {
  if (!rows.length) return;
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        const n = await fetchAdAccountManageAdminCount(accessToken, row.accountId);
        row.adminCount = n;
        if (n === 0 && formatUserRoleZh(row.userRoleRaw) === '管理员') {
          row.adminCount = 1;
        }
      } catch (e) {
        if (formatUserRoleZh(row.userRoleRaw) === '管理员') {
          row.adminCount = 1;
        }
        console.info('[fbControl:graph] adminCount 跳过', {
          accountId: row.accountId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  const n = Math.min(ADMIN_COUNT_ENRICH_CONCURRENCY, rows.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

/**
 * Graph `me/adaccounts` 请求字段列表（逗号拼接）。含 BM 嵌套、资金源展示、业务国家等。
 */
const AD_ACCOUNT_FIELDS = [
  'id',
  'account_id',
  'name',
  'account_status',
  'currency',
  'amount_spent',
  'balance',
  'spend_cap',
  'min_daily_budget',
  /** BM 与地址：须展开子字段，否则常只有 id；国家用 business_country_code */
  'business{id,name}',
  'owner_business{id,name}',
  'business_name',
  'business_country_code',
  'created_time',
  'timezone_name',
  'disable_reason',
  'is_prepay_account',
  'end_advertiser',
  'next_bill_date',
  'funding_source',
  'funding_source_details{display_string}',
  'user_role',
  'account_type',
  /** 与 account_type 交叉判断：BM 下 PERSONAL 常仍为公司广告户 */
  'is_personal',
].join(',');

/**
 * 使用用户 `access_token` 分页调用 `GET /me/adaccounts`，映射为 `FbAdAccountRecord[]`。
 */
export async function fetchAdAccountsFromGraph(accessToken: string): Promise<FbAdAccountRecord[]> {
  console.info('[fbControl:graph] 开始拉取广告账户', {
    graphVersion: GRAPH_VERSION,
    endpoint: 'me/adaccounts',
    token: describeToken(accessToken),
  });

  const now = Date.now();
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts`;
  let url = `${base}?fields=${encodeURIComponent(AD_ACCOUNT_FIELDS)}&limit=100&access_token=${encodeURIComponent(accessToken)}`;
  const rawRows: Record<string, unknown>[] = [];
  let page = 0;

  while (url) {
    page += 1;
    console.info(`[fbControl:graph] 请求第 ${page} 页`, { url: redactUrlForLog(url) });
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      console.error('[fbControl:graph] Graph 返回错误', {
        httpStatus: res.status,
        errorMessage: msg,
        errorCode: json?.error?.code,
      });
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    rawRows.push(...batch);
    console.info(`[fbControl:graph] 第 ${page} 页完成`, {
      batchCount: batch.length,
      cumulative: rawRows.length,
      hasNext: Boolean(json.paging?.next),
    });
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }

  const out: FbAdAccountRecord[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const a = rawRows[i];
    const accountId = normalizeAccountId(
      String(a.account_id ?? a.id ?? '').replace(/^act_/i, ''),
      `graph_${i}`
    );
    out.push(
      mapGraphApiAdAccountToRecord(a, accountId, now, `graph:${GRAPH_VERSION}/me/adaccounts`)
    );
  }

  console.info('[fbControl:graph] 映射完成，准备统计 MANAGE 管理员人数', {
    rawCount: rawRows.length,
    mappedCount: out.length,
  });
  await enrichManageAdminCounts(accessToken, out);
  console.info('[fbControl:graph] adminCount enrich 完成', { mappedCount: out.length });
  return out;
}
