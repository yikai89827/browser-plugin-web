import type { PixelDrawerKind } from '../../../interfaces/fbControl';
import { fbControlLog, fbControlWarn } from '../../fbControlLog';
import {
  formatNotBusinessScopedUserHint,
  postBusinessPartnerAgency,
} from '../adAccount/graphBusinessManagement';
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

function normalizeGraphId(v: unknown): string {
  return v != null ? String(v).replace(/\D/g, '') : '';
}

/** BM 资产组合内像素权限（Meta 文档 pixel_roles） */
const DEFAULT_PIXEL_ROLES = ['ANALYZE', 'EDIT'] as const;

function formatPixelAssignError(message: string): string {
  let msg = formatNotBusinessScopedUserHint(message);
  if (/\(#10\)|permission denied/i.test(msg)) {
    msg +=
      '\n\n说明：Graph 不支持直接 POST 像素 assigned_users。本工具会改走 BM「资产组合」分配；' +
      '请确认 access_token 为 BM 管理员且含 business_management。' +
      '若在广告账户下新建的像素，需先加入 BM 资产组合（business.facebook.com → 设置 → 资产组合）。';
  }
  return msg;
}

async function fetchPixelOwnerBusinessId(
  accessToken: string,
  pixelId: string
): Promise<string | undefined> {
  const tokenEnc = encodeURIComponent(accessToken);
  const path = `${pixelId}?fields=owner_business{id}&access_token=${tokenEnc}`;
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
    const res = await graphFetch(url);
    const json = (await res.json()) as {
      owner_business?: { id?: string | number };
      error?: { message?: string };
    };
    if (!res.ok || json.error) return undefined;
    const id = json.owner_business?.id;
    return id != null ? normalizeGraphId(id) : undefined;
  } catch {
    return undefined;
  }
}

async function assetGroupContainsPixel(
  accessToken: string,
  assetGroupId: string,
  pixelId: string
): Promise<boolean> {
  const tokenEnc = encodeURIComponent(accessToken);
  const pid = normalizeGraphId(pixelId);
  const path = `${assetGroupId}/contained_pixels?fields=id&limit=200&access_token=${tokenEnc}`;
  const batch = await graphGetPaged(path);
  return batch.some((node) => normalizeGraphId(node.id) === pid);
}

async function addPixelToAssetGroup(
  accessToken: string,
  assetGroupId: string,
  pixelId: string
): Promise<void> {
  const body = new URLSearchParams();
  body.set('asset_id', normalizeGraphId(pixelId) || pixelId);
  body.set('access_token', accessToken);
  await graphFormPost(`${assetGroupId}/contained_pixels`, body);
}

/**
 * 解析可用于「分配给人员」的 BM 资产组合：已包含该像素，或 BM 仅有一个组合时自动把像素加入该组合。
 */
/** 列出 BM 下已包含该像素的所有资产组合 id（只读，不自动加入像素） */
async function listAssetGroupIdsContainingPixel(
  accessToken: string,
  businessId: string,
  pixelId: string
): Promise<string[]> {
  const tokenEnc = encodeURIComponent(accessToken);
  const path = `${businessId}/business_asset_groups?fields=id,name&limit=100&access_token=${tokenEnc}`;
  const groups = await graphGetPaged(path);
  const out: string[] = [];
  for (const g of groups) {
    const gid = normalizeGraphId(g.id);
    if (!gid) continue;
    if (await assetGroupContainsPixel(accessToken, gid, pixelId)) out.push(gid);
  }
  return out;
}

async function resolveAssetGroupForPixelPeopleAssign(
  accessToken: string,
  businessId: string,
  pixelId: string
): Promise<string | null> {
  const existing = await listAssetGroupIdsContainingPixel(accessToken, businessId, pixelId);
  if (existing.length) return existing[0];

  const tokenEnc = encodeURIComponent(accessToken);
  const path = `${businessId}/business_asset_groups?fields=id,name&limit=100&access_token=${tokenEnc}`;
  const groups = await graphGetPaged(path);

  if (groups.length === 1) {
    const gid = normalizeGraphId(groups[0].id);
    if (!gid) return null;
    try {
      await addPixelToAssetGroup(accessToken, gid, pixelId);
      return gid;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', '将像素加入唯一资产组合失败', msg);
    }
  }
  return null;
}

