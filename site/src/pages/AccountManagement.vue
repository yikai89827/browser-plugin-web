<script lang="ts" setup>
import { ref, onMounted } from 'vue';

interface Account {
  id: string;
  name: string;
  spend: number;
  ads: number;
  conversions: number;
  createdAt: number;
}

const accounts = ref<Account[]>([]);
const showAddModal = ref(false);
const formData = ref({ name: '', id: '' });
const searchQuery = ref('');

const formatCurrency = (value: number) => {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2 });
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN');
};

const loadMockData = () => {
  accounts.value = [
    { id: '123456', name: '广告账户一', spend: 12500.50, ads: 15, conversions: 234, createdAt: Date.now() - 86400000 },
    { id: '789012', name: '广告账户二', spend: 8900.00, ads: 10, conversions: 156, createdAt: Date.now() - 172800000 },
    { id: '345678', name: '广告账户三', spend: 15600.75, ads: 12, conversions: 312, createdAt: Date.now() - 259200000 },
    { id: '901234', name: '广告账户四', spend: 6780.25, ads: 8, conversions: 89, createdAt: Date.now() - 345600000 },
  ];
};

const saveAccount = () => {
  if (!formData.value.name || !formData.value.id) {
    alert('请填写账户名称和ID');
    return;
  }
  accounts.value.push({
    id: formData.value.id,
    name: formData.value.name,
    spend: 0,
    ads: 0,
    conversions: 0,
    createdAt: Date.now()
  });
  formData.value = { name: '', id: '' };
  showAddModal.value = false;
};

const deleteAccount = (id: string) => {
  if (confirm('确定要删除这个账户吗？')) {
    accounts.value = accounts.value.filter(a => a.id !== id);
  }
};

onMounted(() => {
  loadMockData();
});
</script>

<template>
  <div class="account-management">
    <div class="action-bar">
      <div class="search-box">
        <input type="text" v-model="searchQuery" placeholder="搜索账户名称或ID..." />
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">添加账户</button>
    </div>
    
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>账户名称</th>
            <th>账户ID</th>
            <th>花费</th>
            <th>广告数</th>
            <th>转化数</th>
            <th>添加时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="account in accounts" :key="account.id">
            <td>{{ account.name }}</td>
            <td>{{ account.id }}</td>
            <td>{{ formatCurrency(account.spend) }}</td>
            <td>{{ account.ads }}</td>
            <td>{{ account.conversions }}</td>
            <td>{{ formatDate(account.createdAt) }}</td>
            <td>
              <button class="action-btn edit">编辑</button>
              <button class="action-btn delete" @click="deleteAccount(account.id)">删除</button>
            </td>
          </tr>
          <tr v-if="accounts.length === 0">
            <td colspan="7" class="empty">暂无账户数据</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加账户</h3>
          <button class="close-btn" @click="showAddModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>账户名称</label>
            <input type="text" v-model="formData.name" placeholder="输入账户名称" />
          </div>
          <div class="form-group">
            <label>账户ID</label>
            <input type="text" v-model="formData.id" placeholder="输入账户ID" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="saveAccount">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-management { width: 100%; }
.action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.search-box input { padding: 10px 16px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; width: 300px; }
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
.action-btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; margin-right: 8px; }
.action-btn.edit { background: #e0f2fe; color: #0284c7; }
.action-btn.delete { background: #fee2e2; color: #dc2626; }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #fff; border-radius: 12px; width: 400px; max-width: 90%; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
.modal-header h3 { font-size: 18px; color: #1a1a2e; }
.close-btn { background: none; border: none; font-size: 24px; color: #9ca3af; cursor: pointer; }
.modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: #374151; }
.form-group input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 20px; border-top: 1px solid #f3f4f6; }
</style>
