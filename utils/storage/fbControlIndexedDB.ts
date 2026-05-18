import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';
import { fbControlError, fbControlLog } from '../fbControlLog';

const DB_NAME = 'fb_control_extension';
const DB_VERSION = 1;
const STORE_ACCOUNTS = 'ad_accounts';
const STORE_PIXELS = 'pixel_shares';

/** 写入时合并，保留本地已改的收藏、备注等 */
function mergeAdAccount(
  prev: FbAdAccountRecord | undefined,
  incoming: FbAdAccountRecord
): FbAdAccountRecord {
  const p = prev;
  const out: FbAdAccountRecord = {
    ...(p ?? ({} as FbAdAccountRecord)),
    ...incoming,
    accountId: incoming.accountId,
    capturedAt: incoming.capturedAt ?? p?.capturedAt ?? Date.now(),
  };
  if (incoming.favorite === undefined && p?.favorite !== undefined) {
    out.favorite = p.favorite;
  }
  if (
    (incoming.remark === undefined || incoming.remark === '') &&
    p?.remark != null &&
    p.remark !== ''
  ) {
    out.remark = p.remark;
  }
  if (incoming.hiddenAdminCount === undefined && p?.hiddenAdminCount !== undefined) {
    out.hiddenAdminCount = p.hiddenAdminCount;
  }
  if (incoming.userRoleRaw === undefined && p?.userRoleRaw !== undefined) {
    out.userRoleRaw = p.userRoleRaw;
  }
  if (
    (incoming.ownerRole === undefined || String(incoming.ownerRole).trim() === '') &&
    p?.ownerRole != null &&
    String(p.ownerRole).trim() !== ''
  ) {
    out.ownerRole = p.ownerRole;
  }
  if (incoming.adminCount === undefined && p?.adminCount !== undefined) {
    out.adminCount = p.adminCount;
  }
  if (
    (incoming.accountKindLabel === undefined || String(incoming.accountKindLabel).trim() === '') &&
    p?.accountKindLabel != null &&
    String(p.accountKindLabel).trim() !== ''
  ) {
    out.accountKindLabel = p.accountKindLabel;
  }
  return out;
}

/** 写入时合并，保留本地已改的收藏、备注等 */
function mergePixelShare(
  prev: FbPixelShareRecord | undefined,
  incoming: FbPixelShareRecord
): FbPixelShareRecord {
  const p = prev;
  const out: FbPixelShareRecord = {
    ...(p ?? ({} as FbPixelShareRecord)),
    ...incoming,
    id: incoming.id,
    pixelId: incoming.pixelId || p?.pixelId || incoming.id,
    pixelName: incoming.pixelName || p?.pixelName || incoming.pixelId,
    capturedAt: incoming.capturedAt ?? p?.capturedAt ?? Date.now(),
  };
  if (incoming.favorite === undefined && p?.favorite !== undefined) {
    out.favorite = p.favorite;
  }
  if (
    (incoming.remark === undefined || incoming.remark === '') &&
    p?.remark != null &&
    p.remark !== ''
  ) {
    out.remark = p.remark;
  }
  return out;
}

/** 打开或升级 IndexedDB；失败时通过 Promise reject */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      fbControlError('idb', 'openDb 失败', req.error);
      reject(req.error);
    };
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'accountId' });
      }
      if (!db.objectStoreNames.contains(STORE_PIXELS)) {
        db.createObjectStore(STORE_PIXELS, { keyPath: 'id' });
      }
    };
  });
}

