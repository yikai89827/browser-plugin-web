<script lang="ts" setup>
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  collectPixelSharesFromActiveFacebookTab,
  fetchPixelSharesFromExtension,
  mergePixelShareInExtension,
  syncPixelSharesFromGraphViaExtension,
} from '../lib/extensionBridge';
import { fbControlLog } from '../../../utils/fbControlLog';
import ExtensionMenuGate from '../components/ExtensionMenuGate.vue';
import PixelOperationDrawer from '../components/PixelOperationDrawer.vue';
import {
  getPixelDrawerPreset,
  pixelDrawerContextFromRows,
  type PixelDrawerContext,
  type PixelDrawerKind,
} from '../lib/pixelOperationTypes';
import { isPixelSelfOwnedInBm } from '../lib/pixelShareDisplay';
import {
  fetchPixelRelationCountFromSite,
  type PixelRelationCountKind,
} from '../lib/pixelOperationsBridge';
import {
  markPixelListFetched,
  pixelsShellExtensionReady,
  registerPixelsGraphSync,
  unregisterPixelsGraphSync,
} from '../lib/pixelListSyncHub';

const COL_COUNT = 16;
const COLLECT_MODE_KEY = 'fb_pixel_share_collect_mode';

type PixelSortKey = 'pixelName' | 'bmName' | 'ownerName' | 'capturedAt' | 'role' | 'activeTime' | '';

function loadSavedCollectMode(): 'all_pixels' | 'bm_id' {
  try {
    const v = localStorage.getItem(COLLECT_MODE_KEY);
    if (v === 'bm_id' || v === 'all_pixels') return v;
  } catch {
    /* ignore */
  }
  return 'all_pixels';
}

const rows = ref<FbPixelShareRecord[]>([]);
/** 输入框草稿；点击搜索或回车后写入 searchQuery 才过滤表格 */
const searchInput = ref('');
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');

const currentPage = ref(1);
const pageSize = ref(10);

const selectedIds = ref<Record<string, boolean>>({});

const sortCol = ref<PixelSortKey>('');
const sortDir = ref<'asc' | 'desc'>('asc');

const settingsWrapRef = ref<HTMLElement | null>(null);
const settingsOpen = ref(false);
const savedCollectMode = ref<'all_pixels' | 'bm_id'>(loadSavedCollectMode());
const settingsDraftMode = ref<'all_pixels' | 'bm_id'>(savedCollectMode.value);
const batchSettingsWrapRef = ref<HTMLElement | null>(null);

const remarkModalRow = ref<FbPixelShareRecord | null>(null);
const remarkDraft = ref('');

type PixelCountCellState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  count?: number;
};

const pixelCountCells = reactive<Record<string, PixelCountCellState>>({});

function pixelCountKey(rowId: string, kind: PixelRelationCountKind) {
  return `${rowId}:${kind}`;
}

function getPixelCountCell(rowId: string, kind: PixelRelationCountKind): PixelCountCellState {
  return pixelCountCells[pixelCountKey(rowId, kind)] ?? { status: 'idle' };
}

const pixelDrawerOpen = ref(false);
const pixelDrawerKind = ref<PixelDrawerKind>('batch_create');
const pixelDrawerContext = ref<PixelDrawerContext | null>(null);

const pixelDrawerPreset = computed(() => getPixelDrawerPreset(pixelDrawerKind.value, pixelDrawerContext.value));

const selectedRows = computed(() => sortedFiltered.value.filter((r) => selectedIds.value[r.id]));

function dash(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function remarkDisplay(row: FbPixelShareRecord): string {
  return row.remark ?? '';
}

async function toggleFavorite(row: FbPixelShareRecord) {
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }
  const next = !row.favorite;
  try {
    await mergePixelShareInExtension({ id: row.id, favorite: next });
    row.favorite = next;
    fbControlLog('site:pixel-page', '切换像素收藏（IndexedDB）', { id: row.id, favorite: next });
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  }
}

function sortMark(key: Exclude<PixelSortKey, ''>): 'none' | 'asc' | 'desc' {
  if (sortCol.value !== key) return 'none';
  return sortDir.value;
}

function sortToggle(key: Exclude<PixelSortKey, ''>) {
  if (sortCol.value !== key) {
    sortCol.value = key;
    sortDir.value = 'asc';
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc';
  } else {
    sortCol.value = '';
  }
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) => {
    const blob = [
      r.pixelName,
      r.pixelId,
      r.bmName,
      r.bmId,
      r.ownerName,
      r.ownerId,
      r.role,
      r.activeTime,
      remarkDisplay(r),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
});

function getSortable(row: FbPixelShareRecord, key: Exclude<PixelSortKey, ''>): string | number {
  switch (key) {
    case 'pixelName':
      return (row.pixelName || '').toLowerCase();
    case 'bmName':
      return (row.bmName || '').toLowerCase();
    case 'ownerName':
      return (row.ownerName || '').toLowerCase();
    case 'role':
      return (row.role || '').toLowerCase();
    case 'capturedAt':
      return row.capturedAt || 0;
    case 'activeTime':
      return row.activeTime || '';
    default:
      return '';
  }
}

