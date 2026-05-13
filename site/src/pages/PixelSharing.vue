<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import type { FbPixelShareRecord } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  fetchPixelSharesFromExtension,
  getStoredExtensionId,
  pingExtension,
  usesExtensionIdFromEnv,
} from '../lib/extensionBridge';
import { fbControlLog } from '../../../utils/fbControlLog';

/**
 * 像素分享管理页：从扩展 IndexedDB 读取由 content script 采集的像素行。
 */
const rows = ref<FbPixelShareRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
const lastUpdated = ref('');
const extensionOk = ref<boolean | null>(null);

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
      r.remark,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
});

async function testExtension() {
  errorMsg.value = '';
  extensionOk.value = null;
  fbControlLog('site:pixel-page', '检测扩展连接');
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
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
  fbControlLog('site:pixel-page', '从扩展拉取像素分享列表');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID');
    }
    const res = await fetchPixelSharesFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    rows.value = [...(res.payload?.list || [])].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    lastUpdated.value = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fbControlLog('site:pixel-page', '像素列表已更新', { count: rows.value.length });
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function flag(ok?: boolean) {
  if (ok === true) return '✓';
  if (ok === false) return '✗';
  return '—';
}

onMounted(() => {
  fbControlLog('site:pixel-page', '页面挂载，自动拉取像素');
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
        <div v-if="usesExtensionIdFromEnv()" class="ext-id ext-id--env">
          <span>扩展 ID</span>
          <code class="ext-id-preview" :title="getStoredExtensionId()">{{ getStoredExtensionId().slice(0, 12) }}…</code>
        </div>
        <span v-else class="muted tiny">请在 site/.env.development 配置 VITE_EXTENSION_ID</span>
        <button class="btn ghost" type="button" :disabled="loading" @click="testExtension">检测连接</button>
        <button class="btn primary" type="button" :disabled="loading" @click="refreshFromExtension">
          {{ loading ? '加载中…' : '从扩展刷新' }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div class="hint">
      在 Chrome 中打开 Facebook 事件管理 / 像素相关页面后，扩展会尝试写入像素行；BM、业主等字段依赖页面结构，后续版本可增强解析。
    </div>

    <div class="search-row">
      <input v-model="searchQuery" type="search" placeholder="搜索像素 ID、BM ID、名称…" />
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>像素</th>
            <th>BM</th>
            <th>业主</th>
            <th>备注</th>
            <th>角色</th>
            <th>分享</th>
            <th>BM 分享</th>
            <th>采集时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in filtered" :key="row.id">
            <td class="num">{{ idx + 1 }}</td>
            <td>
              <div class="primary">{{ row.pixelName }}</div>
              <div class="sub mono">{{ row.pixelId }}</div>
            </td>
            <td>
              <div class="primary">{{ row.bmName || '—' }}</div>
              <div v-if="row.bmId" class="sub mono">{{ row.bmId }}</div>
            </td>
            <td>
              <div class="primary">{{ row.ownerName || '—' }}</div>
              <div v-if="row.ownerId" class="sub mono">{{ row.ownerId }}</div>
            </td>
            <td>{{ row.remark || '—' }}</td>
            <td>{{ row.role || '—' }}</td>
            <td class="center">{{ flag(row.shareOk) }}</td>
            <td class="center">{{ flag(row.bmShareOk) }}</td>
            <td class="muted small">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="9" class="empty">暂无数据。请确认扩展与 Facebook 页面采集流程正常。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.fb-page {
  color: var(--fb-page-text, #e8eaed);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--fb-surface-b, #1f2937);
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
}
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.muted { color: var(--fb-muted, #9ca3af); }
.toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ext-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fb-muted, #9ca3af);
}
.ext-id input {
  width: 260px;
  max-width: 50vw;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 12px;
}
.ext-id--env { flex-wrap: wrap; align-items: center; }
.ext-id-preview {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--fb-input-bg, #111827);
  border: 1px solid var(--fb-code-border, #374151);
  color: var(--fb-link, #93c5fd);
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
.btn.ghost { background: var(--fb-ghost-bg, #374151); color: var(--fb-ghost-text, #e5e7eb); }
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
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 12px;
  line-height: 1.5;
}
.search-row input {
  width: 100%;
  max-width: 420px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  margin-bottom: 12px;
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
}
table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
  vertical-align: top;
}
th {
  background: var(--fb-th-bg, #0f172a);
  color: var(--fb-th-text, #9ca3af);
  font-weight: 600;
  white-space: nowrap;
}
.num { width: 40px; text-align: right; color: var(--fb-muted, #9ca3af); }
.primary { color: var(--fb-link, #93c5fd); font-weight: 500; }
.sub { font-size: 12px; color: var(--fb-muted, #9ca3af); margin-top: 2px; }
.mono { font-family: ui-monospace, monospace; color: var(--fb-mono, #d1d5db); }
.small { font-size: 12px; }
.center { text-align: center; }
.empty {
  text-align: center;
  color: var(--fb-muted, #6b7280);
  padding: 28px 12px;
}
</style>
