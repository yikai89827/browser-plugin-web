import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

/** 当前 access_token 对应用户的数字 id（与 assigned_users.id 对齐） */
export async function fetchFacebookMeNumericId(accessToken: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await graphFetch(url, { method: 'GET' });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || json.error?.message) return null;
    const id = json.id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}
