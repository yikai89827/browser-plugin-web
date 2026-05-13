import { browserStorage } from '../storage';

/** 兼容旧逻辑：同步一份到 IndexedDB 键 fbRequestHeadersToken（其它模块可能读取） */
export async function mirrorAccessTokenToLegacyLyStorage(token: string): Promise<void> {
  await browserStorage.set('fbRequestHeadersToken', token);
}
