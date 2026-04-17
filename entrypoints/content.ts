// @ts-nocheck
import { browserStorage } from '../utils/storage';
// import md5 from 'blueimp-md5';

// 广告数据类型
interface AdData {
  id: string;
  name: string;
  increase_impressions: number;
  increase_reach: number;
  increase_spend: number;
  increase_results: number;
  increase_website_clicks: number;
  increase_registrations: number;
  increase_registration_cost: number;
  updated_at: string;
}

// 列映射配置 - 表头ID到字段名的映射
const columnMapping = {
  name: 'reporting_table_column_name',//广告名称
  impressions: 'reporting_table_column_impressions',//展示次数
  reach: 'reporting_table_column_reach',//覆盖次数
  spend: 'reporting_table_column_spend',//花费
  results: 'ads_manager_table_results_column_label_id',//成效
  costPerResult: 'reporting_table_column_cost_per_result',//单次成效
  website_clicks: 'reporting_table_column_website_clicks',//网站点击
  registrations: 'reporting_table_column_registrations',//注册
  registration_cost: 'reporting_table_column_registration_cost',//注册成本
};

// 定义需要计算的数值字段（排除DOM中暂时没有的字段）
const numericFields = [
  'impressions', 'reach', 'spend', 'results', 'costPerResult'
  // 排除以下字段，因为DOM中暂时没有
  // 'website_clicks', 'registrations', 'registration_cost'
];

// 存储列索引
let columnIndices: Record<string, number> = {};

//固定列长度
let fixedColumnLength: number = 1;

// 遮盖层元素
let overlayElement: HTMLElement | null = null;

// 当前页面状态
let currentPageState = {
  tab: '', // 当前tab分类
  sortField: null, // 当前排序字段
  sortDirection: null, // 当前排序方向
  level: '' // 当前层级（竞选活动、广告组、广告）
};

// 全局同步状态
if (typeof window !== 'undefined') {
  (window as any).isSyncing = false;
}

// 获取当前日期，格式为YYYY-MM-DD
function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 获取当前页面状态
function getCurrentPageState() {
  // 从URL中获取当前tab名称
  const pathParts = window.location.href.split('/');
  const tab = pathParts[pathParts.length - 1];
  
  // 获取当前层级（竞选活动、广告组、广告）
  let level = '';
  if (tab.includes('campaigns')) {
    level = 'Campaigns';
  } else if (tab.includes('adsets')) {
    level = 'Adsets';
  } else if (tab.includes('ads')) {
    level = 'Ads';
  }
  
  // 获取当前排序状态
  const { sortField, sortDirection } = detectSortInfo();
  
  return {
    level,
    sortField,
    sortDirection
  };
}

// 生成缓存键（不包含排序信息，排序信息使用独立的key存储）
function generateCacheKey(prefix: string) {
  const date = getCurrentDate();
  const {level} = getCurrentPageState();
  return `${prefix}_${date}_${level}`;
}

// 生成排序信息的缓存键
function generateSortInfoKey() {
  const date = getCurrentDate();
  const {level} = getCurrentPageState();
  return `sortInfo_${date}_${level}`;
}

// 生成唯一标识（按照popup页面上显示的数值类数据相加，然后加上名字）
function generateUniqueId(name: string, originalValues: any): string {
  // 提取数值类字段并相加
  let sum = 0;
  
  console.log('原始值:', originalValues, numericFields, name);
  
  // 检查originalValues中的字段
  if (typeof originalValues === 'object' && originalValues !== null) {
    // 检查直接字段（从completeData提取的）
    numericFields.forEach(field => {
      if (originalValues[field] !== undefined) {
        let value = 0;
        const fieldValue = originalValues[field];
        if (typeof fieldValue === 'string') {
          // 清理数字字符串，移除非数字字符（除了小数点和负号）
          const cleanedText = fieldValue.replace(/[^\d.-]/g, '');
          value = parseFloat(cleanedText);
        } else {
          value = parseFloat(fieldValue);
        }
        if (!isNaN(value)) {
          // 取整，不需要保留小数
          const roundedValue = Math.round(value);
          sum += roundedValue;
          console.log(`从${field}提取并清理的值: ${fieldValue} → ${value} → ${roundedValue}`);
        }
      }
    });
  }
  
  console.log('计算唯一标识时的名称:', name);
  console.log('计算唯一标识时的数值总和:', sum);
  
  // 对总和取整，不需要保留小数
  const roundedSum = Math.round(sum);
  console.log('取整后的总和:', roundedSum);
  
  // 组合名字和数值总和，确保属性顺序一致
  const cleanedName = cleanAdName(name);
  // 确保字符串的一致性，移除所有不可见字符
  const sanitizedName = cleanedName.replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F\u205F\u3000]/g, '').trim();
  
  // 转换为字符串并计算哈希值
  const str = `name${sanitizedName}sum${roundedSum}`;
  console.log('计算哈希的字符串:', str);
  // console.log('字符串长度:', str.length);
  // console.log('字符串字符码:', Array.from(str).map(c => c.charCodeAt(0)).join(''));
  
  // 使用 charCodeAt 算法计算唯一id
  const uniqueId = Array.from(str).map(c => c.charCodeAt(0)).join('');
  console.log('生成的唯一标识:', uniqueId);
  return uniqueId;
}

// 将DOM提取的数据转换为缓存提取出来的原始值格式
function convertDomValuesToOriginalValues(domValues: any, currentColumnIndices: Record<string, number>): any {
  const originalValues = {};
  
  // 遍历配置的字段
  numericFields.forEach(field => {
    const columnIndex = currentColumnIndices[field]-fixedColumnLength;
    console.log(`convertDomValuesToOriginalValues转换后的列索引: ${columnIndex}`);
       
    if (columnIndex !== undefined && domValues[`scrollable_${columnIndex}`] !== undefined) {
      originalValues[field] = domValues[`scrollable_${columnIndex}`];
    }
  });
  
  console.log('转换后的原始值:', originalValues);
  return originalValues;
}

// 检测排序信息
function detectSortInfo() {
  let sortField = null;
  let sortDirection = null;
  
  try {
    // 查找具有sorting属性且role="columnheader"的元素
    const columnHeaderElements = document.querySelectorAll('[role="columnheader"]');
    
    // 使用for循环而不是forEach，以便能够提前返回
    for (let i = 0; i < columnHeaderElements.length; i++) {
      const element = columnHeaderElements[i];
      
      // 尝试多种方式获取排序属性
      const sortingAttr = element.getAttribute('sorting') || 
                         element.getAttribute('aria-sort') || 
                         element.getAttribute('data-sort');
      
      
      // 如果找到排序属性
      if (sortingAttr) {
        // 从元素文本中提取字段名
        const fieldName = element.textContent?.trim().toLowerCase() || '';
        
        // 使用公共函数映射字段名到标准字段名
        sortField = mapFieldNameToStandard(fieldName);
        
        // 如果没有匹配到标准字段，使用标准化的字段名
        if (!sortField) {
          sortField = fieldName
            .replace(/[^a-z0-9\s]/g, '') // 移除特殊字符
            .trim()
            .replace(/\s+/g, '_'); // 将空格替换为下划线
        }
        
        // 设置排序方向
        if (sortingAttr.toLowerCase() === 'asc' || sortingAttr.includes('↑') || sortingAttr.includes('up') || sortingAttr.includes('ascending')) {
          sortDirection = 'asc';
        } else if (sortingAttr.toLowerCase() === 'desc' || sortingAttr.includes('↓') || sortingAttr.includes('down') || sortingAttr.includes('descending')) {
          sortDirection = 'desc';
        }
        
        return { sortField, sortDirection };
      }
    }
    
    // 如果没有找到排序属性，尝试从URL中获取排序信息
    const urlParams = new URLSearchParams(window.location.search);
    const sortParam = urlParams.get('sort');
    if (sortParam) {
      console.log(`从URL获取排序信息: ${sortParam}`);
      // 解析URL中的排序参数
      const sortParts = sortParam.split('.');
      if (sortParts.length === 2) {
        sortField = sortParts[0];
        sortDirection = sortParts[1];
      }
    }
  } catch (error) {
    console.error('Error detecting sort info:', error);
  }
  
  console.log(`检测到排序信息: field=${sortField}, direction=${sortDirection}`);
  return { sortField, sortDirection };
}

