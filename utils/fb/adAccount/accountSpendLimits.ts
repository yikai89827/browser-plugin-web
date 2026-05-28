import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { fxRateForMoneyConversion } from '../adsPanel/currencyExchange';
import { formattedDslToMinor } from '../adsPanel/metaFormattedDsl';
import {
  currencyOffset,
  resolveSpendCapMinorForRecord,
  spendCapRawToMinor,
} from './spendCapCurrency';

export function isPrepayAccount(row: FbAdAccountRecord): boolean {
  const t = (row.accountType || '').trim();
  return t === '预付' || /^prepaid$/i.test(t);
}

/** 参考插件：门槛列恒为 0（不用 min_campaign_group_spend_cap） */
export function resolvePaymentThresholdMinor(_row: FbAdAccountRecord): number {
  return 0;
}

/** 仅当 min_daily_budget 折算约 $45–$55 时展示日限额（参考插件仅少数账户有值） */
const DAILY_LIMIT_SHOW_USD_MINOR_MIN = 4500;
const DAILY_LIMIT_SHOW_USD_MINOR_MAX = 5500;

/** 悬浮窗「花费限额」固定约 $50 的账户（与参考插件一致） */
const META_ACCOUNT_PANEL_SPENDING_LIMIT_IDS = new Set([
  '749409981526979',
  '940870165585058',
]);

/** Meta 账户级「花费限额」约 $50（USD 美分） */
export const META_ACCOUNT_PANEL_SPENDING_LIMIT_USD_MINOR = 5000;

/** 参考插件「日限额」蓝字约 $50.09（USD 美分）；Graph min_daily_budget 常为 ~$1 时需按汇率换算展示 */
export const META_ACCOUNT_PANEL_DAILY_LIMIT_USD_MINOR = 5009;

export function hasMetaPanelSpendingLimitAccount(row: FbAdAccountRecord): boolean {
  const id = String(row.accountId).replace(/^act_/i, '').trim();
  return META_ACCOUNT_PANEL_SPENDING_LIMIT_IDS.has(id);
}

/** 账户最小单位 → USD 美分 */
export function accountMinorToUsdMinor(
  accountMinor: number,
  currency: string,
  usdToAccountRate: number
): number {
  const ccy = currency.trim().toUpperCase();
  const majorAcct = accountMinor / currencyOffset(ccy);
  if (ccy === 'USD') return Math.round(majorAcct * 100);
  const rate = fxRateForMoneyConversion(usdToAccountRate);
  if (rate == null) return 0;
  return Math.round((majorAcct / rate) * 100);
}

/** formatted_dsl 折算约 $45–$55 时视为「日限额」展示值（与 fbspider 部分账户一致） */
function formattedDslMinorInDailyShowBand(
  row: FbAdAccountRecord,
  usdToAccountRate: number
): number | null {
  const raw = row.formattedDsl?.trim();
  if (!raw) return null;
  const fromDsl = formattedDslToMinor(raw, row.currency);
  if (fromDsl == null || fromDsl <= 0) return null;
  const usdMinor = accountMinorToUsdMinor(fromDsl, row.currency || 'USD', usdToAccountRate);
  if (
    usdMinor >= DAILY_LIMIT_SHOW_USD_MINOR_MIN &&
    usdMinor <= DAILY_LIMIT_SHOW_USD_MINOR_MAX
  ) {
    return fromDsl;
  }
  return null;
}

/** USD 美分 → 账户最小单位 */
export function usdMinorToAccountMinor(
  usdMinor: number,
  currency: string,
  usdToAccountRate: number
): number {
  const ccy = currency.trim().toUpperCase();
  const majorUsd = usdMinor / 100;
  if (ccy === 'USD') return Math.round(majorUsd * currencyOffset(ccy));
  const rate = fxRateForMoneyConversion(usdToAccountRate);
  if (rate == null) return Math.round(majorUsd * currencyOffset(ccy));
  return Math.round(majorUsd * rate * currencyOffset(ccy));
}

/**
 * 表格/悬浮窗「日限额」：Graph `min_daily_budget` 多为投放最低预算（约 $1）→ 不限额；
 * 指定 CNY/PKR 户参考插件展示约 $50 档本币（如 ¥341.43、Rs14,015.52）。
 */
export function resolveDailySpendLimitMinor(
  row: FbAdAccountRecord,
  usdToAccountRate?: number | null
): number | null | undefined {
  const ccy = (row.currency || 'USD').trim().toUpperCase();
  const rate = fxRateForMoneyConversion(usdToAccountRate);
  const raw = row.minDailyBudgetMinor;

  if (hasMetaPanelSpendingLimitAccount(row) && ccy !== 'USD' && rate != null) {
    const fromDsl = formattedDslMinorInDailyShowBand(row, rate);
    if (fromDsl != null) return fromDsl;
    if (raw != null && raw > 0) {
      const usdMinor = accountMinorToUsdMinor(raw, ccy, rate);
      if (
        usdMinor >= DAILY_LIMIT_SHOW_USD_MINOR_MIN &&
        usdMinor <= DAILY_LIMIT_SHOW_USD_MINOR_MAX
      ) {
        return raw;
      }
    }
    return usdMinorToAccountMinor(META_ACCOUNT_PANEL_DAILY_LIMIT_USD_MINOR, ccy, rate);
  }

  if (raw == null || raw <= 0) return null;
  if (ccy === 'USD') return null;
  if (rate == null) return null;

  const usdMinor = accountMinorToUsdMinor(raw, ccy, rate);
  if (
    usdMinor >= DAILY_LIMIT_SHOW_USD_MINOR_MIN &&
    usdMinor <= DAILY_LIMIT_SHOW_USD_MINOR_MAX
  ) {
    return raw;
  }
  return null;
}

