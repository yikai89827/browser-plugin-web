import type { BatchDrawerSubmitPayload } from '../../site/src/lib/batchOperationTypes';
import { fbControlLog } from '../fbControlLog';
import { redactUrlForLog } from './tokenDebugLog';

const GRAPH_VERSION = 'v21.0';

export type AdAccountBatchResultRow = {
  accountId: string;
  status: string;
  detail: string;
};

function actPath(accountId: string): string {
  const raw = String(accountId).replace(/^act_/i, '').trim();
  return raw ? `act_${raw}` : String(accountId);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * 从多行文本解析 Facebook 数字用户 ID（支持纯数字、profile.php?id=、m.me/ 等常见形态）。
 */
export function parseFacebookUserIdsFromText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let id: string | null = null;
    if (/^\d{5,}$/.test(line)) id = line;
    else {
      const m1 = line.match(/[?&]id=(\d{5,})/i);
      if (m1) id = m1[1];
      else {
        const m2 = line.match(/facebook\.com\/(?:profile\.php\?[^#]*id=|people\/[^/]+\/|)(\d{5,})(?:\/|\?|$)/i);
        if (m2) id = m2[1];
      }
    }
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 与批量抽屉子选项对应：管理员 / 广告管理员 / 分析员 */
export function adAccountTasksForSubId(subId: string | undefined): string[] {
  switch (subId) {
    case 'ad_admin':
      return ['ADVERTISE', 'ANALYZE', 'VIEW'];
    case 'analyst':
      return ['ANALYZE', 'VIEW'];
    case 'admin':
    default:
      return ['MANAGE', 'ADVERTISE', 'ANALYZE', 'VIEW'];
  }
}

/** 把 Graph `error` 拼成可读字符串，便于批量结果里直接看到子码与用户文案。 */
function formatGraphErrorBody(json: Record<string, unknown>, httpStatus: number): string {
  const err = json.error as {
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    code?: number;
    error_subcode?: number;
  } | undefined;
  if (!err?.message && !err?.error_user_msg) {
    return `HTTP ${httpStatus}`;
  }
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  if (err.error_user_msg && err.error_user_msg !== err.message) parts.push(err.error_user_msg);
  if (err.error_user_title) parts.push(`(${err.error_user_title})`);
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
  return parts.join(' | ');
}

async function graphJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
  fbControlLog('fb:graph-batch', 'request', { url: redactUrlForLog(url), method: init.method || 'GET' });
  const res = await fetch(url, init);
  const json = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, json, status: res.status };
}

/** Graph 校验 UID 是否可被当前 token 读取（近似 fbspider「检测」步骤，非真实好友关系 API）。 */
export async function verifyFacebookUserIdsForBatch(
  accessToken: string,
  uidsText: string
): Promise<{ ok: boolean; message: string }> {
  const ids = parseFacebookUserIdsFromText(uidsText);
  if (!ids.length) {
    return { ok: false, message: '未能解析出有效的数字 UID（每行一个或主页链接）' };
  }
  const errs: string[] = [];
  for (const id of ids) {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      id
    )}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
    const { ok, json } = await graphJson(url, { method: 'GET' });
    const err = json.error as { message?: string } | undefined;
    if (!ok || err?.message) {
      errs.push(`${id}: ${err?.message || '请求失败'}`);
    }
  }
  if (errs.length) {
    return { ok: false, message: `部分 UID 校验失败：${errs.slice(0, 3).join('；')}${errs.length > 3 ? '…' : ''}` };
  }
  return { ok: true, message: `已通过 Graph 校验 ${ids.length} 个用户（可继续授权）` };
}

async function postAssignedUser(
  accessToken: string,
  accountId: string,
  userId: string,
  tasks: string[]
): Promise<void> {
  const act = actPath(accountId);
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('user', userId);
  body.set('tasks', JSON.stringify(tasks));
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users`;
  const res = await fetch(url, { method: 'POST', body });
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok || json.error?.message) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

async function deleteAssignedUser(accessToken: string, accountId: string, userId: string): Promise<void> {
  const act = actPath(accountId);
  const q = new URLSearchParams({
    user: userId,
    access_token: accessToken,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users?${q.toString()}`;
  const res = await fetch(url, { method: 'DELETE' });
  const json = (await res.json()) as { error?: { message?: string }; success?: boolean };
  if (!res.ok || json.error?.message) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

async function postAdAccountField(
  accessToken: string,
  accountId: string,
  fields: Record<string, string>
): Promise<void> {
  const act = actPath(accountId);
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, v);
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}`;
  const res = await fetch(url, { method: 'POST', body });
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string } | undefined;
  if (!res.ok || err?.message) {
    throw new Error(formatGraphErrorBody(json, res.status));
  }
}

/**
 * 广告账户改名：与 Ads Manager 一致走 `adsmanager-graph`，并带 `suppress_http_code=1`
 *（HTTP 可能始终为 200，必须以响应 JSON 是否含 `error` 判断成败）。
 */
export async function renameAdAccountViaAdsManagerGraph(
  accessToken: string,
  accountId: string,
  newName: string
): Promise<void> {
  const act = actPath(accountId);
  const query = new URLSearchParams({
    name: newName,
    access_token: accessToken,
    suppress_http_code: '1',
    locale: 'en_US',
    format: 'json',
    pretty: '0',
    transport: 'cors',
  });
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('name', newName);
  body.set('suppress_http_code', '1');
  body.set('locale', 'en_US');

  const url = `https://adsmanager-graph.facebook.com/${GRAPH_VERSION}/${act}?${query.toString()}`;
  fbControlLog('fb:graph-batch', 'adsmanager rename', { url: redactUrlForLog(url), method: 'POST' });
  const res = await fetch(url, { method: 'POST', body });
  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`重命名接口返回非 JSON（HTTP ${res.status}）`);
  }
  if (json.error !== undefined && json.error !== null) {
    const msg = formatGraphErrorBody(json, res.status);
    throw new Error(msg !== `HTTP ${res.status}` ? msg : JSON.stringify(json.error));
  }
}