// 创建遮盖层
function createOverlay() {
  // 如果遮盖层已经存在，先移除
  if (overlayElement) {
    overlayElement.remove();
  }
  
  // 找到表格容器
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.log('未找到表格容器，使用全屏覆盖层');
    // 如果找不到表格容器，使用全屏遮盖层
    overlayElement = document.createElement('div');
    overlayElement.style.position = 'fixed';
    overlayElement.style.top = '0';
    overlayElement.style.left = '0';
    overlayElement.style.width = '100%';
    overlayElement.style.height = '100%';
    overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 1)'; // 完全不透明
    overlayElement.style.zIndex = '999999';
    overlayElement.style.display = 'flex';
    overlayElement.style.justifyContent = 'center';
    overlayElement.style.alignItems = 'center';
  } else {
    // 获取表格容器的位置和大小
    const rect = tableContainer.getBoundingClientRect();
    
    // 创建遮盖层元素
    overlayElement = document.createElement('div');
    overlayElement.style.position = 'fixed';
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
    overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 1)'; // 完全不透明
    overlayElement.style.zIndex = '999999';
    overlayElement.style.display = 'flex';
    overlayElement.style.justifyContent = 'center';
    overlayElement.style.alignItems = 'center';
  }
  
  // 添加加载动画
  const spinner = document.createElement('div');
  spinner.style.border = '4px solid rgba(0, 0, 0, 0.1)';
  spinner.style.borderLeftColor = '#3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '40px';
  spinner.style.height = '40px';
  spinner.style.animation = 'spin 1s linear infinite';
  
  // 添加关闭按钮
  const closeButton = document.createElement('button');
  closeButton.textContent = '关闭';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '10px';
  closeButton.style.padding = '8px 16px';
  closeButton.style.backgroundColor = '#3498db';
  closeButton.style.color = 'white';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '14px';
  closeButton.style.fontWeight = 'bold';
  closeButton.style.zIndex = '1000000';
  closeButton.onclick = () => {
    removeOverlay();
  };
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  overlayElement.appendChild(spinner);
  overlayElement.appendChild(closeButton);
  document.body.appendChild(overlayElement);
}

// 移除遮盖层
function removeOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

