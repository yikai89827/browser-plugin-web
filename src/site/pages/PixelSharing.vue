<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { browserStorage } from '../../utils/storage';

interface Pixel {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  isActive: boolean;
  conversions: number;
  createdAt: number;
}

interface Share {
  id: string;
  pixelId: string;
  pixelName: string;
  email: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  isReceived: boolean;
}

// 标签切换
const activeTab = ref<'pixels' | 'sharing'>('pixels');

// 像素数据
const pixels = ref<Pixel[]>([]);
const showAddPixelModal = ref(false);
const editingPixel = ref<Pixel | null>(null);
const pixelFormData = ref({
  name: '',
  id: '',
  accountId: '',
  accountName: ''
});

// 分享数据
const shares = ref<Share[]>([]);
const activeShareTab = ref<'sent' | 'received'>('received');
const showShareModal = ref(false);
const shareFormData = ref({
  pixelId: '',
  pixelName: '',
  email: ''
});

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN');
};

// 加载像素数据
const loadPixels = async () => {
  try {
    const data = await browserStorage.get('fb_control_pixels');
    pixels.value = data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('加载像素失败:', error);
  }
};

// 保存像素
const savePixel = async () => {
  if (!pixelFormData.value.name || !pixelFormData.value.id) {
    alert('请填写像素名称和ID');
    return;
  }

  const newPixel: Pixel = {
    id: pixelFormData.value.id,
    name: pixelFormData.value.name,
    accountId: pixelFormData.value.accountId,
    accountName: pixelFormData.value.accountName,
    isActive: true,
    conversions: 0,
    createdAt: Date.now()
  };

  if (editingPixel.value) {
    const index = pixels.value.findIndex(p => p.id === editingPixel.value!.id);
    if (index !== -1) {
      pixels.value[index] = { ...newPixel, createdAt: pixels.value[index].createdAt };
    }
  } else {
    pixels.value.push(newPixel);
  }

  await browserStorage.set('fb_control_pixels', JSON.stringify(pixels.value));
  resetPixelForm();
  showAddPixelModal.value = false;
};

// 编辑像素
const editPixel = (pixel: Pixel) => {
  editingPixel.value = pixel;
  pixelFormData.value = {
    name: pixel.name,
    id: pixel.id,
    accountId: pixel.accountId,
    accountName: pixel.accountName
  };
  showAddPixelModal.value = true;
};

// 切换像素状态
const togglePixelStatus = async (pixel: Pixel) => {
  pixel.isActive = !pixel.isActive;
  await browserStorage.set('fb_control_pixels', JSON.stringify(pixels.value));
};

// 删除像素
const deletePixel = async (id: string) => {
  if (confirm('确定要删除这个像素吗？')) {
    pixels.value = pixels.value.filter(p => p.id !== id);
    await browserStorage.set('fb_control_pixels', JSON.stringify(pixels.value));
  }
};

// 重置像素表单
const resetPixelForm = () => {
  pixelFormData.value = {
    name: '',
    id: '',
    accountId: '',
    accountName: ''
  };
  editingPixel.value = null;
};

// 加载分享数据
const loadShares = async () => {
  try {
    const receivedData = await browserStorage.get('fb_control_received_shares');
    const receivedShares = receivedData ? JSON.parse(receivedData) : [];
    
    const sentData = await browserStorage.get('fb_control_sent_shares');
    const sentShares = sentData ? JSON.parse(sentData) : [];
    
    shares.value = [
      ...receivedShares.map((s: Share) => ({ ...s, isReceived: true })),
      ...sentShares.map((s: Share) => ({ ...s, isReceived: false }))
    ];
  } catch (error) {
    console.error('加载分享记录失败:', error);
  }
};

// 分享操作
const handleShareAction = async (share: Share, action: 'accept' | 'reject' | 'revoke') => {
  if (action === 'accept') {
    share.status = 'accepted';
  } else if (action === 'reject') {
    share.status = 'rejected';
  } else {
    share.status = 'rejected';
  }

  if (share.isReceived) {
    const receivedShares = shares.value.filter(s => s.isReceived);
    await browserStorage.set('fb_control_received_shares', JSON.stringify(receivedShares));
  } else {
    const sentShares = shares.value.filter(s => !s.isReceived);
    await browserStorage.set('fb_control_sent_shares', JSON.stringify(sentShares));
  }
};