/** 解析限额：单行数字 → 对所有账户使用同一 spend_cap（最小货币单位）；多行则按与选中账户顺序一一对应。 */
function parseSpendCapMinors(text: string, accountCount: number): number[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const n = parseInt(l.replace(/[,_\s]/g, ''), 10);
      return Number.isFinite(n) ? n : NaN;
    })
    .filter((n) => !Number.isNaN(n));

  if (!lines.length) return null;
  if (lines.length === 1) return Array.from({ length: accountCount }, () => lines[0]);
  if (lines.length !== accountCount) return null;
  return lines;
}

/**
 * 执行账户管理批量操作（与 fbspider 类工具一致：优先走 Marketing Graph）。
 */
export async function executeAdAccountBatchOperation(
  accessToken: string,
  payload: BatchDrawerSubmitPayload
): Promise<AdAccountBatchResultRow[]> {
  const delayMs = payload.useDefaultInterval ? 200 : 0;
  const accounts = [...payload.selectedAccountIds];
  const results: AdAccountBatchResultRow[] = [];

  const pushResult = (accountId: string, status: string, detail: string) => {
    results.push({ accountId, status, detail });
  };

  switch (payload.operationId) {
    case 'add_ad_permissions': {
      const uids = parseFacebookUserIdsFromText(payload.uidsText);
      if (!uids.length) {
        throw new Error('请填写至少一个 Facebook 用户 UID 或主页链接');
      }
      const tasks = adAccountTasksForSubId(payload.subId);
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const uid of uids) {
          try {
            await postAssignedUser(accessToken, accountId, uid, tasks);
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail =
          errs.length === 0
            ? `已为 ${uids.length} 个用户添加权限（${tasks.join(',')}）`
            : `${ok}/${uids.length} 成功。${errs.slice(0, 2).join('；')}${errs.length > 2 ? '…' : ''}`;
        pushResult(accountId, status, detail);
      }
      break;
    }

    case 'remove_ad_permissions':
    case 'remove_admin': {
      const uids = parseFacebookUserIdsFromText(payload.uidsText);
      if (!uids.length) {
        throw new Error('请填写要移除的用户 UID（每行一个）');
      }
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const uid of uids) {
          try {
            await deleteAssignedUser(accessToken, accountId, uid);
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail =
          errs.length === 0
            ? `已移除 ${uids.length} 个用户的账户权限`
            : `${ok}/${uids.length} 成功。${errs.slice(0, 2).join('；')}${errs.length > 2 ? '…' : ''}`;
        pushResult(accountId, status, detail);
      }
      break;
    }

    case 'set_limit': {
      const caps = parseSpendCapMinors(payload.uidsText, accounts.length);
      if (!caps) {
        throw new Error('请填写 spend_cap（最小货币单位整数）：单行表示全部账户同一限额，或与选中行数相同的行数一一对应');
      }
      for (let i = 0; i < accounts.length; i++) {
        const accountId = accounts[i];
        try {
          await postAdAccountField(accessToken, accountId, { spend_cap: String(caps[i]) });
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', `spend_cap 已设为 ${caps[i]}`);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'reset_limit': {
      for (const accountId of accounts) {
        try {
          await postAdAccountField(accessToken, accountId, { spend_cap: '0' });
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', '已请求将 spend_cap 置为 0（若账户策略不允许可能需在 BM 内核对）');
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'add_to_bm': {
      const lines = payload.uidsText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const bmLine = lines[0];
      const bmId = bmLine && /^\d{5,}$/.test(bmLine) ? bmLine : parseFacebookUserIdsFromText(bmLine)[0];
      if (!bmId) {
        throw new Error('请在说明框第一行填写要加入的 Business ID（纯数字 BM ID）');
      }
      const idsJson = JSON.stringify(accounts.map((id) => actPath(id)));
      const body = new URLSearchParams();
      body.set('access_token', accessToken);
      body.set('adaccount_ids', idsJson);
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${bmId}/adaccounts`;
      const res = await fetch(url, { method: 'POST', body });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || (json.error as { message?: string } | undefined)?.message) {
        const msg = formatGraphErrorBody(json, res.status);
        for (const accountId of accounts) {
          pushResult(accountId, '失败', msg);
        }
      } else {
        for (const accountId of accounts) {
          pushResult(accountId, '成功', `已请求加入 BM ${bmId}`);
        }
      }
      break;
    }

    case 'account_rename': {
      const name = payload.uidsText.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
      if (!name) {
        throw new Error('请填写新账号名称（第一行生效，对所有选中账户相同）');
      }
      for (const accountId of accounts) {
        try {
          await renameAdAccountViaAdsManagerGraph(accessToken, accountId, name);
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', `名称已更新为「${name}」`);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'bm_partner':
    case 'update_business':
    case 'account_push':
    case 'batch_payment_records':
    default: {
      for (const accountId of accounts) {
        pushResult(
          accountId,
          '跳过',
          `操作「${payload.operationId}」需 Business 合作伙伴/推送等接口，当前版本未接 Graph，请用 Meta 后台或 fbspider 完整流程`
        );
      }
      break;
    }
  }

  return results;
}
