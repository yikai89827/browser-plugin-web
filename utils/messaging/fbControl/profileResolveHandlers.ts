import { fbControlLog, fbControlWarn } from '../../fbControlLog';
import { resolveFacebookProfileNumericIdViaCometApi } from '../../fb/resolveFacebookVanityCometApi';

import type { FbControlIncomingMessage, FbControlMessageResult } from './types';

function isFacebookProfileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.endsWith('facebook.com') && !h.endsWith('fb.com')) return false;
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 使用 www.facebook.com 的 Comet「format=json」引导请求 + /api/graphql（与 fbspider 思路一致），
 * 在扩展 Service Worker 内 fetch，携带浏览器 Cookie，不打开新标签。
 */
export async function handleFbControlProfileResolveMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  if (message.action !== 'FB_CONTROL_RESOLVE_PROFILE_NUMERIC_ID') return null;

  const data = message.data as { profileUrl?: string } | undefined;
  const profileUrl = typeof data?.profileUrl === 'string' ? data.profileUrl.trim() : '';
  if (!profileUrl || !isFacebookProfileUrl(profileUrl)) {
    return { success: false, error: '需要有效的 https://www.facebook.com/… 主页地址' };
  }

  try {
    const numericId = await resolveFacebookProfileNumericIdViaCometApi(profileUrl);
    if (!numericId) {
      fbControlWarn('messaging:profile-resolve', 'Comet 解析失败', { profileUrl });
      return {
        success: false,
        error:
          '无法通过 Facebook 网页接口解析该主页的数字用户 id。请确认已在 Chrome 登录 facebook.com，或改用 profile.php?id=数字 UID。',
      };
    }
    fbControlLog('messaging:profile-resolve', 'ok', { numericId });
    return { success: true, payload: { numericId } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fbControlWarn('messaging:profile-resolve', '异常', { profileUrl, msg });
    return { success: false, error: msg };
  }
}
