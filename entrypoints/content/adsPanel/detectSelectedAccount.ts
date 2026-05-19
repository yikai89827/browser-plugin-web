import { extractNumericAccountId } from '../../../utils/fb/adAccount/mapGraphAdAccount';
import { fbControlLog } from '../../../utils/fbControlLog';

/** 广告管理 / 广告报表页（需展示悬浮数据窗） */
export function isAdsPanelTargetPage(): boolean {
  const href = window.location.href;
  const host = window.location.hostname;
  if (!host.includes('facebook.com')) return false;
  return (
    href.includes('adsmanager') ||
    href.includes('/ads/reporting') ||
    href.includes('ads_reporting') ||
    href.includes('/reporting/') ||
    href.includes('/adsmanager/')
  );
}

function parseActFromUrl(url: URL): string | null {
  for (const key of ['act', 'account_id', 'selected_account_id', 'ad_account_id']) {
    const v = url.searchParams.get(key);
    if (v) {
      const id = extractNumericAccountId(v) || v.replace(/^act_/i, '').trim();
      if (/^\d{10,}$/.test(id)) return id;
    }
  }
  const hash = url.hash || '';
  const hashAct = hash.match(/[?&]act=(\d{10,})/i);
  if (hashAct) return hashAct[1];
  const pathAct = url.pathname.match(/act_(\d{10,})/i);
  if (pathAct) return pathAct[1];
  return null;
}

function extractAdsManagerContext(): Record<string, unknown> | null {
  try {
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].textContent;
      if (!content?.includes('adsManagerContext')) continue;
      const match = content.match(/adsManagerContext\s*=\s*({[\s\S]+?});/);
      if (match) return JSON.parse(match[1]) as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function idFromContext(ctx: Record<string, unknown>): string | null {
  const candidates = [
    ctx.selected_account_id,
    ctx.account_id,
    ctx.act,
    (ctx.account as { account_id?: string })?.account_id,
    (ctx.currentAccount as { account_id?: string })?.account_id,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const id = extractNumericAccountId(String(c)) || String(c).replace(/^act_/i, '').trim();
    if (/^\d{10,}$/.test(id)) return id;
  }
  return null;
}

function idFromDom(): string | null {
  const selectors = [
    '[data-testid="account-selector"] [aria-selected="true"]',
    '[data-testid="account-selector"] [aria-current="true"]',
    '[data-testid="ad-account-selector"] [aria-selected="true"]',
    'a[href*="act="][aria-current="page"]',
    'a[href*="act="][aria-selected="true"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const href = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
    const text = el.textContent || '';
    const id = extractNumericAccountId(href) || extractNumericAccountId(text);
    if (id) return id;
  }
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="act="]');
  for (const a of links) {
    if (a.getAttribute('aria-selected') === 'true' || a.getAttribute('aria-current') === 'page') {
      const id = extractNumericAccountId(a.href);
      if (id) return id;
    }
  }
  return null;
}

/** 解析当前页面选中的广告账户数字 ID */
export function detectSelectedAccountId(): string | null {
  const fromUrl = parseActFromUrl(new URL(window.location.href));
  if (fromUrl) return fromUrl;

  const ctx = extractAdsManagerContext();
  if (ctx) {
    const fromCtx = idFromContext(ctx);
    if (fromCtx) return fromCtx;
  }

  const fromDom = idFromDom();
  if (fromDom) return fromDom;

  return null;
}

/** 监听 SPA 路由与账户切换 */
export function watchSelectedAccount(onChange: (accountId: string | null) => void): () => void {
  let last: string | null = detectSelectedAccountId();
  const tick = () => {
    const next = detectSelectedAccountId();
    if (next !== last) {
      last = next;
      fbControlLog('content:ads-panel', '选中账户变化', { accountId: next });
      onChange(next);
    }
  };

  const interval = window.setInterval(tick, 1200);

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    tick();
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    tick();
  };
  window.addEventListener('popstate', tick);

  const mo = new MutationObserver(() => tick());
  mo.observe(document.body, { childList: true, subtree: true });

  return () => {
    clearInterval(interval);
    mo.disconnect();
    window.removeEventListener('popstate', tick);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

