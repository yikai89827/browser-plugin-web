import { browser } from 'wxt/browser';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import { fbControlError, fbControlLog } from '../../../utils/fbControlLog';

export type { FbPixelShareRecord };

/** 生成像素分享行的稳定主键（像素 + BM） */
function stablePixelShareId(pixelId: string, bmId: string): string {
  const p = pixelId || 'unknown_pixel';
  const b = bmId || 'no_bm';
  return `${p}::${b}`;
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

/**
 * 在事件管理 / 数据集相关页从 DOM 或内嵌 JSON 采集像素与分享信息。
 */
export async function fetchPixels(): Promise<FbPixelShareRecord[]> {
  const pixels: FbPixelShareRecord[] = [];
  const now = Date.now();
  const url = window.location.href;

  try {
    if (url.includes('/events_manager2/') || url.includes('/business/events/') || url.includes('datasets')) {
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
            idEl?.textContent?.replace(/\D/g, '').trim() ||
            (pixelName.match(/\b(\d{10,})\b/)?.[1] ?? '');

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

      fbControlLog('content:pixels', '采集完成', { count: pixels.length });
    }

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

/** 当前 URL 是否为像素 / 事件管理相关页 */
export function isPixelPage(): boolean {
  const u = window.location.href;
  return (
    u.includes('/events_manager2/') ||
    u.includes('/business/events/') ||
    u.includes('/datasets/')
  );
}