function compareRows(a: FbPixelShareRecord, b: FbPixelShareRecord, key: Exclude<PixelSortKey, ''>, dir: 1 | -1): number {
  const va = getSortable(a, key);
  const vb = getSortable(b, key);
  if (typeof va === 'number' && typeof vb === 'number') {
    if (Object.is(va, vb)) return 0;
    return va < vb ? -dir : dir;
  }
  const cmp = String(va).localeCompare(String(vb), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  if (cmp === 0) return 0;
  return cmp > 0 ? dir : -dir;
}

const sortedFiltered = computed(() => {
  const list = [...filtered.value];
  const key = sortCol.value;
  if (!key) return list;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const p = compareRows(a, b, key, dir);
    if (p !== 0) return p;
    return String(a.id).localeCompare(String(b.id));
  });
  return list;
});

const totalPages = computed(() => Math.max(1, Math.ceil(sortedFiltered.value.length / pageSize.value) || 1));

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedFiltered.value.slice(start, start + pageSize.value);
});

function runPixelSearch() {
  searchQuery.value = searchInput.value.trim();
  currentPage.value = 1;
  errorMsg.value = '';
  fbControlLog('site:pixel-page', '执行搜索', { q: searchQuery.value || '(全部)' });
}

function onSearchInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    runPixelSearch();
  }
}

watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

watch(pageSize, () => {
  currentPage.value = 1;
});

watch(sortCol, () => {
  currentPage.value = 1;
});

const selectedCount = computed(
  () => sortedFiltered.value.filter((r) => selectedIds.value[r.id]).length
);

const allFilteredSelected = computed(() => {
  if (!sortedFiltered.value.length) return false;
  return sortedFiltered.value.every((r) => selectedIds.value[r.id]);
});

function toggleRowSelected(id: string) {
  selectedIds.value = { ...selectedIds.value, [id]: !selectedIds.value[id] };
}

function toggleSelectAll(checked: boolean) {
  const next: Record<string, boolean> = { ...selectedIds.value };
  for (const row of sortedFiltered.value) {
    next[row.id] = checked;
  }
  selectedIds.value = next;
}

function rowSerial(idx: number) {
  return (currentPage.value - 1) * pageSize.value + idx + 1;
}

async function copyBmLine(row: FbPixelShareRecord) {
  const text = [row.bmName, row.bmId].filter(Boolean).join('\t') || row.bmId || row.bmName || '';
  if (!text) {
    errorMsg.value = '没有可复制的内容';
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    errorMsg.value = '';
    fbControlLog('site:pixel-page', '已复制 BM 信息', { id: row.id });
  } catch {
    errorMsg.value = '复制失败，请检查浏览器权限';
  }
}

function shareCellClass(ok?: boolean) {
  if (ok === true) return 'share-ico share-ico--ok';
  if (ok === false) return 'share-ico share-ico--bad';
  return 'share-ico share-ico--na';
}

/** 参考插件：分享 / BM分享 仅在本 BM 自有（所属 BM = 业主 BM）时为 ✓ */
function sharePermissionMark(row: FbPixelShareRecord) {
  return isPixelSelfOwnedInBm(row) ? '✓' : '✗';
}

function sharePermissionTip(row: FbPixelShareRecord) {
  if (isPixelSelfOwnedInBm(row)) {
    return '本 BM 自有像素（所属 BM 与业主 ID 一致），可进行 BM 间分享';
  }
  const bm = row.bmId || '—';
  const owner = row.ownerId || '—';
  return `非本 BM 创建：所属 BM ${bm} ≠ 业主 ${owner}（通常为在他方 BM 资产下仅有管理员权限）`;
}

const selectedCanBmShare = computed(() => {
  if (selectedRows.value.length !== 1) return false;
  return isPixelSelfOwnedInBm(selectedRows.value[0]);
});

async function loadPixelRelationCount(row: FbPixelShareRecord, kind: PixelRelationCountKind) {
  const key = pixelCountKey(row.id, kind);
  const cur = pixelCountCells[key];
  if (cur?.status === 'loading') return;

  const pixelId = row.pixelId?.trim() || '';
  const bmId = row.bmId?.trim() || '';
  if (!pixelId || !bmId) {
    pixelCountCells[key] = { status: 'error', count: 0 };
    errorMsg.value = '该行缺少像素 ID 或 BM ID，无法拉取数量';
    return;
  }

  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }

  pixelCountCells[key] = { status: 'loading' };
  errorMsg.value = '';
  fbControlLog('site:pixel-page', '拉取像素关联数量', { kind, pixelId, bmId });
  try {
    const count = await fetchPixelRelationCountFromSite(kind, pixelId, bmId);
    pixelCountCells[key] = { status: 'loaded', count };
  } catch (e: unknown) {
    pixelCountCells[key] = { status: 'error', count: 0 };
    errorMsg.value = e instanceof Error ? e.message : String(e);
  }
}

function onPixelCountClick(row: FbPixelShareRecord, kind: PixelRelationCountKind) {
  const cell = getPixelCountCell(row.id, kind);
  if (cell.status === 'loaded') return;
  void loadPixelRelationCount(row, kind);
}

function onPixelCountRefresh(row: FbPixelShareRecord, kind: PixelRelationCountKind) {
  void loadPixelRelationCount(row, kind);
}