/** 按键读取单条广告账户 */
export async function fbIdbGetAccount(accountId: string): Promise<FbAdAccountRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readonly');
    const req = tx.objectStore(STORE_ACCOUNTS).get(accountId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as FbAdAccountRecord | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * 批量合并写入广告账户；与已有行按 `accountId` 合并，保留收藏/备注等本地字段。
 * @returns 本次参与合并的传入行数（非库内总行数）
 */
export async function fbIdbUpsertAccounts(rows: FbAdAccountRecord[]): Promise<number> {
  if (!rows.length) return 0;
  const existing = await fbIdbGetAllAccounts();
  const map = new Map(existing.map((r) => [r.accountId, r]));
  let count = 0;
  for (const row of rows) {
    if (!row.accountId) continue;
    map.set(row.accountId, mergeAdAccount(map.get(row.accountId), row));
    count++;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readwrite');
    const store = tx.objectStore(STORE_ACCOUNTS);
    for (const r of map.values()) {
      store.put(r);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
  fbControlLog('idb', 'fbIdbUpsertAccounts 完成', { incomingRows: count, storeSizeAfter: map.size });
  return count;
}

/** 局部更新单条账户（如站点改收藏、备注） */
export async function fbIdbMergeAccount(
  patch: Partial<FbAdAccountRecord> & { accountId: string }
): Promise<void> {
  const prev = await fbIdbGetAccount(patch.accountId);
  const incoming: FbAdAccountRecord = {
    accountId: patch.accountId,
    name: patch.name ?? prev?.name ?? patch.accountId,
    status: patch.status ?? prev?.status ?? 'unknown',
    capturedAt: prev?.capturedAt ?? Date.now(),
    ...prev,
    ...patch,
    accountId: patch.accountId,
  };
  await fbIdbUpsertAccounts([incoming]);
}

/** 按键读取单条像素分享 */
export async function fbIdbGetPixelShare(id: string): Promise<FbPixelShareRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PIXELS, 'readonly');
    const req = tx.objectStore(STORE_PIXELS).get(id);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as FbPixelShareRecord | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * 批量合并写入像素分享；与已有行按 `id` 合并，保留收藏/备注等本地字段。
 * @returns 本次参与合并的传入行数（非库内总行数）
 */
export async function fbIdbUpsertPixelShares(rows: FbPixelShareRecord[]): Promise<number> {
  if (!rows.length) return 0;
  const existing = await fbIdbGetAllPixelShares();
  const map = new Map(existing.map((r) => [r.id, r]));
  let count = 0;
  for (const row of rows) {
    if (!row.id) continue;
    map.set(row.id, mergePixelShare(map.get(row.id), row));
    count++;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PIXELS, 'readwrite');
    const store = tx.objectStore(STORE_PIXELS);
    for (const r of map.values()) {
      store.put(r);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
  fbControlLog('idb', 'fbIdbUpsertPixelShares 完成', { incomingRows: count, storeSizeAfter: map.size });
  return count;
}

/** 局部更新单条像素（如站点改收藏、备注） */
export async function fbIdbMergePixelShare(
  patch: Partial<FbPixelShareRecord> & { id: string }
): Promise<void> {
  const prev = await fbIdbGetPixelShare(patch.id);
  const incoming: FbPixelShareRecord = {
    id: patch.id,
    pixelId: patch.pixelId ?? prev?.pixelId ?? patch.id,
    pixelName: patch.pixelName ?? prev?.pixelName ?? patch.pixelId ?? patch.id,
    capturedAt: prev?.capturedAt ?? Date.now(),
    ...prev,
    ...patch,
    id: patch.id,
  };
  await fbIdbUpsertPixelShares([incoming]);
}

/** 读取全部广告账户 */
export async function fbIdbGetAllAccounts(): Promise<FbAdAccountRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readonly');
    const store = tx.objectStore(STORE_ACCOUNTS);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as FbAdAccountRecord[]) || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** 读取全部像素分享 */
export async function fbIdbGetAllPixelShares(): Promise<FbPixelShareRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PIXELS, 'readonly');
    const store = tx.objectStore(STORE_PIXELS);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as FbPixelShareRecord[]) || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** 清空广告账户表 */
export async function fbIdbClearAccounts(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readwrite');
    tx.objectStore(STORE_ACCOUNTS).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
  fbControlLog('idb', 'fbIdbClearAccounts 完成');
}

/** 清空像素分享表 */
export async function fbIdbClearPixelShares(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PIXELS, 'readwrite');
    tx.objectStore(STORE_PIXELS).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
  fbControlLog('idb', 'fbIdbClearPixelShares 完成');
}
