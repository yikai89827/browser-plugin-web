import { browser } from 'wxt/browser';
import type { FbPixelCollectPayload } from '../interfaces/fbControl';
import { fbControlError, fbControlLog } from '../utils/fbControlLog';

/**
 * Facebook / Business 域名内容脚本入口：Token 双通道、账户/像素 DOM 采集、与后台消息。
 */
export default {
  matches: ['https://*.facebook.com/*', 'https://*.business.facebook.com/*'],
  runAt: 'document_idle',
  async main() {
    fbControlLog('content', 'Content script 已注入', { href: window.location.href });

    const { initFbTokenPageChannel } = await import('./content/tokenPageBridge');
    initFbTokenPageChannel();

    const { fetchAccounts, isAccountPage } = await import('./content/accounts');
    const { fetchPixels, isPixelPage } = await import('./content/pixels');
    const { initAdsPanelOnPage } = await import('./content/adsPanel');
    initAdsPanelOnPage();

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      fbControlLog('content', 'onMessage', { action: (message as { action?: string }).action });
      
      switch (message.action) {
        case 'fetchAccounts':
          fetchAccounts().then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        case 'fetchPixels':
          fetchPixels().then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        case 'fetchPageData':
          handleFetchPageData(fetchAccounts, fetchPixels, isAccountPage, isPixelPage, message)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        case 'syncToServer':
          handleSyncToServer(message.data).then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        default:
          fbControlLog('content', '未知 message.action', { action: (message as { action?: string }).action });
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });

    autoFetchData(fetchAccounts, fetchPixels, isAccountPage, isPixelPage);
  },
};

/** 根据当前 URL 调用账户或像素采集，供后台 fetchPageData 使用 */
async function handleFetchPageData(
  fetchAccounts: any,
  fetchPixels: any,
  isAccountPage: any,
  isPixelPage: any,
  message?: { pixelCollect?: FbPixelCollectPayload }
) {
  const url = window.location.href;
  let data = null;
  let type = '';

  if (isAccountPage()) {
    fbControlLog('content', 'handleFetchPageData: 账户页', { url });
    data = await fetchAccounts();
    type = 'accounts';
  } else if (message?.pixelCollect || isPixelPage()) {
    fbControlLog('content', 'handleFetchPageData: 像素采集', {
      url,
      pixelCollect: message?.pixelCollect,
      isPixelPage: isPixelPage(),
    });
    data = await fetchPixels(message?.pixelCollect);
    type = 'pixels';
  }

  return { success: true, data, url, type };
}

/** 将 content 抓取结果 POST 到本地占位 API（遗留） */
async function handleSyncToServer(data: any) {
  try {
    const response = await fetch('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    fbControlError('content', 'handleSyncToServer 失败', error);
    throw error;
  }
}

/** 页面加载约 2s 后自动采集（账户或像素页） */
async function autoFetchData(
  fetchAccounts: any,
  fetchPixels: any,
  isAccountPage: any,
  isPixelPage: any
) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const url = window.location.href;

  if (isAccountPage()) {
    fbControlLog('content', 'autoFetchData: 拉取账户', { url });
    await fetchAccounts();
  } else if (isPixelPage()) {
    fbControlLog('content', 'autoFetchData: 拉取像素', { url });
    await fetchPixels();
  }
}
