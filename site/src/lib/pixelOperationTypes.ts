import type { FbPixelShareRecord, PixelDrawerKind } from '../../../interfaces/fbControl';

export type { PixelDrawerKind };

/** 批量创建像素：BM 下全部账户各 1 个，或指定账户 1 个 */
export type PixelBatchCreateMode = 'bm_all_accounts' | 'single_account';

export interface PixelBmOption {
  id: string;
  name?: string;
}

export interface PixelChecklistItem {
  id: string;
  label: string;
}

export interface PixelOpResultRow {
  pixelId?: string;
  targetId: string;
  status: string;
  detail: string;
}

export interface PixelDrawerPreset {
  kind: PixelDrawerKind;
  headerTitle: string;
  /** 第 1 步说明（删除类） */
  step1Notice?: string;
  step2Label: string;
  step2Hint?: string;
}

export interface PixelDrawerSubmitPayload {
  kind: PixelDrawerKind;
  bmId: string;
  bmName?: string;
  /** 删除类：当前操作的像素 */
  pixelId: string;
  pixelName?: string;
  /** 批量创建模式 */
  batchCreateMode?: PixelBatchCreateMode;
  /** 批量创建（指定账户模式）：目标广告账户 */
  adAccountId?: string;
  /** 批量创建：像素名称 */
  namePrefix?: string;
  /** 删除类：勾选的 ad account / partner / admin id */
  selectedTargetIds: string[];
  useDefaultInterval: boolean;
}

export type PixelDrawerContext = {
  bmId: string;
  bmName?: string;
  pixelId: string;
  pixelName?: string;
};

export function pixelDrawerContextFromRows(rows: FbPixelShareRecord[]): PixelDrawerContext | null {
  if (!rows.length) return null;
  const r = rows[0];
  const bmId = r.bmId?.trim() || '';
  const pixelId = r.pixelId?.trim() || '';
  if (!bmId || !pixelId) return null;
  return {
    bmId,
    bmName: r.bmName,
    pixelId,
    pixelName: r.pixelName,
  };
}

export function getPixelDrawerPreset(kind: PixelDrawerKind, ctx?: PixelDrawerContext | null): PixelDrawerPreset {
  const bm = ctx?.bmId || '—';
  switch (kind) {
    case 'assign_to_account':
      return {
        kind,
        headerTitle: '分配给账号',
        step1Notice: `①当前像素所在BM为${bm}，请确保广告账号已经添加到该BM。\n②添加方法：广告账号管理 -> 添加到BM -> 分享给BM（可移除）`,
        step2Label: '广告账号列表',
        step2Hint: '列表来自Facebook （BM 下 owned/client 广告账户）',
      };
    case 'assign_to_people':
      return {
        kind,
        headerTitle: '分配给人员',
        step1Notice:
          `①当前像素所在 BM 为 ${bm}，被分配人须已是该 BM 成员（商务用户编号，非个人好友 UID）。\n` +
          `②通过 Graph 分配像素权限需使用 BM「资产组合」：若 BM 仅有一个资产组合，系统会尝试自动把本像素加入该组合；否则请先在 business.facebook.com 将像素加入资产组合。\n` +
          `③access_token 须为 BM 管理员且含 business_management。`,
        step2Label: 'BM人员列表',
        step2Hint: '列表来自 Facebook Graph（BM business_users，id 为商务用户编号）',
      };
    case 'batch_create':
      return {
        kind,
        headerTitle: '批量创建像素',
        step1Notice:
          '使用须知：选择创建方式后指定 BM；「BM 下全部账户」将为每个广告账户各创建 1 个像素，「指定账户」仅在所选账户下创建 1 个像素。',
        step2Label: '创建方式与 BM',
        step2Hint: '像素通过Facebook Graph API 创建在广告账户上',
      };
    case 'delete_ad_account':
      return {
        kind,
        headerTitle: '删除广告账号',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的广告账号，需分别执行。`,
        step2Label: '请选择你要删除的广告账号',
        step2Hint: '列表来自Facebook 像素关联的广告账户',
      };
    case 'delete_partner':
      return {
        kind,
        headerTitle: '删除合作伙伴',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的合作伙伴，需分别执行。`,
        step2Label: '选择你需要删除的合作伙伴账号ID',
        step2Hint: '列表来自Facebook 像素 shared_agencies',
      };
    case 'delete_admin':
      return {
        kind,
        headerTitle: '删除管理员',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的管理员，需分别执行。`,
        step2Label: '选择你要删除的管理员账号ID',
        step2Hint: '列表来自Facebook 像素 assigned_users',
      };
    default:
      return {
        kind: 'batch_create',
        headerTitle: '像素操作',
        step2Label: '',
      };
  }
}
