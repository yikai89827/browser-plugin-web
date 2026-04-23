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

// 从缓存获取广告数据
async function getAdsFromCache(): Promise<{ ads: AdData[], currencySymbol: string, columnMapping: any } | null> {
  const response = await sendMessageToContent('getReportingCachedData', { date: getCurrentDate() });
  if (response && response.success && response.data && response.data.data) {
    // 扁平化广告数据
    const ads = flattenAds(response.data.data);
    return { 
      ads,
      currencySymbol: response.data.currencySymbol || '$',
      columnMapping: response.data.columnMapping || {},
    };
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
  const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
  
  // 直接遍历所有实体，因为报表页面的数据结构与管理页面不同
  entities.forEach(entity => {
    // 判断是否为合计行
    const isSummary = isSummaryRow(entity);
    const summaryType = getSummaryType(entity);
    
    // 生成显示名称
    let displayName = entity.adName || entity.name;
    if (isSummary) {
      if (summaryType === 'account') {
        displayName = `${entity.accountName} 账户合计`;
      } else if (summaryType === 'campaign') {
        displayName = `${entity.campaignName} 系列合计`;
      } else if (summaryType === 'adset') {
        displayName = `${entity.adSetName} 组合计`;
      }
    }
    
    // 创建广告数据对象
    const adData: AdData = {
      id: entity.id || '',
      name: displayName,
      accountName: entity.accountName,
      campaignName: entity.campaignName,
      adSetName: entity.adSetName,
      impressions: entity.impressions || 0,
      increase_impressions: entity.increase_impressions || 0,
      reach: entity.reach || 0,
      increase_reach: entity.increase_reach || 0,
      spend: entity.spend || 0,
      increase_spend: entity.increase_spend || 0,
      clicks: entity.clicks || 0,
      increase_clicks: entity.increase_clicks || 0,
      purchases: entity.purchases || 0,
      increase_purchases: entity.increase_purchases || 0,
      registrations: entity.registrations || 0,
      increase_registrations: entity.increase_registrations || 0,
      isSummary: isSummary,
      summaryType: summaryType
    };
    
    ads.push(adData);
  });
  
  console.log('扁平化后的广告数据:', ads);
  return ads;
}

// 判断是否为合计行
function isSummaryRow(entity: any): boolean {
  const accountName = entity.accountName || '';
  const campaignName = entity.campaignName || '';
  const adSetName = entity.adSetName || '';
  const adName = entity.adName || '';
  
  // 检查是否包含"全部"字样
  const isAll = (name: string) => name === '全部' || name === 'All' || name === 'ALL';
  
  // 如果广告名称是"全部"，则是合计行
  if (isAll(adName)) {
    return true;
  }
  
  return false;
}

// 获取合计行类型
function getSummaryType(entity: any): 'account' | 'campaign' | 'adset' | 'ad' {
  const accountName = entity.accountName || '';
  const campaignName = entity.campaignName || '';
  const adSetName = entity.adSetName || '';
  const adName = entity.adName || '';
  
  // 检查是否包含"全部"字样
  const isAll = (name: string) => name === '全部' || name === 'All' || name === 'ALL';
  
  // 如果广告名称是"全部"，其他三个名称都是具体名称，则是广告组合计行
  if (isAll(adName) && !isAll(accountName) && !isAll(campaignName) && !isAll(adSetName)) {
    return 'adset';
  }
  
  // 如果广告名称和广告组名称都是"全部"，账户名称和广告系列名称是具体名称，则是广告系列合计行
  if (isAll(adName) && isAll(adSetName) && !isAll(accountName) && !isAll(campaignName)) {
    return 'campaign';
  }
  
  // 如果广告名称、广告组名称、广告系列名称都是"全部"，账户名称是具体名称，则是账户合计行
  if (isAll(adName) && isAll(adSetName) && isAll(campaignName) && !isAll(accountName)) {
    return 'account';
  }
  
  // 否则是单条广告数据
  return 'ad';
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
    // 先尝试从缓存获取数据
    const cachedResult = await getAdsFromCache();
    
    if (cachedResult && cachedResult.ads && cachedResult.ads.length > 0) {
      console.log('从缓存获取广告数据成功:', cachedResult.ads);
      ads.value = cachedResult.ads;
      columnMapping.value = cachedResult.columnMapping;
      
      // 更新货币符号
      if (cachedResult.currencySymbol) {
        currencySymbol = cachedResult.currencySymbol;
      }
      
      // 更新合计行的增加值
      updateSummaryRows();
    } else {
      console.log('缓存中没有数据，从DOM获取广告数据');
      // 缓存中没有数据，从DOM获取
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
        
        // 更新合计行的增加值
        updateSummaryRows();
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
    // 更新合计行的增加值
    updateSummaryRows();
    
    // 检测哪些广告被修改并保存
  let modifiedCount = 0;
  const modifications: any = {};
  
  for (const ad of ads.value) {
    // 跳过合计行，只保存非合计行的修改
    if (ad.isSummary) {
      continue;
    }
    
    // 构建修改的字段数据
    const modifiedFields: any= {};
    
    // 检查并保存所有增加字段，包括0值
    modifiedFields.impressions = ad.increase_impressions || 0;
    modifiedFields.reach = ad.increase_reach || 0;
    modifiedFields.spend = ad.increase_spend || 0;
    modifiedFields.clicks = ad.increase_clicks || 0;
    modifiedFields.registrations = ad.increase_registrations || 0;
    modifiedFields.purchases = ad.increase_purchases || 0;
    
    // 检查是否有修改
    modifiedCount++;
    console.log(`Modified ad: ${ad.id}`, ad);
    modifications[ad.id] = modifiedFields;
  }
    
    // 保存修改数据
    await sendMessageToContent('saveReportingModifications', {
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

// 计算合计数据
const calculateTotals = () => {
  const calculatedTotals = {
    impressions: 0,
    increase_impressions: 0,
    reach: 0,
    increase_reach: 0,
    spend: 0,
    increase_spend: 0,
    clicks: 0,
    increase_clicks: 0,
    registrations: 0,
    increase_registrations: 0,
    purchases: 0,
    increase_purchases: 0
  };
  
  // 计算各字段合计
  ads.value.forEach(ad => {
    // 处理非数字值，将其转换为0
    const getValue = (val: any): number => {
      if (val === undefined || val === null || val === '-') {
        return 0;
      }
      // 清理字符串，去除货币符号和逗号
      const cleanedVal = String(val).replace(/[^\d.-]/g, '');
      const numVal = parseFloat(cleanedVal);
      if (isNaN(numVal)) {
        return 0;
      }
      return numVal;
    };
    
    calculatedTotals.impressions += getValue(ad.impressions);
    calculatedTotals.increase_impressions += getValue(ad.increase_impressions);
    calculatedTotals.reach += getValue(ad.reach);
    calculatedTotals.increase_reach += getValue(ad.increase_reach);
    calculatedTotals.spend += getValue(ad.spend);
    calculatedTotals.increase_spend += getValue(ad.increase_spend);
    calculatedTotals.clicks += getValue(ad.clicks);
    calculatedTotals.increase_clicks += getValue(ad.increase_clicks);
    calculatedTotals.registrations += getValue(ad.registrations);
    calculatedTotals.increase_registrations += getValue(ad.increase_registrations);
    calculatedTotals.purchases += getValue(ad.purchases);
    calculatedTotals.increase_purchases += getValue(ad.increase_purchases);
  });
  
  return calculatedTotals;
};

// 更新合计行的增加值
const updateSummaryRows = () => {
  // 首先确保所有合计行的增加值默认为0
  ads.value.forEach(ad => {
    if (ad.isSummary) {
      ad.increase_impressions = 0;
      ad.increase_reach = 0;
      ad.increase_spend = 0;
      ad.increase_clicks = 0;
      ad.increase_registrations = 0;
      ad.increase_purchases = 0;
    }
  });
  
  // 按账户分组
  const accountGroups: Record<string, AdData[]> = {};
  
  ads.value.forEach(ad => {
    if (!ad.isSummary) {
      const accountKey = ad.accountName;
      if (!accountGroups[accountKey]) {
        accountGroups[accountKey] = [];
      }
      accountGroups[accountKey].push(ad);
    }
  });
  
  // 计算每个账户的合计
  Object.keys(accountGroups).forEach(accountName => {
    const accountAds = accountGroups[accountName];
    const accountSummary = ads.value.find(ad => 
      ad.isSummary && 
      ad.summaryType === 'account' && 
      ad.accountName === accountName
    );
    
    // 按广告系列分组
    const campaignGroups: Record<string, AdData[]> = {};
    accountAds.forEach(ad => {
      const campaignKey = `${ad.accountName}_${ad.campaignName}`;
      if (!campaignGroups[campaignKey]) {
        campaignGroups[campaignKey] = [];
      }
      campaignGroups[campaignKey].push(ad);
    });
    
    // 计算每个广告系列的合计
    Object.keys(campaignGroups).forEach(campaignKey => {
      const campaignAds = campaignGroups[campaignKey];
      const [accountName, campaignName] = campaignKey.split('_');
      const campaignSummary = ads.value.find(ad => 
        ad.isSummary && 
        ad.summaryType === 'campaign' && 
        ad.accountName === accountName && 
        ad.campaignName === campaignName
      );
      
      // 按广告组分组
      const adsetGroups: Record<string, AdData[]> = {};
      campaignAds.forEach(ad => {
        const adsetKey = `${ad.accountName}_${ad.campaignName}_${ad.adSetName}`;
        if (!adsetGroups[adsetKey]) {
          adsetGroups[adsetKey] = [];
        }
        adsetGroups[adsetKey].push(ad);
      });
      
      // 计算每个广告组的合计（先计算这层）
      Object.keys(adsetGroups).forEach(adsetKey => {
        const adsetAds = adsetGroups[adsetKey];
        const [accountName, campaignName, adSetName] = adsetKey.split('_');
        const adsetSummary = ads.value.find(ad => 
          ad.isSummary && 
          ad.summaryType === 'adset' && 
          ad.accountName === accountName && 
          ad.campaignName === campaignName && 
          ad.adSetName === adSetName
        );
        
        if (adsetSummary) {
          adsetSummary.increase_impressions = adsetAds.reduce((sum, ad) => sum + (ad.increase_impressions || 0), 0);
          adsetSummary.increase_reach = adsetAds.reduce((sum, ad) => sum + (ad.increase_reach || 0), 0);
          adsetSummary.increase_spend = adsetAds.reduce((sum, ad) => sum + (ad.increase_spend || 0), 0);
          adsetSummary.increase_clicks = adsetAds.reduce((sum, ad) => sum + (ad.increase_clicks || 0), 0);
          adsetSummary.increase_registrations = adsetAds.reduce((sum, ad) => sum + (ad.increase_registrations || 0), 0);
          adsetSummary.increase_purchases = adsetAds.reduce((sum, ad) => sum + (ad.increase_purchases || 0), 0);
        }
      });
      
      if (campaignSummary) {
        // 计算广告系列合计的增加值（包含所有广告组的合计）
        campaignSummary.increase_impressions = campaignAds.reduce((sum, ad) => sum + (ad.increase_impressions || 0), 0);
        campaignSummary.increase_reach = campaignAds.reduce((sum, ad) => sum + (ad.increase_reach || 0), 0);
        campaignSummary.increase_spend = campaignAds.reduce((sum, ad) => sum + (ad.increase_spend || 0), 0);
        campaignSummary.increase_clicks = campaignAds.reduce((sum, ad) => sum + (ad.increase_clicks || 0), 0);
        campaignSummary.increase_registrations = campaignAds.reduce((sum, ad) => sum + (ad.increase_registrations || 0), 0);
        campaignSummary.increase_purchases = campaignAds.reduce((sum, ad) => sum + (ad.increase_purchases || 0), 0);
      }
    });
    
    if (accountSummary) {
      // 计算账户合计的增加值（包含所有广告系列的合计）
      accountSummary.increase_impressions = accountAds.reduce((sum, ad) => sum + (ad.increase_impressions || 0), 0);
      accountSummary.increase_reach = accountAds.reduce((sum, ad) => sum + (ad.increase_reach || 0), 0);
      accountSummary.increase_spend = accountAds.reduce((sum, ad) => sum + (ad.increase_spend || 0), 0);
      accountSummary.increase_clicks = accountAds.reduce((sum, ad) => sum + (ad.increase_clicks || 0), 0);
      accountSummary.increase_registrations = accountAds.reduce((sum, ad) => sum + (ad.increase_registrations || 0), 0);
      accountSummary.increase_purchases = accountAds.reduce((sum, ad) => sum + (ad.increase_purchases || 0), 0);
    }
  });
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
            <td class="ellipsis-cell" :title="ad.name">
              {{ ad.name }}
            </td>
            <td class="ellipsis-cell" :title="String(ad.impressions || '-')">
              {{ ad.impressions|| '-' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_impressions" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_impressions || 0 }}</span>
            </td>
            <td class="ellipsis-cell" :title="String(ad.reach || '-')">
              {{ ad.reach || '-' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_reach" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_reach || 0 }}</span>
            </td>
            <td class="ellipsis-cell" :title="String(ad.spend || '-')">
              {{ ad.spend || '0' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_spend" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_spend || 0 }}</span>
            </td>
            <td class="ellipsis-cell" :title="String(ad.clicks || '-')">  
              {{ ad.clicks || '0' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_clicks" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_clicks || 0 }}</span>
            </td>
            <td class="ellipsis-cell" :title="String(ad.registrations || '-')">  
              {{ ad.registrations || '0' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_registrations" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_registrations || 0 }}</span>
            </td>
            <td class="ellipsis-cell" :title="String(ad.purchases || '-')">  
              {{ ad.purchases || '0' }}
            </td>
            <td>
              <input 
                v-if="!ad.isSummary"
                type="number" 
                v-model="ad.increase_purchases" 
                class="editable-input"
                min="0"
              />
              <span v-else class="summary-cell">{{ ad.increase_purchases || 0 }}</span>
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
  background-color: #999;
  font-weight: 600;
}

.total-label {
  font-weight: 600;
}

.summary-row {
  background-color: #999;
  font-weight: 600;
}

.summary-row td {
  background-color: #999;
}

.summary-cell {
  color: #fff;
  font-style: italic;
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