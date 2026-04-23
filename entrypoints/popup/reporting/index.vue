<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import { browser } from "wxt/browser";

// 广告数据类型定义
interface AdData {
  id: string;
  name: string;
  accountName: string;
  campaignName: string;
  adSetName: string;
  impressions: number;
  increase_impressions: number;
  reach: number;
  increase_reach: number;
  spend: number;
  increase_spend: number;
  clicks: number;
  increase_clicks: number;
  purchases: number;
  increase_purchases: number;
  registrations: number;
  increase_registrations: number;
  [key: string]: any;
}

// 向content script发送消息的通用函数
function sendMessageToContent(action: string, data?: any): Promise<any> {
  return new Promise((resolve) => {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(
          tabs[0].id!,
          { action, ...data },
          (response) => {
            console.log(`Received response for ${action}:`, response);
            resolve(response);
          }
        );
      } else {
        resolve(null);
      }
    });
  });
}

// 从DOM获取广告数据
async function getAdsFromDom(): Promise<{ ads: AdData[], currencySymbol: string, columnMapping: any }> {
  const response = await sendMessageToContent('getReportingDataFromDom');
  if (response && response.data) {
    // 扁平化广告数据
    const ads = flattenAds(response.data);
    return { 
      ads,
      currencySymbol: response.currencySymbol || '$',
      columnMapping: response.columnMapping || {},
    };
  } else {
    return { ads: [], currencySymbol: '$', columnMapping: {} };  
  }
}

// 扁平化广告数据
function flattenAds(entities: any[]): AdData[] {
  const ads: AdData[] = [];
  
  console.log('开始扁平化广告数据:', entities);
  
  // 直接遍历所有实体，因为报表页面的数据结构与管理页面不同
  entities.forEach(entity => {
    // 只处理有广告名称的实体
    if (entity.adName && entity.adName.trim() !== '') {
      ads.push({
        id: generateAdId(entity),
        name: entity.adName || entity.name,
        accountName: entity.accountName,
        campaignName: entity.campaignName,
        adSetName: entity.adSetName,
        impressions: entity.impressions || 0,
        increase_impressions: 0,
        reach: entity.reach || 0,
        increase_reach: 0,
        spend: entity.spend || 0,
        increase_spend: 0,
        clicks: entity.clicks || 0,
        increase_clicks: 0,
        purchases: entity.purchases || 0,
        increase_purchases: 0,
        registrations: entity.registrations || 0,
        increase_registrations: 0
      });
    }
  });
  
  console.log('扁平化后的广告数据:', ads);
  return ads;
}

// 生成广告唯一标识符
function generateAdId(adData: any): string {
  const originalId = `${adData.accountName}_${adData.campaignName}_${adData.adSetName}_${adData.adName}`;
  const hash = stringToHash(originalId);
  return hashToBase62(hash);
}

// 将字符串转换为哈希值
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为 32 位整数
  }
  return Math.abs(hash);
}

// 将数字转换为 62 进制
function hashToBase62(num: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  let n = num;
  
  if (n === 0) return '0';
  
  while (n > 0) {
    result = chars[n % 62] + result;
    n = Math.floor(n / 62);
  }
  
  return result;
}

