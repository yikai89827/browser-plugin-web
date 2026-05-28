import { browser } from 'wxt/browser';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { extractFormattedDslFromPage } from '../../../utils/fb/adsPanel/metaFormattedDsl';
import { extractUsdToAccountRateFromAccountRatio } from '../../../utils/fb/adsPanel/metaAccountCurrencyRatio';
import { fetchMetaAccountBillingLatest } from '../../../utils/fb/adsPanel/fetchFormattedDslLive';
import {
  getCachedAccountFxRate,
  getCachedFormattedDsl,
  setCachedAccountFxRate,
  setCachedFormattedDsl,
} from './formattedDslCapture';

/**
 * 本地缓存 / 页面脚本快速补全（首屏，可能略旧）。
 */
export async function enrichRecordWithFormattedDsl(
  account: FbAdAccountRecord | null,
  accountId: string
): Promise<FbAdAccountRecord | null> {
  if (!account) return null;
  const id = accountId.replace(/^act_/i, '').trim();

  const dsl =
    account.formattedDsl?.trim() ||
    getCachedFormattedDsl(id) ||
    extractFormattedDslFromPage(id);
  if (!dsl) return account;

  return { ...account, formattedDsl: dsl };
}

export type MetaBillingRefreshResult = {
  account: FbAdAccountRecord;
  usdToAccountRate: number | null;
};

/**
 * 展开悬浮窗时异步拉取 Meta 计费字段：formatted_dsl、account_currency_ratio_to_usd（汇率）。
 */
export async function refreshMetaBillingOnPanelOpen(
  account: FbAdAccountRecord,
  accountId: string
): Promise<MetaBillingRefreshResult> {
  const id = accountId.replace(/^act_/i, '').trim();
  const ccy = (account.currency || 'USD').trim().toUpperCase();

  const snap = await fetchMetaAccountBillingLatest(id);
  let next = { ...account };
  if (snap.formattedDsl) {
    setCachedFormattedDsl(id, snap.formattedDsl);
    next = { ...next, formattedDsl: snap.formattedDsl };
  }

  let usdToAccountRate =
    snap.usdToAccountRate ??
    getCachedAccountFxRate(id) ??
    extractUsdToAccountRateFromAccountRatio(ccy, id);

  if (usdToAccountRate != null && usdToAccountRate > 0) {
    setCachedAccountFxRate(id, usdToAccountRate);
    next = { ...next, accountCurrencyRatioToUsd: usdToAccountRate };
    void browser.runtime
      .sendMessage({
        action: 'FB_CONTROL_CACHE_ACCOUNT_FX_RATE',
        data: { accountId: id, rate: usdToAccountRate, currency: ccy },
      })
      .catch(() => undefined);
  }

  if (snap.formattedDsl || usdToAccountRate != null) {
    void browser.runtime
      .sendMessage({
        action: 'FB_CONTROL_MERGE_ACCOUNT',
        data: {
          accountId: id,
          ...(snap.formattedDsl ? { formattedDsl: snap.formattedDsl } : {}),
          ...(usdToAccountRate != null && usdToAccountRate > 0
            ? { accountCurrencyRatioToUsd: usdToAccountRate }
            : {}),
        },
      })
      .catch(() => undefined);
  }

  return { account: next, usdToAccountRate: usdToAccountRate ?? null };
}
