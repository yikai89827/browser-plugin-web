<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  fetchAccountsFromExtension,
  getStoredExtensionId,
  mergeAccountInExtension,
  pingExtension,
  setStoredExtensionId,
} from '../lib/extensionBridge';

const COL_COUNT = 24;

const extensionIdInput = ref(getStoredExtensionId());
const accounts = ref<FbAdAccountRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
const lastUpdated = ref<string>('');
const extensionOk = ref<boolean | null>(null);
/** 行多选（仅前端会话，导出等可后续接） */
const selectedIds = ref<Record<string, boolean>>({});

function haystack(row: FbAdAccountRecord): string {
  return Object.values(row)
    .filter((v) => v != null && typeof v !== 'object')
    .join(' ')
    .toLowerCase();
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return accounts.value;
  return accounts.value.filter((a) => haystack(a).includes(q));
});

function saveExtensionId() {
  setStoredExtensionId(extensionIdInput.value);
}

function toggleRowSelected(accountId: string) {
  selectedIds.value = {
    ...selectedIds.value,
    [accountId]: !selectedIds.value[accountId],
  };
}

function toggleSelectAll(checked: boolean) {
  const next: Record<string, boolean> = { ...selectedIds.value };
  for (const row of filtered.value) {
    next[row.accountId] = checked;
  }
  selectedIds.value = next;
}

const allFilteredSelected = computed(() => {
  if (!filtered.value.length) return false;
  return filtered.value.every((r) => selectedIds.value[r.accountId]);
});

async function testExtension() {
  errorMsg.value = '';
  extensionOk.value = null;
  saveExtensionId();
  if (!extensionConfigured(extensionIdInput.value)) {
    errorMsg.value = '请填写有效的扩展 ID（chrome://extensions 中查看）';
    return;
  }
  try {
    const res = await pingExtension();
    extensionOk.value = Boolean(res.success && res.payload?.ok);
    if (!extensionOk.value) errorMsg.value = res.error || '扩展无响应';
  } catch (e: any) {
    extensionOk.value = false;
    errorMsg.value = e?.message || String(e);
  }
}

