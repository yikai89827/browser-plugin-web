import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import { FB_AD_ACCOUNT_LOCAL_ONLY_KEYS } from '../../interfaces/fbControl';

function isBlankish(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/**
 * Graph / DOM 采集合并后，恢复不应被后台同步冲掉的本地字段。
 * @param incomingHasKey 传入行是否显式携带该键（区分「未提供」与「置空」）
 */
export function preserveLocalAdAccountFields(
  prev: FbAdAccountRecord | undefined,
  out: FbAdAccountRecord,
  incoming: FbAdAccountRecord,
  incomingHasKey: (key: keyof FbAdAccountRecord) => boolean
): void {
  if (!prev) return;

  for (const key of FB_AD_ACCOUNT_LOCAL_ONLY_KEYS) {
    if (key === 'favorite') {
      if (!incomingHasKey('favorite') && prev.favorite !== undefined) {
        out.favorite = prev.favorite;
      }
      continue;
    }
    if (!incomingHasKey(key) || isBlankish(incoming[key])) {
      const prevVal = prev[key];
      if (!isBlankish(prevVal)) {
        (out as Record<string, unknown>)[key] = prevVal;
      }
    }
  }
}

export function recordHasOwnKey(
  row: FbAdAccountRecord,
  key: keyof FbAdAccountRecord
): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}
