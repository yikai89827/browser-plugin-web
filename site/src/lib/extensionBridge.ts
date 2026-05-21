/**
 * ???????????????? externally_connectable ?????????????????
 *
 * ????? ID ?????? `site/.env.development` / `site/.env` ???? `VITE_EXTENSION_ID`??Vite ????????????????
 * ???????????????????????? ID ???????????????????????????????????????????????? .env ???????????????????
 */

import type {
  FbAdAccountRecord,
  FbAdAccountPaymentActivity,
  FbPixelCollectPayload,
  FbPixelShareRecord,
} from '../../../interfaces/fbControl';
import type { FbTokenMeta } from '../../../utils/fb/accessTokenStore';
import { fetchAdAccountPaymentActivities } from '../../../utils/fb/adAccount/graphFetchAdAccountPaymentActivities';
import {
  fetchAdAccountHiddenAdminDetails,
  fetchAdAccountManageAdminDetails,
  type AdAccountAssignedUserDetail,
} from '../../../utils/fb/adAccount/graphFetchAdAccountAssignedUsers';
import { fetchFacebookSelfUserIdsForExclude } from '../../../utils/fb/graphFetchMe';
import {
  adAccountTasksForSubId,
  executeAdAccountBatchOperation,
  renameAdAccountOnFacebook,
  verifyFacebookUserIdsForBatch,
  verifyFacebookUserIdForFriendCheck,
  fetchFriendCheckCurrentUserProfileUrl,
  parseFacebookUserIdsFromText,
  parseFacebookUserRefsWithLinesFromText,
  mapUidVerifyRowsToFriendBatchResultRows,
  mapFriendCheckRowsWithPending,
  fetchSpendCapRecordPatch,
  type AdAccountBatchResultRow,
  type SpendCapRecordPatch,
  type VerifyFacebookUserIdsForBatchResult,
  type UidGraphVerifyDetailRow,
} from '../../../utils/fb/adAccount/graphAdAccountBatchOperations';
import type { SpendCapNormalizeHints } from '../../../utils/fb/adAccount/spendCapCurrency';
import { inviteToBusinessAndPollMembership } from '../../../utils/fb/adAccount/graphBmInvitePoll';
import { assignBusinessUserToAdAccount } from '../../../utils/fb/adAccount/graphBusinessManagement';
export type {
  AdAccountBatchResultRow,
  SpendCapRecordPatch,
  VerifyFacebookUserIdsForBatchResult,
  UidGraphVerifyDetailRow,
} from '../../../utils/fb/adAccount/graphAdAccountBatchOperations';
export {
  mapUidVerifyRowsToFriendBatchResultRows,
  mapFriendCheckRowsWithPending,
  parseFacebookUserIdsFromText,
  parseFacebookUserRefsWithLinesFromText,
} from '../../../utils/fb/adAccount/graphAdAccountBatchOperations';

/** ????????????????? */
export interface FriendVerifyResultPayload {
  rows: AdAccountBatchResultRow[];
  currentUserProfileUrl: string | null;
}
import { registerGraphExternalFetch } from '../../../utils/fb/graphExternalFetch';
import { fbControlLog } from '../../../utils/fbControlLog';
import {
  resolveBusinessIdsForAccounts,
  searchBusinessUserByEmailInBusinesses,
} from '../../../utils/fb/adAccount/graphBusinessManagement';
import type { BatchDrawerSubmitPayload } from './batchOperationTypes';

export type { FbTokenMeta };

const STORAGE_KEY = 'fb_control_extension_id';

/** ?????? Vite ????????????.env?????? session */
export function getExtensionIdFromEnv(): string {
  const v = import.meta.env.VITE_EXTENSION_ID;
  return typeof v === 'string' ? v.trim() : '';
}

/** ???????????????????????????????? ID???????? Chrome ID ????????? */
export function usesExtensionIdFromEnv(): boolean {
  return getExtensionIdFromEnv().length >= 8;
}

export type ExtensionResponse<T = unknown> = {
  success: boolean;
  error?: string;
  payload?: T;
};

/** Graph `activities` ?????????????/???????? */
export type AdAccountPaymentActivitiesPayload = {
  items: FbAdAccountPaymentActivity[];
  rawCount: number;
  filteredCount: number;
  message?: string;
};

