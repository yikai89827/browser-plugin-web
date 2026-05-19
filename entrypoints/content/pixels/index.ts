import { browser } from 'wxt/browser';
import type { FbPixelCollectPayload, FbPixelShareRecord } from '../../../interfaces/fbControl';
import {
  fetchBusinessPixelsFromGraph,
  fetchPixelsAcrossMeBusinesses,
  mergeFbPixelShareIntoMap,
  parseMetaBusinessIdFromPageUrl,
} from '../../../utils/fb/pixel/graphFetchBusinessPixels';
import { fbControlError, fbControlLog, fbControlWarn } from '../../../utils/fbControlLog';

export type { FbPixelShareRecord };

/** Á??Ê?êÂ?èÁ¥†Â??‰∫´Ë°?Á??Á®≥ÂÆ?‰∏ªÈ?ÆÔº?Â?èÁ¥† + BMÔº? */
function stablePixelShareId(pixelId: string, bmId: string): string {
  const p = pixelId || 'unknown_pixel';
  const b = bmId || 'no_bm';
  return `${p}::${b}`;
}

async function getAccessTokenFromExtension(): Promise<string | null> {
  try {
    const res = (await browser.runtime.sendMessage({
      action: 'FB_CONTROL_GET_ACCESS_TOKEN',
    })) as { success?: boolean; payload?: { token?: string | null } };
    if (res?.success && typeof res.payload?.token === 'string' && res.payload.token.length > 20) {
      return res.payload.token;
    }
  } catch (e) {
    fbControlWarn('content:pixels', 'ËØªÂè? access_token Â§±Ë¥•', e);
  }
  return null;
}

/** Â∞?Â?èÁ¥†È??È??Áª?Ê??Â??Â?•Ê?©Â±? IndexedDB */
async function persistPixelShares(rows: FbPixelShareRecord[]) {
  if (!rows.length) return;
  try {
    fbControlLog('content:pixels', 'persistPixelShares', { count: rows.length });
    await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SAVE_PIXEL_SHARES',
      data: rows,
    });
  } catch (e) {
    fbControlError('content:pixels', 'persistPixelShares Â§±Ë¥•', e);
  }
}

function collectPixelsFromDom(url: string, now: number): FbPixelShareRecord[] {
  const pixels: FbPixelShareRecord[] = [];
  fbControlLog('content:pixels', 'Âº?Âß? DOM Ê?´ÊèèÂ?èÁ¥†Ë°?', { url });
  const pixelRows = document.querySelectorAll(
    '[data-testid*="pixel-row"], [data-testid*="event-pixel"], [role="row"]'
  );

  pixelRows.forEach((row, index) => {
    try {
      const nameEl = row.querySelector(
        '[data-testid*="pixel-name"], [data-visualcompletion="ignore-dynamic"]'
      );
      const idEl = row.querySelector('[data-testid*="pixel-id"]');
      const statusEl = row.querySelector('[data-testid*="pixel-status"]');

      const pixelName = nameEl?.textContent?.trim() || '';
      const pixelId =
        idEl?.textContent?.replace(/\D/g, '').trim() || (pixelName.match(/\b(\d{10,})\b/)?.[1] ?? '');

      if (pixelName || pixelId) {
        const id = stablePixelShareId(pixelId || `idx_${index}`, '');
        pixels.push({
          id,
          pixelName: pixelName || pixelId || `Pixel ${index + 1}`,
          pixelId: pixelId || id,
          shareOk: statusEl?.textContent?.toLowerCase().includes('active') ?? undefined,
          bmShareOk: undefined,
          capturedAt: now,
          sourceUrl: url,
        });
      }
    } catch (err) {
      fbControlError('content:pixels', 'Ëß£Ê?êÂç?Ë°? DOM Â§±Ë¥•', err);
    }
  });

  if (pixels.length === 0) {
    fbControlLog('content:pixels', 'DOM Ê?†Ë°?Ôº?Â∞ùËØ?È°µÈù¢Â??Âµ? pixelsData');
    const pageData = extractPageData();
    if (pageData?.pixels?.length) {
      for (let i = 0; i < pageData.pixels.length; i++) {
        const p = pageData.pixels[i];
        const pixelId = String(p.id || p.pixel_id || '');
        const bmId = String(p.business_id || p.owner_business_id || '');
        pixels.push({
          id: stablePixelShareId(pixelId, bmId),
          pixelName: String(p.name || p.pixel_name || pixelId),
          pixelId: pixelId || `pixel_${i}`,
          bmName: p.business?.name,
          bmId: bmId || undefined,
          ownerName: p.owner_business?.name,
          ownerId: p.owner_business?.id ? String(p.owner_business.id) : undefined,
          capturedAt: now,
          sourceUrl: url,
        });
      }
    }
  }

  return pixels;
}