export default {
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Facebook Ads Manager 内容脚本已加载');
    
    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getAdsFromDom') {
        // 处理异步的extractAdsFromDom函数
        extractAdsFromDom().then(({ ads, DomColumnMapping, sortInfo }) => {
          sendResponse({ ads, DomColumnMapping, sortInfo });
        }).catch((error) => {
          console.error('提取广告数据错误:', error);
          sendResponse({ ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null } });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'refreshPageWithData') {
        // 收到刷新页面的请求，重新同步数据
        const sortInfo = message.sortInfo;
        // 创建遮盖层
        createOverlay();
        syncAdDataToPage(sortInfo).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('刷新页面数据错误:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'getCachedData') {
        // 从缓存中获取数据
        const date = message.date;
        // 使用新的缓存键生成函数
        const adsKey = generateCacheKey('ads');
        // 使用缓存键获取修改数据
        const modificationsKey = generateCacheKey('ad_modifications');
        
        Promise.all([
          browserStorage.get(adsKey),
          browserStorage.get(modificationsKey)
        ]).then(([adsData, modifications]) => {
          // 从新的缓存结构中提取数据
          const ads = adsData?.cacheData?.ads || [];
          const columnMapping = adsData?.cacheData?.columnMapping || {};
          const sortInfo = adsData?.sortInfo || { field: null, direction: null };
          
          sendResponse({ ads, columnMapping, sortInfo, modifications });
        }).catch((error) => {
          console.error('获取缓存数据错误:', error);
          sendResponse({ ads: [], columnMapping: {}, sortInfo: { field: null, direction: null }, modifications: [] });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'saveCachedData') {
        // 保存缓存数据
        const { date, ads, columnMapping, sortInfo } = message;
        // 使用新的缓存键生成函数
        const adsKey = generateCacheKey('ads');
        
        // 构建新的缓存结构
        const cacheData = {
          ads,
          columnMapping
        };
        const dataToSave = {
          sortInfo,
          cacheData
        };
        
        browserStorage.set(adsKey, dataToSave).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('保存缓存数据错误:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'saveModifications') {
        // 保存修改数据
        const { date, modifications } = message;
        
        // 获取列索引，用于生成唯一标识
        const columnMappingKey = generateCacheKey('columnMapping');
        
        // 使用 Promise 链获取列索引
        browserStorage.get(columnMappingKey).then(async columnIndex => {
          console.log('保存时获取的列索引:', columnIndex);  
          
          // 为每个修改项生成唯一标识
          const modificationsWithUniqueId = modifications.map(item => {
            if (item && item.completeData) {
              // 提取所有原始值（排除增加字段）
              const originalValues = {};
              
              console.log('completeData:', item.completeData);
              console.log('modifiedFields:', item.modifiedFields);
              
              // 从completeData中提取原始值
              Object.keys(item.completeData).forEach(key => {
                if (!key.startsWith('increase_')) {
                  originalValues[key] = item.completeData[key];
                }
              });
              
              // 从modifiedFields中提取原始值（如果有的话）
              if (item.modifiedFields) {
                Object.keys(item.modifiedFields).forEach(key => {
                  // 尝试从completeData中获取原始值，如果没有则使用0
                  const originalValue = item.completeData[key] !== undefined&&item.completeData[key] !== '' ? item.completeData[key] : 0;
                  originalValues[key] = originalValue;
                });
              }
              
              console.log('生成唯一标识时的原始值:', originalValues);
              
              // 生成唯一标识（只使用原始值）
              const uniqueId = generateUniqueId(item.completeData.name, originalValues);
              
              // 处理增加值，确保为0、为空、为undefined等都转为0
              const processedModifiedFields = {};
              if (item.modifiedFields) {
                Object.keys(item.modifiedFields).forEach(key => {
                  const value = item.modifiedFields[key];
                  processedModifiedFields[key] = value === undefined || value === null || value === '' ? 0 : value;
                });
              }
              
              return {
                ...item,
                modifiedFields: processedModifiedFields,
                uniqueId
              };
            }
            return item;
          });
          
          // 使用缓存键，因为修改数据应该与排序状态无关
          const modificationsKey = generateCacheKey('ad_modifications');
          
          // 同时保存当前排序信息
          const sortInfo = detectSortInfo();
          const sortInfoKey = generateSortInfoKey();

          console.log('当前排序信息:', sortInfo,sortInfoKey);
          
          // 检查是否是第一次保存
          const existingModifications = await browserStorage.get(modificationsKey);
          const isFirstSave = !existingModifications || !Array.isArray(existingModifications) || existingModifications.length === 0;
          console.log(`是否第一次保存: ${isFirstSave}`);
          await Promise.all([
            browserStorage.set(modificationsKey, modificationsWithUniqueId),
            browserStorage.set(sortInfoKey, sortInfo)
          ]);
          // 保存成功后触发页面刷新
          console.log('保存修改成功，触发页面刷新');
          console.log('保存的排序信息:', sortInfo);
          debouncedSync();
          sendResponse({ success: true, isFirstSave });
        }).catch((error) => {
          console.error('保存修改数据错误:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'getSortInfo') {
        // 获取排序信息
        const date = message.date;
        // 使用新的排序信息缓存键生成函数
        const sortInfoKey = generateSortInfoKey();
        browserStorage.get(sortInfoKey).then((sortInfo) => {
          sendResponse(sortInfo);
        }).catch((error) => {
          console.error('获取排序信息错误:', error);
          sendResponse({ field: null, direction: null });
        });
        // 返回true表示异步响应
        return true;
      }
    });
    
    // 立即开始获取缓存数据
    let cachedModifications = null;
    let cachedColumnMapping = null;
    let isSyncing = false;
    const currentDate = getCurrentDate();
    
    // 预加载缓存数据
    const loadCachedData = async () => {
      if (!window.isSyncing) {
        window.isSyncing = true;
        try {
          // 获取当前页面状态
          const pageState = getCurrentPageState();
          currentPageState = pageState;
          
          // 使用新的缓存键生成函数获取缓存数据
          const modificationsKey = generateCacheKey('ad_modifications');
          const columnMappingKey = generateCacheKey('columnMapping');
          
          const modifications = await browserStorage.get(modificationsKey);
          const columnMapping = await browserStorage.get(columnMappingKey);
          
          cachedModifications = modifications;
          cachedColumnMapping = columnMapping;
          console.log('预加载缓存数据:', { modifications, columnMapping, pageState });
          
          // 只有在有缓存数据时才创建遮盖层
          if (cachedModifications) {
            createOverlay();
            await syncAdDataToPage();
          }
        } catch (error) {
          console.error('加载缓存数据错误:', error);
        } finally {
          // 无论成功失败都关闭遮盖层
          removeOverlay();
          window.isSyncing = false;
        }
      }
    };
    
    // 立即加载缓存数据
    loadCachedData();
    
    // 存储上一次的排序信息
    let lastSortInfo = { field: null, direction: null };
    
    // 存储上一次的列映射
    let lastColumnMapping = {};
    
    // 防抖函数
    let syncTimeout = null;
    let lastSyncTime = 0;
    let isUpdatingDOM = false;
    const debouncedSync = async () => {
      // 检查是否在短时间内已经执行过同步，避免频繁调用
      const now = Date.now();
      if (now - lastSyncTime < 300) {
        console.log('跳过同步，距离上次同步时间太短');
        return;
      }
      
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        // 检查全局的isSyncing变量
        if (!window.isSyncing && !isUpdatingDOM) {
          window.isSyncing = true;
          lastSyncTime = now;
          try {
            // 检查是否有缓存数据
            const modificationsKey = generateCacheKey('ad_modifications');
            const modificationsArray = await browserStorage.get(modificationsKey);
            
            // 只有在有缓存数据时才创建遮盖层
            if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
              createOverlay();
            }
            
            // 重新获取列索引
            await getColumnIndices();
            
            // 重新提取广告数据（包括原始值）
            const { ads, DomColumnMapping, sortInfo } = await extractAdsFromDom();
            
            // 保存更新后的列映射
            if (DomColumnMapping && Object.keys(DomColumnMapping).length > 0) {
              const columnMappingKey = generateCacheKey('columnMapping');
              await browserStorage.set(columnMappingKey, DomColumnMapping);
              lastColumnMapping = DomColumnMapping;
            }
            
            // 同步广告数据到页面
            await syncAdDataToPage(sortInfo);
          } catch (error) {
            console.error('刷新页面数据错误:', error);
          } finally {
            // 无论成功失败都关闭遮盖层
            removeOverlay();
            window.isSyncing = false;
          }
        }
      }, 0);
    };
    
    // 使用MutationObserver来拦截页面渲染
    const observer = new MutationObserver((mutations) => {
      // 检查是否有排序变化
      let hasSortChange = false;
      try {
        const { sortField, sortDirection } = detectSortInfo();
        if (sortField && sortDirection) {
          if (sortField !== lastSortInfo.field || sortDirection !== lastSortInfo.direction) {
            lastSortInfo = { field: sortField, direction: sortDirection };
            hasSortChange = true;
            console.log('检测到排序变更:', lastSortInfo);
          }
        }
      } catch (error) {
        console.error('检测排序信息错误:', error);
      }
      
      // 检查是否有表格列位置变化
      let hasColumnChange = false;
      try {
        // 检查是否有列头相关的变化
        const hasColumnHeaderChanges = mutations.some(mutation => {
          if (mutation.target.nodeType === Node.ELEMENT_NODE) {
            const element = mutation.target as HTMLElement;
            return element.getAttribute('role') === 'columnheader' ||
                   element.querySelector('[role="columnheader"]') ||
                   element.classList.contains('_3hi'); // 表格容器类
          }
          return false;
        });
        
        if (hasColumnHeaderChanges) {
          // 重新获取列索引
          const newColumnIndices = getColumnIndicesSync();
          if (Object.keys(newColumnIndices).length > 0) {
            // 比较新的列索引与当前的列索引
            const currentColumnKeys = Object.keys(columnIndices).sort();
            const newColumnKeys = Object.keys(newColumnIndices).sort();
            
            if (currentColumnKeys.length !== newColumnKeys.length) {
              hasColumnChange = true;
            } else {
              for (let i = 0; i < currentColumnKeys.length; i++) {
                if (currentColumnKeys[i] !== newColumnKeys[i] || 
                    columnIndices[currentColumnKeys[i]] !== newColumnIndices[newColumnKeys[i]]) {
                  hasColumnChange = true;
                  break;
                }
              }
            }
            
            if (hasColumnChange) {
              console.log('检测到表格列位置变化');
            }
          }
        }
      } catch (error) {
        console.error('检测列位置变化错误:', error);
      }
      
      // 只在排序变化或表格列位置变化时触发同步
      if (hasSortChange || hasColumnChange) {
        console.log('检测到排序变更或表格列位置变化，触发同步');
        
        // 立即显示遮盖层
        const modificationsKey = generateCacheKey('ad_modifications');
        browserStorage.get(modificationsKey).then((modificationsArray) => {
          if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
            console.log('有缓存数据，显示遮盖层');
            createOverlay();
          }
        });
        
        // 延迟执行同步，等待排序操作完成
        setTimeout(() => {
          debouncedSync();
        }, 500); // 等待500ms让排序操作完成
      }
    });
    
    // 开始观察页面变化
    observer.observe(document.querySelector('[role="table"]'), {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['sorting', 'aria-sort', 'data-sort'] // 监听所有排序相关属性的变化
    });
    
    // 监听URL变化，当切换tab时重新加载缓存数据
    let lastUrl = window.location.href;
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('URL 已更改，重新加载缓存数据:', currentUrl);
        // 不在这里创建遮盖层，而是在loadCachedData中根据缓存数据情况决定
        // 重新加载缓存数据
        loadCachedData();
      }
    }, 500);
    
    setTimeout(() => {
      // 1秒后执行
      debouncedSync();
    }, 1000);
  }
};

