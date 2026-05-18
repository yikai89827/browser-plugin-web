/**
 * 在扩展 Service Worker 中调用：与 fbspider 类似，用 Comet「format=json」引导页 + /api/graphql
 * 解析个人主页数字 uid（依赖浏览器已登录 facebook.com 的 Cookie，不打开可见标签）。
 */

import { browser } from 'wxt/browser';
import { fbControlLog, fbControlWarn } from '../fbControlLog';
import { extractFacebookProfileOwnerNumericIdFromHtml, extractVanityFromFacebookProfileUrl } from './extractFacebookProfileOwnerId';
import { buildProfileCometTimelineFeedRefetchVariables } from './profileCometTimelineFeedRefetchVariables';

const DEFAULT_PROFILE_TIMELINE_DOC_ID = '8746866475413837';

function stripJsonHijackPrefix(text: string): string {
  const t = text.trim();
  return t.startsWith('for (;;);') ? t.slice('for (;;);'.length).trim() : t;
}

/** 与 DevTools 中一致的 Comet JSON 查询串 */
export function buildFacebookProfileBootstrapUrl(profileUrl: string): string {
  const u = new URL(profileUrl.trim());
  u.hash = '';
  const h = u.hostname.toLowerCase();
  if (h === 'm.facebook.com' || h === 'mbasic.facebook.com') u.hostname = 'www.facebook.com';
  u.protocol = 'https:';
  u.searchParams.set('format', 'json');
  u.searchParams.set('pretty', '0');
  u.searchParams.set('suppress_http_code', '1');
  u.searchParams.set('transport', 'cors');
  u.searchParams.set('locale', 'en_US');
  return u.toString();
}

export function buildFacebookGraphqlApiUrl(): string {
  const u = new URL('https://www.facebook.com/api/graphql/');
  u.searchParams.set('format', 'json');
  u.searchParams.set('pretty', '0');
  u.searchParams.set('suppress_http_code', '1');
  u.searchParams.set('transport', 'cors');
  u.searchParams.set('locale', 'en_US');
  return u.toString();
}

function unwrapBootstrapPayloadToHtml(raw: string): string {
  const s = stripJsonHijackPrefix(raw);
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    if (typeof j.payload === 'string') return j.payload;
    if (typeof j.body === 'string') return j.body;
    const p = j.payload as { body?: string } | undefined;
    if (p && typeof p.body === 'string') return p.body;
  } catch {
    /* 整段即 HTML */
  }
  return s;
}

function extractFbDtsg(html: string): string | null {
  const patterns = [
    /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
    /name="fb_dtsg" value="([^"]+)"/,
    /"name":"fb_dtsg","value":"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractLsd(html: string): string | null {
  const patterns = [
    /"LSD",\[\],\{"token":"([^"]+)"/,
    /name="lsd" value="([^"]+)"/,
    /"name":"lsd","value":"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractJazoest(html: string): string | null {
  const m = html.match(/name="jazoest" value="(\d+)"/) || html.match(/"jazoest",\[\],\{"value":"(\d+)"/);
  return m?.[1] ?? null;
}

function extractRev(html: string): string | null {
  const m = html.match(/"__rev":(\d{6,})/) || html.match(/"client_revision":(\d{6,})/);
  return m?.[1] ?? null;
}

function extractDocIdNearFriendlyName(html: string, friendlyName: string): string | null {
  const idx = html.indexOf(friendlyName);
  if (idx === -1) return null;
  const slice = html.slice(Math.max(0, idx - 1200), idx + 1500);
  const m = slice.match(/"doc_id"\s*:\s*"(\d{10,})"/);
  return m?.[1] ?? null;
}

