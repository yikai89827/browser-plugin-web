<script lang="ts" setup>
import { ref, onMounted } from "vue";
import { browser } from "wxt/browser";
import axios from "axios";
import { browserStorage } from "../../../utils/storage";

// 广告数据类型定义
interface AdData {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  impressions: number;
  increase_impressions: number;
  reach: number;
  increase_reach: number;
  spend: number;
  increase_spend: number;
  results: number;
  increase_results: number;
  cost_per_result: number;
  other_events: number;
  [key: string]: any;
}

// 从DOM获取广告数据
async function getAdsFromDom(): Promise<AdData[]> {
  return new Promise((resolve) => {
    // 向content script发送消息，请求DOM数据
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(
          tabs[0].id!,
          { action: 'getAdsFromDom' },
          (response) => {
            console.log('Received ads:', response);
            if (response && response.ads) {
              resolve(response.ads);
            } else {
              resolve([]);
            }
          }
        );
      } else {
        resolve([]);
      }
    });
  });
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
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const dataProtectionEnabled = ref(true);
const dropdownOpen = ref<Record<string, boolean>>({});
const dropdownRefs = ref<Record<string, HTMLElement>>({});
const dropdownPositions = ref<Record<string, { top: number; left: number }>>({});

// 事件数据
const events = ref([
  { id: '1', name: '查看详情' },
  { id: '2', name: '编辑广告' },
  { id: '3', name: '复制广告' },
  { id: '4', name: '暂停广告' },
  { id: '5', name: '删除广告' }
]);

// // 广告账户ID
// const accountId = '2174042080104706';

// // 获取访问令牌（从存储中提取）
// const getAccessToken = async (): Promise<string> => {
//   try {
//     // 尝试从存储中获取token
//     const token = await browserStorage.get('lyResponseHeadersToken');
//     if (token) {
//       console.log('Using token from storage:', token);
//       return token;
//     }
//     // 如果没有存储的token，使用默认token
//     console.log('Using default token');
//     return 'EAABsbCS1iHgBRHeByWc8NtcYF8lAz97GJ4D685jQBPRZCzQZBBiryjcXTXSZA6PIAcubYngqMIBkbuZAFhxEDZB1hBnZASj5ROda9q2AweEoTWhmS6SDOWZBZCXzbaDNohR5HCETtHZCqTmAePcMDObjZAZBZBnjbrv52qZBKMUfu7QLoprbOooccB9VeaWzrjK4a1WOKhVDk71sOkNY5fQZDZD';
//   } catch (error) {
//     console.error('Error getting access token:', error);
//     // 出错时使用默认token
//     return 'EAABsbCS1iHgBRHeByWc8NtcYF8lAz97GJ4D685jQBPRZCzQZBBiryjcXTXSZA6PIAcubYngqMIBkbuZAFhxEDZB1hBnZASj5ROda9q2AweEoTWhmS6SDOWZBZCXzbaDNohR5HCETtHZCqTmAePcMDObjZAZBZBnjbrv52qZBKMUfu7QLoprbOooccB9VeaWzrjK4a1WOKhVDk71sOkNY5fQZDZD';
//   }
// };

