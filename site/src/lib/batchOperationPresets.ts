import type { BatchConfirmGate, BatchDrawerPreset, BatchOperationId, BatchOperationOption } from './batchOperationTypes';

const SUB_AUTH: NonNullable<BatchDrawerPreset['subOptions']> = [
  { id: 'admin', label: '授权管理员' },
  { id: 'ad_admin', label: '授权广告管理员' },
  { id: 'analyst', label: '授权广告分析员' },
];

/** 设计稿中的主操作全集（顺序与截图一致） */
export const BATCH_OPERATION_CATALOG: BatchOperationOption[] = [
  { id: 'add_ad_permissions', label: '增加广告账号权限' },
  { id: 'remove_ad_permissions', label: '删除广告账号权限' },
  { id: 'bm_partner', label: 'BM合作伙伴' },
  { id: 'add_to_bm', label: '添加到BM' },
  { id: 'account_rename', label: '账号重命名' },
  { id: 'update_business', label: '更新Business信息' },
];

const STEP_AUTH: Pick<BatchDrawerPreset, 'step1' | 'step2' | 'step3' | 'confirmGates'> = {
  step1: {
    label: '* 输入Facebook社交账号的UID或主页地址(先添加好友)',
    placeholder: '每行一个 UID 或主页链接…',
    required: true,
  },
  step2: { label: '检测好友关系', buttonText: '开始检测' },
  step3: { label: '系统默认执行时间间隔', defaultChecked: true },
  confirmGates: ['input', 'friend'],
};

/**
 * 主下拉当前选中的操作 → 步骤文案、校验、子下拉是否展示（与入口 preset 解耦）。
 */
export function getBatchOperationUi(operationId: BatchOperationId): {
  step1: BatchDrawerPreset['step1'];
  step2?: BatchDrawerPreset['step2'];
  step3?: BatchDrawerPreset['step3'];
  confirmGates: BatchConfirmGate[];
  showSubDropdown: boolean;
} {
  switch (operationId) {
    case 'add_ad_permissions':
    case 'remove_ad_permissions':
      return {
        ...STEP_AUTH,
        showSubDropdown: true,
      };
    case 'account_rename':
    case 'update_business':
    case 'set_limit':
    case 'remove_admin':
      return {
        step1: {
          label: '* 请填写必要参数（每行一条）',
          placeholder: '按所选操作填写：名称、BM ID、限额等…',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'reset_limit':
    case 'bm_partner':
    case 'add_to_bm':
    case 'account_push':
    case 'batch_payment_records':
    default:
      return {
        step1: {
          label: '补充说明（可选）',
          placeholder: '可选备注…',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
        showSubDropdown: false,
      };
  }
}

function presetAuthLike(
  entryKey: string,
  headerTitle: string,
  defaultOperationId: BatchOperationId,
  operations: BatchOperationOption[] = BATCH_OPERATION_CATALOG
): BatchDrawerPreset {
  return {
    entryKey,
    headerTitle,
    operations,
    defaultOperationId,
    subOptions: SUB_AUTH,
    defaultSubId: 'admin',
    ...STEP_AUTH,
  };
}

function presetSimple(
  entryKey: string,
  headerTitle: string,
  defaultOperationId: BatchOperationId,
  operations: BatchOperationOption[],
  requireInput = false
): BatchDrawerPreset {
  return {
    entryKey,
    headerTitle,
    operations,
    defaultOperationId,
    subOptions: undefined,
    defaultSubId: undefined,
    step1: {
      label: requireInput ? '* 请填写必要参数' : '补充说明或参数（可选）',
      placeholder: '每行一条…',
      required: requireInput,
    },
    step2: undefined,
    step3: { label: '系统默认执行时间间隔', defaultChecked: true },
    confirmGates: requireInput ? ['input'] : [],
  };
}

/**
 * 根据工具栏 / 更多菜单的入口 key 返回抽屉配置。
 * 不同按钮通过不同 `operations` 子集与 `defaultOperationId` 区分；执行逻辑在页面 onBatchDrawerConfirm。
 */
export function getBatchDrawerPreset(entryKey: string): BatchDrawerPreset {
  const catalog = BATCH_OPERATION_CATALOG;
  switch (entryKey) {
    case 'addAuth':
      return presetAuthLike('addAuth', '增加广告账号权限', 'add_ad_permissions', catalog);
    case 'removeAuth':
      return presetAuthLike('removeAuth', '删除广告账号权限', 'remove_ad_permissions', catalog);
    case 'addBm':
      return presetSimple('addBm', '添加到 BM', 'add_to_bm', catalog, false);
    case 'bmPartner':
      return presetSimple('bmPartner', 'BM 合作伙伴', 'bm_partner', catalog, false);
    case 'accountRename':
      return presetSimple('accountRename', '账号重命名', 'account_rename', catalog, true);
    case 'updateCompany':
      return presetSimple('updateCompany', '更新公司信息', 'update_business', catalog, true);
    case 'setLimit':
      return presetSimple(
        'setLimit',
        '设置账号限额',
        'set_limit',
        [{ id: 'set_limit', label: '设置限额' }],
        false
      );
    case 'resetLimit':
      return presetSimple(
        'resetLimit',
        '重置限额',
        'reset_limit',
        [{ id: 'reset_limit', label: '重置限额' }],
        false
      );
    case 'removeAdmin':
      return presetSimple(
        'removeAdmin',
        '移除管理员',
        'remove_admin',
        [{ id: 'remove_admin', label: '移除管理员' }],
        true
      );
    case 'accountPush':
      return presetSimple(
        'accountPush',
        '账号推送',
        'account_push',
        [{ id: 'account_push', label: '账号推送' }],
        false
      );
    case 'batchPaymentRecords':
      return presetSimple(
        'batchPaymentRecords',
        '支付记录',
        'batch_payment_records',
        [{ id: 'batch_payment_records', label: '支付记录' }],
        false
      );
    default:
      return presetSimple('unknown', '批量操作', 'add_ad_permissions', catalog, false);
  }
}
