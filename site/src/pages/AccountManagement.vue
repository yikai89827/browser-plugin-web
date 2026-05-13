<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  fetchAccountsFromExtension,
  getStoredExtensionId,
  getFbTokenMetaFromExtension,
  mergeAccountInExtension,
  pingExtension,
  setStoredExtensionId,
  syncAdAccountsFromGraphViaExtension,
  setFbAccessTokenInExtension,
  clearFbAccessTokenInExtension,
  usesExtensionIdFromEnv,
  type FbTokenMeta,
} from '../lib/extensionBridge';

const COL_COUNT = 24;

const extensionIdInput = ref(getStoredExtensionId());
const accounts = ref<FbAdAccountRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
const lastUpdated = ref<string>('');
const extensionOk = ref<boolean | null>(null);
const tokenMeta = ref<FbTokenMeta | null>(null);
const showPasteToken = ref(false);
const pasteTokenInput = ref('');
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
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 配置 VITE_EXTENSION_ID，或在页面填写扩展 ID';
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
    if (!extensionConfigured()) {
      throw new Error('请配置 VITE_EXTENSION_ID 或页面扩展 ID，并确保 manifest 中 externally_connectable 包含本站点');
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
  const s = (row.status || '').trim();
  const sl = s.toLowerCase();
  if (!s || s === '未知') return false;
  if (s.includes('活跃') || s.includes('可投放') || s.includes('运行')) return true;
  return sl.includes('active') || sl.includes('enabled') || s === '1';
}

async function loadTokenMeta() {
  errorMsg.value = '';
  if (!extensionConfigured()) {
    tokenMeta.value = null;
    return;
  }
  try {
    saveExtensionId();
    const res = await getFbTokenMetaFromExtension();
    if (!res.success) throw new Error(res.error || '读取 Token 状态失败');
    tokenMeta.value = (res.payload ?? null) as FbTokenMeta | null;
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
    tokenMeta.value = null;
  }
}

async function syncFromGraph() {
  errorMsg.value = '';
  loading.value = true;
  saveExtensionId();
  try {
    if (!extensionConfigured()) {
      throw new Error('请配置 VITE_EXTENSION_ID 或页面扩展 ID');
    }
    const res = await syncAdAccountsFromGraphViaExtension();
    if (!res.success) throw new Error(res.error || 'Graph 同步失败');
    await refreshFromExtension();
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function savePastedToken() {
  errorMsg.value = '';
  const t = pasteTokenInput.value.trim();
  if (!t) {
    errorMsg.value = '请粘贴 access_token';
    return;
  }
  loading.value = true;
  try {
    const res = await setFbAccessTokenInExtension(t, 'local_site_paste');
    if (!res.success) throw new Error(res.error || '保存失败');
    showPasteToken.value = false;
    pasteTokenInput.value = '';
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function onClearToken() {
  if (!confirm('确定清除本地保存的 Facebook access_token？')) return;
  errorMsg.value = '';
  try {
    const res = await clearFbAccessTokenInExtension();
    if (!res.success) throw new Error(res.error || '清除失败');
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  }
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
  refreshFromExtension()
    .then(() => loadTokenMeta())
    .catch(() => {});
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
        <div v-if="usesExtensionIdFromEnv()" class="ext-id ext-id--env">
          <span>扩展 ID</span>
          <code class="ext-id-preview" :title="getStoredExtensionId()">{{ getStoredExtensionId().slice(0, 12) }}…</code>
        </div>
        <label v-else class="ext-id">
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

    <div v-if="extensionConfigured()" class="token-bar">
      <div class="token-info">
        <span class="badge" :class="tokenMeta?.hasToken ? 'ok' : 'warn'">
          {{ tokenMeta?.hasToken ? 'Token 已保存' : '未捕获 Token' }}
        </span>
        <span v-if="tokenMeta?.hasToken && tokenMeta.updatedAt" class="muted token-detail">
          更新于 {{ new Date(tokenMeta.updatedAt).toLocaleString('zh-CN') }}
          <template v-if="tokenMeta.sourceHost"> · {{ tokenMeta.sourceHost }}</template>
          <template v-if="tokenMeta.tokenPrefix"> · {{ tokenMeta.tokenPrefix }}</template>
        </span>
      </div>
      <div class="token-actions">
        <button class="btn ghost sm" type="button" :disabled="loading" @click="loadTokenMeta">Token 状态</button>
        <button class="btn primary sm" type="button" :disabled="loading" @click="syncFromGraph">Graph 同步账户</button>
        <button class="btn ghost sm" type="button" :disabled="loading" @click="showPasteToken = true">粘贴 Token</button>
        <button class="btn danger sm" type="button" :disabled="loading" @click="onClearToken">清除 Token</button>
      </div>
    </div>

    <div v-if="showPasteToken" class="modal-overlay" @click.self="showPasteToken = false">
      <div class="modal-box">
        <h3>粘贴 access_token</h3>
        <p class="muted small">将自动保存到扩展本地 storage，供 Graph 拉取广告账户使用。</p>
        <textarea v-model="pasteTokenInput" rows="4" placeholder="EAAB…" />
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="showPasteToken = false">取消</button>
          <button type="button" class="btn primary" :disabled="loading" @click="savePastedToken">保存</button>
        </div>
      </div>
    </div>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div class="hint">
      在 Chrome 中打开并操作
      <strong>Facebook 广告管理</strong>
      （任意会请求 Graph 的页面）时，扩展会在后台从请求 URL 中捕获
      <code>access_token</code>
      并保存到本地。随后在管理页点击「Graph 同步账户」即可用该 token 调用
      <code>me/adaccounts</code>
      写入账户表。收藏等仍写入 IndexedDB。
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
.ext-id--env { flex-wrap: wrap; align-items: center; }
.ext-id-preview {
  padding: 4px 10px;
  border-radius: 6px;
  background: #111827;
  border: 1px solid #374151;
  color: #93c5fd;
  font-size: 12px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tiny { font-size: 11px; }
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
.badge.warn { background: #78350f; color: #fcd34d; }
.token-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: #111827;
  border-radius: 8px;
  border: 1px solid #374151;
}
.token-info { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.token-detail { font-size: 12px; }
.token-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.btn.sm { padding: 6px 12px; font-size: 12px; }
.btn.danger { background: #7f1d1d; color: #fecaca; }
.btn.danger:hover { background: #991b1b; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal-box {
  width: 420px;
  max-width: 92vw;
  padding: 20px;
  background: #1f2937;
  border-radius: 10px;
  border: 1px solid #374151;
  color: #e5e7eb;
}
.modal-box h3 { margin: 0 0 8px; font-size: 16px; }
.modal-box textarea {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #4b5563;
  background: #111827;
  color: #e5e7eb;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
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
