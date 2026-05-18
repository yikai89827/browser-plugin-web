import type { FbPixelShareRecord, PixelDrawerKind } from '../../../interfaces/fbControl';

export type { PixelDrawerKind };

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
  /** 批量创建 */
  namePrefix?: string;
  count?: number;
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
        step2Hint: '列表来自 Facebook Graph（BM 下 owned/client 广告账户）',
      };
    case 'assign_to_people':
      return {
        kind,
        headerTitle: '分配给人员',
        step1Notice: `①当前像素所在BM为${bm}，请确保人员已经添加到该BM。\n②添加方法：人员管理 -> 添加到BM -> 像素分享给人员（可移除）`,
        step2Label: 'BM人员列表',
        step2Hint: '列表来自 Facebook Graph（BM business_users）',
      };
    case 'batch_create':
      return {
        kind,
        headerTitle: '批量创建像素',
        step1Notice:
          '使用须知：请先选择 BM，再填写像素名称前缀与数量；系统将按 Pixel1、Pixel2… 自动命名（最多 100 个）。',
        step2Label: 'BM账号列表',
        step2Hint: '选择要在哪个 Business Manager 下创建像素',
      };
    case 'delete_ad_account':
      return {
        kind,
        headerTitle: '删除广告账号',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的广告账号，需分别执行。`,
        step2Label: '请选择你要删除的广告账号',
        step2Hint: '列表来自 Facebook Graph（像素关联的广告账户）',
      };
    case 'delete_partner':
      return {
        kind,
        headerTitle: '删除合作伙伴',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的合作伙伴，需分别执行。`,
        step2Label: '选择你需要删除的合作伙伴账号ID',
        step2Hint: '列表来自 Facebook Graph（像素 shared_agencies）',
      };
    case 'delete_admin':
      return {
        kind,
        headerTitle: '删除管理员',
        step1Notice: `当前操作的BM为${bm}，如需删除其他BM的管理员，需分别执行。`,
        step2Label: '选择你要删除的管理员账号ID',
        step2Hint: '列表来自 Facebook Graph（像素 assigned_users）',
      };
    default:
      return {
        kind: 'batch_create',
        headerTitle: '像素操作',
        step2Label: '',
      };
  }
}
