// @ts-nocheck
import { browserStorage } from '../utils/storage';
import { interceptFetch } from './content/manage/fetch';
import { footerMapping } from './content/manage/config';

// 导入各个模块
import { saveAccountId, getSavedAccountId } from './content/manage/account';
import { generateCacheKey, generateSortInfoKey, getMergedModificationsForDateRange } from './content/manage/cache';
import { getCurrentDate } from './content/manage/date';
import { getCurrentPageState, getColumnIndices, getColumnIndicesSync,createOverlay,removeOverlay,extractAdsFromDom,getIdColumn,getAdRowElement,findInnermostElement } from './content/manage/dom';
import { dataExtractor } from './content/manage/dataExtractor';
import { hierarchyManager } from './content/manage/hierarchy';
import { findFooterRow,updateCell,updateFooterData, handleGetAdsFromDom, handleRefreshPageWithData, handleGetCachedData, handleSaveCachedData, handleSaveModifications, handleGetSortInfo, sortTableRows, calculateMergedTotals, extractFooterData } from "./content/manage/messageHandlers";

// 导入报告页面的消息处理函数
import { handleReportingGetDataFromDom, handleReportingRefresh, handleReportingGetCachedData, handleReportingInit } from './content/reporting/messageHandlers';


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
  field: null, // 当前排序字段
  direction: null, // 当前排序方向
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
        console.error('刷报表页面数据错误:', error);
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
      // 检查当前DOM日期范围是否有缓存的增加值
      const shouldLoadModifications = await checkDateRangeForModifications();
      if (!shouldLoadModifications) {
        console.log('不需要加载缓存数据');
        return;
      }
      
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
        // 应用缓存的修改数据到页面（不再传递参数，函数内部会从日期范围获取合并后的数据）
        await applyCachedModifications();
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

// 检查当前DOM日期范围是否有缓存的增加值
// 注意：不再检查当前日期是否在范围内，只要有缓存数据就返回true
// 日期范围的判断只在保存时进行（在popup页面）
async function checkDateRangeForModifications(): Promise<boolean> {
  try {
    // 提取当前DOM的日期范围
    const { dateRanges } = await extractAdsFromDom();
    console.log('当前DOM的日期范围:', dateRanges);
    
    // 如果没有日期范围，返回false
    if (!dateRanges || dateRanges.length === 0) {
      console.log('当前DOM没有日期范围，无需处理缓存');
      return false;
    }
    
    // 检查是否有任何缓存数据（不再检查当前日期是否在范围内）
    // 页面刷新和排序变化时，直接根据日期范围渲染缓存值
    const modificationsKey = await generateCacheKey('ad_modifications');
    const modifications = await browserStorage.get(modificationsKey);
    
    if (modifications && Array.isArray(modifications) && modifications.length > 0) {
      console.log('存在缓存数据，需要应用修改');
      return true;
    } else {
      console.log('没有缓存数据');
      return false;
    }
  } catch (error) {
    console.error('检查日期范围错误:', error);
    return false;
  }
}

