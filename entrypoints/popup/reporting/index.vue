<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import { browser } from "wxt/browser";
import DatePicker from "../components/DatePicker.vue";

// 广告数据类型定义
interface AdData {
  id: string;
  name: string;
  accountName: string;
  campaignName: string;
  adSetName: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
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
  isSummary: boolean; // 是否为合计行
  summaryType?: 'account' | 'campaign' | 'adset' | 'ad'; // 合计行类型
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

// 从缓存获取广告数据（只获取增加值）
async function getAdsFromCache(): Promise<{ ads: any } | null> {
  const response = await sendMessageToContent('getReportingCachedData', { date: getCurrentDate() });
  if (response && response.success && response.data) {
    console.log('从缓存获取的增加值数据:', response.data);
    return response.data;
  }
  return null;
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
  
  // 定义数值字段
  // const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
  
  // 直接遍历所有实体，包括合计行
  entities.forEach(entity => {
    // 判断是否为合计行
    const isSummary = isSummaryRow(entity);
    const summaryType = getSummaryType(entity);
    
    
    // 创建广告数据对象
    const adData: AdData = {
      id: entity.id || '',
      name: getRowDisplayName(entity),
      accountName: entity.accountName,
      campaignName: entity.campaignName,
      adSetName: entity.adSetName,
      adName: entity.adName || '',
      campaign_id: entity.campaign_id || '',
      adset_id: entity.adset_id || '',
      ad_id: entity.ad_id || '',
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
      increase_registrations: 0,
      isSummary: isSummary,
      summaryType: summaryType
    };
    console.log('处理广告数据:', adData);
    ads.push(adData);
  });
  
  console.log('扁平化后的广告数据:', ads);
  return ads;
}

// 判断是否为合计行
function isSummaryRow(entity: any): boolean {
  // 使用'ad_id'来判断：有ad_id，则是广告统计行（非合计行）
  return !(entity?.ad_id && entity?.ad_id?.trim() !== ''&& entity?.ad_id?.trim() !== "—");
}

// 获取合计行类型
function getSummaryType(entity: any): 'account' | 'campaign' | 'adset' | 'ad' {
  const { campaign_id, adset_id, ad_id } = entity || {};
  
  // 如果有ad_id，则是广告统计行
  if (ad_id && ad_id.trim() !== '' && ad_id.trim() !== "—") {
    return 'ad';
  }
  
  // 如果有adset_id且没有ad_id，则是广告组合计行
  if (adset_id && adset_id.trim() !== '' && adset_id.trim() !== "—") {
    return 'adset';
  }
  
  // 如果有campaign_id且没有adset_id和ad_id，则是广告系列合计行
  if (campaign_id && campaign_id.trim() !== '' && campaign_id.trim() !== "—") {
    return 'campaign';
  }
  
  // 否则是账户合计行
  return 'account';
}

// 获取行显示名称
function getRowDisplayName(ad: any): string {
  const { summaryType, accountName, campaignName, adSetName, adName } = ad || {};
  // console.log('getRowDisplayName:',ad, summaryType, accountName, campaignName, adSetName, adName);   
  
  // 根据合计类型返回不同的显示名称
  switch (summaryType) {
    case 'account':
      // 账户合计行：显示账户名称
      return accountName+'账户合计' ;   
    case 'campaign':
      // 系列合计行：显示系列名称+"合计"
      return campaignName+'系列合计';
    case 'adset':
      // 组合计行：显示组名称+"合计"
      return adSetName+'组合计' ;
    default:
      return  adName || '';
  }
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
    // 总是从DOM获取最新的原始数据
    console.log('从DOM获取广告数据...');
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
      
      // 从缓存获取增加值数据并合并（按选择的日期）
      const cachedResult = await getAdsFromCache();
      if (cachedResult && cachedResult.ads) {
        console.log('从缓存获取增加值数据（按日期:', getCurrentDate(), '）:', cachedResult.ads);
        mergeIncreaseValues(ads.value, cachedResult.ads);
        console.log('合并后的广告数据:', ads.value);
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

// 合并增加值数据到DOM数据
function mergeIncreaseValues(domAds: AdData[], cachedAds: AdData[]) {
  // 构建缓存数据的Map，用于快速查找
  const cachedMap = new Map<string, AdData>();
  cachedAds.forEach(cachedAd => {
    cachedMap.set(cachedAd.id, cachedAd);
  });
  
  // 合并增加值到DOM数据
  domAds.forEach(domAd => {
    const cachedAd = cachedMap.get(domAd.id);
    if (cachedAd) {
      // 合并增加值字段
      domAd.increase_impressions = cachedAd.increase_impressions || 0;
      domAd.increase_reach = cachedAd.increase_reach || 0;
      domAd.increase_spend = cachedAd.increase_spend || 0;
      domAd.increase_clicks = cachedAd.increase_clicks || 0;
      domAd.increase_registrations = cachedAd.increase_registrations || 0;
      domAd.increase_purchases = cachedAd.increase_purchases || 0;
    }
  });
}

// 处理日期变化
const handleDateChange = (date: string) => {
  console.log('日期选择变化:', date);
  // 清空表格数据
  ads.value = [];
  columnMapping.value = {};
  console.log('已清空表格数据，等待重新获取');
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
      // 只保存广告统计行的修改（跳过合计行）
      if (ad.isSummary) {
        continue;
      }
      
      // 构建修改的字段数据
      const modifiedFields: any = {};
      
      // 检查并保存所有增加字段
      modifiedFields.impressions = ad.increase_impressions || 0;
      modifiedFields.reach = ad.increase_reach || 0;
      modifiedFields.spend = ad.increase_spend || 0;
      modifiedFields.clicks = ad.increase_clicks || 0;
      modifiedFields.registrations = ad.increase_registrations || 0;
      modifiedFields.purchases = ad.increase_purchases || 0;
      
      // 检查是否有修改（至少有一个字段不为0）
      const hasModification = Object.values(modifiedFields).some(value => Number(value) !== 0);
      
      if (hasModification) {
        modifiedCount++;
        console.log(`Modified ad: ${ad.id}`, ad);
        // 保存修改字段和4个id字段，用于渲染时匹配行
        modifications[ad.id] = {
          ...modifiedFields,
          campaign_id: ad.campaign_id,
          adset_id: ad.adset_id,
          ad_id: ad.ad_id,
          accountName: ad.accountName
        };
      }
    }
    
    // 保存修改数据（包含当前选择的日期）
    await sendMessageToContent('saveReportingModifications', {
      modifications: modifications,
      date: getCurrentDate()
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
          <DatePicker 
            v-model="selectedDate" 
            @change="handleDateChange"
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
            <th>展示次数</th>
            <th>增加</th>
            <th>覆盖人数</th>
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
          <tr v-for="ad in ads" :key="ad.id" :class="{ 'summary-row': ad.isSummary }">
            <td class="ellipsis-cell" :title="getRowDisplayName(ad)">
              {{ getRowDisplayName(ad) }}
            </td>
            <td class="ellipsis-cell" :title="String(ad.impressions || '-')">
              {{ ad.impressions || '-' }}
            </td>
            <td>
              <!-- 合计行显示数值，广告统计行显示输入框 -->
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_impressions || 0 }}</span>
              </template>
              <input 
                v-else
                type="number" 
                v-model="ad.increase_impressions" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.reach || '-')">
              {{ ad.reach || '-' }}
            </td>
            <td>
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_reach || 0 }}</span>
              </template>
              <input 
                v-else
                type="number" 
                v-model="ad.increase_reach" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="String(ad.spend || '-')">
              {{ ad.spend || '0' }}
            </td>
            <td>
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_spend || 0 }}</span>
              </template>
              <input 
                v-else
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
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_clicks || 0 }}</span>
              </template>
              <input 
                v-else
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
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_registrations || 0 }}</span>
              </template>
              <input 
                v-else
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
              <template v-if="ad.isSummary">
                <span class="summary-value">{{ ad.increase_purchases || 0 }}</span>
              </template>
              <input 
                v-else
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
  min-width: 870px;
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
  background: #999;
}

.ads-table th:first-child {
  width: 300px;
}

.ads-table td {
  font-size: 14px;
  max-width: 100px!important;
}

.ads-table tr:hover {
  background-color: #ddd;
}

.ellipsis-cell {
  max-width: 300px;
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
  color: #fff;
}

.total-row {
  background-color: #666;
  font-weight: 600;
}

.total-label {
  font-weight: 600;
}

.summary-row {
  background-color: #666;
  font-weight: 600;
}

.summary-row td {
  background-color: #666;
}

.summary-cell {
  color: #fff;
  font-style: italic;
}

.summary-value {
  display: inline-block;
  padding: 3px 8px;
  background-color: #fff;
  color: #333;
  border-radius: 4px;
  font-weight: normal;
  min-width: 40px;
  text-align: center;
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