/** 主操作下拉项 id（与扩展对接时可沿用） */
export type BatchOperationId =
  | 'add_ad_permissions'
  | 'remove_ad_permissions'
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
    buttonText: string;
  };
  /** 无则隐藏第 3 步（勾选） */
  step3?: {
    label: string;
    defaultChecked: boolean;
  };
  /** 满足哪些条件后才允许点「确定」 */
  confirmGates: BatchConfirmGate[];
}

export interface BatchDrawerSubmitPayload {
  entryKey: string;
  operationId: BatchOperationId;
  subId?: string;
  uidsText: string;
  useDefaultInterval: boolean;
  friendCheckOk: boolean;
  selectedAccountIds: string[];
}
