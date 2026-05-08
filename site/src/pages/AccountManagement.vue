<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  fetchAccountsFromExtension,
  getStoredExtensionId,
  pingExtension,
  setStoredExtensionId,
} from '../lib/extensionBridge';

const extensionIdInput = ref(getStoredExtensionId());
const accounts = ref<FbAdAccountRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
const lastUpdated = ref<string>('');
const extensionOk = ref<boolean | null>(null);

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return accounts.value;
  return accounts.value.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.accountId.includes(q) ||
      (a.status || '').toLowerCase().includes(q)
  );
});

function saveExtensionId() {
  setStoredExtensionId(extensionIdInput.value);
}

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

function formatMoney(n?: number) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          {{ loading ? '加载中…' : '从扩展刷新' }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div class="hint">
      在 Chrome 中打开 Facebook 广告管理相关页面后，扩展内容脚本会自动采集并写入扩展内 IndexedDB；此处仅读取与展示。
    </div>

    <div class="search-row">
      <input v-model="searchQuery" type="search" placeholder="搜索账户名称、ID 或状态…" />
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>状态</th>
            <th>账号</th>
            <th>账户 ID</th>
            <th>管理员数</th>
            <th>类型</th>
            <th>付款 / 花费</th>
            <th>结余</th>
            <th>日额</th>
            <th>采集时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in filtered" :key="row.accountId">
            <td class="num">{{ idx + 1 }}</td>
            <td><span class="dot" :class="row.status?.toLowerCase().includes('active') || row.status === '1' ? 'on' : 'off'" /></td>
            <td class="name">{{ row.name }}</td>
            <td class="mono">{{ row.accountId }}</td>
            <td>{{ row.adminCount ?? '—' }}</td>
            <td>{{ row.accountType || '—' }}</td>
            <td>{{ row.paymentAmount != null ? row.paymentAmount : formatMoney(row.spend) }}</td>
            <td>{{ row.balance ?? '—' }}</td>
            <td>{{ row.dailyLimit ?? '—' }}</td>
            <td class="muted small">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="10" class="empty">暂无数据。请确认扩展已加载、扩展 ID 正确，并已在 Facebook 相关页面触发采集。</td>
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
  max-width: 420px;
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
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #1f2937;
}
th {
  background: #0f172a;
  color: #9ca3af;
  font-weight: 600;
  white-space: nowrap;
}
.num { width: 40px; text-align: right; color: #9ca3af; }
.name { color: #93c5fd; font-weight: 500; }
.mono { font-family: ui-monospace, monospace; color: #d1d5db; }
.small { font-size: 12px; }
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
