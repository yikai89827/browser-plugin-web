import type { FbAdAccountRecord } from '../../interfaces/fbControl';
import { formatAccountKindLabelZh, formatOwnerRoleForTable } from './adAccountDisplayMaps';
import { currencyOffset } from './spendCapCurrency';

export type AdsPanelDisplayRow = {
  label: string;
  value: string;
  valueKind?: 'status-active' | 'status-inactive' | 'badge' | 'mono';
  /** 金额类字段（美元切换时仅重算这些行） */
  isMoney?: boolean;
};

export type AdsPanelDisplayOptions = {
  /** 展示用币种代码；不传则用账户原币种 */
  displayCurrency?: string;
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

function resolveCurrency(row: FbAdAccountRecord, opts?: AdsPanelDisplayOptions): string {
  if (opts?.displayCurrency?.trim()) return opts.displayCurrency.trim().toUpperCase();
  return (row.currency || 'USD').trim().toUpperCase();
}

function formatMinorAmount(
  minor: number | undefined | null,
  currency?: string
): string {
  if (minor == null || Number.isNaN(minor)) return '—';
  const sym = currencySymbol(currency);
  const offset = currencyOffset(currency);
  const major = minor / offset;
  return (
    sym +
    major.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatMajorAmount(n: number, currency?: string): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sym = currencySymbol(currency);
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function totalSpentDisplay(row: FbAdAccountRecord, ccy: string): string {
  if (row.totalSpentMinor != null) return formatMinorAmount(row.totalSpentMinor, ccy);
  if (row.totalSpent !== undefined && row.totalSpent !== '') {
    return typeof row.totalSpent === 'number'
      ? formatMajorAmount(row.totalSpent, ccy)
      : formatMoneyishRaw(String(row.totalSpent), ccy);
  }
  if (row.spend != null) return formatMajorAmount(row.spend, ccy);
  return '—';
}

function billingAmountDisplay(row: FbAdAccountRecord, ccy: string): string {
  const m = row.billingAmountMinor ?? row.balanceMinor;
  if (m != null) return formatMinorAmount(m, ccy);
  return formatMoneyishRaw(row.balance, ccy);
}

function thresholdDisplay(row: FbAdAccountRecord, ccy: string): string {
  const m = row.paymentThresholdMinor ?? row.spendCapMinor;
  if (m === 0) return '不限额';
  if (m != null) return formatMinorAmount(m, ccy);
  return formatMoneyishRaw(row.spendingLimit, ccy);
}

function dailyLimitDisplay(row: FbAdAccountRecord, ccy: string): string {
  if (row.minDailyBudgetMinor != null && row.minDailyBudgetMinor > 0) {
    return formatMinorAmount(row.minDailyBudgetMinor, ccy);
  }
  return formatMoneyishRaw(row.dailyLimit, ccy);
}

function spendingLimitDisplay(row: FbAdAccountRecord, ccy: string): string {
  if (row.spendCapMinor === 0) return '不限额';
  if (row.spendCapMinor != null) return formatMinorAmount(row.spendCapMinor, ccy);
  return formatMoneyishRaw(row.spendingLimit, ccy);
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

/** 按账户时区显示当前本地时间 */
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

function hiddenAdminDisplay(row: FbAdAccountRecord): string {
  if (row.hiddenAdminCount == null) return '—';
  return String(Math.max(0, Math.floor(Number(row.hiddenAdminCount))));
}

/** 构建广告管理页悬浮窗字段 */
export function buildAdsPanelDisplayRows(
  row: FbAdAccountRecord,
  opts?: AdsPanelDisplayOptions
): AdsPanelDisplayRow[] {
  const active = statusOn(row);
  const statusText = dash(row.status);
  const ccy = resolveCurrency(row, opts);
  const money = (label: string, value: string): AdsPanelDisplayRow => ({
    label,
    value,
    isMoney: true,
  });

  return [
    { label: '账号ID', value: dash(row.accountId), valueKind: 'mono' },
    {
      label: '账号状态',
      value: statusText,
      valueKind: active ? 'status-active' : 'status-inactive',
    },
    money('每天花费限额', dailyLimitDisplay(row, ccy)),
    money('花费限额', spendingLimitDisplay(row, ccy)),
    money('门槛', thresholdDisplay(row, ccy)),
    money('账单金额', billingAmountDisplay(row, ccy)),
    money('总计花费', totalSpentDisplay(row, ccy)),
    money('余额', formatMoneyishRaw(row.balance, ccy)),
    { label: '创建日期', value: dash(row.createdDate) },
    { label: '账单日期', value: formatBillingPeriodDisplay(row.billingPeriod) },
    {
      label: '管理员',
      value:
        row.adminCount != null && !Number.isNaN(Number(row.adminCount))
          ? String(Math.max(0, Math.floor(Number(row.adminCount))))
          : '—',
    },
    { label: '隐藏管理员', value: hiddenAdminDisplay(row) },
    {
      label: '账号类型',
      value: dash(formatAccountKindLabelZh(row.accountKindLabel) || row.accountType),
      valueKind: 'badge',
    },
    { label: '时区', value: dash(row.timezone) },
    { label: '账号时间', value: formatAccountLocalTime(row.timezone) },
    { label: '支付卡号', value: dash(row.paymentMethod) },
    { label: '账号角色', value: formatOwnerRoleForTable(row) },
    { label: '币种', value: dash(row.currency) },
    { label: '所属 BM', value: dash(row.belongsToBmName || row.belongsToBmId) },
    { label: '备注', value: dash(row.remark) },
  ];
}
