import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { describeToken, redactUrlForLog } from '../tokenDebugLog';
import {
  fetchAdAccountHiddenAdminCount,
  fetchAdAccountManageAdminCount,
} from './graphFetchAdAccountAssignedUsers';
import { fetchFacebookSelfUserIdsForExclude } from '../graphFetchMe';
import { graphAmountSpentToMinor } from './accountSpendLimits';
import { mapGraphApiAdAccountToRecord, normalizeAccountId } from './mapGraphAdAccount';
import { currencyOffset, resolveSpendCapMinorForRecord, spendCapRawToMinor } from './spendCapCurrency';
import { graphFetch } from '../graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

/** Graph 拉取列表后，并发统计各户「带 MANAGE 的 assigned_users」人数，避免「管理员」列恒为 0 */
const ADMIN_COUNT_ENRICH_CONCURRENCY = 10;
const AMOUNT_SPENT_ENRICH_CONCURRENCY = 8;
const SPEND_CAP_ENRICH_CONCURRENCY = 8;

async function enrichManageAdminCounts(accessToken: string, rows: FbAdAccountRecord[]): Promise<void> {
  if (!rows.length) return;
  const selfIds = await fetchFacebookSelfUserIdsForExclude(accessToken);
  if (!selfIds.length) {
    console.warn(
      '[fbControl:graph] 无法解析当前用户 id（/me 与 debug_token 均未拿到），管理员列可能仍包含本人 MANAGE'
    );
  }
  const countOpts = { excludeFacebookUserIds: selfIds };
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        const hintBmIds = [row.belongsToBmId, row.createdFromBmId].filter(
          (id): id is string => typeof id === 'string' && /^\d{5,}$/.test(id.trim())
        );
        const n = await fetchAdAccountManageAdminCount(accessToken, row.accountId, {
          ...countOpts,
          hintBmIds,
        });
        row.adminCount = n;
      } catch (e) {
        row.adminCount = 0;
        const message =
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null
              ? JSON.stringify(e)
              : String(e);
        console.info('[fbControl:graph] adminCount 跳过', {
          accountId: row.accountId,
          message,
        });
      }
    }
  }
  const n = Math.min(ADMIN_COUNT_ENRICH_CONCURRENCY, rows.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

/** 列表 `amount_spent` 常为 0 时，按户拉 act_{id}?fields=amount_spent 补全总花费 */
async function enrichAmountSpent(accessToken: string, rows: FbAdAccountRecord[]): Promise<void> {
  const targets = rows.filter((r) => (r.totalSpentMinor ?? 0) === 0);
  if (!targets.length) return;
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const row = targets[i];
      const id = String(row.accountId).replace(/^act_/i, '').trim();
      try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${id}?fields=amount_spent,currency&access_token=${encodeURIComponent(accessToken)}`;
        const res = await graphFetch(url);
        const json = (await res.json()) as {
          amount_spent?: string | number;
          currency?: string;
          error?: { message?: string };
        };
        if (!res.ok || json.error) continue;
        const ccy = json.currency ?? row.currency;
        const minor = graphAmountSpentToMinor(json.amount_spent, ccy);
        if (minor == null || minor <= 0) continue;
        row.totalSpentMinor = minor;
        row.billingAmountMinor = minor;
        row.totalSpent = minor / currencyOffset(ccy);
        if (json.amount_spent != null) row.periodSpent = String(json.amount_spent);
      } catch (e) {
        console.info('[fbControl:graph] amount_spent 补全跳过', {
          accountId: row.accountId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  const n = Math.min(AMOUNT_SPENT_ENRICH_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

/**
 * 列表 `spend_cap` 常为 0/缺失；单户 GET 可读到 Meta 占位值 1（CNY→¥0.01），与参考插件「临时限额」一致。
 */
async function enrichSpendCap(accessToken: string, rows: FbAdAccountRecord[]): Promise<void> {
  const targets = rows.filter((r) => {
    const cap = resolveSpendCapMinorForRecord(r);
    return cap == null || cap === 0;
  });
  if (!targets.length) return;
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const row = targets[i];
      const id = String(row.accountId).replace(/^act_/i, '').trim();
      try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${id}?fields=spend_cap,currency,amount_spent&access_token=${encodeURIComponent(accessToken)}`;
        const res = await graphFetch(url);
        const json = (await res.json()) as {
          spend_cap?: string | number;
          currency?: string;
          amount_spent?: string | number;
          error?: { message?: string };
        };
        if (!res.ok || json.error) continue;
        const ccy = json.currency ?? row.currency;
        const raw = json.spend_cap;
        if (raw == null || raw === '' || raw === 0 || raw === '0') continue;
        const amountSpentMinor = graphAmountSpentToMinor(json.amount_spent, ccy);
        const minor = spendCapRawToMinor(
          typeof raw === 'number' ? raw : parseInt(String(raw), 10),
          {
            currency: ccy,
            amountSpentMinor: amountSpentMinor ?? row.totalSpentMinor,
            spendCapMinor: row.spendCapMinor,
          }
        );
        if (minor == null || minor <= 0) continue;
        row.spendCapMinor = minor;
        row.spendingLimit = String(raw);
      } catch (e) {
        console.info('[fbControl:graph] spend_cap 补全跳过', {
          accountId: row.accountId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  const n = Math.min(SPEND_CAP_ENRICH_CONCURRENCY, targets.length);
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
  'min_campaign_group_spend_cap',
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
  await enrichAmountSpent(accessToken, out);
  console.info('[fbControl:graph] amount_spent enrich 完成', { mappedCount: out.length });
  await enrichSpendCap(accessToken, out);
  console.info('[fbControl:graph] spend_cap enrich 完成', { mappedCount: out.length });
  return out;
}

/**
 * 按广告账户 ID 从 Graph 拉取单条并映射（用于悬浮窗本地无缓存时即时补全）。
 */
export async function fetchSingleAdAccountFromGraph(
  accessToken: string,
  accountId: string
): Promise<FbAdAccountRecord | null> {
  const id = String(accountId).replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id)) return null;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${id}?fields=${encodeURIComponent(AD_ACCOUNT_FIELDS)}&access_token=${encodeURIComponent(accessToken)}`;
  console.info('[fbControl:graph] 拉取单条广告账户', {
    accountId: id,
    url: redactUrlForLog(url),
    token: describeToken(accessToken),
  });

  const res = await graphFetch(url);
  const json = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const now = Date.now();
  const record = mapGraphApiAdAccountToRecord(
    json,
    normalizeAccountId(id, id),
    now,
    `graph:${GRAPH_VERSION}/act_${id}`
  );

  const hintBmIds = [record.belongsToBmId, record.createdFromBmId].filter(
    (bid): bid is string => typeof bid === 'string' && /^\d{5,}$/.test(bid.trim())
  );
  const countOpts = {
    hintBmIds,
    excludeFacebookUserIds: await fetchFacebookSelfUserIdsForExclude(accessToken),
  };
  try {
    record.adminCount = await fetchAdAccountManageAdminCount(accessToken, record.accountId, countOpts);
  } catch {
    record.adminCount = 0;
  }
  try {
    record.hiddenAdminCount = await fetchAdAccountHiddenAdminCount(
      accessToken,
      record.accountId,
      countOpts
    );
  } catch {
    record.hiddenAdminCount = undefined;
  }

  if ((record.totalSpentMinor ?? 0) === 0) {
    await enrichAmountSpent(accessToken, [record]);
  }
  if ((resolveSpendCapMinorForRecord(record) ?? 0) === 0) {
    await enrichSpendCap(accessToken, [record]);
  }

  return record;
}
