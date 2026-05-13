import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import {
  formatAccountStatusZh,
  formatDisableReasonZh,
  formatPaymentMethodZh,
  formatUserRoleZh,
  readFundingSourceDisplay,
} from './adAccountDisplayMaps';

export function extractNumericAccountId(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/\b(\d{10,})\b/);
  return m ? m[1] : '';
}

export function normalizeAccountId(raw: string, fallbackKey: string): string {
  const trimmed = (raw || '').replace(/^act_/i, '').trim();
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  const fromBlob = extractNumericAccountId(raw);
  if (fromBlob) return fromBlob;
  return fallbackKey;
}

/** 广告账户 ID 为纯数字长串；用于过滤 DOM 误采集的表头/占位行 */
export function isLikelyFacebookAdAccountId(accountId: string): boolean {
  const id = accountId.replace(/^act_/i, '').trim();
  return /^\d{10,}$/.test(id);
}

function parseSpend(spendText?: string | null): number {
  if (!spendText) return 0;
  const cleaned = spendText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : value;
}

function parseAmountSpent(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseSpend(String(v));
}

function readBusinessNode(v: unknown): { id?: string; name?: string } {
  if (v == null) return {};
  if (typeof v === 'string' || typeof v === 'number') {
    const id = String(v).trim();
    return id ? { id } : {};
  }
  if (typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : undefined;
  const name = o.name != null ? String(o.name) : undefined;
  return { id, name };
}

/** Graph / 页面脚本中的广告账户 JSON → 表格行 */
export function mapGraphApiAdAccountToRecord(
  a: Record<string, unknown>,
  accountId: string,
  now: number,
  sourceUrl: string
): FbAdAccountRecord {
  const currency = String(a.currency ?? '');
  const balance = a.balance != null ? String(a.balance) : '';
  const spendCap = a.spend_cap != null ? String(a.spend_cap) : '';
  const amountSpent = parseAmountSpent(a.amount_spent ?? a.amount_spent_string ?? a.spend);
  const prepay = a.is_prepay_account;
  let accountType: string | undefined;
  if (prepay === true || prepay === 1) accountType = '预付';
  else if (prepay === false || prepay === 0) accountType = '后付费';

  const biz = readBusinessNode(a.business);
  const ownerBiz = readBusinessNode(a.owner_business);
  const rootBusinessName =
    a.business_name != null && String(a.business_name).trim()
      ? String(a.business_name).trim()
      : undefined;

  /** 创建自 BM：优先 owner_business，否则 business */
  const createdBmId = ownerBiz.id ?? biz.id;
  const createdBmName = ownerBiz.name ?? biz.name ?? rootBusinessName;

  /** 所属 BM：优先 business（资产关联），否则与创建一致 */
  const belongsBmId = biz.id ?? ownerBiz.id;
  const belongsBmName = biz.name ?? ownerBiz.name ?? rootBusinessName;
  const createdTime = a.created_time != null ? String(a.created_time) : '';
  const createdDate = createdTime.length >= 10 ? createdTime.slice(0, 10) : undefined;

  const oid =
    a.id != null && String(a.id) !== String(accountId)
      ? String(a.id)
      : a.account_id != null
        ? String(a.account_id)
        : accountId;

  const fundingDisplay = readFundingSourceDisplay(a);

  return {
    accountId,
    name: String(a.name ?? a.account_name ?? accountId),
    status: formatAccountStatusZh(a.account_status ?? a.status ?? 'unknown'),
    currency: currency || undefined,
    accountType,
    balance: balance || undefined,
    dailyLimit:
      a.min_daily_budget != null
        ? String(a.min_daily_budget)
        : spendCap
          ? spendCap
          : undefined,
    spendingLimit: spendCap || undefined,
    totalSpent: amountSpent,
    periodSpent:
      a.amount_spent != null
        ? String(a.amount_spent)
        : a.amount_spent_string != null
          ? String(a.amount_spent_string)
          : undefined,
    ownerRole: formatUserRoleZh(a.user_role),
    paymentMethod: formatPaymentMethodZh(
      a.funding_source ?? a.payment_method,
      fundingDisplay
    ),
    billingPeriod:
      a.next_bill_date != null
        ? String(a.next_bill_date)
        : a.end_advertiser != null
          ? String(a.end_advertiser)
          : undefined,
    lockReason: formatDisableReasonZh(a.disable_reason),
    createdDate,
    timezone:
      (a.timezone_name ?? a.timezone_id ?? a.timezone_offset_hours_utc) != null
        ? String(a.timezone_name ?? a.timezone_id ?? a.timezone_offset_hours_utc)
        : undefined,
    originalId: oid,
    createdFromBmName: createdBmName,
    createdFromBmId: createdBmId,
    belongsToBmName: belongsBmName,
    belongsToBmId: belongsBmId,
    countryCode:
      a.business_country_code != null
        ? String(a.business_country_code).trim() || undefined
        : a.country_code != null
          ? String(a.country_code).trim() || undefined
          : a.country != null
            ? String(a.country).trim() || undefined
            : undefined,
    spend: amountSpent,
    capturedAt: now,
    sourceUrl: sourceUrl,
  };
}