// 获取列索引（同步版本）
function getColumnIndicesSync() {
  const result = {};
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      return result;
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      return result;
    }
    
    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    
    headerCells.forEach((cell, index) => {
      // 检查单元格的ID是否匹配列映射（在孙元素上查找ID）
      const cellId = cell?.children[0]?.children[0]?.id || '';

      for (const [field, idPattern] of Object.entries(columnMapping)) {
        if (cellId.includes(idPattern)) {
          result[field] = index;
          break;
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting column indices sync:', error);
  }
  return result;
}

// 获取列索引
async function getColumnIndices(attempt = 0) {
  // 添加递归终止条件，避免无限递归
  if (attempt > 5) {
    console.warn('获取列索引最大尝试次数已达，停止尝试');
    return;
  }
  
  columnIndices = {};
  
  try {
    // 首先尝试从缓存中获取列映射
    const columnMappingKey = generateCacheKey('columnMapping');
    console.log('列映射缓存键:', columnMappingKey);
    const DomColumnMapping = await browserStorage.get(columnMappingKey);
    
    // 如果从缓存中获取到了列映射，直接使用
    if (DomColumnMapping && Object.keys(DomColumnMapping).length > 0) {
      columnIndices = DomColumnMapping;
      console.log('设置列索引为缓存值:', columnIndices);
      return;
    }
    
    // 如果缓存中没有列映射，尝试从DOM中获取
    console.log('未找到缓存的列映射，从DOM获取 (尝试:', attempt + 1, ')' );
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('未找到表格容器');
      return;
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('未找到表头行');
      return;
    }
    
    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    console.log('找到表头单元格:', headerCells.length);
    
    headerCells.forEach((cell, index) => {
      // 检查单元格的ID是否匹配列映射（在孙元素上查找ID）
      const cellId = cell?.children[0]?.children[0]?.id || '';
      for (const [field, idPattern] of Object.entries(columnMapping)) {
        if (cellId.includes(idPattern)) {
          columnIndices[field] = index;
          break;
        }
      }
    });
    
    // 确保所有必要的列都被找到
    const missingFields = numericFields.filter(field => !columnIndices[field]);
    
    if (missingFields.length > 0) {
      console.log('缺少字段的列索引:', missingFields);
      // 尝试再次获取，可能表头还没有完全加载
      await new Promise(resolve => setTimeout(resolve, 100));
      await getColumnIndices(attempt + 1);
    } else {
      console.log('列索引:', columnIndices);
      // 保存列映射到缓存
      await browserStorage.set(columnMappingKey, columnIndices);
      console.log('已保存列映射到缓存:', columnMappingKey);
    }
  } catch (error) {
    console.error('Error getting column indices:', error);
  } finally {
    console.log('获取列索引完成，最终值:', columnIndices);
  }
}

// 查找表格容器
function findTableContainer() {
  // 根据DOM截图，表格容器是带有role="table"属性的div
  // 尝试多种选择器来找到正确的表格容器
  const selectors = [
    'div[role="table"]',
    'div._3hi._1mie[role="table"]',
    'div[data-surface="//int/table"]',
    'div[class*="table"]',
    'div[style*="table"]'
  ];
  
  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container) {
      console.log(`使用选择器找到表格容器: ${selector}`);
      return container;
    }
  }
  
  console.log('未找到任何匹配的表格容器');
  return null;
}

// 获取表格数据行 - 处理固定行和可滚动行
function getTableDataRows(tableContainer: HTMLElement) {
  const rowPairs: Array<{ fixed: HTMLElement; scrollable: HTMLElement }> = [];
  
  try {
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('未找到表头行');
      return rowPairs;
    }
    
    // 获取表头行的下一个兄弟元素（表体元素）
    const tableBody = headerRow.nextElementSibling;
    if (!tableBody) {
      console.log('未找到表体');
      return rowPairs;
    }
    
    console.log('找到表体:', tableBody);
    
    // 找到所有role=presentation的元素（每一行的容器）
    const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');
    
    // 先过滤掉没有孙子元素的节点，以及孙子元素是SVG的节点
    const filteredPresentationRows = Array.from(presentationRows).filter((row, index) => {
      const hasGrandchildren = row.children[0]?.children.length > 0;
      const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
      
      if (!hasGrandchildren) {
        // console.log(`Filtering out presentation row ${index} with no grandchildren`);
        return false;
      }
      
      if (!hasNonSvgchildren) {
        // console.log(`Filtering out presentation row ${index} with only SVG grandchildren`);
        return false;
      }
      
      return true;
    });
    
    // 处理过滤后的节点
    filteredPresentationRows.forEach((presentationRow, index) => {
      
      // 获取孙元素（固定行、滚动行和分割线）
      const children = presentationRow.children;
      if (children.length === 1) { // 确保只有一个子元素
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;
        // console.log(`找到子元素: ${grandchildren.length}`, grandchildren);
        
        if (grandchildren.length >= 2) { // 至少有固定行和滚动行
          const fixed = grandchildren[0] as HTMLElement; // 第一个是固定行数据
          const scrollable = grandchildren[1] as HTMLElement; // 第二个是滚动行数据
          // 第三个是分割线元素，忽略
          
          // console.log(`固定行数据:`, fixed);
          // console.log(`滚动行数据:`, scrollable);
          
          rowPairs.push({
            fixed: fixed,
            scrollable: scrollable
          });
        }
      }
    });
    
  } catch (error) {
    console.error('获取表格数据行错误:', error);
  }
  
  console.log('找到行对:', rowPairs.length);
  return rowPairs;
}

// 清理广告名称
function cleanAdName(name: string): string {
  // 移除常见的额外文本
  const unwantedTexts = [
    '图表编辑复制打开下拉菜单',
    '图表编辑',
    '复制',
    '打开',
    '下拉菜单',
    'ChartsEditDuplicateOpen Drop-down',
    'Edit',
    'Duplicate',
    'Open',
    'Drop-down'
  ];
  
  let cleanedName = name;
  for (const text of unwantedTexts) {
    cleanedName = cleanedName.replace(text, '').trim();
  }
  
  // 移除数字后缀（如 -102）
  cleanedName = cleanedName.replace(/\s*-\s*\d+$/, '').trim();
  
  // 确保清理后的名称不为空
  if (!cleanedName) {
    return name; // 如果清理后为空，返回原始名称
  }
  
  return cleanedName;
}

// 从固定列元素中提取广告名称
function extractAdNameFromFixedElement(fixedElement: HTMLElement): string {
  let name = '';
  
  console.log('开始提取广告名称');
  
  // 尝试从固定列的特定结构中提取广告名称
  // 根据DOM结构，广告名称在div元素中，操作按钮在span元素中，它们是兄弟关系
  try {
    // 找到包含广告名称的div元素（在操作按钮span之前的div）
   // data-surface="/am/table/maiba:ad_object_overflow_menu_entrypoint"
    const buttonSpan = fixedElement.querySelector('div[role="presentation"] span[data-surface-wrapper="1"]');
    
    if (buttonSpan) {
      
      // 查找按钮span之前的所有兄弟元素
      let sibling = buttonSpan.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === 'DIV') {
          const text = sibling.textContent?.trim() || '';
          
          if (text && text.length > 0) {
            name = text;
            break;
          }
        }
        sibling = sibling.previousElementSibling;
      }
    }
    
    // 如果没有找到按钮span，尝试查找特定class的div
    if (!name) {
      const nameDiv = fixedElement.querySelector('div.x87ru5.x606jd');
      if (nameDiv) {
        const text = nameDiv.textContent?.trim() || '';
        
        if (text && text.length > 0) {
            name = text;
          }
      }
    }
  } catch (error) {
    console.error('提取广告名称时出错:', error);
  }
  
  // 如果没有找到名称，尝试获取所有文本内容
  if (!name) {
    const allText = fixedElement.textContent?.trim() || '';
    console.log('未找到广告名称，使用所有文本:', allText);
    if (allText) {
      // 移除可能的操作按钮文本
      const cleanedText = allText.replace(/(图表编辑|复制|打开|下拉菜单|Charts|Edit|Duplicate|Open|Drop-down)/g, '').trim();
      if (cleanedText) {
        name = cleanedText;
      }
    }
  }
  
  // 如果仍然没有找到名称，使用元素的outerHTML作为唯一标识
  if (!name) {
    const outerHTML = fixedElement.outerHTML;
    console.log('未找到广告名称，使用outerHTML:', outerHTML.substring(0, 100) + '...');
    name = `element_${hashString(outerHTML)}`;
  }
  
  const cleanedName = cleanAdName(name);
  console.log('提取的广告名称:', cleanedName);
  return cleanedName;
}

