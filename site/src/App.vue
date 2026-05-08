<script lang="ts" setup>
import { ref } from 'vue';
import Dashboard from './pages/Dashboard.vue';
import AccountManagement from './pages/AccountManagement.vue';
import PixelSharing from './pages/PixelSharing.vue';

const currentPage = ref('dashboard');

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
  <div class="site-container">
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
.site-container { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #fff; flex-direction: column; position: fixed; left: 0; top: 0; bottom: 0; display: flex; }
.sidebar-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.logo { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
.sidebar-nav { flex: 1; padding: 10px; }
.nav-item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: none; background: transparent; color: rgba(255,255,255,0.7); cursor: pointer; border-radius: 8px; transition: all 0.3s; font-size: 14px; }
.nav-item:hover { background: rgba(255,255,255,0.1); color: #fff; }
.nav-item.active { background: #1877f2; color: #fff; }
.nav-icon { font-size: 18px; }
.nav-label { font-weight: 500; }
.main-content { flex: 1; margin-left: 240px; min-height: 100vh; }
.content-header { background: #fff; padding: 20px 30px; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; }
.content-header h1 { font-size: 24px; color: #1a1a2e; }
.header-actions { display: flex; align-items: center; gap: 15px; }
.btn { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.3s; }
.btn-secondary { background: #f3f4f6; color: #374151; }
.btn-secondary:hover { background: #e5e7eb; }
.user-info { padding: 8px 16px; background: #f9fafb; border-radius: 20px; font-size: 14px; color: #374151; }
.content-body { padding: 24px 30px; }
</style>