// 分享像素
const sharePixel = async () => {
  if (!shareFormData.value.pixelId || !shareFormData.value.email) {
    alert('请选择像素并输入接收者邮箱');
    return;
  }

  const newShare: Share = {
    id: Date.now().toString(),
    pixelId: shareFormData.value.pixelId,
    pixelName: shareFormData.value.pixelName,
    email: shareFormData.value.email,
    status: 'pending',
    createdAt: Date.now(),
    isReceived: false
  };

  shares.value.unshift(newShare);
  
  const sentShares = shares.value.filter(s => !s.isReceived);
  await browserStorage.set('fb_control_sent_shares', JSON.stringify(sentShares));
  
  resetShareForm();
  showShareModal.value = false;
};

// 重置分享表单
const resetShareForm = () => {
  shareFormData.value = {
    pixelId: '',
    pixelName: '',
    email: ''
  };
};

// 选择像素时更新名称
const onPixelSelect = () => {
  const pixel = pixels.value.find(p => p.id === shareFormData.value.pixelId);
  if (pixel) {
    shareFormData.value.pixelName = pixel.name;
  }
};

// 过滤分享列表
const filteredShares = () => {
  if (activeShareTab.value === 'received') {
    return shares.value.filter(s => s.isReceived);
  }
  return shares.value.filter(s => !s.isReceived);
};

// 获取状态文本
const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '待处理';
    case 'accepted': return '已接受';
    case 'rejected': return '已拒绝';
    default: return status;
  }
};

// 获取状态样式
const getStatusClass = (status: string) => {
  switch (status) {
    case 'pending': return 'pending';
    case 'accepted': return 'accepted';
    case 'rejected': return 'rejected';
    default: return '';
  }
};

onMounted(() => {
  loadPixels();
  loadShares();
});
</script>

