/**
 * 使用本地已保存的 access_token 调用 Graph 拉取像素，并写入 IndexedDB。
 * 在扩展 Service Worker 中执行，不依赖 Facebook 活动标签是否为「像素页」。
 */
import type { FbPixelCollectPayload, FbPixelShareRecord } from '../../interfaces/fbControl';
import { getFbAccessToken } from './accessTokenStore';
import {
  fetchBusinessPixelsFromGraph,
  fetchPixelsAcrossMeBusinesses,
  mergeFbPixelShareIntoMap,
  parseMetaBusinessIdFromPageUrl,
} from './graphFetchBusinessPixels';
import { fbControlLog, fbControlWarn } from '../fbControlLog';
import { fbIdbUpsertPixelShares } from '../storage/fbControlIndexedDB';
import { describeToken } from './tokenDebugLog';

export type GraphPixelSyncResult =
  | { ok: true; upserted: number; total: number }
  | { ok: false; error: string };

const MISSING_TOKEN_MSG =
  '未保存 access_token。请在已登录的 Facebook / 广告管理页操作以自动捕获，或使用「粘贴 Token」保存。';

export async function syncPixelSharesFromGraphToIndexedDb(
  opts?: FbPixelCollectPayload & { sourceUrl?: string }
): Promise<GraphPixelSyncResult> {
  fbControlLog('fb:graph-pixel-sync', '开始 Graph 同步像素');

  const token = await getFbAccessToken();
  if (!token) {
    fbControlWarn('fb:graph-pixel-sync', '中止：未保存 access_token');
    return { ok: false, error: MISSING_TOKEN_MSG };
  }

  fbControlLog('fb:graph-pixel-sync', '已读取 token', describeToken(token));

  const now = Date.now();
  const sourceUrl = opts?.sourceUrl?.trim() || 'extension://graph-pixel-sync';
  const mode = opts?.mode === 'bm_id' ? 'bm_id' : 'all_pixels';
  const merged = new Map<string, FbPixelShareRecord>();

  try {
    if (mode === 'all_pixels') {
      const rows = await fetchPixelsAcrossMeBusinesses(token, now, sourceUrl);
      for (const r of rows) mergeFbPixelShareIntoMap(merged, r);
    } else {
      const bmId = parseMetaBusinessIdFromPageUrl(sourceUrl);
      if (bmId) {
        const rows = await fetchBusinessPixelsFromGraph(token, bmId, now, sourceUrl);
        for (const r of rows) mergeFbPixelShareIntoMap(merged, r);
      } else {
        fbControlWarn(
          'fb:graph-pixel-sync',
          '搜索 BM ID 模式但无 business_id，回退遍历 me/businesses',
          { sourceUrl: sourceUrl.slice(0, 120) }
        );
        const rows = await fetchPixelsAcrossMeBusinesses(token, now, sourceUrl);
        for (const r of rows) mergeFbPixelShareIntoMap(merged, r);
      }
    }

    const list = [...merged.values()].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    const upserted = await fbIdbUpsertPixelShares(list);
    fbControlLog('fb:graph-pixel-sync', '写入 IndexedDB 完成', { upserted, total: list.length });
    return { ok: true, upserted, total: list.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fbControlWarn('fb:graph-pixel-sync', 'Graph 同步失败', msg);
    return { ok: false, error: msg };
  }
}
