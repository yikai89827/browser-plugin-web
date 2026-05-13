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
