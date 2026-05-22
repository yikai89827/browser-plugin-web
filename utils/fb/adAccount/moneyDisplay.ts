import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { effectiveUsdToAccountRate } from '../adsPanel/currencyExchange';
import { currencyOffset } from './spendCapCurrency';

export type MoneyDisplay = {
  primary: string;
  /** 非 USD 账户时附带的 USD 折算（与主站表格蓝字副行一致） */
  secondary?: string;
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: '¥',
  HKD: 'HK$',
  PKR: 'Rs',
  TWD: 'NT$',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  INR: '₹',
};

function currencySymbol(code?: string): string {
  const c = (code || 'USD').trim().toUpperCase();
  return CURRENCY_SYMBOL[c] || `${c} `;
}

export function formatMinorAmount(minor: number, currency?: string): string {
  const sym = currencySymbol(currency);
  const offset = currencyOffset(currency);
  const major = minor / offset;
  return (
    sym +
    major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function formatMajorAmount(n: number, currency?: string): string {
  const sym = currencySymbol(currency);
  return (
    sym +
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** 1 USD = ? 账户币种（用于展示折算） */
export function usdMajorFromAccountMinor(
  minor: number,
  accountCurrency: string,
  usdToAccountRate: number
): number {
  const ccy = accountCurrency.trim().toUpperCase();
  const majorAcct = minor / currencyOffset(ccy);
  if (ccy === 'USD') return majorAcct;
  const rate = effectiveUsdToAccountRate(usdToAccountRate);
  if (rate == null) return majorAcct;
  return majorAcct / rate;
}

/**
 * 金额展示：原币种一行；非 USD 且提供汇率时追加 USD 副行。
 */
export function formatMoneyDualFromMinor(
  minor: number | null | undefined,
  row: FbAdAccountRecord,
  usdToAccountRate: number | null | undefined,
  opts?: { unlimitedZero?: boolean }
): MoneyDisplay {
  if (minor == null || Number.isNaN(minor)) return { primary: '—' };
  if (opts?.unlimitedZero && minor === 0) return { primary: '不限额' };

  const ccy = (row.currency || 'USD').trim().toUpperCase();
  const primary = formatMinorAmount(minor, ccy);
  if (ccy === 'USD') return { primary };

  const rate = effectiveUsdToAccountRate(usdToAccountRate);
  if (rate == null) return { primary };

  const usdMajor = usdMajorFromAccountMinor(minor, ccy, rate);
  return { primary, secondary: formatMajorAmount(usdMajor, 'USD') };
}
