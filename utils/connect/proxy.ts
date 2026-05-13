import { browser } from 'wxt/browser';
import { fbControlError, fbControlLog } from '../fbControlLog';
import { scheduleAccessTokenCaptureFromUrl } from '../fb/tokenWebRequestCapture';

/** 注册 `webRequest.onBeforeSendHeaders`，从 Facebook 系请求 URL 中调度 token 捕获 */
export const getWebRequestHeaders = () => {
  if (!browser || !browser.webRequest) {
    fbControlError('proxy', 'webRequest 不可用，跳过 onBeforeSendHeaders');
    return;
  }

  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        const { url } = details;
        if (!url) return { requestHeaders: details.requestHeaders };

        scheduleAccessTokenCaptureFromUrl(url);

        const lightApis = ['/lightads?', '/light_adsets?', '/light_campaigns?'];
        if (url.includes('facebook.com') && lightApis.some((p) => url.includes(p))) {
          try {
            const path = url.split(/[?#]/)[0];
            fbControlLog('proxy', 'Light Ads Graph 请求', { path });
          } catch {
            /* ignore */
          }
        }
      } catch (error) {
        fbControlError('proxy', 'onBeforeSendHeaders 回调异常', error);
      }
      return { requestHeaders: details.requestHeaders };
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders']
  );

  fbControlLog('proxy', '已注册 onBeforeSendHeaders（全 URL）');
};

/** 注册 `onHeadersReceived`，仅做调试级 URL 打印（可选） */
export const getWebResponseHeaders = () => {
  if (!browser || !browser.webRequest) {
    fbControlError('proxy', 'webRequest 不可用，跳过 onHeadersReceived');
    return;
  }

  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      try {
        /* onHeadersReceived：保留钩子位；默认不打日志以免刷屏 */
      } catch (error) {
        fbControlError('proxy', 'onHeadersReceived 回调异常', error);
      }
      return { responseHeaders: details.responseHeaders };
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );

  fbControlLog('proxy', '已注册 onHeadersReceived');
};

/** 透传 API 响应（占位，供业务扩展） */
export const processApiResponse = (response: any): any => {
  return response;
};

/** 预留：可按 URL 改写请求（当前恒返回 undefined） */
async function handleApiRequest(url: string): Promise<{ redirectUrl?: string } | undefined> {
  return undefined;
}

/** 注册 `onBeforeRequest` 拦截 Light Ads GET（当前未改写） */
export const interceptApiRequests = () => {
  if (!browser || !browser.webRequest) {
    fbControlError('proxy', 'webRequest 不可用，跳过 onBeforeRequest');
    return;
  }

  const apiPaths = ['/lightads?access_token', '/light_adsets?access_token', '/light_campaigns?access_token'];

  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      try {
        const { url, method } = details;
        const isTargetApi = apiPaths.some((api) => url.includes(api));
        if (isTargetApi && method === 'GET') {
          return handleApiRequest(url);
        }
      } catch (error) {
        fbControlError('proxy', 'onBeforeRequest 回调异常', error);
      }
      return {};
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );

  fbControlLog('proxy', '已注册 onBeforeRequest（Light Ads 路径）');
};

/** 预留系统代理入口（未实现） */
export const setProxy = () => {};
