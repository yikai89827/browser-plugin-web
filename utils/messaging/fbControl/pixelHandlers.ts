import { browser } from 'wxt/browser';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlError, fbControlLog } from '../../fbControlLog';
import {
  fbIdbClearPixelShares,
  fbIdbGetAllPixelShares,
  fbIdbUpsertPixelShares,
} from '../../storage/fbControlIndexedDB';

/** 像素分享 IndexedDB（与 token、广告账户 Graph 解耦） */
export async function handleFbControlPixelMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  switch (message.action) {
    case 'FB_CONTROL_SAVE_PIXEL_SHARES': {
      const rows = (message.data as FbPixelShareRecord[]) || [];
      fbControlLog('messaging:pixels', 'FB_CONTROL_SAVE_PIXEL_SHARES', { count: rows.length });
      const upserted = await fbIdbUpsertPixelShares(rows);
      fbControlLog('messaging:pixels', 'SAVE_PIXEL_SHARES 完成', { upserted });
      return { success: true, payload: { upserted } };
    }

    case 'FB_CONTROL_GET_PIXEL_SHARES': {
      fbControlLog('messaging:pixels', 'FB_CONTROL_GET_PIXEL_SHARES');
      const list = await fbIdbGetAllPixelShares();
      fbControlLog('messaging:pixels', 'GET_PIXEL_SHARES 返回', { count: list.length });
      return { success: true, payload: { list } };
    }

    case 'FB_CONTROL_CLEAR_PIXEL_SHARES':
      fbControlLog('messaging:pixels', 'FB_CONTROL_CLEAR_PIXEL_SHARES');
      await fbIdbClearPixelShares();
      return { success: true };

    /** 向当前窗口活动标签页注入的 content 发 `fetchPageData`，在 Facebook 页触发像素/账户采集并写入 IndexedDB */
    case 'FB_CONTROL_COLLECT_PIXEL_SHARES_FROM_ACTIVE_TAB': {
      fbControlLog('messaging:pixels', 'FB_CONTROL_COLLECT_PIXEL_SHARES_FROM_ACTIVE_TAB');
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab.url) {
        return { success: false, error: '没有可用的活动标签页' };
      }
      if (!/facebook\.com/i.test(tab.url)) {
        return {
          success: false,
          error: '当前活动标签页不是 Facebook 域名，请打开 business.facebook.com 并带上 business_id 后再试',
        };
      }
      try {
        const res = await browser.tabs.sendMessage(tab.id, { action: 'fetchPageData' });
        fbControlLog('messaging:pixels', 'fetchPageData 已返回', { tabId: tab.id, res });
        return { success: true, payload: res };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fbControlError('messaging:pixels', 'fetchPageData 失败', e);
        return {
          success: false,
          error: `${msg}（请确认该页已注入 fbControl 扩展、且为 BM/数据集/事件管理相关页面）`,
        };
      }
    }

    default:
      return null;
  }
}
