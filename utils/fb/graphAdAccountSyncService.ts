/**
 * 使用本地已保存的 access_token 调用 Graph，并将广告账户写入 IndexedDB。
 * 单一职责：编排「读 token → 拉 Graph → 写库」，不含消息协议。
 */
import { getFbAccessToken } from './accessTokenStore';
import { fetchAdAccountsFromGraph } from './graphFetchAdAccounts';
import { fbIdbUpsertAccounts } from '../storage/fbControlIndexedDB';
import { describeToken } from './tokenDebugLog';

export type GraphAdAccountSyncResult =
  | { ok: true; upserted: number; total: number }
  | { ok: false; error: string };

const MISSING_TOKEN_MSG =
  '未保存 access_token。请在已登录的 Facebook 广告管理页操作以自动捕获，或使用「粘贴 Token」保存。';

export async function syncAdAccountsFromGraphToIndexedDb(): Promise<GraphAdAccountSyncResult> {
  console.info('[fbControl:graph] 收到「Graph 同步广告账户」请求');

  const token = await getFbAccessToken();
  if (!token) {
    console.warn(
      '[fbControl:graph] 中止：本地未保存 access_token，请先打开广告管理页自动捕获或粘贴 Token'
    );
    return { ok: false, error: MISSING_TOKEN_MSG };
  }

  console.info('[fbControl:graph] 已读取本地 token，开始请求 Graph', describeToken(token));

  const rows = await fetchAdAccountsFromGraph(token);

  console.info('[fbControl:graph] Graph 数据已映射，开始写入 IndexedDB', { rowCount: rows.length });

  const upserted = await fbIdbUpsertAccounts(rows);

  console.info('[fbControl:graph] IndexedDB 合并写入完成', { upserted, total: rows.length });

  return { ok: true, upserted, total: rows.length };
}
