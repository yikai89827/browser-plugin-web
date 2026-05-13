import { describeToken, redactUrlForLog } from './tokenDebugLog';
import type { FbAdAccountPaymentActivity } from '../../interfaces/fbControl';

const GRAPH_VERSION = 'v21.0';
const MAX_PAGES = 12;
const PAGE_LIMIT = 100;
const MAX_RAW = 1500;

const ACTIVITY_FIELDS = [
  'event_time',
  'event_type',
  'translated_event_type',
  'object_name',
  'object_type',
  'extra_data',
  'actor_name',
  'application_name',
].join(',');

function actPath(accountId: string): string {
  const raw = accountId.replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : accountId;
}

function fiveYearsAgoMs(): number {
  return Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000;
}

/** 粗筛：计费 / 支付 / 资金相关活动（Meta 各版本 event_type 命名不完全一致） */
function isPaymentRelated(eventType: string, translated: string): boolean {
  const s = `${eventType} ${translated}`.toLowerCase();
  return (
    s.includes('billing') ||
    s.includes('payment') ||
    s.includes('charge') ||
    s.includes('funding') ||
    s.includes('invoice') ||
    s.includes('transaction') ||
    s.includes('settle') ||
    s.includes('credit') ||
    s.includes('预付') ||
    s.includes('扣款')
  );
}

function extraDataSummary(extra: unknown): string | undefined {
  if (extra == null) return undefined;
  if (typeof extra === 'string') {
    const t = extra.trim();
    return t.length > 200 ? `${t.slice(0, 200)}…` : t;
  }
  if (typeof extra === 'object') {
    try {
      const j = JSON.stringify(extra);
      return j.length > 220 ? `${j.slice(0, 220)}…` : j;
    } catch {
      return undefined;
    }
  }
  return String(extra);
}

function parseEventTimeMs(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isNaN(n) && s.length <= 12) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function mapRow(a: Record<string, unknown>): FbAdAccountPaymentActivity {
  const eventType = a.event_type != null ? String(a.event_type) : '';
  const translated = a.translated_event_type != null ? String(a.translated_event_type) : '';
  const parts = [a.object_name, a.actor_name, a.application_name].filter(Boolean).map(String);
  const extra = extraDataSummary(a.extra_data);
  const detail = [parts.join(' · '), extra].filter(Boolean).join(' — ') || undefined;
  return {
    eventTime: a.event_time != null ? String(a.event_time) : undefined,
    eventType: eventType || undefined,
    translatedEventType: translated || undefined,
    objectName: a.object_name != null ? String(a.object_name) : undefined,
    objectType: a.object_type != null ? String(a.object_type) : undefined,
    detail,
  };
}

export type AdAccountPaymentFetchResult = {
  items: FbAdAccountPaymentActivity[];
  /** 拉取到的原始活动条数（分页合并后、时间过滤前） */
  rawCount: number;
  /** 近 5 年时间窗内、且与支付/计费相关的条数 */
  filteredCount: number;
  message?: string;
};

/**
 * 分页拉取 `act_{id}/activities`，在近 5 年内筛选与支付/计费相关的记录。
 * 依赖用户 token 对广告账户的读取权限；无权限或空数据时 `items` 可能为空。
 */
export async function fetchAdAccountPaymentActivities(
  accessToken: string,
  accountId: string
): Promise<AdAccountPaymentFetchResult> {
  const actId = actPath(accountId);
  const sinceMs = fiveYearsAgoMs();
  const fields = encodeURIComponent(ACTIVITY_FIELDS);
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${actId}/activities?fields=${fields}` +
    `&limit=${PAGE_LIMIT}&access_token=${encodeURIComponent(accessToken)}`;

  const rawRows: Record<string, unknown>[] = [];
  let page = 0;

  while (url && page < MAX_PAGES && rawRows.length < MAX_RAW) {
    page += 1;
    console.info('[fbControl:graph:payments] 请求 activities 分页', {
      page,
      url: redactUrlForLog(url),
      token: describeToken(accessToken),
    });
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      console.error('[fbControl:graph:payments] Graph 错误', msg);
      throw new Error(msg);
    }
    const batch = Array.isArray(json.data) ? json.data : [];
    rawRows.push(...batch);
    const next = json.paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
    if (!batch.length) break;
  }

  const inWindow = rawRows.filter((r) => parseEventTimeMs(r.event_time) >= sinceMs);
  const paymentLike = inWindow.filter((r) =>
    isPaymentRelated(
      r.event_type != null ? String(r.event_type) : '',
      r.translated_event_type != null ? String(r.translated_event_type) : ''
    )
  );

  const chosen = paymentLike.length ? paymentLike : [];
  const items = chosen
    .map(mapRow)
    .sort((a, b) => parseEventTimeMs(b.eventTime) - parseEventTimeMs(a.eventTime));

  let message: string | undefined;
  if (!rawRows.length) {
    message = '未返回任何账户活动。可能无权限或该账户无活动记录。';
  } else if (!paymentLike.length) {
    message =
      '近 5 年内未匹配到计费/支付类活动（已按 Meta activities 过滤）。若需完整活动日志，可联系开通相应权限。';
  }

  return {
    items,
    rawCount: rawRows.length,
    filteredCount: items.length,
    message,
  };
}
