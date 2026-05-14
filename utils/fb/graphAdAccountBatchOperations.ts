import type { BatchDrawerSubmitPayload } from '../../site/src/lib/batchOperationTypes';
import { getConfiguredGraphBatchStepDelayMs } from './batchStepDelayMs';
import { fbControlLog } from '../fbControlLog';
import { fetchFacebookMeNumericId } from './graphFetchMe';
import { graphFetch } from './graphExternalFetch';
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

/** Graph `POST .../assigned_users` 的 `tasks` 仅允许（见 #100）：MANAGE、ADVERTISE、ANALYZE、DRAFT、AA_ANALYZE；不得含 VIEW */
const ASSIGNED_USER_TASKS_ALLOWED = new Set(['MANAGE', 'ADVERTISE', 'ANALYZE', 'DRAFT', 'AA_ANALYZE']);

/** 与批量抽屉子选项对应：管理员 / 广告管理员 / 分析员 */
export function adAccountTasksForSubId(subId: string | undefined): string[] {
  switch (subId) {
    case 'ad_admin':
      return ['ADVERTISE', 'ANALYZE'];
    case 'analyst':
      return ['ANALYZE'];
    case 'admin':
    default:
      return ['MANAGE', 'ADVERTISE', 'ANALYZE'];
  }
}

function sanitizeAssignedUserTasksForPost(tasks: string[]): string[] {
  return tasks.map((t) => String(t).toUpperCase()).filter((t) => ASSIGNED_USER_TASKS_ALLOWED.has(t));
}

/** 把 Graph `error` 拼成可读字符串（优先 Meta 面向用户的 title/msg，便于批量结果里展示失败原因）。 */
function formatGraphErrorBody(json: Record<string, unknown>, httpStatus: number): string {
  const err = json.error as {
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    code?: number;
    error_subcode?: number;
  } | undefined;
  if (!err || (!err.message && !err.error_user_msg && !err.error_user_title)) {
    return `HTTP ${httpStatus}`;
  }
  const parts: string[] = [];
  const title = err.error_user_title != null ? String(err.error_user_title).trim() : '';
  const userMsg = err.error_user_msg != null ? String(err.error_user_msg).trim() : '';
  const tech = err.message != null ? String(err.message).trim() : '';
  if (title) parts.push(title);
  if (userMsg) parts.push(userMsg);
  if (tech && tech !== userMsg) parts.push(tech);
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
  return parts.join(' | ');
}

async function graphJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
  fbControlLog('fb:graph-batch', 'request', { url: redactUrlForLog(url), method: init.method || 'GET' });
  const res = await graphFetch(url, init);
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
    const { ok, json, status } = await graphJson(url, { method: 'GET' });
    if (!ok || json.error) {
      errs.push(`${id}: ${formatGraphErrorBody(json, status)}`);
    }
  }
  if (errs.length) {
    return { ok: false, message: `部分 UID 校验失败：${errs.slice(0, 3).join('；')}${errs.length > 3 ? '…' : ''}` };
  }
  return { ok: true, message: `${ids.length} 个用户已通过校验 （可点击确定继续授权）` };
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
  const safeTasks = sanitizeAssignedUserTasksForPost(tasks);
  if (!safeTasks.length) {
    throw new Error('授权 tasks 为空：请使用 MANAGE / ADVERTISE / ANALYZE / DRAFT / AA_ANALYZE 之一');
  }
  body.set('tasks', JSON.stringify(safeTasks));
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users`;
  const res = await graphFetch(url, { method: 'POST', body });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    throw new Error(formatGraphErrorBody(json, res.status));
  }
}

async function deleteAssignedUser(accessToken: string, accountId: string, userId: string): Promise<void> {
  const act = actPath(accountId);
  const q = new URLSearchParams({
    user: userId,
    access_token: accessToken,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users?${q.toString()}`;
  const res = await graphFetch(url, { method: 'DELETE' });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    throw new Error(formatGraphErrorBody(json, res.status));
  }
}

