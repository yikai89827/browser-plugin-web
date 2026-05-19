import { fbControlLog } from '../../fbControlLog';

const FRANKFURTER = 'https://api.frankfurter.app/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { rate: number; at: number };

const rateCache = new Map<string, CacheEntry>();

function cacheKey(from: string, to: string): string {
  return `${from.toUpperCase()}_${to.toUpperCase()}`;
}

/**
 * 拉取汇率：1 `from` = ? `to`（Frankfurter 免费 API，由扩展 background 调用）。
 */
export async function fetchExchangeRate(from: string, to: string): Promise<number> {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!f || !t) throw new Error('币种代码无效');
  if (f === t) return 1;

  const key = cacheKey(f, t);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rate;

  const url = `${FRANKFURTER}?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
  fbControlLog('fb:fx', 'request', { from: f, to: t });
  const res = await fetch(url);
  const json = (await res.json()) as { rates?: Record<string, number>; message?: string };
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`);
  }
  const rate = json.rates?.[t];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`未获取到 ${f}→${t} 汇率`);
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
