import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';
import {
  clearFbAccessToken,
  getFbAccessToken,
  getFbTokenMeta,
  saveFbAccessToken,
} from '../fb/accessTokenStore';
import { fetchAdAccountsFromGraph } from '../fb/graphFetchAdAccounts';
import { looksLikeFbUserToken } from '../fb/extractAccessTokenFromUrl';
import {
  fbIdbClearAccounts,
  fbIdbClearPixelShares,
  fbIdbGetAllAccounts,
  fbIdbGetAllPixelShares,
  fbIdbMergeAccount,
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

    case 'FB_CONTROL_MERGE_ACCOUNT': {
      const patch = message.data as Partial<FbAdAccountRecord> & { accountId: string };
      if (!patch?.accountId) {
        return { success: false, error: 'accountId required' };
      }
      await fbIdbMergeAccount(patch);
      return { success: true };
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

    case 'FB_CONTROL_GET_TOKEN_META': {
      const meta = await getFbTokenMeta();
      return { success: true, payload: meta };
    }

    /** 仅建议在受信环境使用；返回完整 token 供自有后台直连 Graph */
    case 'FB_CONTROL_GET_ACCESS_TOKEN': {
      const token = await getFbAccessToken();
      return { success: true, payload: { token } };
    }

    case 'FB_CONTROL_SET_ACCESS_TOKEN': {
      const body = message.data as { token?: string; sourceHost?: string } | undefined;
      const token = typeof body?.token === 'string' ? body.token.trim() : '';
      if (!token) {
        return { success: false, error: 'token required' };
      }
      if (!looksLikeFbUserToken(token)) {
        return { success: false, error: 'token format invalid' };
      }
      await saveFbAccessToken(token, body?.sourceHost || 'manual');
      return { success: true };
    }

    case 'FB_CONTROL_CLEAR_ACCESS_TOKEN':
      await clearFbAccessToken();
      return { success: true };

    case 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH': {
      const token = await getFbAccessToken();
      if (!token) {
        return {
          success: false,
          error: '未保存 access_token。请在已登录的 Facebook 广告管理页操作以自动捕获，或使用「粘贴 Token」保存。',
        };
      }
      const rows = await fetchAdAccountsFromGraph(token);
      const n = await fbIdbUpsertAccounts(rows);
      return { success: true, payload: { upserted: n, total: rows.length } };
    }

    default:
      return null;
  }
}
