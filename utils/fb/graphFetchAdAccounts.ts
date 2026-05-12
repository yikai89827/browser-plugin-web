import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import { mapGraphApiAdAccountToRecord, normalizeAccountId } from './mapGraphAdAccount';

const GRAPH_VERSION = 'v21.0';

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
  'business',
  'owner_business',
  'created_time',
  'timezone_name',
  'disable_reason',
  'is_prepay_account',
  'end_advertiser',
  'next_bill_date',
  'funding_source',
  'user_role',
  'business_id',
  'owner_business_id',
  'business_name',
  'country',
  'country_code',
].join(',');

/**
 * 使用用户 access_token 调用 Graph `me/adaccounts`，分页拉全量并映射为本地行。
 */
export async function fetchAdAccountsFromGraph(accessToken: string): Promise<FbAdAccountRecord[]> {
  const now = Date.now();
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts`;
  let url = `${base}?fields=${encodeURIComponent(AD_ACCOUNT_FIELDS)}&limit=100&access_token=${encodeURIComponent(accessToken)}`;
  const rawRows: Record<string, unknown>[] = [];

  while (url) {
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (Array.isArray(json.data)) {
      rawRows.push(...json.data);
    }
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
  return out;
}
