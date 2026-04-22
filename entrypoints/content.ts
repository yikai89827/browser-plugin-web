// @ts-nocheck
import { browserStorage } from '../utils/storage';
import { interceptFetch } from './content/fetch';

``

// 导入各个模块
import { saveAccountId, getSavedAccountId } from './content/account';
import { getCurrentDate, generateCacheKey, generateSortInfoKey } from './content/cache';
import { getCurrentPageState, getColumnIndices, getColumnIndicesSync,createOverlay,removeOverlay,extractAdsFromDom,getIdColumn,getAdRowElement,findInnermostElement } from './content/dom';
import { dataExtractor } from './content/dataExtractor';
import { hierarchyManager } from './content/hierarchy';
import { handleGetAdsFromDom, handleRefreshPageWithData, handleGetCachedData, handleSaveCachedData, handleSaveModifications, handleGetSortInfo } from "./content/messageHandlers";


// 全局同步状态变量
let syncTimeout: any = null;
let lastSyncTime: number = 0;
let isUpdatingDOM: boolean = false;
window.lastSortInfo = { field: null as string | null, direction: null as string | null, level: '' as string | null };
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
        // 获取当前页面状态
        const pageState = getCurrentPageState();
        const currentLevel = pageState.level || 'Campaigns';
        
        // 检查是否有缓存数据
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);

        // 首先检查是否有缓存数据
        const adsKey = await generateCacheKey('ads');
        const cachedData = await browserStorage.get(adsKey);

        // 检测当前页面的排序信息
        const { field: sortField, direction: sortDirection } = pageState;

        // 检查缓存数据的排序信息是否与当前页面一致
        const cachedSortInfo = cachedData?.sortInfo || { field: null, direction: null };
        const isSortInfoSame = cachedSortInfo?.field === sortField && 
                              cachedSortInfo?.direction === sortDirection;

        // 检查缓存数据是否有效
        const hasValidCachedData = cachedData && 
                                   cachedData.cacheData && 
                                   cachedData.cacheData.ads && 
                                   cachedData.cacheData.ads.length > 0 && 
                                   cachedData.cacheData.columnMapping && 
                                   Object.keys(cachedData.cacheData.columnMapping).length > 0;

        let entities: any[] = [];
        let columnIndices: any = {};
        let sortInfo = {
          field: sortField,
          direction: sortDirection,
          level: currentLevel
        };

        // 如果有缓存数据且排序信息一致，使用缓存数据
        if (hasValidCachedData && isSortInfoSame) {
          console.log('使用缓存数据（排序信息一致）');
          entities = cachedData.cacheData.ads;
          columnIndices = cachedData.cacheData.columnMapping;
        } else {
          console.log('排序信息已变更，从DOM重新提取数据');
          // 从DOM提取数据
          await getColumnIndices();
          const extractionResult = dataExtractor.extractFromDom();
          entities = extractionResult.entities;
          columnIndices = extractionResult.columnIndices;
          sortInfo = extractionResult.sortInfo;
          
          // 应用缓存中的修改值到新提取的数据
          if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
            console.log('应用缓存中的修改值到新提取的数据');
            entities = entities.map(entity => {
              let updatedEntity = entity;
              // 确保increaseValues对象存在
              if (!updatedEntity.increaseValues) {
                updatedEntity.increaseValues = {};
              }
              
              // 查找对应的修改记录
              const modification = modificationsArray.find(mod => {
                if (currentLevel === 'Campaigns') {
                  return mod.completeData.id === entity.id || mod.completeData.campaign_id === entity.id;
                } else if (currentLevel === 'Adsets') {
                  return mod.completeData.id === entity.id || mod.completeData.adset_id === entity.id || mod.completeData.adset_id === entity.adset_id;
                } else {
                  return mod.completeData.id === entity.id || mod.completeData.ad_id === entity.id || mod.completeData.ad_id === entity.ad_id;
                }
              });
              
              // 应用修改值
              if (modification) {
                for (const [field, value] of Object.entries(modification.modifiedFields)) {
                  updatedEntity.increaseValues[field] = (updatedEntity.increaseValues[field] || 0) + value;
                }
              }
              
              return updatedEntity;
            });
          }
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
          level: currentLevel
        };
        const dataToSave = {
          sortInfo,
          cacheData: cacheData
        };
        await browserStorage.set(adsKey, dataToSave);
        console.log('已保存数据到缓存:', adsKey);

        // 这里可以添加页面数据同步逻辑
        console.log('页面数据同步完成:', { entities: entities?.length || 0, level: currentLevel, sortInfo });
      } catch (error) {
        console.error('刷新页面数据错误:', error);
        removeOverlay();
      } finally {
        // 无论成功失败都关闭遮盖层
        removeOverlay();
        (window as any).isSyncing = false;
      }
    }
  }, 0);
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
      removeOverlay();
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
    
    // 获取当前页面层级
    const pageState = getCurrentPageState();
    const currentLevel = pageState.level || 'Campaigns';
    
    // 遍历修改数据，更新到页面
    for (const modification of modifications) {
      if (!modification || !modification.completeData || !modification.completeData.id || !modification.modifiedFields) {
        continue;
      }
      
      // 找到对应的广告行
      let adRow: any = null;
      const idColumn = getIdColumn();
      console.log('当前层级的ID列:', idColumn, modification.completeData,ads);
      // 首先尝试使用当前层级的ID列查找
      if (modification.completeData.id) {
        console.log('尝试使用当前层级的ID列查找:', modification.completeData.id);
        adRow = ads.find(ad => ad[idColumn] === modification.completeData.id);
      }
      
      if (adRow) {
        // 计算原始值和增加值的总和
        const { valuesToUpdate, increaseValues } = calculateValuesToUpdate(modification);
        
        // 更新到页面
        await updateAdRowByEntity(adRow[idColumn], valuesToUpdate, increaseValues);
      } else {
        console.log('应用缓存未找到匹配的广告行:', modification.completeData.id);
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
  const increaseValues: Record<string, number> = {};
  
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
      
      increaseValues[field] = increaseValue;
    });
  }
  
  return { valuesToUpdate, increaseValues };
}

