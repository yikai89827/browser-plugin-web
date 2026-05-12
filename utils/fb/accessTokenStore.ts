import { browser } from 'wxt/browser';

const KEY_TOKEN = 'fb_control_access_token';
const KEY_UPDATED = 'fb_control_token_updated_at';
const KEY_HOST = 'fb_control_token_source_host';

export type FbTokenMeta = {
  hasToken: boolean;
  updatedAt: number | null;
  sourceHost: string | null;
  /** 仅前缀，用于界面展示 */
  tokenPrefix: string | null;
};

export async function saveFbAccessToken(token: string, sourceHost: string): Promise<void> {
  const t = token.trim();
  if (!t) return;
  await browser.storage.local.set({
    [KEY_TOKEN]: t,
    [KEY_UPDATED]: Date.now(),
    [KEY_HOST]: sourceHost.slice(0, 200),
  });
}

export async function getFbAccessToken(): Promise<string | null> {
  const v = await browser.storage.local.get(KEY_TOKEN);
  const t = v[KEY_TOKEN];
  return typeof t === 'string' && t.length ? t : null;
}

export async function getFbTokenMeta(): Promise<FbTokenMeta> {
  const v = await browser.storage.local.get([KEY_TOKEN, KEY_UPDATED, KEY_HOST]);
  const token = typeof v[KEY_TOKEN] === 'string' ? (v[KEY_TOKEN] as string) : '';
  const updatedAt =
    typeof v[KEY_UPDATED] === 'number' ? (v[KEY_UPDATED] as number) : null;
  const sourceHost =
    typeof v[KEY_HOST] === 'string' ? (v[KEY_HOST] as string) : null;
  return {
    hasToken: token.length > 0,
    updatedAt,
    sourceHost,
    tokenPrefix: token ? `${token.slice(0, 8)}…` : null,
  };
}

export async function clearFbAccessToken(): Promise<void> {
  await browser.storage.local.remove([KEY_TOKEN, KEY_UPDATED, KEY_HOST]);
}
