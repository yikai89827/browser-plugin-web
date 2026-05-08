<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { browserStorage } from '../../utils/storage';

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
  accountId: string;
  isActive: boolean;
  conversions: number;
}

interface Share {
  id: string;
  pixelId: string;
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

const loadData = async () => {
  try {
    // 获取账户数据
    const accountsData = await browserStorage.get('fb_control_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];
    stats.value.totalAccounts = accounts.length;
    recentAccounts.value = accounts.slice(0, 5);
    
    // 获取像素数据
    const pixelsData = await browserStorage.get('fb_control_pixels');
    const pixels = pixelsData ? JSON.parse(pixelsData) : [];
    stats.value.totalPixels = pixels.length;
    recentPixels.value = pixels.slice(0, 5);
    
    // 获取分享数据
    const sharesData = await browserStorage.get('fb_control_received_shares');
    const shares = sharesData ? JSON.parse(sharesData) : [];
    stats.value.totalShares = shares.length;
    pendingShares.value = shares.filter((s: Share) => s.status === 'pending').slice(0, 5);
    stats.value.pendingRequests = pendingShares.value.length;
  } catch (error) {
    console.error('加载数据失败:', error);
  }
};

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon accounts">
          👤
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalAccounts }}</div>
          <div class="stat-label">广告账户</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon pixels">
          🔍
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalPixels }}</div>
          <div class="stat-label">像素数量</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon shares">
          🔗
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalShares }}</div>
          <div class="stat-label">分享记录</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon pending">
          ⏳
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.pendingRequests }}</div>
          <div class="stat-label">待处理请求</div>
        </div>
      </div>
    </div>
    
    <!-- 数据表格区域 -->
    <div class="dashboard-grid">
      <!-- 最近账户 -->
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
                <th>添加时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in recentAccounts" :key="account.id">
                <td>{{ account.name }}</td>
                <td>{{ formatCurrency(account.spend) }}</td>
                <td>{{ account.ads }}</td>
                <td>{{ account.conversions }}</td>
                <td>{{ formatDate(account.createdAt) }}</td>
              </tr>
              <tr v-if="recentAccounts.length === 0">
                <td colspan="5" class="empty">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- 最近像素 -->
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
                <td>
                  <span class="status-badge" :class="{ active: pixel.isActive }">
                    {{ pixel.isActive ? '活跃' : '停用' }}
                  </span>
                </td>
                <td>{{ pixel.conversions }}</td>
              </tr>
              <tr v-if="recentPixels.length === 0">
                <td colspan="3" class="empty">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- 待处理分享请求 -->
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
                <th>请求时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="share in pendingShares" :key="share.id">
                <td>{{ share.pixelName }}</td>
                <td>{{ share.email }}</td>
                <td>{{ formatDate(share.createdAt) }}</td>
                <td>
                  <button class="action-btn accept">接受</button>
                  <button class="action-btn reject">拒绝</button>
                </td>
              </tr>
              <tr v-if="pendingShares.length === 0">
                <td colspan="4" class="empty">暂无待处理请求</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100%;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.stat-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.accounts {
  background: linear-gradient(135deg, #1877f2, #166fe5);
}

.stat-icon.pixels {
  background: linear-gradient(135deg, #00d4aa, #00b894);
}

.stat-icon.shares {
  background: linear-gradient(135deg, #ff9f43, #ee5a24);
}

.stat-icon.pending {
  background: linear-gradient(135deg, #ffa502, #ff7f50);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.data-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.card-header h2 {
  font-size: 16px;
  color: #1a1a2e;
}

.view-all {
  background: none;
  border: none;
  color: #1877f2;
  font-size: 14px;
  cursor: pointer;
}

.card-body {
  padding: 16px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
}

.data-table th {
  font-weight: 600;
  color: #6b7280;
}

.data-table td {
  color: #374151;
}

.data-table .empty {
  text-align: center;
  color: #9ca3af;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  background: #fee2e2;
  color: #dc2626;
}

.status-badge.active {
  background: #d1fae5;
  color: #059669;
}

.action-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  margin-right: 8px;
}

.action-btn.accept {
  background: #d1fae5;
  color: #059669;
}

.action-btn.reject {
  background: #fee2e2;
  color: #dc2626;
}
</style>