/**
 * 悬浮窗「花费限额」：指定账户为 Meta 账户级约 $50；其余户用 spend_cap（0=不限额）。
 */
export function resolvePanelSpendingLimitMinor(
  row: FbAdAccountRecord,
  usdToAccountRate?: number | null
): number | null | undefined {
  if (hasMetaPanelSpendingLimitAccount(row)) {
    const ccy = (row.currency || 'USD').trim().toUpperCase();
    if (ccy === 'USD') return META_ACCOUNT_PANEL_SPENDING_LIMIT_USD_MINOR;
    const rate = fxRateForMoneyConversion(usdToAccountRate);
    if (rate == null) return null;
    return usdMinorToAccountMinor(
      META_ACCOUNT_PANEL_SPENDING_LIMIT_USD_MINOR,
      ccy,
      rate
    );
  }
  const cap = resolveSpendCapMinorForRecord(row);
  if (cap === 0) return 0;
  return cap ?? undefined;
}

/**
 * 悬浮窗「临时限额」：优先 Meta 内部 `formatted_dsl`（参考 fbspider）；
 * 回退 Graph `spend_cap`（新户常见 raw=1 → ¥0.01 / $0.01）。
 */
export function resolveTemporarySpendLimitMinor(
  row: FbAdAccountRecord,
  usdToAccountRate?: number | null
): number | null | undefined {
  if (row.formattedDsl?.trim()) {
    const fromDsl = formattedDslToMinor(row.formattedDsl, row.currency);
    if (fromDsl != null && fromDsl > 0) return fromDsl;
    if (fromDsl === 0) return 0;
  }
  if (hasMetaPanelSpendingLimitAccount(row)) {
    const daily = resolveDailySpendLimitMinor(row, usdToAccountRate);
    if (daily != null && daily > 0) return daily;
  }
  const cap = resolveSpendCapMinorForRecord(row);
  if (cap != null && cap > 0) return cap;
  const rawStr = row.spendingLimit?.trim();
  if (rawStr && /^\d+$/.test(rawStr)) {
    const n = parseInt(rawStr, 10);
    if (n > 0) {
      const minor = spendCapRawToMinor(n, {
        currency: row.currency,
        amountSpentMinor: row.totalSpentMinor,
        spendCapMinor: row.spendCapMinor,
      });
      if (minor != null && minor > 0) return minor;
    }
  }
  if (cap === 0) return 0;
  return undefined;
}

/** Graph `amount_spent` → 最小单位（兼容主单位整数与小数） */
export function graphAmountSpentToMinor(raw: unknown, currency?: string | null): number | undefined {
  if (raw == null || raw === '') return undefined;
  const offset = currencyOffset(currency);

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return undefined;
    if (raw === 0) return 0;
    if (Math.abs(raw - Math.round(raw)) >= 1e-6) {
      return Math.round(raw * offset);
    }
    return normalizeAmountSpentInt(Math.round(raw), offset);
  }

  const s = String(raw).trim();
  if (!s) return undefined;
  if (s.includes('.')) {
    const f = parseFloat(s);
    if (Number.isFinite(f)) return Math.round(f * offset);
  }
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return undefined;
  if (n === 0) return 0;
  return normalizeAmountSpentInt(n, offset);
}

function normalizeAmountSpentInt(n: number, offset: number): number {
  if (n >= offset) return n;
  return Math.round(n * offset);
}

/**
 * 账单金额 / 总花费：与参考插件一致，优先 Graph `amount_spent`。
 * `me/adaccounts` 列表常返回 0，回退 periodSpent、totalSpent、balance（与当前账单列同源）。
 */
export function resolveTotalSpentMinor(row: FbAdAccountRecord): number | null | undefined {
  const minor = row.totalSpentMinor;
  if (minor != null && minor > 0) return minor;

  const fromPeriod = graphAmountSpentToMinor(row.periodSpent, row.currency);
  if (fromPeriod != null && fromPeriod > 0) return fromPeriod;

  if (typeof row.totalSpent === 'number' && row.totalSpent > 0) {
    return Math.round(row.totalSpent * currencyOffset(row.currency));
  }

  if (row.spend != null && row.spend > 0) {
    return Math.round(row.spend * currencyOffset(row.currency));
  }

  const billing = row.billingAmountMinor ?? row.balanceMinor;
  if (billing != null && billing > 0) return billing;

  if (minor === 0) return 0;
  return minor ?? undefined;
}
