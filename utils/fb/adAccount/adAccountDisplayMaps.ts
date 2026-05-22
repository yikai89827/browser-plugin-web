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
 * Graph `disable_reason` 数值枚举（与 Meta 文档一致；超出文档范围时仍走占位文案）。
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-account
 */
const DISABLE_REASON_NUM_ZH: Record<number, string> = {
  1: '广告诚信政策',
  2: '知识产权审核',
  3: '支付风险',
  4: '灰号关停',
  5: '广告格式合规（AFC）审核',
  6: '业务诚信限制',
  7: '永久关闭',
  8: '未使用经销商账户',
  9: '未使用账户',
  10: '伞形广告账户',
  11: 'BM 诚信政策',
  12: '不实陈述广告账户',
  13: 'AOAB 法律实体去关联',
  14: 'CTX 线程审核',
  15: '账户疑似被盗',
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

  const n =
    typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : Number.parseInt(s0, 10);
  const isIntFromNumber = typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw);
  const isNumericString = !Number.isNaN(n) && String(n) === s0;
  if (isIntFromNumber || isNumericString) {
    if (n === 0) return undefined;
    if (DISABLE_REASON_NUM_ZH[n]) return DISABLE_REASON_NUM_ZH[n];
    return `锁定原因（代码 ${n}）`;
  }

  return DISABLE_REASON_ZH[upper] ?? s0;
}

/**
 * 将 `user_role` 数值或枚举字符串转为中文角色说明。
 */
function displayUserRoleNumeric(n: number): string {
  if (USER_ROLE_NUM_ZH[n]) return USER_ROLE_NUM_ZH[n];
  if (n >= 1000 && n < 10000) return `角色（${n}）`;
  if (n > 1_000_000_000) return `管理员`;
  return `角色码 ${n}`;
}

export function formatUserRoleZh(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return displayUserRoleNumeric(Math.trunc(raw));
  }
  const s0 = String(raw).trim();
  if (/^-?\d+$/.test(s0)) {
    const n = Number.parseInt(s0, 10);
    if (!Number.isNaN(n)) return displayUserRoleNumeric(n);
  }
  const loose = Number(s0);
  if (Number.isFinite(loose) && Math.abs(loose - Math.trunc(loose)) < 1e-9) {
    return displayUserRoleNumeric(Math.trunc(loose));
  }
  const key = s0.toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (USER_ROLE_STR_ZH[key]) return USER_ROLE_STR_ZH[key];
  /** 兼容已落库的「内部角色编码 xxx」 */
  const legacy = s0.match(/内部角色编码\s*(\d+)/);
  if (legacy) {
    const inner = Number.parseInt(legacy[1], 10);
    if (!Number.isNaN(inner)) {
      if (USER_ROLE_NUM_ZH[inner]) return USER_ROLE_NUM_ZH[inner];
      if (inner > 1_000_000_000) return `系统角色`;
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

const FUNDING_DISPLAY_SYMBOLS = ['¥', '$', '€', '£', 'Rs', 'HK$', 'NT$', 'A$', 'C$', 'S$', '₹'];

/**
 * Meta `display_string` 常在括号金额后重复币种代码（如 `可用余额 (¥ 0.00 CNY)`），去掉冗余后缀。
 */
export function normalizeFundingDisplayString(display: string): string {
  const s = display.trim();
  if (!s) return s;
  return s.replace(/\(([^()]+)\)/g, (match, inner: string) => {
    const hasSym = FUNDING_DISPLAY_SYMBOLS.some((sym) => inner.includes(sym));
    if (!hasSym) return match;
    const trimmed = inner.replace(/\s+[A-Z]{3}\s*$/i, '').trimEnd();
    return `(${trimmed})`;
  });
}

/**
 * 从 Graph 返回的 `funding_source_details` 读取人类可读支付文案。
 */
export function readFundingSourceDisplay(a: Record<string, unknown>): string | undefined {
  const d = a.funding_source_details as Record<string, unknown> | undefined;
  if (d && d.display_string != null) {
    const t = String(d.display_string).trim();
    if (t) return normalizeFundingDisplayString(t);
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
  return normalizeFundingDisplayString(s);
}

/** Graph `account_type` 枚举键，或与 `mapGraphAdAccount` 一致的英文短标签 */
const ACCOUNT_KIND_ZH: Record<string, string> = {
  PERSONAL: '个人',
  GENERAL: '商业',
  BUSINESS: '商业',
  CORPORATE: '商业',
  INHOUSE_AGENCY: '商业',
  IN_HOUSE_AGENCY: '商业',
  EXTERNAL_AGENCY: '商业',
  AGENCY: '商业',
  GOVERNMENT: '政府',
  NONPROFIT: '非营利',
  WHITELISTED: '白名单',
  APP_DEVELOPER: '应用开发者',
  BROADCAST: '广播',
  STUDY: '研究',
  MEDICAL: '医疗',
  POLITICAL: '政治',
  NONE: '—',
};

function normalizeAccountKindEnumKey(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * 表格「账号类型」列：将 Graph `account_type` / 已落库的英文标签转为中文（主类为「商业」「个人」）。
 */
export function formatAccountKindLabelZh(raw?: string | null): string {
  if (raw == null) return '';
  const t = String(raw).trim();
  if (!t) return '';
  if (t === '个人' || t === '商业') return t;
  if (t === '—') return '—';
  const key = normalizeAccountKindEnumKey(t);
  if (ACCOUNT_KIND_ZH[key]) return ACCOUNT_KIND_ZH[key];
  return t;
}