// 应用缓存的修改数据到页面
async function applyCachedModifications(_modifications?: any[], _totals?: any): Promise<void> {
  try {
    // 检查当前DOM日期范围是否有缓存的增加值
    const shouldApplyModifications = await checkDateRangeForModifications();
    if (!shouldApplyModifications) {
      console.log('不需要应用缓存修改数据');
      return;
    }
    
    // 根据日期范围获取合并后的修改数据（已按字段求和）
    const mergedModifications = await getMergedModificationsForDateRange();
    console.log('应用缓存的修改数据到页面，合并后的修改数据数量:', mergedModifications?.length || 0);
    
    if (!mergedModifications || mergedModifications.length === 0) {
      console.log('没有修改数据，无需应用');
      return;
    }
    
    // 提取当前页面的广告数据
    const { ads } = await extractAdsFromDom();
    console.log('当前页面的广告数据:', ads?.length || 0);
    
    // 获取当前页面层级
    const pageState = getCurrentPageState();
    const currentLevel = pageState.level || 'Campaigns';
    let currencySymbol = '$';
    
    // 从DOM提取原始合计值（取消缓存，每次重新计算）
    const originalFooterData = extractFooterData();
    console.log('从DOM提取的原始合计数据:', originalFooterData);
    
    // 计算合并后的合计增加值（使用原始合计值）
    const mergedTotals = calculateMergedTotals(mergedModifications, originalFooterData);
    console.log('合并后的合计数据:', mergedTotals);
    
    // 遍历修改数据，更新到页面
    for (const modification of mergedModifications) {
      const { completeData, modifiedFields } = modification || {};
      if (!completeData || !completeData.id || !modifiedFields) {
        continue;
      }
      currencySymbol = completeData.currencySymbol || '$';
      // 找到对应的广告行
      let adRow: any = null;
      const idColumn = getIdColumn();
      console.log('当前层级的ID列:', idColumn, completeData, ads);
      
      let lookupId: string | null = null;
      
      // 根据当前层级选择正确的ID
      switch (currentLevel) {
        case 'Ads':
          lookupId = completeData.ad_id || completeData.id;
          break;
        case 'Adsets':
          lookupId = completeData.adset_id;
          break;
        case 'Campaigns':
          lookupId = completeData.campaign_id;
          break;
        default:
          lookupId = completeData.id;
      }
      
      if (lookupId) {
        console.log('根据当前层级', currentLevel, '使用ID', lookupId, '查找匹配的行');
        adRow = ads.find(ad => ad[idColumn] === lookupId);
      }
      
      if (adRow) {
        // 计算原始值和增加值的总和
        const { valuesToUpdate, increaseValues } = calculateValuesToUpdate(modification);
        
        // 更新数据到页面
        await updateAdRowByEntity(adRow[idColumn], valuesToUpdate, increaseValues, currencySymbol);
      } else {
        console.log('应用缓存未找到匹配的广告行:', modification.completeData.id);
      }
    }
    
    // 更新合计行数据（使用合并后的合计值）
    await updateFooterData(mergedTotals, currencySymbol);
    
    // 对表格行进行排序（使用合并后的数据）
    await sortTableRows(mergedModifications);
    
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
    const costFields = ['registration_cost', 'purchase_cost', 'costPerResult', 'spend'];
    Object.keys(modification.modifiedFields).forEach(field => {
      // 将字符串转换为数字，去除货币符号和逗号等分隔符
      const originalValue = parseFloat(String(modification.completeData[field]).replace(/[^\d.-]/g, '')) || 0;
      const increaseValue = parseFloat(String(modification.modifiedFields[field]).replace(/[^\d.-]/g, '')) || 0;
      const tempValue = Number((Number(originalValue) + Number(increaseValue)));
      const totalValue = costFields.includes(field) ? tempValue.toFixed(2) : tempValue;
      console.log(`处理字段 ${field}:`,'原始值:', originalValue, '增加值:', increaseValue);
      
      // 格式化数值
      if (typeof totalValue === 'number') {
        valuesToUpdate[field] = totalValue.toLocaleString();
      } else {
        valuesToUpdate[field] = totalValue || '';
      }
      
      increaseValues[field] = Number(increaseValue || 0);
    });
  }
  
  return { valuesToUpdate, increaseValues };
}

