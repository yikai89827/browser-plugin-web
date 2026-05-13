<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue';
import Dashboard from './pages/Dashboard.vue';
import AccountManagement from './pages/AccountManagement.vue';
import PixelSharing from './pages/PixelSharing.vue';
import { pingExtension, usesExtensionIdFromEnv } from './lib/extensionBridge';
import {
  accountsListLastUpdatedDisplay,
  accountsGraphSyncReady,
  accountsGraphSyncRunning,
  requestAccountsGraphSync,
} from './lib/accountListSyncHub';

const THEME_KEY = 'fb_admin_theme';

const currentPage = ref('dashboard');
const theme = ref<'dark' | 'light'>('dark');

/** 账户管理：内容区插件检测（不遮挡侧栏与顶栏） */
type AccountsGateState = 'idle' | 'checking' | 'no_config' | 'disconnected' | 'ready';
const accountsGate = ref<AccountsGateState>('idle');

onMounted(() => {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') theme.value = stored;
  document.documentElement.dataset.adminTheme = theme.value;
});

watch(theme, (t) => {
  localStorage.setItem(THEME_KEY, t);
  document.documentElement.dataset.adminTheme = t;
});

const navItems = [
  { id: 'dashboard', label: '仪表盘', icon: '📊' },
  { id: 'accounts', label: '账户管理', icon: '👤' },
  { id: 'pixels', label: '像素分享', icon: '🔍' },
];

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

watch(currentPage, (p) => {
  if (p === 'accounts') {
    void runAccountsExtensionGate();
  } else {
    accountsGate.value = 'idle';
  }
});