/**
 * Â?® BM„??Ê?∞ÊçÆÈ?? / ‰∫?‰ª∂ÁÆ°Áê?„?çÁ≠?È°µÔº?‰º?Â??Á?® Graph `owned_pixels` / `client_pixels` / `adspixels`Ôº?‰∏? fbspider Â∏∏Á?®Ê?πÂºè‰∏?Ë?¥Ôº?Ôº?
 * `all_pixels` Ê®°Âºè‰º?ÈÅçÂ?? `me/businesses` Ê??ÈΩêÂ§? BM Â?èÁ¥†Ôº?Â§±Ë¥•Ê??Ê?† token Ê?∂Â??È?? DOM / Â??Âµ? JSON„??
 */
export async function fetchPixels(opts?: FbPixelCollectPayload): Promise<FbPixelShareRecord[]> {
  const now = Date.now();
  const url = window.location.href;
  const merged = new Map<string, FbPixelShareRecord>();

  try {
    const mode = opts?.mode === 'bm_id' ? 'bm_id' : 'all_pixels';
    const bmIdFromUrl = parseMetaBusinessIdFromPageUrl(url);
    const token = await getAccessTokenFromExtension();

    if (token) {
      const useAllBusinesses = mode === 'all_pixels' || (mode === 'bm_id' && !bmIdFromUrl);
      if (mode === 'bm_id' && !bmIdFromUrl) {
        fbControlWarn(
          'content:pixels',
          'Êê?Á¥¢ BM ID Ê®°Âºè‰Ω?ÂΩ?Â?çÈ°µ URL Ê?† business_idÔº?Â∑≤Â??È??‰∏∫ÈÅçÂ?? me/businesses',
          { href: url.slice(0, 120) }
        );
      }
      try {
        if (useAllBusinesses) {
          const graphRows = await fetchPixelsAcrossMeBusinesses(token, now, url);
          for (const r of graphRows) {
            mergeFbPixelShareIntoMap(merged, r);
          }
          fbControlLog('content:pixels', 'Graph Â?èÁ¥†Ôº?Â§? BMÔº?Â∑≤Âê?Âπ∂', { count: graphRows.length });
        } else if (bmIdFromUrl) {
          const graphRows = await fetchBusinessPixelsFromGraph(token, bmIdFromUrl, now, url);
          for (const r of graphRows) {
            mergeFbPixelShareIntoMap(merged, r);
          }
          fbControlLog('content:pixels', 'Graph Â?èÁ¥†Â??Ë°®Â∑≤Âê?Âπ∂', { bmId: bmIdFromUrl, count: graphRows.length });
        }
      } catch (e: unknown) {
        fbControlWarn(
          'content:pixels',
          'Graph Ê??Âè?Â?èÁ¥†Â§±Ë¥•Ôº?Ê£?Ê?• token Ê?ØÂê¶Âê´ business_management / ads_readÔº?',
          e instanceof Error ? e.message : e
        );
      }
    } else {
      fbControlLog('content:pixels', 'Ë∑≥Ëø? GraphÔº?Ê?™‰øùÂ≠? token', { mode, hasBmId: Boolean(bmIdFromUrl) });
    }

    const domRelevant =
      url.includes('/events_manager2/') ||
      url.includes('/business/events/') ||
      url.includes('/datasets') ||
      url.includes('data_sources') ||
      url.includes('business_pixel');

    if (merged.size === 0 && domRelevant) {
      const domRows = collectPixelsFromDom(url, now);
      for (const r of domRows) {
        mergeFbPixelShareIntoMap(merged, r);
      }
      fbControlLog('content:pixels', 'DOM/Â??Âµ? JSON Â??È??ÂÆ?Ê?ê', { count: domRows.length });
    }

    const pixels = [...merged.values()].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    fbControlLog('content:pixels', 'È??È??ÂÆ?Ê?ê', { count: pixels.length });
    await persistPixelShares(pixels);
    return pixels;
  } catch (error) {
    fbControlError('content:pixels', 'fetchPixels Â§±Ë¥•', error);
    throw error;
  }
}

/** ‰ª? script Ê†?Á≠æËß£Ê?ê pixelsData / eventsManagerData */
function extractPageData(): { pixels?: any[] } | null {
  try {
    const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent;
      if (content && (content.includes('pixelsData') || content.includes('eventsManagerData'))) {
        const match = content.match(/(pixelsData|eventsManagerData)\s*=\s*({[\s\S]+?});/);
        if (match) {
          return JSON.parse(match[2]);
        }
      }
    }
  } catch (error) {
    fbControlError('content:pixels', 'extractPageData Â§±Ë¥•', error);
  }
  return null;
}

/** ÂΩ?Â?ç URL Ê?ØÂê¶Â∫?Ëß¶Âè?Â?èÁ¥†È??È??Ôº?Âê´ Graph Ê??È??Á?? business_id È°µÔº? */
export function isPixelPage(): boolean {
  const u = window.location.href;
  const h = window.location.hostname || '';
  if (
    u.includes('/events_manager2/') ||
    u.includes('/business/events/') ||
    u.includes('/datasets/') ||
    u.includes('/data_sources') ||
    u.includes('business_pixel')
  ) {
    return true;
  }
  if (h.includes('business.facebook.com') && /[?&]business_id=\d{5,}/.test(u)) {
    return true;
  }
  return false;
}
