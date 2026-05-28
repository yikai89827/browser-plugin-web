import type { FbMeProfile } from '../../../utils/fb/graphFetchMeProfile';
import { fetchFacebookMeProfile } from '../../../utils/fb/graphFetchMeProfile';
import {
  fetchFacebookUserPrimaryEmail,
  findEmailForFacebookUserInAccessibleBusinesses,
} from '../../../utils/fb/adAccount/graphBusinessManagement';
import {
  extensionConfigured,
  formatExtensionUserError,
  getFbAccessTokenFromExtension,
  getFbTokenMetaFromExtension,
} from './extensionBridge';
import { EXT_MSG_NO_EXTENSION_ID } from './extensionUserMessages';

const SITE_USERNAME_KEY = 'fb_control_site_username';
const SITE_ACCOUNT_ID_KEY = 'fb_control_site_account_id';

export type DashboardAccountView = {
  username: string;
  siteAccountId: string;
  email: string;
  facebookUserId: string;
  facebookName: string;
  facebookLink: string;
  hasToken: boolean;
  /** 仅用于复制，不展示在界面 */
  token: string | null;
};

export function loadLocalUsername(): string {
  try {
    return localStorage.getItem(SITE_USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLocalUsername(value: string) {
  try {
    localStorage.setItem(SITE_USERNAME_KEY, value.trim());
  } catch {
    /* ignore */
  }
}

function ensureSiteAccountId(): string {
  try {
    let id = localStorage.getItem(SITE_ACCOUNT_ID_KEY);
    if (!id) {
      id = String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
      localStorage.setItem(SITE_ACCOUNT_ID_KEY, id);
    }
    return id;
  } catch {
    return '—';
  }
}

function dash(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

export async function loadDashboardAccountView(): Promise<DashboardAccountView> {
  const siteAccountId = ensureSiteAccountId();
  const username = loadLocalUsername();

  if (!extensionConfigured()) {
    throw new Error(EXT_MSG_NO_EXTENSION_ID);
  }

  let meta: Awaited<ReturnType<typeof getFbTokenMetaFromExtension>>['payload'] = null;
  let token: string | null = null;
  try {
    const metaRes = await getFbTokenMetaFromExtension();
    meta = metaRes.success ? metaRes.payload ?? null : null;

    const tokenRes = await getFbAccessTokenFromExtension();
    token = tokenRes.success ? tokenRes.payload?.token ?? null : null;
  } catch (e: unknown) {
    throw new Error(formatExtensionUserError(e));
  }

  let me: FbMeProfile | null = null;
  if (token) {
    try {
      me = await fetchFacebookMeProfile(token);
    } catch {
      me = null;
    }
  }

  let email = me?.email?.trim();
  if ((!email || !email.includes('@')) && token && me?.id) {
    try {
      email =
        (await fetchFacebookUserPrimaryEmail(token, me.id)) ??
        (await findEmailForFacebookUserInAccessibleBusinesses(token, me.id)) ??
        undefined;
    } catch {
      /* 邮箱为辅助信息，失败时保持 — */
    }
  }

  const fbLink =
    me?.link ||
    (me?.id ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(me.id)}` : '');

  return {
    username: username || me?.name || '—',
    siteAccountId,
    email: dash(email),
    facebookUserId: dash(me?.id),
    facebookName: dash(me?.name),
    facebookLink: fbLink,
    hasToken: Boolean(meta?.hasToken && token),
    token,
  };
}
