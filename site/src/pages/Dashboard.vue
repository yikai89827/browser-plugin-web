<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import DashboardAccountCard from '../components/DashboardAccountCard.vue';

interface Account {
  id: string;
  name: string;
  spend: number;
  ads: number;
  conversions: number;
  createdAt: number;
}

interface Pixel {
  id: string;
  name: string;
  isActive: boolean;
  conversions: number;
}

interface Share {
  id: string;
  pixelName: string;
  email: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

const stats = ref({
  totalAccounts: 0,
  totalPixels: 0,
  totalShares: 0,
  pendingRequests: 0,
});

const recentAccounts = ref<Account[]>([]);
const recentPixels = ref<Pixel[]>([]);
const pendingShares = ref<Share[]>([]);

const formatCurrency = (value: number) => {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2 });
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN');
};

const loadMockData = () => {
  recentAccounts.value = [
    { id: '123456', name: '广告账户一', spend: 12500.50, ads: 15, conversions: 234, createdAt: Date.now() - 86400000 },
    { id: '789012', name: '广告账户二', spend: 8900.00, ads: 10, conversions: 156, createdAt: Date.now() - 172800000 },
    { id: '345678', name: '广告账户三', spend: 15600.75, ads: 12, conversions: 312, createdAt: Date.now() - 259200000 },
  ];
  
  recentPixels.value = [
    { id: 'pixel_1', name: '网站像素A', isActive: true, conversions: 456 },
    { id: 'pixel_2', name: '网站像素B', isActive: true, conversions: 234 },
    { id: 'pixel_3', name: '网站像素C', isActive: false, conversions: 123 },
  ];
  
  pendingShares.value = [
    { id: 'share_1', pixelName: '网站像素A', email: 'user@example.com', status: 'pending', createdAt: Date.now() - 3600000 },
    { id: 'share_2', pixelName: '网站像素B', email: 'test@example.com', status: 'pending', createdAt: Date.now() - 7200000 },
  ];
  
  stats.value = {
    totalAccounts: 5,
    totalPixels: 8,
    totalShares: 12,
    pendingRequests: 2,
  };
};

onMounted(() => {
  loadMockData();
});
</script>

<template>
  <div class="dashboard">
    <DashboardAccountCard />

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon accounts">👤</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalAccounts }}</div>
          <div class="stat-label">广告账户</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon pixels">🔍</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalPixels }}</div>
          <div class="stat-label">像素数量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon shares">🔗</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalShares }}</div>
          <div class="stat-label">分享记录</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon pending">⏳</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.pendingRequests }}</div>
          <div class="stat-label">待处理请求</div>
        </div>
      </div>
    </div>
    
    <div class="dashboard-grid">
      <div class="data-card">
        <div class="card-header">
          <h2>最近添加的账户</h2>
          <button class="view-all">查看全部</button>
        </div>
        <div class="card-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>账户名称</th>
                <th>花费</th>
                <th>广告数</th>
                <th>转化数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in recentAccounts" :key="account.id">
                <td>{{ account.name }}</td>
                <td>{{ formatCurrency(account.spend) }}</td>
                <td>{{ account.ads }}</td>
                <td>{{ account.conversions }}</td>
              </tr>
              <tr v-if="recentAccounts.length === 0">
                <td colspan="4" class="empty">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="data-card">
        <div class="card-header">
          <h2>最近添加的像素</h2>
          <button class="view-all">查看全部</button>
        </div>
        <div class="card-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>像素名称</th>
                <th>状态</th>
                <th>转化数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pixel in recentPixels" :key="pixel.id">
                <td>{{ pixel.name }}</td>
                <td><span class="status-badge" :class="{ active: pixel.isActive }">{{ pixel.isActive ? '活跃' : '停用' }}</span></td>
                <td>{{ pixel.conversions }}</td>
              </tr>
              <tr v-if="recentPixels.length === 0">
                <td colspan="3" class="empty">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="data-card">
        <div class="card-header">
          <h2>待处理分享请求</h2>
          <button class="view-all">查看全部</button>
        </div>
        <div class="card-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>像素名称</th>
                <th>请求者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="share in pendingShares" :key="share.id">
                <td>{{ share.pixelName }}</td>
                <td>{{ share.email }}</td>
                <td>
                  <button class="action-btn accept">接受</button>
                  <button class="action-btn reject">拒绝</button>
                </td>
              </tr>
              <tr v-if="pendingShares.length === 0">
                <td colspan="3" class="empty">暂无待处理请求</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { width: 100%; min-width: 0; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 24px; }
.stat-card {
  background: var(--fb-dash-card-bg, #fff);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--fb-dash-card-shadow, 0 2px 8px rgba(0,0,0,0.05));
}
.stat-icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.stat-icon.accounts { background: linear-gradient(135deg, #1877f2, #166fe5); }
.stat-icon.pixels { background: linear-gradient(135deg, #00d4aa, #00b894); }
.stat-icon.shares { background: linear-gradient(135deg, #ff9f43, #ee5a24); }
.stat-icon.pending { background: linear-gradient(135deg, #ffa502, #ff7f50); }
.stat-value { font-size: 28px; font-weight: 700; color: var(--fb-dash-stat-value, #1a1a2e); }
.stat-label { font-size: 14px; color: var(--fb-dash-stat-label, #6b7280); }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
.data-card {
  background: var(--fb-dash-card-bg, #fff);
  border-radius: 12px;
  box-shadow: var(--fb-dash-card-shadow, 0 2px 8px rgba(0,0,0,0.05));
  overflow: hidden;
}
.card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--fb-dash-card-header-border, #f3f4f6); }
.card-header h2 { font-size: 16px; color: var(--fb-dash-stat-value, #1a1a2e); }
.view-all { background: none; border: none; color: var(--fb-dash-view-all, #1877f2); font-size: 14px; cursor: pointer; }
.card-body { padding: 16px; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 12px 8px; text-align: left; border-bottom: 1px solid var(--fb-dash-table-border, #f3f4f6); font-size: 14px; }
.data-table th { font-weight: 600; color: var(--fb-dash-table-th, #6b7280); }
.data-table td { color: var(--fb-dash-table-td, #374151); }
.data-table .empty { text-align: center; color: var(--fb-muted, #9ca3af); }
.status-badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; background: #fee2e2; color: #dc2626; }
.status-badge.active { background: #d1fae5; color: #059669; }
.action-btn { padding: 4px 10px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; margin-right: 8px; }
.action-btn.accept { background: #d1fae5; color: #059669; }
.action-btn.reject { background: #fee2e2; color: #dc2626; }
</style>
