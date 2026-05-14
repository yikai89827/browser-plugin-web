import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

function jsonHasError(json: unknown): boolean {
  if (json == null || typeof json !== 'object') return false;
  return (json as { error?: unknown }).error != null;
}

function pushUnique(out: Set<string>, id: unknown) {
  if (id == null) return;
  const s = String(id).trim();
  if (s) out.add(s);
}

/**
 * 收集当前 access_token 在 Graph 中可能对应的用户数字 id（用于在 assigned_users 里排除自己）。
 * 同时使用 `GET /me` 与 `debug_token`，避免仅一种接口返回的 id 与 assigned_users 行内 id 不一致时排除失败，
 * 从而导致「管理员」列把本人 MANAGE 算进去、户户显示 1。
 */
export async function fetchFacebookSelfUserIdsForExclude(accessToken: string): Promise<string[]> {
  const out = new Set<string>();
  const enc = encodeURIComponent(accessToken);

  const meUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id&access_token=${enc}`;
  try {
    const res = await graphFetch(meUrl, { method: 'GET' });
    const json = (await res.json()) as { id?: string | number; error?: unknown };
    if (res.ok && !jsonHasError(json)) {
      pushUnique(out, json.id);
    }
  } catch {
    /* ignore */
  }

  const dbgUrl = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${enc}&access_token=${enc}`;
  try {
    const res = await graphFetch(dbgUrl, { method: 'GET' });
    const json = (await res.json()) as {
      data?: { user_id?: string | number; profile_id?: string | number };
      error?: unknown;
    };
    if (res.ok && !jsonHasError(json)) {
      pushUnique(out, json.data?.user_id);
      pushUnique(out, json.data?.profile_id);
    }
  } catch {
    /* ignore */
  }

  return [...out];
}

/** 兼容仅需单 id 的调用方（取候选中的第一个） */
export async function fetchFacebookMeNumericId(accessToken: string): Promise<string | null> {
  const ids = await fetchFacebookSelfUserIdsForExclude(accessToken);
  return ids[0] ?? null;
}
