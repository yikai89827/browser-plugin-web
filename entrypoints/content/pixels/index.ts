import { browser } from 'wxt/browser';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';

export type { FbPixelShareRecord };

function stablePixelShareId(pixelId: string, bmId: string): string {
  const p = pixelId || 'unknown_pixel';
  const b = bmId || 'no_bm';
  return `${p}::${b}`;
}

async function persistPixelShares(rows: FbPixelShareRecord[]) {
  if (!rows.length) return;
  try {
    await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SAVE_PIXEL_SHARES',
      data: rows,
    });
    console.log(`[fbControl] persisted ${rows.length} pixel share rows to extension IndexedDB`);
  } catch (e) {
    console.error('[fbControl] persist pixel shares failed', e);
  }
}

export async function fetchPixels(): Promise<FbPixelShareRecord[]> {
  const pixels: FbPixelShareRecord[] = [];
  const now = Date.now();
  const url = window.location.href;

  try {
    if (url.includes('/events_manager2/') || url.includes('/business/events/') || url.includes('datasets')) {
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
          console.error('Error parsing pixel row:', err);
        }
      });

      if (pixels.length === 0) {
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

      console.log(`[fbControl] collected ${pixels.length} pixel / share rows`);
    }

    await persistPixelShares(pixels);
    return pixels;
  } catch (error) {
    console.error('Error fetching pixels:', error);
    throw error;
  }
}

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
    console.error('Error extracting page data:', error);
  }
  return null;
}

export function isPixelPage(): boolean {
  const u = window.location.href;
  return (
    u.includes('/events_manager2/') ||
    u.includes('/business/events/') ||
    u.includes('/datasets/')
  );
}
