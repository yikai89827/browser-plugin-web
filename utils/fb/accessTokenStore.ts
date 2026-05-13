import { browser } from 'wxt/browser';
import { fbControlLog } from '../fbControlLog';

const KEY_TOKEN = 'fb_control_access_token';
const KEY_UPDATED = 'fb_control_token_updated_at';
const KEY_HOST = 'fb_control_token_source_host';

export type FbTokenMeta = {
  hasToken: boolean;
  updatedAt: number | null;
  sourceHost: string | null;
  /** 仅前缀，用于界面展示 */
  tokenPrefix: string | null;
};

/**
 * 将 Facebook `access_token` 写入扩展 `chrome.storage.local`。
 * @param token 原始 token 字符串（首尾空格会被 trim）
 * @param sourceHost 捕获来源主机名或 `manual` / `page_post_message` 等标记
 */
export async function saveFbAccessToken(token: string, sourceHost: string): Promise<void> {
  const t = token.trim();
  if (!t) return;
  await browser.storage.local.set({
    [KEY_TOKEN]: t,
    [KEY_UPDATED]: Date.now(),
    [KEY_HOST]: sourceHost.slice(0, 200),
  });
}

/** 读取当前保存的 access_token；无则返回 null */
export async function getFbAccessToken(): Promise<string | null> {
  const v = await browser.storage.local.get(KEY_TOKEN);
  const t = v[KEY_TOKEN];
  return typeof t === 'string' && t.length ? t : null;
}

/** 返回 token 是否存在、更新时间、来源 host、前缀（供管理页展示，不含完整 secret） */
export async function getFbTokenMeta(): Promise<FbTokenMeta> {
  const v = await browser.storage.local.get([KEY_TOKEN, KEY_UPDATED, KEY_HOST]);
  const token = typeof v[KEY_TOKEN] === 'string' ? (v[KEY_TOKEN] as string) : '';
  const updatedAt =
    typeof v[KEY_UPDATED] === 'number' ? (v[KEY_UPDATED] as number) : null;
  const sourceHost =
    typeof v[KEY_HOST] === 'string' ? (v[KEY_HOST] as string) : null;
  return {
    hasToken: token.length > 0,
    updatedAt,
    sourceHost,
    tokenPrefix: token ? `${token.slice(0, 8)}…` : null,
  };
}

/** 清除本地 token 及元数据 */
export async function clearFbAccessToken(): Promise<void> {
  fbControlLog('token-store', '清除 access_token 与元数据');
  await browser.storage.local.remove([KEY_TOKEN, KEY_UPDATED, KEY_HOST]);
}
