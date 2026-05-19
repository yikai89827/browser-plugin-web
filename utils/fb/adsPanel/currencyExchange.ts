import { fbControlLog } from '../../fbControlLog';

const FRANKFURTER = 'https://api.frankfurter.app/latest';
const ER_API = 'https://open.er-api.com/v6/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Frankfurter（ECB）不支持的常见广告账户币种，直接走备用源 */
const FRANKFURTER_SKIP = new Set(['PKR', 'BDT', 'LKR', 'NPR', 'MMK', 'KHR', 'LAK', 'MNT']);

type CacheEntry = { rate: number; at: number };

const rateCache = new Map<string, CacheEntry>();

function cacheKey(from: string, to: string): string {
  return `${from.toUpperCase()}_${to.toUpperCase()}`;
}

async function fetchFromFrankfurter(from: string, to: string): Promise<number | null> {
  const url = `${FRANKFURTER}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  const json = (await res.json()) as { rates?: Record<string, number>; message?: string };
  if (!res.ok) return null;
  const rate = json.rates?.[to];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

/** open.er-api.com：覆盖 PKR 等 Frankfurter 未收录币种 */
async function fetchFromErApi(from: string, to: string): Promise<number> {
  const url = `${ER_API}/${encodeURIComponent(from)}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };
  if (!res.ok || json.result !== 'success') {
    throw new Error(`汇率 API 异常 HTTP ${res.status}`);
  }
  const rate = json.rates?.[to];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`未获取到 ${from}→${to} 汇率`);
  }
  return rate;
}

/**
 * 拉取汇率：1 `from` = ? `to`（扩展 background 调用；Frankfurter 优先，不支持时走 ER API）。
 */
export async function fetchExchangeRate(from: string, to: string): Promise<number> {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!f || !t) throw new Error('币种代码无效');
  if (f === t) return 1;

  const key = cacheKey(f, t);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rate;

  fbControlLog('fb:fx', 'request', { from: f, to: t });

  let rate: number | null = null;
  if (!FRANKFURTER_SKIP.has(t) && !FRANKFURTER_SKIP.has(f)) {
    try {
      rate = await fetchFromFrankfurter(f, t);
    } catch {
      rate = null;
    }
  }
  if (rate == null) {
    rate = await fetchFromErApi(f, t);
    fbControlLog('fb:fx', 'er-api fallback', { from: f, to: t, rate });
  }

  rateCache.set(key, { rate, at: Date.now() });
  return rate;
}

/** 1 USD = ? 目标币种 */
export async function fetchUsdToCurrencyRate(targetCurrency: string): Promise<number> {
  const t = targetCurrency.trim().toUpperCase();
  if (t === 'USD') return 1;
  return fetchExchangeRate('USD', t);
}
