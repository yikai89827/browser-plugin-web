import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';
import {
  fbIdbClearAccounts,
  fbIdbClearPixelShares,
  fbIdbGetAllAccounts,
  fbIdbGetAllPixelShares,
  fbIdbUpsertAccounts,
  fbIdbUpsertPixelShares,
} from '../storage/fbControlIndexedDB';

export type FbControlIncomingMessage = {
  action: string;
  data?: unknown;
};

export async function handleFbControlMessage(message: FbControlIncomingMessage) {
  switch (message.action) {
    case 'FB_CONTROL_PING':
      return { success: true, payload: { ok: true, version: 1 } };

    case 'FB_CONTROL_SAVE_ACCOUNTS': {
      const rows = (message.data as FbAdAccountRecord[]) || [];
      const n = await fbIdbUpsertAccounts(rows);
      return { success: true, payload: { upserted: n } };
    }

    case 'FB_CONTROL_SAVE_PIXEL_SHARES': {
      const rows = (message.data as FbPixelShareRecord[]) || [];
      const n = await fbIdbUpsertPixelShares(rows);
      return { success: true, payload: { upserted: n } };
    }

    case 'FB_CONTROL_GET_ACCOUNTS': {
      const list = await fbIdbGetAllAccounts();
      return { success: true, payload: { list } };
    }

    case 'FB_CONTROL_GET_PIXEL_SHARES': {
      const list = await fbIdbGetAllPixelShares();
      return { success: true, payload: { list } };
    }

    case 'FB_CONTROL_CLEAR_ACCOUNTS':
      await fbIdbClearAccounts();
      return { success: true };

    case 'FB_CONTROL_CLEAR_PIXEL_SHARES':
      await fbIdbClearPixelShares();
      return { success: true };

    default:
      return null;
  }
}
