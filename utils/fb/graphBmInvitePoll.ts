import type { GraphBusinessUserMatch } from './graphBusinessManagement';
import {
  findBusinessUserByEmail,
  findPendingBusinessInviteByEmail,
  formatBmInvitePermissionHint,
  inviteBusinessUserByEmail,
  isNotBusinessScopedUserError,
} from './graphBusinessManagement';

export { isNotBusinessScopedUserError };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BmInvitePollProgress = {
  phase: 'inviting' | 'polling' | 'granting';
  pollAttempt: number;
  maxAttempts: number;
  message: string;
};

/**
 * 向 BM 发送邮箱邀请，并每隔 intervalMs 查询是否已加入（默认最多 5 次）。
 */
export async function inviteToBusinessAndPollMembership(
  accessToken: string,
  businessId: string,
  email: string,
  options?: {
    maxAttempts?: number;
    intervalMs?: number;
    onProgress?: (p: BmInvitePollProgress) => void;
    shouldAbort?: () => boolean;
  }
): Promise<{ joined: boolean; businessUser: GraphBusinessUserMatch | null; message: string }> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const intervalMs = options?.intervalMs ?? 60_000;
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return { joined: false, businessUser: null, message: '请填写对方 Facebook 账号绑定的邮箱' };
  }

  options?.onProgress?.({
    phase: 'inviting',
    pollAttempt: 0,
    maxAttempts,
    message: '正在发送 BM 邀请…',
  });

  let inviteNote = '';
  try {
    const inv = await inviteBusinessUserByEmail(accessToken, businessId, normalizedEmail, 'EMPLOYEE');
    inviteNote = inv.pending ? '邀请已存在或待接受' : 'Graph 已接受邀请请求';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/pending|invite|invitation|已邀请|already/i.test(msg)) {
      return {
        joined: false,
        businessUser: null,
        message: formatBmInvitePermissionHint(`发送 BM 邀请失败：${msg}`),
      };
    }
    inviteNote = '邀请可能已存在（Meta 返回重复邀请）';
  }

  const existingMember = await findBusinessUserByEmail(accessToken, businessId, normalizedEmail);
  const pendingHit = await findPendingBusinessInviteByEmail(accessToken, businessId, normalizedEmail);
  if (existingMember) {
    inviteNote += `；该邮箱已是 BM 成员，无需等待邮件`;
  } else if (pendingHit) {
    inviteNote += `；BM 待接受列表中已有 ${normalizedEmail}（邀请有效，邮件由 Meta 发送，可能延迟或进垃圾箱）`;
  } else {
    inviteNote +=
      '；未在 BM「待接受邀请」中查到该邮箱，可能未真正发出邀请（请确认发起账号已完成双重验证，或改在 business.facebook.com → 用户 中手动邀请）';
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options?.shouldAbort?.()) {
      return {
        joined: false,
        businessUser: null,
        message: `${inviteNote}；已停止确认（第 ${attempt - 1}/${maxAttempts} 次）`,
      };
    }

    options?.onProgress?.({
      phase: 'polling',
      pollAttempt: attempt,
      maxAttempts,
      message: `${inviteNote}；第 ${attempt}/${maxAttempts} 次确认是否已加入 BM…`,
    });

    const hit = await findBusinessUserByEmail(accessToken, businessId, normalizedEmail);
    if (hit) {
      return {
        joined: true,
        businessUser: hit,
        message: `${inviteNote}；对方已加入 BM（${hit.email}）`,
      };
    }

    if (attempt < maxAttempts) {
      if (options?.shouldAbort?.()) {
        return {
          joined: false,
          businessUser: null,
          message: `${inviteNote}；已停止确认（第 ${attempt}/${maxAttempts} 次）`,
        };
      }
      await sleep(intervalMs);
    }
  }

  return {
    joined: false,
    businessUser: null,
    message: `${inviteNote}；已确认 ${maxAttempts} 次，对方仍未出现在 BM 用户列表中，请让对方接受邮件邀请后手动重试授权`,
  };
}
