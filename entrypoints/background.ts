import { browser } from 'wxt/browser';
import { getWebRequestHeaders, getWebResponseHeaders } from '../utils/connect/proxy';
import { Connection } from '../utils/connect/background';
import { initEvent } from '../utils/event';

export default {
  main() {
    console.log('Background script initialized, browser', browser);
    
    // 初始化连接和事件
    Connection.getTabId();
    getWebRequestHeaders();
    getWebResponseHeaders();
    initEvent();
    
    // 监听来自popup和content的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Background received message:', message);
      
      switch (message.action) {
        case 'SYNC_TO_SERVER':
          handleSyncToServer(message.data).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;
          
        case 'GET_LOCAL_DATA':
          handleGetLocalData(message.type).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;
          
        case 'FETCH_TAB_DATA':
          handleFetchTabData(sender.tab?.id).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;
      }
    });
    
    // 监听插件安装
    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('Extension installed');
        initializeStorage();
      }
    });
  },
};

async function handleSyncToServer(data: any) {
  try {
    const apiUrl = 'http://localhost:3000/api/sync';
    
    const response = await fetch(apiUrl, {
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
    console.log('Data synced to server:', result);
    
    return { success: true, data: result };
  } catch (error) {
    console.error('Sync to server error:', error);
    throw error;
  }
}

async function handleGetLocalData(type: string) {
  try {
    const storageKey = type === 'accounts' ? 'fb_control_accounts' : 'fb_control_pixels';
    const data: any = await browser.storage.local.get(storageKey);
    
    return { 
      success: true, 
      data: data[storageKey] ? JSON.parse(data[storageKey]) : [] 
    };
  } catch (error) {
    console.error('Get local data error:', error);
    throw error;
  }
}

async function handleFetchTabData(tabId?: number) {
  try {
    if (!tabId) {
      throw new Error('No tab ID provided');
    }
    
    const response = await browser.tabs.sendMessage(tabId, {
      action: 'fetchPageData'
    });
    
    return response;
  } catch (error) {
    console.error('Fetch tab data error:', error);
    throw error;
  }
}

async function initializeStorage() {
  try {
    await browser.storage.local.set({
      'fb_control_accounts': JSON.stringify([]),
      'fb_control_pixels': JSON.stringify([]),
      'fb_control_received_shares': JSON.stringify([]),
      'fb_control_sent_shares': JSON.stringify([]),
      'fb_control_sync_logs': JSON.stringify([]),
      'fb_control_last_sync': null
    });
    console.log('Storage initialized');
  } catch (error) {
    console.error('Initialize storage error:', error);
  }
}
