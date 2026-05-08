import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';

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
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
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
  return count;
}

/** 局部更新单条（如站点上改收藏、备注） */
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

export async function fbIdbUpsertPixelShares(rows: FbPixelShareRecord[]): Promise<number> {
  if (!rows.length) return 0;
  const db = await openDb();
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PIXELS, 'readwrite');
    const store = tx.objectStore(STORE_PIXELS);
    for (const row of rows) {
      if (!row.id) continue;
      store.put(row);
      count++;
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
  return count;
}

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

export async function fbIdbClearAccounts(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}

export async function fbIdbClearPixelShares(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}
