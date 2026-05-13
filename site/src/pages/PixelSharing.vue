<script lang="ts" setup>
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import { extensionConfigured, fetchPixelSharesFromExtension } from '../lib/extensionBridge';
import { fbControlLog } from '../../../utils/fbControlLog';
import ExtensionMenuGate from '../components/ExtensionMenuGate.vue';
import {
  markPixelListFetched,
  pixelsShellExtensionReady,
  registerPixelListRefresh,
  unregisterPixelListRefresh,
} from '../lib/pixelListHub';

const COL_COUNT = 13;
const REMARK_KEY = (id: string) => `fb_pixel_remark:${id}`;

type PixelSortKey = 'pixelName' | 'bmName' | 'ownerName' | 'capturedAt' | 'role' | '';

const rows = ref<FbPixelShareRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');

const currentPage = ref(1);
const pageSize = ref(10);

const selectedIds = ref<Record<string, boolean>>({});
const favoriteOverrides = ref<Record<string, boolean>>({});

const sortCol = ref<PixelSortKey>('');
const sortDir = ref<'asc' | 'desc'>('asc');

const remarkModalRow = ref<FbPixelShareRecord | null>(null);
const remarkDraft = ref('');

const pixelAdLoadUi = reactive<Record<string, 'idle' | 'loading' | 'empty' | 'error'>>({});
const pixelAdminLoadUi = reactive<Record<string, 'idle' | 'loading' | 'empty' | 'error'>>({});

