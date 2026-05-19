import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import { formatAccountKindLabelZh, formatOwnerRoleForTable } from '../adAccount/adAccountDisplayMaps';
import { currencyOffset } from '../adAccount/spendCapCurrency';

export type PanelFieldKey =
  | 'accountId'
  | 'status'
  | 'dailyLimit'
  | 'spendingLimit'
  | 'threshold'
  | 'billingAmount'
  | 'totalSpent'
  | 'balance'
  | 'createdDate'
  | 'billingDate'
  | 'adminCount'
  | 'hiddenAdminCount'
  | 'accountKind'
  | 'timezone'
  | 'accountTime'
  | 'paymentMethod'
  | 'ownerRole'
  | 'currency'
  | 'belongsToBm'
  | 'remark';

export type PanelFieldDef = {
  key: PanelFieldKey;
  label: string;
  icon: string;
  isMoney?: boolean;
};

export const PANEL_FIELD_DEFS: PanelFieldDef[] = [
  { key: 'accountId', label: '账号ID', icon: '◎' },
  { key: 'status', label: '账号状态', icon: '◇' },
  { key: 'dailyLimit', label: '每天花费限额', icon: '$', isMoney: true },
  { key: 'spendingLimit', label: '花费限额', icon: '◆', isMoney: true },
  { key: 'threshold', label: '门槛', icon: '▣', isMoney: true },
  { key: 'billingAmount', label: '账单金额', icon: '▤', isMoney: true },
  { key: 'totalSpent', label: '总计花费', icon: '▥', isMoney: true },
  { key: 'balance', label: '余额', icon: '▦', isMoney: true },
  { key: 'createdDate', label: '创建日期', icon: '▧' },
  { key: 'billingDate', label: '账单日期', icon: '▨' },
  { key: 'adminCount', label: '管理员', icon: '▩' },
  { key: 'hiddenAdminCount', label: '隐藏管理员', icon: '◉' },
  { key: 'accountKind', label: '账号类型', icon: '○' },
  { key: 'timezone', label: '时区', icon: '●' },
  { key: 'accountTime', label: '账号时间', icon: '◐' },
  { key: 'paymentMethod', label: '支付卡号', icon: '◑' },
  { key: 'ownerRole', label: '账号角色', icon: '★' },
  { key: 'currency', label: '币种', icon: '☆' },
  { key: 'belongsToBm', label: '所属 BM', icon: '◎' },
  { key: 'remark', label: '备注', icon: '◇' },
];

export type AdsPanelDisplayOptions = {
  /** 展示币种（美元切换为 USD） */
  displayCurrency?: string;
  /** 账户原币种 */
  accountCurrency?: string;
  /** 1 USD = ? 账户币种 */
  usdToAccountRate?: number | null;
};