async function assignPixelUserViaAssetGroup(
  accessToken: string,
  assetGroupId: string,
  businessId: string,
  businessUserId: string,
  pixelRoles: readonly string[] = DEFAULT_PIXEL_ROLES
): Promise<void> {
  const body = new URLSearchParams();
  body.set('business', businessId);
  body.set('user', businessUserId);
  body.set('pixel_roles', JSON.stringify([...pixelRoles]));
  body.set('access_token', accessToken);
  await graphFormPost(`${assetGroupId}/assigned_users`, body);
}

/** 兼容旧路径：直接 POST 像素 assigned_users（多数 token/像素会失败） */
async function assignPixelUserDirect(
  accessToken: string,
  pixelId: string,
  businessId: string,
  businessUserId: string
): Promise<void> {
  const body = new URLSearchParams();
  body.set('user', businessUserId);
  body.set('business', businessId);
  body.set('tasks', JSON.stringify(['ADVERTISE', 'ANALYZE']));
  body.set('access_token', accessToken);
  await graphFormPost(`${pixelId}/assigned_users`, body);
}

export async function fetchPixelOperationBusinesses(accessToken: string): Promise<PixelBmOption[]> {
  return fetchMeBusinessesFromGraph(accessToken);
}

function adAccountActPath(accountId: string): string {
  const digits = accountId.replace(/^act_/i, '').replace(/\D/g, '');
  if (!digits) throw new Error('无效的广告账户 ID');
  return `act_${digits}`;
}

async function createPixelOnAdAccount(
  accessToken: string,
  adAccountId: string,
  pixelName: string
): Promise<{ pixelId: string; name: string }> {
  const name = pixelName.trim() || 'Pixel';
  const actPath = adAccountActPath(adAccountId);
  const body = new URLSearchParams();
  body.set('name', name);
  body.set('access_token', accessToken);
  const json = await graphFormPost(`${actPath}/adspixels`, body);
  const pixelId = String(json.id ?? '').replace(/\D/g, '') || String(json.id ?? '');
  return { pixelId, name };
}

/** 指定广告账户创建 1 个像素 */
export async function batchCreatePixelOnSingleAccount(
  accessToken: string,
  adAccountId: string,
  pixelName: string
): Promise<PixelOpResultRow[]> {
  try {
    const { pixelId, name } = await createPixelOnAdAccount(accessToken, adAccountId, pixelName);
    return [
      {
        targetId: adAccountId,
        pixelId: pixelId || undefined,
        status: '成功',
        detail: `已创建像素「${name}」${pixelId ? `（${pixelId}）` : ''}`,
      },
    ];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [{ targetId: adAccountId, status: '失败', detail: msg }];
  }
}

