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
  /** 个位数多为最小单位（如 USD spend_cap=1 → $0.01） */
  if (raw < 10) return 'minor';

  const spent = hints?.amountSpentMinor ?? 0;
  const spentLow = spent <= offset * 50;

  /**
   * Graph 对 spend_cap 常返回主单位整数（如 USD 返回 100 表示 $100）。
   * PKR/CNY 等则常返回最小单位（如 27903 表示 279.03 PKR），勿按主单位再 ×100。
   */
  if (spentLow && raw >= 10 && raw <= 10_000_000) {
    const asMinorMajor = raw / offset;
    const asMajorMinor = raw * offset;
    if (offset === 100 && raw >= 50 && asMinorMajor < 50) {
      return 'major';
    }
    if (asMinorMajor >= 0.01 && asMinorMajor < 500_000 && asMajorMinor > asMinorMajor * offset) {
      return 'minor';
    }
    if (asMajorMinor >= offset) {
      return 'major';
    }
  }

  if (spent > offset * 10 && raw > 0) {
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

/** 将最小单位写回 Graph（与 detect 到的单位一致；仅用于与读回单位对齐的旧逻辑） */
export function spendCapMinorToApiValue(minor: number, unit: SpendCapUnit, currency?: string | null): number {
  const m = Math.max(0, Math.round(minor));
  if (unit === 'major') {
    return Math.round(m / currencyOffset(currency));
  }
  return m;
}

/**
 * Marketing API 写入 spend_cap：始终用账户币种「主单位」字符串（如 100.00 PKR、100 USD）。
 * 切勿把最小单位（如 10000 分）直接 POST，否则 Meta 会按主单位理解成巨额限额。
 */
export function spendCapMinorToGraphPostValue(minor: number, currency?: string | null): string {
  const offset = currencyOffset(currency);
  const major = Math.max(0, Math.round(minor)) / offset;
  if (Math.abs(major - Math.round(major)) < 1e-6) return String(Math.round(major));
  return major.toFixed(2);
}

type SpendCapRecordLike = {
  spendCapMinor?: number | null;
  spendingLimit?: string | null;
  currency?: string | null;
  totalSpentMinor?: number | null;
  amountSpentMinor?: number | null;
};

/**
 * 统一解析账户花费上限（最小单位）。
 * 列表可能仅有 Graph 原始 spendingLimit 字符串（如 "27903"），需与 spend_cap 读回规则一致。
 */
export function resolveSpendCapMinorForRecord(row: SpendCapRecordLike): number | null | undefined {
  if (row.spendCapMinor === 0) return 0;
  if (row.spendCapMinor != null && Number.isFinite(row.spendCapMinor) && row.spendCapMinor > 0) {
    return Math.round(row.spendCapMinor);
  }
  const rawStr = row.spendingLimit?.trim();
  if (!rawStr || /不限/.test(rawStr)) return row.spendCapMinor ?? undefined;
  const digits = rawStr.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const raw = parseInt(digits, 10);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return spendCapRawToMinor(raw, {
    currency: row.currency,
    amountSpentMinor: row.totalSpentMinor ?? row.amountSpentMinor ?? undefined,
    spendCapMinor: row.spendCapMinor ?? undefined,
  });
}

export function formatSpendCapMajorLabel(minor: number, currency?: string | null): string {
  const offset = currencyOffset(currency);
  const major = minor / offset;
  const c = (currency || 'USD').trim() || 'USD';
  return `${major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}
