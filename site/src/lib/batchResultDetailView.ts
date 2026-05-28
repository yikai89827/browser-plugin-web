export type BatchResultDetailSegment = {
  label: string;
  message: string;
};

export function isNotBusinessScopedUserError(message: string): boolean {
  const t = (message || '').trim();
  if (!t) return false;
  return (
    /subcode\s*=\s*1752100/i.test(t) ||
    /不属于业务账户范畴/i.test(t) ||
    /business user or system user/i.test(t) ||
    /自动换算为商务用户编号/i.test(t) ||
    /请确认对方已加入\s*BM/i.test(t)
  );
}

export type BatchResultDetailView = {
  summary: string | null;
  segments: BatchResultDetailSegment[];
  /** 无分段时的整段文案 */
  plain: string | null;
};

function splitLabelMessage(line: string): BatchResultDetailSegment {
  const trimmed = line.trim();
  const urlMatch = trimmed.match(/^(https?:\/\/\S+?):\s+(.+)$/s);
  if (urlMatch) {
    return { label: urlMatch[1], message: urlMatch[2].trim() };
  }
  const colon = trimmed.indexOf(': ');
  if (colon > 0) {
    return { label: trimmed.slice(0, colon).trim(), message: trimmed.slice(colon + 2).trim() };
  }
  return { label: '', message: trimmed };
}

/**
 * 将批量结果 `detail` 拆成摘要 + 各账号/UID 分段，便于结果卡完整展示。
 */
export function parseBatchResultDetail(detail: string): BatchResultDetailView {
  const raw = (detail || '').trim();
  if (!raw) return { summary: null, segments: [], plain: null };

  const partialMatch = raw.match(/^(\d+\/\d+\s+成功)\s*[。.]?\s*(.*)$/s);
  if (partialMatch) {
    const summary = partialMatch[1].trim();
    const body = (partialMatch[2] || '').trim();
    if (!body) return { summary, segments: [], plain: null };
    const segments = body.split(/[;；]+/).map(splitLabelMessage).filter((s) => s.label || s.message);
    return { summary, segments, plain: null };
  }

  if (/[;；]/.test(raw)) {
    const segments = raw.split(/[;；]+/).map(splitLabelMessage).filter((s) => s.label || s.message);
    if (segments.length > 1) {
      return { summary: null, segments, plain: null };
    }
  }

  return { summary: null, segments: [], plain: raw };
}
