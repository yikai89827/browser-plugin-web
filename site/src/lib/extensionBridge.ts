/**
 * 本地站点通过 externally_connectable 与扩展后台通讯。
 *
 * 扩展 ID 仅来自 `site/.env.development` / `site/.env` 中的 `VITE_EXTENSION_ID`（Vite 构建时注入）。
 * 本地「加载已解压」时 ID 一般随扩展目录路径稳定，换目录或换机后请更新 .env 并重新构建站点。
 */

import type { FbAdAccountRecord, FbAdAccountPaymentActivity, FbPixelShareRecord } from '../../../interfaces/fbControl';
import type { FbTokenMeta } from '../../../utils/fb/accessTokenStore';
import { fetchAdAccountPaymentActivities } from '../../../utils/fb/graphFetchAdAccountPaymentActivities';
import { fetchAdAccountAssignedUserCount } from '../../../utils/fb/graphFetchAdAccountAssignedUsers';
import {
  executeAdAccountBatchOperation,
  renameAdAccountViaAdsManagerGraph,
  verifyFacebookUserIdsForBatch,
  verifyFacebookUserIdForFriendCheck,
  fetchFriendCheckCurrentUserProfileUrl,
  parseFacebookUserIdsFromText,
  type AdAccountBatchResultRow,
  type VerifyFacebookUserIdsForBatchResult,
  type UidGraphVerifyDetailRow,
} from '../../../utils/fb/graphAdAccountBatchOperations';
export type {
  AdAccountBatchResultRow,
  VerifyFacebookUserIdsForBatchResult,
  UidGraphVerifyDetailRow,
} from '../../../utils/fb/graphAdAccountBatchOperations';
export {
  mapUidVerifyRowsToFriendBatchResultRows,
  parseFacebookUserIdsFromText,
} from '../../../utils/fb/graphAdAccountBatchOperations';

/** 好友预检完成事件载荷 */
export interface FriendVerifyResultPayload {
  rows: AdAccountBatchResultRow[];
  currentUserProfileUrl: string | null;
}
import { registerGraphExternalFetch } from '../../../utils/fb/graphExternalFetch';
import { fbControlLog } from '../../../utils/fbControlLog';
import type { BatchDrawerSubmitPayload } from './batchOperationTypes';

export type { FbTokenMeta };

const STORAGE_KEY = 'fb_control_extension_id';

/** 仅来自 Vite 环境变量（.env），不含 session */
export function getExtensionIdFromEnv(): string {
  const v = import.meta.env.VITE_EXTENSION_ID;
  return typeof v === 'string' ? v.trim() : '';
}

/** 是否已在配置文件中填写有效扩展 ID（长度与 Chrome ID 一致即可） */
export function usesExtensionIdFromEnv(): boolean {
  return getExtensionIdFromEnv().length >= 8;
}

export type ExtensionResponse<T = unknown> = {
  success: boolean;
  error?: string;
  payload?: T;
};

/** Graph `activities` 筛出的支付/计费类记录载荷 */
export type AdAccountPaymentActivitiesPayload = {
  items: FbAdAccountPaymentActivity[];
  rawCount: number;
  filteredCount: number;
  message?: string;
};

function getChrome(): typeof chrome | undefined {
  return typeof chrome !== 'undefined' ? chrome : undefined;
}

/** 实际用于 chrome.runtime.sendMessage 的扩展 ID（仅 .env） */
export function getStoredExtensionId(): string {
  return getExtensionIdFromEnv();
}

/** 已废弃：扩展 ID 不再通过页面或 session 写入，保留空实现以免旧代码报错 */
export function setStoredExtensionId(_id: string) {
  void _id;
}

/** 清除 session 中的临时扩展 ID（仍优先使用 .env） */
export function clearExtensionIdSessionOverride() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function extensionConfigured(id?: string): boolean {
  const v = (id ?? getStoredExtensionId()).trim();
  return v.length >= 8;
}

export function sendToExtension<T = unknown>(message: {
  action: string;
  data?: unknown;
}): Promise<ExtensionResponse<T>> {
  const extId = getStoredExtensionId();
  const chromeApi = getChrome();
  if (!extensionConfigured(extId)) {
    return Promise.reject(
      new Error('请在 site/.env.development（或 .env）中配置 VITE_EXTENSION_ID，并重新执行站点构建')
    );
  }
  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.reject(new Error('当前环境无 chrome.runtime（请用 Chrome 打开本地站点并已安装扩展）'));
  }

  fbControlLog('extension-bridge', 'sendMessage → 扩展', { action: message.action, extIdPreview: extId.slice(0, 8) });

  return new Promise((resolve, reject) => {
    chromeApi.runtime.sendMessage(extId, message, (response: ExtensionResponse<T>) => {
      const err = chromeApi.runtime.lastError;
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      if (response && response.success === false && response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response as ExtensionResponse<T>);
    });
  });
}

export async function pingExtension() {
  return sendToExtension<{ ok?: boolean; version?: number }>({
    action: 'FB_CONTROL_PING',
  });
}

