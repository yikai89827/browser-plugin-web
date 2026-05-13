/**
 * 通道二：页面 MAIN 世界通过外链脚本探测 token → postMessage → content → 后台持久化。
 * 脚本路径：public/fb-control-token-probe.js（manifest web_accessible_resources），规避页面 CSP 对内联脚本的限制。
 * 与 webRequest URL 捕获（tokenWebRequestCapture）并行。
 */
import { browser } from 'wxt/browser';
import { looksLikeFbUserToken } from '../../utils/fb/extractAccessTokenFromUrl';
import { describeToken } from '../../utils/fb/tokenDebugLog';
import {
  FB_TOKEN_LEGACY_ACTION_SAVE,
  FB_TOKEN_PAGE_ACTION_SAVE,
  FB_TOKEN_PAGE_MESSAGE_SOURCE,
} from '../../utils/fb/tokenPostMessageProtocol';

/** 与 public/fb-control-token-probe.js 文件名一致 */
const PROBE_SCRIPT = 'fb-control-token-probe.js';

let lastForwardedToken = '';
let lastForwardedAt = 0;
const DEDUP_MS = 4000;

function extractTokenFromPostMessageData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (d.source === FB_TOKEN_PAGE_MESSAGE_SOURCE && d.action === FB_TOKEN_PAGE_ACTION_SAVE) {
    const t =
      (typeof d.token === 'string' ? d.token : typeof d.accessToken === 'string' ? d.accessToken : '') || '';
    const trimmed = t.trim();
    return trimmed || null;
  }

  if (d.action === FB_TOKEN_LEGACY_ACTION_SAVE && typeof d.accessToken === 'string') {
    const trimmed = d.accessToken.trim();
    return trimmed || null;
  }

  return null;
}

function shouldForward(token: string): boolean {
  if (!looksLikeFbUserToken(token)) return false;
  const now = Date.now();
  if (token === lastForwardedToken && now - lastForwardedAt < DEDUP_MS) {
    return false;
  }
  lastForwardedToken = token;
  lastForwardedAt = now;
  return true;
}

async function forwardTokenToBackground(token: string): Promise<void> {
  const res = await browser.runtime.sendMessage({
    action: 'FB_CONTROL_SET_ACCESS_TOKEN',
    data: { token, sourceHost: 'page_post_message' },
  });
  if (res && typeof res === 'object' && 'success' in res && !(res as { success: boolean }).success) {
    console.warn('[fbControl:token:page-channel] 后台拒绝保存', res);
    return;
  }
  console.info('[fbControl:token:page-channel] 已通过 postMessage 写入后台', describeToken(token));
}

function injectPageWorldProbeScript(): void {
  const src = browser.runtime.getURL(PROBE_SCRIPT);
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  el.setAttribute('data-fb-control', 'token-probe');
  el.addEventListener(
    'load',
    () => {
      el.remove();
      console.info('[fbControl:token:page-channel] 外链探测脚本已加载', { src: PROBE_SCRIPT });
    },
    { once: true }
  );
  el.addEventListener(
    'error',
    () => {
      console.warn('[fbControl:token:page-channel] 外链探测脚本加载失败（可仅依赖 webRequest 通道）', {
        src,
      });
      el.remove();
    },
    { once: true }
  );
  (document.head || document.documentElement).appendChild(el);
}

export function initFbTokenPageChannel(): void {
  window.addEventListener(
    'message',
    (event: MessageEvent) => {
      if (event.source !== window) return;
      const token = extractTokenFromPostMessageData(event.data);
      if (!token || !shouldForward(token)) return;
      void forwardTokenToBackground(token).catch((e) =>
        console.warn('[fbControl:token:page-channel] 转发失败', e)
      );
    },
    false
  );

  injectPageWorldProbeScript();
  console.info('[fbControl:token:page-channel] 已启用外链探测脚本 + postMessage（与 webRequest 双通道）');
}
