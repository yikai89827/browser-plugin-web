// @ts-nocheck
import { browserStorage } from '../utils/storage';

// 导入各个模块
import { saveAccountId, getSavedAccountId } from './content/account';
import { getCurrentDate, generateCacheKey, generateSortInfoKey } from './content/cache';
import { detectSortInfo, getColumnIndices, getColumnIndicesSync,createOverlay,removeOverlay,extractAdsFromDom } from './content/dom';
import { dataExtractor } from './content/dataExtractor';
import { hierarchyManager } from './content/hierarchy';
import { handleGetAdsFromDom, handleRefreshPageWithData, handleGetCachedData, handleSaveCachedData, handleSaveModifications, handleGetSortInfo, handleSyncValues } from './content/messageHandlers';
import { valueSyncManager } from './content/syncValue';

// 全局同步状态变量
let syncTimeout: any = null;
let lastSyncTime: number = 0;
let isUpdatingDOM: boolean = false;
let lastSortInfo = { field: null as string | null, direction: null as string | null };
let lastColumnMapping: any = {};

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

// 初始化时保存账户ID
saveAccountId();


// 防抖同步函数
async function debouncedSync(): Promise<void> {
  // 检查是否在短时间内已经执行过同步，避免频繁调用
  const now = Date.now();
  if (now - lastSyncTime < 300) {
    console.log('跳过同步，距离上次同步时间太短');
    return;
  }

  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    // 检查全局的isSyncing变量
    if (!(window as any).isSyncing && !isUpdatingDOM) {
      (window as any).isSyncing = true;
      lastSyncTime = now;
      try {
        // 检查是否有缓存数据
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);

        // 首先检查是否有缓存数据
        const adsKey = await generateCacheKey('ads');
        const cachedData = await browserStorage.get(adsKey);

        // 检测当前页面的排序信息
        const currentSortInfo = detectSortInfo();

        // 检查缓存数据的排序信息是否与当前页面一致
        const cachedSortInfo = cachedData?.sortInfo || { field: null, direction: null };
        const isSortInfoSame = cachedSortInfo.field === currentSortInfo.field && 
                              cachedSortInfo.direction === currentSortInfo.direction;

        // 检查缓存数据是否有效
        const hasValidCachedData = cachedData && 
                                   cachedData.cacheData && 
                                   cachedData.cacheData.ads && 
                                   cachedData.cacheData.ads.length > 0 && 
                                   cachedData.cacheData.columnMapping && 
                                   Object.keys(cachedData.cacheData.columnMapping).length > 0;

        let entities: any[] = [];
        let columnIndices: any = {};
        let level: string = 'Campaigns';
        let sortInfo = currentSortInfo;

        // 如果有缓存数据且排序信息一致，使用缓存数据
        if (hasValidCachedData && isSortInfoSame) {
          console.log('使用缓存数据（排序信息一致）');
          entities = cachedData.cacheData.ads;
          columnIndices = cachedData.cacheData.columnMapping;
          level = cachedData.cacheData.level || 'Campaigns';
        } else if (isSortInfoSame) {
          console.log('排序信息一致但缓存数据不完整，从DOM提取');
          // 从DOM提取数据
          await getColumnIndices();
          const extractionResult = dataExtractor.extractFromDom();
          entities = extractionResult.entities;
          columnIndices = extractionResult.columnIndices;
          level = extractionResult.level;
          sortInfo = extractionResult.sortInfo;
        } else {
          console.log('排序信息已变更，从DOM重新提取数据');
          // 从DOM提取数据
          await getColumnIndices();
          const extractionResult = dataExtractor.extractFromDom();
          entities = extractionResult.entities;
          columnIndices = extractionResult.columnIndices;
          level = extractionResult.level;
          sortInfo = extractionResult.sortInfo;
        }

        // 只有在有缓存数据时才创建遮盖层
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          createOverlay();
        }

        // 检测层级关系
        hierarchyManager.detectHierarchy(entities);

        // 保存更新后的列映射
        if (columnIndices && Object.keys(columnIndices).length > 0) {
          const columnMappingKey = await generateCacheKey('columnMapping');
          await browserStorage.set(columnMappingKey, columnIndices);
          lastColumnMapping = columnIndices;
        }

        // 保存排序信息
        if (sortInfo) {
          const sortInfoKey = await generateSortInfoKey();
          await browserStorage.set(sortInfoKey, sortInfo);
        }

        // 保存数据到缓存（包含排序信息）
        const cacheData = {
          ads: entities,
          columnMapping: columnIndices,
          level: level
        };
        const dataToSave = {
          sortInfo: sortInfo,
          cacheData: cacheData
        };
        await browserStorage.set(adsKey, dataToSave);
        console.log('已保存数据到缓存:', adsKey);

        // 这里可以添加页面数据同步逻辑
        console.log('页面数据同步完成:', { entities: entities.length, level, sortInfo });
      } catch (error) {
        console.error('刷新页面数据错误:', error);
      } finally {
        // 无论成功失败都关闭遮盖层
        removeOverlay();
        (window as any).isSyncing = false;
      }
    }
  }, 0);
}

