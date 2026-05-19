<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import type { PixelDrawerKind, PixelDrawerPreset, PixelDrawerSubmitPayload, PixelDrawerContext } from '../lib/pixelOperationTypes';
import type { PixelBmOption, PixelChecklistItem, PixelOpResultRow } from '../../../utils/fb/pixel/graphPixelBatchOperations';
import {
  executePixelDrawerFromSite,
  fetchPixelBmListFromSite,
  fetchPixelDrawerTargetsFromSite,
} from '../lib/pixelOperationsBridge';

const props = defineProps<{
  open: boolean;
  preset: PixelDrawerPreset | null;
  /** 删除类：来自勾选行 */
  context: PixelDrawerContext | null;
}>();

const emit = defineEmits<{
  close: [];
  completed: [];
}>();

const drawerTab = ref<'op' | 'result'>('op');
const running = ref(false);
const loadStep2 = ref(false);
const step2Error = ref('');

const businesses = ref<PixelBmOption[]>([]);
const selectedBmId = ref('');
const namePrefix = ref('Pixel');
const pixelCount = ref(1);
const useDefaultInterval = ref(true);

const checklist = ref<PixelChecklistItem[]>([]);
const checkedIds = ref<Record<string, boolean>>({});
const listSearch = ref('');

const results = ref<PixelOpResultRow[]>([]);

const isCreate = computed(() => props.preset?.kind === 'batch_create');
const isListStep = computed(() => !isCreate.value);
const isDelete = computed(() => {
  const k = props.preset?.kind;
  return k === 'delete_ad_account' || k === 'delete_partner' || k === 'delete_admin';
});

const filteredChecklist = computed(() => {
  const q = listSearch.value.trim().toLowerCase();
  if (!q) return checklist.value;
  const tokens = q.split(/[\s,，]+/).filter(Boolean);
  return checklist.value.filter((item) => {
    const blob = `${item.id} ${item.label}`.toLowerCase();
    return tokens.every((t) => blob.includes(t));
  });
});

const selectedCheckCount = computed(
  () => Object.entries(checkedIds.value).filter(([, v]) => v).length
);

const allFilteredChecked = computed(() => {
  const list = filteredChecklist.value;
  if (!list.length) return false;
  return list.every((item) => checkedIds.value[item.id]);
});

const confirmDisabled = computed(() => {
  if (running.value) return true;
  if (!props.preset) return true;
  if (isCreate.value) {
    if (!selectedBmId.value) return true;
    if (!namePrefix.value.trim()) return true;
    if (!pixelCount.value || pixelCount.value < 1 || pixelCount.value > 100) return true;
    return false;
  }
  const any = Object.values(checkedIds.value).some(Boolean);
  return !any;
});

const confirmDanger = computed(() => isDelete.value);

async function loadBusinesses() {
  businesses.value = [];
  try {
    businesses.value = await fetchPixelBmListFromSite();
    if (!selectedBmId.value && businesses.value.length) {
      selectedBmId.value = businesses.value[0].id;
    }
  } catch (e: unknown) {
    step2Error.value = e instanceof Error ? e.message : String(e);
  }
}

async function loadListTargets() {
  if (!props.preset || !props.context) return;
  loadStep2.value = true;
  step2Error.value = '';
  checklist.value = [];
  checkedIds.value = {};
  listSearch.value = '';
  try {
    checklist.value = await fetchPixelDrawerTargetsFromSite(
      props.preset.kind,
      props.context.pixelId,
      props.context.bmId
    );
  } catch (e: unknown) {
    step2Error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loadStep2.value = false;
  }
}

function toggleSelectAllFiltered() {
  const next = !allFilteredChecked.value;
  const patch = { ...checkedIds.value };
  for (const item of filteredChecklist.value) {
    patch[item.id] = next;
  }
  checkedIds.value = patch;
}

function resetForm() {
  drawerTab.value = 'op';
  running.value = false;
  loadStep2.value = false;
  step2Error.value = '';
  results.value = [];
  namePrefix.value = 'Pixel';
  pixelCount.value = 1;
  useDefaultInterval.value = true;
  checklist.value = [];
  checkedIds.value = {};
  listSearch.value = '';
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetForm();
      return;
    }
    resetForm();
    if (props.preset?.kind === 'batch_create') {
      void loadBusinesses();
    } else if (props.context) {
      void loadListTargets();
    }
  }
);

watch(
  () => props.preset?.kind,
  () => {
    if (props.open && props.preset?.kind === 'batch_create') void loadBusinesses();
    else if (props.open && props.context) void loadListTargets();
  }
);

