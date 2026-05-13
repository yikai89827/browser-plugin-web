import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlLog } from '../../fbControlLog';
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

    default:
      return null;
  }
}
