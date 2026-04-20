// @ts-nocheck
import { browserStorage } from '../utils/storage';

// 导入各个模块
import { saveAccountId, getSavedAccountId } from './content/account';
import { getCurrentDate, generateCacheKey, generateSortInfoKey } from './content/cache';
import { detectSortInfo, getColumnIndices, getColumnIndicesSync } from './content/dom';
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

        // 只有在有缓存数据时才创建遮盖层
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          createOverlay();
        }

        // 重新获取列索引
        await getColumnIndices();

        // 重新提取广告数据（包括原始值）
        const { entities, columnIndices, level, sortInfo } = dataExtractor.extractFromDom();
        
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

// 移除遮盖层
function removeOverlay() {
  if (overlayElement && overlayElement.parentNode) {
    overlayElement.parentNode.removeChild(overlayElement);
    overlayElement = null;
  }
}

// 初始化页面变化监听
function initPageObserver(): void {
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
                const currentColumnKeys = Object.keys(lastColumnMapping || {}).sort();
                const newColumnKeys = Object.keys(newColumnIndices).sort();

                if (currentColumnKeys.length !== newColumnKeys.length) {
                  hasColumnChange = true;
                } else {
                  for (let i = 0; i < currentColumnKeys.length; i++) {
                    if (currentColumnKeys[i] !== newColumnKeys[i] ||
                        lastColumnMapping[currentColumnKeys[i]] !== newColumnIndices[newColumnKeys[i]]) {
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
      (async () => {
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          console.log('有缓存数据，显示遮盖层');
          createOverlay();
        }
      })();

      // 延迟执行同步，等待排序操作完成
      setTimeout(() => {
        debouncedSync();
      }, 500); // 等待500ms让排序操作完成
    }
  });

  // 开始观察页面变化
  const tableElement = document.querySelector('[role="table"]');
  if (tableElement) {
    observer.observe(tableElement, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['class', 'style'] // 只监听特定属性变化
    });
    console.log('页面变化监听已启动');
  } else {
    console.warn('未找到表格元素，页面变化监听未启动');
  }
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

      // 只有在有缓存数据时才创建遮盖层
      if (modifications) {
        createOverlay();
        // 这里可以添加页面数据同步逻辑
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
        return handleRefreshPageWithData(message.sortInfo, sendResponse);
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