// 生成字符串的哈希值
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// 从表格行对中提取所有广告名称
function extractAdNamesFromRowPairs(rowPairs: any[]): string[] {
  const adNames: string[] = [];
  rowPairs.forEach((rowPair) => {
    const { fixed } = rowPair;
    const name = extractAdNameFromFixedElement(fixed);
    if (name) {
      adNames.push(name);
    }
  });
  return adNames;
}

// 根据字段名映射到标准字段名
function mapFieldNameToStandard(fieldName: string): string | null {
  const lowerFieldName = fieldName.toLowerCase();
  
  if (lowerFieldName.includes('results') || lowerFieldName.includes('成效') || lowerFieldName.includes('结果')) {
    return 'results';
  } else if (lowerFieldName.includes('spent') || lowerFieldName.includes('花费') || lowerFieldName.includes('支出')) {
    return 'spend';
  } else if (lowerFieldName.includes('impressions') || lowerFieldName.includes('展示') || lowerFieldName.includes('印象')) {
    return 'impressions';
  } else if (lowerFieldName.includes('reach') || lowerFieldName.includes('覆盖') || lowerFieldName.includes('抵达')) {
    return 'reach';
  } else if (lowerFieldName.includes('cost per result') || lowerFieldName.includes('单次成效') || lowerFieldName.includes('每次结果成本')) {
    return 'costPerResult';
  } else if (lowerFieldName.includes('website clicks') || lowerFieldName.includes('网站点击')) {
    return 'website_clicks';
  } else if (lowerFieldName.includes('registrations') || lowerFieldName.includes('注册')) {
    return 'registrations';
  } else if (lowerFieldName.includes('registration cost') || lowerFieldName.includes('注册成本')) {
    return 'registration_cost';
  }
  
  return null;
}

// 根据列索引确定字段类型
function determineFieldTypeByIndex(index: number, fixIndex: number): string | null {
  const fieldTypes = [
    { key: 'results', label: '成效' },
    { key: 'reach', label: '覆盖人数' },
    { key: 'spend', label: '花费' },
    { key: 'impressions', label: '展示次数' },
    { key: 'costPerResult', label: '每次结果成本' }
  ];
  
  for (const field of fieldTypes) {
    if (columnIndices[field.key] !== undefined) {
      const expectedIndex = columnIndices[field.key] - fixIndex;
      if (index === expectedIndex) {
        return field.key;
      }
    }
  }
  
  return null;
}

// 根据页面广告名称顺序重新排序修改数据
function reorderModificationsByPageNames(modificationsArray: any[], pageAdNames: string[]): any[] {
  if (!pageAdNames || pageAdNames.length === 0) {
    return modificationsArray;
  }
  
  const result: any[] = [];
  const usedIndices = new Set<number>();
  
  // 创建名称到索引列表的映射，用于处理重复名称
  const nameToIndicesMap = new Map<string, number[]>();
  modificationsArray.forEach((item, idx) => {
    if (item && item.completeData && item.completeData.name) {
      const name = cleanAdName(item.completeData.name);
      if (!nameToIndicesMap.has(name)) {
        nameToIndicesMap.set(name, []);
      }
      nameToIndicesMap.get(name)?.push(idx);
    }
  });
  
  console.log('页面广告名称顺序:', pageAdNames);
  console.log('名称到索引映射:', nameToIndicesMap);
  
  // 按照页面顺序添加项目
  pageAdNames.forEach((pageName, pageIndex) => {
    const cleanPageName = cleanAdName(pageName);
    const indices = nameToIndicesMap.get(cleanPageName) || [];
    
    // 找到第一个未使用的索引
    let matchedIndex: number | undefined;
    
    if (indices.length === 1) {
      // 只有一个匹配项，直接使用
      matchedIndex = indices[0];
    } else if (indices.length > 1) {
      // 多个匹配项，尝试根据唯一标识或其他信息匹配
      console.warn(`广告名称 ${cleanPageName} 重复，找到 ${indices.length} 个匹配项`);
      
      // 尝试使用索引作为后备方案
      if (pageIndex < modificationsArray.length) {
        matchedIndex = pageIndex;
        console.log(`使用页面索引 ${pageIndex} 作为后备方案`);
      } else {
        // 找到第一个未使用的索引
        matchedIndex = indices.find(idx => !usedIndices.has(idx));
      }
    } else {
      // 没有匹配项，尝试使用索引作为后备方案
      if (pageIndex < modificationsArray.length) {
        matchedIndex = pageIndex;
        console.log(`名称未找到，使用页面索引 ${pageIndex} 作为后备方案`);
      }
    }
    
    if (matchedIndex !== undefined && !usedIndices.has(matchedIndex)) {
      result.push(modificationsArray[matchedIndex]);
      usedIndices.add(matchedIndex);
      console.log(`页面行 ${pageName} -> 缓存索引 ${matchedIndex}`);
    } else {
      console.warn(`页面行 ${pageName} 在缓存中找不到对应的数据`);
      result.push(null); // 占位，保持顺序一致
    }
  });
  
  // 添加页面中不存在的数据
  modificationsArray.forEach((item, idx) => {
    if (!usedIndices.has(idx)) {
      result.push(item);
      console.log(`缓存索引 ${idx} 不在页面中，添加到结果末尾`);
    }
  });
  
  console.log('排序后的缓存数据顺序:', result.map(item => item?.completeData?.name));
  return result;
}

