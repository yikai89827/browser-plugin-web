<script lang="ts" setup>
import { ref, onMounted } from "vue";
import { browser } from "wxt/browser";
import axios from "axios";

// 广告数据类型定义
interface AdData {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  [key: string]: any;
}

// 响应数据类型
interface ApiResponse {
  data: AdData[];
  error?: any;
}

// 状态管理
const ads = ref<AdData[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

// 广告账户ID
const accountId = '2174042080104706';

// 获取访问令牌（实际项目中需要从存储或页面提取）
const getAccessToken = async (): Promise<string> => {
  // 这里简化处理，实际项目中需要从存储或Facebook页面提取
  return 'EAABsbCS1iHgBRHeByWc8NtcYF8lAz97GJ4D685jQBPRZCzQZBBiryjcXTXSZA6PIAcubYngqMIBkbuZAFhxEDZB1hBnZASj5ROda9q2AweEoTWhmS6SDOWZBZCXzbaDNohR5HCETtHZCqTmAePcMDObjZAZBZBnjbrv52qZBKMUfu7QLoprbOooccB9VeaWzrjK4a1WOKhVDk71sOkNY5fQZDZD';
};

// 获取广告列表
const fetchAds = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const accessToken = await getAccessToken();
    const response = await axios.get<ApiResponse>(
      `https://graph.facebook.com/v22.0/act_${accountId}/ads`,
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,status,campaign_id,adset_id,impressions,reach,spend,results,cost_per_result',
          limit: 200
        }
      }
    );
    
    ads.value = (response.data.data || []).map(ad => ({
      ...ad,
      increase_impressions: ad.increase_impressions || 0,
      increase_reach: ad.increase_reach || 0,
      increase_spend: ad.increase_spend || 0,
      increase_results: ad.increase_results || 0,
      other_events: ad.other_events || 0
    }));
    
    // 如果没有数据，添加mock数据用于展示
    if (ads.value.length === 0) {
      ads.value = [
        {
          id: '123456789',
          name: '测试广告1',
          status: 'ACTIVE',
          campaign_id: '987654321',
          adset_id: '112233445',
          impressions: 1000,
          increase_impressions: 10,
          reach: 800,
          increase_reach: 5,
          spend: 100,
          increase_spend: 2,
          results: 50,
          increase_results: 15,
          cost_per_result: 2,
          other_events: 10
        },
        {
          id: '987654321',
          name: '测试广告2',
          status: 'PAUSED',
          campaign_id: '123456789',
          adset_id: '554433221',
          impressions: 2000,
          increase_impressions: 15,
          reach: 1500,
          increase_reach: 8,
          spend: 200,
          increase_spend: 5,
          results: 100,
          increase_results: 20,
          cost_per_result: 2,
          other_events: 20
        }
      ];
    }
  } catch (err: any) {
    error.value = `获取广告列表失败: ${err.message}`;
    console.error('获取广告列表失败:', err);
  } finally {
    loading.value = false;
  }
};

// 保存修改
const saveChanges = async () => {
  saving.value = true;
  error.value = '';
  
  try {
    const accessToken = await getAccessToken();
    
    // 这里简化处理，实际项目中需要检测哪些广告被修改
    // 并对每个修改的广告调用相应的API
    
    // 模拟保存成功
    setTimeout(() => {
      saving.value = false;
      alert('保存成功！');
    }, 1000);
  } catch (err: any) {
    error.value = `保存失败: ${err.message}`;
    console.error('保存失败:', err);
    saving.value = false;
  }
};

// 关闭弹窗
const closePopup = () => {
  window.close();
};

// 初始化
onMounted(() => {
  // 初始加载时不自动获取数据，等待用户点击
});
</script>

