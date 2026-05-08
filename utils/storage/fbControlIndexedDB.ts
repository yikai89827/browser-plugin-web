import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';

const DB_NAME = 'fb_control_extension';
const DB_VERSION = 1;
const STORE_ACCOUNTS = 'ad_accounts';
const STORE_PIXELS = 'pixel_shares';

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

export async function fbIdbUpsertAccounts(rows: FbAdAccountRecord[]): Promise<number> {
  if (!rows.length) return 0;
  const db = await openDb();
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readwrite');
    const store = tx.objectStore(STORE_ACCOUNTS);
    for (const row of rows) {
      if (!row.accountId) continue;
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
