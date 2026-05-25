import type { PixelDrawerKind, PixelDrawerSubmitPayload } from './pixelOperationTypes';
import type { PixelBmOption, PixelChecklistItem, PixelOpResultRow } from '../../../utils/fb/pixel/graphPixelBatchOperations';
import {
  executePixelDrawerOperation,
  fetchBmAdAccountsForPixelAssign,
  fetchBmBusinessUsersForPixelAssign,
  fetchPixelAssignedUsers,
  fetchPixelOperationBusinesses,
  fetchPixelSharedAdAccounts,
  fetchPixelSharedAgencies,
} from '../../../utils/fb/pixel/graphPixelBatchOperations';
import { getFbAccessTokenFromExtension } from './extensionBridge';
import { fbControlLog } from '../../../utils/fbControlLog';

async function requireAccessToken(): Promise<string> {
  const tokenRes = await getFbAccessTokenFromExtension();
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '读取 token 失败');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('未保存 access_token，请先在 Facebook 页登录或粘贴 Token');
  }
  return token;
}

export async function fetchPixelBmListFromSite(): Promise<PixelBmOption[]> {
  const token = await requireAccessToken();
  fbControlLog('site:pixel-ops', '拉取 BM 列表');
  return fetchPixelOperationBusinesses(token);
}

export async function fetchPixelDrawerTargetsFromSite(
  kind: PixelDrawerKind,
  pixelId: string,
  bmId: string
): Promise<PixelChecklistItem[]> {
  const token = await requireAccessToken();
  fbControlLog('site:pixel-ops', '拉取抽屉候选列表', { kind, pixelId, bmId });
  switch (kind) {
    case 'assign_to_account':
      return fetchBmAdAccountsForPixelAssign(token, bmId);
    case 'assign_to_people':
      return fetchBmBusinessUsersForPixelAssign(token, bmId);
    case 'delete_ad_account':
      return fetchPixelSharedAdAccounts(token, pixelId, bmId);
    case 'delete_partner':
      return fetchPixelSharedAgencies(token, pixelId, bmId);
    case 'delete_admin':
      return fetchPixelAssignedUsers(token, pixelId, bmId);
    default:
      return [];
  }
}

/** @deprecated 使用 fetchPixelDrawerTargetsFromSite */
export const fetchPixelDeleteTargetsFromSite = fetchPixelDrawerTargetsFromSite;

export type PixelRelationCountKind = 'ad_account' | 'admin' | 'partner';

/** 表格列：广告账号 / 管理员 / 合作伙伴 数量 */
export async function fetchPixelRelationCountFromSite(
  kind: PixelRelationCountKind,
  pixelId: string,
  bmId: string
): Promise<number> {
  const drawerKind =
    kind === 'ad_account'
      ? 'delete_ad_account'
      : kind === 'admin'
        ? 'delete_admin'
        : 'delete_partner';
  const list = await fetchPixelDrawerTargetsFromSite(drawerKind, pixelId, bmId);
  return list.length;
}

export async function executePixelDrawerFromSite(
  payload: PixelDrawerSubmitPayload
): Promise<PixelOpResultRow[]> {
  const token = await requireAccessToken();
  fbControlLog('site:pixel-ops', '执行像素抽屉操作', { kind: payload.kind });
  return executePixelDrawerOperation(token, {
    kind: payload.kind,
    bmId: payload.bmId,
    batchCreateMode: payload.batchCreateMode,
    adAccountId: payload.adAccountId,
    pixelId: payload.pixelId,
    namePrefix: payload.namePrefix,
    selectedTargetIds: payload.selectedTargetIds,
    useDefaultInterval: payload.useDefaultInterval,
  });
}
