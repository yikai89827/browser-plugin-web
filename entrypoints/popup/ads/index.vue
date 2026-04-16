<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import { browser } from "wxt/browser";
import axios from "axios";
// import { browserStorage } from "../../../utils/storage";

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
  costPerResult: number;
  other_events: number;
  website_clicks: number;
  increase_website_clicks: number;
  registrations: number;
  increase_registrations: number;
  registration_cost: number;
  increase_registration_cost: number;
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
async function getAdsFromDom(): Promise<{ ads: AdData[], DomColumnMapping: any, sortInfo: any }> {
  const response = await sendMessageToContent('getAdsFromDom');
  if (response && response.ads) {
    return { 
      ads: response.ads, 
      DomColumnMapping: response.DomColumnMapping || {},
      sortInfo: response.sortInfo || { field: null, direction: null }
    };
  } else {
    return { ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null } };
  }
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
// const dataProtectionEnabled = ref(true);
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

// 其他数据管理项
const events = ref([
  { id: 'website_clicks', name: '网站点击' },
  { id: 'registrations', name: '注册' },
  { id: 'registration_cost', name: '注册成本' }
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
  //     costPerResult: 2,
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
  //     costPerResult: 2,
  //     other_events: 20
  //   }
  // ];
  try {
    // 先从content script获取当前排序信息
    const currentDate = getCurrentDate();
    const sortInfo = await sendMessageToContent('getSortInfo', { date: currentDate });
    console.log('当前排序信息:', sortInfo);
    
    // 从content script获取缓存数据
    const cachedData = await sendMessageToContent('getCachedData', { date: currentDate });
    
    if (cachedData && cachedData.ads && cachedData.ads.length > 0) {
      console.log('从content缓存中读取广告数据:', cachedData.ads);
      let adsData = cachedData.ads;
      
      // 如果有排序信息，根据排序信息对数据进行排序
      if (sortInfo && sortInfo.field && sortInfo.direction) {
        console.log('根据排序信息对广告数据进行排序:', sortInfo.field, sortInfo.direction);
        adsData.sort((a, b) => {
          const field = sortInfo.field;
          const valueA = a[field] || 0;
          const valueB = b[field] || 0;
          
          if (sortInfo.direction === 'asc') {
            return valueA - valueB;
          } else {
            return valueB - valueA;
          }
        });
        console.log('排序后的广告数据:', adsData);
      }
      
      ads.value = adsData;
      if (cachedData.columnMapping) {
        columnMapping.value = cachedData.columnMapping;
      }
      
      // 加载并应用修改数据
      if (cachedData.modifications && Array.isArray(cachedData.modifications) && ads.value.length > 0) {
        console.log('从content缓存中读取修改数据:', cachedData.modifications);
        
        // 如果有排序信息，根据排序信息对修改数据进行排序
        let sortedModifications = cachedData.modifications;
        if (sortInfo && sortInfo.field && sortInfo.direction) {
          console.log('根据排序信息对修改数据进行排序:', sortInfo.field, sortInfo.direction);
          sortedModifications = [...cachedData.modifications].sort((a, b) => {
            if (!a || !b || !a.completeData || !b.completeData) return 0;
            const field = sortInfo.field;
            const valueA = a.completeData[field] || 0;
            const valueB = b.completeData[field] || 0;
            
            if (sortInfo.direction === 'asc') {
              return valueA - valueB;
            } else {
              return valueB - valueA;
            }
          });
          console.log('排序后的修改数据:', sortedModifications);
        }
        
        ads.value.forEach((ad, index) => {
          const rowData = sortedModifications[index];
          if (rowData && rowData.modifiedFields) {
            // 恢复增加的值
          if (rowData.modifiedFields.impressions !== undefined) {
            ad.increase_impressions = rowData.modifiedFields.impressions;
          }
          if (rowData.modifiedFields.reach !== undefined) {
            ad.increase_reach = rowData.modifiedFields.reach;
          }
          if (rowData.modifiedFields.spend !== undefined) {
            ad.increase_spend = rowData.modifiedFields.spend;
          }
          if (rowData.modifiedFields.results !== undefined) {
            ad.increase_results = rowData.modifiedFields.results;
          }
          if (rowData.modifiedFields.website_clicks !== undefined) {
            ad.increase_website_clicks = rowData.modifiedFields.website_clicks;
          }
          if (rowData.modifiedFields.registrations !== undefined) {
            ad.increase_registrations = rowData.modifiedFields.registrations;
          }
          if (rowData.modifiedFields.registration_cost !== undefined) {
            ad.increase_registration_cost = rowData.modifiedFields.registration_cost;
          }
          }
        });
      }
    } else {
      // 从DOM获取广告数据
      const { ads: domAds, DomColumnMapping: receivedColumnMapping, sortInfo: receivedSortInfo } = await getAdsFromDom();
      console.log('从DOM获取广告数据成功:', domAds);
      console.log('从DOM获取列映射成功:', receivedColumnMapping);
      console.log('从DOM获取排序信息成功:', receivedSortInfo);
      
      if (domAds && domAds.length > 0) {
        ads.value = domAds;
        columnMapping.value = receivedColumnMapping;
        
        // 缓存数据到content script
        await sendMessageToContent('saveCachedData', {
          date: currentDate,
          ads: domAds,
          columnMapping: receivedColumnMapping,
          sortInfo: receivedSortInfo
        });
        console.log('缓存广告数据到content成功');
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
              ad.increase_results !== undefined ||
              ad.increase_website_clicks !== undefined ||
              ad.increase_registrations !== undefined ||
              ad.increase_registration_cost !== undefined;
            
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
              if (ad.increase_results !== undefined) {
                modifiedFields.results = ad.increase_results;
              }
              if (ad.increase_website_clicks !== undefined) {
                modifiedFields.website_clicks = ad.increase_website_clicks;
              }
              if (ad.increase_registrations !== undefined) {
                modifiedFields.registrations = ad.increase_registrations;
              }
              if (ad.increase_registration_cost !== undefined) {
                modifiedFields.registration_cost = ad.increase_registration_cost;
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
            results: ad.results,
            increase_results: ad.increase_results,
            costPerResult: ad.costPerResult,
            other_events: ad.other_events,
            website_clicks: ad.website_clicks || 0,
            increase_website_clicks: ad.increase_website_clicks || 0,
            registrations: ad.registrations || 0,
            increase_registrations: ad.increase_registrations || 0,
            registration_cost: ad.registration_cost || 0,
            increase_registration_cost: ad.increase_registration_cost || 0
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
    
    // 保存更新后的数组到content script
    
     await sendMessageToContent('saveModifications', {
      date: currentDate,
      modifications: modificationsArray
    });
    
    // 获取当前排序信息
    const sortInfo = await sendMessageToContent('getSortInfo', { date: currentDate });
    console.log('当前排序信息:', sortInfo);
    
    // 向content script发送消息，通知页面刷新
    await sendMessageToContent('refreshPageWithData', { sortInfo });
    
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

// 设置下拉菜单ref
const setDropdownRef = (el: HTMLElement | null, adId: string) => {
  if (el) {
    dropdownRefs.value[adId] = el;
  }
};

// 切换下拉菜单
const toggleDropdown = (adId: string, event: MouseEvent) => {
  // 先关闭所有其他弹窗
  Object.keys(dropdownOpen.value).forEach(id => {
    if (id !== adId) {
      dropdownOpen.value[id] = false;
    }
  });
  
  // 切换当前弹窗的状态
  const isOpen = !dropdownOpen.value[adId];
  dropdownOpen.value[adId] = isOpen;
};

// 获取其他数据的原始值
const getOriginalValue = (ad: AdData, eventId: string): number => {
  return ad[eventId] || 0;
};

// 获取其他数据的增加的值
const getIncreaseValue = (ad: AdData, eventId: string): number => {
  const increaseField = `increase_${eventId}`;
  return ad[increaseField] || 0;
};

// 获取下拉菜单样式
const getDropdownStyle = (adId: string) => {
  return {}; // 样式已通过CSS固定，无需动态计算
};

// 触发事件
const triggerEvent = (adId: string, eventId: string) => {
  console.log('触发事件:', eventId, '广告:', adId);
  
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
        ads.value.forEach((ad, index) => {
          const rowData = cachedData.modifications[index];
          if (rowData && rowData.modifiedFields) {
            // 恢复增加的值
            if (rowData.modifiedFields.impressions !== undefined) {
              ad.increase_impressions = rowData.modifiedFields.impressions;
            }
            if (rowData.modifiedFields.reach !== undefined) {
              ad.increase_reach = rowData.modifiedFields.reach;
            }
            if (rowData.modifiedFields.spend !== undefined) {
              ad.increase_spend = rowData.modifiedFields.spend;
            }
            if (rowData.modifiedFields.results !== undefined) {
              ad.increase_results = rowData.modifiedFields.results;
            }
            if (rowData.modifiedFields.website_clicks !== undefined) {
              ad.increase_website_clicks = rowData.modifiedFields.website_clicks;
            }
            if (rowData.modifiedFields.registrations !== undefined) {
              ad.increase_registrations = rowData.modifiedFields.registrations;
            }
            if (rowData.modifiedFields.registration_cost !== undefined) {
              ad.increase_registration_cost = rowData.modifiedFields.registration_cost;
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
  // 执行缓存检查
  checkCacheOnMount();
  

  
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
            <td class="ellipsis-cell" :title="ad.reach || '-' ">
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
            <td class="ellipsis-cell" :title="ad.impressions || '-' ">
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
            <td class="ellipsis-cell" :title="ad.spend || '0' ">
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
            <td class="ellipsis-cell" :title="ad.results || '-' ">
              {{ ad.results || '-' }}
            </td>
            <td>
              <input 
                type="number" 
                v-model="ad.increase_results" 
                class="editable-input"
                min="0"
              />
            </td>
            <td class="ellipsis-cell" :title="ad.costPerResult || '-' ">
              {{ ad.costPerResult || '-' }}</td>
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
                  >
                    <div class="event-item-container">
                      <div class="event-item-label">
                        {{ event.name }}: 
                        <span class="event-item-original">{{ getOriginalValue(ad, event.id) }}</span>
                      </div>
                      <div class="event-item-input">
                        增加:
                        <input 
                          type="number" 
                          v-model.number="ad[`increase_${event.id}`]" 
                          class="event-item-input-field"
                          min="0"
                          step="1"
                        />
                      </div>
                    </div>
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
  background-color: #000;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 250px;
  z-index: 99999; /* 增加z-index确保悬浮于表格上面 */
  margin-top: 4px;
  position: fixed; /* 改为固定定位 */
  left: 50%;
  transform: translateX(-50%);
  top: 200px; /* 顶部距离，使弹窗在表头以下 */
}

.event-dropdown-item {
  padding: 8px 12px;
  transition: background-color 0.2s;
  color: #fff;
  border-bottom: 1px solid #fff;
}

.event-dropdown-item:hover {
  background-color: #c1c1c1;
  color: #000;
}

.event-item-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.event-item-label {
  font-size: 14px;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.event-item-original {
  font-weight: bold;
  width: 80px;
  text-align: right;
}

.event-item-input {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #fff;
}

.event-item-input-field {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background-color: #fff;
  color: #000;
  text-align: left;
}

.event-item-input-field:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
</style>