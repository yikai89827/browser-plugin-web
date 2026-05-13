/**
 * Graph / 页面脚本中的原始枚举值 → 站点表格用中文说明。
 * 未收录的编码仍返回可读占位，便于对照官方文档排查。
 */

const ACCOUNT_STATUS_ZH: Record<number, string> = {
  1: '活跃',
  2: '已停用',
  3: '未结清',
  7: '风险审核中',
  8: '待结算',
  9: '宽限期',
  100: '待关闭',
  101: '已关闭',
  201: '可投放（汇总）',
  202: '已结束（汇总）',
};

const DISABLE_REASON_ZH: Record<string, string> = {
  NONE: '—',
  ADS_INTEGRITY_POLICY: '广告诚信政策',
  ADS_IP_REVIEW: '知识产权审核',
  RISK_PAYMENT: '支付风险',
  GRAY_ACCOUNT_SHUT_DOWN: '灰号关停',
  ADS_ACCOUNT_SHUT_DOWN: '广告账户关停',
  BUSINESS_INTEGRITY_RAR: '业务诚信限制',
  PERMANENT_CLOSE: '永久关闭',
  UNUSED_RESELLER_ACCOUNT: '未使用经销商账户',
  UNUSED571_ACCOUNT: '未使用 571 账户',
  UNAUTHORIZED_BM: '未授权 BM',
  PREPAID_ACCOUNT: '预付账户',
  INVALID_FUNDS: '资金无效',
  INACTIVE: '不活跃',
  SELF_EXCLUSION: '自我排除',
  UNUSED: '未使用',
};

/** Meta 文档与社区常见取值；未命中时展示「角色（编码）」 */
const USER_ROLE_NUM_ZH: Record<number, string> = {
  1001: '管理员',
  1002: '广告主',
  1003: '分析师',
  1004: '直销权限',
  1005: '财务编辑',
};

const USER_ROLE_STR_ZH: Record<string, string> = {
  ADMINISTRATOR: '管理员',
  GENERAL_USER: '普通用户',
  ADVERTISER: '广告主',
  ANALYST: '分析师',
  REPORTS_ONLY: '仅报表',
  SALES: '销售',
  FINANCE_EDITOR: '财务编辑',
  FINANCE_ANALYST: '财务分析',
};

export function formatAccountStatusZh(raw: unknown): string {
  if (raw == null || raw === '') return '未知';
  const s0 = String(raw).trim();
  const n = typeof raw === 'number' ? raw : Number.parseInt(s0, 10);
  if (!Number.isNaN(n) && String(n) === s0) {
    return ACCOUNT_STATUS_ZH[n] ?? `状态码 ${n}`;
  }
  return s0 || '未知';
}

/** 无锁定时返回 undefined，表格显示「—」且不标红 */
export function formatDisableReasonZh(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const s0 = String(raw).trim();
  if (s0 === '0') return undefined;
  const upper = s0.toUpperCase();
  if (upper === 'NONE') return undefined;

  const n = Number.parseInt(s0, 10);
  if (!Number.isNaN(n) && String(n) === s0) {
    if (n === 0) return undefined;
    return `锁定原因（代码 ${n}）`;
  }

  return DISABLE_REASON_ZH[upper] ?? s0;
}

export function formatUserRoleZh(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const s0 = String(raw).trim();
  const n = typeof raw === 'number' ? raw : Number.parseInt(s0, 10);
  if (!Number.isNaN(n) && String(n) === s0) {
    if (USER_ROLE_NUM_ZH[n]) return USER_ROLE_NUM_ZH[n];
    if (n >= 1000 && n < 10000) return `角色（${n}）`;
    return `内部角色编码 ${n}`;
  }
  const key = s0.toUpperCase().replace(/\s+/g, '_');
  return USER_ROLE_STR_ZH[key] ?? s0;
}

export function readFundingSourceDisplay(a: Record<string, unknown>): string | undefined {
  const d = a.funding_source_details as Record<string, unknown> | undefined;
  if (d && d.display_string != null) {
    const t = String(d.display_string).trim();
    if (t) return t;
  }
  return undefined;
}

export function formatPaymentMethodZh(
  fundingSource: unknown,
  displayFromDetails?: string
): string | undefined {
  if (displayFromDetails) return displayFromDetails;
  if (fundingSource == null || fundingSource === '') return undefined;
  const s = String(fundingSource).trim();
  if (/^\d{8,}$/.test(s)) return `支付渠道（ID：${s}）`;
  return s;
}