<template>
  <div class="pixel-sharing">
    <!-- 主标签切换 -->
    <div class="tab-bar">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'pixels' }"
        @click="activeTab = 'pixels'"
      >
        像素管理
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'sharing' }"
        @click="activeTab = 'sharing'"
      >
        分享管理
      </button>
    </div>
    
    <!-- 像素管理 -->
    <div v-if="activeTab === 'pixels'">
      <div class="action-bar">
        <button class="btn btn-primary" @click="showAddPixelModal = true">
          添加像素
        </button>
      </div>
      
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>像素名称</th>
              <th>像素ID</th>
              <th>所属账户</th>
              <th>状态</th>
              <th>转化数</th>
              <th>添加时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pixel in pixels" :key="pixel.id">
              <td>{{ pixel.name }}</td>
              <td>{{ pixel.id }}</td>
              <td>{{ pixel.accountName || pixel.accountId }}</td>
              <td>
                <button 
                  class="status-toggle" 
                  :class="{ active: pixel.isActive }"
                  @click="togglePixelStatus(pixel)"
                >
                  {{ pixel.isActive ? '活跃' : '停用' }}
                </button>
              </td>
              <td>{{ pixel.conversions }}</td>
              <td>{{ formatDate(pixel.createdAt) }}</td>
              <td>
                <button class="action-btn edit" @click="editPixel(pixel)">编辑</button>
                <button class="action-btn delete" @click="deletePixel(pixel.id)">删除</button>
              </td>
            </tr>
            <tr v-if="pixels.length === 0">
              <td colspan="7" class="empty">暂无像素数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- 分享管理 -->
    <div v-else>
      <div class="sub-tab-bar">
        <button 
          class="tab-btn" 
          :class="{ active: activeShareTab === 'received' }"
          @click="activeShareTab = 'received'"
        >
          收到的分享请求
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeShareTab === 'sent' }"
          @click="activeShareTab = 'sent'"
        >
          发送的分享请求
        </button>
      </div>
      
      <div class="action-bar" v-if="activeShareTab === 'sent'">
        <button class="btn btn-primary" @click="showShareModal = true">
          分享像素
        </button>
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
              <td>
                <span class="status-badge" :class="getStatusClass(share.status)">
                  {{ getStatusText(share.status) }}
                </span>
              </td>
              <td>{{ formatDate(share.createdAt) }}</td>
              <td>
                <template v-if="share.status === 'pending'">
                  <button 
                    v-if="share.isReceived"
                    class="action-btn accept" 
                    @click="handleShareAction(share, 'accept')"
                  >接受</button>
                  <button 
                    class="action-btn reject" 
                    @click="handleShareAction(share, share.isReceived ? 'reject' : 'revoke')"
                  >{{ share.isReceived ? '拒绝' : '撤回' }}</button>
                </template>
                <span v-else class="no-action">-</span>
              </td>
            </tr>
            <tr v-if="filteredShares().length === 0">
              <td colspan="5" class="empty">
                {{ activeShareTab === 'received' ? '暂无收到的分享请求' : '暂无发送的分享请求' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- 添加/编辑像素弹窗 -->
    <div v-if="showAddPixelModal" class="modal-overlay" @click.self="showAddPixelModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingPixel ? '编辑像素' : '添加像素' }}</h3>
          <button class="close-btn" @click="showAddPixelModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>像素名称</label>
            <input 
              type="text" 
              v-model="pixelFormData.name" 
              placeholder="输入像素名称"
            />
          </div>
          <div class="form-group">
            <label>像素ID</label>
            <input 
              type="text" 
              v-model="pixelFormData.id" 
              placeholder="输入像素ID"
              :disabled="!!editingPixel"
            />
          </div>
          <div class="form-group">
            <label>所属账户ID</label>
            <input 
              type="text" 
              v-model="pixelFormData.accountId" 
              placeholder="输入账户ID"
            />
          </div>
          <div class="form-group">
            <label>账户名称</label>
            <input 
              type="text" 
              v-model="pixelFormData.accountName" 
              placeholder="输入账户名称"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddPixelModal = false">取消</button>
          <button class="btn btn-primary" @click="savePixel">保存</button>
        </div>
      </div>
    </div>
    
    <!-- 分享像素弹窗 -->
    <div v-if="showShareModal" class="modal-overlay" @click.self="showShareModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>分享像素</h3>
          <button class="close-btn" @click="showShareModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择像素</label>
            <select v-model="shareFormData.pixelId" @change="onPixelSelect">
              <option value="">请选择像素</option>
              <option v-for="pixel in pixels" :key="pixel.id" :value="pixel.id">
                {{ pixel.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>接收者邮箱</label>
            <input 
              type="email" 
              v-model="shareFormData.email" 
              placeholder="输入接收者邮箱"
            />
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
.pixel-sharing {
  width: 100%;
}

.tab-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.sub-tab-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.tab-btn {
  padding: 10px 24px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.3s;
}

.tab-btn:hover {
  background: #f3f4f6;
}

.tab-btn.active {
  background: #1877f2;
  color: #fff;
  border-color: #1877f2;
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.btn-primary {
  background: #1877f2;
  color: #fff;
}

.btn-primary:hover {
  background: #166fe5;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.data-table-container {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
}

.data-table th {
  background: #f9fafb;
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

.status-toggle {
  padding: 6px 14px;
  border: none;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  background: #fee2e2;
  color: #dc2626;
}

.status-toggle.active {
  background: #d1fae5;
  color: #059669;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background: #fef3c7;
  color: #d97706;
}

.status-badge.accepted {
  background: #d1fae5;
  color: #059669;
}

.status-badge.rejected {
  background: #fee2e2;
  color: #dc2626;
}

.action-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  margin-right: 8px;
}

.action-btn.edit {
  background: #e0f2fe;
  color: #0284c7;
}

.action-btn.delete {
  background: #fee2e2;
  color: #dc2626;
}

.action-btn.accept {
  background: #d1fae5;
  color: #059669;
}

.action-btn.reject {
  background: #fee2e2;
  color: #dc2626;
}

.no-action {
  color: #9ca3af;
  font-size: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 400px;
  max-width: 90%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.modal-header h3 {
  font-size: 18px;
  color: #1a1a2e;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #9ca3af;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.form-group input:disabled {
  background: #f3f4f6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #f3f4f6;
}
</style>