function dash(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function remarkDisplay(row: FbPixelShareRecord): string {
  try {
    const stored = sessionStorage.getItem(REMARK_KEY(row.id));
    if (stored != null) return stored;
  } catch {
    /* ignore */
  }
  return row.remark ?? '';
}

function isFavorite(row: FbPixelShareRecord): boolean {
  if (favoriteOverrides.value[row.id] !== undefined) return !!favoriteOverrides.value[row.id];
  return !!row.favorite;
}

function toggleFavorite(row: FbPixelShareRecord) {
  favoriteOverrides.value = {
    ...favoriteOverrides.value,
    [row.id]: !isFavorite(row),
  };
  fbControlLog('site:pixel-page', '切换像素收藏（本地）', { id: row.id });
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
    const blob = [r.pixelName, r.pixelId, r.bmName, r.bmId, r.ownerName, r.ownerId, r.role, remarkDisplay(r)]
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

watch(searchQuery, () => {
  currentPage.value = 1;
});

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
  return 'share-ico share-ico--none';
}

function loadAdState(id: string) {
  return pixelAdLoadUi[id] ?? 'idle';
}

function loadAdminState(id: string) {
  return pixelAdminLoadUi[id] ?? 'idle';
}

async function onLoadAdAccount(row: FbPixelShareRecord) {
  if (loadAdState(row.id) === 'loading') return;
  pixelAdLoadUi[row.id] = 'loading';
  fbControlLog('site:pixel-page', '加载广告账号（占位）', { pixelId: row.pixelId });
  await new Promise((r) => setTimeout(r, 500));
  pixelAdLoadUi[row.id] = row.adAccountId ? 'idle' : 'empty';
}

async function onLoadAdmin(row: FbPixelShareRecord) {
  if (loadAdminState(row.id) === 'loading') return;
  pixelAdminLoadUi[row.id] = 'loading';
  fbControlLog('site:pixel-page', '加载管理员（占位）', { pixelId: row.pixelId });
  await new Promise((r) => setTimeout(r, 500));
  pixelAdminLoadUi[row.id] = 'empty';
}

function openRemarkModal(row: FbPixelShareRecord) {
  remarkModalRow.value = row;
  remarkDraft.value = remarkDisplay(row);
}

function closeRemarkModal() {
  remarkModalRow.value = null;
  remarkDraft.value = '';
}

function saveRemarkModal() {
  if (!remarkModalRow.value) return;
  const id = remarkModalRow.value.id;
  try {
    sessionStorage.setItem(REMARK_KEY(id), remarkDraft.value.trim());
  } catch {
    errorMsg.value = '无法写入本地备注';
    return;
  }
  errorMsg.value = '';
  closeRemarkModal();
}

function batchPlaceholder(action: string) {
  if (!selectedCount.value) {
    errorMsg.value = '请先在表格中勾选至少一行';
    return;
  }
  errorMsg.value = '';
  fbControlLog('site:pixel-page', `批量操作（待接入）：${action}`, { selected: selectedCount.value });
  errorMsg.value = `「${action}」待对接扩展，已记录操作意图`;
}

async function refreshFromExtension() {
  errorMsg.value = '';
  loading.value = true;
  fbControlLog('site:pixel-page', '从扩展拉取像素分享列表');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID');
    }
    const res = await fetchPixelSharesFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    rows.value = [...(res.payload?.list || [])].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    markPixelListFetched();
    fbControlLog('site:pixel-page', '像素列表已更新', { count: rows.value.length });
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function onExtensionMenuReady() {
  pixelsShellExtensionReady.value = true;
  fbControlLog('site:pixel-page', '扩展已连通，拉取像素列表');
  void refreshFromExtension();
}

onMounted(() => {
  registerPixelListRefresh(refreshFromExtension);
});

onUnmounted(() => {
  unregisterPixelListRefresh();
  pixelsShellExtensionReady.value = false;
});
</script>

<template>
  <ExtensionMenuGate @ready="onExtensionMenuReady">
    <div class="fb-page">
      <p v-if="loading" class="sync-hint muted">正在从扩展同步列表…</p>

      <div class="search-actions-row">
        <div class="search-cluster search-row search-row--flex">
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="搜索：像素ID或BM ID"
          />
          <button type="button" class="btn-filter" title="筛选（占位）" @click="batchPlaceholder('筛选')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16v4H4zM7 12h10v4H7zM10 20h4v2h-4z"></path>
            </svg>
          </button>
        </div>
        <div class="batch-cluster">
          <span class="batch-meta">已选 <strong>{{ selectedCount }}</strong> 条</span>
          <div class="batch-btns">
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="batchPlaceholder('BM间分享')">
              BM间分享
            </button>
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="batchPlaceholder('分配给账号')">
              分配给账号
            </button>
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="batchPlaceholder('分配给人员')">
              分配给人员
            </button>
            <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="batchPlaceholder('批量创建')">
              批量创建
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="batchPlaceholder('删除广告账号')"
            >
              删除广告账号
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="batchPlaceholder('删除合作伙伴')"
            >
              删除合作伙伴
            </button>
            <button
              type="button"
              class="btn batch-btn batch-btn--danger"
              :disabled="!selectedCount"
              @click="batchPlaceholder('删除管理员')"
            >
              删除管理员
            </button>
            <button type="button" class="btn-filter batch-gear" title="设置（占位）" @click="batchPlaceholder('设置')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                ></path>
              </svg>
            </button>
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
                class="sticky-col sticky-pixel sort-th"
                :class="{ 'sort-th--on': sortMark('pixelName') !== 'none' }"
                @click="sortToggle('pixelName')"
              >
                <span class="sort-th-label">像素</span>
                <span class="sort-carets"
                  ><span class="caret" :class="{ on: sortMark('pixelName') === 'asc' }">▲</span
                  ><span class="caret" :class="{ on: sortMark('pixelName') === 'desc' }">▼</span></span
                >
              </th>
              <th
                class="sticky-col sticky-bm sort-th"
                :class="{ 'sort-th--on': sortMark('bmName') !== 'none' }"
                @click="sortToggle('bmName')"
              >
                <span class="sort-th-label">BM</span>
                <span class="sort-carets"
                  ><span class="caret" :class="{ on: sortMark('bmName') === 'asc' }">▲</span
                  ><span class="caret" :class="{ on: sortMark('bmName') === 'desc' }">▼</span></span
                >
              </th>
              <th
                class="col-owner sort-th"
                :class="{ 'sort-th--on': sortMark('ownerName') !== 'none' }"
                @click="sortToggle('ownerName')"
              >
                <span class="sort-th-label">业主</span>
                <span class="sort-carets"
                  ><span class="caret" :class="{ on: sortMark('ownerName') === 'asc' }">▲</span
                  ><span class="caret" :class="{ on: sortMark('ownerName') === 'desc' }">▼</span></span
                >
              </th>
              <th class="col-remark">备注</th>
              <th
                class="col-role sort-th"
                :class="{ 'sort-th--on': sortMark('role') !== 'none' }"
                @click="sortToggle('role')"
              >
                <span class="sort-th-label">角色</span>
                <span class="sort-carets"
                  ><span class="caret" :class="{ on: sortMark('role') === 'asc' }">▲</span
                  ><span class="caret" :class="{ on: sortMark('role') === 'desc' }">▼</span></span
                >
              </th>
              <th class="center col-share">分享</th>
              <th class="center col-share">BM分享</th>
              <th class="col-load">广告账号</th>
              <th class="col-load">管理员</th>
              <th
                class="col-captured sort-th"
                :class="{ 'sort-th--on': sortMark('capturedAt') !== 'none' }"
                @click="sortToggle('capturedAt')"
              >
                <span class="sort-th-label">采集时间</span>
                <span class="sort-carets"
                  ><span class="caret" :class="{ on: sortMark('capturedAt') === 'asc' }">▲</span
                  ><span class="caret" :class="{ on: sortMark('capturedAt') === 'desc' }">▼</span></span
                >
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
                <button type="button" class="star" :class="{ on: isFavorite(row) }" @click="toggleFavorite(row)">★</button>
              </td>
              <td class="sticky-col sticky-pixel">
                <div class="linkish">{{ dash(row.pixelName) }}</div>
                <div class="mono sub">{{ dash(row.pixelId) }}</div>
              </td>
              <td class="sticky-col sticky-bm bm-cell">
                <div class="bm-name-row">
                  <span class="linkish bm-name">{{ dash(row.bmName) }}</span>
                  <button type="button" class="btn-icon-copy" title="复制 BM" @click="copyBmLine(row)">⎘</button>
                </div>
                <div v-if="row.bmId" class="mono sub">{{ row.bmId }}</div>
              </td>
              <td class="col-owner">
                <div class="cell-ellipsis">{{ dash(row.ownerName) }}</div>
                <div v-if="row.ownerId" class="mono sub cell-ellipsis">{{ row.ownerId }}</div>
              </td>
              <td class="remark-cell col-remark">
                <span class="remark-text">{{ dash(remarkDisplay(row)) }}</span>
                <button type="button" class="btn-icon-edit" title="编辑备注" @click="openRemarkModal(row)">✎</button>
              </td>
              <td class="col-role cell-ellipsis">{{ dash(row.role) }}</td>
              <td class="center col-share">
                <span :class="shareCellClass(row.shareOk)">{{ row.shareOk === true ? '✓' : row.shareOk === false ? '✗' : '—' }}</span>
              </td>
              <td class="center col-share">
                <span :class="shareCellClass(row.bmShareOk)">{{
                  row.bmShareOk === true ? '✓' : row.bmShareOk === false ? '✗' : '—'
                }}</span>
              </td>
              <td class="col-load">
                <button
                  type="button"
                  class="btn-pay btn-pay--sm"
                  :class="{ 'btn-pay--empty': loadAdState(row.id) === 'empty', 'btn-pay--err': loadAdState(row.id) === 'error' }"
                  :disabled="loadAdState(row.id) === 'loading'"
                  @click="onLoadAdAccount(row)"
                >
                  <template v-if="loadAdState(row.id) === 'loading'">
                    <span class="pay-spin" aria-hidden="true"></span>
                    加载中
                  </template>
                  <template v-else-if="loadAdState(row.id) === 'empty'">无账号</template>
                  <template v-else-if="loadAdState(row.id) === 'error'">重试</template>
                  <template v-else>加载</template>
                </button>
              </td>
              <td class="col-load">
                <button
                  type="button"
                  class="btn-pay btn-pay--sm"
                  :class="{
                    'btn-pay--empty': loadAdminState(row.id) === 'empty',
                    'btn-pay--err': loadAdminState(row.id) === 'error',
                  }"
                  :disabled="loadAdminState(row.id) === 'loading'"
                  @click="onLoadAdmin(row)"
                >
                  <template v-if="loadAdminState(row.id) === 'loading'">
                    <span class="pay-spin" aria-hidden="true"></span>
                    加载中
                  </template>
                  <template v-else-if="loadAdminState(row.id) === 'empty'">无数据</template>
                  <template v-else-if="loadAdminState(row.id) === 'error'">重试</template>
                  <template v-else>加载</template>
                </button>
              </td>
              <td class="col-captured muted small cell-ellipsis">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
            </tr>
            <tr v-if="!pagedRows.length">
              <td :colspan="COL_COUNT" class="empty">
                暂无数据。请确认扩展已加载、扩展 ID 正确，并已在 Facebook 相关页面触发采集。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="sortedFiltered.length" class="pager pixel-pager">
        <div class="pixel-pager-tags">
          <span class="pixel-tag">列表：{{ pagedRows.length }} / 筛后 {{ filtered.length }}</span>
          <span class="pixel-tag">已选 {{ selectedCount }} / 共 {{ rows.length }}</span>
          <button type="button" class="btn batch-btn" @click="batchPlaceholder('购买')">购买</button>
          <button type="button" class="btn batch-btn" @click="batchPlaceholder('记录')">记录</button>
        </div>
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
          <button type="button" class="btn-filter pager-gear" title="列设置（占位）" @click="batchPlaceholder('列设置')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path
                d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
              ></path>
            </svg>
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
  min-width: 240px;
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
  min-width: 200px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
}
.btn-filter {
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
.btn-filter:hover {
  color: var(--fb-link, #93c5fd);
  border-color: var(--fb-link, #3b82f6);
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
.batch-gear {
  width: 38px;
  height: 38px;
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
  overflow-x: hidden;
}
.pixel-table {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.pixel-table col.colgroup-chk {
  width: 3%;
}
.pixel-table col.colgroup-num {
  width: 3%;
}
.pixel-table col.colgroup-ico {
  width: 2.5%;
}
.pixel-table col.colgroup-pixel {
  width: 10%;
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
  width: 5%;
}
.pixel-table col.colgroup-share {
  width: 4%;
}
.pixel-table col.colgroup-bmshare {
  width: 4%;
}
.pixel-table col.colgroup-ad {
  width: 6%;
}
.pixel-table col.colgroup-admin {
  width: 6%;
}
.pixel-table col.colgroup-time {
  width: 20.5%;
}
/* 无横向滚动时不必 sticky；百分比列宽也无法与固定 left 对齐 */
.pixel-table-wrap .sticky-col {
  position: static;
  left: auto;
  box-shadow: none;
}
.pixel-table-wrap .sticky-chk,
.pixel-table-wrap .sticky-num,
.pixel-table-wrap .sticky-ico,
.pixel-table-wrap .sticky-pixel,
.pixel-table-wrap .sticky-bm,
.pixel-table-wrap .chk,
.pixel-table-wrap .num,
.pixel-table-wrap .ico {
  width: auto;
  min-width: 0;
  max-width: none;
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
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  box-sizing: border-box;
}
.sticky-num {
  left: 44px;
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  box-sizing: border-box;
}
.sticky-ico {
  left: 100px;
  width: 52px;
  min-width: 52px;
  max-width: 52px;
  box-sizing: border-box;
}
.sticky-pixel {
  left: 152px;
  width: 236px;
  min-width: 236px;
  max-width: 236px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.55);
}
.sticky-bm {
  left: 388px;
  min-width: 200px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.55);
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
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
  flex: 1;
  min-width: 0;
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
.share-ico--none {
  color: var(--fb-muted, #6b7280);
}
.sort-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sort-th:hover {
  color: var(--fb-link, #93c5fd);
}
.sort-th-label {
  margin-right: 4px;
}
.sort-carets {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  margin-left: 4px;
  vertical-align: middle;
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
  min-width: 84px;
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
  min-width: 64px;
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
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-b, #1f2937);
  font-size: 13px;
}
.pixel-pager-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pixel-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-link, #3b82f6);
  color: var(--fb-link, #93c5fd);
  font-size: 12px;
}
.pager-info {
  display: flex;
  align-items: center;
  gap: 10px;
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
.pager-gear {
  margin-left: 4px;
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
