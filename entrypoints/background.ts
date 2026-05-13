import { browser } from 'wxt/browser';
import { getWebRequestHeaders, getWebResponseHeaders } from '../utils/connect/proxy';
import { Connection } from '../utils/connect/background';
import { initEvent } from '../utils/event';
import { handleFbControlMessage } from '../utils/messaging/fbControlBackgroundHandlers';
import { fbIdbGetAllAccounts, fbIdbGetAllPixelShares } from '../utils/storage/fbControlIndexedDB';
import { fbControlError, fbControlLog, fbControlWarn } from '../utils/fbControlLog';

export default {
  main() {
    fbControlLog('background', 'Service worker 启动', { browser: typeof browser });

    Connection.getTabId();
    getWebRequestHeaders();
    getWebResponseHeaders();
    initEvent();

    const routeMessage = async (
      message: { action: string; data?: unknown; tabId?: number },
      sender: { tab?: { id?: number } }
    ) => {
      fbControlLog('background', 'routeMessage', { action: message.action });
      switch (message.action) {
        case 'SYNC_TO_SERVER':
          return handleSyncToServer(message.data);

        case 'GET_LOCAL_DATA':
          return handleGetLocalData(message.data as string);

        case 'FETCH_TAB_DATA':
          return handleFetchTabData(message.tabId ?? sender.tab?.id);

        default: {
          const fb = await handleFbControlMessage(message);
          if (fb) return fb;
          fbControlWarn('background', '未知 action', { action: message.action });
          return { success: false, error: `Unknown action: ${message.action}` };
        }
      }
    };

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      fbControlLog('background', 'runtime.onMessage', { action: (message as { action?: string }).action });

      routeMessage(message as { action: string; data?: unknown; tabId?: number }, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          fbControlError('background', 'onMessage 处理失败', err);
          sendResponse({ success: false, error: String(err?.message || err) });
        });

      return true;
    });

    const ext = browser.runtime as typeof browser.runtime & {
      onMessageExternal?: typeof browser.runtime.onMessage;
    };
    ext.onMessageExternal?.addListener((message, sender, sendResponse) => {
      fbControlLog('background', 'onMessageExternal', { action: (message as { action?: string }).action });
      routeMessage(message as { action: string; data?: unknown; tabId?: number }, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          fbControlError('background', 'onMessageExternal 处理失败', err);
          sendResponse({ success: false, error: String(err?.message || err) });
        });
      return true;
    });

    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        fbControlLog('background', '扩展首次安装，初始化本地占位存储');
        initializeStorage();
      }
    });
  },
};

/** 将本地数据 POST 到占位同步接口（遗留逻辑，与 fbControl IndexedDB 无强关联） */
async function handleSyncToServer(data: unknown) {
  try {
    fbControlLog('background', 'handleSyncToServer 开始');
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
    fbControlLog('background', 'handleSyncToServer 成功', { result });

    return { success: true, data: result };
  } catch (error) {
    fbControlError('background', 'handleSyncToServer 失败', error);
    throw error;
  }
}

/** 从 storage / IndexedDB 读取本地缓存（账户走 IndexedDB，其它类型走 legacy storage key） */
async function handleGetLocalData(type: string) {
  try {
    fbControlLog('background', 'handleGetLocalData', { type });
    if (type === 'accounts') {
      const list = await fbIdbGetAllAccounts();
      return { success: true, data: list };
    }
    if (type === 'pixels') {
      const list = await fbIdbGetAllPixelShares();
      return { success: true, data: list };
    }

    const storageKey = `fb_control_${type}`;
    const data: Record<string, unknown> = await browser.storage.local.get(storageKey);

    return {
      success: true,
      data: data[storageKey] ? JSON.parse(String(data[storageKey])) : [],
    };
  } catch (error) {
    fbControlError('background', 'handleGetLocalData 失败', error);
    throw error;
  }
}

/** 向指定标签页 content script 请求抓取页面数据 */
async function handleFetchTabData(tabId?: number) {
  try {
    let id = tabId;
    if (!id) {
      const tabs = await browser.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      id = tabs[0]?.id;
    }
    if (!id) {
      throw new Error('No tab ID for fetch');
    }

    fbControlLog('background', 'tabs.sendMessage fetchPageData', { tabId: id });
    return browser.tabs.sendMessage(id, {
      action: 'fetchPageData',
    });
  } catch (error) {
    fbControlError('background', 'handleFetchTabData 失败', error);
    throw error;
  }
}

/** 首次安装时写入空数组等占位，避免旧代码读 undefined */
async function initializeStorage() {
  try {
    await browser.storage.local.set({
      fb_control_accounts: JSON.stringify([]),
      fb_control_pixels: JSON.stringify([]),
      fb_control_received_shares: JSON.stringify([]),
      fb_control_sent_shares: JSON.stringify([]),
      fb_control_sync_logs: JSON.stringify([]),
      fb_control_last_sync: null,
    });
    fbControlLog('background', 'initializeStorage 完成');
  } catch (error) {
    fbControlError('background', 'initializeStorage 失败', error);
  }
}
