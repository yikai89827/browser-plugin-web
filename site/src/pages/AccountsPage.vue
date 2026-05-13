<script lang="ts" setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import AccountManagement from './AccountManagement.vue';
import { pingExtension, usesExtensionIdFromEnv } from '../lib/extensionBridge';
import { accountsShellExtensionReady } from '../lib/accountsRouteGate';

type AccountsGateState = 'idle' | 'checking' | 'no_config' | 'disconnected' | 'ready';
const accountsGate = ref<AccountsGateState>('idle');
async function runAccountsExtensionGate() {
  accountsGate.value = 'checking';
  if (!usesExtensionIdFromEnv()) {
    accountsGate.value = 'no_config';
    return;
  }
  try {
    const res = await pingExtension();
    if (res.success && res.payload?.ok) {
      accountsGate.value = 'ready';
    } else {
      accountsGate.value = 'disconnected';
    }
  } catch {
    accountsGate.value = 'disconnected';
  }
}

function openChromeExtensionsPage() {
  try {
    window.open('chrome://extensions/', '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void runAccountsExtensionGate();
});

watch(
  accountsGate,
  (g) => {
    accountsShellExtensionReady.value = g === 'ready';
  },
  { immediate: true }
);

onUnmounted(() => {
  accountsShellExtensionReady.value = false;
});
</script>

<template>
  <div class="accounts-page accounts-page--gate">
    <div
      v-if="accountsGate !== 'ready'"
      class="accounts-gate-overlay"
      role="status"
      aria-live="polite"
    >
      <div class="accounts-gate-card">
        <template v-if="accountsGate === 'checking'">
          <div class="accounts-gate-spinner" aria-hidden="true"></div>
          <p class="accounts-gate-title">正在检测扩展连接…</p>
        </template>
        <template v-else-if="accountsGate === 'no_config'">
          <p class="accounts-gate-title">未配置扩展 ID</p>
          <p class="accounts-gate-desc">
            请在 <code>site/.env.development</code>（或 <code>site/.env</code>）中设置
            <code>VITE_EXTENSION_ID</code> 后重新运行站点构建。
          </p>
        </template>
        <template v-else>
          <p class="accounts-gate-title">无法连接到扩展</p>
          <p class="accounts-gate-desc">
            请确认已安装并启用插件，且本站点来源在扩展 manifest 的
            <code>externally_connectable</code> 中。可在 Chrome 中打开扩展管理页核对。
          </p>
          <div class="accounts-gate-actions">
            <button type="button" class="btn-open-ext" @click="openChromeExtensionsPage">打开</button>
            <button type="button" class="btn-recheck" @click="runAccountsExtensionGate">重新检测</button>
          </div>
        </template>
      </div>
    </div>
    <AccountManagement v-if="accountsGate === 'ready'" />
  </div>
</template>

<style scoped>
.accounts-page--gate {
  position: relative;
  min-height: 240px;
}
.accounts-gate-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.9);
}
:global(.site-container.theme-light) .accounts-gate-overlay {
  background: rgba(245, 247, 250, 0.94);
}
.accounts-gate-card {
  max-width: 420px;
  padding: 22px 24px;
  border-radius: 10px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-b, #1f2937);
  color: var(--fb-page-text, #e8eaed);
  text-align: center;
}
.accounts-gate-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
}
.accounts-gate-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--fb-muted, #9ca3af);
  text-align: left;
}
.accounts-gate-desc code {
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fb-surface-a, #111827);
  border: 1px solid var(--fb-border, #374151);
}
.accounts-gate-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.btn-open-ext {
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
}
.btn-open-ext:hover {
  filter: brightness(1.08);
}
.btn-recheck {
  border: 1px solid var(--fb-border, #374151);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  background: var(--fb-surface-a, #111827);
  color: var(--fb-page-text, #e8eaed);
}
.btn-recheck:hover {
  border-color: var(--fb-link, #3b82f6);
  color: var(--fb-link, #93c5fd);
}
.accounts-gate-spinner {
  width: 36px;
  height: 36px;
  margin: 0 auto 14px;
  border: 3px solid rgba(147, 197, 253, 0.25);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: accounts-gate-spin 0.75s linear infinite;
}
@keyframes accounts-gate-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
