/**
 * 本地站点通过 externally_connectable 与扩展后台通讯。
 *
 * 扩展 ID 来源（优先级从高到低）：
 * 1. `site/.env.development` / `site/.env` 中的 `VITE_EXTENSION_ID`（构建时注入，适合团队固定配置）
 * 2. sessionStorage（页面输入框，仅在未配置环境变量时使用）
 *
 * 说明：上架 Chrome Web Store 后扩展 ID 固定；本地「加载已解压」时 ID 一般随扩展目录路径稳定，
 * 换目录或换机可能变化，此时更新 .env 即可，无需在页面重复填写。
 */

import type { FbAdAccountRecord, FbAdAccountPaymentActivity, FbPixelShareRecord } from '../../../interfaces/fbControl';
import type { FbTokenMeta } from '../../../utils/fb/accessTokenStore';
import { fetchAdAccountPaymentActivities } from '../../../utils/fb/graphFetchAdAccountPaymentActivities';
import { fetchAdAccountAssignedUserCount } from '../../../utils/fb/graphFetchAdAccountAssignedUsers';
import { fbControlLog } from '../../../utils/fbControlLog';

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

/** 实际用于 chrome.runtime.sendMessage 的扩展 ID：优先 .env，其次页面 session */
export function getStoredExtensionId(): string {
  const fromEnv = getExtensionIdFromEnv();
  if (fromEnv.length >= 8) return fromEnv;
  const fromSession =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(STORAGE_KEY) || ''
      : '';
  return fromSession.trim();
}

/** 将页面输入的扩展 ID 写入 session（仅在未配置 VITE_EXTENSION_ID 时生效） */
export function setStoredExtensionId(id: string) {
  if (usesExtensionIdFromEnv()) return;
  sessionStorage.setItem(STORAGE_KEY, id.trim());
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
      new Error('请配置 site/.env.development（或 .env）中的 VITE_EXTENSION_ID，或在页面填写扩展 ID')
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

export async function clearFbAccessTokenInExtension() {
  return sendToExtension({
    action: 'FB_CONTROL_CLEAR_ACCESS_TOKEN',
  });
}
