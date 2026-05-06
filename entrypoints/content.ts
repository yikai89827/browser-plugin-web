// @ts-nocheck
import { browserStorage } from '../utils/storage';
import { interceptFetch } from './content/manage/fetch';
import { footerMapping } from './content/manage/config';

// 导入各个模块
import { saveAccountId, getSavedAccountId } from './content/manage/account';
import { generateCacheKey, generateSortInfoKey } from './content/manage/cache';
import { getCurrentDate } from './content/manage/date';
import { findTableContainer,getTablePresentationRows, getCurrentPageState, getColumnIndices, getColumnIndicesSync,createOverlay,removeOverlay,extractAdsFromDom,getIdColumn,getAdRowElement,findInnermostElement } from './content/manage/dom';
import { dataExtractor } from './content/manage/dataExtractor';
import { hierarchyManager } from './content/manage/hierarchy';
import { findFooterRow,updateCell, handleGetAdsFromDom, handleRefreshPageWithData, handleGetCachedData, handleSaveCachedData, handleSaveModifications, handleGetSortInfo, setRefreshButtonFlag } from "./content/manage/messageHandlers";
import { renderCachedModifications, hasCachedModifications } from './content/manage/cacheRenderer';

// 导入报告页面的消息处理函数
import { handleReportingGetDataFromDom, handleReportingRefresh, handleReportingGetCachedData, handleReportingInit } from './content/reporting/messageHandlers';
// 导入报告页面的缓存检查函数
import { checkDateRangeForModifications } from './content/reporting/cache';
import { extractDateFromPage } from './content/reporting/dom';
import { shouldIgnoreReportingPageObserver } from './content/reporting/domUpdater';


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
      // 获取当前页面状态
      const pageState = getCurrentPageState();
      currentPageState = pageState;

      // 检查是否有缓存数据需要渲染
      const hasModifications = await hasCachedModifications();
      if (!hasModifications) {
        console.log('不需要加载缓存数据');
        return;
      }

      // 使用新的缓存键生成函数获取缓存数据
      const columnMappingKey = await generateCacheKey('columnMapping');
      const columnMapping = await browserStorage.get(columnMappingKey);

      console.log('预加载缓存数据:', { columnMapping, pageState });

      // 创建遮盖层并应用修改数据
      createOverlay();
      // 使用统一的缓存渲染函数
      await applyCachedModifications();
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
// 应用缓存的修改数据到页面
// 使用统一的缓存渲染函数
async function applyCachedModifications(): Promise<void> {
  try {
    // 检查是否有缓存数据
    const hasModifications = await hasCachedModifications();
    if (!hasModifications) {
      console.log('不需要应用缓存修改数据');
      return;
    }
    
    // 使用统一的缓存渲染函数
    const result = await renderCachedModifications();
    console.log('应用缓存的修改数据到页面完成:', result);
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
  // 上次排序信息
  let lastSortInfo = { field: null, direction: null };
  
  // 判断元素是否在表格内部
  const isElementInTable = (element: HTMLElement): boolean => {
    let parent = element.parentElement;
    while (parent) {
      if (parent.getAttribute('role') === 'table') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };
  
  /**
   * 判断是否为单元格 hover 产生的弹层（在「表格结构 / 滚动」检测中需排除）。
   * - 简单文字气泡：常见为 role="tooltip" 或小而浅的 fixed/absolute 层。
   * - 表头复杂说明：多段落/列表 + 说明类文案的 dialog 或浮层，通常不含 role=table。
   */
  const isTooltipElement = (element: HTMLElement): boolean => {
    if (!element?.getBoundingClientRect) return false;

    const containsTableSubtree = !!element.querySelector?.('[role="table"]');
    const inTable = isElementInTable(element);
    const cs = window.getComputedStyle(element);
    const isLayered = cs.position === 'fixed' || cs.position === 'absolute';
    const zRaw = cs.zIndex === 'auto' ? 0 : Number(cs.zIndex);
    const z = Number.isFinite(zRaw) ? zRaw : 0;

    // 1) ARIA tooltip：简单气泡或包一层子节点，整棵子树排除（且不应包一整张报表 table）
    const tooltipRoot = element.closest('[role="tooltip"]');
    if (tooltipRoot instanceof HTMLElement && !tooltipRoot.querySelector('[role="table"]')) {
      return true;
    }

    // 2) 表头「指标说明」类 dialog：中等尺寸 + 说明文案/多段结构，避免误伤整页大弹窗
    const dialogRoot =
      element.getAttribute('role') === 'dialog'
        ? element
        : (element.closest('[role="dialog"]') as HTMLElement | null);
    if (dialogRoot && !dialogRoot.querySelector('[role="table"]')) {
      const dr = dialogRoot.getBoundingClientRect();
      const snippet = (dialogRoot.innerText || '').slice(0, 600);
      const looksLikeMetricHelp =
        /learn more|了解更多|帮助|definition|metric|如何计算|指标|指標|calculated from|estimated|估算/i.test(
          snippet,
        );
      const hasRichBody =
        dialogRoot.querySelectorAll('p, li').length >= 2 || !!dialogRoot.querySelector('ul, ol');
      if (
        dr.width > 0 &&
        dr.width <= 720 &&
        dr.height > 0 &&
        dr.height <= 520 &&
        (looksLikeMetricHelp || hasRichBody)
      ) {
        return true;
      }
    }

    if (!isLayered || containsTableSubtree) return false;

    const rect = element.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return false;

    const text = (element.innerText || '').trim();

    // 3) 简单气泡：叠层 + 扁宽小盒 + 文案不长（不再用「任意 role / 任意 aria-label」避免误判）
    const simpleTextBubble =
      !inTable &&
      w <= 480 &&
      h <= 220 &&
      text.length <= 280 &&
      (z >= 1 || element.hasAttribute('data-tooltip') || element.hasAttribute('data-tooltip-content'));

    // 4) 复杂说明浮层：中等面积 + 多段结构或说明类关键词
    const richPopover =
      !inTable &&
      w <= 640 &&
      h <= 480 &&
      (element.querySelectorAll('p, li').length >= 2 ||
        /learn more|了解更多|帮助|definition|metric|如何计算|指标|指標|calculated from/i.test(text));

    if (simpleTextBubble || richPopover) return true;

    // 5) 表格 DOM 内极少插入整块浮层；若为小号高 z 叠层且无 table 子树，按 hover 层排除
    if (inTable && !containsTableSubtree && w <= 480 && h <= 240 && z >= 40) {
      return true;
    }

    // 6) 单行极简气泡（固定/绝对定位、体积极小，避免误伤其它固定 UI）
    if (!inTable && isLayered && !containsTableSubtree && w <= 360 && h <= 56 && text.length <= 100) {
      return true;
    }

    return false;
  };
  
  // 检测表格元素创建或表格内容变化
  const detectTableCreation = (mutations: MutationRecord[]): boolean => {
    return mutations.some(mutation => {
      if (mutation.type !== 'childList') return false;
      
      return Array.from(mutation.addedNodes).some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        
        const element = node as HTMLElement;
        if (isTooltipElement(element)) return false;
        
        // 检测表格元素本身
        if (element.getAttribute('role') === 'table' || element.querySelector('[role="table"]')) {
          return true;
        }
        
        // 检测表格行或单元格（滚动加载时添加）
        if (element.tagName === 'SPAN' && element.hasAttribute('data-surface')) {
          let parent = element.parentElement;
          while (parent) {
            if (parent.getAttribute('role') === 'table') return true;
            parent = parent.parentElement;
          }
        }
        
        return false;
      });
    });
  };
  
  // 检测滚动变化（返回值：[hasScrollChange, hasBodyRowDataSurfaceChange]）
  const detectScrollChange = (mutations: MutationRecord[]): [boolean, boolean] => {
    let hasScrollChange = false;
    let hasBodyRowDataSurfaceChange = false;
    
    mutations.forEach(mutation => {
      if (mutation.target.nodeType !== Node.ELEMENT_NODE) return;
      
      const element = mutation.target as HTMLElement;
      if (isTooltipElement(element)) return;
      
      // 检查元素是否在表格内
      let parent = element.parentElement;
      let isInTable = false;
      while (parent) {
        if (parent.getAttribute('role') === 'table' || parent.querySelector('[role="table"]')) {
          isInTable = true;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (!isInTable) return;
      
      // 检测style属性变化（滚动条移动）
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const isHeaderRow = element.getAttribute('role') === 'row';
        if (!isHeaderRow) {
          const isScrollRelatedElement = element.classList.contains('scrollbar') ||
                                        element.classList.contains('scroll-container') ||
                                        element.style.transform !== '' ||
                                        element.style.top !== '' ||
                                        element.style.left !== '';
          if (isScrollRelatedElement) {
            hasScrollChange = true;
          }
        }
      }
      
      // 检测data-surface属性变化（表格行号变化）
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-surface') {
        const dataSurface = element.getAttribute('data-surface');
        if (dataSurface && dataSurface.includes('table_row:')) {
          const isHeaderRow = element.getAttribute('role') === 'row';
          if (!isHeaderRow) {
            hasBodyRowDataSurfaceChange = true;
            hasScrollChange = true;
          }
        }
      }
    });
    
    return [hasScrollChange, hasBodyRowDataSurfaceChange];
  };
  
  // 检测排序变化
  const detectSortChange = (): boolean => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sortSpec = urlParams.get('sort_spec');
      let currentField = null;
      let currentDirection = null;
      
      if (sortSpec) {
        const [field, direction] = sortSpec.split('~');
        currentField = field;
        currentDirection = direction;
      }
      
      console.log('当前排序信息 - field:', currentField, 'direction:', currentDirection, '上次排序:', lastSortInfo);
      
      if (currentField !== lastSortInfo.field || currentDirection !== lastSortInfo.direction) {
        lastSortInfo = { field: currentField, direction: currentDirection };
        console.log('检测到排序变化:', lastSortInfo);
        return true;
      }
    } catch (error) {
      console.error('检测排序信息错误:', error);
    }
    return false;
  };
  
  // 判断是否是滚动加载
  const isScrollLoading = (mutations: MutationRecord[]): boolean => {
    return mutations.some(mutation => {
      if (mutation.type !== 'childList') return false;
      return Array.from(mutation.addedNodes).some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const element = node as HTMLElement;
        return element.tagName === 'SPAN' && element.hasAttribute('data-surface');
      });
    });
  };
  
  // 检查日期范围是否有修改数据
  const checkDateRangeHasModifications = async (dateRange: string[]): Promise<boolean> => {
    if (dateRange.length < 2) return false;
    
    const startDate = dateRange[0];
    const endDate = dateRange[1];
    
    if (!startDate || !endDate) return false;
    
    if (startDate === endDate) {
      return await checkDateRangeForModifications(startDate);
    } else {
      return await checkDateRangeForModifications(startDate, endDate);
    }
  };
  
  // 更新DOM元素
  const applyDomUpdates = async (isScrollRelated: boolean): Promise<void> => {
    if (isScrollRelated) {
      console.log('滚动已停止，开始显示loading并执行缓存渲染');
    }
    
    createOverlay();

    // 非滚动场景（如表格初次挂载）原先 2s 过长，用户会长时间只看到 loading；缩短后仍略延迟一帧以便 Meta 表格行稳定
    const waitTime = isScrollRelated ? 250 : 400;
    setTimeout(async () => {
      const { updateDomElements } = await import('./content/reporting/domUpdater');
      await updateDomElements({ skipReorder: false });
      removeOverlay();
    }, waitTime);
  };
  
  // 处理表格变化（防抖后的实际处理逻辑）
  const handleTableChanges = async (
    hasScrollChange: boolean,
    hasBodyRowDataSurfaceChange: boolean,
    mutations: MutationRecord[]
  ): Promise<void> => {
    try {
      const isScrollLoadingFlag = isScrollLoading(mutations);
      
      if (hasScrollChange) {
        console.log('检测到报表页面表格滚动变化（滚动已停止）');
      } else if (isScrollLoadingFlag) {
        console.log('检测到报表页面表格滚动加载新行（滚动已停止）');
      } else {
        console.log('检测到报表页面表格元素被创建，可能是页面刷新');
      }
      
      const dateRange = extractDateFromPage();
      console.log('页面日期范围:', dateRange);

      // 缓存检查是异步的，先盖住表格区域，避免「原始值 → 几秒后才加上增加值」的闪烁
      createOverlay();

      const shouldUpdateDom = await checkDateRangeHasModifications(dateRange);

      if (shouldUpdateDom) {
        // 滚动相关：仍用较短 wait；滚动停止后需完整重排（appendChild+translate）否则会回到 Meta 原始顺序
        const isScrollRelated =
          hasScrollChange || hasBodyRowDataSurfaceChange || isScrollLoadingFlag;
        await applyDomUpdates(isScrollRelated);
      } else {
        console.log('不需要更新DOM元素');
        removeOverlay();
      }
    } catch (error) {
      console.error('处理表格变化错误:', error);
      removeOverlay();
    }
  };
  
  // 设置节流计时器
  const setThrottleTimer = (): void => {
    throttleTimer = window.setTimeout(() => {
      throttleTimer = null;
      console.log('节流计时器已重置');
    }, 2000);
  };
  
  // 处理排序变化
  const handleSortChange = async (): Promise<void> => {
    console.log('检测到报表页面排序变更，触发同步');
    
    const { updateDomElements } = await import('./content/reporting/domUpdater');
    createOverlay();
    
    setTimeout(async () => {
      await updateDomElements({ skipReorder: false });
      removeOverlay();
    }, 480);
  };
  
  // 使用MutationObserver来拦截页面渲染
  const observer = new MutationObserver((mutations) => {
    try {
      const hasSortChange = detectSortChange();
      const ignoreTableMutations = shouldIgnoreReportingPageObserver();

      let hasTableCreated = false;
      let hasScrollChange = false;
      let hasBodyRowDataSurfaceChange = false;
      if (!ignoreTableMutations) {
        hasTableCreated = detectTableCreation(mutations);
        [hasScrollChange, hasBodyRowDataSurfaceChange] = detectScrollChange(mutations);
      }
      
      // 处理表格创建或滚动变化
      if (hasTableCreated || hasScrollChange) {
        // 节流判断：表体行data-surface属性变化时跳过
        if (hasBodyRowDataSurfaceChange && throttleTimer !== null) {
          console.log('检测到表体行data-surface属性变化，正在节流中，跳过本次处理');
          return;
        }
        
        // 清除之前的防抖计时器
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        // 判断是否是滚动相关的变化
        const isScrollRelated = hasScrollChange || hasBodyRowDataSurfaceChange;
        const debounceDelay = isScrollRelated ? 500 : 100;
        
        debounceTimer = window.setTimeout(() => {
          handleTableChanges(hasScrollChange, hasBodyRowDataSurfaceChange, mutations);
        }, debounceDelay);
        
        // 设置节流计时器
        if (hasBodyRowDataSurfaceChange) {
          setThrottleTimer();
        }
      }
      
      // 处理排序变化
      if (hasSortChange) {
        handleSortChange();
      }
    } catch (error) {
      console.error('检测报表页面状态错误:', error);
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

// 智能检测表格加载完成并应用缓存
function waitForTableLoadAndApplyCache(): void {
  const maxRetries = 30; // 最多重试30次
  const retryDelay = 100; // 每次重试间隔100ms
  let retryCount = 0;
  let lastRowCount = -1;
  let stableCount = 0; // 连续稳定次数
  
  const checkTableLoad = async () => {
    retryCount++;
    
    try {
      // 1. 检查表格元素是否存在
      const tableElement = findTableContainer();
      if (!tableElement) {
        console.log(`表格元素不存在，重试 ${retryCount}/${maxRetries}`);
        if (retryCount < maxRetries) {
          setTimeout(checkTableLoad, retryDelay);
        } else {
          console.log('表格元素未加载，超时退出');
          removeOverlay();
        }
        return;
      }
      
      // 2 检查表格是否有数据行
      const tableRows = getTablePresentationRows(tableElement) || [];
      if (tableRows.length === 0) {
        console.log(`表格体不存在，重试 ${retryCount}/${maxRetries}`);
        if (retryCount < maxRetries) {
          setTimeout(checkTableLoad, retryDelay);
        } else {
          console.log('表格体未加载，超时退出');
          removeOverlay();
        }
        return;
      }
      
      // 3. 检查数据行数量是否稳定（连续3次相同表示数据加载完成）
      const currentRowCount = tableRows.length;
      
      if (currentRowCount === lastRowCount) {
        stableCount++;
        console.log(`数据稳定次数: ${stableCount}/3, 行数: ${currentRowCount}`);
        
        if (stableCount >= 3) {
          console.log('表格数据加载完成，应用缓存数据');
          const hasModifications = await hasCachedModifications();
          console.log(`是否有缓存修改: ${hasModifications}`);
          if (hasModifications) {
            await applyCachedModifications();
          }
          removeOverlay();
          return;
        }
      } else {
        stableCount = 0;
        lastRowCount = currentRowCount;
      }
      
      // 4. 继续重试
      if (retryCount < maxRetries) {
        setTimeout(checkTableLoad, retryDelay);
      } else {
        console.log('达到最大重试次数，应用缓存数据');
        const hasModifications = await hasCachedModifications();
        console.log(`是否有缓存修改: ${hasModifications}`);
        if (hasModifications) {
          await applyCachedModifications();
        }
        removeOverlay();
      }
    } catch (error) {
      console.error('检测表格加载状态错误:', error);
      if (retryCount < maxRetries) {
        setTimeout(checkTableLoad, retryDelay);
      } else {
        removeOverlay();
      }
    }
  };
  
  // 开始检测
  checkTableLoad();
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
          // 使用统一的缓存检查函数
          const hasModifications = await hasCachedModifications();
          if (hasModifications) {
            console.log('有缓存数据，应用修改数据');
            // 使用统一的缓存渲染函数
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
      
      // 保存旧的level用于判断是否是tab切换
      const oldLevel = lastSortInfo.level;
      let isTabChange = false;
      
      // 无论是否有排序字段，都检查是否与上次排序信息不同
      if (field !== lastSortInfo.field || direction !== lastSortInfo.direction || level !== lastSortInfo.level) {
        lastSortInfo = { field, direction, level };
        hasSortChange = true;
        console.log('检测到排序或者tab变更:', lastSortInfo);
        createOverlay();
        
        // 如果是tab切换（level变化），需要等待DOM加载完成
        if (level !== oldLevel) {
          isTabChange = true;
          console.log('检测到tab切换，开始检测DOM加载状态');
          // 使用智能检测机制等待表格数据加载完成
          waitForTableLoadAndApplyCache();
        }
      }
      
      // 如果是tab切换，跳过后续的排序变化处理，避免重复操作
      if (isTabChange) {
        return;
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
        // 使用统一的缓存检查函数
        const hasModifications = await hasCachedModifications();
        if (hasModifications) {
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
      attributeFilter: ['sorting', 'data-footer-add-value'] // 只监听特定属性变化
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
      
      // 导入报告页面模块：若有缓存修改则先显示 loading 再应用，避免刷新后先看到原始指标再跳变
      void import('./content/reporting/domUpdater').then(async ({ updateDomElements, setupScrollListener, setupSortListener }) => {
        let reportingHasModifications = false;
        try {
          const dateRange = extractDateFromPage();
          if (dateRange.length >= 2) {
            const startDate = dateRange[0];
            const endDate = dateRange[1];
            if (startDate && endDate) {
              if (startDate === endDate) {
                reportingHasModifications = await checkDateRangeForModifications(startDate);
              } else {
                reportingHasModifications = await checkDateRangeForModifications(startDate, endDate);
              }
            }
          }
          if (reportingHasModifications) {
            createOverlay();
          }
          await updateDomElements();
        } catch (e) {
          console.error('报表页初始化 DOM 更新失败:', e);
        } finally {
          removeOverlay();
        }

        setupScrollListener();
        setupSortListener();
        initReportingPageObserver();
      });
      
      // 处理报告页面的逻辑
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getReportingDataFromDom') {
          return handleReportingGetDataFromDom(sendResponse);
        } else if (message.action === 'saveReportingModifications') {
          return handleReportingRefresh(message, sendResponse);
        } else if (message.action === 'getReportingCachedData') {
          return handleReportingGetCachedData(message, sendResponse);
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

    if (window.location.href.includes('adsmanager/manage')) {
      // 初始化页面变化监听
      initPageObserver();
      
      // 设置刷新按钮点击监听
      const setupRefreshButtonListener = () => {
        const refreshButton = document.querySelector('[data-pagelet="AdsRefreshAndPublishButtons"]');
        if (refreshButton) {
          refreshButton.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // 检查点击的元素或其祖先是否有 data-pagelet="AdsRefreshAndPublishButtons"
            const isRefreshButton = target.closest('[data-pagelet="AdsRefreshAndPublishButtons"]');
            if (isRefreshButton) {
              console.log('检测到刷新按钮点击');
              // 同步设置标记，确保在合计行更新之前设置
              setRefreshButtonFlag();
            }
          });
          console.log('刷新按钮监听已设置');
        } else {
          // 如果还没找到刷新按钮，继续等待
          requestAnimationFrame(setupRefreshButtonListener);
        }
      };
      setupRefreshButtonListener();
      
      // 等待DOM加载完成后再获取缓存数据
      // 使用 requestAnimationFrame 确保DOM已渲染
      const waitForDOM = () => {
        // 检查日期范围元素是否存在
        const dateRangeElement = document.querySelector('span[data-surface="/am/table/stats_range"] div[role="presentation"]');
        if (dateRangeElement) {
          console.log('DOM已加载完成，开始获取缓存数据');
          loadCachedData();
        } else {
          console.log('等待DOM加载...');
          requestAnimationFrame(waitForDOM);
        }
      };
      
      // 先尝试立即获取，如果失败则等待
      if (document.readyState === 'complete') {
        waitForDOM();
      } else {
        // 等待页面完全加载
        window.addEventListener('load', () => {
          waitForDOM();
        });
      }
    }
  }
};
