/** 主操作下拉项 id（与扩展对接时可沿用） */
export type BatchOperationId =
  | 'add_ad_permissions'
  | 'remove_ad_permissions'
  /** 「删除授权」抽屉专用：与增加授权主目录解耦 */
  | 'remove_perm_their'
  | 'remove_perm_except_them'
  | 'remove_perm_except_self'
  | 'remove_perm_self'
  | 'remove_perm_bm'
  | 'bm_partner'
  | 'add_to_bm'
  | 'account_rename'
  | 'update_business'
  | 'set_limit'
  | 'reset_limit'
  | 'remove_admin'
  | 'account_push'
  | 'batch_payment_records';

export interface BatchOperationOption {
  id: BatchOperationId;
  label: string;
}

export interface BatchSubOption {
  id: string;
  label: string;
}

export type BatchConfirmGate = 'input' | 'friend';

/** 由入口按钮决定的抽屉配置（下拉选项 + 步骤 + 校验规则） */
export interface BatchDrawerPreset {
  entryKey: string;
  /** 顶栏标题（与主操作名可一致） */
  headerTitle: string;
  /** 主下拉选项（不同入口可给不同子集或顺序） */
  operations: BatchOperationOption[];
  defaultOperationId: BatchOperationId;
  /** 带 L 型连线的子下拉；无则整段不展示 */
  subOptions?: BatchSubOption[];
  defaultSubId?: string;
  step1: {
    label: string;
    placeholder?: string;
    /** 为 true 时未填则禁用「确定」 */
    required: boolean;
  };
  /** 无则隐藏第 2 步（绿按钮） */
  step2?: {
    label: string;
    /** 为空则不显示独立检测按钮（可改为仅底部「检测好友关系」） */
    buttonText?: string;
    /** 步骤下灰字说明（例如与 Graph 校验能力、BM 前置条件相关） */
    hint?: string;
  };
  /** 无则隐藏第 3 步（勾选） */
  step3?: {
    label: string;
    defaultChecked: boolean;
  };
  /** 满足哪些条件后才允许点「确定」 */
  confirmGates: BatchConfirmGate[];
}

/** 抽屉内「当前账号」摘要（由账户管理页传入） */
export type BatchAccountPreviewRow = {
  accountId: string;
  name?: string;
  currency?: string;
  spendCapMinor?: number;
  balanceMinor?: number;
  spendingLimit?: string;
  balance?: string;
};

/** 设置限额抽屉提交（与 `uidsText` 二选一：有此则走结构化逻辑） */
export interface SpendLimitFormPayload {
  kind: 'increase' | 'decrease';
  /** 增加/减少时的金额（币种最小单位，如 USD 美分） */
  amountMinor?: number;
}

/** 重置限额抽屉提交 */
export interface ResetLimitFormPayload {
  mode: 'account_zero' | 'delete_restriction' | 'set_absolute';
  /** `set_absolute` 时的新 spend_cap（最小单位） */
  amountMinor?: number;
}

/** 「删除广告账号权限」抽屉第 2 步：与「删除它们的权限」组合使用 */
export interface RemoveAuthFormPayload {
  /**
   * 在「删除它们的权限」模式下：为 true 时移除包含当前登录 Facebook 用户在内的全部协作者；
   * 为 false 时保留当前账号在本广告账户上的权限，仅移除其他人。
   */
  deleteCurrentFacebookPerm: boolean;
}

export interface BatchDrawerSubmitPayload {
  entryKey: string;
  operationId: BatchOperationId;
  subId?: string;
  uidsText: string;
  useDefaultInterval: boolean;
  friendCheckOk: boolean;
  selectedAccountIds: string[];
  spendLimitForm?: SpendLimitFormPayload;
  resetLimitForm?: ResetLimitFormPayload;
  removeAuthForm?: RemoveAuthFormPayload;
}
