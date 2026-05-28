import type { FbAdAccountRecord, FbPixelShareRecord } from '../../interfaces/fbControl';
import {
  isBillingAccountTypeLabel,
  normalizeFundingDisplayString,
} from '../fb/adAccount/adAccountDisplayMaps';
import { normalizeAccountId } from '../fb/adAccount/mapGraphAdAccount';
import { fbControlError, fbControlLog } from '../fbControlLog';
import {
  preserveLocalAdAccountFields,
  recordHasOwnKey,
} from './fbAdAccountLocalMerge';

const DB_NAME = 'fb_control_extension';
const DB_VERSION = 1;
const STORE_ACCOUNTS = 'ad_accounts';
const STORE_PIXELS = 'pixel_shares';

export type MergeAdAccountOptions = {
  /** Graph 全量同步：清除「隐藏管理员」本地计数，表格恢复「加载」按钮 */
  resetHiddenAdminCount?: boolean;
};

/** 统一主键为纯数字 act id，避免 act_ 前缀与无前缀两条记录导致本地字段丢失 */
export function canonicalAdAccountId(accountId: string): string {
  const raw = String(accountId).trim();
  return normalizeAccountId(raw.replace(/^act_/i, ''), raw);
}

function accountMapKey(row: FbAdAccountRecord): string {
  return canonicalAdAccountId(row.accountId);
}

function buildAdAccountMap(existing: FbAdAccountRecord[]): Map<string, FbAdAccountRecord> {
  const map = new Map<string, FbAdAccountRecord>();
  for (const row of existing) {
    const key = accountMapKey(row);
    const prev = map.get(key);
    const normalized: FbAdAccountRecord = { ...row, accountId: key };
    map.set(key, prev ? mergeAdAccount(prev, normalized) : normalized);
  }
  return map;
}

/** 写入时合并，保留本地已改的收藏、备注、推送状态等 */
function mergeAdAccount(
  prev: FbAdAccountRecord | undefined,
  incoming: FbAdAccountRecord,
  options?: MergeAdAccountOptions
): FbAdAccountRecord {
  const p = prev;
  const accountId = canonicalAdAccountId(incoming.accountId);
  const normalizedIncoming: FbAdAccountRecord = { ...incoming, accountId };
  const out: FbAdAccountRecord = {
    ...(p ?? ({} as FbAdAccountRecord)),
    ...normalizedIncoming,
    accountId,
    capturedAt: normalizedIncoming.capturedAt ?? p?.capturedAt ?? Date.now(),
  };
  preserveLocalAdAccountFields(p, out, normalizedIncoming, (key) =>
    recordHasOwnKey(normalizedIncoming, key)
  );
  if (options?.resetHiddenAdminCount) {
    delete out.hiddenAdminCount;
  } else if (
    !recordHasOwnKey(normalizedIncoming, 'hiddenAdminCount') &&
    p?.hiddenAdminCount !== undefined
  ) {
    out.hiddenAdminCount = p.hiddenAdminCount;
  }
  if (!recordHasOwnKey(normalizedIncoming, 'userRoleRaw') && p?.userRoleRaw !== undefined) {
    out.userRoleRaw = p.userRoleRaw;
  }
  if (
    (!recordHasOwnKey(normalizedIncoming, 'ownerRole') ||
      String(normalizedIncoming.ownerRole ?? '').trim() === '') &&
    p?.ownerRole != null &&
    String(p.ownerRole).trim() !== ''
  ) {
    out.ownerRole = p.ownerRole;
  }
  if (!recordHasOwnKey(normalizedIncoming, 'adminCount') && p?.adminCount !== undefined) {
    out.adminCount = p.adminCount;
  }
  if (isBillingAccountTypeLabel(out.accountKindLabel)) {
    delete out.accountKindLabel;
  }
  if (
    (!recordHasOwnKey(normalizedIncoming, 'accountKindLabel') ||
      String(normalizedIncoming.accountKindLabel ?? '').trim() === '' ||
      isBillingAccountTypeLabel(normalizedIncoming.accountKindLabel)) &&
    p?.accountKindLabel != null &&
    String(p.accountKindLabel).trim() !== '' &&
    !isBillingAccountTypeLabel(p.accountKindLabel)
  ) {
    out.accountKindLabel = p.accountKindLabel;
  }
  if (out.paymentMethod != null && String(out.paymentMethod).trim()) {
    out.paymentMethod = normalizeFundingDisplayString(String(out.paymentMethod));
  }
  if (
    (!recordHasOwnKey(normalizedIncoming, 'formattedDsl') ||
      String(normalizedIncoming.formattedDsl ?? '').trim() === '') &&
    p?.formattedDsl?.trim()
  ) {
    out.formattedDsl = p.formattedDsl;
  }
  if (
    (normalizedIncoming.accountCurrencyRatioToUsd == null ||
      !Number.isFinite(normalizedIncoming.accountCurrencyRatioToUsd) ||
      normalizedIncoming.accountCurrencyRatioToUsd <= 0) &&
    p?.accountCurrencyRatioToUsd != null &&
    p.accountCurrencyRatioToUsd > 0
  ) {
    out.accountCurrencyRatioToUsd = p.accountCurrencyRatioToUsd;
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

/** 按数字 ID 读取（兼容 act_ 前缀与库内主键差异） */
export async function fbIdbGetAccountLoose(
  accountId: string
): Promise<FbAdAccountRecord | undefined> {
  const raw = String(accountId).replace(/^act_/i, '').trim();
  if (!raw) return undefined;
  const direct = await fbIdbGetAccount(raw);
  if (direct) return direct;
  const prefixed = await fbIdbGetAccount(`act_${raw}`);
  if (prefixed) return prefixed;
  const all = await fbIdbGetAllAccounts();
  return all.find((r) => String(r.accountId).replace(/^act_/i, '') === raw);
}

/**
 * 批量合并写入广告账户；与已有行按 `accountId` 合并，保留收藏/备注等本地字段。
 * @returns 本次参与合并的传入行数（非库内总行数）
 */
export async function fbIdbUpsertAccounts(
  rows: FbAdAccountRecord[],
  options?: MergeAdAccountOptions
): Promise<number> {
  if (!rows.length) return 0;
  const existing = await fbIdbGetAllAccounts();
  const map = buildAdAccountMap(existing);
  let count = 0;
  for (const row of rows) {
    if (!row.accountId) continue;
    const key = accountMapKey(row);
    map.set(key, mergeAdAccount(map.get(key), row, options));
    count++;
  }
  if (options?.resetHiddenAdminCount) {
    for (const r of map.values()) {
      delete r.hiddenAdminCount;
    }
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
  const key = canonicalAdAccountId(patch.accountId);
  const prev = await fbIdbGetAccountLoose(key);
  const incoming: FbAdAccountRecord = {
    accountId: key,
    name: patch.name ?? prev?.name ?? key,
    status: patch.status ?? prev?.status ?? 'unknown',
    capturedAt: prev?.capturedAt ?? Date.now(),
    ...prev,
    ...patch,
    accountId: key,
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
