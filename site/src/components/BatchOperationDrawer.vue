<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import type {
  BatchAccountPreviewRow,
  BatchDrawerPreset,
  BatchDrawerSubmitPayload,
  BatchOperationId,
} from '../lib/batchOperationTypes';
import { getBatchOperationUi } from '../lib/batchOperationPresets';

import {
  mapUidVerifyRowsToFriendBatchResultRows,
  verifyFacebookUidsForBatchSite,
  type FriendVerifyResultPayload,
} from '../lib/extensionBridge';

const props = defineProps<{
  open: boolean;
  preset: BatchDrawerPreset | null;
  selectedAccountIds: string[];
  /** 当前勾选行摘要（设置限额抽屉展示额度等） */
  selectedAccountRows?: BatchAccountPreviewRow[];
  /** 父组件在 Graph 批量执行完成后写入，用于「结果」页 */
  batchResults?: { accountId: string; status: string; detail: string; resultKind?: string; currentFbProfileUrl?: string | null }[];
  batchRunning?: boolean;
  /** 最近一次好友预检得到的当前 Facebook 主页（批量结果卡「当前账号」兜底） */
  currentFbProfileUrl?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: BatchDrawerSubmitPayload];
  friendVerifyResult: [payload: FriendVerifyResultPayload];
}>();

const limitOpKind = ref<'increase' | 'decrease'>('increase');
/** 步骤 1 汇率换算行，独立输入 */
const fxUsdStr = ref('');
/** 步骤 2「增加额度」金额，独立输入 */
const increaseUsdStr = ref('');
/** 步骤 2「减少额度」金额，独立输入 */
const decreaseUsdStr = ref('');
const resetMode = ref<'account_zero' | 'delete_restriction' | 'set_absolute'>('account_zero');
const resetAbsoluteUsd = ref('');

const isLimitSpecial = computed(() => props.preset?.entryKey === 'setLimit');
const isResetSpecial = computed(() => props.preset?.entryKey === 'resetLimit');
const isAddBmSpecial = computed(() => props.preset?.entryKey === 'addBm');
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

const primaryPreviewAccount = computed(() => (props.selectedAccountRows && props.selectedAccountRows[0]) || null);

function formatMinorLine(minor: number | undefined, currency: string | undefined): string {
  if (minor == null || Number.isNaN(minor)) return '—';
  const c = (currency || 'USD').trim() || 'USD';
  return `${(minor / 100).toFixed(2)} ${c}`;
}

function displaySpendingCap(row: BatchAccountPreviewRow | null): string {
  if (!row) return '—';
  if (row.spendingLimit && String(row.spendingLimit).trim()) return String(row.spendingLimit);
  return formatMinorLine(row.spendCapMinor, row.currency);
}

