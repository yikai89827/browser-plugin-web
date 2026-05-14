import type { FbControlIncomingMessage, FbControlMessageResult } from './types';
import { fbControlLog } from '../../fbControlLog';
import { handleFbControlAdAccountMessage } from './adAccountHandlers';
import { handleFbControlGraphProxyMessage } from './graphProxyHandlers';
import { handleFbControlPixelMessage } from './pixelHandlers';
import { handleFbControlTokenMessage } from './tokenHandlers';

export type { FbControlIncomingMessage, FbControlMessageResult } from './types';

/**
 * fbControl 扩展消息总线：按领域拆分到 token / 广告账户 / 像素，单一职责。
 */
export async function handleFbControlMessage(
  message: FbControlIncomingMessage
): Promise<FbControlMessageResult> {
  if (message.action === 'FB_CONTROL_PING') {
    fbControlLog('messaging:bus', 'FB_CONTROL_PING');
    return { success: true, payload: { ok: true, version: 1 } };
  }

  const proxyRes = await handleFbControlGraphProxyMessage(message);
  if (proxyRes !== null) return proxyRes;

  const tokenRes = await handleFbControlTokenMessage(message);
  if (tokenRes !== null) return tokenRes;

  const adRes = await handleFbControlAdAccountMessage(message);
  if (adRes !== null) return adRes;

  const pixelRes = await handleFbControlPixelMessage(message);
  if (pixelRes !== null) return pixelRes;

  fbControlLog('messaging:bus', '未匹配 fbControl action', { action: message.action });
  return null;
}
