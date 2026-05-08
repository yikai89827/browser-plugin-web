<script lang="ts" setup>
import { ref, onMounted } from 'vue';

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
  isReceived: boolean;
}

const activeTab = ref<'pixels' | 'sharing'>('pixels');
const activeShareTab = ref<'sent' | 'received'>('received');

const pixels = ref<Pixel[]>([]);
const shares = ref<Share[]>([]);
const showAddPixelModal = ref(false);
const showShareModal = ref(false);
const pixelFormData = ref({ name: '', id: '' });
const shareFormData = ref({ pixelId: '', pixelName: '', email: '' });

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN');
};

const loadMockData = () => {
  pixels.value = [
    { id: 'pixel_1', name: '网站像素A', isActive: true, conversions: 456 },
    { id: 'pixel_2', name: '网站像素B', isActive: true, conversions: 234 },
    { id: 'pixel_3', name: '网站像素C', isActive: false, conversions: 123 },
    { id: 'pixel_4', name: '网站像素D', isActive: true, conversions: 789 },
  ];
  
  shares.value = [
    { id: 'share_1', pixelName: '网站像素A', email: 'user@example.com', status: 'pending', createdAt: Date.now() - 3600000, isReceived: true },
    { id: 'share_2', pixelName: '网站像素B', email: 'test@example.com', status: 'pending', createdAt: Date.now() - 7200000, isReceived: true },
    { id: 'share_3', pixelName: '网站像素C', email: 'admin@company.com', status: 'accepted', createdAt: Date.now() - 86400000, isReceived: true },
    { id: 'share_4', pixelName: '网站像素A', email: 'partner@business.com', status: 'pending', createdAt: Date.now() - 1800000, isReceived: false },
    { id: 'share_5', pixelName: '网站像素B', email: 'client@agency.com', status: 'accepted', createdAt: Date.now() - 43200000, isReceived: false },
  ];
};

const savePixel = () => {
  if (!pixelFormData.value.name || !pixelFormData.value.id) {
    alert('请填写像素名称和ID');
    return;
  }
  pixels.value.push({
    id: pixelFormData.value.id,
    name: pixelFormData.value.name,
    isActive: true,
    conversions: 0
  });
  pixelFormData.value = { name: '', id: '' };
  showAddPixelModal.value = false;
};

const togglePixelStatus = (pixel: Pixel) => {
  pixel.isActive = !pixel.isActive;
};

const deletePixel = (id: string) => {
  if (confirm('确定要删除这个像素吗？')) {
    pixels.value = pixels.value.filter(p => p.id !== id);
  }
};

const filteredShares = () => {
  if (activeShareTab.value === 'received') {
    return shares.value.filter(s => s.isReceived);
  }
  return shares.value.filter(s => !s.isReceived);
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '待处理';
    case 'accepted': return '已接受';
    case 'rejected': return '已拒绝';
    default: return status;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'pending': return 'pending';
    case 'accepted': return 'accepted';
    case 'rejected': return 'rejected';
    default: return '';
  }
};

const sharePixel = () => {
  if (!shareFormData.value.pixelId || !shareFormData.value.email) {
    alert('请选择像素并输入接收者邮箱');
    return;
  }
  const pixel = pixels.value.find(p => p.id === shareFormData.value.pixelId);
  shares.value.unshift({
    id: Date.now().toString(),
    pixelName: pixel?.name || shareFormData.value.pixelId,
    email: shareFormData.value.email,
    status: 'pending',
    createdAt: Date.now(),
    isReceived: false
  });
  shareFormData.value = { pixelId: '', pixelName: '', email: '' };
  showShareModal.value = false;
};

const handleShareAction = (share: Share, action: 'accept' | 'reject') => {
  share.status = action === 'accept' ? 'accepted' : 'rejected';
};

onMounted(() => {
  loadMockData();
});
</script>

