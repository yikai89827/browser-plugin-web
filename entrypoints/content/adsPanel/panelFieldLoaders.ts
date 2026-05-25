import { browser } from 'wxt/browser';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import type { PanelFieldKey } from '../../../utils/fb/adsPanel/adAccountPanelDisplay';
import {
  fxRateSourceLabel,
  roundFxRate,
  type FxRateSource,
} from '../../../utils/fb/adsPanel/currencyExchange';
import { extractUsdToCurrencyRateFromPage } from '../../../utils/fb/adsPanel/metaPageFxRate';
import { sanitizeAdAccountRecordForDisplay } from '../../../utils/fb/adAccount/adAccountDisplayMaps';
import { fbControlLog } from '../../../utils/fbControlLog';

const corePromises = new Map<string, Promise<FbAdAccountRecord | null>>();

function hintBmIds(row: FbAdAccountRecord): string[] {
  return [row.belongsToBmId, row.createdFromBmId].filter(
    (id): id is string => typeof id === 'string' && /^\d{5,}$/.test(id.trim())
  );
}

export function resetPanelLoadCache(accountId?: string): void {
  if (accountId) {
    for (const k of [...corePromises.keys()]) {
      if (k.startsWith(`${accountId}:`)) corePromises.delete(k);
    }
    return;
  }
  corePromises.clear();
}

/** ??????????? Graph ?? */
export async function ensureCoreRecord(
  accountId: string,
  autoFetchFromGraph: boolean
): Promise<FbAdAccountRecord | null> {
  const cacheKey = `${accountId}:${autoFetchFromGraph ? '1' : '0'}`;
  const existing = corePromises.get(cacheKey);
  if (existing) return existing;

  const p = (async () => {
    const cached = (await browser.runtime.sendMessage({
      action: 'FB_CONTROL_GET_ACCOUNT',
      data: { accountId },
    })) as { success?: boolean; payload?: { account?: FbAdAccountRecord | null } };

    let account = cached.success ? (cached.payload?.account ?? null) : null;
    if (!account && autoFetchFromGraph) {
      const synced = (await browser.runtime.sendMessage({
        action: 'FB_CONTROL_SYNC_AD_ACCOUNT_FROM_GRAPH',
        data: { accountId },
      })) as { success?: boolean; payload?: { account?: FbAdAccountRecord } };
      if (synced.success) account = synced.payload?.account ?? null;
    }
    return account ? sanitizeAdAccountRecordForDisplay(account) : null;
  })();

  corePromises.set(cacheKey, p);
  return p;
}

export async function fetchUsdToAccountRate(currency: string): Promise<number> {
  const ccy = currency.trim().toUpperCase();
  if (ccy === 'USD') return 1;
  const pageRate = extractUsdToCurrencyRateFromPage(ccy);
  fbControlLog('content:fx', '页面解析 usd_exchange_inverse', {
    currency: ccy,
    pageRate: pageRate ?? null,
    pageHit: pageRate != null,
  });
  const res = (await browser.runtime.sendMessage({
    action: 'FB_CONTROL_GET_USD_EXCHANGE_RATE',
    data: {
      currency: ccy,
      ...(pageRate != null ? { pageUsdToCurrencyRate: pageRate } : {}),
    },
  })) as {
    success?: boolean;
    error?: string;
    payload?: { rate?: number; source?: FxRateSource; effectiveRate?: number };
  };
  if (!res?.success || res.payload?.rate == null) {
    throw new Error(res?.error || '汇率获取失败');
  }
  const source = res.payload.source ?? (pageRate != null ? 'meta-page' : 'er-api');
  const raw = res.payload.rate;
  fbControlLog('content:fx', '汇率已就绪（悬浮窗）', {
    currency: ccy,
    source,
    sourceLabel: fxRateSourceLabel(source),
    rawRate: raw,
    effectiveRate: res.payload.effectiveRate ?? roundFxRate(raw),
  });
  if (raw != null && Number.isFinite(raw) && raw > 0) {
    void browser.runtime.sendMessage({
      action: 'FB_CONTROL_CACHE_PAGE_FX_RATE',
      data: { currency: ccy, rate: pageRate ?? raw },
    });
  }
  return raw;
}

export async function fetchManageAdminCount(
  accountId: string,
  row?: FbAdAccountRecord | null
): Promise<number> {
  const res = (await browser.runtime.sendMessage({
    action: 'FB_CONTROL_FETCH_MANAGE_ADMIN_COUNT',
    data: { accountId, hintBmIds: row ? hintBmIds(row) : [] },
  })) as { success?: boolean; error?: string; payload?: { count?: number } };
  if (!res?.success) throw new Error(res?.error || '???????');
  return res.payload?.count ?? 0;
}

export async function fetchHiddenAdminCount(
  accountId: string,
  row?: FbAdAccountRecord | null
): Promise<number> {
  const res = (await browser.runtime.sendMessage({
    action: 'FB_CONTROL_FETCH_HIDDEN_ADMIN_COUNT',
    data: { accountId, hintBmIds: row ? hintBmIds(row) : [] },
  })) as { success?: boolean; error?: string; payload?: { count?: number } };
  if (!res?.success) throw new Error(res?.error || '?????????');
  return res.payload?.count ?? 0;
}

export const CORE_PANEL_FIELDS: PanelFieldKey[] = [
  'accountId',
  'status',
  'dailyLimit',
  'spendingLimit',
  'temporaryLimit',
  'threshold',
  'billingAmount',
  'totalSpent',
  'createdDate',
  'billingDate',
  'accountKind',
  'timezone',
  'accountTime',
  'paymentMethod',
  'ownerRole',
  'currency',
  'belongsToBm',
  'remark',
];

export const ASYNC_COUNT_FIELDS: PanelFieldKey[] = ['hiddenAdminCount'];