export async function fetchAccountsFromExtension() {
  return sendToExtension<{ list: FbAdAccountRecord[] }>({
    action: 'FB_CONTROL_GET_ACCOUNTS',
  });
}

/** 合并更新单条账户（收藏、备注等） */
export async function mergeAccountInExtension(patch: Partial<FbAdAccountRecord> & { accountId: string }) {
  return sendToExtension({
    action: 'FB_CONTROL_MERGE_ACCOUNT',
    data: patch,
  });
}

export async function collectPixelSharesFromActiveFacebookTab() {
  return sendToExtension<unknown>({
    action: 'FB_CONTROL_COLLECT_PIXEL_SHARES_FROM_ACTIVE_TAB',
  });
}

export async function fetchPixelSharesFromExtension() {
  return sendToExtension<{ list: FbPixelShareRecord[] }>({
    action: 'FB_CONTROL_GET_PIXEL_SHARES',
  });
}

export async function getFbTokenMetaFromExtension() {
  return sendToExtension<FbTokenMeta>({
    action: 'FB_CONTROL_GET_TOKEN_META',
  });
}

export async function syncAdAccountsFromGraphViaExtension() {
  return sendToExtension<{ upserted: number; total: number }>({
    action: 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH',
  });
}

export async function setFbAccessTokenInExtension(token: string, sourceHost?: string) {
  return sendToExtension({
    action: 'FB_CONTROL_SET_ACCESS_TOKEN',
    data: { token, sourceHost },
  });
}

export async function getFbAccessTokenFromExtension() {
  return sendToExtension<{ token: string | null }>({
    action: 'FB_CONTROL_GET_ACCESS_TOKEN',
  });
}

/**
 * 按账户拉取近 5 年计费/支付相关 activities。
 * 通过扩展已有 `FB_CONTROL_GET_ACCESS_TOKEN` 取 token，在页面内直接请求 Graph（避免依赖扩展侧新增 action，旧版扩展也可用）。
 */
export async function fetchAdAccountPaymentActivitiesFromExtension(
  accountId: string
): Promise<ExtensionResponse<AdAccountPaymentActivitiesPayload>> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
  if (!tokenRes.success) {
    return { success: false, error: tokenRes.error || '读取 token 失败' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { success: false, error: '未保存 access_token，无法查询支付记录' };
  }
  try {
    const result = await fetchAdAccountPaymentActivities(token, accountId);
    return { success: true, payload: result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/**
 * 统计广告账户 assigned_users（隐藏管理员人数），页面内 Graph 请求。
 */
export async function fetchAdAccountAssignedUsersFromExtension(
  accountId: string
): Promise<ExtensionResponse<{ count: number }>> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
  if (!tokenRes.success) {
    return { success: false, error: tokenRes.error || '读取 token 失败' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { success: false, error: '未保存 access_token，无法查询管理员' };
  }
  try {
    const count = await fetchAdAccountAssignedUserCount(token, accountId);
    return { success: true, payload: { count } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/**
 * 批量抽屉「检测好友关系」：Graph 逐 UID 预检，返回结果卡数据（非真实好友关系 API）。
 */
export async function verifyFacebookUidsForBatchSite(
  uidsText: string
): Promise<VerifyFacebookUserIdsForBatchResult> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, rows: [], currentUserProfileUrl: null };
  }
  if (!tokenRes.success) {
    return {
      ok: false,
      message: tokenRes.error || '读取 token 失败',
      rows: [],
      currentUserProfileUrl: null,
    };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return {
      ok: false,
      message: '未保存 access_token，无法校验 UID',
      rows: [],
      currentUserProfileUrl: null,
    };
  }
  return verifyFacebookUserIdsForBatch(token, uidsText);
}

/**
 * 顺序执行好友预检：每完成一条即回调 `onProgress`（用于首条完成后切到结果页并逐条追加卡片）。
 */
export async function runFacebookFriendCheckSequentialFromSite(
  uidsText: string,
  onProgress: (payload: FriendVerifyResultPayload) => void
): Promise<{ ok: boolean; message: string; currentUserProfileUrl: string | null }> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, currentUserProfileUrl: null };
  }
  if (!tokenRes.success) {
    return {
      ok: false,
      message: tokenRes.error || '读取 token 失败',
      currentUserProfileUrl: null,
    };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return {
      ok: false,
      message: '未保存 access_token，无法校验 UID',
      currentUserProfileUrl: null,
    };
  }

  const refs = parseFacebookUserIdsFromText(uidsText);
  const currentUserProfileUrl = await fetchFriendCheckCurrentUserProfileUrl(token);

  if (!refs.length) {
    return {
      ok: false,
      message:
        '未能解析出有效的 Facebook 用户（每行一个：纯数字 UID、profile.php?id= 链接、或 www.facebook.com/用户名 主页链接）',
      currentUserProfileUrl,
    };
  }

  const accumulated: UidGraphVerifyDetailRow[] = [];
  for (const ref of refs) {
    const row = await verifyFacebookUserIdForFriendCheck(token, ref);
    accumulated.push(row);
    const rows = mapUidVerifyRowsToFriendBatchResultRows(accumulated, currentUserProfileUrl);
    onProgress({ rows, currentUserProfileUrl });
  }

  const allOk = accumulated.every((r) => r.ok);
  const failCount = accumulated.filter((r) => !r.ok).length;
  const message = allOk
    ? `${accumulated.length} 个用户检测通过，可再次点击「确定」执行批量授权。`
    : `部分账号未通过好友预检（${failCount}/${accumulated.length}）。`;

  return { ok: allOk, message, currentUserProfileUrl };
}

