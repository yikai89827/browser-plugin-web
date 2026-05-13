/**
 * 广告账户 — 字段与自有平台「广告账号管理」表格列对齐（见产品截图）。
 * 采集不到的字段可省略；展示层以「—」占位。
 */
export interface FbAdAccountRecord {
  /** 广告账户 ID（主键，与 IndexedDB keyPath 一致） */
  accountId: string;
  /** 账号名称 */
  name: string;
  /** 状态（绿点/红点等展示用文案或枚举） */
  status: string;

  /** 收藏 */
  favorite?: boolean;
  /** 日限额 */
  dailyLimit?: string;
  /** 总花费 */
  totalSpent?: number | string;
  /** 花费限额 */
  spendingLimit?: string;
  /** 已花费（账期内等） */
  periodSpent?: string;
  /** 余额 */
  balance?: string;
  /** 备注 */
  remark?: string;
  /** 币种 */
  currency?: string;
  /** 账户类型（如后付费） */
  accountType?: string;
  /** 所有者角色（如 Admin） */
  ownerRole?: string;
  /** Graph `user_role` 原始值（便于重新映射展示） */
  userRoleRaw?: string | number;
  /** 支付方法 */
  paymentMethod?: string;
  /** 账单期 */
  billingPeriod?: string;
  /** 锁定原因 */
  lockReason?: string;
  /** 创建日期 YYYY-MM-DD */
  createdDate?: string;
  /** 时区 */
  timezone?: string;
  /** 原始 ID（可能与 accountId 不同，按业务保留） */
  originalId?: string;
  /** 创建自 BM — 名称 */
  createdFromBmName?: string;
  /** 创建自 BM — ID */
  createdFromBmId?: string;
  /** 所属 BM — 名称 */
  belongsToBmName?: string;
  /** 所属 BM — ID */
  belongsToBmId?: string;
  /** 国家编码 */
  countryCode?: string;

  /** 次状态 / 备用状态文案 */
  secondaryStatus?: string;
  /** 管理员数量（若采集） */
  adminCount?: number;
  /** 推送状态（自有平台 / 后续对接） */
  pushStatus?: string;
  /**
   * 账号类型展示（Graph `account_type` 经映射的短标签，如 Business / Personal；表格层再转为中文）。
   */
  accountKindLabel?: string;
  /** 账单金额（Graph balance 等，单位：币种最小单位，如美分） */
  billingAmountMinor?: number;
  /** 支付/花费门槛（如 spend_cap，单位：币种最小单位；0 常表示不限） */
  paymentThresholdMinor?: number;
  /** 隐藏管理员：assigned_users 数量（点击「加载」后写入） */
  hiddenAdminCount?: number;

  /** Graph amount_spent 原始最小单位（便于展示时与余额口径一致） */
  totalSpentMinor?: number;
  /** Graph balance 整数最小单位 */
  balanceMinor?: number;
  /** spend_cap 最小单位 */
  spendCapMinor?: number;
  /** min_daily_budget 最小单位 */
  minDailyBudgetMinor?: number;
  /** 兼容旧字段：付款展示文案 */
  paymentAmount?: string;
  /** 兼容旧字段：花费数值（可与 totalSpent 二选一） */
  spend?: number;
  /** 插件采集时间戳 */
  capturedAt: number;
  sourceUrl?: string;
}

/** 广告账户「支付/计费」类活动一行（来自 Graph activities） */
export interface FbAdAccountPaymentActivity {
  eventTime?: string;
  eventType?: string;
  translatedEventType?: string;
  objectName?: string;
  objectType?: string;
  /** 合并 extra_data / 关联对象等摘要 */
  detail?: string;
}

/** 像素分享 — 与「像素分享」表对齐 */
export interface FbPixelShareRecord {
  id: string;
  pixelName: string;
  pixelId: string;
  bmName?: string;
  bmId?: string;
  ownerName?: string;
  ownerId?: string;
  remark?: string;
  role?: string;
  shareOk?: boolean;
  bmShareOk?: boolean;
  capturedAt: number;
  sourceUrl?: string;
}