// 创建遮盖层
function createOverlay() {
  if (overlayElement) {
    return;
  }

  overlayElement = document.createElement('div');
  overlayElement.style.position = 'fixed';
  overlayElement.style.top = '0';
  overlayElement.style.left = '0';
  overlayElement.style.width = '100%';
  overlayElement.style.height = '100%';
  overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  overlayElement.style.zIndex = '9999';
  overlayElement.style.display = 'flex';
  overlayElement.style.alignItems = 'center';
  overlayElement.style.justifyContent = 'center';
  
  const loadingText = document.createElement('div');
  loadingText.textContent = '数据同步中...';
  loadingText.style.fontSize = '16px';
  loadingText.style.color = '#333';
  
  overlayElement.appendChild(loadingText);
  document.body.appendChild(overlayElement);
}

// 预加载缓存数据
async function loadCachedData(): Promise<void> {
  if (!(window as any).isSyncing) {
    (window as any).isSyncing = true;
    try {
      // 获取当前页面状态
      const pageState = getCurrentPageState();
      currentPageState = pageState;

      // 使用新的缓存键生成函数获取缓存数据
      const modificationsKey = await generateCacheKey('ad_modifications');
      const columnMappingKey = await generateCacheKey('columnMapping');

      const modifications = await browserStorage.get(modificationsKey);
      const columnMapping = await browserStorage.get(columnMappingKey);

      console.log('预加载缓存数据:', { modifications, columnMapping, pageState });

      // 只有在有缓存数据时才创建遮盖层并应用修改数据
      if (modifications && Array.isArray(modifications) && modifications.length > 0) {
        createOverlay();
        // 应用缓存的修改数据到页面
        await applyCachedModifications(modifications);
      }
    } catch (error) {
      console.error('加载缓存数据错误:', error);
    } finally {
      // 无论成功失败都关闭遮盖层
      removeOverlay();
      (window as any).isSyncing = false;
    }
  }
}

// 应用缓存的修改数据到页面
async function applyCachedModifications(modifications: any[]): Promise<void> {
  try {
    console.log('应用缓存的修改数据到页面，修改数据数量:', modifications?.length || 0);
    if(modifications?.length === 0) {
      console.log('没有修改数据，无需应用');
      return;
    }
    
    // 提取当前页面的广告数据
    const { ads } = await extractAdsFromDom();
    console.log('当前页面的广告数据:', ads?.length || 0);
    
    // 遍历修改数据，更新到页面
    for (const modification of modifications) {
      if (!modification || !modification.completeData || !modification.completeData.id || !modification.modifiedFields) {
        continue;
      }
      
      // 找到对应的广告行
      const adRow = ads.find(ad => ad.id === modification.completeData.id);
      if (adRow) {
        // 计算原始值和增加值的总和
        const valuesToUpdate = calculateValuesToUpdate(modification);
        
        // 更新到页面
        await updateAdRowByEntity(adRow, valuesToUpdate);
      } else {
        console.log('未找到匹配的广告行:', modification.completeData.id);
      }
    }
    
    console.log('应用缓存的修改数据到页面完成');
  } catch (error) {
    console.error('应用缓存的修改数据到页面错误:', error);
  }
}

