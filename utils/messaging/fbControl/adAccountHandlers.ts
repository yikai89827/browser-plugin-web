import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlLog, fbControlWarn } from '../../fbControlLog';
import { getFbAccessToken } from '../../fb/accessTokenStore';
import { fetchAdAccountPaymentActivities } from '../../fb/adAccount/graphFetchAdAccountPaymentActivities';
import { renameAdAccountOnFacebook } from '../../fb/adAccount/graphAdAccountBatchOperations';
import {
  fetchAdAccountHiddenAdminCount,
  fetchAdAccountManageAdminCount,
} from '../../fb/adAccount/graphFetchAdAccountAssignedUsers';
import {
  syncAdAccountsFromGraphToIndexedDb,
  syncSingleAdAccountFromGraphToIndexedDb,
} from '../../fb/adAccount/graphAdAccountSyncService';
import {
  fetchUsdToCurrencyRate,
  fxRateResultFromPage,
  logFxRateResolved,
  roundFxRate,
} from '../../fb/adsPanel/currencyExchange';
import {
  fbIdbClearAccounts,
  fbIdbGetAccountLoose,
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
      fbControlLog('messaging:accounts', 'FB_CONTROL_SAVE_ACCOUNTS', { count: rows.length });
      const upserted = await fbIdbUpsertAccounts(rows);
      fbControlLog('messaging:accounts', 'SAVE_ACCOUNTS 完成', { upserted });
      return { success: true, payload: { upserted } };
    }

    case 'FB_CONTROL_MERGE_ACCOUNT': {
      const patch = message.data as Partial<FbAdAccountRecord> & { accountId: string };
      if (!patch?.accountId) {
        return { success: false, error: 'accountId required' };
      }
      fbControlLog('messaging:accounts', 'FB_CONTROL_MERGE_ACCOUNT', { accountId: patch.accountId });
      await fbIdbMergeAccount(patch);
      return { success: true };
    }

    case 'FB_CONTROL_GET_ACCOUNTS': {
      fbControlLog('messaging:accounts', 'FB_CONTROL_GET_ACCOUNTS');
      const list = await fbIdbGetAllAccounts();
      fbControlLog('messaging:accounts', 'GET_ACCOUNTS 返回', { count: list.length });
      return { success: true, payload: { list } };
    }

    case 'FB_CONTROL_GET_ACCOUNT': {
      const body = message.data as { accountId?: string } | undefined;
      const accountId = body?.accountId?.trim();
      if (!accountId) {
        return { success: false, error: 'accountId required' };
      }
      fbControlLog('messaging:accounts', 'FB_CONTROL_GET_ACCOUNT', { accountId });
      const account = await fbIdbGetAccountLoose(accountId);
      return { success: true, payload: { account: account ?? null } };
    }

    case 'FB_CONTROL_CLEAR_ACCOUNTS':
      fbControlLog('messaging:accounts', 'FB_CONTROL_CLEAR_ACCOUNTS');
      await fbIdbClearAccounts();
      return { success: true };

    case 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH': {
      fbControlLog('messaging:accounts', 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH 开始');
      const r = await syncAdAccountsFromGraphToIndexedDb();
      if (!r.ok) {
        fbControlWarn('messaging:accounts', 'Graph 同步失败', r.error);
        return { success: false, error: r.error };
      }
      fbControlLog('messaging:accounts', 'Graph 同步成功', { upserted: r.upserted, total: r.total });
      return { success: true, payload: { upserted: r.upserted, total: r.total } };
    }

    case 'FB_CONTROL_SYNC_AD_ACCOUNT_FROM_GRAPH': {
      const body = message.data as { accountId?: string } | undefined;
      const accountId = body?.accountId?.trim();
      if (!accountId) {
        return { success: false, error: 'accountId required' };
      }
      fbControlLog('messaging:accounts', 'FB_CONTROL_SYNC_AD_ACCOUNT_FROM_GRAPH', { accountId });
      const r = await syncSingleAdAccountFromGraphToIndexedDb(accountId);
      if (!r.ok) {
        fbControlWarn('messaging:accounts', '单账户 Graph 同步失败', r.error);
        return { success: false, error: r.error };
      }
      return { success: true, payload: { account: r.account } };
    }

    case 'FB_CONTROL_RENAME_AD_ACCOUNT': {
      const body = message.data as { accountId?: string; name?: string } | undefined;
      const accountId = body?.accountId?.trim();
      const name = body?.name?.trim();
      if (!accountId || !name) {
        return { success: false, error: 'accountId and name required' };
      }
      fbControlLog('messaging:accounts', 'FB_CONTROL_RENAME_AD_ACCOUNT', { accountId });
      const token = await getFbAccessToken();
      if (!token) {
        return { success: false, error: '未保存 access_token，无法重命名' };
      }
      try {
        await renameAdAccountOnFacebook(token, accountId, name);
        await fbIdbMergeAccount({ accountId, name });
        return { success: true, payload: { accountId, name } };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fbControlWarn('messaging:accounts', '重命名失败', msg);
        return { success: false, error: msg };
      }
    }

    case 'FB_CONTROL_GET_USD_EXCHANGE_RATE': {
      const body = message.data as
        | { currency?: string; pageUsdToCurrencyRate?: number }
        | undefined;
      const currency = body?.currency?.trim().toUpperCase();
      if (!currency) {
        return { success: false, error: 'currency required' };
      }
      try {
        const pageRate = body?.pageUsdToCurrencyRate;
        if (pageRate != null && Number.isFinite(pageRate) && pageRate > 0) {
          const fx = fxRateResultFromPage(pageRate);
          logFxRateResolved(currency, fx, { via: 'FB_CONTROL_GET_USD_EXCHANGE_RATE' });
          return {
            success: true,
            payload: {
              rate: fx.rawRate,
              source: fx.source,
              effectiveRate: roundFxRate(fx.rawRate),
            },
          };
        }
        const token = await getFbAccessToken();
        if (!token?.trim()) {
          fbControlLog('messaging:accounts', '汇率：无 access_token，无法请求 Meta Graph', {
            currency,
          });
        }
        const fx = await fetchUsdToCurrencyRate(currency, { accessToken: token });
        logFxRateResolved(currency, fx, { via: 'FB_CONTROL_GET_USD_EXCHANGE_RATE', hasToken: Boolean(token) });
        return {
          success: true,
          payload: {
            rate: fx.rawRate,
            source: fx.source,
            effectiveRate: roundFxRate(fx.rawRate),
          },
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fbControlWarn('messaging:accounts', '汇率获取失败', msg);
        return { success: false, error: msg };
      }
    }

    case 'FB_CONTROL_FETCH_MANAGE_ADMIN_COUNT': {
      const body = message.data as { accountId?: string; hintBmIds?: string[] } | undefined;
      const accountId = body?.accountId?.trim();
      if (!accountId) {
        return { success: false, error: 'accountId required' };
      }
      const token = await getFbAccessToken();
      if (!token) {
        return { success: false, error: '未保存 access_token' };
      }
      try {
        const count = await fetchAdAccountManageAdminCount(token, accountId, {
          hintBmIds: body?.hintBmIds,
        });
        return { success: true, payload: { count } };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: msg };
      }
    }

    case 'FB_CONTROL_FETCH_HIDDEN_ADMIN_COUNT': {
      const body = message.data as { accountId?: string; hintBmIds?: string[] } | undefined;
      const accountId = body?.accountId?.trim();
      if (!accountId) {
        return { success: false, error: 'accountId required' };
      }
      const token = await getFbAccessToken();
      if (!token) {
        return { success: false, error: '未保存 access_token' };
      }
      try {
        const count = await fetchAdAccountHiddenAdminCount(token, accountId, {
          hintBmIds: body?.hintBmIds,
        });
        return { success: true, payload: { count } };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: msg };
      }
    }

    case 'FB_CONTROL_FETCH_AD_ACCOUNT_PAYMENTS': {
      const body = message.data as { accountId?: string } | undefined;
      const accountId = body?.accountId?.trim();
      if (!accountId) {
        return { success: false, error: 'accountId required' };
      }
      fbControlLog('messaging:accounts', 'FB_CONTROL_FETCH_AD_ACCOUNT_PAYMENTS', { accountId });
      const token = await getFbAccessToken();
      if (!token) {
        return { success: false, error: '未保存 access_token，无法查询支付记录' };
      }
      try {
        const result = await fetchAdAccountPaymentActivities(token, accountId);
        return { success: true, payload: result };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fbControlWarn('messaging:accounts', '支付记录 Graph 失败', msg);
        return { success: false, error: msg };
      }
    }

    default:
      return null;
  }
}