// 根据排序信息对修改数据进行排序
function sortModificationsBySortInfo(modificationsArray: any[], sortInfo: { field: string | null, direction: string | null }): any[] {
  if (!sortInfo || !sortInfo.field || !sortInfo.direction) {
    return modificationsArray;
  }
  
  const { field, direction } = sortInfo;
  
  // 分离有数据的行和无数据的行
  const rowsWithData: any[] = [];
  const rowsWithoutData: any[] = [];
  
  modificationsArray.forEach(item => {
    if (item && item.completeData) {
      const value = item.completeData[field];
      if (value !== undefined && value !== null && value !== '-' && value !== 0) {
        rowsWithData.push(item);
      } else {
        rowsWithoutData.push(item);
      }
    } else {
      rowsWithoutData.push(item);
    }
  });
  
  // 对有数据的行进行排序
  rowsWithData.sort((a, b) => {
    const valueA = a.completeData[field] || 0;
    const valueB = b.completeData[field] || 0;
    
    if (direction === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });
  
  // 合并排序后的有数据行和无数据行
  const sortedArray = [...rowsWithData, ...rowsWithoutData];
  console.log(`根据 ${field} ${direction} 排序后的结果:`, sortedArray.map(item => item?.completeData?.name));
  
  return sortedArray;
}

// 构建修改数据映射
function buildModificationsMap(modificationsArray: any[]): { modificationsMap: Map<string, any>, nameToItemsMap: Map<string, any[]> } {
  const modificationsMap = new Map<string, any>();
  const nameToItemsMap = new Map<string, any[]>();
  
  modificationsArray.forEach(item => {
    if (item && item.completeData) {
      // 优先使用唯一标识作为键
      if (item.uniqueId) {
        modificationsMap.set(item.uniqueId, item);
      } else if (item.completeData.id) {
        // 其次使用广告ID作为键
        modificationsMap.set(item.completeData.id, item);
      }
      
      // 存储相同名称的所有项目
      if (item.completeData.name) {
        const name = cleanAdName(item.completeData.name);
        if (!nameToItemsMap.has(name)) {
          nameToItemsMap.set(name, []);
        }
        nameToItemsMap.get(name)?.push(item);
      }
    }
  });
  
  return { modificationsMap, nameToItemsMap };
}

// 根据名称和索引查找对应的修改数据
function findModificationByNameAndIndex(name: string, rowIndex: number, modificationsMap: Map<string, any>, nameToItemsMap: Map<string, any[]>, modificationsArray: any[]): any | null {
  // 尝试根据名称查找
  if (name) {
    const itemsWithSameName = nameToItemsMap.get(name);
    if (itemsWithSameName && itemsWithSameName.length > 0) {
      // 如果只有一个项目，直接使用
      if (itemsWithSameName.length === 1) {
        return itemsWithSameName[0];
      } else {
        // 如果有多个项目，尝试根据索引匹配
        console.warn(`广告名称 ${name} 重复，尝试根据索引匹配`);
        if (modificationsArray[rowIndex]) {
          return modificationsArray[rowIndex];
        }
      }
    }
  }
  
  // 如果还是找不到，使用索引作为后备方案
  if (modificationsArray[rowIndex]) {
    return modificationsArray[rowIndex];
  }
  
  return null;
}

// 递归查找并更新DOM元素
function updateElementText(element: Element, newValue: number, fieldType: string): Promise<void> {
  return new Promise((resolve) => {
    if (element.children.length > 0) {
      if (element.children[0] instanceof HTMLElement) {
        updateElementText(element.children[0], newValue, fieldType).then(resolve);
      } else {
        console.log(`跳过非HTMLElement子元素: ${element.children[0]}`);
        resolve();
      }
    } else {
      // 找到最终的文本元素
      console.log(`更新元素文本: ${element.innerText} -> ${newValue}`);
      
      // 保存原始文本，用于提取货币符号
      const originalText = element.innerText;
      
      // 根据字段类型决定显示格式
      if (fieldType === 'spend') {
        // 花费字段：保留2位小数，保留货币符号
        console.log(`更新花费字段: ${newValue.toFixed(2)}`);
        
        // 提取货币符号（如果有）
        const currencyMatch = originalText.match(/^[^0-9]+/);
        const currencySymbol = currencyMatch ? currencyMatch[0] : '';
        
        // 保留货币符号并更新数值
        console.log(`货币符号更新: ${currencySymbol}`);
        element.innerText = currencySymbol + newValue.toFixed(2);
      } else {
        // 其他字段：整数
        console.log(`更新非货币字段: ${Math.round(newValue)}`,element);
        element.innerText = Math.round(newValue).toString();
      }
      resolve();
    }
  });
}

// 更新可滚动行的显示值
async function updateScrollableRow(scrollableElement: Element, rowData: any, fixIndex: number): Promise<void> {
  const scrollableElements = scrollableElement.children[0]?.children || [];
  console.log(`开始更新DOM，可滚动元素数量: ${scrollableElements.length}`);
  console.log(`列索引:`, columnIndices);
  console.log(`固定列数量: ${fixIndex}`);
  
  // 收集所有需要更新的元素的Promise
  const updatePromises = [];
  
  // 遍历所有可滚动元素
  for (let index = 0; index < scrollableElements.length; index++) {
    const element = scrollableElements[index];
    
    const text = element.textContent?.trim();
    if (text) {
      // 检查是否有对应的列修改值
      let increaseValue = 0;
      let originalValueFromData = 0;
      let hasModification = false;
      let fieldType = null;
      
      // 根据当前列索引确定字段类型
      fieldType = determineFieldTypeByIndex(index, fixIndex);
      
      if (fieldType) {
        console.log(`找到匹配字段: ${fieldType}`);
      }
      
      // 如果找到了对应的字段类型，检查是否有修改
      if (fieldType && rowData && rowData.modifiedFields && rowData.modifiedFields[fieldType] !== undefined) {
        increaseValue = rowData.modifiedFields[fieldType] || 0;
        originalValueFromData = rowData.completeData?.[fieldType] || 0;
        hasModification = true;
      }
        
      // 只有当当前列有修改时才更新
      if (hasModification) {
        // 检查原始值是否为--且新增值为0
        const currentText = element.textContent?.trim();
        const isOriginalDash = currentText.includes('—');
        const isIncreaseZero = increaseValue === 0;
        
        // 如果原始值是--且新增值为0，则不更新
        if (isOriginalDash && isIncreaseZero) {
          continue;
        }
        
        // 使用修改数据中保存的原始值，而不是从DOM中提取
        // 这样可以确保即使DOM值被修改，也能使用缓存中的原始值
        const newValue = originalValueFromData + increaseValue;
        
        // 更新元素的文本内容
        console.log(`更新元素 ${index}: ${originalValueFromData} + ${increaseValue} = ${newValue}`);
        
        // 递归查找并更新DOM元素，将Promise添加到数组中
        updatePromises.push(updateElementText(element, newValue, fieldType));
      }
    }
  }
  
  // 并行处理所有更新操作
  await Promise.all(updatePromises);
  console.log(`完成DOM更新，共更新 ${updatePromises.length} 个元素`);
}

// 解析数值
function parseNumber(text: string): number | string {
  if (!text) return 0;
  const cleanedText = text.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleanedText);
  return isNaN(num) ? '-' : num;
}

