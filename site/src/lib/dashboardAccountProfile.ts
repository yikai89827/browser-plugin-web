import type { FbMeProfile } from '../../../utils/fb/graphFetchMeProfile';
import { fetchFacebookMeProfile } from '../../../utils/fb/graphFetchMeProfile';
import {
  extensionConfigured,
  getFbAccessTokenFromExtension,
  getFbTokenMetaFromExtension,
} from './extensionBridge';

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
    return {
      username: username || '—',
      siteAccountId,
      email: '—',
      facebookUserId: '—',
      facebookName: '—',
      facebookLink: '',
      hasToken: false,
      tokenPrefix: null,
      token: null,
    };
  }

  const metaRes = await getFbTokenMetaFromExtension();
  const meta = metaRes.success ? metaRes.payload : null;

  const tokenRes = await getFbAccessTokenFromExtension();
  const token = tokenRes.success ? tokenRes.payload?.token ?? null : null;

  let me: FbMeProfile | null = null;
  if (token) {
    try {
      me = await fetchFacebookMeProfile(token);
    } catch {
      me = null;
    }
  }

  const fbLink =
    me?.link ||
    (me?.id ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(me.id)}` : '');

  return {
    username: username || me?.name || '—',
    siteAccountId,
    email: dash(me?.email),
    facebookUserId: dash(me?.id),
    facebookName: dash(me?.name),
    facebookLink: fbLink,
    hasToken: Boolean(meta?.hasToken && token),
    token,
  };
}