function getChrome(): typeof chrome | undefined {
  return typeof chrome !== 'undefined' ? chrome : undefined;
}

/** ?????????? chrome.runtime.sendMessage ???????? ID???? .env?? */
export function getStoredExtensionId(): string {
  return getExtensionIdFromEnv();
}

/** ???????????? ID ?????????????? session ????????????????????????????????? */
export function setStoredExtensionId(_id: string) {
  void _id;
}

/** ????? session ????????????? ID???????????? .env?? */
export function clearExtensionIdSessionOverride() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function extensionConfigured(id?: string): boolean {
  const v = (id ?? getStoredExtensionId()).trim();
  return v.length >= 8;
}

/** ???????? Comet ???????????????????????????????????? https ?????? */
function buildHttpsFacebookProfileTabUrl(ref: string, sourceLine?: string): string {
  const line = sourceLine?.trim();
  if (line && /^https:\/\//i.test(line) && /facebook\.com|fb\.com/i.test(line)) {
    return line.split('#')[0];
  }
  if (line && /^http:\/\//i.test(line) && /facebook\.com|fb\.com/i.test(line)) {
    return `https://${line.slice('http://'.length).split('#')[0]}`;
  }
  return `https://www.facebook.com/${ref.trim().replace(/^\/+/, '')}`;
}

/**
 * Graph ????????? vanity ?????????????????????? Comet format=json + /api/graphql ????????? uid???? Cookie???????????????????
 */
export async function resolveFacebookProfileNumericIdFromExtension(profileUrl: string): Promise<string | null> {
  if (!extensionConfigured()) return null;
  try {
    const res = await sendToExtension<{ numericId?: string }>({
      action: 'FB_CONTROL_RESOLVE_PROFILE_NUMERIC_ID',
      data: { profileUrl },
    });
    if (!res.success) return null;
    const id = res.payload?.numericId;
    return typeof id === 'string' && /^\d{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function verifyFriendCheckWithExtensionVanityFallback(
  token: string,
  ref: string,
  sourceLine: string | undefined
): Promise<UidGraphVerifyDetailRow> {
  const row = await verifyFacebookUserIdForFriendCheck(token, ref, sourceLine);
  if (row.ok) return row;
  if (/^\d{5,}$/.test(ref.trim())) return row;
  const tabUrl = buildHttpsFacebookProfileTabUrl(ref, sourceLine);
  const numeric = await resolveFacebookProfileNumericIdFromExtension(tabUrl);
  if (!numeric) return row;
  fbControlLog('site:bridge', 'friend-check extension profile resolve', { ref, numeric });
  const retried = await verifyFacebookUserIdForFriendCheck(token, numeric);
  return { ...retried, displayInput: row.displayInput ?? retried.displayInput };
}

export function sendToExtension<T = unknown>(message: {
  action: string;
  data?: unknown;
}): Promise<ExtensionResponse<T>> {
  const extId = getStoredExtensionId();
  const chromeApi = getChrome();
  if (!extensionConfigured(extId)) {
    return Promise.reject(
      new Error('???? site/.env.development????? .env??????? VITE_EXTENSION_ID???????????????????????')
    );
  }
  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.reject(new Error('????????????? chrome.runtime?????? Chrome ?????????????????????????????'));
  }

  fbControlLog('extension-bridge', 'sendMessage ??? ?????', { action: message.action, extIdPreview: extId.slice(0, 8) });

  return new Promise((resolve, reject) => {
    chromeApi.runtime.sendMessage(extId, message, (response: ExtensionResponse<T>) => {
      const err = chromeApi.runtime.lastError;
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      if (response && response.success === false && response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response as ExtensionResponse<T>);
    });
  });
}

export async function pingExtension() {
  return sendToExtension<{ ok?: boolean; version?: number }>({
    action: 'FB_CONTROL_PING',
  });
}

export async function fetchAccountsFromExtension() {
  return sendToExtension<{ list: FbAdAccountRecord[] }>({
    action: 'FB_CONTROL_GET_ACCOUNTS',
  });
}

/** ?????????????????????????????????? */
export async function mergeAccountInExtension(patch: Partial<FbAdAccountRecord> & { accountId: string }) {
  return sendToExtension({
    action: 'FB_CONTROL_MERGE_ACCOUNT',
    data: patch,
  });
}

/** ????????????????????? Graph ???? spend_cap ???????????????? + ????????????????????? */
export async function syncSpendCapPatchesFromGraph(
  accountIds: string[],
  hintsByAccount?: Record<string, SpendCapNormalizeHints>
): Promise<SpendCapRecordPatch[]> {
  const tokenRes = await getFbAccessTokenFromExtension();
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '??? token ??');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('?????? access_token??????????? spend_cap');
  }
  const patches: SpendCapRecordPatch[] = [];
  for (const accountId of accountIds) {
    const hints = hintsByAccount?.[accountId];
    const patch = await fetchSpendCapRecordPatch(token, accountId, hints);
    await mergeAccountInExtension(patch);
    patches.push(patch);
  }
  return patches;
}

