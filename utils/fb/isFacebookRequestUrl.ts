/** 判断是否为 Meta / Facebook 系请求 URL（用于 token 捕获等） */
export function isFacebookRequestUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === 'facebook.com' ||
      h.endsWith('.facebook.com') ||
      h === 'fb.com' ||
      h.endsWith('.fb.com')
    );
  } catch {
    return url.includes('facebook.com');
  }
}
