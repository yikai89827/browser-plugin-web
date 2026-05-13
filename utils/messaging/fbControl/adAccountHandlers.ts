import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { syncAdAccountsFromGraphToIndexedDb } from '../../fb/graphAdAccountSyncService';
import {
  fbIdbClearAccounts,
  fbIdbGetAllAccounts,
  fbIdbMergeAccount,
  fbIdbUpsertAccounts,
} from '../../storage/fbControlIndexedDB';

/** 广告账户 IndexedDB + Graph 同步（与 token 消息协议、像素模块解耦） */
export async function handleFbControlAdAccountMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  switch (message.action) {
    case 'FB_CONTROL_SAVE_ACCOUNTS': {
      const rows = (message.data as FbAdAccountRecord[]) || [];
      const upserted = await fbIdbUpsertAccounts(rows);
      return { success: true, payload: { upserted } };
    }

    case 'FB_CONTROL_MERGE_ACCOUNT': {
      const patch = message.data as Partial<FbAdAccountRecord> & { accountId: string };
      if (!patch?.accountId) {
        return { success: false, error: 'accountId required' };
      }
      await fbIdbMergeAccount(patch);
      return { success: true };
    }

    case 'FB_CONTROL_GET_ACCOUNTS': {
      const list = await fbIdbGetAllAccounts();
      return { success: true, payload: { list } };
    }

    case 'FB_CONTROL_CLEAR_ACCOUNTS':
      await fbIdbClearAccounts();
      return { success: true };

    case 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH': {
      const r = await syncAdAccountsFromGraphToIndexedDb();
      if (!r.ok) {
        return { success: false, error: r.error };
      }
      return { success: true, payload: { upserted: r.upserted, total: r.total } };
    }

    default:
      return null;
  }
}