/** ?????????????????? token ?? Graph ????????????? Facebook ?????????????? */
export async function syncPixelSharesFromGraphViaExtension(opts?: FbPixelCollectPayload & { sourceUrl?: string }) {
  return sendToExtension<{ upserted: number; total: number }>({
    action: 'FB_CONTROL_SYNC_PIXEL_SHARES_FROM_GRAPH',
    data: opts ?? {},
  });
}

export async function collectPixelSharesFromActiveFacebookTab(opts?: FbPixelCollectPayload) {
  return sendToExtension<unknown>({
    action: 'FB_CONTROL_COLLECT_PIXEL_SHARES_FROM_ACTIVE_TAB',
    data: opts ?? {},
  });
}

export async function fetchPixelSharesFromExtension() {
  return sendToExtension<{ list: FbPixelShareRecord[] }>({
    action: 'FB_CONTROL_GET_PIXEL_SHARES',
  });
}

/** ????????????????????????????????????????????? IndexedDB?? */
export async function mergePixelShareInExtension(patch: Partial<FbPixelShareRecord> & { id: string }) {
  return sendToExtension({
    action: 'FB_CONTROL_MERGE_PIXEL_SHARE',
    data: patch,
  });
}

export async function getFbTokenMetaFromExtension() {
  return sendToExtension<FbTokenMeta>({
    action: 'FB_CONTROL_GET_TOKEN_META',
  });
}

export async function syncAdAccountsFromGraphViaExtension() {
  return sendToExtension<{ upserted: number; total: number }>({
    action: 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH',
  });
}

export async function setFbAccessTokenInExtension(token: string, sourceHost?: string) {
  return sendToExtension({
    action: 'FB_CONTROL_SET_ACCESS_TOKEN',
    data: { token, sourceHost },
  });
}

export async function getFbAccessTokenFromExtension() {
  return sendToExtension<{ token: string | null }>({
    action: 'FB_CONTROL_GET_ACCESS_TOKEN',
  });
}

/**
 * ?????????????? 5 ???/??????????? activities???
 * ?????????????? `FB_CONTROL_GET_ACCESS_TOKEN` ?? token??????????????????? Graph???????????????????? action????????????????????????
 */
