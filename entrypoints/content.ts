// @ts-nocheck
import { browserStorage } from '../utils/storage';

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
  results: 'reporting_table_column_results',//成效
  costPerResult: 'reporting_table_column_costPerResult',//单次成效
  website_clicks: 'reporting_table_column_website_clicks',//网站点击
  registrations: 'reporting_table_column_registrations',//注册
  registration_cost: 'reporting_table_column_registration_cost',//注册成本
};

// 存储列索引
let columnIndices: Record<string, number> = {};

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

// 生成缓存键
function generateCacheKey(prefix: string) {
  const date = getCurrentDate();
  const {level, sortField, sortDirection} = getCurrentPageState();
  return `${prefix}_${date}_${level}${sortField?'_'+sortField: ''}${sortDirection ? '_'+sortDirection : ''}`;
}

// 生成不包含排序信息的缓存键（用于修改数据，因为修改数据应该与排序状态无关）
function generateCacheKeyWithoutSort(prefix: string) {
  const date = getCurrentDate();
  const {level} = getCurrentPageState();
  return `${prefix}_${date}_${level}`;
}

// 检测排序信息
function detectSortInfo() {
  let sortField = null;
  let sortDirection = null;
  
  try {
    // 查找具有sorting属性且role="columnheader"的元素
    const columnHeaderElements = document.querySelectorAll('[role="columnheader"]');
    columnHeaderElements.forEach(element => {
      const sortingAttr = element.getAttribute('sorting');
      if (sortingAttr) {
        // 从元素文本或ID中提取字段名
        const fieldName = element.textContent?.trim().toLowerCase() || '';
        // 映射字段名到我们使用的字段名
        if (fieldName.includes('results') || fieldName.includes('成效') || fieldName.includes('结果')) {
          sortField = 'results';
        } else if (fieldName.includes('spent') || fieldName.includes('花费') || fieldName.includes('支出')) {
          sortField = 'spend';
        } else if (fieldName.includes('impressions') || fieldName.includes('展示') || fieldName.includes('印象')) {
          sortField = 'impressions';
        } else if (fieldName.includes('reach') || fieldName.includes('覆盖') || fieldName.includes('抵达')) {
          sortField = 'reach';
        } else if (fieldName.includes('cost per result') || fieldName.includes('单次成效') || fieldName.includes('每次结果成本')) {
          sortField = 'costPerResult';
        } else if (fieldName.includes('website clicks') || fieldName.includes('网站点击')) {
          sortField = 'website_clicks';
        } else if (fieldName.includes('registrations') || fieldName.includes('注册')) {
          sortField = 'registrations';
        } else if (fieldName.includes('registration cost') || fieldName.includes('注册成本')) {
          sortField = 'registration_cost';
        } else {
          // 对于其他字段，使用标准化的字段名
          sortField = fieldName
            .replace(/[^a-z0-9\s]/g, '') // 移除特殊字符
            .trim()
            .replace(/\s+/g, '_'); // 将空格替换为下划线
        }
        
        // 设置排序方向
        sortDirection = sortingAttr.toLowerCase();
      }
    });
  } catch (error) {
    console.error('Error detecting sort info:', error);
  }
  
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
    
    // 创建遮盖层，在数据同步完成前显示
    createOverlay();
    
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
        const columnMappingKey = generateCacheKey('columnMapping');
        const sortInfoKey = generateCacheKey('sortInfo');
        // 使用不包含排序信息的缓存键获取修改数据
        const modificationsKey = generateCacheKeyWithoutSort('ad_modifications');
        
        Promise.all([
          browserStorage.get(adsKey),
          browserStorage.get(columnMappingKey),
          browserStorage.get(sortInfoKey),
          browserStorage.get(modificationsKey)
        ]).then(([ads, columnMapping, sortInfo, modifications]) => {
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
        const columnMappingKey = generateCacheKey('columnMapping');
        const sortInfoKey = generateCacheKey('sortInfo');
        
        Promise.all([
          browserStorage.set(adsKey, ads),
          browserStorage.set(columnMappingKey, columnMapping),
          browserStorage.set(sortInfoKey, sortInfo)
        ]).then(() => {
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
        // 使用不包含排序信息的缓存键，因为修改数据应该与排序状态无关
        const modificationsKey = generateCacheKeyWithoutSort('ad_modifications');
        browserStorage.set(modificationsKey, modifications).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('保存修改数据错误:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'getSortInfo') {
        // 获取排序信息
        const date = message.date;
        // 使用新的缓存键生成函数
        const sortInfoKey = generateCacheKey('sortInfo');
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
          
          // 数据加载完成后立即尝试同步
          if (cachedModifications) {
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
        // 创建遮盖层
        createOverlay();
        debouncedSync();
      }
    });
    
    // 开始观察页面变化
    observer.observe(document.body, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['class', 'style'] // 只监听这些属性的变化
    });
    
    // 监听URL变化，当切换tab时重新加载缓存数据
    let lastUrl = window.location.href;
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('URL 已更改，重新加载缓存数据:', currentUrl);
        // URL变化时创建遮盖层
        createOverlay();
        // 重新加载缓存数据
        loadCachedData();
      }
    }, 500);
    
    // 同时设置多个定时器，确保在页面加载的不同阶段都能同步数据
    setTimeout(() => {
      // 立即执行
      createOverlay();
      debouncedSync();
    }, 0);
    setTimeout(() => {
      // 半秒后执行
      createOverlay();
      debouncedSync();
    }, 500);
    setTimeout(() => {
      // 1秒后执行
      createOverlay();
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
  if (attempt > 10) {
    console.warn('获取列索引最大尝试次数已达，停止尝试');
    return;
  }
  
  columnIndices = {};
  
  try {
    // 首先尝试从缓存中获取列映射
    const columnMappingKey = generateCacheKey('columnMapping');
    const DomColumnMapping = await browserStorage.get(columnMappingKey);
    
    // 如果从缓存中获取到了列映射，直接使用
    if (DomColumnMapping && Object.keys(DomColumnMapping).length > 0) {
      console.log('使用缓存的 DomColumnMapping:', DomColumnMapping);
      columnIndices = DomColumnMapping;
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
      console.log(`Header cell ${index} ID:`, cellId);

      for (const [field, idPattern] of Object.entries(columnMapping)) {
        if (cellId.includes(idPattern)) {
          columnIndices[field] = index;
          console.log(`Found field ${field} at index ${index}`);
          break;
        }
      }
    });
    
    // 确保所有必要的列都被找到
    const requiredFields = ['impressions', 'reach', 'spend', 'results', 'costPerResult', 'website_clicks', 'registrations', 'registration_cost'];
    const missingFields = requiredFields.filter(field => !columnIndices[field]);
    
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
     console.log('过滤后的展示行1:', filteredPresentationRows);
    console.log('过滤后的展示行2:', filteredPresentationRows.length);
    
    // 处理过滤后的节点
    filteredPresentationRows.forEach((presentationRow, index) => {
      console.log(`处理过滤后的行 ${index}`, presentationRow);
      
      // 获取孙元素（固定行、滚动行和分割线）
      const children = presentationRow.children;
      if (children.length === 1) { // 确保只有一个子元素
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;
        console.log(`找到子元素: ${grandchildren.length}`, grandchildren);
        
        if (grandchildren.length >= 2) { // 至少有固定行和滚动行
          const fixed = grandchildren[0] as HTMLElement; // 第一个是固定行数据
          const scrollable = grandchildren[1] as HTMLElement; // 第二个是滚动行数据
          // 第三个是分割线元素，忽略
          
          console.log(`固定行数据:`, fixed);
          console.log(`滚动行数据:`, scrollable);
          
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
  
  return cleanedName;
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
  const columnMappingKey = generateCacheKey('columnMapping');
  const sortInfoKey = generateCacheKey('sortInfo');
  
  const [cachedAds, cachedColumnMapping, cachedSortInfo] = await Promise.all([
    browserStorage.get(adsKey),
    browserStorage.get(columnMappingKey),
    browserStorage.get(sortInfoKey)
  ]);
  
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
  
  // 如果有缓存数据，且排序信息没有变化，直接返回缓存数据
  if (cachedAds && cachedAds.length > 0 && cachedColumnMapping && Object.keys(cachedColumnMapping).length > 0) {
    const cacheSortField = cachedSortInfo?.field;
    const cacheSortDirection = cachedSortInfo?.direction;
    const currentSortField = currentSortInfo.field;
    const currentSortDirection = currentSortInfo.direction;
    
    if (cacheSortField === currentSortField && cacheSortDirection === currentSortDirection) {
      console.log('使用缓存数据，排序信息未变化');
      return { ads: cachedAds, DomColumnMapping: cachedColumnMapping, sortInfo: cachedSortInfo || currentSortInfo };
    }
  }
  
  // 排序信息变化或没有缓存数据，从DOM提取
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
      console.log(`处理行 ${rowIndex}`, rowPair);
      const { fixed, scrollable } = rowPair;
      
      // 提取广告名称 - 从固定行获取
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      console.log(`固定行数据长度:`, fixed.children[0]?.children?.length-1 || 0);
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
        const modificationsKey = generateCacheKeyWithoutSort('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        if (modificationsArray && Array.isArray(modificationsArray)) {
          // 首先根据广告ID查找对应的数据
          let rowData = modificationsArray.find(item => 
            item && item.completeData && item.completeData.id === ad.id
          );
          
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
        console.log(`${name}: 处理 ${key} at index ${index}`);
        // 计算滚动列的索引（减去固定列的数量）
        const fixIndex = index - (fixed.children[0]?.children?.length-1 || 0);
        console.log(`${name}: 处理 ${key} at fixIndex: ${fixIndex} index :${index}`);
        
        // 尝试使用计算的fixIndex
        let targetElement = scrollableElements[fixIndex];
        
        
        if (targetElement) {
          const text = targetElement.textContent?.trim();
          if (text) {
            console.log(`${name}: 处理 ${key} at index ${fixIndex}: ${text}`);
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
    
    // 保存DomColumnMapping到浏览器存储
    try {
      if (browser && browser.storage) {
        // 使用新的缓存键生成函数
        const columnMappingKey = generateCacheKey('columnMapping');
        await browser.storage.local.set({ [columnMappingKey]: DomColumnMapping });
        console.log('已保存DomColumnMapping到存储:', columnMappingKey, DomColumnMapping);
      }
    } catch (error) {
      console.error('保存DomColumnMapping错误:', error);
    }
  } catch (error) {
    console.error('提取广告数据错误:', error);
  }
  
  return { ads, DomColumnMapping, sortInfo };
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
    
    // 确保列索引已获取
    if (Object.keys(columnIndices).length === 0) {
      console.log('列索引为空，获取列索引');
      await getColumnIndices();
      console.log('获取到列索引:', columnIndices);
    }
    
    // 获取当前页面状态
    const pageState = getCurrentPageState();
    console.log('当前页面状态:', pageState);
    
    // 使用传入的排序信息或当前页面的排序状态
    const currentSortInfo = sortInfo || { field: pageState.sortField, direction: pageState.sortDirection };
    console.log('使用排序信息:', currentSortInfo);
    
    // 获取存储的所有广告数据
    // 使用不包含排序信息的缓存键，因为修改数据应该与排序状态无关
    console.log('获取存储项');
    const modificationsKey = generateCacheKeyWithoutSort('ad_modifications');
    const modificationsArray = await browserStorage.get(modificationsKey);
    
    if (!modificationsArray || !Array.isArray(modificationsArray) || modificationsArray.length === 0) {
      console.log('存储中未找到广告数据');
      return;
    }
    
    // 构建修改数据映射，用于快速查找
    const modificationsMap = new Map();
    const nameToItemsMap = new Map(); // 存储相同名称的所有项目
    
    modificationsArray.forEach(item => {
      if (item && item.completeData) {
        // 优先使用广告ID作为键
        if (item.completeData.id) {
          modificationsMap.set(item.completeData.id, item);
        }
        
        // 存储相同名称的所有项目
        if (item.completeData.name) {
          const name = item.completeData.name;
          if (!nameToItemsMap.has(name)) {
            nameToItemsMap.set(name, []);
          }
          nameToItemsMap.get(name)?.push(item);
        }
      }
    });
    console.log('修改数据映射:', modificationsMap);
    console.log('名称到项目映射:', nameToItemsMap);
    
    // 找到表格容器
    console.log('找到表格容器');
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('未找到表格容器');
      return;
    }
    
    console.log('表格容器信息:', tableContainer);
    
    // 获取表格数据行对
    console.log('获取表格数据行对');
    const rowPairs = getTableDataRows(tableContainer);
    console.log('找到行对:', rowPairs.length);
    
    rowPairs.forEach(async(rowPair, rowIndex) => {
      const { fixed, scrollable } = rowPair;
      
      // 提取广告名称用于匹配
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      for (const element of nameElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && !text.match(/^\s*\$?\d+(\.\d+)?\s*$/)) {
          name = text;
          break;
        }
      }
      
      // 清理广告名称
      name = cleanAdName(name);
      
      if (!name) return;
      
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
      
      // 尝试根据唯一标识符匹配修改数据
      let rowData = modificationsMap.get(adId);
      
      // 如果根据ID找不到，使用名称到项目的映射
      if (!rowData && name) {
        const itemsWithSameName = nameToItemsMap.get(name);
        if (itemsWithSameName && itemsWithSameName.length > 0) {
          // 如果只有一个项目，直接使用
          if (itemsWithSameName.length === 1) {
            rowData = itemsWithSameName[0];
          } else {
            // 如果有多个项目，尝试根据索引匹配
            // 这不是最优解，但在没有唯一标识符的情况下是一个后备方案
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
      
      if (!rowData) return;
      
      // 生成广告ID（用于日志）
      const logAdId = rowData.completeData?.id || `ad_${rowIndex}`;
      console.log('同步广告数据:', name, 'ID:', logAdId, '行数据:', rowData);
      
      // 检查整行是否有修改
      if (!rowData.modifiedFields || Object.keys(rowData.modifiedFields).length === 0) {
        console.log(`广告数据未修改: ${name}, 跳过更新`);
        return;
      }
      
      // 从可滚动行获取元素并更新
      const scrollableElements = scrollable.children[0]?.children || [];
      console.log(`可滚动元素数量: ${scrollableElements.length}`);
      
      // 1. 插件表格左侧显示原始值（从DOM中获取的原值）
      // 2. 右侧显示可输入的增加的值（从本地存储中获取）
      // 3. 保存时两个值都需要保存
      // 4. 在原页面加载完成重新渲染新值时，是把这两个值相加显示在页面上
      // 5. 当修改完成后，插件再次点击查询，需要查询到正确的原始值和前面输入的增加的值
      const columnMappingKey = generateCacheKey('columnMapping');
      const DomColumnMapping = await browserStorage.get(columnMappingKey);
      console.log('Dom 列映射:', DomColumnMapping);
      
      if (!DomColumnMapping || Object.keys(DomColumnMapping).length === 0) {
        console.error('未找到列映射');
        return;
      }
      
      const fixIndex = fixed.children[0]?.children?.length-1;
      
      // 然后更新页面上的显示值（原始值 + 增加的值）
      try {
        isUpdatingDOM = true;
        Array.from(scrollableElements).forEach((element, index) => {
          console.log(`处理元素 ${index}: `,DomColumnMapping, element);
          const text = element.textContent?.trim();
          if (text) {
            // 检查是否有对应的列修改值
            let increaseValue = 0;
            let originalValueFromData = 0;
            let hasModification = false;
            
            // 根据DomColumnMapping确定字段类型
            if (index === DomColumnMapping.results-fixIndex) {
              // 成效 (results)
              if (rowData?.modifiedFields?.results !== undefined) {
                increaseValue = rowData.modifiedFields.results || 0;
                originalValueFromData = rowData.completeData?.results || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.reach-fixIndex) {
              // 覆盖人数 (reach)
              if (rowData?.modifiedFields?.reach !== undefined) {
                increaseValue = rowData.modifiedFields.reach || 0;
                originalValueFromData = rowData.completeData?.reach || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.spend-fixIndex) {
              // 花费 (spend)
              if (rowData?.modifiedFields?.spend !== undefined) {
                increaseValue = rowData.modifiedFields.spend || 0;
                originalValueFromData = rowData.completeData?.spend || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.impressions-fixIndex) {
              // 展示次数 (impressions)
              if (rowData?.modifiedFields?.impressions !== undefined) {
                increaseValue = rowData.modifiedFields.impressions || 0;
                originalValueFromData = rowData.completeData?.impressions || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.costPerResult-fixIndex) {
              // 每次结果成本 (costPerResult)
              if (rowData?.modifiedFields?.costPerResult !== undefined) {
                increaseValue = rowData.modifiedFields.costPerResult || 0;
                originalValueFromData = rowData.completeData?.costPerResult || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.website_clicks-fixIndex) {
              // 网站点击 (website_clicks)
              if (rowData?.modifiedFields?.website_clicks !== undefined) {
                increaseValue = rowData.modifiedFields.website_clicks || 0;
                originalValueFromData = rowData.completeData?.website_clicks || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.registrations-fixIndex) {
              // 注册 (registrations)
              if (rowData?.modifiedFields?.registrations !== undefined) {
                increaseValue = rowData.modifiedFields.registrations || 0;
                originalValueFromData = rowData.completeData?.registrations || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            } else if (index === DomColumnMapping.registration_cost-fixIndex) {
              // 注册成本 (registration_cost)
              if (rowData?.modifiedFields?.registration_cost !== undefined) {
                increaseValue = rowData.modifiedFields.registration_cost || 0;
                originalValueFromData = rowData.completeData?.registration_cost || 0;
                hasModification = true;
                console.log(`处理元素 ${index}: ${text}`);
                console.log(`原始值从数据中获取: `, originalValueFromData);
                console.log(`增加值: `, increaseValue);
              }
            }
              
            // 只有当当前列有修改时才更新
            if (hasModification) {
              // 检查原始值是否为--且新增值为0
              const currentText = element.textContent?.trim();
              const isOriginalDash = currentText.includes('—');
              const isIncreaseZero = increaseValue === 0;
              
              // 如果原始值是--且新增值为0，则不更新
              if (isOriginalDash && isIncreaseZero) {
                console.log(`跳过更新元素 ${index}: original值为 — and 增加值为 0`);
                return;
              }
              
              // 使用修改数据中保存的原始值，而不是从DOM中提取
              // 这样可以确保即使DOM值被修改，也能使用缓存中的原始值
              const newValue = originalValueFromData + increaseValue;
              
              // 更新元素的文本内容
              console.log(`更新元素 ${index}: ${originalValueFromData} + ${increaseValue} = ${newValue}`);
              
              // 递归查找并更新DOM元素
              function findAndUpdateElement(el: Element) {
                if (el.children.length > 0) {
                  // 
                  if(el.children?.[0] instanceof HTMLElement){
                    findAndUpdateElement(el.children?.[0]);
                  } else {
                    console.log(`跳过非HTMLElement子元素: ${el.children?.[0]}`);
                  }
                } else {
                  // 找到最终的文本元素
                  console.log(`更新元素文本: ${el.innerText}`);
                  
                  // 保存原始文本，用于提取货币符号
                  const originalText = el.innerText;
                  
                  // 根据字段类型决定显示格式
                  if (index === DomColumnMapping.spend-fixIndex) {
                    // 花费字段：保留2位小数，保留货币符号
                    console.log(`更新元素文本: ${newValue.toFixed(2)}`);
                    
                    // 提取货币符号（如果有）
                    const currencyMatch = originalText.match(/^[^0-9]+/);
                    const currencySymbol = currencyMatch ? currencyMatch[0] : '';
                    
                    // 保留货币符号并更新数值
                    console.log(`货币符号更新: ${currencySymbol}`);
                    el.innerText = currencySymbol + newValue.toFixed(2);
                  } else {
                    // 其他字段：整数
                    console.log(`更新元素文本: ${Math.round(newValue)}`);
                    el.innerText = Math.round(newValue).toString();
                  }
                }
              }
              
              // 开始递归查找
              findAndUpdateElement(element);
            } else {
              console.log(`元素 ${index} 未修改，跳过更新`);
            }
          }
        });
      } finally {
        isUpdatingDOM = false;
      }
    });
  } catch (error: any) {
    // 处理扩展上下文无效的错误
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('扩展上下文无效, 停止同步广告数据');
    } else {
      console.error('Error:', error);
    }
  } finally {
    // 无论成功失败都关闭遮盖层
    removeOverlay();
  }
}