export type FormattedPanelField = {
  value: string;
  valueKind?: 'status-active' | 'status-inactive' | 'badge' | 'mono';
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: '¥',
  HKD: 'HK$',
  PKR: 'Rs',
  TWD: 'NT$',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function currencySymbol(code?: string): string {
  const c = (code || 'USD').trim().toUpperCase();
  return CURRENCY_SYMBOL[c] || `${c} `;
}

function accountCurrency(row: FbAdAccountRecord, opts?: AdsPanelDisplayOptions): string {
  return (opts?.accountCurrency || row.currency || 'USD').trim().toUpperCase();
}

function displayCurrency(row: FbAdAccountRecord, opts?: AdsPanelDisplayOptions): string {
  if (opts?.displayCurrency?.trim()) return opts.displayCurrency.trim().toUpperCase();
  return accountCurrency(row, opts);
}

/** 将账户币种金额（最小单位）换算为展示币种后格式化 */
function formatMinorWithFx(
  minor: number | undefined | null,
  row: FbAdAccountRecord,
  opts?: AdsPanelDisplayOptions
): string {
  if (minor == null || Number.isNaN(minor)) return '—';
  const acct = accountCurrency(row, opts);
  const disp = displayCurrency(row, opts);
  if (acct === disp) return formatMinorAmount(minor, disp);

  const rate = opts?.usdToAccountRate;
  if (!rate || rate <= 0) return formatMinorAmount(minor, acct);

  const majorAcct = minor / currencyOffset(acct);
  let majorDisp = majorAcct;
  if (disp === 'USD' && acct !== 'USD') {
    majorDisp = majorAcct / rate;
  } else if (acct === 'USD' && disp !== 'USD') {
    majorDisp = majorAcct * rate;
  } else {
    const majorUsd = acct === 'USD' ? majorAcct : majorAcct / rate;
    majorDisp = disp === 'USD' ? majorUsd : majorUsd * rate;
  }
  return formatMajorAmount(majorDisp, disp);
}

function formatMinorAmount(minor: number | undefined | null, currency?: string): string {
  if (minor == null || Number.isNaN(minor)) return '—';
  const sym = currencySymbol(currency);
  const offset = currencyOffset(currency);
  const major = minor / offset;
  return (
    sym +
    major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function formatMajorAmount(n: number, currency?: string): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sym = currencySymbol(currency);
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyishRawWithFx(
  raw: string | undefined,
  row: FbAdAccountRecord,
  opts?: AdsPanelDisplayOptions
): string {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  if (!s || s === '—') return '—';
  if (s.includes('不限')) return s;
  const acct = accountCurrency(row, opts);
  const disp = displayCurrency(row, opts);
  if (acct === disp) return formatMoneyishRaw(s, disp);
  if (/^-?\d+$/.test(s)) {
    return formatMinorWithFx(parseInt(s, 10), row, opts);
  }
  const cleaned = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isNaN(n) && opts?.usdToAccountRate && opts.usdToAccountRate > 0) {
    const rate = opts.usdToAccountRate;
    let majorDisp = n;
    if (disp === 'USD' && acct !== 'USD') majorDisp = n / rate;
    else if (acct === 'USD' && disp !== 'USD') majorDisp = n * rate;
    return formatMajorAmount(majorDisp, disp);
  }
  return formatMoneyishRaw(s, acct);
}

function formatMoneyishRaw(raw: string | undefined, currency?: string): string {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  if (!s || s === '—') return '—';
  if (s.includes('不限')) return s;
  const sym = currencySymbol(currency);
  if (/^-?\d+$/.test(s)) {
    const minor = parseInt(s, 10);
    if (!Number.isNaN(minor)) return formatMinorAmount(minor, currency);
  }
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isNaN(n) && /^-?[\d.]+$/.test(cleaned)) {
    return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return s;
}

function statusOn(row: FbAdAccountRecord): boolean {
  const s = (row.status || '').trim();
  const sl = s.toLowerCase();
  if (!s || s === '未知') return false;
  if (s.includes('活跃') || s.includes('可投放') || s.includes('运行')) return true;
  return sl.includes('active') || sl.includes('enabled') || s === '1';
}

function formatBillingPeriodDisplay(v?: string): string {
  if (!v) return '—';
  const s = String(v).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function formatAccountLocalTime(timezone?: string): string {
  const tz = timezone?.trim();
  const now = new Date();
  try {
    if (tz && !/^GMT/i.test(tz)) {
      return now.toLocaleString('sv-SE', { timeZone: tz }).replace('T', ' ');
    }
  } catch {
    /* ignore */
  }
  return now.toLocaleString('sv-SE').replace('T', ' ');
}

/** 格式化汇率换算预览：1 USD = X 账户币种 */
export function formatUsdConversionPreview(
  usdAmount: number,
  accountCurrencyCode: string,
  usdToAccountRate: number
): string {
  const ccy = accountCurrencyCode.trim().toUpperCase();
  if (ccy === 'USD') return formatMajorAmount(usdAmount, 'USD');
  const converted = usdAmount * usdToAccountRate;
  return formatMajorAmount(converted, ccy);
}

export function formatPanelField(
  key: PanelFieldKey,
  row: FbAdAccountRecord,
  opts?: AdsPanelDisplayOptions
): FormattedPanelField {
  const active = statusOn(row);
  switch (key) {
    case 'accountId':
      return { value: dash(row.accountId), valueKind: 'mono' };
    case 'status':
      return {
        value: dash(row.status),
        valueKind: active ? 'status-active' : 'status-inactive',
      };
    case 'dailyLimit':
      if (row.minDailyBudgetMinor != null && row.minDailyBudgetMinor > 0) {
        return { value: formatMinorWithFx(row.minDailyBudgetMinor, row, opts) };
      }
      return { value: formatMoneyishRawWithFx(row.dailyLimit, row, opts) };
    case 'spendingLimit':
      if (row.spendCapMinor === 0) return { value: '不限额' };
      if (row.spendCapMinor != null) return { value: formatMinorWithFx(row.spendCapMinor, row, opts) };
      return { value: formatMoneyishRawWithFx(row.spendingLimit, row, opts) };
    case 'threshold': {
      const m = row.paymentThresholdMinor ?? row.spendCapMinor;
      if (m === 0) return { value: '不限额' };
      if (m != null) return { value: formatMinorWithFx(m, row, opts) };
      return { value: formatMoneyishRawWithFx(row.spendingLimit, row, opts) };
    }
    case 'billingAmount': {
      const m = row.billingAmountMinor ?? row.balanceMinor;
      if (m != null) return { value: formatMinorWithFx(m, row, opts) };
      return { value: formatMoneyishRawWithFx(row.balance, row, opts) };
    }
    case 'totalSpent':
      if (row.totalSpentMinor != null) {
        return { value: formatMinorWithFx(row.totalSpentMinor, row, opts) };
      }
      if (row.totalSpent !== undefined && row.totalSpent !== '') {
        if (typeof row.totalSpent === 'number') {
          return {
            value: formatMoneyishRawWithFx(String(row.totalSpent), row, opts),
          };
        }
        return { value: formatMoneyishRawWithFx(String(row.totalSpent), row, opts) };
      }
      if (row.spend != null) {
        return { value: formatMoneyishRawWithFx(String(row.spend), row, opts) };
      }
      return { value: '—' };
    case 'balance':
      if (row.balanceMinor != null) return { value: formatMinorWithFx(row.balanceMinor, row, opts) };
      return { value: formatMoneyishRawWithFx(row.balance, row, opts) };
    case 'createdDate':
      return { value: dash(row.createdDate) };
    case 'billingDate':
      return { value: formatBillingPeriodDisplay(row.billingPeriod) };
    case 'adminCount':
      return {
        value:
          row.adminCount != null && !Number.isNaN(Number(row.adminCount))
            ? String(Math.max(0, Math.floor(Number(row.adminCount))))
            : '—',
      };
    case 'hiddenAdminCount':
      return {
        value:
          row.hiddenAdminCount != null
            ? String(Math.max(0, Math.floor(Number(row.hiddenAdminCount))))
            : '—',
      };
    case 'accountKind':
      return {
        value: dash(formatAccountKindLabelZh(row.accountKindLabel) || row.accountType),
        valueKind: 'badge',
      };
    case 'timezone':
      return { value: dash(row.timezone) };
    case 'accountTime':
      return { value: formatAccountLocalTime(row.timezone) };
    case 'paymentMethod':
      return { value: dash(row.paymentMethod) };
    case 'ownerRole':
      return { value: formatOwnerRoleForTable(row) };
    case 'currency':
      return { value: dash(row.currency) };
    case 'belongsToBm':
      return { value: dash(row.belongsToBmName || row.belongsToBmId) };
    case 'remark':
      return { value: dash(row.remark) };
    default:
      return { value: '—' };
  }
}

export function buildDisplayOptions(
  row: FbAdAccountRecord,
  displayAsUsd: boolean,
  usdToAccountRate: number | null
): AdsPanelDisplayOptions {
  const accountCurrencyCode = (row.currency || 'USD').trim().toUpperCase();
  return {
    accountCurrency: accountCurrencyCode,
    displayCurrency: displayAsUsd ? 'USD' : accountCurrencyCode,
    usdToAccountRate,
  };
}
