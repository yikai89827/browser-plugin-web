import { browser } from 'wxt/browser';
import type { FbPixelCollectPayload, FbPixelShareRecord } from '../../../interfaces/fbControl';
import {
  fetchBusinessPixelsFromGraph,
  fetchPixelsAcrossMeBusinesses,
  mergeFbPixelShareIntoMap,
  parseMetaBusinessIdFromPageUrl,
} from '../../../utils/fb/graphFetchBusinessPixels';
import { fbControlError, fbControlLog, fbControlWarn } from '../../../utils/fbControlLog';

export type { FbPixelShareRecord };

/** 生成像素分享行的稳定主键（像素 + BM） */
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
    fbControlWarn('content:pixels', '读取 access_token 失败', e);
  }
  return null;
}

/** 将像素采集结果写入扩展 IndexedDB */
async function persistPixelShares(rows: FbPixelShareRecord[]) {
  if (!rows.length) return;
  try {
    fbControlLog('content:pixels', 'persistPixelShares', { count: rows.length });
    await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SAVE_PIXEL_SHARES',
      data: rows,
    });
  } catch (e) {
    fbControlError('content:pixels', 'persistPixelShares 失败', e);
  }
}

function collectPixelsFromDom(url: string, now: number): FbPixelShareRecord[] {
  const pixels: FbPixelShareRecord[] = [];
  fbControlLog('content:pixels', '开始 DOM 扫描像素行', { url });
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
      fbControlError('content:pixels', '解析单行 DOM 失败', err);
    }
  });

  if (pixels.length === 0) {
    fbControlLog('content:pixels', 'DOM 无行，尝试页面内嵌 pixelsData');
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
 * 在 BM「数据集 / 事件管理」等页：优先用 Graph `owned_pixels` / `client_pixels` / `adspixels`（与 fbspider 常用方式一致），
 * `all_pixels` 模式会遍历 `me/businesses` 拉齐多 BM 像素；失败或无 token 时回退 DOM / 内嵌 JSON。
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
          '搜索 BM ID 模式但当前页 URL 无 business_id，已回退为遍历 me/businesses',
          { href: url.slice(0, 120) }
        );
      }
      try {
        if (useAllBusinesses) {
          const graphRows = await fetchPixelsAcrossMeBusinesses(token, now, url);
          for (const r of graphRows) {
            mergeFbPixelShareIntoMap(merged, r);
          }
          fbControlLog('content:pixels', 'Graph 像素（多 BM）已合并', { count: graphRows.length });
        } else if (bmIdFromUrl) {
          const graphRows = await fetchBusinessPixelsFromGraph(token, bmIdFromUrl, now, url);
          for (const r of graphRows) {
            mergeFbPixelShareIntoMap(merged, r);
          }
          fbControlLog('content:pixels', 'Graph 像素列表已合并', { bmId: bmIdFromUrl, count: graphRows.length });
        }
      } catch (e: unknown) {
        fbControlWarn(
          'content:pixels',
          'Graph 拉取像素失败（检查 token 是否含 business_management / ads_read）',
          e instanceof Error ? e.message : e
        );
      }
    } else {
      fbControlLog('content:pixels', '跳过 Graph：未保存 token', { mode, hasBmId: Boolean(bmIdFromUrl) });
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
      fbControlLog('content:pixels', 'DOM/内嵌 JSON 回退完成', { count: domRows.length });
    }

    const pixels = [...merged.values()].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    fbControlLog('content:pixels', '采集完成', { count: pixels.length });
    await persistPixelShares(pixels);
    return pixels;
  } catch (error) {
    fbControlError('content:pixels', 'fetchPixels 失败', error);
    throw error;
  }
}

/** 从 script 标签解析 pixelsData / eventsManagerData */
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
    fbControlError('content:pixels', 'extractPageData 失败', error);
  }
  return null;
}

/** 当前 URL 是否应触发像素采集（含 Graph 所需的 business_id 页） */
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
