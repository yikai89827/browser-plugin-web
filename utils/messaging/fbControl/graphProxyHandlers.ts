import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlLog } from '../../fbControlLog';
import { redactUrlForLog } from '../../fb/tokenDebugLog';

const ALLOWED_PREFIXES = ['https://graph.facebook.com/', 'https://adsmanager-graph.facebook.com/'];

function isAllowedGraphUrl(url: string): boolean {
  const u = url.trim();
  return ALLOWED_PREFIXES.some((p) => u.startsWith(p));
}

/**
 * 站点经 `externally_connectable` 发消息，由扩展在特权环境代发 Graph，绕过 CORS。
 */
export async function handleFbControlGraphProxyMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  if (message.action !== 'FB_CONTROL_PROXY_FETCH') return null;

  const data = message.data as {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
  };
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url || !isAllowedGraphUrl(url)) {
    return {
      success: false,
      error: '仅允许代理 https://graph.facebook.com 与 https://adsmanager-graph.facebook.com 的请求',
    };
  }
  const method = (data.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    return { success: false, error: 'method 仅支持 GET / POST / DELETE' };
  }

  fbControlLog('messaging:graph-proxy', 'FB_CONTROL_PROXY_FETCH', { url: redactUrlForLog(url), method });

  const init: RequestInit = { method };
  if (data.headers && typeof data.headers === 'object' && Object.keys(data.headers).length) {
    init.headers = data.headers;
  }
  if (data.body != null && data.body !== '' && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    init.body = data.body;
  }

  try {
    const res = await fetch(url, init);
    const bodyText = await res.text();
    return {
      success: true,
      payload: { status: res.status, bodyText, ok: res.ok },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fbControlLog('messaging:graph-proxy', '代理 fetch 失败', msg);
    return { success: false, error: msg };
  }
}