async function refreshFromExtension() {
  errorMsg.value = '';
  loading.value = true;
  saveExtensionId();
  try {
    if (!extensionConfigured(extensionIdInput.value)) {
      throw new Error('请先填写扩展 ID 并确保已在 manifest 中允许本机站点 externally_connectable');
    }
    const res = await fetchAccountsFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    accounts.value = [...(res.payload?.list || [])].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    lastUpdated.value = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function dash(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function formatMoney(n?: number) {
  if (n == null || Number.isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function totalSpentCell(row: FbAdAccountRecord) {
  if (row.totalSpent !== undefined && row.totalSpent !== '') {
    return typeof row.totalSpent === 'number' ? formatMoney(row.totalSpent) : dash(row.totalSpent);
  }
  if (row.paymentAmount) return dash(row.paymentAmount);
  if (row.spend != null) return formatMoney(row.spend);
  return '—';
}

function statusOn(row: FbAdAccountRecord) {
  const s = (row.status || '').toLowerCase();
  return s.includes('active') || s === '1' || s.includes('enabled');
}

async function onToggleFavorite(row: FbAdAccountRecord) {
  errorMsg.value = '';
  try {
    const next = !row.favorite;
    await mergeAccountInExtension({ accountId: row.accountId, favorite: next });
    row.favorite = next;
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  }
}

onMounted(() => {
  extensionIdInput.value = getStoredExtensionId();
  refreshFromExtension().catch(() => {});
});
</script>

<template>
  <div class="fb-page">
    <div class="toolbar">
      <div class="meta">
        <span v-if="lastUpdated">上次更新 | {{ lastUpdated }}</span>
        <span v-else class="muted">数据来自扩展 IndexedDB</span>
        <span v-if="extensionOk === true" class="badge ok">扩展已连接</span>
        <span v-else-if="extensionOk === false" class="badge err">扩展未连接</span>
      </div>
      <div class="toolbar-actions">
        <label class="ext-id">
          <span>扩展 ID</span>
          <input
            v-model="extensionIdInput"
            type="text"
            placeholder="chrome://extensions 中的 ID"
            @change="saveExtensionId"
          />
        </label>
        <button class="btn ghost" type="button" :disabled="loading" @click="testExtension">检测连接</button>
        <button class="btn primary" type="button" :disabled="loading" @click="refreshFromExtension">
          {{ loading ? '加载中…' : '更新' }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div class="hint">
      在 Chrome 中打开 Facebook 广告管理相关页面后，扩展会采集并写入 IndexedDB；下列字段与自有平台广告账号表对齐，未采集项显示为「—」。收藏变更会写回扩展数据库。
    </div>

    <div class="search-row">
      <input v-model="searchQuery" type="search" placeholder="搜索：请输入广告账号…" />
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="chk">
              <input
                type="checkbox"
                :checked="allFilteredSelected"
                @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th class="num">序号</th>
            <th class="ico">收藏</th>
            <th>状态</th>
            <th>账号</th>
            <th>日限额</th>
            <th>总花费</th>
            <th>花费限额</th>
            <th>已花费</th>
            <th>余额</th>
            <th>备注</th>
            <th>币种</th>
            <th>账户类型</th>
            <th>所有者角色</th>
            <th>支付方法</th>
            <th>账单期</th>
            <th>锁定原因</th>
            <th>创建日期</th>
            <th>时区</th>
            <th>原始 ID</th>
            <th>创建自 BM</th>
            <th>所属 BM</th>
            <th>国家编码</th>
            <th>采集时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in filtered" :key="row.accountId">
            <td class="chk">
              <input
                type="checkbox"
                :checked="!!selectedIds[row.accountId]"
                @change="toggleRowSelected(row.accountId)"
              />
            </td>
            <td class="num">{{ idx + 1 }}</td>
            <td class="ico">
              <button
                type="button"
                class="star"
                :class="{ on: row.favorite }"
                :title="row.favorite ? '取消收藏' : '收藏'"
                @click="onToggleFavorite(row)"
              >
                ★
              </button>
            </td>
            <td><span class="dot" :class="statusOn(row) ? 'on' : 'off'" /></td>
            <td class="account-cell">
              <div class="name">{{ dash(row.name) }}</div>
              <div class="mono sub">{{ dash(row.accountId) }}</div>
            </td>
            <td>{{ dash(row.dailyLimit) }}</td>
            <td>{{ totalSpentCell(row) }}</td>
            <td>{{ dash(row.spendingLimit) }}</td>
            <td>{{ dash(row.periodSpent) }}</td>
            <td>{{ dash(row.balance) }}</td>
            <td>{{ dash(row.remark) }}</td>
            <td>{{ dash(row.currency) }}</td>
            <td>{{ dash(row.accountType) }}</td>
            <td class="linkish">{{ dash(row.ownerRole) }}</td>
            <td>{{ dash(row.paymentMethod) }}</td>
            <td>{{ dash(row.billingPeriod) }}</td>
            <td class="lock" :class="{ policy: !!row.lockReason }">{{ dash(row.lockReason) }}</td>
            <td>{{ dash(row.createdDate) }}</td>
            <td class="small">{{ dash(row.timezone) }}</td>
            <td class="mono small">{{ dash(row.originalId) }}</td>
            <td class="bm">
              <div class="linkish">{{ dash(row.createdFromBmName) }}</div>
              <div v-if="row.createdFromBmId" class="mono sub">{{ row.createdFromBmId }}</div>
            </td>
            <td class="bm">
              <div class="linkish">{{ dash(row.belongsToBmName) }}</div>
              <div v-if="row.belongsToBmId" class="mono sub">{{ row.belongsToBmId }}</div>
            </td>
            <td>{{ dash(row.countryCode) }}</td>
            <td class="muted small">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
          </tr>
          <tr v-if="!filtered.length">
            <td :colspan="COL_COUNT" class="empty">
              暂无数据。请确认扩展已加载、扩展 ID 正确，并已在 Facebook 相关页面触发采集。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.fb-page { color: #e8eaed; }
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 12px 14px;
  background: #1f2937;
  border-radius: 8px;
  border: 1px solid #374151;
}
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.muted { color: #9ca3af; }
.toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ext-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #9ca3af;
}
.ext-id input {
  width: 260px;
  max-width: 50vw;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #4b5563;
  background: #111827;
  color: #e5e7eb;
  font-size: 12px;
}
.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary { background: #2563eb; color: #fff; }
.btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.ghost { background: #374151; color: #e5e7eb; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.badge.ok { background: #064e3b; color: #6ee7b7; }
.badge.err { background: #7f1d1d; color: #fecaca; }
.alert {
  background: #7f1d1d;
  color: #fecaca;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 10px;
}
.hint {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 12px;
  line-height: 1.5;
}
.search-row input {
  width: 100%;
  max-width: 480px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #374151;
  background: #111827;
  color: #e5e7eb;
  margin-bottom: 12px;
}
.table-wrap {
  overflow: auto;
  border-radius: 8px;
  border: 1px solid #374151;
  background: #111827;
}
table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
tbody tr:nth-child(even) { background: #0c1222; }
th, td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #1f2937;
  vertical-align: middle;
}
th {
  background: #0f172a;
  color: #9ca3af;
  font-weight: 600;
  white-space: nowrap;
}
.chk { width: 36px; text-align: center; }
.num { width: 44px; text-align: right; color: #9ca3af; }
.ico { width: 44px; text-align: center; }
.star {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: #4b5563;
  padding: 0;
}
.star.on { color: #fbbf24; }
.account-cell .name { color: #93c5fd; font-weight: 500; }
.linkish { color: #93c5fd; }
.sub { margin-top: 2px; }
.mono { font-family: ui-monospace, monospace; color: #d1d5db; }
.small { font-size: 11px; }
.bm { min-width: 120px; }
.lock.policy { color: #f87171; font-weight: 500; }
.empty {
  text-align: center;
  color: #6b7280;
  padding: 28px 12px;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
}
.dot.on { background: #22c55e; }
.dot.off { background: #ef4444; }
</style>
