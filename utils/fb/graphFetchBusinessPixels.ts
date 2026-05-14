import type { FbPixelShareRecord } from '../../interfaces/fbControl';
import { fbControlLog, fbControlWarn } from '../fbControlLog';
import { redactUrlForLog } from './tokenDebugLog';
import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

const PIXEL_FIELDS = ['id', 'name', 'owner_business{id,name}'].join(',');

/** 与 content/pixels 中规则一致：像素 ID + BM ID 稳定主键 */
function stablePixelShareId(pixelId: string, bmId: string): string {
  const p = pixelId || 'unknown_pixel';
  const b = bmId || 'no_bm';
  return `${p}::${b}`;
}

/**
 * 从当前页 URL 解析 Meta Business Manager 数字 ID（与 fbspider 等工具常用 query 一致）。
 */
export function parseMetaBusinessIdFromPageUrl(href: string): string | null {
  try {
    const u = new URL(href);
    for (const key of ['business_id', 'bm_id']) {
      const v = u.searchParams.get(key);
      if (v && /^\d{5,}$/.test(v)) return v;
    }
  } catch {
    /* ignore */
  }
  const m = href.match(/[?&]business_id=(\d{5,})/);
  if (m) return m[1];
  return null;
}

type GraphListResponse = {
  data?: Record<string, unknown>[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

async function graphGetPaged(firstPathWithQuery: string): Promise<Record<string, unknown>[]> {
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${firstPathWithQuery}`;
  const rows: Record<string, unknown>[] = [];
  let page = 0;
  while (url) {
    page += 1;
    fbControlLog('fb:graph-pixels', `请求第 ${page} 页`, { url: redactUrlForLog(url) });
    const res = await graphFetch(url);
    const json = (await res.json()) as GraphListResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    rows.push(...batch);
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return rows;
}

async function fetchBusinessName(accessToken: string, businessId: string): Promise<string | undefined> {
  try {
    const q = `fields=name&access_token=${encodeURIComponent(accessToken)}`;
    const res = await graphFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${businessId}?${q}`);
    const json = (await res.json()) as { name?: string; error?: { message?: string } };
    if (!res.ok || json.error) return undefined;
    return typeof json.name === 'string' ? json.name : undefined;
  } catch {
    return undefined;
  }
}

function mapNodeToRecord(
  node: Record<string, unknown>,
  ctx: {
    bmId: string;
    bmName?: string;
    edge: 'owned_pixels' | 'client_pixels' | 'adspixels';
    now: number;
    sourceUrl: string;
  }
): FbPixelShareRecord {
  const rawId = String(node.id ?? '');
  const pixelId = rawId.replace(/\D/g, '') || rawId;
  const pixelName = String(node.name ?? pixelId);
  const ob = node.owner_business as { id?: string | number; name?: string } | undefined;
  const ownerId = ob?.id != null ? String(ob.id) : undefined;
  const ownerName = ob?.name;

  const role =
    ctx.edge === 'owned_pixels' ? '自有' : ctx.edge === 'client_pixels' ? '客户' : '广告';

  const bmShareOk = ctx.edge === 'owned_pixels' ? true : undefined;
  const shareOk = ctx.edge === 'client_pixels' ? true : undefined;

  return {
    id: stablePixelShareId(pixelId, ctx.bmId),
    pixelName,
    pixelId,
    bmId: ctx.bmId,
    bmName: ctx.bmName,
    ownerName,
    ownerId,
    role,
    shareOk,
    bmShareOk,
    capturedAt: ctx.now,
    sourceUrl: ctx.sourceUrl,
  };
}

function mergeIntoMap(map: Map<string, FbPixelShareRecord>, row: FbPixelShareRecord) {
  const prev = map.get(row.id);
  if (!prev) {
    map.set(row.id, { ...row });
    return;
  }
  const merged: FbPixelShareRecord = { ...prev };
  merged.shareOk = merged.shareOk === true || row.shareOk === true ? true : merged.shareOk ?? row.shareOk;
  merged.bmShareOk =
    merged.bmShareOk === true || row.bmShareOk === true ? true : merged.bmShareOk ?? row.bmShareOk;
  if (!merged.ownerName && row.ownerName) merged.ownerName = row.ownerName;
  if (!merged.ownerId && row.ownerId) merged.ownerId = row.ownerId;
  if (!merged.pixelName && row.pixelName) merged.pixelName = row.pixelName;
  if (!merged.bmName && row.bmName) merged.bmName = row.bmName;
  if (!merged.bmId && row.bmId) merged.bmId = row.bmId;
  if (merged.role && row.role && merged.role !== row.role) merged.role = `${merged.role}/${row.role}`;
  else if (row.role && !merged.role) merged.role = row.role;
  map.set(row.id, merged);
}

/**
 * 将一条像素记录合并进 Map（按 `id` 去重、布尔字段取并集）。
 */
export function mergeFbPixelShareIntoMap(map: Map<string, FbPixelShareRecord>, row: FbPixelShareRecord) {
  mergeIntoMap(map, row);
}

/**
 * 使用用户 access_token 分页拉取 BM 下 `owned_pixels` / `client_pixels` / `adspixels`（与 fbspider 常用 Graph 边一致），
 * 合并去重后映射为 `FbPixelShareRecord[]`。
 */
export async function fetchBusinessPixelsFromGraph(
  accessToken: string,
  businessId: string,
  nowMs: number,
  sourceUrl: string,
  bmNameHint?: string
): Promise<FbPixelShareRecord[]> {
  const fieldsEnc = encodeURIComponent(PIXEL_FIELDS);
  const tokenEnc = encodeURIComponent(accessToken);

  let bmName = bmNameHint;
  if (!bmName) {
    bmName = await fetchBusinessName(accessToken, businessId);
  }

  const edges = ['owned_pixels', 'client_pixels', 'adspixels'] as const;
  const map = new Map<string, FbPixelShareRecord>();

  for (const edge of edges) {
    const path = `${businessId}/${edge}?fields=${fieldsEnc}&limit=100&access_token=${tokenEnc}`;
    try {
      const batch = await graphGetPaged(path);
      for (const node of batch) {
        mergeFbPixelShareIntoMap(map, mapNodeToRecord(node, { bmId: businessId, bmName, edge, now: nowMs, sourceUrl }));
      }
      fbControlLog('fb:graph-pixels', `边 ${edge} 完成`, { count: batch.length });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixels', `边 ${edge} 跳过`, { message: msg });
    }
  }

  const list = [...map.values()].sort((a, b) => (a.pixelName || '').localeCompare(b.pixelName || '', 'zh-CN'));
  fbControlLog('fb:graph-pixels', '合并后像素行', { count: list.length, businessId });
  return list;
}