// 从DOM提取广告数据
async function extractAdsFromDom() {
  // 首先检查是否有缓存数据
  const currentDate = getCurrentDate();
  const adsKey = generateCacheKey('ads');
  
  // 获取缓存数据（包含排序信息）
  const cachedData = await browserStorage.get(adsKey);
  
  // 检测当前页面的排序信息
  let currentSortInfo = { field: null, direction: null };
  try {
    const { sortField, sortDirection } = detectSortInfo();
    if (sortField && sortDirection) {
      currentSortInfo = { field: sortField, direction: sortDirection };
    }
  } catch (error) {
    console.error('检测排序信息错误:', error);
  }
  
  // 检查缓存数据的排序信息是否与当前页面一致
  const cachedSortInfo = cachedData?.sortInfo || { field: null, direction: null };
  const isSortInfoSame = cachedSortInfo.field === currentSortInfo.field && 
                         cachedSortInfo.direction === currentSortInfo.direction;
  
  // 如果有缓存数据且排序信息一致，使用缓存数据
  // 否则从DOM重新提取数据
  if (cachedData && cachedData.cacheData && cachedData.cacheData.ads && cachedData.cacheData.ads.length > 0 && 
      cachedData.cacheData.columnMapping && Object.keys(cachedData.cacheData.columnMapping).length > 0 &&
      isSortInfoSame) {
    console.log('使用缓存数据（排序信息一致）');
    return { 
      ads: cachedData.cacheData.ads, 
      DomColumnMapping: cachedData.cacheData.columnMapping, 
      sortInfo: currentSortInfo 
    };
  } else if (isSortInfoSame) {
    console.log('排序信息一致但缓存数据不完整，从DOM提取');
  } else {
    console.log('排序信息已变更，从DOM重新提取数据');
  }
  
  // 没有缓存数据，从DOM提取并缓存
  const ads = [];
  const DomColumnMapping = {};
  
  // 存储排序信息
  const sortInfo = currentSortInfo;
  
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('未找到表格容器');
      return { ads, DomColumnMapping, sortInfo };
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('未找到表头行');
      return { ads, DomColumnMapping, sortInfo };
    }
    
    // 解析表头，确定各列的索引
    const headerCells = Array.from(headerRow.querySelectorAll('[role="columnheader"]'));
    
    // 首先找出固定列的数量（通常只有名称列是固定的）
    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，排除子元素的文本
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        console.log(`表头列 ${index}: ${text}`);
        
        // 匹配常见的表头文本
        if (text==='Campaign' || text==='活动'||text==='ad set' || text==='广告组'|| text==='ad' || text==='广告') {
          DomColumnMapping.name = index;
        } else if (text==='results' || text==='成效'|| text==='结果') {
          // 滚动列的索引需要减去固定列的数量
          DomColumnMapping.results = index;
        } else if (text==='amount spent' || text==='花费' || text==='金额' || text==='支出金额') {
          DomColumnMapping.spend = index;
        } else if (text==='impressions' || text==='展示' || text==='印象') {
          DomColumnMapping.impressions = index;  
        } else if (text==='reach' || text==='覆盖' || text==='抵达') {
          DomColumnMapping.reach = index;
        } else if (text==='cost per result' || text==='单次成效' || text==='每次结果成本') {
          DomColumnMapping.costPerResult = index;
        }else if (text==='website clicks' || text==='网站点击' || text==='网站点击量') {
          DomColumnMapping.website_clicks = index;
        } else if (text==='registrations' || text==='注册' || text==='注册量') {
          DomColumnMapping.registrations = index;
        } else if (text==='registration cost' || text==='注册成本' || text==='注册成本') {
          DomColumnMapping.registration_cost = index;
        }
      }
    });
    console.log('DOM 列映射:', DomColumnMapping);
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('找到行数组:',rowPairs, rowPairs.length);
    
    // 使用for循环代替forEach，确保异步操作按顺序完成
    for (let rowIndex = 0; rowIndex < rowPairs.length; rowIndex++) {
      const rowPair = rowPairs[rowIndex];
      const { fixed, scrollable } = rowPair;
      
      fixedColumnLength = fixed.children[0]?.children?.length-1 || 0;
      // 提取广告名称 - 从固定行获取
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      console.log(`固定行数据长度:`, fixedColumnLength);
      for (const element of nameElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && !text.match(/^\s*\$?\d+(\.\d+)?\s*$/)) {
          name = text;
          break;
        }
      }
      
      // 清理广告名称
      name = cleanAdName(name);
      
      // 跳过没有有效名称的行
      if (!name || name === '' || name.match(/^广告\s*\d+$/)) {
        // console.log(`Skipping row ${rowIndex} with invalid name: ${name}`);
        continue;
      }
      
      // 尝试从DOM中获取唯一标识符
      let adId = `ad_${rowIndex}`;
      
      // 检查固定行是否有唯一标识符属性
      const fixedRowElement = fixed;
      if (fixedRowElement) {
        // 检查是否有data-id或其他唯一属性
        const dataId = fixedRowElement.getAttribute('data-id') || 
                      fixedRowElement.getAttribute('id') || 
                      fixedRowElement.querySelector('[data-id]')?.getAttribute('data-id') ||
                      fixedRowElement.querySelector('[id]')?.getAttribute('id');
        
        if (dataId) {
          adId = `ad_${dataId}`;
        }
      }
      
      // 从可滚动行获取其他数据
      const scrollableElements = scrollable.children[0]?.children || [];
      // console.log(`Found scrollable elements for ${name}:`, scrollableElements.length);
      
      // 提取各列数据
      const ad = {
        id: adId,
        name: name,
        status: 'ACTIVE',
        campaign_id: `campaign_${rowIndex}`,
        adset_id: `adset_${rowIndex}`,
        impressions: 0,
        increase_impressions: 0,
        reach: 0,
        increase_reach: 0,
        spend: 0,
        increase_spend: 0,
        results: 0,
        increase_results: 0,
        costPerResult: 0,
        increase_costPerResult: 0,
        other_events: 0,
        website_clicks: 0,
        increase_website_clicks: 0,
        registrations: 0,
        increase_registrations: 0,
        registration_cost: 0,
        increase_registration_cost: 0
      };
      
      // 检查本地存储中是否有对应的广告数据
      try {
        // 从新的缓存结构中获取数据
        // 使用不包含排序信息的缓存键，因为修改数据应该与排序状态无关
        const modificationsKey = generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        console.log('从缓存获取的修改数据:',modificationsKey, modificationsArray);
        if (modificationsArray && Array.isArray(modificationsArray)) {
          // 首先根据广告ID查找对应的数据
          let rowData = modificationsArray.find(item => 
            item && item.completeData && item.completeData.id === ad.id
          );
          console.log('根据广告ID查找的行数据:', rowData);
          
          // 如果根据ID找不到，尝试根据广告名称查找
          if (!rowData) {
            const itemsWithSameName = modificationsArray.filter(item => 
              item && item.completeData && item.completeData.name === name
            );
            
            if (itemsWithSameName.length > 0) {
              // 如果只有一个项目，直接使用
              if (itemsWithSameName.length === 1) {
                rowData = itemsWithSameName[0];
              } else {
                // 如果有多个项目，尝试根据索引匹配
                console.warn(`广告名称 ${name} 重复，尝试根据索引匹配`);
                if (modificationsArray[rowIndex]) {
                  rowData = modificationsArray[rowIndex];
                }
              }
            }
          }
          
          // 如果还是找不到，使用索引作为后备方案
          if (!rowData && modificationsArray[rowIndex]) {
            rowData = modificationsArray[rowIndex];
          }
          
          if (rowData && rowData.modifiedFields) {
            // 恢复增加的值，但不要修改原始值
            ad.increase_impressions = rowData.modifiedFields.impressions || 0;
            ad.increase_reach = rowData.modifiedFields.reach || 0;
            ad.increase_spend = rowData.modifiedFields.spend || 0;
            ad.increase_results = rowData.modifiedFields.results || 0;
            ad.increase_costPerResult = rowData.modifiedFields.costPerResult || 0;
            ad.increase_website_clicks = rowData.modifiedFields.website_clicks || 0;
            ad.increase_registrations = rowData.modifiedFields.registrations || 0;
            ad.increase_registration_cost = rowData.modifiedFields.registration_cost || 0;
            console.log(`找到存储的广告数据 ${name} (ID: ${ad.id}):`, rowData);
            console.log(`提取的原始值: ${ad.reach}, 增加值: ${ad.increase_reach}`);
          }
        }
      } catch (error) {
        console.error('获取存储广告数据错误:', error);
      }
      
      // // 存储所有文本内容用于调试
      const allTexts = [];
      Array.from(scrollableElements).forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          allTexts.push(`${index}: ${text}`);
        }
      });
      console.log(`滚动行数据长度:`, scrollableElements.length, allTexts.length);
      
      // 根据表头映射提取数据
      Object.entries(DomColumnMapping).forEach(([key, index]) => {
        // 计算滚动列的索引（减去固定列的数量）
        const fixIndex = index - (fixed.children[0]?.children?.length-1 || 0);
        
        // 尝试使用计算的fixIndex
        let targetElement = scrollableElements[fixIndex];
        
        
        if (targetElement) {
          const text = targetElement.textContent?.trim();
          if (text) {
            // 尝试解析数值
            const cleanedText = text.replace(/[^0-9.]/g, '');
            const num = parseFloat(cleanedText);
            
            if (!isNaN(num) || cleanedText === '0') {
              // 直接使用从DOM中提取的值作为原始值
              // 当页面重新加载时，DOM中显示的就是原始值，不需要减去增加值
              let originalValue = cleanedText === '0' ? (text?.includes('—') ? '—' : 0) : num;
              
              ad[key] = originalValue;
              console.log(`提取 ${key} for ${name}: ${ad[key]} (raw: ${text}, increase: ${ad[`increase_${key}`]})`);
            }
          }
        } else {
          console.log(`${name}: 未找到 ${key} 元素 at index ${fixIndex}`);
        }
      });
      
      // 输出提取的数据用于调试
      console.log(`提取数据 ${name}:`, ad);
      
      ads.push(ad);
    }
    
    console.log('从DOM提取的广告:', ads);
    
    // 检测排序信息
    try {
      const { sortField, sortDirection } = detectSortInfo();
      if (sortField && sortDirection) {
        sortInfo.field = sortField;
        sortInfo.direction = sortDirection;
      }
    } catch (error) {
      console.error('检测排序信息错误:', error);
    }
    
    console.log('检测到的排序信息:', sortInfo);
    
    // 保存数据到浏览器存储（包含排序信息）
    try {
      if (browser && browser.storage) {
        // 使用新的缓存键生成函数
        const adsKey = generateCacheKey('ads');
        const cacheData = {
          ads,
          columnMapping: DomColumnMapping
        };
        const dataToSave = {
          sortInfo,
          cacheData
        };
        await browser.storage.local.set({ [adsKey]: dataToSave });
        console.log('已保存数据到存储:', adsKey, dataToSave);
      }
    } catch (error) {
      console.error('保存数据错误:', error);
    }
  } catch (error) {
    console.error('提取广告数据错误:', error);
  }
  
  return { ads, DomColumnMapping, sortInfo };
}