async function getFacebookCUserCookie(): Promise<string | null> {
  for (const url of ['https://www.facebook.com/', 'https://facebook.com/']) {
    try {
      const c = await browser.cookies.get({ url, name: 'c_user' });
      if (c?.value && /^\d+$/.test(c.value)) return c.value;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function logGraphqlCometFailure(text: string): void {
  const s = stripJsonHijackPrefix(text);
  try {
    const j = JSON.parse(s) as {
      data?: { node?: unknown };
      errors?: unknown;
      error?: number;
      errorSummary?: string;
      errorDescription?: string;
      payload?: unknown;
    };
    if (j.error != null) {
      fbControlWarn('fb:comet-profile', 'graphql comet envelope error', {
        error: j.error,
        errorSummary: j.errorSummary,
        errorDescription: j.errorDescription,
        payloadNull: j.payload == null,
      });
    }
    if (Array.isArray(j.errors) && j.errors.length) {
      fbControlWarn('fb:comet-profile', 'graphql errors array', { errors: j.errors });
    }
    if (j.data && j.data.node == null && !j.errors) {
      fbControlWarn('fb:comet-profile', 'graphql data.node is null');
    }
  } catch {
    /* ignore parse */
  }
}

function parseUserNodeIdFromGraphqlPayload(text: string): string | null {
  const s = stripJsonHijackPrefix(text);
  try {
    const j = JSON.parse(s) as {
      data?: { node?: { __typename?: string; id?: string } };
      errors?: unknown;
      error?: number;
    };
    if (j.errors) return null;
    if (j.error != null) return null;
    const node = j.data?.node;
    if (node?.__typename === 'User' && node.id && /^\d{10,}$/.test(node.id)) return node.id;
  } catch {
    return null;
  }
  return null;
}

function buildTimelineRefetchFormBody(opts: {
  viewerId: string;
  fbDtsg: string;
  lsd: string;
  jazoest: string | null;
  rev: string | null;
  docId: string;
  variables: Record<string, unknown>;
}): string {
  const fd = new URLSearchParams();
  fd.set('__aaid', '0');
  fd.set('av', opts.viewerId);
  fd.set('__user', opts.viewerId);
  fd.set('__a', '1');
  fd.set('__req', 'h');
  fd.set('__hs', '0');
  fd.set('dpr', '2');
  fd.set('__ccg', 'EXCELLENT');
  fd.set('__rev', opts.rev || '0');
  fd.set('__s', '');
  fd.set('__hsi', '');
  fd.set('__dyn', '');
  fd.set('__csr', '');
  fd.set('__comet_req', '1');
  fd.set('fb_dtsg', opts.fbDtsg);
  if (opts.jazoest) fd.set('jazoest', opts.jazoest);
  fd.set('lsd', opts.lsd);
  fd.set('server_timestamps', 'true');
  fd.set('fb_api_caller_class', 'RelayModern');
  fd.set('fb_api_req_friendly_name', 'ProfileCometTimelineFeedRefetchQuery');
  fd.set('variables', JSON.stringify(opts.variables));
  fd.set('doc_id', opts.docId);
  return fd.toString();
}

/**
 * 使用 www.facebook.com 的 Comet JSON 引导请求 + ProfileCometTimelineFeedRefetchQuery 解析数字 uid。
 */
export async function resolveFacebookProfileNumericIdViaCometApi(profileUrl: string): Promise<string | null> {
  const bootstrapUrl = buildFacebookProfileBootstrapUrl(profileUrl);
  const profilePageReferer = (() => {
    const u = new URL(profileUrl.trim());
    u.hash = '';
    const h = u.hostname.toLowerCase();
    if (h === 'm.facebook.com' || h === 'mbasic.facebook.com') u.hostname = 'www.facebook.com';
    u.protocol = 'https:';
    u.search = '';
    return u.toString();
  })();

  fbControlLog('fb:comet-profile', 'bootstrap GET', { url: bootstrapUrl.slice(0, 120) });

  const res1 = await fetch(bootstrapUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.facebook.com/',
    },
  });

  const raw1 = await res1.text();
  const html = unwrapBootstrapPayloadToHtml(raw1);

  const viewerId = await getFacebookCUserCookie();
  const excludeViewer = viewerId ? [viewerId] : undefined;
  const early = extractFacebookProfileOwnerNumericIdFromHtml(html, profileUrl, excludeViewer);
  if (early) {
    fbControlLog('fb:comet-profile', 'id from bootstrap html', { id: early });
    return early;
  }

  const fbDtsg = extractFbDtsg(html);
  const lsd = extractLsd(html);
  const jazoest = extractJazoest(html);
  const rev = extractRev(html);

  if (!fbDtsg || !lsd || !viewerId) {
    fbControlWarn('fb:comet-profile', 'missing tokens or c_user cookie', {
      hasDtsg: !!fbDtsg,
      hasLsd: !!lsd,
      hasViewer: !!viewerId,
    });
    return null;
  }

  const docId =
    extractDocIdNearFriendlyName(html, 'ProfileCometTimelineFeedRefetchQuery') || DEFAULT_PROFILE_TIMELINE_DOC_ID;

  const vanity = extractVanityFromFacebookProfileUrl(profileUrl);
  let profileKey: string | null = vanity;
  if (!profileKey) {
    try {
      const u = new URL(profileUrl);
      const id = u.searchParams.get('id');
      if (id && /^\d{5,}$/.test(id)) profileKey = id;
    } catch {
      profileKey = null;
    }
  }
  if (!profileKey) {
    fbControlWarn('fb:comet-profile', '无法从 URL 得到 vanity 或数字 id', { profileUrl });
    return null;
  }

  const variableAttempts: Record<string, unknown>[] = [
    buildProfileCometTimelineFeedRefetchVariables(profileKey),
    { id: profileKey, scale: 2, feedLocation: 'TIMELINE', renderLocation: 'timeline', useDefaultActor: false },
    { id: profileKey, scale: 1, feedLocation: 'TIMELINE' },
    { id: profileKey, scale: 1 },
  ];

  const graphqlUrl = buildFacebookGraphqlApiUrl();

  let lastHead = '';
  for (const variables of variableAttempts) {
    const body = buildTimelineRefetchFormBody({
      viewerId,
      fbDtsg,
      lsd,
      jazoest,
      rev,
      docId,
      variables,
    });

    const res2 = await fetch(graphqlUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
        Referer: profilePageReferer,
        Origin: 'https://www.facebook.com',
        'X-ASBD-ID': '129477',
        'X-FB-LSD': lsd,
        'X-FB-Friendly-Name': 'ProfileCometTimelineFeedRefetchQuery',
      },
      body,
    });

    const text2 = await res2.text();
    lastHead = text2.slice(0, 200);
    const parsed = parseUserNodeIdFromGraphqlPayload(text2);
    if (parsed) {
      fbControlLog('fb:comet-profile', 'id from graphql', { id: parsed });
      return parsed;
    }
    logGraphqlCometFailure(text2);
  }

  fbControlWarn('fb:comet-profile', 'graphql 未返回 User.node', { lastHead });
  return null;
}