const pixelCountColumnDefs: { kind: PixelRelationCountKind; label: string }[] = [
  { kind: 'ad_account', label: '广告账号' },
  { kind: 'admin', label: '管理员' },
  { kind: 'partner', label: '合作伙伴' },
];

function openRemarkModal(row: FbPixelShareRecord) {
  remarkModalRow.value = row;
  remarkDraft.value = remarkDisplay(row);
}

function closeRemarkModal() {
  remarkModalRow.value = null;
  remarkDraft.value = '';
}

async function saveRemarkModal() {
  if (!remarkModalRow.value) return;
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }
  const row = remarkModalRow.value;
  const text = remarkDraft.value.trim();
  try {
    await mergePixelShareInExtension({ id: row.id, remark: text });
    row.remark = text || undefined;
    errorMsg.value = '';
    closeRemarkModal();
    fbControlLog('site:pixel-page', '备注已写入 IndexedDB', { id: row.id });
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  }
}

function batchPlaceholder(action: string) {
  if (action !== '筛选' && !selectedCount.value) {
    errorMsg.value = '请先在表格中勾选至少一行';
    return;
  }
  errorMsg.value = '';
  fbControlLog('site:pixel-page', `批量操作（待接入）：${action}`, { selected: selectedCount.value });
  errorMsg.value = `「${action}」待对接，已记录操作意图`;
}

function openPixelDrawer(kind: PixelDrawerKind) {
  errorMsg.value = '';
  if (kind !== 'batch_create') {
    if (selectedRows.value.length !== 1) {
      errorMsg.value = '请仅勾选一行像素后再操作';
      return;
    }
    if (kind === 'share_between_bm' && !isPixelSelfOwnedInBm(selectedRows.value[0])) {
      errorMsg.value =
        '仅支持对本 BM 自有的像素做 BM 间分享（表格「分享」「BM分享」须为 ✓，即所属 BM 与业主 ID 一致）';
      return;
    }
    const ctx = pixelDrawerContextFromRows(selectedRows.value);
    if (!ctx) {
      errorMsg.value = '所选行需包含有效的 BM ID 与像素 ID';
      return;
    }
    pixelDrawerContext.value = ctx;
  } else {
    pixelDrawerContext.value = null;
  }
  pixelDrawerKind.value = kind;
  pixelDrawerOpen.value = true;
}

function closePixelDrawer() {
  pixelDrawerOpen.value = false;
}

async function onPixelDrawerCompleted() {
  await syncFromGraph();
}

function toggleSettingsPopover() {
  settingsOpen.value = !settingsOpen.value;
  if (settingsOpen.value) {
    settingsDraftMode.value = savedCollectMode.value;
  }
}

function savePixelSettings() {
  savedCollectMode.value = settingsDraftMode.value;
  try {
    localStorage.setItem(COLLECT_MODE_KEY, savedCollectMode.value);
  } catch {
    /* ignore */
  }
  settingsOpen.value = false;
  fbControlLog('site:pixel-page', '已保存像素采集设置', { mode: savedCollectMode.value });
}

function onGlobalPointerDown(ev: PointerEvent) {
  if (!settingsOpen.value) return;
  const t = ev.target as Node;
  const b = batchSettingsWrapRef.value;
  if (b && b.contains(t)) return;
  settingsOpen.value = false;
}

/** 从扩展 IndexedDB 读取缓存（不请求 Graph） */
async function loadFromExtensionCache() {
  errorMsg.value = '';
  loading.value = true;
  fbControlLog('site:pixel-page', '从扩展 IndexedDB 读取像素缓存');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID');
    }
    const res = await fetchPixelSharesFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    rows.value = [...(res.payload?.list || [])].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    if (rows.value.length) {
      markPixelListFetched();
    }
    fbControlLog('site:pixel-page', '像素缓存已加载', { count: rows.value.length });
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/** 顶栏「更新」：Graph 同步写入 IndexedDB 后再读缓存 */
async function syncFromGraph() {
  errorMsg.value = '';
  loading.value = true;
  fbControlLog('site:pixel-page', '请求扩展执行 Graph 同步像素');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID');
    }
    const syncRes = await syncPixelSharesFromGraphViaExtension({ mode: savedCollectMode.value });
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Graph 同步像素失败');
    }
    fbControlLog('site:pixel-page', 'Graph 同步像素完成', syncRes.payload);

    if (!syncRes.payload?.total) {
      try {
        await collectPixelSharesFromActiveFacebookTab({ mode: savedCollectMode.value });
      } catch (e: unknown) {
        fbControlLog(
          'site:pixel-page',
          'Graph 无数据，活动页 DOM 回退失败（需 Facebook 标签在前台）',
          e instanceof Error ? e.message : e
        );
      }
    }

    await loadFromExtensionCache();
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
    loading.value = false;
  }
}

function onExtensionMenuReady() {
  pixelsShellExtensionReady.value = true;
  fbControlLog('site:pixel-page', '扩展已连通，加载像素本地缓存');
  void loadFromExtensionCache();
}

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown, true);
  registerPixelsGraphSync(syncFromGraph);
  fbControlLog('site:pixel-page', '页面挂载，已注册 Graph 更新');
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true);
  unregisterPixelsGraphSync();
  pixelsShellExtensionReady.value = false;
});
</script>