// 根据实体更新广告行
async function updateAdRowByEntity(id: any, valuesToUpdate: Record<string, string>, increaseValues: Record<string, number>,currencySymbol: string) {
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
            currentElement.textContent = currencySymbol + value;
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

// 更新合计行数据
async function updateFooterRowByEntity(valuesToUpdate: Record<string, string>, increaseValues: Record<string, number>,currencySymbol: string) {
  try {
    // 查找合计行
    const footerRow = findFooterRow();
    if (!footerRow) {
      console.warn('更新合计行数据: 未找到合计行');
      return;
    }
    
    // 找到可滚动列部分
    const cells = footerRow.children?.[1]?.children[0]?.children || [];
    if (!cells) {
      console.warn('更新合计行数据: 未找到可滚动列部分');
      return;
    }
    console.log('可滚动列部分:', cells, valuesToUpdate, increaseValues);
      
    for (const [field, value] of Object.entries(valuesToUpdate)) {
      const cellnode = Array.from(cells).find(cell => (cell as HTMLElement)?.dataset?.surface?.trim()?.includes(footerMapping[field]));
      if (!cellnode) {
        console.warn(`更新合计行数据: 未找到字段 ${field} 对应的单元格`);
        continue;
      }
      if (cellnode) {
        updateCell(cellnode, field, value, increaseValues[field] || 0, currencySymbol);  
      }
    }
    console.log('已更新合计行数据');
  } catch (error) {
    console.error('更新合计行数据错误:', error);
  }
}

// 初始化报表页面变化监听
function initReportingPageObserver(): void {
  // 防抖计时器
  let debounceTimer: number | null = null;
  // 节流计时器（用于排序切换）
  let throttleTimer: number | null = null;
  
  // 使用MutationObserver来拦截页面渲染
  const observer = new MutationObserver((mutations) => {
    // 检查是否有排序变化（通过style变化检测）
    let hasSortChange = false;

    // 检查是否有新的表格元素被创建（可能是页面刷新）
    let hasTableCreated = false;
    // 检查是否有loading状态（可能是点击了刷新按钮）
    let hasLoadingState = false;
    // 检测是否有滚动变化（通过style变化检测）
    let hasScrollChange = false;
    // 检测是否有表体行data-surface属性变化（用于节流判断）
    let hasBodyRowDataSurfaceChange = false;
    try {
      // 检测表格元素创建或表格内容变化（如滚动加载新行）
      hasTableCreated = mutations.some(mutation => {
        if (mutation.type === 'childList') {
          // 检查是否有新的表格元素被添加
          // 或表格内部添加了新的行/单元格（滚动加载）
          return Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              // 检测表格元素本身
              if (element.getAttribute('role') === 'table' ||
                  element.querySelector('[role="table"]')) {
                return true;
              }
              // 检测表格行或单元格（滚动加载时添加）
              if ((element.tagName === 'SPAN' && element.hasAttribute('data-surface'))) {
                // 检查这些元素是否在表格内
                let parent = element.parentElement;
                while (parent) {
                  if (parent.getAttribute('role') === 'table') {
                    return true;
                  }
                  parent = parent.parentElement;
                }
              }
            }
            return false;
          });
        }
        return false;
      });

      // 检测滚动变化（通过style属性变化或data-surface属性变化）
      hasScrollChange = mutations.some(mutation => {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          const element = mutation.target as HTMLElement;
          // 检查元素是否在表格内
          let parent = element.parentElement;
          let isInTable = false;
          while (parent) {
            if (parent.getAttribute('role') === 'table'|| parent.querySelector('[role="table"]')) {
              isInTable = true;
              break;
            }
            parent = parent.parentElement;
          }
          
          if (isInTable) {
            // 检测style属性变化（滚动条移动）
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              // 只检测与滚动相关的特定元素的style变化
              // 排除表头元素的style变化（如hover效果）
              const isHeaderRow = element.getAttribute('role') === 'row';
              if (!isHeaderRow) {
                // 检查元素是否是滚动相关的元素
                // 可以根据实际的滚动条元素特征进行判断
                // 例如：滚动条容器、滚动内容容器等
                const isScrollRelatedElement = element.classList.contains('scrollbar') ||
                                              element.classList.contains('scroll-container') ||
                                              element.style.transform !== '' || // 有transform属性变化的元素（可能是滚动时的位置变化）
                                              element.style.top !== '' || // 有top属性变化的元素（可能是滚动时的位置变化）
                                              element.style.left !== ''; // 有left属性变化的元素（可能是滚动时的位置变化）
                if (isScrollRelatedElement) {
                  return true;
                }
              }
            }
            // 检测data-surface属性变化（表格行号变化）
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-surface') {
              // 检查data-surface属性是否包含table_row
              const dataSurface = element.getAttribute('data-surface');
              if (dataSurface && dataSurface.includes('table_row:')) {
                // 只检测表体行，不检测表头行
                // 表头行有role="row"属性，表体行没有
                const isHeaderRow = element.getAttribute('role') === 'row';
                if (!isHeaderRow) {
                  hasBodyRowDataSurfaceChange = true;
                  return true;
                }
              }
            }
          }
        }
        return false;
      });

      if (hasTableCreated || hasScrollChange) {
        // 如果是表体行的data-surface属性变化（可能是排序切换），使用节流逻辑
        if (hasBodyRowDataSurfaceChange && throttleTimer !== null) {
          console.log('检测到表体行data-surface属性变化，正在节流中，跳过本次处理');
          return;
        }
        
        // 清除之前的防抖计时器
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        // 启动新的防抖计时器
        debounceTimer = window.setTimeout(async () => {
          // 检测是否是滚动加载（通过检查是否有新的表格行被添加）
          const isScrollLoading = mutations.some(mutation => {
            if (mutation.type === 'childList') {
              return Array.from(mutation.addedNodes).some(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const element = node as HTMLElement;
                  return element.tagName === 'SPAN' && element.hasAttribute('data-surface');
                }
                return false;
              });
            }
            return false;
          });
          
          if (hasScrollChange) {
            console.log('检测到报表页面表格滚动变化');
          } else if (isScrollLoading) {
            console.log('检测到报表页面表格滚动加载新行');
          } else {
            console.log('检测到报表页面表格元素被创建，可能是页面刷新');
          }
          
          // 检查当前DOM日期范围是否有缓存的增加值
          const shouldUpdateDom = await checkDateRangeForModifications();
          if (shouldUpdateDom) {
            // 显示遮盖层
            createOverlay();
            // 等待DOM更新完成后再应用修改数据
            const waitTime = hasScrollChange || isScrollLoading ? 300 : 2000; // 滚动相关操作等待300ms，页面刷新等待2秒
            setTimeout(async () => {
              // 导入reporting模块的updateDomElements函数
              const { updateDomElements } = await import('./content/reporting/domUpdater');
              await updateDomElements();
              removeOverlay();
            }, waitTime); // 根据场景设置不同的等待时间
          } else {
            console.log('不需要更新DOM元素');
          }
        }, 100); // 防抖时间100ms
        
        // 如果是表体行的data-surface属性变化，设置节流计时器
        if (hasBodyRowDataSurfaceChange) {
          throttleTimer = window.setTimeout(() => {
            throttleTimer = null;
            console.log('节流计时器已重置');
          }, 2000); // 节流时间2秒
        }
      }
    } catch (error) {
      console.error('检测报表页面状态错误:', error);
      removeOverlay();
    }

    // 只在排序变化时触发同步
    if (hasSortChange) {
      console.log('检测到报表页面排序变更，触发同步');

      // 立即显示遮盖层并应用修改数据
      (async () => {
        // 导入reporting模块的updateDomElements函数
        const { updateDomElements } = await import('./content/reporting/domUpdater');
        createOverlay();
        // 等待DOM更新完成后再应用修改数据
        setTimeout(async () => {
          await updateDomElements();
          removeOverlay();
        }, 100);
      })();
    }
  });

  // 开始观察页面变化
  const tableElement = document.querySelector('[role="table"]');
  if (tableElement) {
    observer.observe(tableElement, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['style', 'data-surface'] // 监听style和data-surface属性变化
    });
    console.log('报表页面变化监听已启动');
  } else {
    console.log('报表页面未找到表格元素，页面变化监听未启动');
    // 尝试在整个文档上监听，以捕获表格元素的创建
    observer.observe(document.body, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听子树变化
      attributes: true, // 监听属性变化
      attributeFilter: ['style', 'data-surface'] // 监听style和data-surface属性变化
    });
    console.log('在整个文档上启动报表页面变化监听');
  }
}

