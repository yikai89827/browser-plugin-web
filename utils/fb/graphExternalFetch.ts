import { fbControlLog } from '../fbControlLog';

export type GraphCompatibleFetch = (input: string, init?: RequestInit) => Promise<Response>;

let customFetch: GraphCompatibleFetch | null = null;

/**
 * 站点侧注册：通过扩展 background 代理 Graph，避免浏览器 CORS。
 * 扩展内（Service Worker）未注册时始终使用全局 `fetch`。
 */
export function registerGraphExternalFetch(fn: GraphCompatibleFetch | null): void {
  customFetch = fn;
  fbControlLog('fb:graph-fetch', fn ? '已注册 Graph 外部 fetch' : '已恢复默认 fetch');
}

export function graphFetch(input: string, init?: RequestInit): Promise<Response> {
  if (customFetch) return customFetch(input, init);
  return fetch(input, init);
}