function toggleCheck(id: string) {
  checkedIds.value = { ...checkedIds.value, [id]: !checkedIds.value[id] };
}

function selectedTargetIds(): string[] {
  return Object.entries(checkedIds.value)
    .filter(([, v]) => v)
    .map(([id]) => id);
}

async function onConfirm() {
  if (!props.preset || confirmDisabled.value) return;
  running.value = true;
  step2Error.value = '';
  try {
    const payload: PixelDrawerSubmitPayload = {
      kind: props.preset.kind,
      bmId: isCreate.value ? selectedBmId.value : props.context!.bmId,
      bmName: isCreate.value
        ? businesses.value.find((b) => b.id === selectedBmId.value)?.name
        : props.context?.bmName,
      pixelId: props.context?.pixelId || '',
      pixelName: props.context?.pixelName,
      namePrefix: namePrefix.value.trim(),
      count: pixelCount.value,
      selectedTargetIds: selectedTargetIds(),
      useDefaultInterval: useDefaultInterval.value,
    };
    results.value = await executePixelDrawerFromSite(payload);
    drawerTab.value = 'result';
    emit('completed');
  } catch (e: unknown) {
    step2Error.value = e instanceof Error ? e.message : String(e);
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pod-drawer" appear>
      <div v-if="open" class="pod-tele">
        <div class="pod-backdrop" @click.self="emit('close')"></div>
        <aside v-if="preset" class="pod-panel" role="dialog" aria-modal="true">
          <div class="pod-head">
            <h3 class="pod-title">{{ preset.headerTitle }}</h3>
            <div class="pod-head-end">
              <div class="pod-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  class="pod-tab"
                  :class="{ on: drawerTab === 'op' }"
                  @click="drawerTab = 'op'"
                >
                  操作
                </button>
                <button
                  type="button"
                  role="tab"
                  class="pod-tab"
                  :class="{ on: drawerTab === 'result' }"
                  @click="drawerTab = 'result'"
                >
                  结果
                </button>
              </div>
              <button type="button" class="pod-close" aria-label="关闭" @click="emit('close')">×</button>
            </div>
          </div>

          <div class="pod-body pod-drawer-scroll">
            <template v-if="drawerTab === 'op'">
              <p v-if="running" class="pod-running muted">正在通过 Graph 执行…</p>
              <p v-if="step2Error" class="pod-error">{{ step2Error }}</p>

              <div class="pod-steps">
                <div class="pod-step-line" aria-hidden="true"></div>

                <div class="pod-step">
                  <span class="pod-step-badge">1</span>
                  <div class="pod-step-body">
                    <div class="pod-step-label">使用须知</div>
                    <p class="pod-notice pod-notice--pre">{{ preset.step1Notice }}</p>
                  </div>
                </div>

                <template v-if="isCreate">
                  <div class="pod-step">
                    <span class="pod-step-badge">2</span>
                    <div class="pod-step-body">
                      <div class="pod-step-label">{{ preset.step2Label }}</div>
                      <p v-if="preset.step2Hint" class="pod-hint muted small">{{ preset.step2Hint }}</p>
                      <div v-if="!businesses.length && !step2Error" class="muted small">正在加载 BM 列表…</div>
                      <div class="pod-radio-stack">
                        <label v-for="b in businesses" :key="b.id" class="pod-radio-row">
                          <input v-model="selectedBmId" type="radio" :value="b.id" />
                          <span>{{ b.id }}<template v-if="b.name"> ({{ b.name }})</template></span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="pod-step">
                    <span class="pod-step-badge">3</span>
                    <div class="pod-step-body">
                      <div class="pod-step-label">输入像素名称</div>
                      <input
                        v-model="namePrefix"
                        type="text"
                        class="pod-input"
                        placeholder="如 Pixel，则系统以 Pixel1, Pixel2 自动命名"
                      />
                    </div>
                  </div>
                  <div class="pod-step">
                    <span class="pod-step-badge">4</span>
                    <div class="pod-step-body">
                      <div class="pod-step-label">输入像素数量</div>
                      <input
                        v-model.number="pixelCount"
                        type="number"
                        min="1"
                        max="100"
                        class="pod-input"
                        placeholder="不能超过100"
                      />
                    </div>
                  </div>
                </template>

                <template v-else-if="isListStep">
                  <div class="pod-step">
                    <span class="pod-step-badge">2</span>
                    <div class="pod-step-body">
                      <div class="pod-step-label">{{ preset.step2Label }}</div>
                      <p v-if="preset.step2Hint" class="pod-hint muted small">{{ preset.step2Hint }}</p>
                      <p v-if="loadStep2" class="muted small">正在从 Facebook 加载…</p>
                      <template v-else-if="checklist.length">
                        <div class="pod-list-toolbar">
                          <div class="pod-search-wrap">
                            <svg class="pod-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                              <circle cx="11" cy="11" r="7"></circle>
                              <path d="M20 20l-4-4"></path>
                            </svg>
                            <input
                              v-model="listSearch"
                              type="search"
                              class="pod-search-input"
                              placeholder="搜索ID或名称（支持多关键词：空格/逗号分隔）"
                            />
                          </div>
                          <div class="pod-list-meta">
                            <label class="pod-check pod-check--inline">
                              <input type="checkbox" :checked="allFilteredChecked" @change="toggleSelectAllFiltered" />
                              <span>全选</span>
                            </label>
                            <span class="muted small">已选 {{ selectedCheckCount }} / 全部 {{ checklist.length }}</span>
                          </div>
                        </div>
                        <p v-if="!filteredChecklist.length" class="muted small">无匹配项</p>
                        <div v-else class="pod-checklist">
                          <label v-for="item in filteredChecklist" :key="item.id" class="pod-check-row">
                            <input
                              type="checkbox"
                              :checked="!!checkedIds[item.id]"
                              @change="toggleCheck(item.id)"
                            />
                            <span class="pod-check-label">{{ item.label }}</span>
                          </label>
                        </div>
                      </template>
                      <p v-else-if="!step2Error" class="muted small">{{ isDelete ? '暂无可删除项' : '暂无可选项' }}</p>
                    </div>
                  </div>
                </template>

                <div class="pod-step">
                  <span class="pod-step-badge">{{ isCreate ? 5 : 3 }}</span>
                  <div class="pod-step-body">
                    <label class="pod-check">
                      <input v-model="useDefaultInterval" type="checkbox" />
                      <span>系统默认执行时间间隔</span>
                    </label>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <p v-if="!results.length" class="muted">尚未执行操作</p>
              <div v-else class="pod-result-list">
                <div
                  v-for="(row, idx) in results"
                  :key="`${row.targetId}-${idx}`"
                  class="pod-result-card"
                >
                  <div class="pod-result-row">
                    <span class="pod-result-k">对象</span>
                    <span class="pod-result-v mono">{{ row.targetId }}</span>
                  </div>
                  <div class="pod-result-row">
                    <span class="pod-result-k">状态</span>
                    <span
                      class="pod-result-badge"
                      :class="row.status === '成功' ? 'pod-result-badge--ok' : 'pod-result-badge--err'"
                      >{{ row.status }}</span
                    >
                  </div>
                  <div class="pod-result-row pod-result-row--detail">
                    <span class="pod-result-k">详情</span>
                    <span class="pod-result-v">{{ row.detail }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="pod-foot">
            <button
              type="button"
              class="pod-btn-confirm"
              :class="{ 'pod-btn-confirm--danger': confirmDanger }"
              :disabled="drawerTab === 'result' ? false : confirmDisabled"
              @click="drawerTab === 'result' ? emit('close') : onConfirm()"
            >
              <svg
                v-if="drawerTab === 'op'"
                class="pod-lock-ico"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V12a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z"
                />
              </svg>
              {{ drawerTab === 'result' ? '关闭' : running ? '执行中…' : '确定' }}
            </button>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pod-tele {
  position: fixed;
  inset: 0;
  z-index: 2499;
  pointer-events: none;
}
.pod-tele .pod-backdrop,
.pod-tele .pod-panel {
  pointer-events: auto;
}
.pod-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2500;
  opacity: 1;
}
.pod-panel {
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
  will-change: transform;
}
.pod-drawer-enter-active .pod-panel,
.pod-drawer-leave-active .pod-panel {
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.pod-drawer-enter-active .pod-backdrop,
.pod-drawer-leave-active .pod-backdrop {
  transition: opacity 0.28s ease;
}
.pod-drawer-enter-from .pod-panel,
.pod-drawer-leave-to .pod-panel {
  transform: translateX(100%);
}
.pod-drawer-enter-to .pod-panel,
.pod-drawer-leave-from .pod-panel {
  transform: translateX(0);
}
.pod-drawer-enter-from .pod-backdrop,
.pod-drawer-leave-to .pod-backdrop {
  opacity: 0;
}
.pod-drawer-enter-to .pod-backdrop,
.pod-drawer-leave-from .pod-backdrop {
  opacity: 1;
}
.pod-head {
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--fb-border, #3c3c3c);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.pod-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
}
.pod-head-end {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.pod-tabs {
  display: inline-flex;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--fb-border, #4b5563);
}
.pod-tab {
  border: none;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--fb-surface-a, #1e1e1e);
  color: var(--fb-muted, #9ca3af);
}
.pod-tab.on {
  background: #1877f2;
  color: #fff;
}
.pod-close {
  border: none;
  background: transparent;
  color: var(--fb-muted, #9ca3af);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.pod-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
}
.pod-drawer-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
}
.pod-drawer-scroll::-webkit-scrollbar {
  width: 6px;
}
.pod-drawer-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}
.pod-running {
  margin: 0 0 12px;
  font-size: 12px;
}
.pod-error {
  margin: 0 0 12px;
  font-size: 12px;
  color: #f87171;
}
.pod-steps {
  position: relative;
  margin-top: 8px;
  padding-left: 40px;
  --pod-step-rail-x: 11px;
}
.pod-step-line {
  position: absolute;
  left: var(--pod-step-rail-x);
  top: 14px;
  bottom: 14px;
  width: 1px;
  transform: translateX(-50%);
  background: var(--fb-border, #4b5563);
}
.pod-step {
  position: relative;
  display: flex;
  gap: 22px;
  margin-bottom: 22px;
}
.pod-step:last-child {
  margin-bottom: 0;
}
.pod-step-badge {
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
.pod-step-body {
  flex: 1;
  min-width: 0;
  padding-left: 10px;
}
.pod-step-label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  line-height: 1.45;
  color: var(--fb-modal-text, #e5e7eb);
}
.pod-notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  font-size: 12px;
  line-height: 1.5;
  color: var(--fb-muted, #9ca3af);
}
.pod-notice--pre {
  white-space: pre-line;
}
.pod-list-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}
.pod-search-wrap {
  position: relative;
}
.pod-search-ico {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fb-muted, #9ca3af);
  pointer-events: none;
}
.pod-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px 9px 34px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #2d2d2d);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
}
.pod-search-input:focus {
  outline: none;
  border-color: #1877f2;
}
.pod-list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pod-check--inline {
  margin: 0;
}
.pod-check-label {
  color: var(--fb-link, #93c5fd);
  word-break: break-all;
}
.pod-hint {
  margin: -4px 0 10px;
}
.pod-input {
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
.pod-input:focus {
  outline: none;
  border-color: #1877f2;
}
.pod-radio-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}
.pod-radio-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1.4;
}
.pod-radio-row input {
  margin-top: 2px;
  accent-color: #1877f2;
}
.pod-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}
.pod-check-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1.4;
}
.pod-check-row input {
  margin-top: 2px;
  accent-color: #1877f2;
}
.pod-check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  cursor: pointer;
}
.pod-check input {
  width: 16px;
  height: 16px;
  accent-color: #1877f2;
}
.pod-foot {
  padding: 14px 18px 18px;
  border-top: 1px solid var(--fb-border, #3c3c3c);
  flex-shrink: 0;
}
.pod-btn-confirm {
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
.pod-btn-confirm--danger {
  background: #c0392b;
}
.pod-btn-confirm:hover:not(:disabled) {
  filter: brightness(1.05);
}
.pod-btn-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pod-lock-ico {
  flex-shrink: 0;
}
.pod-result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pod-result-card {
  border: 1px solid var(--fb-border, #4b5563);
  border-radius: 8px;
  background: var(--fb-modal-input-bg, #2d2d2d);
  padding: 12px 14px;
  font-size: 13px;
}
.pod-result-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
}
.pod-result-row:last-child {
  border-bottom: none;
}
.pod-result-row--detail {
  flex-direction: column;
  align-items: stretch;
}
.pod-result-k {
  color: var(--fb-muted, #9ca3af);
  flex-shrink: 0;
}
.pod-result-v {
  text-align: right;
  word-break: break-word;
}
.pod-result-row--detail .pod-result-v {
  text-align: left;
}
.pod-result-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.pod-result-badge--ok {
  background: rgba(74, 222, 128, 0.16);
  color: #4ade80;
}
.pod-result-badge--err {
  background: rgba(248, 113, 113, 0.16);
  color: #f87171;
}
.mono {
  font-family: ui-monospace, monospace;
}
.muted {
  color: var(--fb-muted, #9ca3af);
}
.small {
  font-size: 11px;
}
</style>
