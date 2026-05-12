/**
 * 本地站点通过 externally_connectable 与扩展后台通讯。
 * 开发时在 `site/.env.development` 中设置 VITE_EXTENSION_ID=chrome 扩展 ID；
 * 或在页面「扩展 ID」输入框中临时填写（会写入 sessionStorage）。
 */

import type { FbAdAccountRecord, FbPixelShareRecord } from '../../../interfaces/fbControl';
import type { FbTokenMeta } from '../../../utils/fb/accessTokenStore';

export type { FbTokenMeta };

const STORAGE_KEY = 'fb_control_extension_id';

export type ExtensionResponse<T = unknown> = {
  success: boolean;
  error?: string;
  payload?: T;
};

function getChrome(): typeof chrome | undefined {
  return typeof chrome !== 'undefined' ? chrome : undefined;
}

export function getStoredExtensionId(): string {
  const fromSession =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(STORAGE_KEY) || ''
      : '';
  const fromEnv = (import.meta.env.VITE_EXTENSION_ID as string) || '';
  return (fromSession || fromEnv).trim();
}

export function setStoredExtensionId(id: string) {
  sessionStorage.setItem(STORAGE_KEY, id.trim());
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
    return Promise.reject(new Error('请先在 .env.development 配置 VITE_EXTENSION_ID，或在页面填写扩展 ID'));
  }
  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.reject(new Error('当前环境无 chrome.runtime（请用 Chrome 打开本地站点并已安装扩展）'));
  }

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

export async function clearFbAccessTokenInExtension() {
  return sendToExtension({
    action: 'FB_CONTROL_CLEAR_ACCESS_TOKEN',
  });
}