// 根据实体更新广告行
async function updateAdRowByEntity(id: any, valuesToUpdate: Record<string, string>, increaseValues: Record<string, number>) {
  try {
    // 获取广告行的DOM元素
    const adRowElement = getAdRowElement({ id });
    if (!adRowElement) {
      console.log('未找到广告行的DOM元素:', id);
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
    // 定义金额字段列表
    const currencyFields = ['spend', 'registration_cost', 'purchase_cost', 'costPerResult'];
    // 更新每个字段的值
    Object.entries(valuesToUpdate).forEach(([field, value]) => {
      const columnIndex = columnIndices[field];
      if (columnIndex !== undefined) {
        const scrollableIndex = columnIndex - fixedColumnLength;
        if (scrollableIndex >= 0 && scrollableCells[scrollableIndex]) {
          // 找到最内层的DOM元素进行更新
          const currentElement = findInnermostElement(scrollableCells[scrollableIndex]);
          // 如果是金额字段，保留货币符号
          if (currencyFields.includes(field)) {
            currentElement.textContent = currencySymbol + value.toFixed(2);
          } else {
            currentElement.textContent = String(value);
          }
          
          // 添加 data-add-value 属性，存储增加值
          const increaseValue = increaseValues[field] || 0;
          currentElement.setAttribute('data-add-value', String(increaseValue));
        }
      }
    });
    
    console.log('更新广告行成功:', id);
  } catch (error) {
    console.error('更新广告行错误:', error);
  }
}
// 初始化页面变化监听
function initPageObserver(): void {
  // 使用MutationObserver来拦截页面渲染
  const observer = new MutationObserver((mutations) => {
    // 检查是否有排序变化
    let hasSortChange = false;
    try {
      const { field: sortField, direction: sortDirection, level } = getCurrentPageState() || {};
      // console.log('当前排序字段:', sortField, '排序方向:', sortDirection, '上次排序信息:', lastSortInfo);
      if (sortField && sortDirection) {
        if (sortField !== lastSortInfo.field || sortDirection !== lastSortInfo.direction || level !== lastSortInfo.level) {
          lastSortInfo = { field: sortField, direction: sortDirection, level };
          hasSortChange = true;
          console.log('检测到排序或者tab变更:', lastSortInfo);
          createOverlay();
        }
      }
    } catch (error) {
      console.error('检测排序信息错误:', error);
      removeOverlay();
    }

    // 检查是否有表格列位置变化
    let hasColumnChange = false;
    try {
      // 检查是否有列头相关的变化
      const hasColumnHeaderChanges = mutations.some(mutation => {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          const element = mutation.target as HTMLElement;
          return element.getAttribute('role') === 'columnheader' ||
                 element.querySelector('[role="columnheader"]')
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
            createOverlay();
          }
        }
      }
    } catch (error) {
      console.error('检测列位置变化错误:', error);
      removeOverlay();
    }
    // 只在排序变化或表格列位置变化时触发同步
    if (hasSortChange || hasColumnChange) {
      console.log('检测到排序变更或表格列位置变化，触发同步');

      // 立即显示遮盖层并应用修改数据
      (async () => {
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          // 等待DOM更新完成后再应用修改数据
          setTimeout(async () => {
            await applyCachedModifications(modificationsArray);
            removeOverlay();
          }, 100);
        } else {
          removeOverlay();
        }
      })();

      // 延迟执行同步，等待排序操作完成
      setTimeout(() => {
        debouncedSync();
      }, 0); // 等待500ms让排序操作完成
    }
    // 检查是否有新的表格元素被创建（可能是页面刷新）
    let hasTableCreated = false;
    // 检查是否有loading状态（可能是点击了刷新按钮）
    let hasLoadingState = false;
    try {
      // 检测表格元素创建
      hasTableCreated = mutations.some(mutation => {
        if (mutation.type === 'childList') {
          // 检查是否有新的表格元素被添加
          return Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              return element.getAttribute('role') === 'table' ||
                     element.querySelector('[role="table"]');
            }
            return false;
          });
        }
        return false;
      });

      // 检测loading状态
      hasLoadingState = mutations.some(mutation => {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          const element = mutation.target as HTMLElement;
          // 检查是否有loading相关的元素或类名
          return element.classList.contains('loading') ||
                 element.querySelector('.loading') ||
                 element.classList.contains('spinner') ||
                 element.querySelector('.spinner') ||
                 element.getAttribute('aria-busy') === 'true' ||
                 element.querySelector('[aria-busy="true"]');
        }
        return false;
      });

      if (hasTableCreated || hasLoadingState) {
        console.log('检测到表格元素被创建或loading状态，可能是页面刷新或点击了刷新按钮');
        // 显示遮盖层
        createOverlay();
        // 等待DOM更新完成后再应用修改数据
        setTimeout(async () => {
          const modificationsKey = await generateCacheKey('ad_modifications');
          const modificationsArray = await browserStorage.get(modificationsKey);
          if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
            console.log('有缓存数据，应用修改数据');
            await applyCachedModifications(modificationsArray);
          }
          removeOverlay();
        }, 2000); // 等待2秒让新数据加载完成
      }
    } catch (error) {
      console.error('检测表格状态错误:', error);
      removeOverlay();
    }
  });

  // 开始观察页面变化
  const tableElement = document.querySelector('[role="table"]');
  if (tableElement) {
    observer.observe(tableElement, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['sorting'] // 只监听特定属性变化
    });
    console.log('页面变化监听已启动');
  } else {
    console.warn('未找到表格元素，页面变化监听未启动');
    // 尝试在整个文档上监听，以捕获表格元素的创建
    observer.observe(document.body, {
      childList: true, // 监听子节点变化
      subtree: true // 监听子树变化
    });
    console.log('在整个文档上启动页面变化监听');
  }
}

export default {
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Facebook Ads Manager 内容脚本已加载');

    interceptFetch();

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

      }
    });

    // 立即开始获取缓存数据
    loadCachedData();

    // 初始化页面变化监听
    initPageObserver();
  }
};