export async function fetchAdAccountPaymentActivitiesFromExtension(
  accountId: string
): Promise<ExtensionResponse<AdAccountPaymentActivitiesPayload>> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
  if (!tokenRes.success) {
    return { success: false, error: tokenRes.error || '??? token ??' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { success: false, error: '?????? access_token???????????????????' };
  }
  try {
    const result = await fetchAdAccountPaymentActivities(token, accountId);
    return { success: true, payload: result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export type { AdAccountAssignedUserDetail };

/**
 * ????????????? assigned_users ?????????????????????/??????????
 */
export async function fetchAdAccountAssignedUsersFromExtension(
  accountId: string,
  hintBmIds: string[] = []
): Promise<ExtensionResponse<{ count: number; items: AdAccountAssignedUserDetail[] }>> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
  if (!tokenRes.success) {
    return { success: false, error: tokenRes.error || '??? token ??' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { success: false, error: '?????? access_token?????????????????' };
  }
  try {
    const selfIds = await fetchFacebookSelfUserIdsForExclude(token);
    const items = await fetchAdAccountHiddenAdminDetails(token, accountId, {
      hintBmIds,
      excludeFacebookUserIds: selfIds,
    });
    return { success: true, payload: { count: items.length, items } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/** 1 USD = ? ?????????? Frankfurter / ER API? */
export async function fetchUsdExchangeRateFromExtension(
  currency: string
): Promise<ExtensionResponse<{ rate: number }>> {
  const ccy = currency.trim().toUpperCase();
  if (!ccy) {
    return { success: false, error: 'currency required' };
  }
  return sendToExtension<{ rate: number }>({
    action: 'FB_CONTROL_GET_USD_EXCHANGE_RATE',
    data: { currency: ccy },
  });
}

/**
 * ?????? MANAGE ???????????????????????????????????????
 */
export async function fetchAdAccountManageAdminsFromExtension(
  accountId: string,
  hintBmIds: string[] = []
): Promise<ExtensionResponse<{ items: AdAccountAssignedUserDetail[] }>> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
  if (!tokenRes.success) {
    return { success: false, error: tokenRes.error || '??? token ??' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { success: false, error: '?????? access_token?????????????????' };
  }
  try {
    const selfIds = await fetchFacebookSelfUserIdsForExclude(token);
    const items = await fetchAdAccountManageAdminDetails(token, accountId, {
      hintBmIds,
      excludeFacebookUserIds: selfIds,
    });
    return { success: true, payload: { items } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/**
 * ??????????????????????????????Graph ??? UID ????????????????????????????????????? API?????
 */
export async function verifyFacebookUidsForBatchSite(
  uidsText: string
): Promise<VerifyFacebookUserIdsForBatchResult> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, rows: [], currentUserProfileUrl: null };
  }
  if (!tokenRes.success) {
    return {
      ok: false,
      message: tokenRes.error || '??? token ??',
      rows: [],
      currentUserProfileUrl: null,
    };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return {
      ok: false,
      message: '?????? access_token?????????? UID',
      rows: [],
      currentUserProfileUrl: null,
    };
  }
  const base = await verifyFacebookUserIdsForBatch(token, uidsText);
  const pairs = parseFacebookUserRefsWithLinesFromText(uidsText);
  if (!base.rows.length || pairs.length !== base.rows.length) {
    return base;
  }
  const rows: UidGraphVerifyDetailRow[] = [];
  for (let i = 0; i < base.rows.length; i++) {
    const pair = pairs[i];
    const r = base.rows[i];
    if (r.ok || /^\d{5,}$/.test(pair.ref.trim())) {
      rows.push(r);
      continue;
    }
    rows.push(await verifyFriendCheckWithExtensionVanityFallback(token, pair.ref, pair.sourceLine));
  }
  const allOk = rows.every((r) => r.ok);
  const failCount = rows.filter((r) => !r.ok).length;
  const message = allOk
    ? `${rows.length} ?????????????????????????????????????????????????????????`
    : `?????????????????????????${failCount}/${rows.length}?????`;
  return {
    ok: allOk,
    message,
    rows,
    currentUserProfileUrl: base.currentUserProfileUrl,
  };
}

/**
 * ??????????????????????????????? `onProgress`???????????????????????????????????????????????
 */
export async function runFacebookFriendCheckSequentialFromSite(
  uidsText: string,
  onProgress: (payload: FriendVerifyResultPayload) => void
): Promise<{ ok: boolean; message: string; currentUserProfileUrl: string | null }> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, currentUserProfileUrl: null };
  }
  if (!tokenRes.success) {
    return {
      ok: false,
      message: tokenRes.error || '??? token ??',
      currentUserProfileUrl: null,
    };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return {
      ok: false,
      message: '?????? access_token?????????? UID',
      currentUserProfileUrl: null,
    };
  }

  const refPairs = parseFacebookUserRefsWithLinesFromText(uidsText);
  const currentUserProfileUrl = await fetchFriendCheckCurrentUserProfileUrl(token);

  if (!refPairs.length) {
    return {
      ok: false,
      message:
        '?????????????????????? Facebook ?????????????????????? UID???profile.php?id= ???????????? www.facebook.com/??????? ??????????',
      currentUserProfileUrl,
    };
  }

  const accumulated: UidGraphVerifyDetailRow[] = [];
  for (let i = 0; i < refPairs.length; i++) {
    const { ref, sourceLine } = refPairs[i];
    const row = await verifyFriendCheckWithExtensionVanityFallback(token, ref, sourceLine);
    accumulated.push(row);
    const pendingPairs = refPairs.slice(i + 1);
    const rows = mapFriendCheckRowsWithPending(accumulated, pendingPairs, currentUserProfileUrl);
    onProgress({ rows, currentUserProfileUrl });
  }

  const allOk = accumulated.every((r) => r.ok);
  const failCount = accumulated.filter((r) => !r.ok).length;
  const message = allOk
    ? `${refPairs.length} ?????????????????????????????????????????????????????????`
    : `?????????????????????????${failCount}/${refPairs.length}?????`;

  return { ok: allOk, message, currentUserProfileUrl };
}

/**
 * ????????????? Ads Manager Graph?????????????????????????????????
 */
export async function renameAdAccountFromSite(accountId: string, newName: string): Promise<void> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '??? token ??');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('?????? access_token??????????????');
  }
  fbControlLog('extension-bridge', 'renameAdAccountFromSite', { accountIdPreview: String(accountId).slice(0, 12) });
  await renameAdAccountOnFacebook(token, accountId, newName);
}

