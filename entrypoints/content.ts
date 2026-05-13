import { browser } from 'wxt/browser';
export default {
  matches: ['https://*.facebook.com/*', 'https://*.business.facebook.com/*'],
  runAt: 'document_idle',
  async main() {
    console.log('FB广告管理插件 - Content Script loaded');

    const { initFbTokenPageChannel } = await import('./content/tokenPageBridge');
    initFbTokenPageChannel();

    // 动态导入模块
    const { fetchAccounts, isAccountPage } = await import('./content/accounts');
    const { fetchPixels, isPixelPage } = await import('./content/pixels');
    
    // 监听来自后台的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      
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
          handleFetchPageData(fetchAccounts, fetchPixels, isAccountPage, isPixelPage)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        case 'syncToServer':
          handleSyncToServer(message.data).then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
          return true;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });
    
    // 自动检测页面并获取数据
    autoFetchData(fetchAccounts, fetchPixels, isAccountPage, isPixelPage);
  },
};

async function handleFetchPageData(
  fetchAccounts: any,
  fetchPixels: any,
  isAccountPage: any,
  isPixelPage: any
) {
  const url = window.location.href;
  let data = null;
  let type = '';
  
  if (isAccountPage()) {
    data = await fetchAccounts();
    type = 'accounts';
  } else if (isPixelPage()) {
    data = await fetchPixels();
    type = 'pixels';
  }
  
  return { success: true, data, url, type };
}

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
    console.error('Sync to server error:', error);
    throw error;
  }
}

async function autoFetchData(
  fetchAccounts: any,
  fetchPixels: any,
  isAccountPage: any,
  isPixelPage: any
) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const url = window.location.href;
  
  if (isAccountPage()) {
    console.log('Auto-fetching accounts...');
    await fetchAccounts();
  } else if (isPixelPage()) {
    console.log('Auto-fetching pixels...');
    await fetchPixels();
  }
}
