import type { FbPixelShareRecord } from '../../../interfaces/fbControl';

function normalizeBmId(id?: string): string {
  return (id || '').replace(/\D/g, '');
}

/**
 * 与参考插件一致：表格「分享 / BM分享」双 ✓ 仅当所属 BM 与业主 BM 数字 ID 相同。
 * 表示本 BM 创建/自有像素，可使用 BM 间分享；业主为其他 BM 时（仅有管理员权限）为 ✗。
 */
export function isPixelSelfOwnedInBm(row: FbPixelShareRecord): boolean {
  const bm = normalizeBmId(row.bmId);
  const owner = normalizeBmId(row.ownerId);
  return !!(bm && owner && bm === owner);
}

/** 同步来源：曾出现在 client_pixels（他方 BM 分享给本 BM） */
export function isPixelSyncedAsClient(row: FbPixelShareRecord): boolean {
  return row.shareOk === true;
}

/** 同步来源：曾出现在 owned_pixels */
export function isPixelSyncedAsOwned(row: FbPixelShareRecord): boolean {
  return row.bmShareOk === true;
}