// 初始化页面变化监听
function initPageObserver(): void {
  // 使用MutationObserver来拦截页面渲染
  const observer = new MutationObserver((mutations) => {
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
            // 不再传递参数，函数内部会从日期范围获取合并后的数据
            await applyCachedModifications();
          }
          removeOverlay();
        }, 2000); // 等待2秒让新数据加载完成
      }
    } catch (error) {
      console.error('检测表格状态错误:', error);
      removeOverlay();
    }
    // 检查是否有排序变化
    let hasSortChange = false;
    try {
      const pageState = getCurrentPageState() || {};
      const field = pageState.field;
      const direction = pageState.direction;
      const level = pageState.level;
      console.log('当前排序字段:', field, '排序方向:', direction, '上次排序信息:', lastSortInfo);
      
      // 无论是否有排序字段，都检查是否与上次排序信息不同
      if (field !== lastSortInfo.field || direction !== lastSortInfo.direction || level !== lastSortInfo.level) {
        lastSortInfo = { field, direction, level };
        hasSortChange = true;
        console.log('检测到排序或者tab变更:', lastSortInfo);
        createOverlay();
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
        // 注意：不再从缓存读取 totals，改为在 applyCachedModifications 中从 DOM 提取原始合计值
        // 然后根据日期范围重新计算合并后的合计值
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          // 等待DOM更新完成后再应用修改数据
          setTimeout(async () => {
            await applyCachedModifications();
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
    console.log('未找到表格元素，页面变化监听未启动');
    // 尝试在整个文档上监听，以捕获表格元素的创建
    observer.observe(document.body, {
      childList: true, // 监听子节点变化
      subtree: true // 监听子树变化
    });
    console.log('在整个文档上启动页面变化监听');
  }
}

export default {
  matches: ['*://*.facebook.com/adsmanager/manage/*','*://*.facebook.com/adsmanager/reporting/*'],
  main() {
    if (window.location.href.includes('adsmanager/reporting')) {
      console.log('Facebook Ads reporting 报告页面已加载');
      
      // 导入报告页面模块
      import('./content/reporting/domUpdater').then(({ updateDomElements, setupScrollListener, setupSortListener }) => {
        // 初始化DOM更新
        updateDomElements();
        
        // 设置滚动监听器
        setupScrollListener();
        
        // 设置排序监听器
        setupSortListener();
        
        // 初始化报表页面变化监听
        initReportingPageObserver();
      });
      
      // 处理报告页面的逻辑
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getReportingDataFromDom') {
          return handleReportingGetDataFromDom(sendResponse);
        } else if (message.action === 'saveReportingModifications') {
          return handleReportingRefresh(message, sendResponse);
        } else if (message.action === 'reporting_init') {
          return handleReportingInit(sendResponse);
        }
      });
      return;
    } 
    console.log('Facebook Ads Manager 内容脚本已加载');

    // interceptFetch();

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

    if (window.location.href.includes('adsmanager/manage')) {
      // 初始化页面变化监听
      initPageObserver();
    }
  }
};
