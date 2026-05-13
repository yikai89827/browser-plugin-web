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

/**
 * Graph `user_role` 数值枚举（与 Meta 广告账户权限文档常见取值对齐；未收录 ID 仍给可读占位）。
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-account
 */
const USER_ROLE_NUM_ZH: Record<number, string> = {
  1: '管理员',
  2: '一般用户',
  3: '报表',
  1001: '管理员',
  1002: '广告主',
  1003: '分析师',
  1004: '直销权限',
  1005: '财务编辑',
  1006: '仅报表',
  1007: '销售',
};

const USER_ROLE_STR_ZH: Record<string, string> = {
  ADMIN: '管理员',
  ADMINISTRATOR: '管理员',
  GENERAL_USER: '普通用户',
  ADVERTISER: '广告主',
  ANALYST: '分析师',
  REPORTS_ONLY: '仅报表',
  SALES: '销售',
  FINANCE_EDITOR: '财务编辑',
  FINANCE_ANALYST: '财务分析',
  EMPLOYEE: '员工',
  VIEWER: '查看者',
  AGENCY: '代理商',
  OWNER: '所有者',
  DEVELOPER: '开发者',
};

/**
 * 将 Graph `account_status` 数值或字符串转为中文状态文案。
 */
export function formatAccountStatusZh(raw: unknown): string {
  if (raw == null || raw === '') return '未知';
  const s0 = String(raw).trim();
  const n = typeof raw === 'number' ? raw : Number.parseInt(s0, 10);
  if (!Number.isNaN(n) && String(n) === s0) {
    return ACCOUNT_STATUS_ZH[n] ?? `状态码 ${n}`;
  }
  return s0 || '未知';
}

/**
 * 将 `disable_reason` 转为中文；无锁定时返回 `undefined`（表格显示「—」）。
 */
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

/**
 * 将 `user_role` 数值或枚举字符串转为中文角色说明。
 */
export function formatUserRoleZh(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const s0 = String(raw).trim();
  const n = typeof raw === 'number' ? raw : Number.parseInt(s0, 10);
  if (!Number.isNaN(n) && String(n) === s0) {
    if (USER_ROLE_NUM_ZH[n]) return USER_ROLE_NUM_ZH[n];
    if (n >= 1000 && n < 10000) return `角色（${n}）`;
    /** Meta / BM 侧常见大整数角色 ID，无公开枚举名时标注为系统角色 */
    if (n > 1_000_000_000) return `系统角色（${n}）`;
    return `角色码 ${n}`;
  }
  const key = s0.toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (USER_ROLE_STR_ZH[key]) return USER_ROLE_STR_ZH[key];
  /** 兼容已落库的「内部角色编码 xxx」 */
  const legacy = s0.match(/内部角色编码\s*(\d+)/);
  if (legacy) {
    const inner = Number.parseInt(legacy[1], 10);
    if (!Number.isNaN(inner)) {
      if (USER_ROLE_NUM_ZH[inner]) return USER_ROLE_NUM_ZH[inner];
      if (inner > 1_000_000_000) return `系统角色（${inner}）`;
      return `角色码 ${inner}`;
    }
  }
  return USER_ROLE_STR_ZH[key] ?? s0;
}

/**
 * 表格「所有者角色」列：优先用原始 `user_role` 再映射，其次解析已格式化文案中的数字。
 */
export function formatOwnerRoleForTable(row: { userRoleRaw?: string | number; ownerRole?: string }): string {
  const fromRaw = formatUserRoleZh(row.userRoleRaw);
  if (fromRaw) return fromRaw;
  const stored = row.ownerRole;
  if (stored != null && String(stored).trim()) {
    const again = formatUserRoleZh(stored);
    if (again) return again;
    return String(stored);
  }
  return '—';
}

/**
 * 从 Graph 返回的 `funding_source_details` 读取人类可读支付文案。
 */
export function readFundingSourceDisplay(a: Record<string, unknown>): string | undefined {
  const d = a.funding_source_details as Record<string, unknown> | undefined;
  if (d && d.display_string != null) {
    const t = String(d.display_string).trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * 组合「资金源展示串」与原始 funding_source：优先展示 Meta 返回的 `display_string`。
 */
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
