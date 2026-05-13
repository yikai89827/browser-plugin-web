import { browser } from 'wxt/browser';
import { scheduleAccessTokenCaptureFromUrl } from '../fb/tokenWebRequestCapture';

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

        scheduleAccessTokenCaptureFromUrl(url);

        const lightApis = ['/lightads?', '/light_adsets?', '/light_campaigns?'];
        if (url.includes('facebook.com') && lightApis.some((p) => url.includes(p))) {
          try {
            const path = url.split(/[?#]/)[0];
            console.log('%c [fbControl] ads graph path:', 'color:yellowgreen;', path);
          } catch {
            /* ignore */
          }
        }
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
