/** 从 Graph / Ads Manager 等请求的 URL 中解析 access_token（查询串或 hash） */
export function extractAccessTokenFromUrl(rawUrl: string): string | null {
  if (!rawUrl || !rawUrl.includes('access_token')) return null;
  try {
    const noHash = rawUrl.split('#')[0];
    const u = new URL(noHash);
    const q = u.searchParams.get('access_token');
    if (q && looksLikeFbUserToken(q)) return q.trim();
  } catch {
    /* ignore */
  }
  const m = rawUrl.match(/(?:[?&#])access_token=([^&#]+)/);
  if (!m?.[1]) return null;
  try {
    const decoded = decodeURIComponent(m[1]);
    return looksLikeFbUserToken(decoded) ? decoded.trim() : null;
  } catch {
    return null;
  }
}

export function looksLikeFbUserToken(t: string): boolean {
  if (!t || t.length < 30) return false;
  // 常见为 EAA… 类用户/会话 token；也允许其它长度足够的字母数字串
  if (/^EAA[A-Za-z0-9_-]+$/.test(t)) return true;
  return /^[A-Za-z0-9._-]{40,}$/.test(t);
}