<template>
  <div class="pixel-sharing">
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'pixels' }" @click="activeTab = 'pixels'">像素管理</button>
      <button class="tab-btn" :class="{ active: activeTab === 'sharing' }" @click="activeTab = 'sharing'">分享管理</button>
    </div>
    
    <div v-if="activeTab === 'pixels'">
      <div class="action-bar">
        <button class="btn btn-primary" @click="showAddPixelModal = true">添加像素</button>
      </div>
      
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>像素名称</th>
              <th>像素ID</th>
              <th>状态</th>
              <th>转化数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pixel in pixels" :key="pixel.id">
              <td>{{ pixel.name }}</td>
              <td>{{ pixel.id }}</td>
              <td><button class="status-toggle" :class="{ active: pixel.isActive }" @click="togglePixelStatus(pixel)">{{ pixel.isActive ? '活跃' : '停用' }}</button></td>
              <td>{{ pixel.conversions }}</td>
              <td>
                <button class="action-btn edit">编辑</button>
                <button class="action-btn delete" @click="deletePixel(pixel.id)">删除</button>
              </td>
            </tr>
            <tr v-if="pixels.length === 0">
              <td colspan="5" class="empty">暂无像素数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div v-else>
      <div class="sub-tab-bar">
        <button class="tab-btn" :class="{ active: activeShareTab === 'received' }" @click="activeShareTab = 'received'">收到的分享请求</button>
        <button class="tab-btn" :class="{ active: activeShareTab === 'sent' }" @click="activeShareTab = 'sent'">发送的分享请求</button>
      </div>
      
      <div class="action-bar" v-if="activeShareTab === 'sent'">
        <button class="btn btn-primary" @click="showShareModal = true">分享像素</button>
      </div>
      
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>像素名称</th>
              <th>{{ activeShareTab === 'received' ? '分享者' : '接收者' }}</th>
              <th>状态</th>
              <th>请求时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="share in filteredShares()" :key="share.id">
              <td>{{ share.pixelName }}</td>
              <td>{{ share.email }}</td>
              <td><span class="status-badge" :class="getStatusClass(share.status)">{{ getStatusText(share.status) }}</span></td>
              <td>{{ formatDate(share.createdAt) }}</td>
              <td>
                <template v-if="share.status === 'pending'">
                  <button v-if="share.isReceived" class="action-btn accept" @click="handleShareAction(share, 'accept')">接受</button>
                  <button class="action-btn reject" @click="handleShareAction(share, 'reject')">{{ share.isReceived ? '拒绝' : '撤回' }}</button>
                </template>
                <span v-else class="no-action">-</span>
              </td>
            </tr>
            <tr v-if="filteredShares().length === 0">
              <td colspan="5" class="empty">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div v-if="showAddPixelModal" class="modal-overlay" @click.self="showAddPixelModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加像素</h3>
          <button class="close-btn" @click="showAddPixelModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>像素名称</label>
            <input type="text" v-model="pixelFormData.name" placeholder="输入像素名称" />
          </div>
          <div class="form-group">
            <label>像素ID</label>
            <input type="text" v-model="pixelFormData.id" placeholder="输入像素ID" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddPixelModal = false">取消</button>
          <button class="btn btn-primary" @click="savePixel">保存</button>
        </div>
      </div>
    </div>
    
    <div v-if="showShareModal" class="modal-overlay" @click.self="showShareModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>分享像素</h3>
          <button class="close-btn" @click="showShareModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择像素</label>
            <select v-model="shareFormData.pixelId">
              <option value="">请选择像素</option>
              <option v-for="pixel in pixels" :key="pixel.id" :value="pixel.id">{{ pixel.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>接收者邮箱</label>
            <input type="email" v-model="shareFormData.email" placeholder="输入接收者邮箱" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showShareModal = false">取消</button>
          <button class="btn btn-primary" @click="sharePixel">分享</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pixel-sharing { width: 100%; }
.tab-bar, .sub-tab-bar { display: flex; gap: 12px; margin-bottom: 20px; }
.tab-btn { padding: 10px 24px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer; font-size: 14px; font-weight: 500; color: #6b7280; transition: all 0.3s; }
.tab-btn:hover { background: #f3f4f6; }
.tab-btn.active { background: #1877f2; color: #fff; border-color: #1877f2; }
.action-bar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
.btn { padding: 10px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.3s; }
.btn-primary { background: #1877f2; color: #fff; }
.btn-primary:hover { background: #166fe5; }
.btn-secondary { background: #f3f4f6; color: #374151; }
.data-table-container { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
.data-table th { background: #f9fafb; font-weight: 600; color: #6b7280; }
.data-table td { color: #374151; }
.data-table .empty { text-align: center; color: #9ca3af; }
.status-toggle { padding: 6px 14px; border: none; border-radius: 20px; font-size: 12px; cursor: pointer; background: #fee2e2; color: #dc2626; }
.status-toggle.active { background: #d1fae5; color: #059669; }
.status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
.status-badge.pending { background: #fef3c7; color: #d97706; }
.status-badge.accepted { background: #d1fae5; color: #059669; }
.status-badge.rejected { background: #fee2e2; color: #dc2626; }
.action-btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; margin-right: 8px; }
.action-btn.edit { background: #e0f2fe; color: #0284c7; }
.action-btn.delete { background: #fee2e2; color: #dc2626; }
.action-btn.accept { background: #d1fae5; color: #059669; }
.action-btn.reject { background: #fee2e2; color: #dc2626; }
.no-action { color: #9ca3af; font-size: 12px; }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #fff; border-radius: 12px; width: 400px; max-width: 90%; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
.modal-header h3 { font-size: 18px; color: #1a1a2e; }
.close-btn { background: none; border: none; font-size: 24px; color: #9ca3af; cursor: pointer; }
.modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: #374151; }
.form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 20px; border-top: 1px solid #f3f4f6; }
</style>
