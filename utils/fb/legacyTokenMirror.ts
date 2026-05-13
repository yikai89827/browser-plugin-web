import { browserStorage } from '../storage';

/**
 * 兼容旧逻辑：同步一份到 `browserStorage` 键 `fbRequestHeadersToken`（其它模块可能读取）。
 * @param token 已校验的 access_token
 */
export async function mirrorAccessTokenToLegacyLyStorage(token: string): Promise<void> {
  await browserStorage.set('fbRequestHeadersToken', token);
}
