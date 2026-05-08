/** 广告账户 — 与自有平台「广告账号管理」列对齐，未采集字段可为空 */
export interface FbAdAccountRecord {
  /** 稳定主键：优先 act_xxx 或数字账户 ID */
  accountId: string;
  /** 展示名称 */
  name: string;
  /** 行内状态文案或 active / disabled */
  status: string;
  secondaryStatus?: string;
  adminCount?: number;
  accountType?: string;
  paymentAmount?: string;
  balance?: string;
  dailyLimit?: string;
  currency?: string;
  spend?: number;
  favorite?: boolean;
  /** 插件侧采集时间 */
  capturedAt: number;
  sourceUrl?: string;
}

/** 像素分享 — 与「像素分享」表对齐 */
export interface FbPixelShareRecord {
  /** 稳定主键：pixelId + bmId 等拼接 */
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
