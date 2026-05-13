import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlLog } from '../../fbControlLog';
import {
  clearFbAccessToken,
  getFbAccessToken,
  getFbTokenMeta,
  saveFbAccessToken,
} from '../../fb/accessTokenStore';
import { looksLikeFbUserToken } from '../../fb/extractAccessTokenFromUrl';
import { describeToken } from '../../fb/tokenDebugLog';

/** Token 相关消息：元数据、读取、手动设置、清除（与 Graph / IndexedDB 账户表解耦） */
export async function handleFbControlTokenMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  switch (message.action) {
    case 'FB_CONTROL_GET_TOKEN_META':
      fbControlLog('messaging:token', 'FB_CONTROL_GET_TOKEN_META');
      return { success: true, payload: await getFbTokenMeta() };

    case 'FB_CONTROL_GET_ACCESS_TOKEN': {
      const token = await getFbAccessToken();
      fbControlLog('messaging:token', 'FB_CONTROL_GET_ACCESS_TOKEN（脱敏）', describeToken(token));
      return { success: true, payload: { token } };
    }

    case 'FB_CONTROL_SET_ACCESS_TOKEN': {
      const body = message.data as { token?: string; sourceHost?: string } | undefined;
      const token = typeof body?.token === 'string' ? body.token.trim() : '';
      if (!token) {
        return { success: false, error: 'token required' };
      }
      if (!looksLikeFbUserToken(token)) {
        return { success: false, error: 'token format invalid' };
      }
      fbControlLog('messaging:token', 'FB_CONTROL_SET_ACCESS_TOKEN', {
        sourceHost: body?.sourceHost || 'manual',
        token: describeToken(token),
      });
      await saveFbAccessToken(token, body?.sourceHost || 'manual');
      fbControlLog('messaging:token', 'SET_ACCESS_TOKEN 已落库');
      return { success: true };
    }

    case 'FB_CONTROL_CLEAR_ACCESS_TOKEN':
      await clearFbAccessToken();
      fbControlLog('messaging:token', 'FB_CONTROL_CLEAR_ACCESS_TOKEN 完成');
      return { success: true };

    default:
      return null;
  }
}