// 从DOM行提取原始值并生成唯一标识
async function extractOriginalValuesAndGenerateId(fixedElement: Element, scrollableElement: Element): Promise<{ name: string, originalValues: any, uniqueId: string } | null> {
  // 提取广告名称
  const name = extractAdNameFromFixedElement(fixedElement);
  if (!name) {
    console.log('无法从DOM提取广告名称');
    return null;
  }
  
  // 提取原始值
  const domValues = {};
  
  console.log('开始提取可滚动列值');
  
  const scrollableCells = Array.from(scrollableElement.children[0]?.children || []);
  console.log('可滚动列单元格数量 (children):', scrollableCells.length);
  console.log('当前columnIndices:', columnIndices);
  
  // 提取所有可滚动列的值
  scrollableCells.forEach((cell, index) => {
    const text = cell.textContent?.trim() || '';
    domValues[`scrollable_${index}`] = text;
  });
  
  // 如果仍然没有提取到值，尝试获取整个元素的文本内容
  if (Object.keys(domValues).length === 0) {
    const fixedText = fixedElement.textContent?.trim() || '';
    const scrollableText = scrollableElement.textContent?.trim() || '';
    domValues['fixed_text'] = fixedText;
    domValues['scrollable_text'] = scrollableText;
  }
  
  console.log('从DOM提取的原始值:', domValues);
  
  // 将DOM提取的数据转换为缓存提取出来的原始值格式
  const originalValues = convertDomValuesToOriginalValues(domValues, columnIndices);
  
  // 检查是否有缓存的修改数据
  try {
    const modificationsKey = generateCacheKey('ad_modifications');
    const modificationsArray = await browserStorage.get(modificationsKey);
    
    if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
      // 尝试找到匹配的修改数据
      const matchedModification = modificationsArray.find(item => {
        if (item && item.completeData) {
          return cleanAdName(item.completeData.name) === cleanAdName(name);
        }
        return false;
      });
      
      if (matchedModification) {
        console.log('找到匹配的修改数据:', matchedModification);
        // 从修改数据中获取原始值，减去增加值
        const adjustedOriginalValues = {};
        Object.keys(originalValues).forEach(key => {
          if (matchedModification.completeData && matchedModification.completeData[key] !== undefined) {
            // 使用缓存中的原始值
            adjustedOriginalValues[key] = matchedModification.completeData[key];
          } else {
            // 使用DOM提取的值
            adjustedOriginalValues[key] = originalValues[key];
          }
        });
        console.log('调整后的原始值:', adjustedOriginalValues);
        // 生成唯一标识
        const uniqueId = generateUniqueId(name, adjustedOriginalValues);
        return { name, originalValues: adjustedOriginalValues, uniqueId };
      }
    }
  } catch (error) {
    console.error('获取缓存数据错误:', error);
  }
  
  // 没有找到匹配的修改数据或出错时，使用DOM提取的值
  const uniqueId = generateUniqueId(name, originalValues);
  return { name, originalValues, uniqueId };
}

// 同步广告数据到页面
async function syncAdDataToPage(sortInfo = null) {
  console.log('开始syncAdDataToPage函数，排序信息:', sortInfo);
  try {
    // 检查扩展上下文是否有效
    if (!browser || !browser.storage) {
      console.error('扩展上下文无效');
      return;
    }
    
    console.log('扩展上下文有效');
    
    // 重新获取列索引，以处理列隐藏/显示的情况
    console.log('重新获取列索引，以处理列隐藏/显示的情况');
    await getColumnIndices();
    console.log('获取到列索引:', columnIndices);
    
    // 获取存储的所有广告数据
    // 使用缓存键，因为修改数据应该与排序状态无关
    console.log('获取存储项开始');
    const modificationsKey = generateCacheKey('ad_modifications');
    const modificationsArray = await browserStorage.get(modificationsKey);
    
    // 第一次保存时，存储中可能没有数据，这是正常的
    if (!modificationsArray || !Array.isArray(modificationsArray) || modificationsArray.length === 0) {
      console.log('存储中未找到广告数据（可能是第一次保存）');
      return;
    }
    
    // 构建缓存数据的唯一标识映射
    const uniqueIdMap = new Map<string, any>();
    modificationsArray.forEach((item, index) => {
      if (item && item.uniqueId) {
        uniqueIdMap.set(item.uniqueId, item);
        console.log(`缓存项唯一标识: ${item.uniqueId}, 名称: ${item.completeData?.name}, 行: ${index}`,item);
      }
    });
    console.log('获取存储项完成');
    console.log('缓存项数量:', uniqueIdMap.size);
    
    // 重新获取表格容器，确保使用最新的
    console.log('获取表格容器开始');
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('未找到表格容器');
      return;
    }
    
    console.log('表格容器信息:', tableContainer);
    
    // 获取表格数据行对
    console.log('获取表格数据行对开始');
    const rowPairs = getTableDataRows(tableContainer);
    console.log('找到行对:', rowPairs.length);
    
    // 遍历行对，同步广告数据
  console.log('遍历行对，同步广告数据开始');
  for (let rowIndex = 0; rowIndex < rowPairs.length; rowIndex++) {
    const rowPair = rowPairs[rowIndex];
    const { fixed, scrollable } = rowPair;
    
    if (!fixed || !scrollable) continue;
    
    // 从DOM提取原始值并生成唯一标识
    console.log(`从dom中行 ${rowIndex} 提取信息`);
    const domInfo = await extractOriginalValuesAndGenerateId(fixed, scrollable);
    console.log(`从dom中行 ${rowIndex} 提取uniqueId`,domInfo, domInfo.uniqueId);
    if (!domInfo) {
      console.log(`无法从行 ${rowIndex} 提取信息`);
      continue;
    }
    
    console.log(`dom行 ${rowIndex} 广告名称: ${domInfo.name}, 唯一标识: ${domInfo.uniqueId}`,domInfo);
    
    // 根据唯一标识查找对应的修改数据
    let rowData = uniqueIdMap.get(domInfo.uniqueId);
    
    if (!rowData) {
      console.log(`未找到行 ${rowIndex} 的修改数据`);
      // 尝试使用名称进行匹配
      const nameMatch = modificationsArray.find(item => 
        item && item.completeData && cleanAdName(item.completeData.name) === cleanAdName(domInfo.name)
      );
      if (nameMatch) {
        console.log(`通过名称匹配找到修改数据:`, nameMatch);
        rowData = nameMatch;
      } else {
        continue;
      }
    }
    
    console.log(`找到修改数据:`, rowData);
    
    // 计算固定列的数量，确保安全计算
    const fixIndex = fixed.children[0]?.children?.length ? (fixed.children[0].children.length - 1) : 0;
    
    // 检查columnIndices的值
    console.log(`更新行 ${rowIndex} 的可滚动数据`);
    console.log(`当前columnIndices:`, columnIndices);
    console.log(`当前fixIndex:`, fixIndex);
      
      // 如果columnIndices为空，尝试重新获取
      if (!columnIndices || Object.keys(columnIndices).length === 0) {
        console.log('columnIndices为空，尝试重新获取');
        await getColumnIndices();
        console.log(`重新获取后的columnIndices:`, columnIndices);
      }
      
      updateScrollableRow(scrollable, rowData, fixIndex);
    }
    console.log('遍历行对，同步广告数据完成');
    console.log('同步广告数据到页面完成');
  } catch (error) {
    console.error('同步广告数据到页面错误:', error);
  } finally {
    // 移除遮盖层
    removeOverlay();
  }
}