// 状态管理
const ads = ref<AdData[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const dropdownOpen = ref<Record<string, boolean>>({});
const dropdownRefs = ref<Record<string, HTMLElement>>({});

// 获取日期，优先使用选择的日期，无选择时使用当天日期
const getCurrentDate = () => {
  if (selectedDate.value) {
    return selectedDate.value;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// 列映射，用于存储从content script返回的列索引信息
const columnMapping = ref<any>({});

// 从DOM中提取货币符号
let currencySymbol = '¥'; // 默认货币符号

// 从DOM获取货币符号的函数
const getCurrencySymbol = async () => {
  try {
    const response = await sendMessageToContent('getCurrencySymbol');
    if (response && response.symbol) {
      currencySymbol = response.symbol;
    }
  } catch (error) {
    console.error('获取货币符号失败:', error);
  }
};

// 获取广告列表
const fetchAds = async () => {
  loading.value = true;
  error.value = '';

  try {
    // 从DOM获取广告数据
    const { ads: domAds, columnMapping: receivedColumnMapping, currencySymbol: domCurrencySymbol } = await getAdsFromDom();
    console.log('从DOM获取广告数据成功:', domAds);
    console.log('从DOM获取列映射成功:', receivedColumnMapping);
    console.log('从DOM获取货币符号成功:', domCurrencySymbol);
    
    if (domAds && domAds.length > 0) {
      ads.value = domAds;
      columnMapping.value = receivedColumnMapping;
      
      // 更新货币符号
      if (domCurrencySymbol) {
        currencySymbol = domCurrencySymbol;
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

/**
 * 保存修改的函数
 * @description 1. 将修改后的数据保存到本地存储
 * 2. 向content script发送消息，通知页面刷新
 */
const saveChanges = async () => {
  saving.value = true;
  error.value = '';
  
  try {
    // 检测哪些广告被修改并保存
    let modifiedCount = 0;
    const modifications: any = {};
    
    for (const ad of ads.value) {
      // 检查是否有数值被修改
      const hasChanges = 
        ad.increase_impressions !== undefined ||
        ad.increase_reach !== undefined ||
        ad.increase_spend !== undefined ||
        ad.increase_clicks !== undefined ||
        ad.increase_registrations !== undefined ||
        ad.increase_purchases !== undefined;
      
      if (hasChanges) {
        modifiedCount++;
        console.log(`Modified ad: ${ad.id}`, ad);
        // 构建修改的字段数据
        const modifiedFields: any= {};
        if (ad.increase_impressions !== undefined) {
          modifiedFields.impressions = ad.increase_impressions;
        }
        if (ad.increase_reach !== undefined) {
          modifiedFields.reach = ad.increase_reach;
        }
        if (ad.increase_spend !== undefined) {
          modifiedFields.spend = ad.increase_spend;
        }
        if (ad.increase_clicks !== undefined) {
          modifiedFields.clicks = ad.increase_clicks;
        }
        if (ad.increase_registrations !== undefined) {
          modifiedFields.registrations = ad.increase_registrations;
        }
        if (ad.increase_purchases !== undefined) {
          modifiedFields.purchases = ad.increase_purchases;
        }
        
        modifications[ad.id] = modifiedFields;
      }
    }
    
    // 保存修改数据
    await sendMessageToContent('saveReportingModifications', {
      modifications: modifications
    });
    
    // 向content script发送消息，通知页面刷新
    await sendMessageToContent('refreshReportingPage', {
      modifications: modifications
    });
    
    // 保存完成
    saving.value = false;

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

// 点击弹窗以外关闭弹窗
const handleClickOutside = (event: MouseEvent) => {
  // 检查点击目标是否在弹窗内或在触发按钮内
  const target = event.target as HTMLElement;
  let isClickInside = false;
  
  // 检查是否点击在弹窗内
  Object.keys(dropdownOpen.value).forEach(adId => {
    if (dropdownOpen.value[adId]) {
      const dropdown = dropdownRefs.value[adId];
      if (dropdown && dropdown.contains(target)) {
        isClickInside = true;
      }
    }
  });
  
  // 检查是否点击在触发按钮内
  const eventButtons = document.querySelectorAll('.event-dropdown');
  eventButtons.forEach(button => {
    if (button.contains(target)) {
      isClickInside = true;
    }
  });
  
  // 如果点击在弹窗以外，关闭所有弹窗
  if (!isClickInside) {
    Object.keys(dropdownOpen.value).forEach(adId => {
      dropdownOpen.value[adId] = false;
    });
  }
};

// 初始化
onMounted(() => {
  // 获取货币符号
  getCurrencySymbol();
  
  // 执行数据获取
  fetchAds();
  
  // 挂载时添加事件监听器
  document.addEventListener('click', handleClickOutside);
});

// 卸载时移除事件监听器
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="ads-manager">
    <!-- 顶部操作栏 -->
    <div class="title">
      <div>报表管理</div>
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
            <th>名称</th>
            <th>覆盖人数</th>
            <th>增加</th>
            <th>展示次数</th>
            <th>增加</th>
            <th>花费金额</th>
            <th>增加</th>
            <th>点击次数</th>
            <th>增加</th>
            <th>注册次数</th>
            <th>增加</th>
            <th>购买次数</th>
            <th>增加</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ad in ads" :key="ad.id">
            <td class="ellipsis-cell" :title="ad.name">
              {{ ad.name }}
            </td>
            <td class="ellipsis-cell" :title="String(ad.reach || '-')">
              {{ ad.reach || '-' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_reach" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.impressions || '-')">
              {{ ad.impressions|| '-' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_impressions" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.spend || '-')">
              {{ ad.spend || '0' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_spend" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.clicks || '-')">  
              {{ ad.clicks || '0' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_clicks" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.registrations || '-')">  
              {{ ad.registrations || '0' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_registrations" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.purchases || '-')">  
              {{ ad.purchases || '0' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_purchases" 
                class="editable-input"
                min="0"
              />
            </td>
          </tr>
          <tr v-if="ads.length === 0 && !loading">
            <td colspan="13" class="empty-state">
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

.date-picker {
  display: flex;
  align-items: center;
}

.date-input {
  padding: 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.ad-total {
  font-size: 14px;
  color: #666;
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
  padding: 12px 6px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
  border-right: 1px solid #e8e8e8;
}

.ads-table th {
  background-color: transparent;
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #000;
}

.ads-table td {
  font-size: 14px;
  max-width: 100px!important;
}

.ads-table tr:hover {
  background-color: #ddd;
}

.ellipsis-cell {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editable-input {
  width: 60px;
  padding: 3px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  min-width: 60px;
  max-width: 60px;
}

.editable-input:focus {
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

.total-row {
  background-color: #f5f5f5;
  font-weight: 600;
}

.total-label {
  font-weight: 600;
}

.icon {
  width: 100%;
  height: 100%;
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