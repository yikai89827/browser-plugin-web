import { currencyOffset } from '../adAccount/spendCapCurrency';

const FORMATTED_DSL_RE = /"formatted_dsl"\s*:\s*"((?:\\.|[^"\\])*)"/g;

/** 与 fbspider 一致：解码 GraphQL 响应里的 \\uXXXX */
export function decodeFormattedDslRaw(raw: string): string {
  if (!raw) return '';
  let s = raw;
  s = s.replace(/\\u[\dA-Fa-f]{4}/gi, (m) =>
    String.fromCharCode(parseInt(m.replace(/\\u/gi, ''), 16))
  );
  s = s.replace(/\\u[\dA-Fa-f]{2}/gi, (m) =>
    String.fromCharCode(parseInt(m.replace(/\\u/gi, ''), 16))
  );
  return s;
}

/** 从 formatted_dsl 字符串解析主单位金额（如 "¥0.01" → 0.01） */
export function parseFormattedDslMajor(raw: string): number | null {
  const decoded = decodeFormattedDslRaw(raw).trim();
  if (!decoded || decoded === '-' || decoded === '—') return null;
  const numeric = decoded.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  if (!numeric) return null;
  const n = parseFloat(numeric);
  return Number.isFinite(n) ? n : null;
}

/** formatted_dsl → 账户币种最小单位（CNY ¥0.01 → 1） */
export function formattedDslToMinor(raw: string, currency?: string | null): number | null {
  const major = parseFormattedDslMajor(raw);
  if (major == null) return null;
  if (major <= 0) return 0;
  return Math.round(major * currencyOffset(currency));
}

function extractFormattedDslNearAccountId(text: string, accountId: string): string | null {
  const id = accountId.replace(/^act_/i, '').trim();
  if (!/^\d{10,}$/.test(id)) return null;
  const patterns = [
    new RegExp(
      `"account_id"\\s*:\\s*"${id}"[\\s\\S]{0,8000}?"formatted_dsl"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
      'i'
    ),
    new RegExp(
      `"formatted_dsl"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"[\\s\\S]{0,8000}?"account_id"\\s*:\\s*"${id}"`,
      'i'
    ),
    new RegExp(
      `"assetID"\\s*:\\s*"${id}"[\\s\\S]{0,8000}?"formatted_dsl"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** 从页面脚本 / HTML 中提取 formatted_dsl（参考 fbspider content-script） */
export function extractFormattedDslFromPage(accountId?: string): string | null {
  const id = accountId?.replace(/^act_/i, '').trim();

  if (id) {
    const html = document.documentElement?.innerHTML;
    if (html) {
      const near = extractFormattedDslNearAccountId(html, id);
      if (near) return near;
    }
  }

  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].textContent;
    if (!content?.includes('formatted_dsl')) continue;
    if (id) {
      const near = extractFormattedDslNearAccountId(content, id);
      if (near) return near;
    }
    FORMATTED_DSL_RE.lastIndex = 0;
    const m = FORMATTED_DSL_RE.exec(content);
    if (m?.[1]) return m[1];
  }

  return null;
}

/** 从任意 GraphQL / 计费接口响应文本解析 formatted_dsl */
export function extractFormattedDslFromResponseText(
  text: string,
  accountId?: string
): string | null {
  if (!text.includes('formatted_dsl')) return null;
  if (accountId) {
    const near = extractFormattedDslNearAccountId(text, accountId);
    if (near) return near;
  }
  const m = text.match(/"formatted_dsl"\s*:\s*"((?:\\.|[^"\\])*)"/);
  return m?.[1] ?? null;
}