/**
 * ??????????????????????? token ??????????????????? Graph ???????????? / ???? / ??? BM ???????
 */
export type PushRecipientSearchResult = {
  found: boolean;
  email: string;
  recipientUserId?: string;
  displayName?: string;
  businessId?: string;
  message?: string;
};

/** ???????????????? BM business_users ???????????????????? */
export async function searchPushRecipientByEmailFromSite(
  email: string,
  accountIds: string[],
  hintBmIds: string[] = []
): Promise<PushRecipientSearchResult> {
  const normalized = email.trim();
  if (!normalized) {
    return { found: false, email: normalized, message: '???????????????????' };
  }
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
  if (!tokenRes.success || !tokenRes.payload?.token) {
    throw new Error(tokenRes.error || '?????? access_token');
  }
  const token = tokenRes.payload.token;
  const businessIds = await resolveBusinessIdsForAccounts(token, accountIds, hintBmIds);
  if (!businessIds.length) {
    return {
      found: false,
      email: normalized,
      message: '???????? Business Manager????????????????????????????????????',
    };
  }
  const hit = await searchBusinessUserByEmailInBusinesses(token, businessIds, normalized);
  if (hit) {
    return {
      found: true,
      email: hit.email,
      recipientUserId: hit.businessUserId,
      displayName: hit.name ?? hit.email,
      businessId: hit.businessId,
    };
  }
  return {
    found: false,
    email: normalized,
    message: '???????????????????? BM ????????????????????????????? BM ????',
  };
}

export async function executeAdAccountBatchFromSite(
  payload: BatchDrawerSubmitPayload
): Promise<AdAccountBatchResultRow[]> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
  if (!tokenRes.success) {
    throw new Error(tokenRes.error || '??? token ??');
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    throw new Error('?????? access_token???????????????????????');
  }
  fbControlLog('extension-bridge', 'executeAdAccountBatchFromSite', {
    operationId: payload.operationId,
    accounts: payload.selectedAccountIds.length,
  });
  return executeAdAccountBatchOperation(token, payload, {
    resolveProfileNumericId: resolveFacebookProfileNumericIdFromExtension,
  });
}

/**
 * ????? Graph ????????? background ????????? graph.facebook.com / adsmanager-graph ??? CORS???
 * ??? `main.ts` ?????????????????????????
 */
/**
 * ???????????????????? BM??subcode 1752100????????? BM ???? ??? ?????????????? 5 ? ??? ??????????? BM ????????????????????
 */
