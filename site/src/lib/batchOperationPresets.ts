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

/** 「添加到 BM」子下拉：认领（不可移除）/ 分享（可移除） */
export const ADD_BM_SUB_OPTIONS: NonNullable<BatchDrawerPreset['subOptions']> = [
  { id: 'bm_claim', label: 'BM认领它们(不可移除)' },
  { id: 'bm_share', label: '分享给BM(可移除)' },
];

/** 「BM 合作伙伴」子下拉 */
export const BM_PARTNER_SUB_OPTIONS: NonNullable<BatchDrawerPreset['subOptions']> = [
  { id: 'assign_partner_ads', label: '分配合作伙伴(广告权限)' },
];

/** 「删除授权」入口专用：子下拉为具体删除策略；UID 在抽屉内单独步骤填写（无好友检测） */
export const REMOVE_AUTH_OPERATIONS: BatchOperationOption[] = [
  { id: 'remove_perm_their', label: '删除它们的权限' },
  { id: 'remove_perm_except_them', label: '除了它们，删除所有' },
  { id: 'remove_perm_except_self', label: '除了自己，删除所有' },
  { id: 'remove_perm_self', label: '删除自己' },
  { id: 'remove_perm_bm', label: '删除BM' },
];

const STEP_AUTH: Pick<BatchDrawerPreset, 'step1' | 'step2' | 'step3' | 'confirmGates'> = {
  step1: {
    label: '* 输入 Facebook 账号 UID 或主页地址',
    placeholder:
      '100093137591614\nhttps://www.facebook.com/anasansari.gulfambatik\nhttps://www.facebook.com/profile.php?id=61558701983846',
    required: true,
  },
  step2: {
    label: '检测好友关系',
    hint:
      '请先完成步骤 1，再点击底部「检测好友关系」：通过后将自动切换到「结果」查看卡片；在结果页点击「确定」仅对已判定为好友的账号执行授权。若有未通过项，在「操作」页底部为「重新检测好友关系」。',
  },
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
    case 'remove_perm_their':
      return {
        step1: {
          label:
            '* 输入 Facebook 社交账号 UID 或主页地址',
          placeholder:
            '100093137591614\nhttps://www.facebook.com/anasansari.gulfambatik\nhttps://www.facebook.com/profile.php?id=61558701983846',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'remove_perm_except_them':
      return {
        step1: {
          label: '* 输入要保留的 Facebook 账号 UID 或主页地址（将删除列表以外的协作者）',
          placeholder: '每行一条…',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'remove_perm_except_self':
      return {
        step1: {
          label: '此模式可不填 UID；将删除除当前登录 Facebook 用户外的所有协作者',
          placeholder: '可留空',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
        showSubDropdown: false,
      };
    case 'remove_perm_self':
      return {
        step1: {
          label: '「删除自己」无需填写 UID',
          placeholder: '',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
        showSubDropdown: false,
      };
    case 'remove_perm_bm':
      return {
        step1: {
          label: '「删除 BM」当前版本未开放，无需填写',
          placeholder: '',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
        showSubDropdown: false,
      };
    case 'add_to_bm':
      return {
        step1: {
          label: '* 填写BM ID',
          placeholder: '100093137591614\n615587019838468',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'account_rename':
      return {
        step1: {
          label: '* 自动重命名账号',
          placeholder: 'new account name1\nnew account name2\nnew account name3',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'bm_partner':
      return {
        step1: {
          label: '* 填写BM ID',
          placeholder: '100093137591614\n615587019838468',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'account_push':
      return {
        step1: {
          label: '输入接收者邮箱',
          placeholder: 'xxx@xxx.com',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
        showSubDropdown: false,
      };
    case 'update_business':
      return {
        step1: {
          label: '请选择要修改的信息',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
        showSubDropdown: false,
      };
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
      return {
        entryKey: 'removeAuth',
        headerTitle: '删除广告账号权限',
        operations: REMOVE_AUTH_OPERATIONS,
        defaultOperationId: 'remove_perm_their',
        subOptions: undefined,
        defaultSubId: undefined,
        step1: {
          label: '* 输入Facebook社交账号的UID或主页地址',
          placeholder:
            '100093137591614\nhttps://www.facebook.com/...\nhttps://www.facebook.com/profile.php?id=...',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
      };
    case 'addBm':
      return {
        entryKey: 'addBm',
        headerTitle: '添加到BM',
        operations: [{ id: 'add_to_bm', label: '添加到BM' }],
        defaultOperationId: 'add_to_bm',
        subOptions: ADD_BM_SUB_OPTIONS,
        defaultSubId: 'bm_share',
        step1: {
          label: '* 填写BM ID',
          placeholder: '100093137591614\n615587019838468',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
      };
    case 'bmPartner':
      return {
        entryKey: 'bmPartner',
        headerTitle: 'BM合作伙伴',
        operations: [{ id: 'bm_partner', label: 'BM合作伙伴' }],
        defaultOperationId: 'bm_partner',
        subOptions: BM_PARTNER_SUB_OPTIONS,
        defaultSubId: 'assign_partner_ads',
        step1: {
          label: '* 填写BM ID',
          placeholder: '100093137591614\n615587019838468',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
      };
    case 'accountRename':
      return {
        entryKey: 'accountRename',
        headerTitle: '账号重命名',
        operations: [{ id: 'account_rename', label: '账号重命名' }],
        defaultOperationId: 'account_rename',
        subOptions: undefined,
        defaultSubId: undefined,
        step1: {
          label: '* 自动重命名账号',
          placeholder: 'new account name1\nnew account name2\nnew account name3',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
      };
    case 'updateCompany':
      return {
        entryKey: 'updateCompany',
        headerTitle: '更新Business信息',
        operations: [{ id: 'update_business', label: '更新Business信息' }],
        defaultOperationId: 'update_business',
        subOptions: undefined,
        defaultSubId: undefined,
        step1: {
          label: '请选择要修改的信息',
          required: false,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: [],
      };
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
      return {
        entryKey: 'accountPush',
        headerTitle: '推送数据',
        operations: [{ id: 'account_push', label: '推送数据' }],
        defaultOperationId: 'account_push',
        subOptions: undefined,
        defaultSubId: undefined,
        step1: {
          label: '输入接收者邮箱',
          placeholder: 'xxx@xxx.com',
          required: true,
        },
        step2: undefined,
        step3: { label: '系统默认执行时间间隔', defaultChecked: true },
        confirmGates: ['input'],
      };
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