<template>
  <ExtensionMenuGate @ready="onExtensionMenuReady">
    <div class="fb-page">
      <p v-if="loading" class="sync-hint muted">正在加载…</p>

      <div class="search-actions-row">
        <div class="search-cluster search-row search-row--flex">
          <input
            v-model="searchInput"
            class="search-input"
            type="search"
            placeholder="搜索：像素ID或BM ID"
            @keydown="onSearchInputKeydown"
          />
          <button type="button" class="btn-search" title="搜索" @click="runPixelSearch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M20 20l-4-4"></path>
            </svg>
          </button>
        </div>
        <div class="batch-cluster">
          <span class="batch-meta">已选 <strong>{{ selectedCount }}</strong> 条</span>
          <div class="batch-btns">
            <button
              type="button"
              class="btn batch-btn"
              :disabled="!selectedCanBmShare"
              :title="
                selectedCanBmShare
                  ? '将本 BM 自有像素分享给其他 BM'
                  : '请勾选一行且「分享」「BM分享」均为 ✓ 的像素（所属 BM = 业主）'
              "
              @click="openPixelDrawer('share_between_bm')"
            >
              BM间分享
            </button>
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openPixelDrawer('assign_to_account')">
              分配给账号
            </button>
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openPixelDrawer('assign_to_people')">
              分配给人员
            </button>
            <button type="button" class="btn batch-btn batch-btn--create" @click="openPixelDrawer('batch_create')">
              批量创建
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="openPixelDrawer('delete_ad_account')"
            >
              删除广告账号
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="openPixelDrawer('delete_partner')"
            >
              删除合作伙伴
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="openPixelDrawer('delete_admin')"
            >
              删除管理员
            </button>
            <div ref="batchSettingsWrapRef" class="pixel-settings-wrap">
              <button
                type="button"
                class="batch-gear batch-gear--solid"
                title="默认设置"
                @click.stop="toggleSettingsPopover"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path
                    d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  ></path>
                </svg>
              </button>
              <div
                v-if="settingsOpen"
                class="pixel-settings-popover"
                role="dialog"
                aria-label="像素采集设置"
                @click.stop
              >
                <label class="pixel-settings-row">
                  <input v-model="settingsDraftMode" type="radio" name="pixel-collect-mode-batch" value="all_pixels" />
                  <span>搜索所有像素</span>
                </label>
                <label class="pixel-settings-row">
                  <input v-model="settingsDraftMode" type="radio" name="pixel-collect-mode-batch" value="bm_id" />
                  <span>搜索 BM ID</span>
                </label>
                <button type="button" class="btn primary pixel-settings-save" @click="savePixelSettings">保存设置</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="table-wrap pixel-table-wrap">
        <table class="pixel-table">
          <colgroup>
            <col class="colgroup-chk" />
            <col class="colgroup-num" />
            <col class="colgroup-ico" />
            <col class="colgroup-pixel" />
            <col class="colgroup-bm" />
            <col class="colgroup-owner" />
            <col class="colgroup-remark" />
            <col class="colgroup-role" />
            <col class="colgroup-share" />
            <col class="colgroup-bmshare" />
            <col class="colgroup-ad" />
            <col class="colgroup-admin" />
            <col class="colgroup-partner" />
            <col class="colgroup-active" />
            <col class="colgroup-active-time" />
            <col class="colgroup-time" />
          </colgroup>
          <thead>
            <tr>
              <th class="chk sticky-col sticky-chk">
                <input
                  type="checkbox"
                  :checked="allFilteredSelected"
                  @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th class="num sticky-col sticky-num">序号</th>
              <th class="ico sticky-col sticky-ico">收藏</th>
              <th
                class="sticky-col sticky-pixel col-align-left sort-th"
                :class="{ 'sort-th--on': sortMark('pixelName') !== 'none' }"
                @click="sortToggle('pixelName')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">像素</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('pixelName') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('pixelName') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
              <th
                class="col-bm col-align-left sort-th"
                :class="{ 'sort-th--on': sortMark('bmName') !== 'none' }"
                @click="sortToggle('bmName')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">BM</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('bmName') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('bmName') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
              <th
                class="col-owner col-align-left sort-th"
                :class="{ 'sort-th--on': sortMark('ownerName') !== 'none' }"
                @click="sortToggle('ownerName')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">业主</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('ownerName') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('ownerName') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
              <th class="center col-remark th-plain">备注</th>
              <th
                class="center col-role sort-th"
                :class="{ 'sort-th--on': sortMark('role') !== 'none' }"
                @click="sortToggle('role')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">角色</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('role') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('role') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
              <th
                class="center col-share th-plain"
                title="参考插件逻辑：✓=所属 BM 与业主 ID 一致（本 BM 自有，可 BM 间分享）；✗=仅在他方 BM 资产下管理"
              >
                分享
              </th>
              <th
                class="center col-bmshare th-plain"
                title="与「分享」列相同：✓=本 BM 自有像素；✗=非本 BM 创建"
              >
                BM分享
              </th>
              <th
                v-for="col in pixelCountColumnDefs"
                :key="col.kind"
                class="col-load center th-plain"
              >
                {{ col.label }}
              </th>
              <th class="center col-active th-plain">活跃状态</th>
              <th
                class="center col-active-time sort-th"
                :class="{ 'sort-th--on': sortMark('activeTime') !== 'none' }"
                @click="sortToggle('activeTime')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">活跃时间</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('activeTime') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('activeTime') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
              <th
                class="center col-captured sort-th"
                :class="{ 'sort-th--on': sortMark('capturedAt') !== 'none' }"
                @click="sortToggle('capturedAt')"
              >
                <span class="sort-th-inner">
                  <span class="sort-th-label">采集时间</span>
                  <span class="sort-carets"
                    ><span class="caret" :class="{ on: sortMark('capturedAt') === 'asc' }">▲</span
                    ><span class="caret" :class="{ on: sortMark('capturedAt') === 'desc' }">▼</span></span
                  >
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in pagedRows" :key="row.id">
              <td class="chk sticky-col sticky-chk">
                <input type="checkbox" :checked="!!selectedIds[row.id]" @change="toggleRowSelected(row.id)" />
              </td>
              <td class="num sticky-col sticky-num">{{ rowSerial(idx) }}</td>
              <td class="ico sticky-col sticky-ico">
                <button type="button" class="star" :class="{ on: row.favorite }" @click="toggleFavorite(row)">★</button>
              </td>
              <td class="sticky-col sticky-pixel col-align-left">
                <div class="linkish">{{ dash(row.pixelName) }}</div>
                <div class="mono sub">{{ dash(row.pixelId) }}</div>
              </td>
              <td class="col-bm col-align-left bm-cell">
                <div class="bm-name-row">
                  <span class="linkish bm-name">{{ dash(row.bmName) }}</span>
                  <button type="button" class="btn-icon-copy" title="复制 BM" @click="copyBmLine(row)">⎘</button>
                </div>
                <div v-if="row.bmId" class="mono sub">{{ row.bmId }}</div>
              </td>
              <td class="col-owner col-align-left">
                <div class="cell-ellipsis">{{ dash(row.ownerName) }}</div>
                <div v-if="row.ownerId" class="mono sub cell-ellipsis">{{ row.ownerId }}</div>
              </td>
              <td class="remark-cell col-remark center">
                <div class="remark-cell-inner">
                  <span class="remark-text">{{ dash(remarkDisplay(row)) }}</span>
                  <button type="button" class="btn-icon-edit" title="编辑备注" @click="openRemarkModal(row)">✎</button>
                </div>
              </td>
              <td class="center col-role">{{ dash(row.role) }}</td>
              <td class="center col-share" :title="sharePermissionTip(row)">
                <span :class="shareCellClass(isPixelSelfOwnedInBm(row))">{{
                  sharePermissionMark(row)
                }}</span>
              </td>
              <td class="center col-bmshare" :title="sharePermissionTip(row)">
                <span :class="shareCellClass(isPixelSelfOwnedInBm(row))">{{
                  sharePermissionMark(row)
                }}</span>
              </td>
              <td
                v-for="col in pixelCountColumnDefs"
                :key="col.kind"
                class="col-load center"
              >
                <div class="pixel-count-cell">
                  <template v-if="getPixelCountCell(row.id, col.kind).status === 'idle'">
                    <button
                      type="button"
                      class="btn-pay btn-pay--sm btn-pay--load"
                      @click="onPixelCountClick(row, col.kind)"
                    >
                      加载
                    </button>
                  </template>
                  <template v-else-if="getPixelCountCell(row.id, col.kind).status === 'loading'">
                    <span class="pay-spin" aria-hidden="true"></span>
                  </template>
                  <template v-else>
                    <span class="count-badge">{{ getPixelCountCell(row.id, col.kind).count ?? 0 }}</span>
                    <button
                      type="button"
                      class="btn-count-refresh"
                      title="刷新"
                      :disabled="getPixelCountCell(row.id, col.kind).status === 'loading'"
                      @click="onPixelCountRefresh(row, col.kind)"
                    >
                      ↻
                    </button>
                  </template>
                </div>
              </td>
              <td class="center col-active">
                <span
                  class="active-dot"
                  :class="{ 'active-dot--on': row.activeOk === true }"
                  :title="row.activeOk === true ? '活跃' : row.activeOk === false ? '未活跃' : '—'"
                ></span>
              </td>
              <td class="center col-active-time muted small">{{ dash(row.activeTime) }}</td>
              <td class="center col-captured muted small">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
            </tr>
            <tr v-if="!pagedRows.length">
              <td :colspan="COL_COUNT" class="empty">
                暂无数据。请点击顶栏「更新」账户信息，或确认扩展已加载且已保存 access_token。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="sortedFiltered.length" class="pager">
        <div class="pager-info">
          共 <strong>{{ sortedFiltered.length }}</strong> 条
          <label class="pager-size">
            每页
            <select v-model.number="pageSize">
              <option :value="10">10</option>
              <option :value="15">15</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
            </select>
            条
          </label>
        </div>
        <div class="pager-nav">
          <button type="button" class="btn ghost sm" :disabled="currentPage <= 1" @click="currentPage = 1">首页</button>
          <button
            type="button"
            class="btn ghost sm"
            :disabled="currentPage <= 1"
            @click="currentPage = Math.max(1, currentPage - 1)"
          >
            上一页
          </button>
          <span class="pager-page">第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button
            type="button"
            class="btn ghost sm"
            :disabled="currentPage >= totalPages"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
          >
            下一页
          </button>
          <button
            type="button"
            class="btn ghost sm"
            :disabled="currentPage >= totalPages"
            @click="currentPage = totalPages"
          >
            末页
          </button>
        </div>
      </div>
    </div>

    <div v-if="remarkModalRow" class="modal-overlay" role="dialog" aria-modal="true" @click.self="closeRemarkModal">
      <div class="modal-box">
        <h3>编辑备注</h3>
        <p class="muted small">像素：{{ remarkModalRow.pixelName || remarkModalRow.pixelId }}</p>
        <textarea v-model="remarkDraft" rows="4" class="remark-textarea" placeholder="填写备注…"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="closeRemarkModal">取消</button>
          <button type="button" class="btn primary" @click="saveRemarkModal">保存</button>
        </div>
      </div>
    </div>
    <PixelOperationDrawer
      :open="pixelDrawerOpen"
      :preset="pixelDrawerPreset"
      :context="pixelDrawerContext"
      @close="closePixelDrawer"
      @completed="onPixelDrawerCompleted"
    />
  </ExtensionMenuGate>
