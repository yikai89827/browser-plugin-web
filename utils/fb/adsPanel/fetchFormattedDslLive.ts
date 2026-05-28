import { fbControlLog } from '../../fbControlLog';
import {
  extractUsdToAccountRateFromRatioResponseText,
} from './metaAccountCurrencyRatio';
import {
  extractFormattedDslFromPage,
  extractFormattedDslFromResponseText,
} from './metaFormattedDsl';

export type MetaAccountBillingSnapshot = {
  formattedDsl: string | null;
  usdToAccountRate: number | null;
};

function pageHtml(): string {
  return document.documentElement?.innerHTML ?? '';
}

function extractFbDtsg(html: string): string | null {
  for (const re of [
    /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
    /name="fb_dtsg" value="([^"]+)"/,
    /"name":"fb_dtsg","value":"([^"]+)"/,
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractLsd(html: string): string | null {
  for (const re of [
    /"LSD",\[\],\{"token":"([^"]+)"/,
    /name="lsd" value="([^"]+)"/,
    /"name":"lsd","value":"([^"]+)"/,
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractJazoest(html: string): string | null {
  const m =
    html.match(/name="jazoest" value="(\d+)"/) ||
    html.match(/"jazoest",\[\],\{"value":"(\d+)"/);
  return m?.[1] ?? null;
}

function extractRev(html: string): string | null {
  const m = html.match(/"__rev":(\d{6,})/) || html.match(/"client_revision":(\d{6,})/);
  return m?.[1] ?? null;
}

function extractCUser(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)c_user=(\d+)/);
  return m?.[1] ?? null;
}

function extractDocIdNearFriendlyName(html: string, friendlyName: string): string | null {
  const idx = html.indexOf(friendlyName);
  if (idx === -1) return null;
  const slice = html.slice(Math.max(0, idx - 1500), idx + 1500);
  const m = slice.match(/"doc_id"\s*:\s*"(\d{10,})"/);
  return m?.[1] ?? null;
}

function findBillingGraphqlDocId(html: string): string | null {
  const hints = [
    'formatted_dsl',
    'BillingAccount',
    'BillingHub',
    'AdAccountBilling',
    'BillingSpend',
    'BillingPayment',
    'AdsPayments',
    'BillingDecal',
  ];
  for (const h of hints) {
    const id = extractDocIdNearFriendlyName(html, h);
    if (id) return id;
  }
  const nearAsset = html.match(/assetID[\s\S]{0,2500}?"doc_id"\s*:\s*"(\d{10,})"/i);
  if (nearAsset?.[1]) return nearAsset[1];
  return null;
}

function buildGraphqlPostBody(accountId: string, html: string): URLSearchParams | null {
  const fb_dtsg = extractFbDtsg(html);
  const lsd = extractLsd(html);
  const c_user = extractCUser();
  if (!fb_dtsg || !lsd || !c_user) return null;

  const doc_id = findBillingGraphqlDocId(html);
  const variables = JSON.stringify({ assetID: accountId });

  const body = new URLSearchParams();
  body.set('fb_dtsg', fb_dtsg);
  body.set('lsd', lsd);
  body.set('jazoest', extractJazoest(html) ?? '2');
  const rev = extractRev(html);
  if (rev) body.set('__rev', rev);
  body.set('__a', '1');
  body.set('__user', c_user);
  body.set('variables', variables);
  if (doc_id) {
    body.set('doc_id', doc_id);
    body.set('fb_api_caller_class', 'RelayModern');
    body.set('fb_api_req_friendly_name', 'BillingAccountDataQuery');
  }
  return body;
}

async function postGraphqlForBilling(
  accountId: string,
  html: string
): Promise<MetaAccountBillingSnapshot> {
  const empty: MetaAccountBillingSnapshot = { formattedDsl: null, usdToAccountRate: null };
  const body = buildGraphqlPostBody(accountId, html);
  if (!body) return empty;

  const origin = `${location.protocol}//${location.hostname}`;
  const paths = [
    '/api/graphql/',
    '/api/graphql/?_callFlowletID=1',
    '/api/graphql?hc=1',
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-FB-Friendly-Name': 'BillingAccountDataQuery',
        },
        body,
      });
      const text = await res.text();
      const snap = parseBillingFieldsFromText(text, accountId);
      if (snap.formattedDsl || snap.usdToAccountRate != null) {
        fbControlLog('content:formatted-dsl', 'GraphQL 拉取计费字段成功', {
          accountId,
          path,
          hasDsl: Boolean(snap.formattedDsl),
          fxRate: snap.usdToAccountRate,
        });
        return snap;
      }
    } catch (e) {
      fbControlLog('content:formatted-dsl', 'GraphQL 请求失败', {
        accountId,
        path,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return empty;
}

async function postGraphqlForDsl(accountId: string, html: string): Promise<string | null> {
  const snap = await postGraphqlForBilling(accountId, html);
  return snap.formattedDsl;
}

function parseBillingFieldsFromText(
  text: string,
  accountId: string
): MetaAccountBillingSnapshot {
  return {
    formattedDsl: extractFormattedDslFromResponseText(text, accountId),
    usdToAccountRate: extractUsdToAccountRateFromRatioResponseText(text, accountId),
  };
}

/**
 * 每次展开悬浮窗时拉取最新计费字段（formatted_dsl、account_currency_ratio_to_usd）。
 */
export async function fetchMetaAccountBillingLatest(
  accountId: string
): Promise<MetaAccountBillingSnapshot> {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id)) {
    return { formattedDsl: null, usdToAccountRate: null };
  }

  const html = pageHtml();
  const fromNetwork = await postGraphqlForBilling(id, html);
  if (fromNetwork.formattedDsl || fromNetwork.usdToAccountRate != null) {
    return fromNetwork;
  }

  return {
    formattedDsl: extractFormattedDslFromPage(id),
    usdToAccountRate: extractUsdToAccountRateFromRatioResponseText(html, id),
  };
}

/**
 * 每次展开悬浮窗时拉取最新 `formatted_dsl`（参考 fbspider：POST /api/graphql + assetID）。
 * 先走网络，再回退当前页脚本解析。
 */
export async function fetchFormattedDslLatest(accountId: string): Promise<string | null> {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id)) return null;

  const html = pageHtml();
  const fromNetwork = await postGraphqlForDsl(id, html);
  if (fromNetwork) return fromNetwork;

  const fromPage = extractFormattedDslFromPage(id);
  if (fromPage) {
    fbControlLog('content:formatted-dsl', '从页面脚本解析临时限额', { accountId: id });
    return fromPage;
  }

  return null;
}