function displayBalance(row: BatchAccountPreviewRow | null): string {
  if (!row) return '—';
  if (row.balance && String(row.balance).trim()) return String(row.balance);
  return formatMinorLine(row.balanceMinor, row.currency);
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

const fxComputedLabel = computed(() => {
  const m = parseUsdInputToMinor(fxUsdStr.value);
  if (m == null) return '结果会自动计算';
  return `${(m / 100).toFixed(2)} USD（${m} 最小单位）`;
});

/** 当前选中的「增加/减少」对应的金额文案（与汇率换算无关） */
function activeLimitAmountStr(): string {
  return limitOpKind.value === 'increase' ? increaseUsdStr.value : decreaseUsdStr.value;
}

const limitPreviewText = computed(() => {
  const row = primaryPreviewAccount.value;
  const n = props.selectedAccountIds.length;
  const base = row
    ? `账号: ${row.accountId} 当前额度: ${displaySpendingCap(row)} 剩余额度: ${displayBalance(row)}`
    : `已选 ${n} 个账户` + (n ? `（首条 ID: ${props.selectedAccountIds[0]}）` : '');
  const m = parseUsdInputToMinor(activeLimitAmountStr());
  if (m == null) {
    return `${base}\n请在「操作类型」中填写金额后查看效果说明。`;
  }
  if (limitOpKind.value === 'increase') {
    return `${base}\n将对每个账户在现有 spend_cap 上增加 ${(m / 100).toFixed(2)} USD（不限额时按该金额设为新上限）。`;
  }
  return `${base}\n将对每个账户在现有 spend_cap 上减少 ${(m / 100).toFixed(2)} USD（已不限额则无法减少）。`;
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

const resultRows = computed(() => props.batchResults ?? []);

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

const inputGateOk = computed(() => {
  if (isLimitSpecial.value || isResetSpecial.value) return true;
  if (isAddBmSpecial.value) {
    if (!props.preset?.step1.required) return true;
    return uidsText.value.trim().length > 0;
  }
  if (isRemoveAuthSpecial.value) {
    if (!ui.value.step1.required) return true;
    return uidsText.value.trim().length > 0;
  }
  if (!ui.value.step1.required) return true;
  return uidsText.value.trim().length > 0;
});

const friendPhasePending = computed(() => {
  if (isLimitSpecial.value || isResetSpecial.value || isAddBmSpecial.value || isRemoveAuthSpecial.value) return false;
  if (!ui.value.confirmGates.includes('friend')) return false;
  return friendCheckStatus.value !== 'ok';
});

const confirmDisabled = computed(() => {
  if (!props.preset || !props.selectedAccountIds.length) return true;
  if (props.batchRunning) return true;
  if (friendVerifyRunning.value) return true;
  if (!limitConfirmOk.value) return true;
  if (!resetConfirmOk.value) return true;
  if (!inputGateOk.value) return true;
  return false;
});

const footPrimaryLabel = computed(() => {
  if (props.batchRunning) return '执行中…';
  if (friendVerifyRunning.value) return '检测中…';
  if (friendPhasePending.value) return '检测好友关系';
  return '确定';
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

function resultTargetFieldLabel(r: { resultKind?: string }): string {
  return r.resultKind === 'friend_uid' ? '检测账号' : '广告账户 ID';
}

function currentFbDisplay(r: { currentFbProfileUrl?: string | null }): string {
  const u = (r.currentFbProfileUrl ?? props.currentFbProfileUrl ?? '').trim();
  return u || '—';
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
  drawerTab.value = 'op';
  limitOpKind.value = 'increase';
  fxUsdStr.value = '';
  increaseUsdStr.value = '';
  decreaseUsdStr.value = '';
  resetMode.value = 'account_zero';
  resetAbsoluteUsd.value = '';
  deleteCurrentFbPerm.value = false;
}

watch(
  () => [props.open, props.preset?.entryKey] as const,
  ([isOpen]) => {
    if (isOpen && props.preset) resetForm();
  }
);

watch(selectedOpId, () => {
  emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
  if (friendCheckStatus.value !== 'idle') {
    friendCheckStatus.value = 'idle';
    friendCheckMsg.value = '';
  }
  useDefaultInterval.value = getBatchOperationUi(selectedOpId.value).step3?.defaultChecked ?? true;
});

watch(uidsText, () => {
  const hadProgress = friendCheckStatus.value !== 'idle';
  if (hadProgress) {
    friendCheckStatus.value = 'idle';
    friendCheckMsg.value = '';
  }
  if (hadProgress && getBatchOperationUi(selectedOpId.value).confirmGates.includes('friend')) {
    emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
  }
});

function onBackdropClick() {
  emit('close');
}

async function onConfirm() {
  if (!props.preset || confirmDisabled.value) return;

  if (friendPhasePending.value && ui.value.confirmGates.includes('friend')) {
    if (!uidsText.value.trim()) return;
    friendVerifyRunning.value = true;
    friendCheckMsg.value = '';
    try {
      const r = await verifyFacebookUidsForBatchSite(uidsText.value);
      const rows = mapUidVerifyRowsToFriendBatchResultRows(r.rows, r.currentUserProfileUrl);
      emit('friendVerifyResult', { rows, currentUserProfileUrl: r.currentUserProfileUrl });
      friendCheckStatus.value = r.ok ? 'ok' : 'err';
      friendCheckMsg.value = r.message;
      drawerTab.value = 'result';
    } catch (e: unknown) {
      friendCheckStatus.value = 'err';
      friendCheckMsg.value = e instanceof Error ? e.message : String(e);
      emit('friendVerifyResult', { rows: [], currentUserProfileUrl: null });
    } finally {
      friendVerifyRunning.value = false;
    }
    return;
  }

  const removeAuthLike = isRemoveAuthSpecial.value;
  const payload: BatchDrawerSubmitPayload = {
    entryKey: removeAuthLike ? 'removeAuth' : props.preset.entryKey,
    operationId: selectedOpId.value,
    subId:
      (isAddBmSpecial.value && (props.preset.subOptions?.length ?? 0) > 0) || showSubDropdown.value
        ? selectedSubId.value
        : undefined,
    uidsText: uidsText.value.trim(),
    useDefaultInterval: useDefaultInterval.value,
    friendCheckOk: !ui.value.confirmGates.includes('friend') || friendCheckStatus.value === 'ok',
    selectedAccountIds: [...props.selectedAccountIds],
  };
  if (props.preset.entryKey === 'setLimit') {
    const minor = parseUsdInputToMinor(activeLimitAmountStr());
    if (minor == null || minor <= 0) return;
    payload.spendLimitForm = {
      kind: limitOpKind.value,
      amountMinor: minor,
    };
    payload.uidsText = '';
  } else if (props.preset.entryKey === 'resetLimit') {
    const mode = resetMode.value;
    payload.resetLimitForm = { mode };
    if (mode === 'set_absolute') {
      const cap = parseUsdToMinorAllowZero(resetAbsoluteUsd.value);
      if (cap == null) return;
      payload.resetLimitForm.amountMinor = cap;
    }
    payload.uidsText = '';
  } else if (removeAuthLike) {
    payload.friendCheckOk = true;
    payload.removeAuthForm = { deleteCurrentFacebookPerm: deleteCurrentFbPerm.value };
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
            <p v-if="batchRunning" class="bod-batch-running muted">正在通过 Graph 执行批量操作…</p>

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
                    <div class="bod-step-label">当前账号</div>
                    <p class="bod-limit-line">
                      当前账号:
                      {{ primaryPreviewAccount?.accountId || selectedAccountIds[0] || '—' }}
                      <span v-if="selectedAccountIds.length > 1" class="muted small">
                        （共 {{ selectedAccountIds.length }} 个，将逐户执行相同规则）
                      </span>
                    </p>
                    <p class="bod-limit-line">当前额度: {{ displaySpendingCap(primaryPreviewAccount) }}</p>
                    <p class="bod-limit-line">剩余额度: {{ displayBalance(primaryPreviewAccount) }}</p>
                    <div class="bod-fx-row">
                      <span class="bod-fx-label">汇率换算:</span>
                      <span class="bod-fx-part"
                        >USD:
                        <input v-model="fxUsdStr" type="text" class="bod-limit-input" placeholder="请输入 USD"
                      /></span>
                      <span class="bod-fx-eq">= USD:</span>
                      <span class="bod-fx-result muted">{{ fxComputedLabel }}</span>
                    </div>
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
                        <span class="muted small">新限额（USD，将写入 spend_cap 最小单位）</span>
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
            <div v-else-if="isAddBmSpecial" class="bod-batch-op-root bod-remove-auth-root">
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
          </template>

          <template v-else>
            <template v-if="batchRunning && !resultRows.length">
              <p class="bod-result-empty muted">正在执行，请稍候…</p>
            </template>
            <template v-else-if="!resultRows.length">
              <p v-if="friendCheckMsg" class="bod-result-summary muted">{{
                stripSquareBracketAnnotations(friendCheckMsg)
              }}</p>
              <p v-else class="bod-result-empty muted">暂无结果：检测或批量执行后将在此以卡片展示。</p>
            </template>
            <div v-else class="bod-result-cards">
              <article
                v-for="(r, idx) in resultRows"
                :key="`${r.accountId}-${idx}-${r.resultKind || 'ad'}`"
                class="bod-result-card"
              >
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">状态</span>
                  <span
                    class="bod-result-badge"
                    :class="r.status === '成功' ? 'bod-result-badge--ok' : 'bod-result-badge--err'"
                  >
                    {{ r.status }}
                  </span>
                </div>
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">{{ resultTargetFieldLabel(r) }}</span>
                  <span class="bod-result-card-v mono bod-result-wrap">{{ r.accountId }}</span>
                </div>
                <div class="bod-result-card-row">
                  <span class="bod-result-card-k">当前账号</span>
                  <span class="bod-result-card-v bod-result-wrap">{{ currentFbDisplay(r) }}</span>
                </div>
                <div class="bod-result-card-row bod-result-card-row--detail">
                  <span class="bod-result-card-k">返回信息</span>
                  <span class="bod-result-card-v bod-result-wrap">{{ r.detail }}</span>
                </div>
              </article>
            </div>
          </template>
        </div>

        <div class="bod-batch-foot">
          <button
            type="button"
            class="bod-btn-confirm"
            :class="{ 'bod-btn-confirm--busy': batchRunning || friendVerifyRunning }"
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
  overflow: auto;
  padding: 16px 18px;
  min-height: 0;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(60vh, 520px);
  overflow: auto;
  padding: 4px 0 8px;
}
.bod-result-card {
  border: 1px solid var(--fb-border, #4b5563);
  border-radius: 8px;
  background: var(--fb-modal-input-bg, #2d2d2d);
  padding: 12px 14px;
  font-size: 13px;
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
.bod-fx-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 10px;
  font-size: 13px;
}
.bod-fx-label {
  color: var(--fb-muted, #9ca3af);
}
.bod-fx-part {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bod-fx-eq {
  color: var(--fb-muted, #9ca3af);
}
.bod-fx-result {
  flex: 1;
  min-width: 140px;
  font-size: 12px;
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
</style>