/**
 * 单账户改名：走 Ads Manager Graph，成功后再由页面写扩展缓存。
 */
export async function renameAdAccountFromSite(accountId: string, newName: string): Promise<void> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '读取 token 失败');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('未保存 access_token，无法重命名');
  }
  fbControlLog('extension-bridge', 'renameAdAccountFromSite', { accountIdPreview: String(accountId).slice(0, 12) });
  await renameAdAccountViaAdsManagerGraph(token, accountId, newName);
}

/**
 * 在页面内使用扩展保存的 token 执行批量广告账户 Graph 操作（授权 / 限额 / 加 BM 等）。
 */
export async function executeAdAccountBatchFromSite(
  payload: BatchDrawerSubmitPayload
): Promise<AdAccountBatchResultRow[]> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '读取 token 失败');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('未保存 access_token，无法执行批量操作');
  }
  fbControlLog('extension-bridge', 'executeAdAccountBatchFromSite', {
    operationId: payload.operationId,
    accounts: payload.selectedAccountIds.length,
  });
  return executeAdAccountBatchOperation(token, payload);
}

/**
 * 站点 Graph 请求经扩展 background 代理，避免 graph.facebook.com / adsmanager-graph 的 CORS。
 * 在 `main.ts` 应用启动时调用一次即可。
 */
export function installGraphFetchViaExtensionProxy(): void {
  registerGraphExternalFetch(async (url, init = {}) => {
    const allowed =
      url.startsWith('https://graph.facebook.com/') ||
      url.startsWith('https://adsmanager-graph.facebook.com/');
    if (!allowed) {
      return fetch(url, init);
    }
    const chromeApi = getChrome();
    if (!extensionConfigured() || !chromeApi?.runtime?.sendMessage) {
      return fetch(url, init);
    }

    const method = (init.method || 'GET').toUpperCase();
    const hdrs: Record<string, string> = {};
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
    } else if (init.headers && typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        if (typeof v === 'string') hdrs[k] = v;
      }
    }

    let bodyStr: string | undefined;
    const b = init.body;
    if (b != null && method !== 'GET' && method !== 'HEAD') {
      if (typeof b === 'string') {
        bodyStr = b;
      } else if (b instanceof URLSearchParams) {
        bodyStr = b.toString();
        if (!hdrs['Content-Type'] && !hdrs['content-type']) {
          hdrs['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        }
      } else if (b instanceof Blob) {
        bodyStr = await b.text();
      } else {
        bodyStr = String(b);
      }
    }

    const proxyUnknownAction = (msg: string) =>
      /Unknown action:\s*FB_CONTROL_PROXY_FETCH/i.test(msg) || /\bFB_CONTROL_PROXY_FETCH\b/.test(msg);

    let resWrap: ExtensionResponse<{ status: number; bodyText: string; ok: boolean }>;
    try {
      resWrap = await sendToExtension<{ status: number; bodyText: string; ok: boolean }>({
        action: 'FB_CONTROL_PROXY_FETCH',
        data: {
          url,
          method,
          ...(Object.keys(hdrs).length ? { headers: hdrs } : {}),
          ...(bodyStr != null && bodyStr !== '' ? { body: bodyStr } : {}),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (proxyUnknownAction(msg)) {
        fbControlLog(
          'extension-bridge',
          '当前扩展未注册 FB_CONTROL_PROXY_FETCH，请重新执行 wxt build 并「重新加载」扩展；暂回退直连 fetch',
          {}
        );
        return fetch(url, init);
      }
      throw e instanceof Error ? e : new Error(msg);
    }

    if (!resWrap.success || resWrap.payload == null) {
      const err = resWrap.error || '扩展 Graph 代理失败';
      if (proxyUnknownAction(err)) {
        fbControlLog(
          'extension-bridge',
          '当前扩展未注册 FB_CONTROL_PROXY_FETCH，请重新执行 wxt build 并「重新加载」扩展；暂回退直连 fetch',
          {}
        );
        return fetch(url, init);
      }
      throw new Error(err);
    }
    const { status, bodyText } = resWrap.payload;
    return new Response(bodyText, {
      status,
      statusText: String(status),
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    });
  });
}

export async function clearFbAccessTokenInExtension() {
  return sendToExtension({
    action: 'FB_CONTROL_CLEAR_ACCESS_TOKEN',
  });
}
