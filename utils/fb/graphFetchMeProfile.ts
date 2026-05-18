import { graphFetch } from './graphExternalFetch';

const GRAPH_VERSION = 'v21.0';

export type FbMeProfile = {
  id: string;
  name?: string;
  email?: string;
  link?: string;
};

/** 当前 access_token 对应 Facebook 用户资料 */
export async function fetchFacebookMeProfile(accessToken: string): Promise<FbMeProfile | null> {
  const fields = encodeURIComponent('id,name,email,link');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await graphFetch(url, { method: 'GET' });
  const json = (await res.json()) as FbMeProfile & { error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
  const id = String(json.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    name: typeof json.name === 'string' ? json.name : undefined,
    email: typeof json.email === 'string' ? json.email : undefined,
    link: typeof json.link === 'string' ? json.link : undefined,
  };
}