function openChromeExtensionsPage() {
  try {
    window.open('chrome://extensions/', '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

const handleNavClick = (pageId: string) => {
  currentPage.value = pageId;
};
</script>

<template>
  <div class="site-container" :class="theme === 'dark' ? 'theme-dark' : 'theme-light'">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <svg
            class="logo-spider"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="12" cy="13" r="4" fill="currentColor" opacity="0.9" />
            <circle cx="12" cy="8" r="2.2" fill="currentColor" />
            <path
              d="M4 6 L8 9 M20 6 L16 9 M3 11 L8 11 M21 11 L16 11 M4 16 L8 13 M20 16 L16 13 M6 20 L9 15 M18 20 L15 15"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
          <span>FB广告管理</span>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: currentPage === item.id }"
          @click="handleNavClick(item.id)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>
    </aside>
    
    <main class="main-content">
      <header class="content-header">
        <h1>{{ navItems.find(item => item.id === currentPage)?.label }}</h1>
        <div class="header-actions">
          <template v-if="currentPage === 'accounts' && accountsGate === 'ready'">
            <span class="accounts-header-meta">
              最近一次更新时间：{{ accountsListLastUpdatedDisplay || '—' }}
            </span>
            <button
              type="button"
              class="btn-header-update"
              :disabled="!accountsGraphSyncReady || accountsGraphSyncRunning"
              @click="requestAccountsGraphSync"
            >
              {{ accountsGraphSyncRunning ? '加载中…' : '更新' }}
            </button>
          </template>
          <div class="theme-switch" role="group" aria-label="界面主题">
            <button
              type="button"
              class="theme-switch-btn"
              :class="{ active: theme === 'dark' }"
              @click="theme = 'dark'"
            >
              夜晚
            </button>
            <button
              type="button"
              class="theme-switch-btn"
              :class="{ active: theme === 'light' }"
              @click="theme = 'light'"
            >
              白天
            </button>
          </div>
          <div class="user-info">
            <span>管理员</span>
          </div>
        </div>
      </header>
      
      <div
        class="content-body"
        :class="{ 'content-body--accounts-gate': currentPage === 'accounts' }"
      >
        <template v-if="currentPage === 'accounts'">
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
        </template>
        <Dashboard v-else-if="currentPage === 'dashboard'" />
        <PixelSharing v-else-if="currentPage === 'pixels'" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.site-container {
  display: flex;
  min-height: 100vh;
  /* 子页面通过继承使用 */
  --fb-page-text: #e8eaed;
  --fb-muted: #9ca3af;
  --fb-surface-a: #111827;
  --fb-surface-b: #1f2937;
  --fb-border: #374151;
  --fb-input-bg: #111827;
  --fb-input-border: #4b5563;
  --fb-input-text: #e5e7eb;
  --fb-ghost-bg: #374151;
  --fb-ghost-text: #e5e7eb;
  --fb-th-bg: #0f172a;
  --fb-th-text: #9ca3af;
  --fb-row-even: #0c1222;
  --fb-cell-border: #1f2937;
  --fb-link: #93c5fd;
  --fb-mono: #d1d5db;
  --fb-star-off: #4b5563;
  --fb-modal-bg: #1f2937;
  --fb-modal-text: #e5e7eb;
  --fb-modal-border: #374151;
  --fb-modal-input-bg: #111827;
  --fb-pager-select-bg: #0f172a;
  --fb-pager-select-border: #4b5563;
  --fb-pager-select-text: #e5e7eb;
  --fb-code-border: #374151;
  --fb-dash-card-bg: #111827;
  --fb-dash-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  --fb-dash-stat-value: #f1f5f9;
  --fb-dash-stat-label: #9ca3af;
  --fb-dash-card-header-border: #374151;
  --fb-dash-table-border: #1f2937;
  --fb-dash-table-th: #9ca3af;
  --fb-dash-table-td: #d1d5db;
  --fb-dash-view-all: #93c5fd;
  --sidebar-bg: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  --sidebar-text: #f1f5f9;
  --sidebar-muted: rgba(241, 245, 249, 0.65);
  --sidebar-border: rgba(148, 163, 184, 0.2);
  --sidebar-nav-hover: rgba(148, 163, 184, 0.12);
  --sidebar-logo: #e2e8f0;
}

.site-container.theme-light {
  --fb-content-header-bg: #ffffff;
  --fb-content-header-text: #1a1a2e;
  --fb-content-header-border: #e8e8e8;
  --fb-content-body-bg: #f5f7fa;
  --fb-content-body-text: #1f2937;
  --fb-user-pill-bg: #f9fafb;
  --fb-user-pill-text: #374151;
  --fb-btn-secondary-bg: #f3f4f6;
  --fb-btn-secondary-text: #374151;
  --fb-btn-secondary-hover: #e5e7eb;
  --fb-page-text: #1f2937;
  --fb-muted: #6b7280;
  --fb-surface-a: #ffffff;
  --fb-surface-b: #f9fafb;
  --fb-border: #e5e7eb;
  --fb-input-bg: #ffffff;
  --fb-input-border: #d1d5db;
  --fb-input-text: #111827;
  --fb-ghost-bg: #f3f4f6;
  --fb-ghost-text: #374151;
  --fb-th-bg: #f9fafb;
  --fb-th-text: #6b7280;
  --fb-row-even: #f9fafb;
  --fb-cell-border: #f3f4f6;
  --fb-link: #2563eb;
  --fb-mono: #374151;
  --fb-star-off: #9ca3af;
  --fb-modal-bg: #ffffff;
  --fb-modal-text: #1f2937;
  --fb-modal-border: #e5e7eb;
  --fb-modal-input-bg: #f9fafb;
  --fb-pager-select-bg: #ffffff;
  --fb-pager-select-border: #d1d5db;
  --fb-pager-select-text: #111827;
  --fb-code-border: #e5e7eb;
  --fb-dash-card-bg: #ffffff;
  --fb-dash-card-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  --fb-dash-stat-value: #1a1a2e;
  --fb-dash-stat-label: #6b7280;
  --fb-dash-card-header-border: #f3f4f6;
  --fb-dash-table-border: #f3f4f6;
  --fb-dash-table-th: #6b7280;
  --fb-dash-table-td: #374151;
  --fb-dash-view-all: #1877f2;
  --sidebar-bg: #ffffff;
  --sidebar-text: #0f172a;
  --sidebar-muted: #64748b;
  --sidebar-border: #e2e8f0;
  --sidebar-nav-hover: #f1f5f9;
  --sidebar-logo: #0f172a;
}

.site-container.theme-dark {
  --fb-content-header-bg: #111827;
  --fb-content-header-text: #e5e7eb;
  --fb-content-header-border: #1e293b;
  --fb-content-body-bg: #0b1220;
  --fb-content-body-text: #e5e7eb;
  --fb-user-pill-bg: #1e293b;
  --fb-user-pill-text: #e5e7eb;
  --fb-btn-secondary-bg: #1e293b;
  --fb-btn-secondary-text: #e5e7eb;
  --fb-btn-secondary-hover: #334155;
}

.sidebar {
  width: 240px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
}
.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--sidebar-border);
}
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--sidebar-text);
}
.logo-spider {
  flex-shrink: 0;
  color: var(--sidebar-logo);
}
.sidebar-nav { flex: 1; padding: 10px; }
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.3s;
  font-size: 14px;
}
.nav-item:hover {
  background: var(--sidebar-nav-hover);
  color: var(--sidebar-text);
}
.nav-item.active { background: #1877f2; color: #fff; }
.nav-icon { font-size: 18px; }
.nav-label { font-weight: 500; }
.main-content {
  flex: 1;
  margin-left: 240px;
  min-height: 100vh;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}
.content-header {
  flex-shrink: 0;
  background: var(--fb-content-header-bg);
  color: var(--fb-content-header-text);
  padding: 20px 30px;
  border-bottom: 1px solid var(--fb-content-header-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.content-header h1 { font-size: 24px; color: var(--fb-content-header-text); margin: 0; }
.header-actions { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
.accounts-header-meta {
  font-size: 13px;
  color: var(--fb-muted, #9ca3af);
  white-space: nowrap;
}
.btn-header-update {
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
}
.btn-header-update:hover:not(:disabled) {
  filter: brightness(1.08);
}
.btn-header-update:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.theme-switch {
  display: inline-flex;
  border-radius: 8px;
  border: 1px solid var(--fb-content-header-border);
  overflow: hidden;
  background: var(--fb-user-pill-bg);
}
.theme-switch-btn {
  border: none;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
  color: var(--fb-content-header-text);
  opacity: 0.75;
}
.theme-switch-btn:hover { opacity: 1; }
.theme-switch-btn.active {
  background: #1877f2;
  color: #fff;
  opacity: 1;
}
.btn { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.3s; }
.btn-secondary {
  background: var(--fb-btn-secondary-bg);
  color: var(--fb-btn-secondary-text);
}
.btn-secondary:hover { background: var(--fb-btn-secondary-hover); }
.user-info {
  padding: 8px 16px;
  background: var(--fb-user-pill-bg);
  border-radius: 20px;
  font-size: 14px;
  color: var(--fb-user-pill-text);
}
.content-body {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
  padding: 24px 30px;
  background: var(--fb-content-body-bg);
  color: var(--fb-content-body-text);
}
.content-body--accounts-gate {
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
.site-container.theme-light .accounts-gate-overlay {
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
