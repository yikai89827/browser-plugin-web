import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import {
  formatAccountStatusZh,
  formatDisableReasonZh,
  formatPaymentMethodZh,
  formatUserRoleZh,
  readFundingSourceDisplay,
} from './adAccountDisplayMaps';

/**
 * 从任意字符串中提取连续 10 位以上的数字，视为可能的广告账户 ID 片段。
 */
export function extractNumericAccountId(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/\b(\d{10,})\b/);
  return m ? m[1] : '';
}

/**
 * 规范化广告账户主键：优先纯数字长串，否则从文本中提取数字，最后使用调用方提供的 fallback。
 */
export function normalizeAccountId(raw: string, fallbackKey: string): string {
  const trimmed = (raw || '').replace(/^act_/i, '').trim();
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  const fromBlob = extractNumericAccountId(raw);
  if (fromBlob) return fromBlob;
  return fallbackKey;
}

/**
 * 判断是否为可信的 Facebook 广告账户数字 ID（用于过滤 DOM 误采集行）。
 */
export function isLikelyFacebookAdAccountId(accountId: string): boolean {
  const id = accountId.replace(/^act_/i, '').trim();
  return /^\d{10,}$/.test(id);
}

/** 从展示用花费字符串解析为 number */
function parseSpend(spendText?: string | null): number {
  if (!spendText) return 0;
  const cleaned = spendText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : value;
}

/** Graph 金额类整数字段：通常为账户币种「最小单位」（如美分） */
function parseMinorInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = String(v).trim();
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Graph `account_type` → 与产品「账号类型」列对齐的简短英文标签 */
function formatAccountKindLabel(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const k = String(raw).trim().toUpperCase();
  const map: Record<string, string> = {
    GENERAL: 'Business',
    CORPORATE: 'Corporate',
    INHOUSE_AGENCY: 'In-house agency',
    EXTERNAL_AGENCY: 'Agency',
    PERSONAL: 'Personal',
    GOVERNMENT: 'Government',
    NONPROFIT: 'Nonprofit',
    WHITELISTED: 'Whitelisted',
    APP_DEVELOPER: 'App developer',
    BROADCAST: 'Broadcast',
    STUDY: 'Study',
    MEDICAL: 'Medical',
    POLITICAL: 'Political',
    NONE: 'None',
  };
  return map[k] || k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 解析 Graph `amount_spent` 等字段为数字型花费（主单位，用于无法按「最小单位」解析时的回退） */
function parseAmountSpent(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseSpend(String(v));
}

/** 解析 Graph `business` / `owner_business` 节点或纯 id 字符串 */
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

/**
 * 将单条 Graph / 页面脚本广告账户 JSON 映射为本地 `FbAdAccountRecord`（含中文枚举展示字段）。
 */
export function mapGraphApiAdAccountToRecord(
  a: Record<string, unknown>,
  accountId: string,
  now: number,
  sourceUrl: string
): FbAdAccountRecord {
  const currency = String(a.currency ?? '');
  const balanceRaw = a.balance;
  const spendCapRaw = a.spend_cap;
  const minDailyRaw = a.min_daily_budget;
  const balanceStr = balanceRaw != null ? String(balanceRaw) : '';
  const spendCap = spendCapRaw != null ? String(spendCapRaw) : '';
  const amountSpentMinor = parseMinorInt(a.amount_spent ?? a.amount_spent_string ?? a.spend);
  const amountSpentMajor =
    amountSpentMinor != null ? amountSpentMinor / 100 : parseAmountSpent(a.amount_spent ?? a.amount_spent_string ?? a.spend);
  const balanceMinor = parseMinorInt(balanceRaw);
  const spendCapMinor = parseMinorInt(spendCapRaw);
  const minDailyBudgetMinor = parseMinorInt(minDailyRaw);
  const accountKindLabel = formatAccountKindLabel(a.account_type);
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
    accountKindLabel,
    balance: balanceStr || undefined,
    balanceMinor,
    billingAmountMinor: balanceMinor,
    paymentThresholdMinor: spendCapMinor,
    spendCapMinor,
    minDailyBudgetMinor,
    totalSpentMinor: amountSpentMinor,
    dailyLimit:
      a.min_daily_budget != null
        ? String(a.min_daily_budget)
        : spendCap
          ? spendCap
          : undefined,
    spendingLimit: spendCap || undefined,
    totalSpent: amountSpentMajor,
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
    spend: amountSpentMajor,
    capturedAt: now,
    sourceUrl: sourceUrl,
  };
}