/** 分页拉取广告账户已分配用户 id（用于批量删权限） */
async function fetchAssignedUserIds(accessToken: string, accountId: string): Promise<string[]> {
  const act = actPath(accountId);
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}/assigned_users?fields=id&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  const out: string[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 25 && url; page++) {
    const { ok, json, status } = await graphJson(url, { method: 'GET' });
    if (!ok) {
      throw new Error(formatGraphErrorBody(json, status));
    }
    const rows = Array.isArray((json as { data?: { id?: string }[] }).data)
      ? (json as { data: { id?: string }[] }).data
      : [];
    for (const row of rows) {
      const id = row.id != null ? String(row.id) : '';
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    const next = (json as { paging?: { next?: string } }).paging?.next;
    url = typeof next === 'string' && next.length ? next : '';
  }
  return out;
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
  const res = await graphFetch(url, { method: 'POST', body });
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
  const res = await graphFetch(url, { method: 'POST', body });
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

async function fetchAdAccountSpendCapMinor(accessToken: string, accountId: string): Promise<number | null> {
  const act = actPath(accountId);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${act}?fields=spend_cap&access_token=${encodeURIComponent(accessToken)}`;
  fbControlLog('fb:graph-batch', 'GET spend_cap', { url: redactUrlForLog(url) });
  const res = await graphFetch(url);
  const json = (await res.json()) as { spend_cap?: string | number; error?: { message?: string } };
  if (!res.ok || json.error?.message) return null;
  const raw = json.spend_cap;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

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
  /** `useDefaultInterval` 为 true 时用 `config/fbControlBatch.json` / `VITE_FB_BATCH_STEP_DELAY_MS`；为 false 则立即（0） */
  const delayMs = payload.useDefaultInterval ? getConfiguredGraphBatchStepDelayMs() : 0;
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

    case 'remove_perm_their': {
      const me = await fetchFacebookMeNumericId(accessToken);
      const removeCurrent = payload.removeAuthForm?.deleteCurrentFacebookPerm === true;
      let targetUids = parseFacebookUserIdsFromText(payload.uidsText);
      if (!targetUids.length) {
        throw new Error('请填写至少一个要移除权限的 Facebook 用户 UID 或主页链接');
      }
      if (!removeCurrent && me) {
        targetUids = targetUids.filter((u) => u !== me);
      }
      if (!targetUids.length) {
        throw new Error('未勾选「删除当前 Facebook 账号的权限」时，请至少填写一条他人 UID');
      }
      for (const accountId of accounts) {
        const errs: string[] = [];
        let ok = 0;
        for (const uid of targetUids) {
          try {
            await deleteAssignedUser(accessToken, accountId, uid);
            ok++;
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const n = targetUids.length;
        const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
        const detail =
          errs.length === 0
            ? `已按列表尝试移除 ${n} 个用户的权限`
            : `${ok}/${n} 成功。${errs.slice(0, 2).join('；')}${errs.length > 2 ? '…' : ''}`;
        pushResult(accountId, status, detail);
      }
      break;
    }

    case 'remove_perm_except_self': {
      const me = await fetchFacebookMeNumericId(accessToken);
      if (!me) {
        throw new Error('无法获取当前用户 id，无法执行「除了自己，删除所有」');
      }
      for (const accountId of accounts) {
        try {
          const uids = (await fetchAssignedUserIds(accessToken, accountId)).filter((u) => u !== me);
          if (!uids.length) {
            pushResult(accountId, '成功', '除当前账号外无其他协作者');
            continue;
          }
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
              ? `已移除 ${uids.length} 个协作者（已保留当前账号）`
              : `${ok}/${uids.length} 成功。${errs.slice(0, 2).join('；')}${errs.length > 2 ? '…' : ''}`;
          pushResult(accountId, status, detail);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_self': {
      const me = await fetchFacebookMeNumericId(accessToken);
      if (!me) {
        throw new Error('无法获取当前用户 id，无法执行「删除自己」');
      }
      for (const accountId of accounts) {
        try {
          await deleteAssignedUser(accessToken, accountId, me);
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', '已移除当前账号在本广告账户上的权限');
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_except_them': {
      const me = await fetchFacebookMeNumericId(accessToken);
      const removeCurrent = payload.removeAuthForm?.deleteCurrentFacebookPerm === true;
      const keep = new Set(parseFacebookUserIdsFromText(payload.uidsText));
      if (!keep.size) {
        throw new Error('请填写至少一个要保留的 Facebook 用户 UID 或主页链接');
      }
      for (const accountId of accounts) {
        try {
          const assigned = await fetchAssignedUserIds(accessToken, accountId);
          let toRemove = assigned.filter((u) => !keep.has(u));
          if (!removeCurrent && me) {
            toRemove = toRemove.filter((u) => u !== me);
          }
          if (!toRemove.length) {
            pushResult(accountId, '成功', '无其余协作者需移除（或均在保留列表中）');
            continue;
          }
          const errs: string[] = [];
          let ok = 0;
          for (const uid of toRemove) {
            try {
              await deleteAssignedUser(accessToken, accountId, uid);
              ok++;
              if (delayMs) await sleep(delayMs);
            } catch (e: unknown) {
              errs.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          const n = toRemove.length;
          const status = errs.length === 0 ? '成功' : ok > 0 ? '部分成功' : '失败';
          const detail =
            errs.length === 0
              ? `已移除 ${n} 个协作者（已保留列表中的账号）`
              : `${ok}/${n} 成功。${errs.slice(0, 2).join('；')}${errs.length > 2 ? '…' : ''}`;
          pushResult(accountId, status, detail);
        } catch (e: unknown) {
          pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
        }
      }
      break;
    }

    case 'remove_perm_bm': {
      const hint = '「删除BM」需 Business Manager Graph，当前版本未接入';
      for (const accountId of accounts) {
        pushResult(accountId, '跳过', hint);
      }
      break;
    }

    case 'set_limit': {
      const form = payload.spendLimitForm;
      if (form) {
        const delta = form.amountMinor ?? null;
        if (delta == null || delta <= 0) {
          throw new Error('请填写有效的额度金额');
        }
        for (const accountId of accounts) {
          try {
            let targetMinor: number;
            if (form.kind === 'increase') {
              const cur = await fetchAdAccountSpendCapMinor(accessToken, accountId);
              if (cur === null) {
                throw new Error('无法读取当前 spend_cap');
              }
              targetMinor = cur <= 0 ? delta : cur + delta;
            } else {
              const cur = await fetchAdAccountSpendCapMinor(accessToken, accountId);
              if (cur === null) {
                throw new Error('无法读取当前 spend_cap');
              }
              if (cur <= 0) {
                throw new Error('当前为不限额（spend_cap=0），无法减少额度');
              }
              targetMinor = Math.max(0, cur - delta);
            }
            await postAdAccountField(accessToken, accountId, { spend_cap: String(targetMinor) });
            if (delayMs) await sleep(delayMs);
            pushResult(accountId, '成功', `spend_cap 已设为 ${targetMinor}（最小货币单位）`);
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }
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
      const rf = payload.resetLimitForm;
      if (rf?.mode === 'set_absolute') {
        const cap = rf.amountMinor;
        if (cap == null || cap < 0) {
          throw new Error('请填写有效的限额（最小货币单位）');
        }
        for (const accountId of accounts) {
          try {
            await postAdAccountField(accessToken, accountId, { spend_cap: String(cap) });
            if (delayMs) await sleep(delayMs);
            pushResult(accountId, '成功', `spend_cap 已设为 ${cap}`);
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }
      const detailMsg =
        rf?.mode === 'delete_restriction'
          ? '已请求解除 spend_cap 限制（spend_cap=0，与账户清零相同接口）'
          : '已请求将 spend_cap 置为 0（若账户策略不允许可能需在 BM 内核对）';
      for (const accountId of accounts) {
        try {
          await postAdAccountField(accessToken, accountId, { spend_cap: '0' });
          if (delayMs) await sleep(delayMs);
          pushResult(accountId, '成功', detailMsg);
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
      let bmId: string | undefined;
      for (const line of lines) {
        if (/^\d{5,}$/.test(line)) {
          bmId = line;
          break;
        }
        const parsed = parseFacebookUserIdsFromText(line)[0];
        if (parsed) {
          bmId = parsed;
          break;
        }
      }
      if (!bmId) {
        throw new Error('请填写有效的 Business Manager ID（纯数字 BM ID，至少一行）');
      }
      const mode = payload.subId === 'bm_claim' ? 'claim' : 'share';

      if (mode === 'claim') {
        for (const accountId of accounts) {
          try {
            const body = new URLSearchParams();
            body.set('access_token', accessToken);
            body.set('adaccount_id', actPath(accountId));
            const url = `https://graph.facebook.com/${GRAPH_VERSION}/${bmId}/owned_ad_accounts`;
            const res = await graphFetch(url, { method: 'POST', body });
            const json = (await res.json()) as Record<string, unknown>;
            if (!res.ok || (json.error as { message?: string } | undefined)?.message) {
              pushResult(accountId, '失败', formatGraphErrorBody(json, res.status));
            } else {
              pushResult(accountId, '成功', `BM 认领已请求（${bmId}，不可移除类）`);
            }
            if (delayMs) await sleep(delayMs);
          } catch (e: unknown) {
            pushResult(accountId, '失败', e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }

      const idsJson = JSON.stringify(accounts.map((id) => actPath(id)));
      const body = new URLSearchParams();
      body.set('access_token', accessToken);
      body.set('adaccount_ids', idsJson);
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${bmId}/adaccounts`;
      const res = await graphFetch(url, { method: 'POST', body });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || (json.error as { message?: string } | undefined)?.message) {
        const msg = formatGraphErrorBody(json, res.status);
        for (const accountId of accounts) {
          pushResult(accountId, '失败', msg);
        }
      } else {
        for (const accountId of accounts) {
          pushResult(accountId, '成功', `已请求加入 BM ${bmId}（分享给 BM，可移除类）`);
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
