<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import type {
  BatchAccountPreviewRow,
  BatchAuthorizedUser,
  BatchDrawerPreset,
  BatchDrawerSubmitPayload,
  BatchOperationId,
  UpdateBusinessFormPayload,
} from '../lib/batchOperationTypes';
import { getBatchOperationUi } from '../lib/batchOperationPresets';
import {
  isNotBusinessScopedUserError,
  parseBatchResultDetail,
  type BatchResultDetailSegment,
} from '../lib/batchResultDetailView';
import { runBmInvitePollAndGrantFromSite } from '../lib/extensionBridge';
import {
  DEFAULT_UPDATE_BUSINESS_BM,
  UPDATE_BUSINESS_COUNTRIES,
  UPDATE_BUSINESS_CURRENCIES,
  UPDATE_BUSINESS_TIMEZONES,
} from '../lib/updateBusinessOptions';
import { effectiveUsdToAccountRate } from '../../../utils/fb/adsPanel/currencyExchange';
import {
  currencyOffset,
  resolveSpendCapMinorForRecord,
} from '../../../utils/fb/adAccount/spendCapCurrency';
import { formatMajorAmount, formatMinorAmount } from '../../../utils/fb/adAccount/moneyDisplay';

import {
  runFacebookFriendCheckSequentialFromSite,
  searchPushRecipientByEmailFromSite,
  type FriendVerifyResultPayload,
} from '../lib/extensionBridge';

const props = defineProps<{
  open: boolean;
  preset: BatchDrawerPreset | null;
  selectedAccountIds: string[];
  /** 当前勾选行摘要（设置限额抽屉展示额度等） */
  selectedAccountRows?: BatchAccountPreviewRow[];
  /** 父组件在 Graph 批量执行完成后写入，用于「结果」页 */
  batchResults?: {
    accountId: string;
    status: string;
    detail: string;
    accountName?: string;
    resultKind?: string;
    displayInput?: string;
    currentFbProfileUrl?: string | null;
    friendCheckPending?: boolean;
  }[];
  batchRunning?: boolean;
  /** 最近一次好友预检得到的当前 Facebook 主页（批量结果卡「当前账号」兜底） */
  currentFbProfileUrl?: string | null;
  /** 1 USD = ? 币种（主站预取，用于限额预览与执行一致） */
  fxUsdToAccount?: Record<string, number>;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: BatchDrawerSubmitPayload];
  friendVerifyResult: [payload: FriendVerifyResultPayload];
  batchResultsUpdate: [
    rows: {
      accountId: string;
      status: string;
      detail: string;
      accountName?: string;
      resultKind?: string;
      displayInput?: string;
      currentFbProfileUrl?: string | null;
      friendCheckPending?: boolean;
    }[],
  ];
}>();

const limitOpKind = ref<'increase' | 'decrease'>('increase');
/** 步骤 2「增加额度」金额，独立输入 */
const increaseUsdStr = ref('');
/** 步骤 2「减少额度」金额，独立输入 */
const decreaseUsdStr = ref('');
const resetMode = ref<'account_zero' | 'delete_restriction' | 'set_absolute'>('account_zero');
const resetAbsoluteUsd = ref('');

const isLimitSpecial = computed(() => props.preset?.entryKey === 'setLimit');
const isResetSpecial = computed(() => props.preset?.entryKey === 'resetLimit');
/** 填写 BM ID + 子下拉（添加到 BM / BM 合作伙伴） */
const isBmIdDrawerSpecial = computed(() => {
  const k = props.preset?.entryKey;
  return k === 'addBm' || k === 'bmPartner';
});
const isAccountRenameSpecial = computed(() => props.preset?.entryKey === 'accountRename');
const isAccountPushSpecial = computed(() => props.preset?.entryKey === 'accountPush');
const isUpdateBusinessSpecial = computed(() => props.preset?.entryKey === 'updateCompany');
/** 删除授权专用布局：顶栏双下拉 + UID 步骤（无子权限/好友检测） */
const isRemoveAuthSpecial = computed(() => {
  const p = props.preset;
  if (!p) return false;
  if (p.entryKey === 'removeAuth') return true;
  const ops = p.operations ?? [];
  return (
    ops.length > 0 &&
    ops.every((o) => typeof o.id === 'string' && o.id.startsWith('remove_perm_')) &&
    !(p.subOptions?.length ?? 0)
  );
});

/** 步骤 2：删除当前 Facebook 账号的权限？（默认不勾选） */
const deleteCurrentFbPerm = ref(false);

const modifyCurrency = ref(false);
const modifyBmInfo = ref(false);
const modifyTimezone = ref(false);
const updateCurrency = ref('USD');
const updateCountry = ref(DEFAULT_UPDATE_BUSINESS_BM.countryCode);
const updateCompanyName = ref(DEFAULT_UPDATE_BUSINESS_BM.companyName);
const updateCity = ref(DEFAULT_UPDATE_BUSINESS_BM.city);
const updateStreet1 = ref(DEFAULT_UPDATE_BUSINESS_BM.street1);
const updateStreet2 = ref(DEFAULT_UPDATE_BUSINESS_BM.street2);
const updateState = ref(DEFAULT_UPDATE_BUSINESS_BM.state);
const updateZip = ref(DEFAULT_UPDATE_BUSINESS_BM.zip);
const updateTaxId = ref(DEFAULT_UPDATE_BUSINESS_BM.taxId);
const updateAdsForBusiness = ref(DEFAULT_UPDATE_BUSINESS_BM.adsForBusinessPurpose);
const updateTimezone = ref('America/Phoenix');

const pushRecipientEmail = ref('');
const pushSearchRunning = ref(false);
const pushSearchDone = ref(false);
const pushSearchMsg = ref('');
const pushSearchMsgIsError = ref(false);

type PushRecipientCard = {
  key: string;
  email: string;
  displayName: string;
  userId: string;
  businessId?: string;
  checked: boolean;
};

const pushRecipientCards = ref<PushRecipientCard[]>([]);

function pushRecipientCardKey(userId: string, businessId?: string): string {
  return `${userId}:${businessId ?? ''}`;
}

const pushSelectedCount = computed(
  () => pushRecipientCards.value.filter((c) => c.checked).length
);

const pushAllChecked = computed({
  get: () =>
    pushRecipientCards.value.length > 0 &&
    pushRecipientCards.value.every((c) => c.checked),
  set: (on: boolean) => {
    for (const c of pushRecipientCards.value) {
      c.checked = on;
    }
  },
});

function selectAllPushRecipients(): void {
  pushAllChecked.value = true;
}

function selectNonePushRecipients(): void {
  pushAllChecked.value = false;
}

const selectedAccountCount = computed(() => props.selectedAccountIds.length);

/** 顶部提示：随搜索/勾选状态更新（与下方列表同步） */
const pushRecipientStatusText = computed(() => {
  if (pushSearchRunning.value) return '正在搜索接收者…';
  if (!pushSearchDone.value) {
    return pushRecipientEmail.value.trim()
      ? '已输入邮箱，请点击「搜索」'
      : '请先搜索接收者邮箱';
  }
  const total = pushRecipientCards.value.length;
  const sel = pushSelectedCount.value;
  if (total === 0) return '未找到可推送的接收者（0 人）';
  if (sel === 0) return `找到 ${total} 人，请勾选要推送的接收者`;
  if (sel === total) return `已勾选 ${sel} 位接收者`;
  return `已勾选 ${sel} / ${total} 位接收者`;
});

const primaryPreviewAccount = computed(() => (props.selectedAccountRows && props.selectedAccountRows[0]) || null);

function formatPreviewAccountLabel(row: BatchAccountPreviewRow | null): string {
  if (!row?.accountId) return '—';
  const name = (row.name || '').trim();
  return name ? `${name}（${row.accountId}）` : row.accountId;
}

function buildAccountNamesMap(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const row of props.selectedAccountRows ?? []) {
    if (row.accountId && row.name?.trim()) names[row.accountId] = row.name.trim();
  }
  return names;
}

function accountCcy(row: BatchAccountPreviewRow | null | undefined): string {
  return (row?.currency || 'USD').trim().toUpperCase() || 'USD';
}

function fxRateForPreview(ccy: string): number | null {
  const c = ccy.trim().toUpperCase();
  if (c === 'USD') return 1;
  const r = props.fxUsdToAccount?.[c];
  if (r == null || !Number.isFinite(r) || r <= 0) return null;
  return effectiveUsdToAccountRate(r) ?? r;
}

/** 与后台 set_limit 一致：USD 美分 → 账户最小单位 */
function usdMinorToAccountMinorPreview(usdMinor: number, currency: string): number | null {
  const ccy = currency.trim().toUpperCase();
  const usd = Math.max(0, Math.round(usdMinor));
  if (ccy === 'USD') return usd;
  const rate = fxRateForPreview(ccy);
  if (rate == null) return null;
  const majorAcct = (usd / 100) * rate;
  return Math.round(majorAcct * currencyOffset(ccy));
}

function formatCapMoney(minor: number, row: BatchAccountPreviewRow | null): string {
  const ccy = accountCcy(row);
  const primary = formatMinorAmount(minor, ccy);
  if (ccy === 'USD') return primary;
  const rate = fxRateForPreview(ccy);
  if (rate == null) return primary;
  const usdMajor = minor / currencyOffset(ccy) / rate;
  return `${primary}（约 ${formatMajorAmount(usdMajor, 'USD')}）`;
}

