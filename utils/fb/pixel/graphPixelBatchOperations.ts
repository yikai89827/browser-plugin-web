import type { PixelDrawerKind } from '../../../interfaces/fbControl';
import { fbControlLog, fbControlWarn } from '../../fbControlLog';
import { graphFetch } from '../graphExternalFetch';
import { fetchMeBusinessesFromGraph } from './graphFetchBusinessPixels';
import { redactUrlForLog } from '../tokenDebugLog';

const GRAPH_VERSION = 'v21.0';
const DEFAULT_INTERVAL_MS = 1200;

export type PixelBmOption = { id: string; name?: string };
export type PixelChecklistItem = { id: string; label: string };
export type PixelOpResultRow = { pixelId?: string; targetId: string; status: string; detail: string };

type GraphListResponse = {
  data?: Record<string, unknown>[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

async function graphGetPaged(firstPathWithQuery: string): Promise<Record<string, unknown>[]> {
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${firstPathWithQuery}`;
  const rows: Record<string, unknown>[] = [];
  while (url) {
    fbControlLog('fb:graph-pixel-ops', 'GET', { url: redactUrlForLog(url) });
    const res = await graphFetch(url);
    const json = (await res.json()) as GraphListResponse;
    if (!res.ok || json.error) {
      throw new Error(json.error?.message || `HTTP ${res.status}`);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    rows.push(...batch);
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return rows;
}

async function graphFormPost(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
  fbControlLog('fb:graph-pixel-ops', 'POST', { path });
  const res = await graphFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(String(json.error?.message || `HTTP ${res.status}`));
  }
  return json;
}

async function graphDelete(pathWithQuery: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pathWithQuery}`;
  fbControlLog('fb:graph-pixel-ops', 'DELETE', { url: redactUrlForLog(url) });
  const res = await graphFetch(url, { method: 'DELETE' });
  const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatCheckLabel(id: string, name?: string, accountId?: string): string {
  const n = name?.trim();
  const aid = accountId?.trim();
  if (aid && n) return `${aid} (${n})`;
  if (n) return `${id} (${n})`;
  return id;
}

export async function fetchPixelOperationBusinesses(accessToken: string): Promise<PixelBmOption[]> {
  return fetchMeBusinessesFromGraph(accessToken);
}

/** 批量在 BM 下创建 owned_pixels */
export async function batchCreatePixelsOnBusiness(
  accessToken: string,
  businessId: string,
  namePrefix: string,
  count: number,
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const prefix = namePrefix.trim() || 'Pixel';
  const n = Math.min(100, Math.max(1, Math.floor(count)));
  const tokenEnc = encodeURIComponent(accessToken);
  const results: PixelOpResultRow[] = [];

  for (let i = 1; i <= n; i++) {
    const name = `${prefix}${i}`;
    try {
      const body = new URLSearchParams();
      body.set('name', name);
      body.set('access_token', accessToken);
      const json = await graphFormPost(`${businessId}/owned_pixels`, body);
      const id = String(json.id ?? '').replace(/\D/g, '') || String(json.id ?? '');
      results.push({
        targetId: id || name,
        status: '成功',
        detail: `已创建像素「${name}」${id ? `（${id}）` : ''}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ targetId: name, status: '失败', detail: msg });
    }
    if (useDefaultInterval && i < n) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function fetchPixelSharedAdAccounts(
  accessToken: string,
  pixelId: string,
  businessId?: string
): Promise<PixelChecklistItem[]> {
  const fields = encodeURIComponent('account_id,name,id');
  const tokenEnc = encodeURIComponent(accessToken);
  let path = `${pixelId}/shared_accounts?fields=${fields}&limit=200&access_token=${tokenEnc}`;
  if (businessId) {
    path += `&business=${encodeURIComponent(businessId)}`;
  }
  const batch = await graphGetPaged(path);
  const map = new Map<string, PixelChecklistItem>();
  for (const node of batch) {
    const accountId = String(node.account_id ?? node.id ?? '').replace(/\D/g, '');
    if (!accountId) continue;
    const name = typeof node.name === 'string' ? node.name : undefined;
    map.set(accountId, {
      id: accountId,
      label: formatCheckLabel(accountId, name, accountId),
    });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

function mergeChecklistNodes(
  map: Map<string, PixelChecklistItem>,
  batch: Record<string, unknown>[],
  pickId: (node: Record<string, unknown>) => string,
  pickName?: (node: Record<string, unknown>) => string | undefined
) {
  for (const node of batch) {
    const id = pickId(node);
    if (!id) continue;
    const name = pickName?.(node);
    map.set(id, { id, label: formatCheckLabel(id, name) });
  }
}

export async function fetchPixelSharedAgencies(
  accessToken: string,
  pixelId: string,
  businessId: string
): Promise<PixelChecklistItem[]> {
  const fields = encodeURIComponent('id,name');
  const tokenEnc = encodeURIComponent(accessToken);
  const bizEnc = encodeURIComponent(businessId);
  const map = new Map<string, PixelChecklistItem>();
  const paths = [
    `${pixelId}/shared_agencies?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`,
    `${pixelId}/agencies?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`,
  ];
  for (const path of paths) {
    try {
      const batch = await graphGetPaged(path);
      mergeChecklistNodes(map, batch, (node) => {
        const id = String(node.id ?? '').replace(/\D/g, '') || String(node.id ?? '');
        return id;
      }, (node) => (typeof node.name === 'string' ? node.name : undefined));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', '拉取像素合作伙伴边失败', { path: path.split('?')[0], msg });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export async function fetchPixelAssignedUsers(
  accessToken: string,
  pixelId: string,
  businessId: string
): Promise<PixelChecklistItem[]> {
  const fields = encodeURIComponent('id,name');
  const tokenEnc = encodeURIComponent(accessToken);
  const bizEnc = encodeURIComponent(businessId);
  const path = `${pixelId}/assigned_users?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`;
  const batch = await graphGetPaged(path);
  const map = new Map<string, PixelChecklistItem>();
  mergeChecklistNodes(
    map,
    batch,
    (node) => String(node.id ?? '').replace(/\D/g, '') || String(node.id ?? ''),
    (node) => (typeof node.name === 'string' ? node.name : undefined)
  );
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

/** BM 下可分配给像素的广告账户（自有 + 客户） */
export async function fetchBmAdAccountsForPixelAssign(
  accessToken: string,
  businessId: string
): Promise<PixelChecklistItem[]> {
  const fields = encodeURIComponent('account_id,name,id');
  const tokenEnc = encodeURIComponent(accessToken);
  const map = new Map<string, PixelChecklistItem>();
  const edges = ['owned_ad_accounts', 'client_ad_accounts'] as const;
  for (const edge of edges) {
    try {
      const path = `${businessId}/${edge}?fields=${fields}&limit=200&access_token=${tokenEnc}`;
      const batch = await graphGetPaged(path);
      mergeChecklistNodes(
        map,
        batch,
        (node) => String(node.account_id ?? node.id ?? '').replace(/^act_/i, '').replace(/\D/g, ''),
        (node) => (typeof node.name === 'string' ? node.name : undefined)
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', `拉取 BM ${edge} 失败`, msg);
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

/** BM 人员列表（分配给像素） */
export async function fetchBmBusinessUsersForPixelAssign(
  accessToken: string,
  businessId: string
): Promise<PixelChecklistItem[]> {
  const fields = encodeURIComponent('id,name,email');
  const tokenEnc = encodeURIComponent(accessToken);
  const path = `${businessId}/business_users?fields=${fields}&limit=200&access_token=${tokenEnc}`;
  const batch = await graphGetPaged(path);
  const map = new Map<string, PixelChecklistItem>();
  mergeChecklistNodes(
    map,
    batch,
    (node) => String(node.id ?? '').replace(/\D/g, '') || String(node.id ?? ''),
    (node) => {
      const name = typeof node.name === 'string' ? node.name : undefined;
      const email = typeof node.email === 'string' ? node.email : undefined;
      return name || email;
    }
  );
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export async function assignPixelSharedAdAccounts(
  accessToken: string,
  pixelId: string,
  businessId: string,
  accountIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i];
    try {
      const body = new URLSearchParams();
      body.set('account_id', accountId);
      body.set('business', businessId);
      body.set('access_token', accessToken);
      await graphFormPost(`${pixelId}/shared_accounts`, body);
      results.push({
        pixelId,
        targetId: accountId,
        status: '成功',
        detail: '已分配给广告账户',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ pixelId, targetId: accountId, status: '失败', detail: msg });
    }
    if (useDefaultInterval && i < accountIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function assignPixelAssignedUsers(
  accessToken: string,
  pixelId: string,
  businessId: string,
  userIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  const tasks = JSON.stringify(['ANALYZE', 'ADVERTISE', 'UPLOAD']);
  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    try {
      const body = new URLSearchParams();
      body.set('user', uid);
      body.set('business', businessId);
      body.set('tasks', tasks);
      body.set('access_token', accessToken);
      await graphFormPost(`${pixelId}/assigned_users`, body);
      results.push({
        pixelId,
        targetId: uid,
        status: '成功',
        detail: '已分配给人员',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ pixelId, targetId: uid, status: '失败', detail: msg });
    }
    if (useDefaultInterval && i < userIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function deletePixelSharedAdAccounts(
  accessToken: string,
  pixelId: string,
  businessId: string,
  accountIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i];
    try {
      const q = `account_id=${encodeURIComponent(accountId)}&business=${encodeURIComponent(businessId)}&access_token=${encodeURIComponent(accessToken)}`;
      await graphDelete(`${pixelId}/shared_accounts?${q}`);
      results.push({
        pixelId,
        targetId: accountId,
        status: '成功',
        detail: '已从像素移除广告账户关联',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ pixelId, targetId: accountId, status: '失败', detail: msg });
    }
    if (useDefaultInterval && i < accountIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function deletePixelSharedAgencies(
  accessToken: string,
  pixelId: string,
  agencyBusinessIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  for (let i = 0; i < agencyBusinessIds.length; i++) {
    const bid = agencyBusinessIds[i];
    try {
      const q = `business=${encodeURIComponent(bid)}&access_token=${encodeURIComponent(accessToken)}`;
      await graphDelete(`${pixelId}/agencies?${q}`);
      results.push({
        pixelId,
        targetId: bid,
        status: '成功',
        detail: '已移除合作伙伴',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', 'delete agency 失败，尝试 agencies 边', msg);
      try {
        const q2 = `business=${encodeURIComponent(bid)}&access_token=${encodeURIComponent(accessToken)}`;
        await graphDelete(`${pixelId}/shared_agencies?${q2}`);
        results.push({
          pixelId,
          targetId: bid,
          status: '成功',
          detail: '已从 shared_agencies 移除合作伙伴',
        });
      } catch (e2: unknown) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        results.push({ pixelId, targetId: bid, status: '失败', detail: msg2 });
      }
    }
    if (useDefaultInterval && i < agencyBusinessIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function deletePixelAssignedUsers(
  accessToken: string,
  pixelId: string,
  businessId: string,
  userIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    try {
      const q = `user=${encodeURIComponent(uid)}&access_token=${encodeURIComponent(accessToken)}`;
      await graphDelete(`${pixelId}/assigned_users?${q}`);
      results.push({
        pixelId,
        targetId: uid,
        status: '成功',
        detail: '已移除管理员',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ pixelId, targetId: uid, status: '失败', detail: msg });
    }
    if (useDefaultInterval && i < userIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
  }
  return results;
}

export async function executePixelDrawerOperation(
  accessToken: string,
  payload: {
    kind: PixelDrawerKind;
    bmId: string;
    pixelId?: string;
    namePrefix?: string;
    count?: number;
    selectedTargetIds: string[];
    useDefaultInterval: boolean;
  }
): Promise<PixelOpResultRow[]> {
  switch (payload.kind) {
    case 'batch_create':
      return batchCreatePixelsOnBusiness(
        accessToken,
        payload.bmId,
        payload.namePrefix || 'Pixel',
        payload.count ?? 1,
        payload.useDefaultInterval
      );
    case 'delete_ad_account':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      return deletePixelSharedAdAccounts(
        accessToken,
        payload.pixelId,
        payload.bmId,
        payload.selectedTargetIds,
        payload.useDefaultInterval
      );
    case 'delete_partner':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      return deletePixelSharedAgencies(
        accessToken,
        payload.pixelId,
        payload.selectedTargetIds,
        payload.useDefaultInterval
      );
    case 'assign_to_account':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      return assignPixelSharedAdAccounts(
        accessToken,
        payload.pixelId,
        payload.bmId,
        payload.selectedTargetIds,
        payload.useDefaultInterval
      );
    case 'assign_to_people':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      return assignPixelAssignedUsers(
        accessToken,
        payload.pixelId,
        payload.bmId,
        payload.selectedTargetIds,
        payload.useDefaultInterval
      );
    case 'delete_admin':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      return deletePixelAssignedUsers(
        accessToken,
        payload.pixelId,
        payload.bmId,
        payload.selectedTargetIds,
        payload.useDefaultInterval
      );
    default:
      throw new Error('未知操作类型');
  }
}
