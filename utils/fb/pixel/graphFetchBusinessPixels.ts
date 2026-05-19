import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import { fbControlLog, fbControlWarn } from '../../fbControlLog';
import { redactUrlForLog } from '../tokenDebugLog';
import { graphFetch } from '../graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

const PIXEL_FIELDS = ['id', 'name', 'last_fired_time', 'owner_business{id,name}'].join(',');
const PIXEL_FIELDS_BASIC = ['id', 'name', 'owner_business{id,name}'].join(',');

/** 与 content/pixels 中规则一致：像素 ID + BM ID 稳定主键 */
function stablePixelShareId(pixelId: string, bmId: string): string {
  const p = pixelId || 'unknown_pixel';
  const b = bmId || 'no_bm';
  return `${p}::${b}`;
}

/**
 * 从当前页 URL 解析 Meta Business Manager 数字 ID（与 fbspider 等工具常用 query 一致）。
 * 同时匹配 hash 内参数（SPA 路由常见）。
 */
export function parseMetaBusinessIdFromPageUrl(href: string): string | null {
  const fromRaw = (s: string) => {
    let m = s.match(/[?&#]business_id=(\d{5,})/i);
    if (m?.[1]) return m[1];
    m = s.match(/[?&#]bm_id=(\d{5,})/i);
    if (m?.[1]) return m[1];
    return null;
  };
  const direct = fromRaw(href);
  if (direct) return direct;
  try {
    const u = new URL(href);
    for (const key of ['business_id', 'bm_id']) {
      const v = u.searchParams.get(key);
      if (v && /^\d{5,}$/.test(v)) return v;
    }
    const hash = u.hash || '';
    if (hash.length > 1) {
      const h = fromRaw(hash);
      if (h) return h;
      const qStart = hash.indexOf('?');
      if (qStart >= 0) {
        const inner = fromRaw(hash.slice(qStart));
        if (inner) return inner;
      }
    }
  } catch {
    /* ignore */
  }
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

function parseLastFiredFields(lastFired: unknown): Pick<FbPixelShareRecord, 'activeOk' | 'activeTime'> {
  if (lastFired == null || lastFired === '') return {};
  let ms: number;
  if (typeof lastFired === 'number') {
    ms = lastFired < 2e12 ? lastFired * 1000 : lastFired;
  } else {
    const d = new Date(String(lastFired));
    ms = d.getTime();
  }
  if (!Number.isFinite(ms) || Number.isNaN(ms)) return {};
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const activeTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
  const ageDays = (Date.now() - ms) / 86400000;
  const activeOk = ageDays <= 730;
  return { activeTime, activeOk };
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
  const activeFields = parseLastFiredFields(node.last_fired_time);

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
    ...activeFields,
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
  if (row.activeTime) {
    if (!merged.activeTime || row.activeTime > merged.activeTime) {
      merged.activeTime = row.activeTime;
      merged.activeOk = row.activeOk;
    }
  } else if (row.activeOk && merged.activeOk === undefined) {
    merged.activeOk = row.activeOk;
  }
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
async function fetchBusinessPixelsForFields(
  accessToken: string,
  businessId: string,
  nowMs: number,
  sourceUrl: string,
  fields: string,
  bmName?: string
): Promise<FbPixelShareRecord[]> {
  const fieldsEnc = encodeURIComponent(fields);
  const tokenEnc = encodeURIComponent(accessToken);
  const edges = ['owned_pixels', 'client_pixels', 'adspixels'] as const;
  const map = new Map<string, FbPixelShareRecord>();

  for (const edge of edges) {
    const path = `${businessId}/${edge}?fields=${fieldsEnc}&limit=100&access_token=${tokenEnc}`;
    try {
      const batch = await graphGetPaged(path);
      for (const node of batch) {
        mergeFbPixelShareIntoMap(map, mapNodeToRecord(node, { bmId: businessId, bmName, edge, now: nowMs, sourceUrl }));
      }
      fbControlLog('fb:graph-pixels', `边 ${edge} 完成`, { count: batch.length, fields: fields.slice(0, 24) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixels', `边 ${edge} 跳过`, { message: msg });
    }
  }

  return [...map.values()];
}

export async function fetchBusinessPixelsFromGraph(
  accessToken: string,
  businessId: string,
  nowMs: number,
  sourceUrl: string,
  bmNameHint?: string
): Promise<FbPixelShareRecord[]> {
  let bmName = bmNameHint;
  if (!bmName) {
    bmName = await fetchBusinessName(accessToken, businessId);
  }

  let list = await fetchBusinessPixelsForFields(
    accessToken,
    businessId,
    nowMs,
    sourceUrl,
    PIXEL_FIELDS,
    bmName
  );
  if (!list.length) {
    fbControlLog('fb:graph-pixels', '含 last_fired_time 无数据，回退基础字段重试', { businessId });
    list = await fetchBusinessPixelsForFields(
      accessToken,
      businessId,
      nowMs,
      sourceUrl,
      PIXEL_FIELDS_BASIC,
      bmName
    );
  }

  list.sort((a, b) => (a.pixelName || '').localeCompare(b.pixelName || '', 'zh-CN'));
  fbControlLog('fb:graph-pixels', '合并后像素行', { count: list.length, businessId });
  return list;
}

/**
 * 当前用户可管理的 BM 列表（需 token 含 `business_management`）。
 */
export async function fetchMeBusinessesFromGraph(accessToken: string): Promise<{ id: string; name?: string }[]> {
  const fieldsEnc = encodeURIComponent('id,name');
  const tokenEnc = encodeURIComponent(accessToken);
  const path = `me/businesses?fields=${fieldsEnc}&limit=200&access_token=${tokenEnc}`;
  const batch = await graphGetPaged(path);
  const out: { id: string; name?: string }[] = [];
  for (const node of batch) {
    const raw = node.id;
    const id = raw != null ? String(raw).replace(/\D/g, '') : '';
    if (!id) continue;
    const name = typeof node.name === 'string' ? node.name : undefined;
    out.push({ id, name });
  }
  fbControlLog('fb:graph-pixels', 'me/businesses', { count: out.length });
  return out;
}

/**
 * 遍历 `me/businesses` 逐 BM 拉像素并合并（与「搜索所有像素」采集策略一致，解决单页无 business_id 时拉不到数据的问题）。
 */
export async function fetchPixelsAcrossMeBusinesses(
  accessToken: string,
  nowMs: number,
  sourceUrl: string
): Promise<FbPixelShareRecord[]> {
  const businesses = await fetchMeBusinessesFromGraph(accessToken);
  const map = new Map<string, FbPixelShareRecord>();
  for (const b of businesses) {
    try {
      const rows = await fetchBusinessPixelsFromGraph(accessToken, b.id, nowMs, sourceUrl, b.name);
      for (const r of rows) {
        mergeFbPixelShareIntoMap(map, r);
      }
    } catch (e: unknown) {
      fbControlWarn('fb:graph-pixels', `BM ${b.id} 像素合并跳过`, e instanceof Error ? e.message : e);
    }
  }
  const list = [...map.values()].sort((a, x) => (a.pixelName || '').localeCompare(x.pixelName || '', 'zh-CN'));
  fbControlLog('fb:graph-pixels', '多 BM 合并后像素行', { count: list.length });
  return list;
}