function displaySpendingCap(row: BatchAccountPreviewRow | null): string {
  if (!row) return '—';
  const minor = resolveSpendCapMinorForRecord(row);
  if (minor === 0) return '不限额';
  if (minor != null && minor > 0) return formatCapMoney(minor, row);
  return '—';
}

function resolvePreviewSpendCapMinor(row: BatchAccountPreviewRow | null | undefined): number | null | undefined {
  if (!row) return undefined;
  return resolveSpendCapMinorForRecord(row);
}

function displayBalance(row: BatchAccountPreviewRow | null): string {
  if (!row) return '—';
  if (row.balanceMinor != null && Number.isFinite(row.balanceMinor)) {
    return formatCapMoney(row.balanceMinor, row);
  }
  if (row.balance && String(row.balance).trim()) return String(row.balance);
  return '—';
}

/** 正金额：增加/减少额度输入 */
function parseUsdInputToMinor(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** 设为限额时允许 0 */
function parseUsdToMinorAllowZero(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** 当前选中的「增加/减少」对应的金额文案 */
function activeLimitAmountStr(): string {
  return limitOpKind.value === 'increase' ? increaseUsdStr.value : decreaseUsdStr.value;
}

const limitPreviewText = computed(() => {
  const row = primaryPreviewAccount.value;
  const n = props.selectedAccountIds.length;
  const base = row
    ? `账号: ${formatPreviewAccountLabel(row)}\n当前花费限额: ${displaySpendingCap(row)}\n剩余额度: ${displayBalance(row)}`
    : `已选 ${n} 个账户` + (n ? `（首条 ID: ${props.selectedAccountIds[0]}）` : '');
  const m = parseUsdInputToMinor(activeLimitAmountStr());
  if (m == null) {
    return `${base}\n请在「操作类型」中填写金额后查看效果说明。`;
  }
  const deltaUsd = (m / 100).toFixed(2);
  const ccy = accountCcy(row);
  const deltaAcctMinor = usdMinorToAccountMinorPreview(m, ccy);
  if (deltaAcctMinor == null && ccy !== 'USD') {
    return `${base}\n将按约 ${deltaUsd} USD 调整限额（执行时由扩展拉取 ${ccy} 汇率后换算，与 Meta 一致）。`;
  }
  const curMinor = resolvePreviewSpendCapMinor(row);
  const verb = limitOpKind.value === 'increase' ? '增加' : '减少';
  const deltaLabel =
    deltaAcctMinor != null ? formatCapMoney(deltaAcctMinor, row) : `${deltaUsd} USD`;
  if (curMinor != null && curMinor > 0 && deltaAcctMinor != null) {
    const afterMinor =
      limitOpKind.value === 'increase'
        ? curMinor + deltaAcctMinor
        : Math.max(0, curMinor - deltaAcctMinor);
    const curLabel = formatCapMoney(curMinor, row);
    const afterLabel = formatCapMoney(afterMinor, row);
    return `${base}\n预计：${curLabel} ${verb} ${deltaLabel} → ${afterLabel}`;
  }
  if (limitOpKind.value === 'increase') {
    const afterLabel =
      deltaAcctMinor != null ? formatCapMoney(deltaAcctMinor, row) : `${deltaUsd} USD`;
    return `${base}\n当前为不限额，将设新上限约 ${afterLabel}（输入 ${deltaUsd} USD）。`;
  }
  return `${base}\n当前为不限额时无法减少额度。`;
});

const limitConfirmOk = computed(() => {
  if (!isLimitSpecial.value) return true;
  return parseUsdInputToMinor(activeLimitAmountStr()) != null;
});

const resetConfirmOk = computed(() => {
  if (!isResetSpecial.value) return true;
  if (resetMode.value === 'set_absolute') {
    return parseUsdToMinorAllowZero(resetAbsoluteUsd.value) != null;
  }
  return true;
});

const otherAccountsForTransfer = computed(() => {
  const rows = props.selectedAccountRows ?? [];
  const first = rows[0]?.accountId;
  return rows.filter((r) => r.accountId && r.accountId !== first);
});

const drawerTab = ref<'op' | 'result'>('op');
const selectedOpId = ref<BatchOperationId>('add_ad_permissions');
const selectedSubId = ref('');
const uidsText = ref('');
const useDefaultInterval = ref(true);
const friendCheckStatus = ref<'idle' | 'running' | 'ok' | 'err'>('idle');
const friendCheckMsg = ref('');
const friendVerifyRunning = ref(false);
/** 好友预检通过的用户快照（授权用，不随 Graph 结果覆盖而丢失） */
const friendAuthorizeSnapshot = ref<BatchAuthorizedUser[]>([]);

const resultRows = computed(() => props.batchResults ?? []);

/** 结果页已展示 Graph 批量结果（非仅好友预检卡） */
const hasGraphBatchResults = computed(() =>
  resultRows.value.some((r) => r.resultKind !== 'friend_uid')
);

watch(
  () => [props.open, props.batchResults?.length, props.batchRunning] as const,
  ([isOpen, n, running]) => {
    if (isOpen && n && n > 0 && !running) {
      drawerTab.value = 'result';
    }
  }
);

const ui = computed(() => getBatchOperationUi(selectedOpId.value));

const showSubDropdown = computed(
  () => !!(props.preset?.subOptions?.length && ui.value.showSubDropdown)
);

const step2Visible = computed(() => !!ui.value.step2);
const step3Visible = computed(() => !!ui.value.step3);

const updateBusinessConfirmOk = computed(() => {
  if (!isUpdateBusinessSpecial.value) return true;
  if (!modifyCurrency.value && !modifyBmInfo.value && !modifyTimezone.value) return false;
  if (modifyBmInfo.value) {
    if (!updateCompanyName.value.trim() || !updateCity.value.trim() || !updateStreet1.value.trim()) {
      return false;
    }
  }
  return true;
});

const inputGateOk = computed(() => {
  if (isLimitSpecial.value || isResetSpecial.value) return true;
  if (isUpdateBusinessSpecial.value) return updateBusinessConfirmOk.value;
  if (isBmIdDrawerSpecial.value) {
    if (!props.preset?.step1.required) return true;
    return uidsText.value.trim().length > 0;
  }
  if (isAccountRenameSpecial.value) {
    return uidsText.value.trim().length > 0;
  }
  if (isAccountPushSpecial.value) {
    return pushSelectedCount.value > 0;
  }
  if (isRemoveAuthSpecial.value) {
    if (!ui.value.step1.required) return true;
    return uidsText.value.trim().length > 0;
  }
  if (!ui.value.step1.required) return true;
  return uidsText.value.trim().length > 0;
});

const isFriendGate = computed(() => ui.value.confirmGates.includes('friend'));

/** 当前结果列表中的好友预检卡片（不含 Graph 批量执行后的广告账户结果） */
const friendRows = computed(() =>
  (props.batchResults ?? []).filter((r) => r.resultKind === 'friend_uid')
);

const friendFinishedRows = computed(() => friendRows.value.filter((r) => !r.friendCheckPending));

const friendCheckCompleted = computed(
  () =>
    isFriendGate.value &&
    friendFinishedRows.value.length > 0 &&
    friendFinishedRows.value.length === friendRows.value.length
);

const friendHasSuccess = computed(() => friendFinishedRows.value.some((r) => r.status === '成功'));

const friendHasFailure = computed(() => friendFinishedRows.value.some((r) => r.status !== '成功'));

const friendAllFailed = computed(
  () =>
    friendCheckCompleted.value &&
    friendFinishedRows.value.length > 0 &&
    !friendHasSuccess.value
);

/** 检测未完成即失败（如 Failed to fetch、未产出结果卡） */
const friendCheckIncompleteError = computed(
  () =>
    isFriendGate.value &&
    friendCheckStatus.value === 'err' &&
    !friendVerifyRunning.value &&
    !friendCheckCompleted.value
);

/** 底部主按钮：执行 / 重新执行好友检测 */
const friendRunAction = computed(() => {
  if (!isFriendGate.value || friendVerifyRunning.value) return false;
  if (friendCheckIncompleteError.value) return true;
  if (friendCheckStatus.value === 'idle') return true;
  if (drawerTab.value === 'result' && friendAllFailed.value) return true;
  if (drawerTab.value === 'op' && friendHasFailure.value && friendCheckCompleted.value) return true;
  return false;
});

/** 底部主按钮：提交 Graph（仅对已通过好友检测的 UID 授权） */
const friendAuthorizeAction = computed(() => {
  if (!isFriendGate.value || friendRunAction.value || friendVerifyRunning.value) return false;
  if (friendCheckStatus.value === 'idle') return false;
  return friendAuthorizeSnapshot.value.length > 0;
});

function syncFriendAuthorizeSnapshotFromResults() {
  const rows = (props.batchResults ?? []).filter(
    (r) => r.resultKind === 'friend_uid' && !r.friendCheckPending && r.status === '成功'
  );
  if (!rows.length) return;
  friendAuthorizeSnapshot.value = rows.map((r) => ({
    uid: String(r.accountId ?? '').trim(),
    displayInput: (r.displayInput ?? r.accountId ?? '').trim(),
    sourceLine: (r.displayInput ?? r.accountId ?? '').trim(),
  }));
}

watch(
  () => props.batchResults,
  () => syncFriendAuthorizeSnapshotFromResults(),
  { deep: true }
);

/** 「重新检测好友关系」时使用红色主按钮（首次「检测好友关系」仍为蓝色） */
const footPrimaryDanger = computed(
  () => isFriendGate.value && friendRunAction.value && friendCheckStatus.value !== 'idle'
);

const confirmDisabled = computed(() => {
  if (!props.preset || !props.selectedAccountIds.length) return true;
  if (props.batchRunning) return true;
  if (friendVerifyRunning.value) return true;
  if (pushSearchRunning.value) return true;
  if (!limitConfirmOk.value) return true;
  if (!resetConfirmOk.value) return true;
  if (!updateBusinessConfirmOk.value) return true;

  if (isFriendGate.value) {
    if (friendRunAction.value) {
      return !uidsText.value.trim();
    }
    if (friendCheckStatus.value !== 'idle') {
      return friendAuthorizeSnapshot.value.length === 0;
    }
    return !uidsText.value.trim();
  }

  if (!inputGateOk.value) return true;
  return false;
});

const footPrimaryLabel = computed(() => {
  if (props.batchRunning) return '执行中…';
  if (friendVerifyRunning.value) return '检测中…';
  if (isAccountPushSpecial.value) return '确认推送';
  if (!isFriendGate.value) return '确定';
  if (friendRunAction.value) {
    return friendCheckStatus.value === 'idle' ? '检测好友关系' : '重新检测好友关系';
  }
  if (friendAuthorizeAction.value) return '确定';
  return '确定';
});

/** 结果页批量已结束：隐藏底部「确定」，避免重复执行（仍可用右上角关闭） */
const showFootExecuteButton = computed(() => {
  if (drawerTab.value !== 'result') return true;
  if (props.batchRunning || friendVerifyRunning.value) return true;
  if (!resultRows.value.length) return true;
  /** 授权/增权等：好友预检通过后已执行 Graph，单户或多户均不再显示底部确定 */
  if (hasGraphBatchResults.value) return false;
  if (isFriendGate.value && (friendRunAction.value || friendAuthorizeAction.value)) return true;
  return false;
});

/** 说明文案中不展示中括号及其中的内容（【】、半角 []、全角［］） */
function stripSquareBracketAnnotations(raw: string): string {
  return raw
    .replace(/【[^】]*】/g, '')
    .replace(/［[^］]*］/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function displayStepLabel(raw: string | undefined): string {
  if (!raw) return '';
  return stripSquareBracketAnnotations(raw);
}

function resultTargetFieldLabel(r: { resultKind?: string; displayInput?: string }): string {
  if (r.resultKind === 'friend_uid') return '检测账号';
  if (r.displayInput) return '授权账号';
  return '广告账户 ID';
}

function resultTargetDisplay(r: {
  resultKind?: string;
  accountId: string;
  displayInput?: string;
}): string {
  if (r.resultKind === 'friend_uid' || r.displayInput) {
    return (r.displayInput ?? r.accountId).trim() || '—';
  }
  return r.accountId;
}

function showAdAccountIdRow(r: { resultKind?: string; displayInput?: string }): boolean {
  return !!r.displayInput && r.resultKind !== 'friend_uid';
}

function currentFbDisplay(r: {
  accountId?: string;
  accountName?: string;
  currentFbProfileUrl?: string | null;
  resultKind?: string;
}): string {
  if (r.resultKind === 'friend_uid') {
    const u = (r.currentFbProfileUrl ?? props.currentFbProfileUrl ?? '').trim();
    return u || '—';
  }
  const name = (r.accountName ?? '').trim();
  const id = (r.accountId ?? '').trim();
  if (name && id) return `${name}（${id}）`;
  if (name) return name;
  const row = props.selectedAccountRows?.find((x) => x.accountId === r.accountId);
  if (row) return formatPreviewAccountLabel(row);
  if (r.accountId) return r.accountId;
  return '—';
}

function resultDetailView(detail: string) {
  return parseBatchResultDetail(detail);
}

type BmInviteSlot = {
  email: string;
  statusText: string;
  running: boolean;
};

const bmInviteSlots = ref<Record<string, BmInviteSlot>>({});
const bmInviteAbortFlags = ref<Record<string, boolean>>({});

function bmInviteKey(accountId: string, segmentLabel: string) {
  return `${accountId}::${segmentLabel || '_'}`;
}

function getBmInviteSlot(key: string): BmInviteSlot {
  if (!bmInviteSlots.value[key]) {
    bmInviteSlots.value[key] = { email: '', statusText: '', running: false };
  }
  return bmInviteSlots.value[key];
}

function showBmInviteForSegment(seg: BatchResultDetailSegment): boolean {
  return selectedOpId.value === 'add_ad_permissions' && isNotBusinessScopedUserError(seg.message);
}

function applyBmInviteResultToRow(
  row: { accountId: string; status: string; detail: string; displayInput?: string },
  segmentLabel: string,
  res: { ok: boolean; status: string; detail: string }
) {
  const rows = [...(props.batchResults ?? [])];
  const idx = rows.findIndex((x) => x.accountId === row.accountId);
  if (idx < 0) return;

  const view = parseBatchResultDetail(rows[idx].detail);
  if (res.ok) {
    const remaining = view.segments.filter((s) => s.label !== segmentLabel);
    if (!remaining.length) {
      rows[idx] = { ...rows[idx], status: res.status, detail: res.detail };
    } else {
      const parts = [
        `${segmentLabel}: ${res.detail}`,
        ...remaining.map((s) => `${s.label}: ${s.message}`),
      ];
      rows[idx] = {
        ...rows[idx],
        status: '部分成功',
        detail: view.summary ? `${view.summary}。${parts.join('；')}` : parts.join('；'),
      };
    }
  } else {
    const parts = view.segments.map((s) =>
      s.label === segmentLabel ? `${s.label}: ${res.detail}` : `${s.label}: ${s.message}`
    );
    rows[idx] = {
      ...rows[idx],
      detail: view.summary ? `${view.summary}。${parts.join('；')}` : parts.join('；'),
    };
  }
  emit('batchResultsUpdate', rows);
}

async function startBmInvite(
  row: { accountId: string; status: string; detail: string; displayInput?: string },
  seg: BatchResultDetailSegment
) {
  const key = bmInviteKey(row.accountId, seg.label);
  const slot = getBmInviteSlot(key);
  const email = slot.email.trim();
  if (!email) {
    slot.statusText = '请先填写对方 Facebook 账号绑定的邮箱';
    return;
  }
  bmInviteAbortFlags.value[key] = false;
  slot.running = true;
  slot.statusText = '正在发送 BM 邀请…';
  try {
    const res = await runBmInvitePollAndGrantFromSite({
      accountId: row.accountId,
      email,
      bmHintIds: accountBmHintIds(),
      subId: selectedSubId.value,
      onProgress: (message) => {
        slot.statusText = message;
      },
      shouldAbort: () => bmInviteAbortFlags.value[key] === true,
    });
    applyBmInviteResultToRow(row, seg.label, res);
    slot.statusText = res.detail;
  } catch (e: unknown) {
    slot.statusText = e instanceof Error ? e.message : String(e);
  } finally {
    slot.running = false;
  }
}

function resetForm() {
  const p = props.preset;
  if (!p) return;
  selectedOpId.value = p.defaultOperationId;
  selectedSubId.value = p.defaultSubId ?? (p.subOptions?.[0]?.id ?? '');
  uidsText.value = '';
  useDefaultInterval.value =
    p.step3?.defaultChecked ?? getBatchOperationUi(p.defaultOperationId).step3?.defaultChecked ?? true;
  friendCheckStatus.value = 'idle';
  friendCheckMsg.value = '';
  friendVerifyRunning.value = false;
  friendAuthorizeSnapshot.value = [];
  drawerTab.value = 'op';
  limitOpKind.value = 'increase';
  increaseUsdStr.value = '';
  decreaseUsdStr.value = '';
  resetMode.value = 'account_zero';
  resetAbsoluteUsd.value = '';
  deleteCurrentFbPerm.value = false;
  modifyCurrency.value = false;
  modifyBmInfo.value = false;
  modifyTimezone.value = false;
  const rowCur = (props.selectedAccountRows?.[0]?.currency || 'USD').trim().toUpperCase();
  updateCurrency.value =
    UPDATE_BUSINESS_CURRENCIES.some((c) => c.code === rowCur) ? rowCur : 'USD';
  updateCountry.value = DEFAULT_UPDATE_BUSINESS_BM.countryCode;
  updateCompanyName.value = DEFAULT_UPDATE_BUSINESS_BM.companyName;
  updateCity.value = DEFAULT_UPDATE_BUSINESS_BM.city;
  updateStreet1.value = DEFAULT_UPDATE_BUSINESS_BM.street1;
  updateStreet2.value = DEFAULT_UPDATE_BUSINESS_BM.street2;
  updateState.value = DEFAULT_UPDATE_BUSINESS_BM.state;
  updateZip.value = DEFAULT_UPDATE_BUSINESS_BM.zip;
  updateTaxId.value = DEFAULT_UPDATE_BUSINESS_BM.taxId;
  updateAdsForBusiness.value = DEFAULT_UPDATE_BUSINESS_BM.adsForBusinessPurpose;
  const rowTz = (props.selectedAccountRows?.[0]?.timezone || '').trim();
  updateTimezone.value =
    UPDATE_BUSINESS_TIMEZONES.some((t) => t.id === rowTz) ? rowTz : 'America/Phoenix';
  pushRecipientEmail.value = '';
  pushRecipientCards.value = [];
  pushSearchDone.value = false;
  pushSearchRunning.value = false;
  pushSearchMsg.value = '';
  pushSearchMsgIsError.value = false;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function accountBmHintIds(): string[] {
  const rows = props.selectedAccountRows ?? [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = (r.belongsToBmId ?? '').trim();
    if (id && /^\d{5,}$/.test(id)) seen.add(id);
  }
  return [...seen];
}

async function onPushSearchUser() {
  const email = pushRecipientEmail.value.trim();
  pushSearchMsg.value = '';
  pushSearchMsgIsError.value = false;
  pushRecipientCards.value = [];
  pushSearchDone.value = false;
  if (!email) {
    pushSearchMsg.value = '请输入接收者邮箱';
    pushSearchMsgIsError.value = true;
    return;
  }
  if (!isValidEmail(email)) {
    pushSearchMsg.value = '邮箱格式不正确';
    pushSearchMsgIsError.value = true;
    return;
  }
  pushSearchRunning.value = true;
  try {
    const res = await searchPushRecipientByEmailFromSite(
      email,
      [...props.selectedAccountIds],
      accountBmHintIds()
    );
    pushSearchDone.value = true;
    if (res.recipients?.length) {
      pushRecipientCards.value = res.recipients.map((r) => ({
        key: pushRecipientCardKey(r.recipientUserId, r.businessId),
        email: r.email,
        displayName: r.displayName || r.email,
        userId: r.recipientUserId,
        businessId: r.businessId,
        checked: true,
      }));
      pushSearchMsg.value = res.message ?? `找到 ${res.recipients.length} 个用户`;
      pushSearchMsgIsError.value = false;
    } else {
      pushSearchMsg.value = res.message ?? '未找到该邮箱对应的 BM 用户';
      pushSearchMsgIsError.value = true;
    }
  } catch (e: unknown) {
    pushSearchDone.value = true;
    pushSearchMsg.value = e instanceof Error ? e.message : String(e);
    pushSearchMsgIsError.value = true;
  } finally {
    pushSearchRunning.value = false;
  }
}

function buildUpdateBusinessFormPayload(): UpdateBusinessFormPayload {
  return {
    modifyCurrency: modifyCurrency.value,
    currency: updateCurrency.value,
    modifyBmInfo: modifyBmInfo.value,
    bmInfo: {
      countryCode: updateCountry.value,
      companyName: updateCompanyName.value.trim(),
      city: updateCity.value.trim(),
      street1: updateStreet1.value.trim(),
      street2: updateStreet2.value.trim() || undefined,
      state: updateState.value.trim(),
      zip: updateZip.value.trim(),
      taxId: updateTaxId.value.trim() || undefined,
      adsForBusinessPurpose: updateAdsForBusiness.value,
    },
    modifyTimezone: modifyTimezone.value,
    timezone: updateTimezone.value,
  };
}

watch(
  () => [props.open, props.preset?.entryKey] as const,
  ([isOpen]) => {
    if (isOpen && props.preset) resetForm();
    if (!isOpen) {
      bmInviteSlots.value = {};
      bmInviteAbortFlags.value = {};
    }
  }
);

watch(selectedOpId, () => {
  emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
  friendAuthorizeSnapshot.value = [];
  if (friendCheckStatus.value !== 'idle') {
    friendCheckStatus.value = 'idle';
    friendCheckMsg.value = '';
  }
  useDefaultInterval.value = getBatchOperationUi(selectedOpId.value).step3?.defaultChecked ?? true;
});

watch(pushRecipientEmail, () => {
  pushRecipientCards.value = [];
  pushSearchDone.value = false;
  pushSearchMsg.value = '';
  pushSearchMsgIsError.value = false;
});

watch(uidsText, () => {
  const hadProgress = friendCheckStatus.value !== 'idle';
  if (hadProgress) {
    friendCheckStatus.value = 'idle';
    friendCheckMsg.value = '';
    friendAuthorizeSnapshot.value = [];
  }
  if (hadProgress && getBatchOperationUi(selectedOpId.value).confirmGates.includes('friend')) {
    emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
  }
});

function onBackdropClick() {
  emit('close');
}

async function onConfirm() {
  if (!props.preset || confirmDisabled.value || props.batchRunning) return;

  if (isFriendGate.value && friendRunAction.value) {
    if (!uidsText.value.trim()) return;
    friendVerifyRunning.value = true;
    friendCheckMsg.value = '';
    try {
      emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
      let firstEmitted = false;
      const summary = await runFacebookFriendCheckSequentialFromSite(uidsText.value, (payload) => {
        emit('friendVerifyResult', payload);
        const okRows = payload.rows.filter(
          (r) => r.resultKind === 'friend_uid' && !r.friendCheckPending && r.status === '成功'
        );
        if (okRows.length) {
          friendAuthorizeSnapshot.value = okRows.map((r) => ({
            uid: String(r.accountId ?? '').trim(),
            displayInput: (r.displayInput ?? r.accountId ?? '').trim(),
            sourceLine: (r.displayInput ?? r.accountId ?? '').trim(),
          }));
        }
        if (!firstEmitted && payload.rows.length > 0) {
          firstEmitted = true;
          drawerTab.value = 'result';
        }
      });
      friendCheckStatus.value = summary.ok ? 'ok' : 'err';
      friendCheckMsg.value = summary.message;
      syncFriendAuthorizeSnapshotFromResults();
      if (!firstEmitted) {
        drawerTab.value = 'result';
      }
    } catch (e: unknown) {
      friendCheckStatus.value = 'err';
      friendCheckMsg.value = e instanceof Error ? e.message : String(e);
      emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
      drawerTab.value = 'result';
    } finally {
      friendVerifyRunning.value = false;
    }
    return;
  }

  if (isFriendGate.value && !friendAuthorizeSnapshot.value.length) {
    return;
  }

  const removeAuthLike = isRemoveAuthSpecial.value;
  const authSnapshot = friendAuthorizeSnapshot.value;

  const bmHints = accountBmHintIds();

  const payload: BatchDrawerSubmitPayload = {
    entryKey: removeAuthLike ? 'removeAuth' : props.preset.entryKey,
    operationId: selectedOpId.value,
    accountBmHintIds: bmHints.length ? bmHints : undefined,
    subId:
      (isBmIdDrawerSpecial.value && (props.preset.subOptions?.length ?? 0) > 0) || showSubDropdown.value
        ? selectedSubId.value
        : undefined,
    uidsText:
      isFriendGate.value && authSnapshot.length
        ? authSnapshot.map((u) => u.uid).join('\n')
        : uidsText.value.trim(),
    useDefaultInterval: useDefaultInterval.value,
    friendCheckOk:
      removeAuthLike ||
      !ui.value.confirmGates.includes('friend') ||
      authSnapshot.length > 0 ||
      friendCheckStatus.value === 'ok',
    selectedAccountIds: [...props.selectedAccountIds],
    authorizedUsers:
      isFriendGate.value && authSnapshot.length ? [...authSnapshot] : undefined,
  };
  if (props.preset.entryKey === 'setLimit') {
    const minor = parseUsdInputToMinor(activeLimitAmountStr());
    if (minor == null || minor <= 0) return;
    payload.spendLimitForm = {
      kind: limitOpKind.value,
      amountMinor: minor,
    };
    const capHints: Record<
      string,
      { spendCapMinor?: number; amountSpentMinor?: number; currency?: string }
    > = {};
    for (const row of props.selectedAccountRows ?? []) {
      if (!row.accountId) continue;
      capHints[row.accountId] = {
        spendCapMinor: row.spendCapMinor,
        amountSpentMinor: row.totalSpentMinor,
        currency: row.currency,
      };
    }
    if (Object.keys(capHints).length) {
      payload.accountSpendCapHints = capHints;
    }
    payload.accountNames = buildAccountNamesMap();
    payload.uidsText = '';
  } else if (props.preset.entryKey === 'resetLimit') {
    const mode = resetMode.value;
    payload.resetLimitForm = { mode };
    if (mode === 'set_absolute') {
      const cap = parseUsdToMinorAllowZero(resetAbsoluteUsd.value);
      if (cap == null) return;
      payload.resetLimitForm.amountMinor = cap;
    }
    payload.accountNames = buildAccountNamesMap();
    payload.uidsText = '';
  } else if (removeAuthLike) {
    payload.friendCheckOk = true;
    payload.removeAuthForm = { deleteCurrentFacebookPerm: deleteCurrentFbPerm.value };
  } else if (isUpdateBusinessSpecial.value) {
    payload.friendCheckOk = true;
    payload.updateBusinessForm = buildUpdateBusinessFormPayload();
    payload.uidsText = '';
  } else if (isAccountPushSpecial.value) {
    const selected = pushRecipientCards.value.filter((c) => c.checked);
    if (!selected.length) return;
    payload.friendCheckOk = true;
    payload.accountPushForm = {
      recipients: selected.map((c) => ({
        recipientEmail: c.email,
        recipientUserId: c.userId,
        recipientDisplayName: c.displayName,
        businessId: c.businessId,
      })),
    };
    payload.uidsText = selected.map((c) => c.email).join('\n');
  }
  if (!payload.accountNames) {
    const names = buildAccountNamesMap();
    if (Object.keys(names).length) payload.accountNames = names;
  }
  emit('confirm', payload);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bod-drawer">
      <div v-if="open" class="bod-batch-tele">
        <div class="bod-batch-backdrop" @click.self="onBackdropClick"></div>
        <aside class="bod-batch-panel" aria-modal="true" role="dialog">
      <template v-if="preset">
        <div class="bod-batch-head">
          <h3 class="bod-batch-title">{{ preset.headerTitle }}</h3>
          <div class="bod-batch-head-end">
            <div class="bod-batch-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                class="bod-batch-tab"
                :class="{ on: drawerTab === 'op' }"
                :aria-selected="drawerTab === 'op'"
                @click="drawerTab = 'op'"
              >
                操作
              </button>
              <button
                type="button"
                role="tab"
                class="bod-batch-tab"
                :class="{ on: drawerTab === 'result' }"
                :aria-selected="drawerTab === 'result'"
                @click="drawerTab = 'result'"
              >
                结果
              </button>
            </div>
            <button type="button" class="bod-batch-close" aria-label="关闭" @click="emit('close')">×</button>
          </div>
        </div>

        <div class="bod-batch-body">
          <template v-if="drawerTab === 'op'">
            <div class="bod-batch-body-scroll bod-drawer-scroll">
            <p v-if="batchRunning" class="bod-batch-running muted">正在执行批量操作…</p>

            <!-- 设置账号限额（设计稿分步） -->
            <div v-if="isLimitSpecial" class="bod-batch-op-root bod-limit-root">
              <select v-model="selectedOpId" class="bod-batch-select bod-batch-select--main">
                <option v-for="op in preset.operations" :key="op.id" :value="op.id">{{ op.label }}</option>
              </select>
              <div class="bod-steps">
                <div class="bod-step-line" aria-hidden="true"></div>

                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <p class="bod-limit-line">
                      当前账号:
                      {{ formatPreviewAccountLabel(primaryPreviewAccount) || selectedAccountIds[0] || '—' }}
                      <span v-if="selectedAccountIds.length > 1" class="muted small">
                        （共 {{ selectedAccountIds.length }} 个，将逐户执行相同规则）
                      </span>
                    </p>
                    <p class="bod-limit-line">当前花费限额: {{ displaySpendingCap(primaryPreviewAccount) }}</p>
                    <p class="bod-limit-line">剩余额度: {{ displayBalance(primaryPreviewAccount) }}</p>
                  </div>
                </div>

                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <div class="bod-step-label">操作类型</div>
                    <div class="bod-radio-stack">
                      <label class="bod-radio-row">
                        <input v-model="limitOpKind" type="radio" value="increase" />
                        <span>增加额度</span>
                        <input
                          v-model="increaseUsdStr"
                          type="text"
                          class="bod-limit-input bod-limit-input--inline"
                          placeholder="输入增加额度值"
                          :disabled="limitOpKind !== 'increase'"
                        />
                        <span class="bod-currency-suffix">USD</span>
                      </label>
                      <label class="bod-radio-row">
                        <input v-model="limitOpKind" type="radio" value="decrease" />
                        <span>减少额度</span>
                        <input
                          v-model="decreaseUsdStr"
                          type="text"
                          class="bod-limit-input bod-limit-input--inline"
                          placeholder="输入减少额度值"
                          :disabled="limitOpKind !== 'decrease'"
                        />
                        <span class="bod-currency-suffix">USD</span>
                      </label>
                      <div class="bod-radio-row bod-radio-row--disabled">
                        <span class="bod-radio-fake" aria-hidden="true" />
                        <span>账户间转移</span>
                        <select class="bod-batch-select bod-select-inline" disabled>
                          <option>选择转入账户</option>
                          <option v-for="r in otherAccountsForTransfer" :key="r.accountId" :value="r.accountId">
                            {{ r.name || r.accountId }}
                          </option>
                        </select>
                      </div>
                      <p class="bod-limit-hint muted small">账户间转移需 Meta Business 侧能力，当前版本未开放。</p>
                    </div>
                  </div>
                </div>

                <div class="bod-step">
                  <span class="bod-step-badge">3</span>
                  <div class="bod-step-body">
                    <div class="bod-step-label">操作结果预览</div>
                    <div class="bod-preview-box">{{ limitPreviewText }}</div>
                  </div>
                </div>

                <div class="bod-step">
                  <span class="bod-step-badge">4</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 重置限额 -->
            <div v-else-if="isResetSpecial" class="bod-batch-op-root bod-limit-root">
              <select v-model="selectedOpId" class="bod-batch-select bod-batch-select--main">
                <option v-for="op in preset.operations" :key="op.id" :value="op.id">{{ op.label }}</option>
              </select>
              <div class="bod-steps">
                <div class="bod-step-line" aria-hidden="true"></div>
                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <div class="bod-step-label">操作类型</div>
                    <div class="bod-radio-stack">
                      <label class="bod-radio-row">
                        <input v-model="resetMode" type="radio" value="account_zero" />
                        <span>账户清零</span>
                      </label>
                      <label class="bod-radio-row">
                        <input v-model="resetMode" type="radio" value="delete_restriction" />
                        <span>删除限制</span>
                      </label>
                      <label class="bod-radio-row">
                        <input v-model="resetMode" type="radio" value="set_absolute" />
                        <span>设置限额</span>
                      </label>
                      <div v-if="resetMode === 'set_absolute'" class="bod-reset-abs">
                        <span class="muted small">新花费限额（USD，将同步至 Meta 广告账户）</span>
                        <input
                          v-model="resetAbsoluteUsd"
                          type="text"
                          class="bod-limit-input bod-limit-input--block"
                          placeholder="例如 100.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 添加到 BM：顶栏双下拉 + 填写 BM ID + 执行间隔 -->
            <div v-else-if="isBmIdDrawerSpecial" class="bod-batch-op-root bod-remove-auth-root">
              <select class="bod-batch-select bod-batch-select--main bod-remove-auth-header-select" disabled>
                <option>{{ preset.headerTitle }}</option>
              </select>
              <div class="bod-batch-branch">
                <span class="bod-branch-icon" aria-hidden="true"></span>
                <select v-model="selectedSubId" class="bod-batch-select bod-batch-select--sub">
                  <option v-for="s in preset.subOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
                </select>
              </div>
              <div class="bod-steps bod-remove-auth-steps">
                <div class="bod-step-line" aria-hidden="true"></div>
                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <label class="bod-step-label">{{ displayStepLabel(preset.step1.label) }}</label>
                    <textarea
                      v-model="uidsText"
                      class="bod-batch-textarea"
                      rows="6"
                      :placeholder="preset.step1.placeholder"
                    ></textarea>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 删除广告账号权限：顶栏双下拉 + 步骤 1 UID + 步骤 2/3 勾选（无好友检测） -->
            <div v-else-if="isRemoveAuthSpecial" class="bod-batch-op-root bod-remove-auth-root">
              <select class="bod-batch-select bod-batch-select--main bod-remove-auth-header-select" disabled>
                <option>{{ preset.headerTitle }}</option>
              </select>
              <div class="bod-batch-branch">
                <span class="bod-branch-icon" aria-hidden="true"></span>
                <select v-model="selectedOpId" class="bod-batch-select bod-batch-select--sub">
                  <option v-for="op in preset.operations" :key="op.id" :value="op.id">{{ op.label }}</option>
                </select>
              </div>
              <div class="bod-steps bod-remove-auth-steps">
                <div class="bod-step-line" aria-hidden="true"></div>
                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <label class="bod-step-label">{{ displayStepLabel(ui.step1.label) }}</label>
                    <textarea
                      v-model="uidsText"
                      class="bod-batch-textarea"
                      rows="6"
                      :placeholder="ui.step1.placeholder"
                    ></textarea>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="deleteCurrentFbPerm" type="checkbox" />
                      <span>删除当前Facebook账号的权限？</span>
                    </label>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">3</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 账号重命名 -->
            <div v-else-if="isAccountRenameSpecial" class="bod-batch-op-root bod-rename-root">
              <select class="bod-batch-select bod-batch-select--main bod-remove-auth-header-select" disabled>
                <option>{{ preset.headerTitle }}</option>
              </select>
              <div class="bod-steps bod-remove-auth-steps">
                <div class="bod-step-line" aria-hidden="true"></div>
                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <label class="bod-step-label bod-step-label--required">
                      <span class="bod-required">*</span>自动重命名账号
                    </label>
                    <p class="bod-rename-line-hint muted small">
                      每行一个新名称；与已选账户顺序一致，第一行对应第一个选中账户。仅填一行时，全部账户改为该名称。
                    </p>
                    <textarea
                      v-model="uidsText"
                      class="bod-batch-textarea bod-rename-textarea"
                      rows="6"
                      :placeholder="preset.step1.placeholder"
                    ></textarea>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 推送数据 -->
            <div v-else-if="isAccountPushSpecial" class="bod-batch-op-root bod-push-root">
              <select class="bod-batch-select bod-batch-select--main bod-remove-auth-header-select" disabled>
                <option>{{ preset.headerTitle }}</option>
              </select>
              <div class="bod-push-info" role="status">
                <span class="bod-push-info-ico" aria-hidden="true">i</span>
                <div class="bod-push-info-text">
                  <div>
                    将向 {{ selectedAccountCount }} 个广告账号推送（重复推送会被覆盖）
                  </div>
                  <div
                    class="bod-push-info-sub"
                    :class="{
                      'is-warn':
                        pushSearchDone &&
                        !pushRecipientCards.length &&
                        !pushSearchRunning,
                    }"
                  >
                    {{ pushRecipientStatusText }}
                  </div>
                </div>
              </div>
              <div class="bod-push-search">
                <label class="bod-push-search-label">输入接收者邮箱</label>
                <div class="bod-push-search-row">
                  <input
                    v-model="pushRecipientEmail"
                    type="email"
                    class="bod-update-biz-input bod-push-email-input"
                    placeholder="xxx@xxx.com"
                    @keydown.enter.prevent="onPushSearchUser"
                  />
                  <button
                    type="button"
                    class="bod-push-search-btn"
                    :disabled="pushSearchRunning"
                    @click="onPushSearchUser"
                  >
                    {{ pushSearchRunning ? '搜索中…' : '搜索' }}
                  </button>
                </div>
                <p
                  v-if="pushSearchMsg"
                  class="bod-push-search-msg"
                  :class="{ err: pushSearchMsgIsError, ok: !pushSearchMsgIsError }"
                >
                  {{ pushSearchMsg }}
                </p>
              </div>
              <div v-if="pushRecipientCards.length" class="bod-push-results">
                <div class="bod-push-results-toolbar">
                  <span class="muted small"
                    >共 {{ pushRecipientCards.length }} 人，已选 {{ pushSelectedCount }}</span
                  >
                  <button type="button" class="bod-push-link-btn" @click="selectAllPushRecipients">
                    全选
                  </button>
                  <button type="button" class="bod-push-link-btn" @click="selectNonePushRecipients">
                    全不选
                  </button>
                </div>
                <div class="bod-push-card-list">
                  <label
                    v-for="card in pushRecipientCards"
                    :key="card.key"
                    class="bod-push-user-card bod-push-user-card--pick"
                  >
                    <input v-model="card.checked" type="checkbox" class="bod-push-check" />
                    <div class="bod-push-user-card-body">
                      <div class="bod-push-user-name">{{ card.displayName }}</div>
                      <div class="bod-push-user-email muted">{{ card.email }}</div>
                      <div v-if="card.businessId" class="bod-push-user-bm muted small">
                        BM {{ card.businessId }}
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              <div v-else-if="pushSearchDone" class="bod-push-empty">
                <div class="bod-push-empty-ico" aria-hidden="true" />
                <p class="muted">未找到可推送用户</p>
              </div>
              <div v-else class="bod-push-empty">
                <div class="bod-push-empty-ico" aria-hidden="true" />
                <p class="muted">请先搜索用户</p>
              </div>
            </div>

            <!-- 更新 Business 信息 -->
            <div v-else-if="isUpdateBusinessSpecial" class="bod-batch-op-root bod-update-biz-root">
              <select class="bod-batch-select bod-batch-select--main bod-remove-auth-header-select" disabled>
                <option>{{ preset.headerTitle }}</option>
              </select>
              <p class="bod-update-biz-hint muted">请选择要修改的信息</p>
              <div class="bod-steps bod-update-biz-steps">
                <div class="bod-step-line" aria-hidden="true"></div>
                <div class="bod-step">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="modifyCurrency" type="checkbox" />
                      <span>修改广告账号币种</span>
                    </label>
                    <div v-if="modifyCurrency" class="bod-update-biz-panel">
                      <label class="bod-field-label">选择币种</label>
                      <select v-model="updateCurrency" class="bod-batch-select bod-update-biz-field">
                        <option v-for="c in UPDATE_BUSINESS_CURRENCIES" :key="c.code" :value="c.code">
                          {{ c.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="modifyBmInfo" type="checkbox" />
                      <span>修改BM信息</span>
                    </label>
                    <div v-if="modifyBmInfo" class="bod-update-biz-panel">
                      <label class="bod-field-label">选择国家</label>
                      <select v-model="updateCountry" class="bod-batch-select bod-update-biz-field">
                        <option v-for="c in UPDATE_BUSINESS_COUNTRIES" :key="c.code" :value="c.code">
                          {{ c.label }}
                        </option>
                      </select>
                      <label class="bod-field-label">公司名称</label>
                      <input v-model="updateCompanyName" type="text" class="bod-update-biz-input" />
                      <label class="bod-field-label">市/镇</label>
                      <input v-model="updateCity" type="text" class="bod-update-biz-input" />
                      <div class="bod-field-grid">
                        <div>
                          <label class="bod-field-label">街道地址第 1 行</label>
                          <input v-model="updateStreet1" type="text" class="bod-update-biz-input" />
                        </div>
                        <div>
                          <label class="bod-field-label">街道地址第 1 行(选填)</label>
                          <input v-model="updateStreet2" type="text" class="bod-update-biz-input" placeholder="Street 2" />
                        </div>
                      </div>
                      <div class="bod-field-grid">
                        <div>
                          <label class="bod-field-label">州、省或地区</label>
                          <input v-model="updateState" type="text" class="bod-update-biz-input" />
                        </div>
                        <div>
                          <label class="bod-field-label">邮编</label>
                          <input v-model="updateZip" type="text" class="bod-update-biz-input" />
                        </div>
                      </div>
                      <label class="bod-field-label">税号(选填)</label>
                      <input v-model="updateTaxId" type="text" class="bod-update-biz-input" placeholder="tax code" />
                      <p class="bod-update-biz-question">您购买广告是为了商业目的吗?</p>
                      <div class="bod-radio-stack bod-update-biz-radios">
                        <label class="bod-radio-row">
                          <input v-model="updateAdsForBusiness" type="radio" :value="true" />
                          <span>是</span>
                        </label>
                        <label class="bod-radio-row">
                          <input v-model="updateAdsForBusiness" type="radio" :value="false" />
                          <span>否</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">3</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="modifyTimezone" type="checkbox" />
                      <span>修改时区信息</span>
                    </label>
                    <div v-if="modifyTimezone" class="bod-update-biz-panel">
                      <label class="bod-field-label">选择时区</label>
                      <select v-model="updateTimezone" class="bod-batch-select bod-update-biz-field">
                        <option v-for="tz in UPDATE_BUSINESS_TIMEZONES" :key="tz.id" :value="tz.id">
                          {{ tz.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="bod-step">
                  <span class="bod-step-badge">4</span>
                  <div class="bod-step-body">
                    <label class="bod-check bod-check--muted">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 其他批量入口（原样） -->
            <div v-else class="bod-batch-op-root">
              <select v-model="selectedOpId" class="bod-batch-select bod-batch-select--main">
                <option v-for="op in preset.operations" :key="op.id" :value="op.id">{{ op.label }}</option>
              </select>

              <div v-if="showSubDropdown" class="bod-batch-branch">
                <span class="bod-branch-icon" aria-hidden="true"></span>
                <select v-model="selectedSubId" class="bod-batch-select bod-batch-select--sub">
                  <option v-for="s in preset.subOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
                </select>
              </div>

              <div class="bod-steps">
                <div class="bod-step-line" aria-hidden="true"></div>

                <div class="bod-step bod-step--1">
                  <span class="bod-step-badge">1</span>
                  <div class="bod-step-body">
                    <label class="bod-step-label">{{ displayStepLabel(ui.step1.label) }}</label>
                    <textarea
                      v-model="uidsText"
                      class="bod-batch-textarea"
                      rows="6"
                      :placeholder="ui.step1.placeholder"
                    ></textarea>
                  </div>
                </div>

                <div v-if="step2Visible && ui.step2" class="bod-step bod-step--2">
                  <span class="bod-step-badge">2</span>
                  <div class="bod-step-body">
                    <div class="bod-step-label muted">{{ displayStepLabel(ui.step2.label) }}</div>
                    <p v-if="ui.step2.hint" class="bod-step-hint muted">{{ displayStepLabel(ui.step2.hint) }}</p>
                    <p v-if="friendCheckMsg" class="bod-friend-msg" :class="{ err: friendCheckStatus === 'err' }">
                      {{ stripSquareBracketAnnotations(friendCheckMsg) }}
                    </p>
                  </div>
                </div>

                <div v-if="step3Visible && ui.step3" class="bod-step bod-step--3">
                  <span class="bod-step-badge">3</span>
                  <div class="bod-step-body">
                    <label class="bod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>{{ ui.step3.label }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </template>

          <template v-else>
            <div class="bod-batch-result-pane">
            <template v-if="batchRunning && !resultRows.length">
              <p class="bod-result-empty muted">正在执行，请稍候…</p>
            </template>
            <template v-else-if="!resultRows.length">
              <p v-if="friendCheckMsg" class="bod-result-summary muted">{{
                stripSquareBracketAnnotations(friendCheckMsg)
              }}</p>
              <p v-else class="bod-result-empty muted">暂无结果：检测或批量执行后将在此以卡片展示。</p>
            </template>
            <div v-else class="bod-result-cards bod-drawer-scroll">
              <article
                v-for="(r, idx) in resultRows"
                :key="`${r.accountId}-${idx}-${r.resultKind || 'ad'}-${r.friendCheckPending ? 'p' : 'd'}`"
                class="bod-result-card"
                :class="{ 'bod-result-card--friend-pending': r.friendCheckPending }"
              >
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">状态</span>
                  <span
                    v-if="r.friendCheckPending"
                    class="bod-result-badge bod-result-badge--pending"
                  >
                    {{ r.status }}
                  </span>
                  <span
                    v-else
                    class="bod-result-badge"
                    :class="r.status === '成功' ? 'bod-result-badge--ok' : 'bod-result-badge--err'"
                  >
                    {{ r.status }}
                  </span>
                </div>
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">{{ resultTargetFieldLabel(r) }}</span>
                  <span class="bod-result-card-v mono bod-result-wrap bod-result-preline">{{
                    resultTargetDisplay(r)
                  }}</span>
                </div>
                <div v-if="showAdAccountIdRow(r)" class="bod-result-card-row">
                  <span class="bod-result-card-k">广告账户 ID</span>
                  <span class="bod-result-card-v mono bod-result-wrap">{{ r.accountId }}</span>
                </div>
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">当前账号</span>
                  <span class="bod-result-card-v bod-result-wrap">{{ currentFbDisplay(r) }}</span>
                </div>
                <div v-if="!r.friendCheckPending" class="bod-result-card-row bod-result-card-row--detail">
                  <span class="bod-result-card-k">返回信息</span>
                  <div class="bod-result-card-v bod-result-detail">
                    <template v-if="r.resultKind === 'friend_uid'">
                      <span class="bod-friend-return-base">与当前Facebook社交账号</span>
                      <span v-if="r.status === '成功'" class="bod-friend-return-ok">是好友</span>
                      <span v-else class="bod-friend-return-err">不是好友</span>
                      <span v-if="r.status === '成功'">。</span>
                    </template>
                    <template v-else-if="resultDetailView(r.detail).plain">
                      <p class="bod-result-detail-plain">{{ resultDetailView(r.detail).plain }}</p>
                    </template>
                    <template v-else>
                      <p v-if="resultDetailView(r.detail).summary" class="bod-result-detail-summary">
                        {{ resultDetailView(r.detail).summary }}
                      </p>
                      <ul
                        v-if="resultDetailView(r.detail).segments.length"
                        class="bod-result-detail-list"
                      >
                        <li
                          v-for="(seg, segIdx) in resultDetailView(r.detail).segments"
                          :key="segIdx"
                          class="bod-result-detail-item"
                        >
                          <div v-if="seg.label" class="bod-result-detail-item-label">{{ seg.label }}</div>
                          <div class="bod-result-detail-item-msg">{{ seg.message }}</div>
                          <div v-if="showBmInviteForSegment(seg)" class="bod-bm-invite">
                            <p class="bod-bm-invite-hint muted small">
                              需先加入该广告账户所属 Business Manager。请填写对方 Facebook
                              账号<strong>已验证的主邮箱</strong>（须与 facebook.com → 设置 → 邮箱 中一致，不是昵称）。
                              系统将每 1 分钟确认是否已加入（最多 5 次），成功后将自动重新授权。
                            </p>
                            <p class="bod-bm-invite-hint muted small">
                              若提示 code=10 / 1752203「应用无权限」：API 无法代发 BM 邀请，请到商务管理平台手动邀请。
                            </p>
                            <p class="bod-bm-invite-hint muted small">
                              若收不到邮件：查垃圾箱；确认此前未报「双重验证」错误；或到
                              <a
                                href="https://business.facebook.com/latest/settings/people"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="bod-bm-invite-link"
                              >商务管理平台 → 用户</a>
                              手动邀请后让对方接受，再点本页「发送 BM 邀请」仅做确认。
                            </p>
                            <div class="bod-bm-invite-row">
                              <input
                                v-model="getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).email"
                                type="email"
                                class="bod-bm-invite-input"
                                placeholder="例如 name@example.com"
                                :disabled="getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).running"
                              />
                              <button
                                type="button"
                                class="bod-bm-invite-btn"
                                :disabled="getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).running"
                                @click="startBmInvite(r, seg)"
                              >
                                {{
                                  getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).running
                                    ? '处理中…'
                                    : '发送 BM 邀请'
                                }}
                              </button>
                            </div>
                            <p
                              v-if="getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).statusText"
                              class="bod-bm-invite-status small"
                            >
                              {{ getBmInviteSlot(bmInviteKey(r.accountId, seg.label)).statusText }}
                            </p>
                          </div>
                        </li>
                      </ul>
                    </template>
                  </div>
                </div>
                <div
                  v-if="r.friendCheckPending"
                  class="bod-result-card-pending-mask"
                  role="status"
                  aria-live="polite"
                >
                  <span class="bod-result-card-pending-spinner" aria-hidden="true" />
                  <span class="bod-result-card-pending-text">程序正在努力检测中</span>
                </div>
              </article>
            </div>
            </div>
          </template>
        </div>

        <div v-if="showFootExecuteButton" class="bod-batch-foot">
          <button
            type="button"
            class="bod-btn-confirm"
            :class="{
              'bod-btn-confirm--busy': batchRunning || friendVerifyRunning,
              'bod-btn-confirm--danger': footPrimaryDanger,
            }"
            :disabled="confirmDisabled"
            @click="onConfirm"
          >
            <span
              v-if="batchRunning || friendVerifyRunning"
              class="bod-btn-foot-spinner"
              aria-hidden="true"
            />
            <svg class="bod-lock-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ footPrimaryLabel }}
          </button>
        </div>
      </template>
    </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bod-batch-tele {
  position: fixed;
  inset: 0;
  z-index: 2499;
  pointer-events: none;
}
.bod-batch-tele .bod-batch-backdrop,
.bod-batch-tele .bod-batch-panel {
  pointer-events: auto;
}
.bod-batch-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2500;
}
.bod-batch-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(480px, 96vw);
  height: 100vh;
  z-index: 2600;
  background: var(--fb-modal-bg, #252526);
  color: var(--fb-modal-text, #e5e7eb);
  border-left: 1px solid var(--fb-modal-border, #3c3c3c);
  box-shadow: -12px 0 36px rgba(0, 0, 0, 0.45);
  transform: translateX(0);
  display: flex;
  flex-direction: column;
}
.bod-drawer-enter-active .bod-batch-panel,
.bod-drawer-leave-active .bod-batch-panel {
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.bod-drawer-enter-active .bod-batch-backdrop,
.bod-drawer-leave-active .bod-batch-backdrop {
  transition: opacity 0.28s ease;
}
.bod-drawer-enter-from .bod-batch-panel,
.bod-drawer-leave-to .bod-batch-panel {
  transform: translateX(100%);
}
.bod-drawer-enter-to .bod-batch-panel,
.bod-drawer-leave-from .bod-batch-panel {
  transform: translateX(0);
}
.bod-drawer-enter-from .bod-batch-backdrop,
.bod-drawer-leave-to .bod-batch-backdrop {
  opacity: 0;
}
.bod-drawer-enter-to .bod-batch-backdrop,
.bod-drawer-leave-from .bod-batch-backdrop {
  opacity: 1;
}
.bod-batch-head {
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--fb-border, #3c3c3c);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.bod-batch-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
}
.bod-batch-head-end {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.bod-batch-tabs {
  display: inline-flex;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--fb-border, #4b5563);
}
.bod-batch-tab {
  border: none;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--fb-surface-a, #1e1e1e);
  color: var(--fb-muted, #9ca3af);
}
.bod-batch-tab.on {
  background: #1877f2;
  color: #fff;
}
.bod-batch-close {
  border: none;
  background: transparent;
  color: var(--fb-muted, #9ca3af);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  margin: -4px -2px 0 0;
}
.bod-batch-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
.bod-batch-body-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
}
.bod-batch-result-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 18px;
}
.bod-drawer-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
}
.bod-drawer-scroll::-webkit-scrollbar {
  width: 6px;
}
.bod-drawer-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.bod-drawer-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}
.bod-drawer-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.34);
}
.bod-batch-running {
  margin: 0 0 12px;
  font-size: 12px;
}
.bod-batch-op-root {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.bod-batch-select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
  font-family: inherit;
}
.bod-batch-select:focus {
  outline: none;
  border-color: #1877f2;
  box-shadow: 0 0 0 1px rgba(24, 119, 242, 0.35);
}
.bod-batch-branch {
  display: flex;
  align-items: stretch;
  margin-top: 2px;
  padding-left: 14px;
  gap: 0;
}
.bod-branch-icon {
  width: 18px;
  flex-shrink: 0;
  position: relative;
  margin-right: 6px;
}
.bod-branch-icon::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 50%;
  width: 1px;
  background: var(--fb-border, #4b5563);
}
.bod-branch-icon::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  width: 10px;
  height: 1px;
  background: var(--fb-border, #4b5563);
}
.bod-batch-select--sub {
  flex: 1;
  margin-top: 8px;
}
.bod-steps {
  position: relative;
  margin-top: 20px;
  padding-left: 40px;
  /* 竖线穿过圆点水平中心：徽章 22px、left -40px → 圆心在距容器左内边 11px */
  --bod-step-rail-x: 11px;
}
.bod-step-line {
  position: absolute;
  left: var(--bod-step-rail-x);
  top: 14px;
  bottom: 14px;
  width: 1px;
  transform: translateX(-50%);
  background: var(--fb-border, #4b5563);
}
.bod-step {
  position: relative;
  display: flex;
  gap: 22px;
  margin-bottom: 22px;
}
.bod-step:last-child {
  margin-bottom: 0;
}
.bod-step-badge {
  position: absolute;
  left: -40px;
  top: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--fb-surface-b, #3c3c3c);
  color: var(--fb-muted, #9ca3af);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  border: 1px solid var(--fb-border, #4b5563);
}
.bod-step-body {
  flex: 1;
  min-width: 0;
  padding-left: 10px;
}
.bod-step-label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  line-height: 1.45;
  color: var(--fb-modal-text, #e5e7eb);
}
.bod-step-label.muted {
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 10px;
}
.bod-step-hint {
  font-size: 12px;
  line-height: 1.45;
  margin: -4px 0 10px;
}
.muted {
  color: var(--fb-muted, #9ca3af);
}
.bod-batch-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 120px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}
.bod-batch-textarea:focus {
  outline: none;
  border-color: #1877f2;
}
.bod-btn-detect {
  width: 100%;
  border: none;
  border-radius: 6px;
  padding: 11px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #22c55e;
  color: #052e16;
}
.bod-btn-detect:hover:not(:disabled) {
  filter: brightness(1.06);
}
.bod-btn-detect:disabled {
  opacity: 0.75;
  cursor: wait;
}
.bod-friend-msg {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--fb-muted, #9ca3af);
}
.bod-friend-msg.err {
  color: #f87171;
}
.bod-check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.bod-check input {
  width: 16px;
  height: 16px;
  accent-color: #1877f2;
  cursor: pointer;
}
.bod-result-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
}
.bod-result-summary {
  margin: 16px 0;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.bod-result-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 4px 0 8px;
}
.bod-result-card {
  position: relative;
  border: 1px solid var(--fb-border, #4b5563);
  border-radius: 8px;
  background: var(--fb-modal-input-bg, #2d2d2d);
  padding: 12px 14px;
  font-size: 13px;
}
.bod-result-card--friend-pending {
  min-height: 108px;
}
.bod-result-card-pending-mask {
  position: absolute;
  inset: 0;
  border-radius: 7px;
  margin: -1px;
  background: rgba(15, 17, 23, 0.78);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
}
.bod-result-card-pending-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: bod-foot-spin 0.75s linear infinite;
}
.bod-result-card-pending-text {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  line-height: 1.45;
  max-width: 14em;
}
.bod-result-badge--pending {
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}
.bod-result-card-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
}
.bod-result-card-row:last-child {
  border-bottom: none;
}
.bod-result-card-row--detail {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.bod-result-card-row--detail .bod-result-card-k {
  flex-shrink: 0;
}
.bod-result-card-k {
  color: var(--fb-muted, #9ca3af);
  flex-shrink: 0;
  min-width: 5rem;
}
.bod-result-card-v {
  text-align: right;
  color: var(--fb-modal-text, #e5e7eb);
  word-break: break-word;
}
.bod-result-card-row--detail .bod-result-card-v {
  text-align: left;
}
.bod-result-wrap {
  max-width: 100%;
}
.bod-result-preline {
  white-space: pre-line;
  text-align: left;
}
.bod-result-detail {
  width: 100%;
  min-width: 0;
}
.bod-result-detail-plain,
.bod-result-detail-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.bod-result-detail-summary {
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 8px;
}
.bod-result-detail-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bod-result-detail-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--fb-surface-b, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--fb-cell-border, #1f2937);
}
.bod-result-detail-item-label {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: var(--fb-dash-view-all, #93c5fd);
  word-break: break-all;
  margin-bottom: 6px;
}
.bod-result-detail-item-msg {
  font-size: 13px;
  line-height: 1.55;
  color: var(--fb-modal-text, #e5e7eb);
  word-break: break-word;
  white-space: pre-wrap;
}
.bod-bm-invite {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--fb-cell-border, #374151);
}
.bod-bm-invite-hint {
  margin: 0 0 8px;
  line-height: 1.45;
}
.bod-bm-invite-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bod-bm-invite-input {
  flex: 1;
  min-width: 160px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
}
.bod-bm-invite-btn {
  flex-shrink: 0;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: #1877f2;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.bod-bm-invite-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.bod-bm-invite-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bod-bm-invite-status {
  margin: 8px 0 0;
  color: var(--fb-muted, #9ca3af);
  line-height: 1.45;
  word-break: break-word;
}
.bod-bm-invite-link {
  color: var(--fb-dash-view-all, #93c5fd);
  text-decoration: underline;
}
.bod-bm-invite-hint strong {
  color: var(--fb-modal-text, #e5e7eb);
  font-weight: 600;
}
.bod-friend-return-base {
  color: var(--fb-modal-text, #e5e7eb);
}
.bod-friend-return-ok {
  color: #4ade80;
  font-weight: 600;
}
.bod-friend-return-err {
  color: #f87171;
  font-weight: 600;
}
.bod-result-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.bod-result-badge--ok {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}
.bod-result-badge--err {
  background: rgba(248, 113, 113, 0.15);
  color: #fecaca;
}
.mono {
  font-family: ui-monospace, monospace;
}
.bod-batch-foot {
  padding: 14px 18px 18px;
  border-top: 1px solid var(--fb-border, #3c3c3c);
  flex-shrink: 0;
}
.bod-btn-confirm {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: #1877f2;
  color: #fff;
}
.bod-btn-confirm:hover:not(:disabled) {
  filter: brightness(1.05);
}
.bod-btn-confirm--danger {
  background: #c0392b;
}
.bod-btn-confirm--danger:hover:not(:disabled) {
  filter: brightness(1.08);
}
.bod-btn-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.bod-lock-ico {
  flex-shrink: 0;
  opacity: 0.95;
}
.small {
  font-size: 11px;
}
.bod-limit-root .bod-limit-line {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.5;
}
.bod-limit-input {
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
  max-width: 160px;
}
.bod-limit-input:focus {
  outline: none;
  border-color: #1877f2;
}
.bod-limit-input--inline {
  max-width: 140px;
  margin-left: 4px;
}
.bod-limit-input--block {
  max-width: 100%;
  width: 100%;
  margin-top: 8px;
}
.bod-radio-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bod-radio-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.bod-radio-row--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.bod-radio-fake {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--fb-border, #6b7280);
  flex-shrink: 0;
}
.bod-currency-suffix {
  color: var(--fb-muted, #9ca3af);
  font-size: 12px;
}
.bod-select-inline {
  flex: 1;
  min-width: 120px;
  max-width: 220px;
  margin-left: auto;
}
.bod-limit-hint {
  margin: 0;
}
.bod-preview-box {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #4b5563);
  background: var(--fb-surface-a, #1e1e1e);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 72px;
}
.bod-reset-abs {
  width: 100%;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bod-btn-foot-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: bod-foot-spin 0.7s linear infinite;
}
.bod-btn-confirm--busy:not(:disabled) {
  opacity: 0.92;
}
@keyframes bod-foot-spin {
  to {
    transform: rotate(360deg);
  }
}
.bod-remove-auth-root {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.bod-remove-auth-header-select:disabled {
  opacity: 1;
  cursor: default;
  color: var(--fb-input-text, #e5e7eb);
}
.bod-remove-auth-steps {
  margin-top: 10px;
}
.bod-update-biz-root {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.bod-update-biz-hint {
  margin: 10px 0 4px;
  font-size: 13px;
}
.bod-update-biz-steps {
  margin-top: 8px;
}
.bod-update-biz-panel {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #4b5563);
  background: var(--fb-surface-a, #1e1e1e);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bod-field-label {
  display: block;
  font-size: 12px;
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 4px;
}
.bod-update-biz-field {
  width: 100%;
  max-width: none;
}
.bod-update-biz-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
  font-family: inherit;
}
.bod-update-biz-input:focus {
  outline: none;
  border-color: #1877f2;
}
.bod-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}
@media (max-width: 520px) {
  .bod-field-grid {
    grid-template-columns: 1fr;
  }
}
.bod-update-biz-question {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fb-modal-text, #e5e7eb);
}
.bod-update-biz-radios {
  gap: 8px;
}
.bod-check--muted {
  color: var(--fb-muted, #9ca3af);
}
.bod-step-label--required .bod-required {
  color: #ef4444;
  margin-right: 2px;
}
.bod-rename-root {
  display: flex;
  flex-direction: column;
}
.bod-rename-line-hint {
  margin: 0 0 8px;
  line-height: 1.45;
}
.bod-rename-textarea {
  min-height: 120px;
}
.bod-push-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bod-push-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(24, 119, 242, 0.12);
  border: 1px solid rgba(24, 119, 242, 0.35);
  font-size: 13px;
  line-height: 1.45;
  color: #93c5fd;
}
.bod-push-info-ico {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1877f2;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bod-push-info-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bod-push-info-sub {
  font-size: 12px;
  color: rgba(147, 197, 253, 0.85);
}
.bod-push-info-sub.is-warn {
  color: #fca5a5;
}
.bod-push-search-label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--fb-modal-text, #e5e7eb);
}
.bod-push-search-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.bod-push-email-input {
  flex: 1;
  min-width: 0;
}
.bod-push-search-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #1877f2;
  background: transparent;
  color: #60a5fa;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.bod-push-search-btn:hover:not(:disabled) {
  background: rgba(24, 119, 242, 0.12);
}
.bod-push-search-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.bod-push-search-msg {
  margin: 8px 0 0;
  font-size: 12px;
}
.bod-push-search-msg.err {
  color: #f87171;
}
.bod-push-search-msg.ok {
  color: #86efac;
}
.bod-push-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
}
.bod-push-results-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.bod-push-link-btn {
  border: none;
  background: transparent;
  color: #60a5fa;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.bod-push-link-btn:hover {
  text-decoration: underline;
}
.bod-push-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}
.bod-push-user-card--pick {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  margin: 0;
}
.bod-push-check {
  margin-top: 4px;
  flex-shrink: 0;
}
.bod-push-user-card-body {
  flex: 1;
  min-width: 0;
}
.bod-push-user-bm {
  margin-top: 4px;
}
.bod-push-empty {
  flex: 1;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 12px;
}
.bod-push-empty-ico {
  width: 72px;
  height: 56px;
  border-radius: 8px;
  background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);
  opacity: 0.45;
  position: relative;
}
.bod-push-empty-ico::after {
  content: '';
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 14px;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.35) 0%, transparent 70%);
}
.bod-push-user-card {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
}
.bod-push-user-name {
  font-size: 14px;
  font-weight: 600;
}
.bod-push-user-email {
  font-size: 12px;
  margin-top: 4px;
}
</style>
