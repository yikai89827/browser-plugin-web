/**
 * 通道一：从 webRequest 请求 URL 中识别并持久化 access_token。
 * 与 entrypoints/content/tokenPageBridge（页面 postMessage 通道二）并行，互为备份。
 * 仅负责「发现 URL 中的 token → 落库」，不涉及 Graph 请求。
 */
import { browser } from 'wxt/browser';
import { extractAccessTokenFromUrl } from './extractAccessTokenFromUrl';
import { isFacebookRequestUrl } from './isFacebookRequestUrl';
import { mirrorAccessTokenToLegacyLyStorage } from './legacyTokenMirror';
import { saveFbAccessToken } from './accessTokenStore';
import { describeToken, shortUrlPathForLog } from './tokenDebugLog';

export async function tryPersistAccessTokenFromRequestUrl(url: string): Promise<void> {
  if (!isFacebookRequestUrl(url)) return;
  const token = extractAccessTokenFromUrl(url);
  if (!token) return;

  let host = 'unknown';
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep unknown */
  }

  console.info('[fbControl:token] 从请求 URL 解析到 access_token，准备写入本地 storage', {
    host,
    path: shortUrlPathForLog(url),
    token: describeToken(token),
  });

  await saveFbAccessToken(token, host);

  console.info('[fbControl:token] access_token 已写入 storage.local', {
    host,
    token: describeToken(token),
  });

  await mirrorAccessTokenToLegacyLyStorage(token);
}

/** 在已有 onBeforeSendHeaders 回调中调用，避免重复注册监听器 */
export function scheduleAccessTokenCaptureFromUrl(url: string | undefined): void {
  if (!url) return;
  void tryPersistAccessTokenFromRequestUrl(url).catch((e) =>
    console.warn('[fbControl:token] 捕获或保存 token 失败', e)
  );
}
