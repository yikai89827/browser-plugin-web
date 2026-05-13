import { browser } from 'wxt/browser';
import { browserStorage } from '../../utils/storage';
import { describeToken } from '../fb/tokenDebugLog';
import { extractAccessTokenFromUrl } from '../fb/extractAccessTokenFromUrl';
import { saveFbAccessToken } from '../fb/accessTokenStore';

function redactPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.slice(0, 120);
  } catch {
    return url.slice(0, 80);
  }
}

function isFacebookRequestUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === 'facebook.com' ||
      h.endsWith('.facebook.com') ||
      h === 'fb.com' ||
      h.endsWith('.fb.com')
    );
  } catch {
    return url.includes('facebook.com');
  }
}

/** 从请求 URL 捕获 Graph / Ads Manager 使用的 access_token，写入 chrome.storage.local */
async function captureFbTokenFromRequestUrl(url: string): Promise<void> {
  if (!isFacebookRequestUrl(url)) return;
  const token = extractAccessTokenFromUrl(url);
  if (!token) return;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = 'unknown';
  }
  console.info(
    '[fbControl:token] 从请求 URL 解析到 access_token，准备写入本地 storage',
    { host, path: redactPath(url), token: describeToken(token) }
  );
  await saveFbAccessToken(token, host);
  console.info('[fbControl:token] access_token 已保存（含 lyRequestHeadersToken 兼容写入）', {
    host,
    token: describeToken(token),
  });
  // 兼容旧键名（若其它模块读取）
  await browserStorage.set('lyRequestHeadersToken', token);
}

// 监听网络请求
export const getWebRequestHeaders = () => {
  if (!browser || !browser.webRequest) {
    console.error('browser.webRequest is not available');
    return;
  }

  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        const { url } = details;
        if (!url) return { requestHeaders: details.requestHeaders };

        void captureFbTokenFromRequestUrl(url).catch((e) =>
          console.warn('[fbControl:token] 捕获或保存 token 失败', e)
        );

      } catch (error) {
        console.error('Error in webRequest listener:', error);
      }
      return { requestHeaders: details.requestHeaders };
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders']
  );

  console.log('Web request listener added successfully');
};

// 监听响应头事件
export const getWebResponseHeaders = () => {
  if (!browser || !browser.webRequest) {
    console.error('browser.webRequest is not available');
    return;
  }

  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      try {
        const { url, method } = details;
        if (url && (url.includes('facebook.com') || url.includes('baidu.com'))) {
          console.log('%c 响应地址:', 'color:green;', url, method);
        }
      } catch (error) {
        console.error('Error in webResponse listener:', error);
      }
      return { responseHeaders: details.responseHeaders };
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );

  console.log('Web response listener added successfully');
};

export const processApiResponse = (response: any): any => {
  return response;
};

async function handleApiRequest(url: string): Promise<{ redirectUrl?: string } | undefined> {
  return undefined;
}

export const interceptApiRequests = () => {
  if (!browser || !browser.webRequest) {
    console.error('browser.webRequest is not available');
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
        console.error('Error in API request interceptor:', error);
      }
      return {};
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );

  console.log('API request interceptor added successfully');
};

export const setProxy = () => {};
