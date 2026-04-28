<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import { browser } from "wxt/browser";
import DatePicker from "./components/DatePicker.vue";
// import axios from "axios";
// import { browserStorage } from "../../../utils/storage";

// 广告数据类型定义
interface AdData {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  impressions: number;
  increase_impressions: number|undefined;
  reach: number;
  increase_reach: number|undefined;
  spend: number;
  increase_spend: number|undefined;
  clicks: number;
  increase_clicks: number|undefined;
  registrations: number;
  increase_registrations: number|undefined;
  purchases: number;
  increase_purchases: number|undefined;
  results: number;
  increase_results: number|undefined;
  [key: string]: any;
}

// 向content script发送消息的通用函数
function sendMessageToContent(action: string, data?: any): Promise<any> {
  return new Promise((resolve) => {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // 获取当前tab的URL，用于判断当前是哪个tab
        const url = tabs[0].url || '';
        let tabType = 'Campaigns'; // 默认是广告系列tab
        
        // 根据URL判断当前tab类型
        if (url.includes('/campaigns')) {
          tabType = 'Campaigns';
        } else if (url.includes('/adsets')) {
          tabType = 'Adsets';
        } else if (url.includes('/ads')) {
          tabType = 'Ads';
        }
        
        browser.tabs.sendMessage(
          tabs[0].id!,
          { action, tabType, ...data },
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
async function getAdsFromDom(): Promise<{ ads: AdData[], DomColumnMapping: any, sortInfo: any, currencySymbol: string, dateRanges: string[] }> {
  const response = await sendMessageToContent('getAdsFromDom');
  if (response && response.ads) {
    return { 
      ads: response.ads, 
      DomColumnMapping: response.DomColumnMapping || {},
      sortInfo: response.sortInfo || { field: null, direction: null },
      currencySymbol: response.currencySymbol || '$',
      dateRanges: response.dateRanges || []
    };
  } else {
    return { ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null }, currencySymbol: '$', dateRanges: [] };
  }
}

// 状态管理
const ads = ref<AdData[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const selectedDate = ref(new Date().toISOString().split('T')[0]);

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

//初始化 增值数据
const initIncreaseData = () => {
  // 初始化增加的值为空
  ads.value.forEach(ad => {
    // 初始化增加的值为空
    ad.increase_impressions = undefined;
    ad.increase_reach = undefined;
    ad.increase_spend = undefined;
    ad.increase_clicks = undefined;
    ad.increase_registrations = undefined;
    ad.increase_purchases = undefined;
    ad.increase_results = undefined;
  });
};
// 获取广告列表
const fetchAds = async () => {
  loading.value = true;
  error.value = '';

  try {
    // 先从content script获取当前排序信息
    const currentDate = getCurrentDate();
    const sortInfo = await sendMessageToContent('getSortInfo', { date: currentDate });
    console.log('当前排序信息:', sortInfo);
    
    // 总是从DOM获取原始数据
    const { ads: domAds, DomColumnMapping: receivedColumnMapping, sortInfo: receivedSortInfo, currencySymbol: domCurrencySymbol, dateRanges } = await getAdsFromDom();
    console.log('从DOM获取广告数据成功:', domAds);
    console.log('从DOM获取列映射成功:', receivedColumnMapping);
    console.log('从DOM获取排序信息成功:', receivedSortInfo);
    console.log('从DOM获取货币符号成功:', domCurrencySymbol);
    console.log('从DOM获取日期范围成功:', dateRanges);
    
    if (domAds && domAds.length > 0) {
      const processedAds = domAds;
      
      ads.value = processedAds;
      // 初始化增加值数据
      initIncreaseData();
      columnMapping.value = receivedColumnMapping;
      
      // 更新货币符号
      if (domCurrencySymbol) {
        currencySymbol = domCurrencySymbol;
      }
      
      // 缓存原始数据到content script
      await sendMessageToContent('saveCachedData', {
        date: currentDate,
        ads: processedAds,
        columnMapping: receivedColumnMapping,
        sortInfo: receivedSortInfo,
        currencySymbol: currencySymbol,
        level: receivedSortInfo?.level,
      });
      console.log('缓存广告数据到content成功');
      
      console.log('从缓存中加载修改数据（增加值） 当前日期:', currentDate);
      // 从缓存中加载修改数据（增加值）
      const cachedData = await sendMessageToContent('getCachedData', { date: currentDate });
      if (cachedData && cachedData.modifications && Array.isArray(cachedData.modifications) && ads.value.length > 0) {
        console.log('从content缓存中读取修改数据:', cachedData.modifications);
        
        // 过滤掉null值，只保留有效的修改数据
        const validModifications = cachedData.modifications.filter((item: null | undefined) => item !== null && item !== undefined);
        console.log('过滤后的修改数据:', validModifications);
        
        // 通过ID匹配修改数据，使用completeData.id
        ads.value.forEach(ad => {
          const rowData = validModifications.find((item: { completeData: { id: string; }; }) => 
            item.completeData && item.completeData.id === ad.id
          );
          
          if (rowData && rowData.completeData) {
            console.log('匹配到修改数据:', ad.id, rowData.completeData);
            // 恢复增加的值
            if (rowData.completeData.increase_impressions !== undefined) {
              ad.increase_impressions = rowData.completeData.increase_impressions;
            }
            if (rowData.completeData.increase_reach !== undefined) {
              ad.increase_reach = rowData.completeData.increase_reach;
            }
            if (rowData.completeData.increase_spend !== undefined) {
              ad.increase_spend = rowData.completeData.increase_spend;
            }
            if (rowData.completeData.increase_clicks !== undefined) {
              ad.increase_clicks = rowData.completeData.increase_clicks;
            }
            if (rowData.completeData.increase_registrations !== undefined) {
              ad.increase_registrations = rowData.completeData.increase_registrations;
            }
            if (rowData.completeData.increase_purchases !== undefined) {
              ad.increase_purchases = rowData.completeData.increase_purchases;
            }
            if (rowData.completeData.increase_results !== undefined) {
              ad.increase_results = rowData.completeData.increase_results;
            }
          }
        });
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
 * 3. 本地缓存key设计：ad_{adId}_column_{columnIndex}，直接表明修改数据在页面所在列索引
 */
const saveChanges = async () => {
  saving.value = true;
  error.value = '';
  
  try {
    // 检测哪些广告被修改并保存
    let modifiedCount = 0;
    
    // 先从content script获取现有的修改数据
    const currentDate = getCurrentDate();
    const existingModifications = await sendMessageToContent('getCachedData', { date: currentDate });
    const modificationsArray = Array.isArray(existingModifications.modifications) ? existingModifications.modifications : [];
    
    // 确保modificationsArray的长度与ads.value的长度一致
    modificationsArray.length = ads.value.length;
    
    for (const ad of ads.value) {
      // 检查是否有数值被修改
            const hasChanges = 
              ad.increase_impressions !== undefined ||
              ad.increase_reach !== undefined ||
              ad.increase_spend !== undefined ||
              ad.increase_clicks !== undefined ||
              ad.increase_registrations !== undefined ||
              ad.increase_purchases !== undefined ||
              ad.increase_results !== undefined;
            
            // 获取当前行在表格中的索引
            const rowIndex = ads.value.indexOf(ad);
            
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
              if (ad.increase_results !== undefined) {
                modifiedFields.results = ad.increase_results;
              }
        
        // 构建行数据对象，确保只包含可序列化的属性
        // 清理广告名称，确保与页面中的广告名称一致
        const cleanName = ad.name
          .replace('图表编辑复制打开下拉菜单', '')
          .replace('图表编辑', '')
          .replace('复制', '')
          .replace('打开', '')
          .replace('下拉菜单', '')
          .replace('ChartsEditDuplicateOpen Drop-down', '')
          .replace('Edit', '')
          .replace('Duplicate', '')
          .replace('Open', '')
          .replace('Drop-down', '')
          .replace(/\s*\-\s*\d+$/, '')
          .trim();
        
        const rowData = {
          completeData: {
            id: ad.id,
            name: cleanName,
            status: ad.status,
            campaign_id: ad.campaign_id,
            adset_id: ad.adset_id,
            impressions: ad.impressions,
            increase_impressions: ad.increase_impressions,
            reach: ad.reach,
            increase_reach: ad.increase_reach,
            spend: ad.spend,
            increase_spend: ad.increase_spend,
            clicks: ad.clicks || 0,
            increase_clicks: ad.increase_clicks || 0,
            registrations: ad.registrations || 0,
            increase_registrations: ad.increase_registrations || 0,
            purchases: ad.purchases || 0,
            increase_purchases: ad.increase_purchases || 0,
            results: ad.results || 0,
            increase_results: ad.increase_results || 0,
            currencySymbol: currencySymbol,
          },
          modifiedFields: modifiedFields
        };
        
        // 将当前行数据保存到数组的对应位置
        modificationsArray[rowIndex] = rowData;
        
        console.log(`Saved row ${rowIndex} data:`, rowData);
      } else {
        // 如果没有修改，清除该位置的数据
        modificationsArray[rowIndex] = undefined;
      }
    }
    
    // 获取DOM的日期范围
    const { dateRanges } = await getAdsFromDom();
    console.log('获取DOM日期范围:', dateRanges);
    
    // 保存更新后的数组到content script（所有数据都保存，不管日期是否在范围内）
    await sendMessageToContent('saveModifications', {
      date: currentDate,
      modifications: modificationsArray,
      currencySymbol
    });
    
    // 总是通知页面刷新，由页面自己根据日期范围决定如何渲染数据
    // 获取当前排序信息
    const sortInfo = await sendMessageToContent('getSortInfo', { date: currentDate });
    console.log('当前排序信息:', sortInfo);
    
    // 向content script发送消息，通知页面刷新
    await sendMessageToContent('refreshPageWithData', { sortInfo, date: currentDate, modifications: modificationsArray});
    console.log('已通知页面刷新，页面将根据日期范围渲染数据');
    
    // 保存完成后重新渲染页面
    // await fetchAds();
    
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

// 检查缓存数据
const checkCacheOnMount = async () => {
  try {
    // 获取当前选择的日期
    const currentDate = getCurrentDate();
    
    // 从content script获取缓存数据，与点击获取按钮的逻辑保持一致
    const cachedData = await sendMessageToContent('getCachedData', { date: currentDate });
    console.log('%c从content缓存中读取数据:', 'color: #007bff;font-size: 30px;', cachedData);
    
    if (cachedData && cachedData.ads && cachedData.ads.length > 0) {
      console.log('从content缓存中读取广告数据:', cachedData.ads);
      ads.value = cachedData.ads;
      if (cachedData.columnMapping) {
        columnMapping.value = cachedData.columnMapping;
      }
      
      // 加载并应用修改数据
      if (cachedData.modifications && Array.isArray(cachedData.modifications) && ads.value.length > 0) {
        console.log('从content缓存中读取修改数据:', cachedData.modifications);
        // 过滤掉null值，只保留有效的修改数据
        const validModifications = cachedData.modifications.filter((item: null | undefined) => item !== null && item !== undefined);
        console.log('过滤后的修改数据:', validModifications);
        
        ads.value.forEach(ad => {
          // 通过ID匹配修改数据，使用completeData.id
          const rowData = validModifications.find((item: { completeData: { id: string; }; }) => 
            item.completeData && item.completeData.id === ad.id
          );
          
          if (rowData && rowData.completeData) {
            console.log('匹配到修改数据:', ad.id, rowData.completeData);
            // 恢复增加的值
            if (rowData.completeData.increase_impressions !== undefined) {
              ad.increase_impressions = rowData.completeData.increase_impressions;
            }
            if (rowData.completeData.increase_reach !== undefined) {
              ad.increase_reach = rowData.completeData.increase_reach;
            }
            if (rowData.completeData.increase_spend !== undefined) {
              ad.increase_spend = rowData.completeData.increase_spend;
            }
            if (rowData.completeData.increase_clicks !== undefined) {
              ad.increase_clicks = rowData.completeData.increase_clicks;
            }
            if (rowData.completeData.increase_registrations !== undefined) {
              ad.increase_registrations = rowData.completeData.increase_registrations;
            }
            if (rowData.completeData.increase_purchases !== undefined) {
              ad.increase_purchases = rowData.completeData.increase_purchases;
            }
            if (rowData.completeData.increase_results !== undefined) {
              ad.increase_results = rowData.completeData.increase_results;
            }
          }
        });
      }
    } else {
      console.log('没有缓存数据，跳过加载');
    }
  } catch (error) {
    console.error('检查缓存数据错误:', error);
  }
};

// 从DOM中提取货币符号
let currencySymbol = '$'; // 默认货币符号

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

// 处理日期选择器变化
const handleDateChange = (date: string) => {
  console.log('选择的日期:', date);
  // 清空表格数据和相关状态
  ads.value = [];
  columnMapping.value = {};
  error.value = '';
};

// 初始化
onMounted(() => {
  // 获取货币符号
  getCurrencySymbol();
  
  // 执行缓存检查
  checkCacheOnMount();
});
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
      <!-- <div class="action-bar-right">
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
      </div> -->
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
            <th>成效</th>
            <th>增加</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ad in ads" :key="ad.id">
            <!-- <td>{{ ad.id }}</td> -->
            <td class="ellipsis-cell" :title="ad.name">
              {{ ad.name }}
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
            <td class="ellipsis-cell" :title="String(ad.results || '-')">  
              {{ ad.results || '0' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_results" 
                class="editable-input"
                min="0"
              />
            </td>
          </tr>
          <tr v-if="ads.length === 0 && !loading">
            <td colspan="16" class="empty-state">
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
  padding: 6px;
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
  padding: 12px 6px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
  border-right: 1px solid #e8e8e8;
  max-width: 100px!important;
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
  width: 60px;
  padding: 3px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  /* 确保没有额外的内边距或边框影响宽度 */
  min-width: 60px;
  max-width: 60px;
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
  max-width: 100px!important;
}

.ads-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px!important;
}

.ads-table th {
  white-space: nowrap;
  min-width: 100px;
}
</style>