/** BM 下全部广告账户各创建 1 个像素 */
export async function batchCreatePixelsForBmAllAccounts(
  accessToken: string,
  businessId: string,
  pixelName: string,
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const accounts = await fetchBmAdAccountsForPixelAssign(accessToken, businessId);
  if (!accounts.length) {
    throw new Error('该 BM 下没有可用的广告账户');
  }
  const name = pixelName.trim() || 'Pixel';
  const results: PixelOpResultRow[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const { pixelId, name: createdName } = await createPixelOnAdAccount(accessToken, acc.id, name);
      results.push({
        targetId: acc.id,
        pixelId: pixelId || undefined,
        status: '成功',
        detail: `${acc.label}：已创建像素「${createdName}」${pixelId ? `（${pixelId}）` : ''}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ targetId: acc.id, status: '失败', detail: `${acc.label}：${msg}` });
    }
    if (useDefaultInterval && i < accounts.length - 1) await sleep(DEFAULT_INTERVAL_MS);
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
  const map = new Map<string, PixelChecklistItem>();
  const bizIds = new Set<string>();
  const bmNorm = normalizeGraphId(businessId);
  if (bmNorm) bizIds.add(bmNorm);
  const ownerBm = await fetchPixelOwnerBusinessId(accessToken, pixelId);
  if (ownerBm) bizIds.add(ownerBm);

  const mergeAgencyBatch = (batch: Record<string, unknown>[]) => {
    mergeChecklistNodes(
      map,
      batch,
      (node) => String(node.id ?? '').replace(/\D/g, '') || String(node.id ?? ''),
      (node) => (typeof node.name === 'string' ? node.name : undefined)
    );
  };

  const edges = ['shared_agencies', 'agencies'] as const;
  for (const edge of edges) {
    try {
      const path = `${pixelId}/${edge}?fields=${fields}&limit=200&access_token=${tokenEnc}`;
      mergeAgencyBatch(await graphGetPaged(path));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', '拉取像素合作伙伴边失败（无 business）', {
        edge,
        msg,
      });
    }
    for (const bid of bizIds) {
      try {
        const bizEnc = encodeURIComponent(bid);
        const path = `${pixelId}/${edge}?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`;
        mergeAgencyBatch(await graphGetPaged(path));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fbControlWarn('fb:graph-pixel-ops', '拉取像素合作伙伴边失败', { edge, businessId: bid, msg });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

async function fetchAssetGroupAssignedUsersForPixel(
  accessToken: string,
  businessId: string,
  pixelId: string
): Promise<PixelChecklistItem[]> {
  const map = new Map<string, PixelChecklistItem>();
  const groupIds = await listAssetGroupIdsContainingPixel(accessToken, businessId, pixelId);
  const fields = encodeURIComponent('id,name,email,pixel_roles');
  const tokenEnc = encodeURIComponent(accessToken);
  const bizEnc = encodeURIComponent(businessId);
  for (const gid of groupIds) {
    try {
      const path = `${gid}/assigned_users?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`;
      const batch = await graphGetPaged(path);
      mergeChecklistNodes(
        map,
        batch,
        (node) => String(node.id ?? '').replace(/\D/g, '') || String(node.id ?? ''),
        (node) => {
          const name = typeof node.name === 'string' ? node.name : undefined;
          const email = typeof node.email === 'string' ? node.email : undefined;
          const roles = Array.isArray(node.pixel_roles) ? node.pixel_roles.join(',') : '';
          const suffix = roles ? ` [${roles}]` : '';
          return (name || email || '') + suffix;
        }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', '拉取资产组合 assigned_users 失败', { assetGroupId: gid, msg });
    }
  }
  return [...map.values()];
}

export async function fetchPixelAssignedUsers(
  accessToken: string,
  pixelId: string,
  businessId: string
): Promise<PixelChecklistItem[]> {
  const map = new Map<string, PixelChecklistItem>();
  const fields = encodeURIComponent('id,name,email');
  const tokenEnc = encodeURIComponent(accessToken);
  const bizEnc = encodeURIComponent(businessId);
  try {
    const path = `${pixelId}/assigned_users?fields=${fields}&business=${bizEnc}&limit=200&access_token=${tokenEnc}`;
    const batch = await graphGetPaged(path);
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fbControlWarn('fb:graph-pixel-ops', '拉取像素 assigned_users 失败', msg);
  }

  const fromGroups = await fetchAssetGroupAssignedUsersForPixel(accessToken, businessId, pixelId);
  for (const item of fromGroups) {
    if (!map.has(item.id)) map.set(item.id, item);
  }

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
  const fields = encodeURIComponent('id,name,email,user{id}');
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
  const ownerBm = await fetchPixelOwnerBusinessId(accessToken, pixelId);
  const bmNorm = normalizeGraphId(businessId);
  if (ownerBm && ownerBm !== bmNorm) {
    fbControlWarn('fb:graph-pixel-ops', '像素 owner_business 与操作 BM 不一致', {
      pixelId,
      ownerBm,
      businessId: bmNorm,
    });
  }

  let assetGroupId = await resolveAssetGroupForPixelPeopleAssign(accessToken, businessId, pixelId);
  let assignVia: 'asset_group' | 'direct' = assetGroupId ? 'asset_group' : 'direct';

  if (!assetGroupId) {
    fbControlLog(
      'fb:graph-pixel-ops',
      '未找到含该像素的资产组合，将尝试直接 assigned_users（可能失败）',
      { pixelId, businessId: bmNorm }
    );
  }

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    try {
      if (assignVia === 'asset_group' && assetGroupId) {
        await assignPixelUserViaAssetGroup(accessToken, assetGroupId, businessId, uid);
        results.push({
          pixelId,
          targetId: uid,
          status: '成功',
          detail: `已通过 BM 资产组合（${assetGroupId}）分配像素权限（${DEFAULT_PIXEL_ROLES.join(', ')}）`,
        });
      } else {
        await assignPixelUserDirect(accessToken, pixelId, businessId, uid);
        results.push({
          pixelId,
          targetId: uid,
          status: '成功',
          detail: '已分配给人员',
        });
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      if (assignVia === 'asset_group' && assetGroupId) {
        try {
          await assignPixelUserDirect(accessToken, pixelId, businessId, uid);
          results.push({
            pixelId,
            targetId: uid,
            status: '成功',
            detail: '已分配给人员（资产组合失败后的直连回退）',
          });
          continue;
        } catch (e2: unknown) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          results.push({
            pixelId,
            targetId: uid,
            status: '失败',
            detail: formatPixelAssignError(`${raw}；回退：${msg2}`),
          });
          continue;
        }
      }
      if (assignVia === 'direct' && /permission denied|\(#10\)/i.test(raw)) {
        assetGroupId = await resolveAssetGroupForPixelPeopleAssign(accessToken, businessId, pixelId);
        if (assetGroupId) {
          assignVia = 'asset_group';
          try {
            await assignPixelUserViaAssetGroup(accessToken, assetGroupId, businessId, uid);
            results.push({
              pixelId,
              targetId: uid,
              status: '成功',
              detail: `已通过 BM 资产组合（${assetGroupId}）分配像素权限`,
            });
            continue;
          } catch (e3: unknown) {
            const msg3 = e3 instanceof Error ? e3.message : String(e3);
            results.push({
              pixelId,
              targetId: uid,
              status: '失败',
              detail: formatPixelAssignError(msg3),
            });
            continue;
          }
        }
      }
      results.push({
        pixelId,
        targetId: uid,
        status: '失败',
        detail: formatPixelAssignError(raw),
      });
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

/** BM 间分享像素时授予目标 BM 的默认任务（Meta permitted_tasks） */
const PIXEL_AGENCY_PERMITTED_TASKS = ['ANALYZE', 'UPLOAD', 'ADVERTISE'] as const;

function formatPixelAgencyShareDetail(json: Record<string, unknown>): string {
  const pending = json.pending_request_id ?? json.id;
  if (pending != null && String(pending).trim()) {
    return `分享请求已提交；若双方尚无 BM 合作关系，目标 BM 管理员须在商务管理平台接受（request: ${String(pending).trim()}）`;
  }
  if (json.success === true) {
    return '已与目标 BM 建立像素分享';
  }
  return 'Graph 已接受分享请求';
}

function formatPixelBmShareError(message: string, pixelId: string, ownerBm: string): string {
  let msg = message;
  if (/Unsupported post request|does not support this operation/i.test(msg)) {
    msg +=
      '\n\n说明：Meta 拒绝了 POST 像素 agencies。常见原因：①当前 access_token 不是像素所属 BM 的「所有者」管理员（仅代理商 token 不可分享）；' +
      `②像素 ${pixelId} 未真正归属 BM ${ownerBm}（仅在广告账户下创建时需先在商务管理平台认领）；③浏览器抓取的 token 无 business_management 写权限。` +
      '建议：用像素所属 BM 管理员账号在 business.facebook.com 打开后重试，或先在后台手动分享一次。';
  } else if (/permission|权限|code\s*=\s*10/i.test(msg)) {
    msg += '\n\n说明：请确认 token 对像素所属 BM 具备管理权限，且含 business_management。';
  }
  return msg;
}

async function probeAdsPixelForShare(
  accessToken: string,
  pixelId: string
): Promise<{ ok: boolean; ownerBusinessId?: string; error?: string }> {
  const tokenEnc = encodeURIComponent(accessToken);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}?fields=id,owner_business{id,name}&access_token=${tokenEnc}`;
  try {
    const res = await graphFetch(url, { method: 'GET' });
    const json = (await res.json()) as {
      id?: string;
      owner_business?: { id?: string | number };
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
    }
    const ownerBusinessId =
      json.owner_business?.id != null ? normalizeGraphId(json.owner_business.id) : undefined;
    return { ok: true, ownerBusinessId };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function postPixelAgenciesShare(
  accessToken: string,
  pixelId: string,
  targetBusinessId: string
): Promise<Record<string, unknown>> {
  const tasksJson = JSON.stringify([...PIXEL_AGENCY_PERMITTED_TASKS]);
  const tokenEnc = encodeURIComponent(accessToken);
  const targetEnc = encodeURIComponent(targetBusinessId);

  const attempts: { label: string; run: () => Promise<Record<string, unknown>> }[] = [
    {
      label: 'form-body',
      run: async () => {
        const body = new URLSearchParams();
        body.set('business', targetBusinessId);
        body.set('permitted_tasks', tasksJson);
        body.set('access_token', accessToken);
        return graphFormPost(`${pixelId}/agencies`, body);
      },
    },
    {
      label: 'query-post',
      run: async () => {
        const path =
          `${pixelId}/agencies?business=${targetEnc}&permitted_tasks=${encodeURIComponent(tasksJson)}&access_token=${tokenEnc}`;
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
        const res = await graphFetch(url, { method: 'POST' });
        const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
        if (!res.ok || json.error) {
          throw new Error(String(json.error?.message || `HTTP ${res.status}`));
        }
        return json;
      },
    },
    {
      label: 'shared-agencies-form',
      run: async () => {
        const body = new URLSearchParams();
        body.set('business', targetBusinessId);
        body.set('access_token', accessToken);
        return graphFormPost(`${pixelId}/shared_agencies`, body);
      },
    },
  ];

  let lastErr = '分享请求失败';
  for (const attempt of attempts) {
    try {
      const json = await attempt.run();
      fbControlLog('fb:graph-pixel-ops', 'POST pixel agencies 成功', {
        pixelId,
        targetBusinessId,
        attempt: attempt.label,
      });
      return json;
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      fbControlWarn('fb:graph-pixel-ops', 'POST pixel agencies 尝试失败', {
        attempt: attempt.label,
        msg: lastErr,
      });
    }
  }
  throw new Error(lastErr);
}

/** 将自有像素分享给其他 BM（先建立 BM 合作关系，再 POST 像素 agencies） */
export async function sharePixelWithAgencyBusinesses(
  accessToken: string,
  pixelId: string,
  ownerBusinessId: string,
  agencyBusinessIds: string[],
  useDefaultInterval: boolean
): Promise<PixelOpResultRow[]> {
  const results: PixelOpResultRow[] = [];
  const pid = normalizeGraphId(pixelId) || pixelId;

  const probe = await probeAdsPixelForShare(accessToken, pid);
  if (!probe.ok) {
    const ownerHint = normalizeGraphId(ownerBusinessId) || ownerBusinessId;
    for (const raw of agencyBusinessIds) {
      results.push({
        pixelId: pid,
        targetId: normalizeGraphId(raw) || raw,
        status: '失败',
        detail: formatPixelBmShareError(
          probe.error || '无法读取像素节点',
          pid,
          ownerHint
        ),
      });
    }
    return results;
  }

  const ownerNorm =
    probe.ownerBusinessId || normalizeGraphId(ownerBusinessId) || ownerBusinessId;
  const tableOwnerNorm = normalizeGraphId(ownerBusinessId);
  if (tableOwnerNorm && probe.ownerBusinessId && tableOwnerNorm !== probe.ownerBusinessId) {
    fbControlWarn('fb:graph-pixel-ops', '表格 BM 与像素 owner_business 不一致，以 Graph 为准', {
      tableBm: tableOwnerNorm,
      ownerBusiness: probe.ownerBusinessId,
      pixelId: pid,
    });
  }

  for (let i = 0; i < agencyBusinessIds.length; i++) {
    const raw = agencyBusinessIds[i];
    const bid = normalizeGraphId(raw);
    if (!bid || !/^\d{5,}$/.test(bid)) {
      results.push({
        pixelId: pid,
        targetId: raw || '—',
        status: '失败',
        detail: '无效的 BM ID',
      });
      continue;
    }
    if (bid === ownerNorm) {
      results.push({
        pixelId: pid,
        targetId: bid,
        status: '失败',
        detail: '目标 BM 不能与像素所属 BM 相同',
      });
      continue;
    }

    try {
      let bmLinkNote = '';
      try {
        const link = await postBusinessPartnerAgency(accessToken, ownerNorm, bid, [
          'ADVERTISE',
          'ANALYZE',
        ]);
        bmLinkNote = link.alreadyLinked
          ? '双方 BM 合作关系已存在；'
          : link.id
            ? `已发起 BM 合作关系（${link.id}）；`
            : '已发起 BM 合作关系；';
      } catch (e: unknown) {
        const linkMsg = e instanceof Error ? e.message : String(e);
        if (!/already|exist|duplicate|已|重复|3989|3946/i.test(linkMsg)) {
          fbControlWarn('fb:graph-pixel-ops', 'BM agencies 合作请求未成功（继续尝试分享像素）', linkMsg);
          bmLinkNote = `BM 合作请求：${linkMsg}；`;
        } else {
          bmLinkNote = '双方 BM 合作关系已存在；';
        }
      }

      const json = await postPixelAgenciesShare(accessToken, pid, bid);
      results.push({
        pixelId: pid,
        targetId: bid,
        status: '成功',
        detail: bmLinkNote + formatPixelAgencyShareDetail(json),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicated|already belongs|已存在|3989|3946/i.test(msg)) {
        results.push({
          pixelId: pid,
          targetId: bid,
          status: '成功',
          detail: '目标 BM 已拥有该像素分享关系',
        });
      } else {
        results.push({
          pixelId: pid,
          targetId: bid,
          status: '失败',
          detail: formatPixelBmShareError(msg, pid, ownerNorm),
        });
      }
    }
    if (useDefaultInterval && i < agencyBusinessIds.length - 1) await sleep(DEFAULT_INTERVAL_MS);
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
  const assetGroupIds = await listAssetGroupIdsContainingPixel(accessToken, businessId, pixelId);
  const tokenEnc = encodeURIComponent(accessToken);
  const bizEnc = encodeURIComponent(businessId);

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    let removed = false;
    let lastErr = '';

    try {
      const q = `user=${encodeURIComponent(uid)}&access_token=${tokenEnc}`;
      await graphDelete(`${pixelId}/assigned_users?${q}`);
      removed = true;
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
    }

    if (!removed) {
      for (const gid of assetGroupIds) {
        try {
          const q = `user=${encodeURIComponent(uid)}&business=${bizEnc}&access_token=${tokenEnc}`;
          await graphDelete(`${gid}/assigned_users?${q}`);
          removed = true;
          lastErr = '';
          break;
        } catch (e: unknown) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
    }

    if (removed) {
      results.push({
        pixelId,
        targetId: uid,
        status: '成功',
        detail: assetGroupIds.length ? '已移除像素/资产组合权限' : '已移除管理员',
      });
    } else {
      results.push({ pixelId, targetId: uid, status: '失败', detail: lastErr || '移除失败' });
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
    batchCreateMode?: 'bm_all_accounts' | 'single_account';
    adAccountId?: string;
    pixelId?: string;
    namePrefix?: string;
    selectedTargetIds: string[];
    useDefaultInterval: boolean;
  }
): Promise<PixelOpResultRow[]> {
  switch (payload.kind) {
    case 'batch_create': {
      const mode = payload.batchCreateMode ?? 'bm_all_accounts';
      const pixelName = payload.namePrefix || 'Pixel';
      if (mode === 'bm_all_accounts') {
        return batchCreatePixelsForBmAllAccounts(
          accessToken,
          payload.bmId,
          pixelName,
          payload.useDefaultInterval
        );
      }
      const adAccountId = payload.adAccountId?.trim();
      if (!adAccountId) throw new Error('请选择广告账户');
      return batchCreatePixelOnSingleAccount(accessToken, adAccountId, pixelName);
    }
    case 'share_between_bm':
      if (!payload.pixelId) throw new Error('缺少 pixelId');
      if (!payload.selectedTargetIds.length) throw new Error('请填写至少一个目标 BM ID');
      return sharePixelWithAgencyBusinesses(
        accessToken,
        payload.pixelId,
        payload.bmId,
        payload.selectedTargetIds,
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