// 计算要更新的值
function calculateValuesToUpdate(modification: any) {
  const valuesToUpdate: Record<string, string> = {};
  
  if (modification.completeData && modification.modifiedFields) {
    Object.keys(modification.modifiedFields).forEach(field => {
      const originalValue = modification.completeData[field] || 0;
      const increaseValue = modification.modifiedFields[field] || 0;
      const totalValue = originalValue + increaseValue;
      
      // 格式化数值
      if (typeof totalValue === 'number') {
        valuesToUpdate[field] = totalValue.toLocaleString();
      } else {
        valuesToUpdate[field] = String(totalValue);
      }
    });
  }
  
  return valuesToUpdate;
}

// 根据实体更新广告行
async function updateAdRowByEntity(entity: any, valuesToUpdate: Record<string, string>) {
  try {
    // 获取广告行的DOM元素
    const adRowElement = getAdRowElement({ id: entity.id });
    if (!adRowElement) {
      console.log('未找到广告行的DOM元素:', entity.id);
      return;
    }
    
    // 获取列索引
    const columnIndices = getColumnIndicesSync();
    if (!columnIndices || Object.keys(columnIndices).length === 0) {
      console.log('列索引为空，无法更新广告行');
      return;
    }
    
    // 获取固定列和可滚动列
    const children = adRowElement.children;
    if (children.length !== 1) {
      console.log('广告行元素结构不正确');
      return;
    }
    
    const firstChild = children[0] as HTMLElement;
    const grandchildren = firstChild.children;
    
    if (grandchildren.length < 2) {
      console.log('广告行元素缺少固定列或滚动列');
      return;
    }
    
    const fixedElement = grandchildren[0] as HTMLElement;
    const scrollableElement = grandchildren[1] as HTMLElement;
    
    // 计算固定列长度
    const fixedColumnLength = fixedElement.children[0]?.children?.length - 1 || 0;
    
    // 获取可滚动列的单元格
    const scrollableCells = scrollableElement.children[0]?.children || [];
    
    // 更新每个字段的值
    Object.entries(valuesToUpdate).forEach(([field, value]) => {
      const columnIndex = columnIndices[field];
      if (columnIndex !== undefined) {
        const scrollableIndex = columnIndex - fixedColumnLength;
        if (scrollableIndex >= 0 && scrollableCells[scrollableIndex]) {
          // 找到最内层的DOM元素进行更新
          let currentElement = scrollableCells[scrollableIndex];
          while (currentElement.firstElementChild) {
            currentElement = currentElement.firstElementChild;
          }
          currentElement.textContent = value;
        }
      }
    });
    
    console.log('更新广告行成功:', entity.id);
  } catch (error) {
    console.error('更新广告行错误:', error);
  }
}

// 获取当前页面状态
function getCurrentPageState() {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !window.location) {
    return {
      level: 'Campaigns',
      sortField: null,
      sortDirection: null
    };
  }

  // 从URL中获取当前tab名称
  const pathParts = window.location.href.split('/');
  const tab = pathParts[pathParts.length - 1];

  // 获取当前层级（竞选活动、广告组、广告）
  let level = 'Campaigns';
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

export default {
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Facebook Ads Manager 内容脚本已加载');

    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getAdsFromDom') {
        return handleGetAdsFromDom(sendResponse);
      } else if (message.action === 'refreshPageWithData') {
        return handleRefreshPageWithData(message, sendResponse);
      } else if (message.action === 'getCachedData') {
        return handleGetCachedData(message.date, sendResponse);
      } else if (message.action === 'saveCachedData') {
        return handleSaveCachedData(message, sendResponse);
      } else if (message.action === 'saveModifications') {
        return handleSaveModifications(message, sendResponse);
      } else if (message.action === 'getSortInfo') {
        return handleGetSortInfo(message.date, sendResponse);
      } else if (message.action === 'syncValues') {
        return handleSyncValues(message, sendResponse);
      }
    });

    // 立即开始获取缓存数据
    loadCachedData();

    // 初始化页面变化监听
    initPageObserver();
  }
};
