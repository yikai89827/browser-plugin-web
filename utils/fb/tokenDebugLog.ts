/** 日志中描述 token，绝不输出完整串 */
export function describeToken(token: string | null | undefined): string {
  if (!token || !token.length) return '(empty)';
  return `len=${token.length} prefix=${token.slice(0, 8)}…`;
}

/** 用于日志的 URL（去掉 access_token 参数） */
export function redactUrlForLog(url: string): string {
  try {
    return url.replace(/([?&#])access_token=[^&#]*/gi, '$1access_token=(redacted)');
  } catch {
    return '(invalid-url)';
  }
}

/** 请求日志用：主机 + 路径截断（不含 query） */
export function shortUrlPathForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.slice(0, 120);
  } catch {
    return url.slice(0, 80);
  }
}

