/** 常见币种 Graph 最小单位倍数（USD/EUR 等为 100） */
const DEFAULT_OFFSET = 100;

export function currencyOffset(currency?: string | null): number {
  const c = (currency || 'USD').trim().toUpperCase();
  const zeroDecimal = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'RWF', 'VUV']);
  if (zeroDecimal.has(c)) return 1;
  return DEFAULT_OFFSET;
}

export type SpendCapUnit = 'minor' | 'major';

export type SpendCapNormalizeHints = {
  /** 列表里已知的 spend_cap（最小单位） */
  spendCapMinor?: number | null;
  amountSpentMinor?: number | null;
  currency?: string | null;
};

/**
 * 判断 Graph 返回的 spend_cap 整数值是「最小货币单位」还是「主单位整数」（如 USD 美元）。
 * Meta 文档写最小单位，但部分账户实际返回主单位整数，与 amount_spent（最小单位）混用会导致 +$10 变成 +$1000。
 */
export function detectSpendCapUnit(raw: number, hints?: SpendCapNormalizeHints): SpendCapUnit {
  if (!Number.isFinite(raw) || raw <= 0) return 'minor';
  const offset = currencyOffset(hints?.currency);
  const hint = hints?.spendCapMinor;
  if (hint != null && hint > 0) {
    const rel = Math.max(offset, Math.round(hint * 0.02));
    if (Math.abs(raw - hint) <= rel) return 'minor';
    if (Math.abs(raw * offset - hint) <= rel) return 'major';
  }
  const spent = hints?.amountSpentMinor;
  if (spent != null && spent > offset * 10 && raw > 0) {
    const asMinor = raw;
    const asMajorToMinor = raw * offset;
    if (asMinor < spent * 0.2 && asMajorToMinor >= spent * 0.5) return 'major';
  }
  return 'minor';
}

/** 将 Graph spend_cap 原始值统一为最小货币单位（内部计算用） */
export function spendCapRawToMinor(raw: number, hints?: SpendCapNormalizeHints): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const unit = detectSpendCapUnit(raw, hints);
  const offset = currencyOffset(hints?.currency);
  return unit === 'major' ? Math.round(raw * offset) : Math.round(raw);
}

/** 将最小单位写回 Graph（与 detect 到的单位一致） */
export function spendCapMinorToApiValue(minor: number, unit: SpendCapUnit, currency?: string | null): number {
  const m = Math.max(0, Math.round(minor));
  if (unit === 'major') {
    return Math.round(m / currencyOffset(currency));
  }
  return m;
}

export function formatSpendCapMajorLabel(minor: number, currency?: string | null): string {
  const offset = currencyOffset(currency);
  const major = minor / offset;
  const c = (currency || 'USD').trim() || 'USD';
  return `${major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}