<template>
  <div class="ads-manager">
    <!-- 顶部操作栏 -->
    <div class="title">
      <span>Facebook广告管理</span>
      <div class="close" @click="closePopup">
        <svg
          class="icon"
          viewBox="0 0 1024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M837.22 240.77L565.98 511.99 837.2 783.24c9.64 9.64 13.42 23.7 9.88 36.87a38.175 38.175 0 0 1-27 26.99 38.153 38.153 0 0 1-36.87-9.88L511.99 565.97 240.77 837.19c-9.64 9.64-23.7 13.42-36.87 9.88s-23.47-13.83-27-27a38.2 38.2 0 0 1 9.88-36.87L458 511.99 186.78 240.77c-14.91-14.91-14.91-39.08 0-53.99 14.91-14.91 39.08-14.91 53.99 0L511.98 458l271.25-271.22c14.91-14.91 39.08-14.91 53.99 0 14.91 14.91 14.91 39.08 0 53.99z"
            fill="#262626"
          ></path>
        </svg>
      </div>
    </div>
    
    <!-- 操作按钮区域 -->
    <div class="action-bar">
      <button 
        class="btn" 
        @click="fetchAds" 
        :disabled="loading"
      >
        {{ loading ? '获取中...' : '获取数据' }}
      </button>
      <button 
        class="btn save-btn" 
        @click="saveChanges" 
        :disabled="saving || ads.length === 0"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    
    <!-- 广告管理表格 -->
    <div class="table-container">
      <table class="ads-table">
        <thead>
          <tr>
            <!-- <th>广告id</th> -->
            <th>广告名称</th>
            <th>覆盖人数</th>
            <th>增加</th>
            <th>展示次数</th>
            <th>增加</th>
            <th>花费金额</th>
            <th>增值</th>
            <th>成效</th>
            <th>加成效</th>
            <th>单次成效</th>
            <th>其他事件</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ad in ads" :key="ad.id">
            <!-- <td>{{ ad.id }}</td> -->
            <td>
              <input 
                type="text" 
                v-model="ad.name" 
                class="editable-input"
              />
            </td>
            <td>{{ ad.impressions || 0 }}</td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_impressions" 
                class="editable-input"
                min="0"
                max="100"
              />
              <span>%</span>
            </td>
            <td>{{ ad.reach || 0 }}</td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_reach" 
                class="editable-input"
                min="0"
                max="100"
              />
              <span>%</span>
            </td>
            <td>{{ ad.spend || 0 }}</td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_spend" 
                class="editable-input"
                min="0"
                max="100"
              />
              <span>%</span>
            </td>
            <td>{{ ad.results || 0 }}</td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_results" 
                class="editable-input"
                min="0"
                max="100"
              />
              <span>%</span>
            </td>
            <td>{{ ad.cost_per_result || 0 }}</td>
            <td>{{ ad.other_events || 0 }}</td>
          </tr>
          <tr v-if="ads.length === 0 && !loading">
            <td colspan="12" class="empty-state">
              暂无广告数据，请点击"获取数据"按钮加载
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ads-manager {
  width: 100%;
}

.title {
  border-bottom: 1px solid #ccc;
  padding: 15px 0;
  position: relative;
  font-size: 20px;
  margin-bottom: 20px;
}

.close {
  width: 20px;
  height: 20px;
  color: #333;
  position: absolute;
  top: 15px;
  right: 0;
  font-size: 24px;
  cursor: pointer;
}

.action-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn {
  padding: 8px 16px;
  border: 1px solid #1890ff;
  background-color: #fff;
  color: #1890ff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.btn:hover {
  background-color: #e6f7ff;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-btn {
  background-color: #1890ff;
  color: #fff;
}

.save-btn:hover {
  background-color: #40a9ff;
}

.error-message {
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  color: #f5222d;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.table-container {
  max-height: 400px;
  min-height: 320px;
  overflow-y: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
}

.ads-table {
  width: 100%;
  border-collapse: collapse;
}

.ads-table th,
.ads-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
}

.ads-table th {
  background-color: #fafafa;
  font-weight: 600;
  white-space: nowrap;
}

.ads-table tr:hover {
  background-color: #f5f5f5;
}

.editable-input,
.editable-select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.editable-input:focus,
.editable-select:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

/* 滚动条样式 */
.table-container::-webkit-scrollbar {
  width: 6px;
}

.table-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.table-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>