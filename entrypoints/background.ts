import { browser } from 'wxt/browser';
import { getWebRequestHeaders, getWebResponseHeaders } from '../utils/connect/proxy';
import { Connection } from '../utils/connect/background';
import { initEvent } from '../utils/event';
import { handleFbControlMessage } from '../utils/messaging/fbControlBackgroundHandlers';
import { fbIdbGetAllAccounts, fbIdbGetAllPixelShares } from '../utils/storage/fbControlIndexedDB';

export default {
  main() {
    console.log('Background script initialized, browser', browser);

    Connection.getTabId();
    getWebRequestHeaders();
    getWebResponseHeaders();
    initEvent();

    const routeMessage = async (
      message: { action: string; data?: unknown; tabId?: number },
      sender: { tab?: { id?: number } }
    ) => {
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
          return { success: false, error: `Unknown action: ${message.action}` };
        }
      }
    };

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Background received message:', message);

      routeMessage(message as { action: string; data?: unknown; tabId?: number }, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ success: false, error: String(err?.message || err) });
        });

      return true;
    });

    const ext = browser.runtime as typeof browser.runtime & {
      onMessageExternal?: typeof browser.runtime.onMessage;
    };
    ext.onMessageExternal?.addListener((message, sender, sendResponse) => {
      console.log('Background external message:', message);
      routeMessage(message as { action: string; data?: unknown; tabId?: number }, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ success: false, error: String(err?.message || err) });
        });
      return true;
    });

    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('Extension installed');
        initializeStorage();
      }
    });
  },
};

async function handleSyncToServer(data: unknown) {
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
    console.error('Get local data error:', error);
    throw error;
  }
}

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

    return browser.tabs.sendMessage(id, {
      action: 'fetchPageData',
    });
  } catch (error) {
    console.error('Fetch tab data error:', error);
    throw error;
  }
}

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
    console.log('Storage initialized');
  } catch (error) {
    console.error('Initialize storage error:', error);
  }
}
