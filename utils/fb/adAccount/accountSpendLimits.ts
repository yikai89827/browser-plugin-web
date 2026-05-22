import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { effectiveUsdToAccountRate } from '../adsPanel/currencyExchange';
import { currencyOffset } from './spendCapCurrency';

export function isPrepayAccount(row: FbAdAccountRecord): boolean {
  const t = (row.accountType || '').trim();
  return t === '预付' || /^prepaid$/i.test(t);
}

/** 表格「门槛」：预付无付款门槛固定 0；后付费用 Graph 实际值 */
export function resolvePaymentThresholdMinor(row: FbAdAccountRecord): number | null | undefined {
  if (isPrepayAccount(row)) return 0;
  return row.paymentThresholdMinor;
}

/** Meta 新户常见账户级「每日花费限额」约 $50（USD 美分） */
export const META_DEFAULT_DAILY_SPEND_LIMIT_USD_MINOR = 5000;

/** 账户最小单位 → USD 美分 */
export function accountMinorToUsdMinor(
  accountMinor: number,
  currency: string,
  usdToAccountRate: number
): number {
  const ccy = currency.trim().toUpperCase();
  const majorAcct = accountMinor / currencyOffset(ccy);
  if (ccy === 'USD') return Math.round(majorAcct * 100);
  const rate = effectiveUsdToAccountRate(usdToAccountRate);
  if (rate == null) return 0;
  return Math.round((majorAcct / rate) * 100);
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
  const rate = effectiveUsdToAccountRate(usdToAccountRate);
  if (rate == null) return Math.round(majorUsd * currencyOffset(ccy));
  return Math.round(majorUsd * rate * currencyOffset(ccy));
}

/**
 * 表格「日限额」：Graph `min_daily_budget` 常为投放最低日预算（约 $1），
 * 低于 Meta 默认账户日花费上限（约 $50）时，非 USD 账户按 $50 等值展示。
 */
export function resolveDailySpendLimitMinor(
  row: FbAdAccountRecord,
  usdToAccountRate?: number | null
): number | null | undefined {
  const raw = row.minDailyBudgetMinor;
  if (raw == null || raw === 0) return raw;

  const ccy = (row.currency || 'USD').trim().toUpperCase();
  if (ccy === 'USD') return raw;

  const rate = effectiveUsdToAccountRate(usdToAccountRate);
  if (rate == null) return raw;

  const usdMinor = accountMinorToUsdMinor(raw, ccy, rate);
  if (usdMinor > 0 && usdMinor < META_DEFAULT_DAILY_SPEND_LIMIT_USD_MINOR) {
    return usdMinorToAccountMinor(META_DEFAULT_DAILY_SPEND_LIMIT_USD_MINOR, ccy, rate);
  }
  return raw;
}
