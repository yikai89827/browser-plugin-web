import { fbControlLog } from '../../fbControlLog';

/**
 * 从 Ads Manager 页面内嵌脚本解析 Meta `usd_exchange_inverse`（1 USD = ? 目标币种）。
 * 与后台 Graph `/me?fields=currency` 同源，适用于页面已注入汇率但用户偏好币种与账户不一致的场景。
 */
export function extractUsdToCurrencyRateFromPage(targetCurrency: string): number | null {
  const t = targetCurrency.trim().toUpperCase();
  if (!t || t === 'USD') return 1;

  let scriptsWithInverse = 0;
  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].textContent;
    if (!content?.includes('usd_exchange_inverse')) continue;
    scriptsWithInverse += 1;

    const nearCurrency = extractInverseNearUserCurrency(content, t);
    if (nearCurrency != null) return nearCurrency;

    if (content.includes(t)) {
      const global = extractFirstPlausibleInverse(content, t);
      if (global != null) return global;
    }
  }
  fbControlLog('fb:fx', '页面未解析到 usd_exchange_inverse', {
    currency: t,
    scriptsWithInverse,
    scriptCount: scripts.length,
    hint: '请确认在 adsmanager.facebook.com 且页面已完全加载',
  });
  return null;
}

function parsePositiveRate(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** `"user_currency":"CNY", ... "usd_exchange_inverse":6.84` 或逆序 */
function extractInverseNearUserCurrency(content: string, currency: string): number | null {
  const patterns = [
    new RegExp(
      `"user_currency"\\s*:\\s*"${currency}"[\\s\\S]{0,800}?"usd_exchange_inverse"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`,
      'i'
    ),
    new RegExp(
      `"usd_exchange_inverse"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)[\\s\\S]{0,800}?"user_currency"\\s*:\\s*"${currency}"`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m) {
      const r = parsePositiveRate(m[1]);
      if (r != null && isPlausibleUsdToCurrencyRate(currency, r)) return r;
    }
  }
  return null;
}

function extractFirstPlausibleInverse(content: string, currency: string): number | null {
  const re = /"usd_exchange_inverse"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const r = parsePositiveRate(m[1]);
    if (r != null && isPlausibleUsdToCurrencyRate(currency, r)) return r;
  }
  return null;
}

/** 过滤明显非「1 USD = ? 本币」的误匹配（如 usd_exchange 小数值） */
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
