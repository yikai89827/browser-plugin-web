import { fbControlLog } from '../../fbControlLog';
import { graphFetch } from '../graphExternalFetch';

const GRAPH_VERSION = 'v21.0';
const FRANKFURTER = 'https://api.frankfurter.app/latest';
const ER_API = 'https://open.er-api.com/v6/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Frankfurter（ECB）不支持的常见广告账户币种 */
const FRANKFURTER_SKIP = new Set(['PKR', 'BDT', 'LKR', 'NPR', 'MMK', 'KHR', 'LAK', 'MNT']);

/** 汇率数据来源（控制台过滤 `[fbControl:fb:fx]`） */
export type FxRateSource =
  | 'usd'
  | 'meta-page'
  | 'meta-graph'
  | 'er-api'
  | 'frankfurter'
  | 'cache';

export type FxRateFetchResult = {
  rate: number;
  source: FxRateSource;
  /** 参与缓存与折算的原始汇率（未 effective 两位小数） */
  rawRate: number;
};

type CacheEntry = { rate: number; source: FxRateSource; at: number };

type MetaCurrencyFields = {
  user_currency?: string;
  usd_exchange?: number;
  usd_exchange_inverse?: number;
};

const rateCache = new Map<string, CacheEntry>();

const FX_SOURCE_LABEL: Record<FxRateSource, string> = {
  usd: 'USD（无需换算）',
  'meta-page': 'Meta Ads Manager 页面 (usd_exchange_inverse)',
  'meta-graph': 'Meta Graph API (/me?fields=currency)',
  'er-api': '第三方 ER API (open.er-api.com)',
  frankfurter: '第三方 Frankfurter (ECB)',
  cache: '内存缓存（1 小时内）',
};

export function fxRateSourceLabel(source: FxRateSource): string {
  return FX_SOURCE_LABEL[source] ?? source;
}

/** 统一输出一条可读的汇率来源日志 */
export function logFxRateResolved(
  currency: string,
  result: FxRateFetchResult,
  extra?: Record<string, unknown>
): void {
  const effective = roundFxRate(result.rawRate);
  fbControlLog('fb:fx', '汇率已解析', {
    currency: currency.trim().toUpperCase(),
    source: result.source,
    sourceLabel: fxRateSourceLabel(result.source),
    rawRate: result.rawRate,
    effectiveRate: effective,
    ...extra,
  });
}

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

async function fetchMetaUsdToCurrencyRate(
  accessToken: string,
  targetCurrency: string
): Promise<number | null> {
  const t = targetCurrency.trim().toUpperCase();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=currency&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      currency?: MetaCurrencyFields;
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      fbControlLog('fb:fx', 'Meta Graph 未采用', {
        reason: 'http_or_error',
        target: t,
        error: json.error?.message,
        http: res.status,
      });
      return null;
    }
    const c = json.currency;
    if (!c) {
      fbControlLog('fb:fx', 'Meta Graph 未采用', { reason: 'no_currency_field', target: t });
      return null;
    }
    const userCcy = (c.user_currency || '').trim().toUpperCase();
    if (userCcy !== t) {
      fbControlLog('fb:fx', 'Meta Graph 未采用', {
        reason: 'user_currency_mismatch',
        userCurrency: userCcy,
        target: t,
        hint: '请将 Ads Manager 显示货币设为与广告账户相同，或依赖页面内嵌汇率',
      });
      return null;
    }
    const inv = c.usd_exchange_inverse;
    if (inv != null && Number.isFinite(inv) && inv > 0) return inv;
    const ex = c.usd_exchange;
    if (ex != null && Number.isFinite(ex) && ex > 0) return 1 / ex;
    fbControlLog('fb:fx', 'Meta Graph 未采用', { reason: 'no_exchange_fields', target: t });
  } catch (e) {
    fbControlLog('fb:fx', 'Meta Graph 未采用', {
      reason: 'exception',
      target: t,
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

function result(rate: number, source: FxRateSource): FxRateFetchResult {
  return { rate, rawRate: rate, source };
}

/**
 * 拉取汇率：1 `from` = ? `to`（扩展 background 调用）。
 * 有 access_token 时优先 Meta Graph；否则 ER API → Frankfurter（ECB）。
 */
export async function fetchExchangeRate(
  from: string,
  to: string,
  options?: { accessToken?: string | null }
): Promise<FxRateFetchResult> {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!f || !t) throw new Error('币种代码无效');
  if (f === t) {
    const r = result(1, 'usd');
    logFxRateResolved(t, r);
    return r;
  }

  const key = cacheKey(f, t);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const r = result(hit.rate, 'cache');
    logFxRateResolved(t, r, { cachedSource: hit.source, cachedAt: hit.at });
    return r;
  }

  fbControlLog('fb:fx', '开始拉取汇率', { from: f, to: t, hasToken: Boolean(options?.accessToken?.trim()) });

  let rate: number | null = null;
  let source: FxRateSource = 'er-api';

  const token = options?.accessToken?.trim();
  if (token && f === 'USD') {
    rate = await fetchMetaUsdToCurrencyRate(token, t);
    if (rate != null) source = 'meta-graph';
  }

  if (rate == null) {
    try {
      rate = await fetchFromErApi(f, t);
      source = 'er-api';
    } catch (e) {
      fbControlLog('fb:fx', 'ER API 失败', { message: e instanceof Error ? e.message : String(e) });
      rate = null;
    }
  }
  if (rate == null && !FRANKFURTER_SKIP.has(t) && !FRANKFURTER_SKIP.has(f)) {
    try {
      rate = await fetchFromFrankfurter(f, t);
      if (rate != null) source = 'frankfurter';
    } catch {
      rate = null;
    }
  }
  if (rate == null) {
    rate = await fetchFromErApi(f, t);
    source = 'er-api';
  }

  rateCache.set(key, { rate, source, at: Date.now() });
  const r = result(rate, source);
  logFxRateResolved(t, r);
  return r;
}

/** 汇率展示标签用：保留两位小数（如「1 USD = 6.84 CNY」） */
export function roundFxRate(rate: number): number {
  if (!Number.isFinite(rate)) return rate;
  return Math.round(rate * 100) / 100;
}

/** 1 USD = ? 账户币种；仅用于预览文案等，勿用于双币种金额折算 */
export function effectiveUsdToAccountRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return roundFxRate(rate);
}

/** 双币种金额折算：使用 Meta/API 原始汇率，与参考插件一致 */
export function fxRateForMoneyConversion(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

/** USD 主币展示：仅对折算结果保留两位小数 */
export function roundUsdMajor(major: number): number {
  if (!Number.isFinite(major)) return major;
  return Math.round(major * 100) / 100;
}

export type FetchUsdToCurrencyRateOptions = {
  accessToken?: string | null;
};

/** 1 USD = ? 目标币种（含来源，供日志与 API 返回） */
export async function fetchUsdToCurrencyRate(
  targetCurrency: string,
  options?: FetchUsdToCurrencyRateOptions
): Promise<FxRateFetchResult> {
  const t = targetCurrency.trim().toUpperCase();
  if (t === 'USD') return result(1, 'usd');
  return fetchExchangeRate('USD', t, options);
}

/** 页面或消息层已解析出的 Meta 汇率 */
export function fxRateResultFromPage(pageRate: number): FxRateFetchResult {
  return result(pageRate, 'meta-page');
}
