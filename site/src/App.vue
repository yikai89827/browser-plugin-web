<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue';
import Dashboard from './pages/Dashboard.vue';
import AccountManagement from './pages/AccountManagement.vue';
import PixelSharing from './pages/PixelSharing.vue';

const THEME_KEY = 'fb_admin_theme';

const currentPage = ref('dashboard');
const theme = ref<'dark' | 'light'>('dark');

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

const handleNavClick = (pageId: string) => {
  currentPage.value = pageId;
};
</script>

<template>
  <div class="site-container" :class="theme === 'dark' ? 'theme-dark' : 'theme-light'">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.31.1-2.64 0 0 .84-.27 2.75 1.02A9.578 9.578 0 0112 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.33.2 2.38.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.56 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48C19.13 20.17 22 16.42 22 12c0-5.52-4.48-10-10-10z" fill="#1877f2"/>
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
          <button class="btn btn-secondary">设置</button>
          <div class="user-info">
            <span>管理员</span>
          </div>
        </div>
      </header>
      
      <div class="content-body">
        <Dashboard v-if="currentPage === 'dashboard'" />
        <AccountManagement v-else-if="currentPage === 'accounts'" />
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

.sidebar { width: 240px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #fff; flex-direction: column; position: fixed; left: 0; top: 0; bottom: 0; display: flex; }
.sidebar-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.logo { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
.sidebar-nav { flex: 1; padding: 10px; }
.nav-item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: none; background: transparent; color: rgba(255,255,255,0.7); cursor: pointer; border-radius: 8px; transition: all 0.3s; font-size: 14px; }
.nav-item:hover { background: rgba(255,255,255,0.1); color: #fff; }
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
</style>