// 获取广告列表
const fetchAds = async () => {
  loading.value = true;
  error.value = '';

    // const apis = [
    //     `/lightads`,
    //     `/adsets`,
    //     `/campaigns`,
    // ];
  // ads.value = [
  //   {
  //     id: '123456789',
  //     name: '测试广告1',
  //     status: 'ACTIVE',
  //     campaign_id: '987654321',
  //     adset_id: '112233445',
  //     impressions: 1000,
  //     increase_impressions: 10,
  //     reach: 800,
  //     increase_reach: 5,
  //     spend: 100,
  //     increase_spend: 2,
  //     results: 50,
  //     increase_results: 15,
  //     cost_per_result: 2,
  //     other_events: 10
  //   },
  //   {
  //     id: '987654321',
  //     name: '测试广告2',
  //     status: 'PAUSED',
  //     campaign_id: '123456789',
  //     adset_id: '554433221',
  //     impressions: 2000,
  //     increase_impressions: 15,
  //     reach: 1500,
  //     increase_reach: 8,
  //     spend: 200,
  //     increase_spend: 5,
  //     results: 100,
  //     increase_results: 20,
  //     cost_per_result: 2,
  //     other_events: 20
  //   }
  // ];
  try {
    // 从DOM获取广告数据
    // 首先尝试通过content script获取DOM数据
    const domAds = await getAdsFromDom();
    
    if (domAds && domAds.length > 0) {
      ads.value = domAds;
    } else {
      // 注释掉原来的API调用代码，保留作为备份
      /*
      const accessToken = await browserStorage.get('lyRequestHeadersToken');
      const url = await browserStorage.get('lyRequestHeadersUrl');
      // const apiIndex = await browserStorage.get('lyRequestHeadersUrlIndex');

      
      // const response = await axios.get<ApiResponse>(
      //   `https://graph.facebook.com/v22.0/act_${accountId}/ads`,
      //   {
      //     params: {
      //       access_token: accessToken,
      //       fields: 'id,name,status,campaign_id,adset_id,impressions,reach,spend,results,cost_per_result',
      //       limit: 200,
      //     }
      //   }
      // );
      // const response = await axios.get<ApiResponse>(
      //   `https://adsmanager-graph.facebook.com/v22.0/act_${accountId}/lightads`,
      //   {
      //     params: {
      //       access_token: accessToken,
      //       fields: 'id,name,status,campaign_id,adset_id,impressions,reach,spend,results,cost_per_result',
      //       limit: 200,
      //     }
      //   }
      // );
      const response = await axios.get<ApiResponse>(
        url,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,status,campaign_id,adset_id,impressions,reach,spend,results,cost_per_result',
            limit: 200,
          }
        }
      );
      console.log('%c 响应数据：', 'color:green;', response.data);
      
      ads.value = (response.data.data || []).map(ad => ({
        ...ad,
        increase_impressions: ad.increase_impressions || 0,
        increase_reach: ad.increase_reach || 0,
        increase_spend: ad.increase_spend || 0,
        increase_results: ad.increase_results || 0,
        other_events: ad.other_events || 0
      }));
      */
      
      // 如果DOM和API获取都失败，从存储中获取广告数据
      const storageItems = await browserStorage.get(null);
      const storedAds: AdData[] = [];
      
      for (const key in storageItems) {
        if (key.startsWith('ad_') && key.endsWith('_updated')) {
          storedAds.push(storageItems[key]);
        }
      }
      
      if (storedAds.length > 0) {
        ads.value = storedAds;
      } else {
        // 如果没有存储的数据，使用mock数据
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
    }
    
    console.log('获取广告列表成功:', ads.value);
  } catch (err: any) {
    error.value = `获取广告列表失败: ${err.message}`;
    console.error('获取广告列表失败:', err);
  } finally {
    loading.value = false;
  }
};

// 添加延迟和限流
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * 带重试机制的API更新函数
 * @param adId 广告ID
 * @param data 要更新的数据
 * @param retries 当前重试次数
 * @param accessToken Facebook API访问令牌
 * @returns 返回API响应
 * @description 实现了一个带指数退避的重试机制，当API调用失败时会自动重试，最多重试MAX_RETRIES次
 * 每次重试的延迟时间会递增，以避免对API服务器造成过大压力
 */
async function updateWithRetry(adId: string, data: any, retries = 0, accessToken: string) {
  try {
    // 发送POST请求到Facebook Graph API更新广告数据
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${adId}`,
      data,
      { params: { access_token: accessToken } }
    );
    return response;
  } catch (err) {
    // 如果重试次数未达到上限，进行重试
    if (retries < MAX_RETRIES) {
      // 指数退避延迟：每次重试的延迟时间递增
      await delay(RETRY_DELAY * (retries + 1));
      return updateWithRetry(adId, data, retries + 1, accessToken);
    }
    // 重试次数达到上限，抛出错误
    throw err;
  }
}

/**
 * 保存修改的函数
 * @description 1. 将修改后的数据保存到本地存储
 * 2. 向content script发送消息，通知页面刷新
 * 3. 本地缓存key设计：ad_{adId}_column_{columnIndex}，直接表明修改数据在页面所在列索引
 */
const saveChanges = async () => {
  saving.value = true;
  error.value = '';
  
  try {
    // 检测哪些广告被修改并保存
    let modifiedCount = 0;
    
    for (const ad of ads.value) {
      // 检查是否有数值被修改
      const hasChanges = 
        (ad.increase_impressions !== undefined && ad.increase_impressions !== 0) ||
        (ad.increase_reach !== undefined && ad.increase_reach !== 0) ||
        (ad.increase_spend !== undefined && ad.increase_spend !== 0) ||
        (ad.increase_results !== undefined && ad.increase_results !== 0);
      
      if (hasChanges) {
        modifiedCount++;
        console.log(`Modified ad: ${ad.id}`, ad);
        // 保存到本地存储，使用设计的key格式
        // 保存完整的广告数据
        await browserStorage.set(`ad_${ad.id}_updated`, ad);
        
        // 保存各列的修改值，使用列索引作为key的一部分
        // 这里假设列索引为：impressions=0, reach=1, spend=2, results=3
        await browserStorage.set(`ad_${ad.id}_column_0`, ad.increase_impressions || 0);
        await browserStorage.set(`ad_${ad.id}_column_1`, ad.increase_reach || 0);
        await browserStorage.set(`ad_${ad.id}_column_2`, ad.increase_spend || 0);
        await browserStorage.set(`ad_${ad.id}_column_3`, ad.increase_results || 0);
      }
    }
    
    // 向content script发送消息，通知页面刷新
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(
          tabs[0].id!,
          { action: 'refreshPageWithData' },
          (response) => {
            console.log('Content script response:', response);
          }
        );
      }
    });
    
    // 保存完成后重新渲染页面
    // await fetchAds();
    
    // 保存完成
    saving.value = false;
    
    if (modifiedCount === 0) {
      alert('没有需要保存的修改');
    } else {
      alert(`保存成功！共更新 ${modifiedCount} 个广告`);
    }
  } catch (err: any) {
    error.value = `保存失败: ${err.message}`;
    console.error('保存失败:', err);
    saving.value = false;
  }
};

// 设置下拉菜单ref
const setDropdownRef = (el: HTMLElement | null, adId: string) => {
  if (el) {
    dropdownRefs.value[adId] = el;
  }
};

// 切换下拉菜单
const toggleDropdown = (adId: string, event: MouseEvent) => {
  const isOpen = !dropdownOpen.value[adId];
  dropdownOpen.value[adId] = isOpen;
  
  if (isOpen) {
    // 计算下拉菜单位置
    const button = event.target as HTMLElement;
    const rect = button.getBoundingClientRect();
    dropdownPositions.value[adId] = {
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX - 60 // 向左偏移，使菜单右对齐
    };
  }
};

// 获取下拉菜单样式
const getDropdownStyle = (adId: string) => {
  const position = dropdownPositions.value[adId];
  if (!position) return {};
  return {
    top: `${position.top}px`,
    left: `${position.left}px`
  };
};

// 触发事件
const triggerEvent = (adId: string, eventId: string) => {
  console.log('Triggering event', eventId, 'for ad', adId);
  
  // 关闭下拉菜单
  dropdownOpen.value[adId] = false;
  
  // 根据事件ID执行不同的操作
  switch (eventId) {
    case '1':
      alert('查看广告详情：' + adId);
      break;
    case '2':
      alert('编辑广告：' + adId);
      break;
    case '3':
      alert('复制广告：' + adId);
      break;
    case '4':
      alert('暂停广告：' + adId);
      break;
    case '5':
      if (confirm('确定要删除广告 ' + adId + ' 吗？')) {
        alert('删除广告：' + adId);
      }
      break;
    default:
      break;
  }
};

// 关闭弹窗
const closePopup = () => {
  window.close();
};

// // 初始化
// onMounted(() => {
//   // 初始加载时不自动获取数据，等待用户点击
  
//   // 监听token变化
//   browserStorage.watch('lyResponseHeadersToken', (newToken) => {
//     console.log('Token changed:', newToken);
//     // 可以在这里添加逻辑，比如重新获取广告数据
//   });
  
//   // 初始检查是否有存储的token
//   browserStorage.get('lyResponseHeadersToken').then(token => {
//     if (token) {
//       console.log('Found stored token:', token);
//     } else {
//       console.log('No stored token found');
//     }
//   });
// });
</script>

<template>
  <div class="ads-manager">
    <!-- 顶部操作栏 -->
    <div class="title">
      <div>广告管理</div>
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
      <div class="action-bar-left">
        <div class="date-picker">
          <input 
            type="date" 
            v-model="selectedDate" 
            class="date-input"
          />
        </div>
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
        <div class="ad-total">
          {{ ads.length }}
        </div>
      </div>
      <div class="action-bar-right">
        <div class="data-protection">
          <span>数据保护</span>
          <label class="switch">
            <input 
              type="checkbox" 
              v-model="dataProtectionEnabled"
            >
            <span class="slider"></span>
          </label>
        </div>
      </div>
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
            <th>名称</th>
            <th>覆盖人数</th>
            <th>增加</th>
            <th>展示次数</th>
            <th>增加</th>
            <th>花费金额</th>
            <th>增值</th>
            <th>成效</th>
            <th>加成效</th>
            <th>单次成效</th>
            <th>其它事件</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ad in ads" :key="ad.id">
            <!-- <td>{{ ad.id }}</td> -->
            <td class="ellipsis-cell" :title="ad.name">
              {{ ad.name }}
            </td>
            <td class="ellipsis-cell" :title="(ad.impressions || 0) + (ad.increase_impressions || 0)">
              {{ (ad.impressions || 0) + (ad.increase_impressions || 0) }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_impressions" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="(ad.reach || 0) + (ad.increase_reach || 0)">
              {{ (ad.reach || 0) + (ad.increase_reach || 0) }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_reach" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="(ad.spend || 0) + (ad.increase_spend || 0)">
              {{ (ad.spend || 0) + (ad.increase_spend || 0) }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_spend" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="(ad.results || 0) + (ad.increase_results || 0)">
              {{ (ad.results || 0) + (ad.increase_results || 0) }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_results" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="ad.cost_per_result || 0">{{ ad.cost_per_result || 0 }}</td>
            <td class="event-dropdown-cell">
              <div class="event-dropdown" :ref="el => setDropdownRef(el, ad.id)">
                <button 
                  class="event-dropdown-btn" 
                  @click="toggleDropdown(ad.id, $event)"
                >
                  <span class="event-icon">›</span>
                </button>
                <div 
                  v-if="dropdownOpen[ad.id]" 
                  class="event-dropdown-menu"
                  :style="getDropdownStyle(ad.id)"
                >
                  <div 
                    v-for="event in events" 
                    :key="event.id"
                    class="event-dropdown-item"
                    @click="triggerEvent(ad.id, event.id)"
                  >
                    {{ event.name }}
                  </div>
                </div>
              </div>
            </td>
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
.ads-manager,.content {
  width: 100%!important;
}

.title {
  border-bottom: 1px solid #ccc;
  padding: 15px 0;
  position: relative;
  font-size: 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.close {
  width: 28px;
  height: 28px;
  color: #333;
  cursor: pointer;
  background-color: #fff;
  border-radius: 50%;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  justify-content: space-between;
}

.action-bar-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.action-bar-right {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-right: 20px;
}

.date-picker {
  display: flex;
  align-items: center;
}

.date-input {
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.ad-total {
  font-size: 14px;
  color: #666;
}

.data-protection {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

/* 开关样式 - 左右切换 */
.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f0f0f0;
  transition: .4s;
  border-radius: 24px;
  border: 1px solid #d9d9d9;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 1px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

input:checked + .slider {
  background-color: #1890ff;
  border-color: #1890ff;
}

input:focus + .slider {
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

input:checked + .slider:before {
  transform: translateX(34px);
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
  overflow: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
    width: 100%;
}

.ads-table {
  width: 100%;
  min-width: 770px;
  border-collapse: collapse;
}

.ads-table th,
.ads-table td {
  padding: 12px 4px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
  max-width: 70px!important;
}

.ads-table th {
  background-color: transparent;
  font-weight: 600;
  white-space: nowrap;
}

.ads-table tr:hover {
  background-color: #ddd;
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
    height: 240px!important;
    text-align: center!important;
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

.ellipsis-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.ads-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.ads-table th {
  white-space: nowrap;
  min-width: 56px;
}
/*  */
/* 事件下拉菜单样式 */
.event-dropdown-cell {
  position: static;
  padding: 0;
  text-align: center;
}

.event-dropdown {
  position: relative;
  display: inline-block;
}

.event-dropdown-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  transition: background-color 0.2s;
}

.event-dropdown-btn:hover {
  background-color: #f0f0f0;
}

.event-icon {
  font-size: 16px;
  font-weight: bold;
  color: #666;
  transition: transform 0.2s;
}

.event-dropdown:hover .event-icon {
  transform: translateX(2px);
}

.event-dropdown-menu {
  position: fixed;
  background-color: #000;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 80px;
  z-index: 9999;
  margin-top: 4px;
}

.event-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  color: #fff;
  border-bottom: 1px solid #fff;
}

.event-dropdown-item:hover {
  background-color: #f5f5f5;
  color: #000;
}
</style>