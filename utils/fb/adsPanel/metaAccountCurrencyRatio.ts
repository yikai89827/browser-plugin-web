import { fbControlLog } from '../../fbControlLog';

const RATIO_FIELD_RE =
  /"account_currency_ratio_to_usd"\s*:\s*([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/g;

/**
 * 将 Meta `account_currency_ratio_to_usd` 转为「1 USD = ? 账户币种」。
 * 参考 fbspider：大屏展示为 ratio.toFixed(2) + 币种（如 279.77 PKR）；值通常 > 1。
 * 若返回极小正数（如 0.00358），按「1 本币 = ratio USD」取倒数。
 */
export function accountCurrencyRatioToUsdToRate(ratio: number): number | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio >= 1) return ratio;
  if (ratio < 0.0001) return null;
  return 1 / ratio;
}

function extractRatioNearAccountId(text: string, accountId: string): number | null {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id)) return null;
  const patterns = [
    new RegExp(
      `"account_id"\\s*:\\s*"${id}"[\\s\\S]{0,12000}?"account_currency_ratio_to_usd"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`,
      'i'
    ),
    new RegExp(
      `"account_currency_ratio_to_usd"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)[\\s\\S]{0,12000}?"account_id"\\s*:\\s*"${id}"`,
      'i'
    ),
    new RegExp(
      `"assetID"\\s*:\\s*"${id}"[\\s\\S]{0,12000}?"account_currency_ratio_to_usd"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      const rate = accountCurrencyRatioToUsdToRate(n);
      if (rate != null) return rate;
    }
  }
  return null;
}

function parseRatioRaw(raw: string): number | null {
  const n = parseFloat(raw);
  return accountCurrencyRatioToUsdToRate(n);
}

/** 从 Ads Manager 页面脚本 / HTML 解析 account_currency_ratio_to_usd（与 fbspider 同源） */
export function extractUsdToAccountRateFromAccountRatio(
  targetCurrency: string,
  accountId?: string
): number | null {
  const ccy = targetCurrency.trim().toUpperCase();
  if (!ccy || ccy === 'USD') return 1;

  const id = accountId?.replace(/^act_/i, '').trim();
  if (id) {
    const html = document.documentElement?.innerHTML;
    if (html) {
      const near = extractRatioNearAccountId(html, id);
      if (near != null) return near;
    }
  }

  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].textContent;
    if (!content?.includes('account_currency_ratio_to_usd')) continue;
    if (id) {
      const near = extractRatioNearAccountId(content, id);
      if (near != null) return near;
    }
    RATIO_FIELD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RATIO_FIELD_RE.exec(content))) {
      const rate = parseRatioRaw(m[1]);
      if (rate != null && isPlausibleUsdToCurrencyRate(ccy, rate)) return rate;
    }
  }

  fbControlLog('fb:fx', '页面未解析到 account_currency_ratio_to_usd', {
    currency: ccy,
    accountId: id || null,
  });
  return null;
}

export function extractUsdToAccountRateFromRatioResponseText(
  text: string,
  accountId?: string,
  currency?: string
): number | null {
  if (!text.includes('account_currency_ratio_to_usd')) return null;
  const ccy = currency?.trim().toUpperCase();
  if (accountId) {
    const near = extractRatioNearAccountId(text, accountId);
    if (near != null) return near;
  }
  const m = text.match(/"account_currency_ratio_to_usd"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
  if (m?.[1]) {
    const rate = parseRatioRaw(m[1]);
    if (rate != null && (!ccy || isPlausibleUsdToCurrencyRate(ccy, rate))) return rate;
  }
  return null;
}

function isPlausibleUsdToCurrencyRate(currency: string, rate: number): boolean {
  if (currency === 'USD') return rate === 1;
  const major = new Set([
    'CNY',
    'HKD',
    'TWD',
    'INR',
    'JPY',
    'KRW',
    'THB',
    'PHP',
    'IDR',
    'VND',
    'PKR',
    'BDT',
    'EUR',
    'GBP',
    'AUD',
    'CAD',
    'SGD',
    'MYR',
  ]);
  if (major.has(currency)) return rate >= 0.5;
  return rate >= 0.01 && rate < 1_000_000;
}
