import {
  extractFormattedDslFromResponseText,
} from '../../../utils/fb/adsPanel/metaFormattedDsl';
import {
  extractUsdToAccountRateFromRatioResponseText,
} from '../../../utils/fb/adsPanel/metaAccountCurrencyRatio';

const dslCache = new Map<string, string>();
const fxCache = new Map<string, number>();

export function getCachedFormattedDsl(accountId: string): string | undefined {
  const id = accountId.replace(/^act_/i, '').trim();
  return dslCache.get(id);
}

export function getCachedAccountFxRate(accountId: string): number | undefined {
  const id = accountId.replace(/^act_/i, '').trim();
  return fxCache.get(id);
}

export function setCachedFormattedDsl(accountId: string, raw: string): void {
  rememberDsl(accountId, raw);
}

export function setCachedAccountFxRate(accountId: string, rate: number): void {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id) || !Number.isFinite(rate) || rate <= 0) return;
  fxCache.set(id, rate);
}

function rememberDsl(accountId: string, raw: string): void {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id) || !raw) return;
  dslCache.set(id, raw);
}

function ingestResponseText(text: string): void {
  const hasDsl = text.includes('formatted_dsl');
  const hasRatio = text.includes('account_currency_ratio_to_usd');
  if (!hasDsl && !hasRatio) return;

  const idRe = /"account_id"\s*:\s*"(\d{10,})"/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idRe.exec(text))) {
    const aid = idMatch[1];
    if (hasDsl) {
      const dsl = extractFormattedDslFromResponseText(text, aid);
      if (dsl) rememberDsl(aid, dsl);
    }
    if (hasRatio) {
      const rate = extractUsdToAccountRateFromRatioResponseText(text, aid);
      if (rate != null) setCachedAccountFxRate(aid, rate);
    }
  }
  if (!dslCache.size && hasDsl) {
    const dsl = extractFormattedDslFromResponseText(text);
    if (dsl) {
      const ctx = text.match(/"account_id"\s*:\s*"(\d{10,})"/);
      if (ctx?.[1]) rememberDsl(ctx[1], dsl);
    }
  }
  if (!fxCache.size && hasRatio) {
    const rate = extractUsdToAccountRateFromRatioResponseText(text);
    if (rate != null) {
      const ctx = text.match(/"account_id"\s*:\s*"(\d{10,})"/);
      if (ctx?.[1]) setCachedAccountFxRate(ctx[1], rate);
    }
  }
}

let installed = false;

/** 拦截 /api/* 响应，缓存 formatted_dsl（与 fbspider 一致） */
export function installFormattedDslCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await origFetch(...args);
    try {
      const req = args[0];
      const url =
        typeof req === 'string'
          ? req
          : req instanceof URL
            ? req.href
            : req instanceof Request
              ? req.url
              : '';
      if (/\/api\//i.test(url)) {
        void res
          .clone()
          .text()
          .then((t) => ingestResponseText(t))
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: [boolean?, string?, string?]
  ) {
    (this as XMLHttpRequest & { __fcUrl?: string }).__fcUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...sendArgs: Parameters<XMLHttpRequest['send']>) {
    this.addEventListener('load', function () {
      try {
        const u = (this as XMLHttpRequest & { __fcUrl?: string }).__fcUrl ?? '';
        if (!/\/api\//i.test(u)) return;
        const t = this.responseText;
        if (typeof t === 'string') ingestResponseText(t);
      } catch {
        /* ignore */
      }
    });
    return origSend.apply(this, sendArgs);
  };
}