export async function runBmInvitePollAndGrantFromSite(params: {
  accountId: string;
  email: string;
  bmHintIds?: string[];
  subId?: string;
  onProgress?: (message: string) => void;
  shouldAbort?: () => boolean;
}): Promise<{ ok: boolean; status: string; detail: string }> {
  let tokenRes: ExtensionResponse<{ token: string | null }>;
  try {
    tokenRes = await getFbAccessTokenFromExtension();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: '??', detail: msg };
  }
  if (!tokenRes.success) {
    return { ok: false, status: '??', detail: tokenRes.error || '??? token ??' };
  }
  const token = tokenRes.payload?.token;
  if (!token) {
    return { ok: false, status: '??', detail: '?????? access_token' };
  }

  const businessIds = await resolveBusinessIdsForAccounts(
    token,
    [params.accountId],
    params.bmHintIds ?? []
  );
  if (!businessIds.length) {
    return {
      ok: false,
      status: '??',
      detail: '????????????????????? Business Manager???????????????????????????? BM',
    };
  }
  const businessId = businessIds[0];
  const tasks = adAccountTasksForSubId(params.subId);

  const poll = await inviteToBusinessAndPollMembership(token, businessId, params.email, {
    maxAttempts: 5,
    intervalMs: 60_000,
    shouldAbort: params.shouldAbort,
    onProgress: (p) => {
      params.onProgress?.(p.message);
    },
  });

  if (!poll.joined || !poll.businessUser) {
    return { ok: false, status: '??', detail: poll.message };
  }

  params.onProgress?.('??????????? BM??????????????????????????????????');
  try {
    await assignBusinessUserToAdAccount(
      token,
      params.accountId,
      poll.businessUser.businessUserId,
      tasks
    );
    const label = poll.businessUser.name
      ? `${poll.businessUser.name} (${poll.businessUser.email})`
      : poll.businessUser.email;
    return {
      ok: true,
      status: '??????',
      detail: `${poll.message}??????????${label}??${tasks.join(', ')}??`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: '??',
      detail: `${poll.message}???????? BM ????????????${msg}`,
    };
  }
}

export function installGraphFetchViaExtensionProxy(): void {
  registerGraphExternalFetch(async (url, init = {}) => {
    const allowed =
      url.startsWith('https://graph.facebook.com/') ||
      url.startsWith('https://adsmanager-graph.facebook.com/');
    if (!allowed) {
      return fetch(url, init);
    }
    const chromeApi = getChrome();
    if (!extensionConfigured() || !chromeApi?.runtime?.sendMessage) {
      return fetch(url, init);
    }

    const method = (init.method || 'GET').toUpperCase();
    const hdrs: Record<string, string> = {};
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
    } else if (init.headers && typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        if (typeof v === 'string') hdrs[k] = v;
      }
    }

    let bodyStr: string | undefined;
    const b = init.body;
    if (b != null && method !== 'GET' && method !== 'HEAD') {
      if (typeof b === 'string') {
        bodyStr = b;
      } else if (b instanceof URLSearchParams) {
        bodyStr = b.toString();
        if (!hdrs['Content-Type'] && !hdrs['content-type']) {
          hdrs['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        }
      } else if (b instanceof Blob) {
        bodyStr = await b.text();
      } else {
        bodyStr = String(b);
      }
    }

    const proxyUnknownAction = (msg: string) =>
      /Unknown action:\s*FB_CONTROL_PROXY_FETCH/i.test(msg) || /\bFB_CONTROL_PROXY_FETCH\b/.test(msg);

    let resWrap: ExtensionResponse<{ status: number; bodyText: string; ok: boolean }>;
    try {
      resWrap = await sendToExtension<{ status: number; bodyText: string; ok: boolean }>({
        action: 'FB_CONTROL_PROXY_FETCH',
        data: {
          url,
          method,
          ...(Object.keys(hdrs).length ? { headers: hdrs } : {}),
          ...(bodyStr != null && bodyStr !== '' ? { body: bodyStr } : {}),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (proxyUnknownAction(msg)) {
        fbControlLog(
          'extension-bridge',
          '????????????????? FB_CONTROL_PROXY_FETCH?????????????? wxt build ?????????????????????????????????????? fetch',
          {}
        );
        return fetch(url, init);
      }
      throw e instanceof Error ? e : new Error(msg);
    }

    if (!resWrap.success || resWrap.payload == null) {
      const err = resWrap.error || '????? Graph ?????';
      if (proxyUnknownAction(err)) {
        fbControlLog(
          'extension-bridge',
          '????????????????? FB_CONTROL_PROXY_FETCH?????????????? wxt build ?????????????????????????????????????? fetch',
          {}
        );
        return fetch(url, init);
      }
      throw new Error(err);
    }
    const { status, bodyText } = resWrap.payload;
    return new Response(bodyText, {
      status,
      statusText: String(status),
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    });
  });
}

export async function clearFbAccessTokenInExtension() {
  return sendToExtension({
    action: 'FB_CONTROL_CLEAR_ACCESS_TOKEN',
  });
}