</template>

<style scoped>
.fb-page {
  color: var(--fb-page-text, #e8eaed);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
.muted {
  color: var(--fb-muted, #9ca3af);
}
.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary {
  background: #2563eb;
  color: #fff;
}
.btn.ghost {
  background: var(--fb-ghost-bg, #374151);
  color: var(--fb-ghost-text, #e5e7eb);
}
.btn.sm {
  padding: 6px 12px;
  font-size: 12px;
}
.sync-hint {
  font-size: 12px;
  margin: 0 0 8px;
}
.alert {
  background: #7f1d1d;
  color: #fecaca;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 10px;
}
.search-actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--fb-surface-b, #1f2937);
  border: 1px solid var(--fb-border, #374151);
}
.search-actions-row .search-cluster {
  flex: 1;
  min-width: 250px;
}
.search-actions-row .batch-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
}
.search-row--flex {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-input {
  flex: 1;
  min-width: 210px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
}
.btn-search {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-a, #111827);
  color: var(--fb-muted, #9ca3af);
  cursor: pointer;
}
.btn-search:hover {
  color: var(--fb-link, #93c5fd);
  border-color: var(--fb-link, #3b82f6);
  background: rgba(59, 130, 246, 0.12);
}
.batch-meta {
  font-size: 13px;
  color: var(--fb-muted, #9ca3af);
}
.batch-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.batch-btn {
  background: #2563eb;
  color: #fff;
  font-weight: 500;
}
.batch-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.batch-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.batch-btn--danger {
  background: #991b1b;
  color: #fecaca;
}
.batch-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
}
.batch-btn--create {
  background: #7c3aed;
  color: #fff;
}
.batch-btn--create:hover:not(:disabled) {
  filter: brightness(1.08);
}
.batch-gear {
  width: 38px;
  height: 38px;
}
.pixel-settings-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.pixel-settings-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 218px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pixel-settings-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.pixel-settings-save {
  width: 100%;
  margin-top: 2px;
}
.batch-gear--solid {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.batch-gear--solid:hover {
  filter: brightness(1.06);
}
.active-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6b7280;
  vertical-align: middle;
}
.active-dot--on {
  background: #22c55e;
}
.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-a, #111827);
  scrollbar-width: thin;
  scrollbar-color: var(--fb-scrollbar-thumb, #475569) var(--fb-scrollbar-track, #0c1220);
}
.table-wrap::-webkit-scrollbar {
  height: 8px;
  width: 8px;
}
.table-wrap::-webkit-scrollbar-track {
  background: var(--fb-scrollbar-track, #0c1220);
  border-radius: 4px;
}
.table-wrap::-webkit-scrollbar-thumb {
  background: var(--fb-scrollbar-thumb, #475569);
  border-radius: 4px;
}
.table-wrap::-webkit-scrollbar-thumb:hover {
  background: var(--fb-scrollbar-thumb-hover, #64748b);
}
/* 像素表：列宽全部用百分比，避免最小宽度超过视区导致横向滚动条 */
.pixel-table-wrap {
  min-width: 0;
  overflow-x: auto;
}
.pixel-table {
  width: 100%;
  min-width: 1280px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.pixel-table col.colgroup-chk {
  width: 54px;
}
.pixel-table col.colgroup-num {
  width: 66px;
}
.pixel-table col.colgroup-ico {
  width: 62px;
}
.pixel-table col.colgroup-pixel {
  width: 188px;
}
.pixel-table col.colgroup-bm {
  width: 12%;
}
.pixel-table col.colgroup-owner {
  width: 15%;
}
.pixel-table col.colgroup-remark {
  width: 9%;
}
.pixel-table col.colgroup-role {
  width: 128px;
}
.pixel-table col.colgroup-share {
  width: 64px;
}
.pixel-table col.colgroup-bmshare {
  width: 88px;
}
.pixel-table col.colgroup-ad,
.pixel-table col.colgroup-admin,
.pixel-table col.colgroup-partner {
  width: 116px;
}
.pixel-table col.colgroup-active {
  width: 5%;
}
.pixel-table col.colgroup-active-time {
  width: 12%;
}
.pixel-table col.colgroup-time {
  width: 9%;
}
/* 前四列（勾选/序号/收藏/像素）横向滚动时固定左侧 */
.pixel-table-wrap .sticky-col {
  position: sticky;
  background-clip: padding-box;
}
.pixel-table-wrap thead th.sticky-col {
  z-index: 6;
  background-color: var(--fb-th-bg, #0f172a);
}
.pixel-table-wrap tbody td.sticky-col {
  z-index: 2;
}
.pixel-table-wrap tbody tr:nth-child(even) td.sticky-col {
  background-color: var(--fb-row-even, #0c1222);
}
.pixel-table-wrap tbody tr:nth-child(odd) td.sticky-col {
  background-color: var(--fb-surface-a, #111827);
}
.pixel-table-wrap .sticky-chk {
  left: 0;
  width: 54px;
  min-width: 54px;
  max-width: 54px;
}
.pixel-table-wrap .sticky-num {
  left: 54px;
  width: 66px;
  min-width: 66px;
  max-width: 66px;
}
.pixel-table-wrap .sticky-ico {
  left: 120px;
  width: 62px;
  min-width: 62px;
  max-width: 62px;
}
.pixel-table-wrap .sticky-pixel {
  left: 182px;
  width: 188px;
  min-width: 188px;
  max-width: 188px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.45);
}
.pixel-table-wrap thead th.sticky-pixel {
  z-index: 7;
}
.pixel-table tbody tr:nth-child(even) td {
  background-color: var(--fb-row-even, #0c1222);
}
.pixel-table tbody tr:nth-child(odd) td {
  background-color: var(--fb-surface-a, #111827);
}
.pixel-table thead th {
  background: var(--fb-th-bg, #0f172a);
}
tbody tr:nth-child(even) {
  background: var(--fb-row-even, #0c1222);
}
tbody tr:nth-child(even) td.sticky-col {
  background-color: var(--fb-row-even, #0c1222);
}
tbody tr:nth-child(odd) td.sticky-col {
  background-color: var(--fb-surface-a, #111827);
}
th,
td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
  vertical-align: middle;
}
th {
  background: var(--fb-th-bg, #0f172a);
  color: var(--fb-th-text, #9ca3af);
  font-weight: 600;
  white-space: nowrap;
}
thead th.sticky-col {
  z-index: 5;
  background-color: var(--fb-th-bg, #0f172a);
}
tbody td.sticky-col {
  z-index: 2;
}
.sticky-col {
  position: sticky;
  background-clip: padding-box;
}
.sticky-chk {
  left: 0;
  width: 54px;
  min-width: 54px;
  max-width: 54px;
  box-sizing: border-box;
}
.sticky-num {
  left: 54px;
  width: 66px;
  min-width: 66px;
  max-width: 66px;
  box-sizing: border-box;
}
.sticky-ico {
  left: 120px;
  width: 62px;
  min-width: 62px;
  max-width: 62px;
  box-sizing: border-box;
}
.sticky-pixel {
  left: 182px;
  width: 188px;
  min-width: 188px;
  max-width: 188px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.55);
}
.col-bm {
  min-width: 210px;
}
.chk {
  width: 44px;
  text-align: center;
}
.num {
  width: 56px;
  text-align: right;
  color: var(--fb-muted, #9ca3af);
}
.ico {
  text-align: center;
}
.star {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--fb-star-off, #4b5563);
  padding: 0;
}
.star.on {
  color: #fbbf24;
}
.linkish {
  color: var(--fb-link, #93c5fd);
  font-weight: 500;
}
.mono {
  font-family: ui-monospace, monospace;
  color: var(--fb-mono, #d1d5db);
}
.sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--fb-muted, #9ca3af);
}
.bm-cell {
  white-space: normal;
}
.bm-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: nowrap;
}
.bm-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pixel-table .bm-cell .mono.sub {
  white-space: normal;
  word-break: break-all;
}
.btn-icon-copy {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--fb-muted, #9ca3af);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px;
}
.btn-icon-copy:hover {
  color: var(--fb-link, #93c5fd);
}
.remark-cell {
  min-width: 0;
}
.remark-cell-inner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  vertical-align: middle;
}
.cell-ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pixel-table .sticky-pixel .linkish,
.pixel-table .sticky-pixel .mono {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pixel-table .col-captured {
  white-space: nowrap;
}
.remark-text {
  flex: 0 1 auto;
  min-width: 0;
  max-width: calc(100% - 28px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-icon-edit {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--fb-link, #93c5fd);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 4px;
  transform: scaleX(-1);
}
.btn-icon-edit:hover {
  background: var(--fb-ghost-bg, #374151);
}
.center {
  text-align: center;
}
.share-ico {
  font-weight: 700;
  font-size: 14px;
}
.share-ico--ok {
  color: #22c55e;
}
.share-ico--bad {
  color: #f87171;
}
.share-ico--na {
  color: #9ca3af;
  font-weight: 500;
}
.pixel-table th,
.pixel-table td {
  min-width: 58px;
  text-align: center;
}
.pixel-table th.col-align-left,
.pixel-table td.col-align-left {
  text-align: left;
}
.pixel-table .num {
  text-align: center;
}
.pixel-table .sort-th.center .sort-th-inner {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
.pixel-table .remark-cell.center .remark-cell-inner {
  justify-content: center;
}
.pixel-table .col-share {
  min-width: 64px;
  width: 64px;
  max-width: 64px;
  box-sizing: border-box;
  padding-left: 6px;
  padding-right: 6px;
}
.pixel-table .col-bmshare {
  min-width: 88px;
  width: 88px;
  max-width: 88px;
  box-sizing: border-box;
  padding-left: 6px;
  padding-right: 6px;
  white-space: nowrap;
}
.pixel-table .col-load {
  min-width: 116px;
  width: 116px;
  max-width: 116px;
  box-sizing: border-box;
  padding-left: 8px;
  padding-right: 8px;
}
.pixel-table .col-load .btn-pay--sm {
  min-width: 0;
  width: 100%;
  max-width: 100px;
  margin: 0 auto;
  box-sizing: border-box;
}
.pixel-table .col-load .pixel-count-cell {
  width: 100%;
  max-width: 100px;
  margin: 0 auto;
  flex-wrap: nowrap;
}
.pixel-table .col-remark {
  min-width: 100px;
}
.pixel-table .col-owner {
  min-width: 110px;
}
.pixel-table .col-role {
  min-width: 128px;
  width: 128px;
  max-width: 160px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
  vertical-align: middle;
}
.pixel-table .col-active-time,
.pixel-table .col-captured {
  min-width: 118px;
}
.pixel-count-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
}
.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}
.btn-count-refresh {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.16);
  color: #22c55e;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  padding: 0;
}
.btn-count-refresh:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.28);
}
.btn-count-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}
.btn-pay--load {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.1);
}
.btn-pay--load:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.18);
}
.pixel-table thead th.th-plain {
  white-space: nowrap;
  vertical-align: middle;
  line-height: 1.25;
}
.sort-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  vertical-align: middle;
}
.sort-th:hover {
  color: var(--fb-link, #93c5fd);
}
.sort-th-inner {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
  line-height: 1.25;
  vertical-align: middle;
}
.sort-th-label {
  margin-right: 0;
  flex-shrink: 0;
}
.sort-carets {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
}
.sort-th:not(.sort-th--on) .sort-carets .caret {
  color: var(--fb-muted, #6b7280);
  opacity: 0.45;
}
.sort-th--on .sort-carets .caret:not(.on) {
  opacity: 0.22;
  color: var(--fb-muted, #6b7280);
  transform: scale(0.92);
}
.sort-th--on .sort-carets .caret.on {
  opacity: 1;
  color: #38bdf8;
  font-weight: 700;
  font-size: 11px;
}
.btn-pay {
  min-width: 94px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-btn-pay-border, #3b82f6);
  background: var(--fb-btn-pay-bg, #1e3a5f);
  color: var(--fb-btn-pay-text, #93c5fd);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-pay:hover:not(:disabled) {
  background: var(--fb-btn-pay-hover-bg, #254a73);
}
.btn-pay--sm {
  min-width: 74px;
  padding: 4px 8px;
  font-size: 11px;
}
.btn-pay--empty,
.btn-pay--err {
  border-color: var(--fb-btn-pay-alt-border, #4b5563);
  background: var(--fb-btn-pay-alt-bg, #1f2937);
}
.btn-pay--empty {
  color: var(--fb-btn-pay-empty-text, #9ca3af);
}
.btn-pay--err {
  color: var(--fb-btn-pay-err-text, #f87171);
  border-color: var(--fb-btn-pay-err-border, #7f1d1d);
}
.btn-pay:disabled {
  opacity: 0.85;
  cursor: wait;
}
.pay-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--fb-btn-pay-spin-dim, rgba(147, 197, 253, 0.35));
  border-top-color: var(--fb-btn-pay-text, #93c5fd);
  border-radius: 50%;
  animation: pay-spin-anim 0.65s linear infinite;
}
@keyframes pay-spin-anim {
  to {
    transform: rotate(360deg);
  }
}
.empty {
  text-align: center;
  color: var(--fb-muted, #6b7280);
  padding: 28px 12px;
}
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--fb-surface-a, #111827);
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  font-size: 13px;
}
.pager-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  color: var(--fb-muted, #9ca3af);
}
.pager-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.pager-size select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--fb-pager-select-border, #4b5563);
  background: var(--fb-pager-select-bg, #0f172a);
  color: var(--fb-pager-select-text, #e5e7eb);
  font-size: 12px;
}
.pager-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pager-page {
  color: var(--fb-mono, #d1d5db);
  padding: 0 6px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 16px;
}
.modal-box {
  width: min(420px, 96vw);
  padding: 20px 22px;
  border-radius: 10px;
  background: var(--fb-modal-bg, #1f2937);
  border: 1px solid var(--fb-modal-border, #374151);
  color: var(--fb-modal-text, #e5e7eb);
}
.modal-box h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.remark-textarea {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-modal-text, #e5e7eb);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}
.modal-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.small {
  font-size: 12px;
}
</style>
