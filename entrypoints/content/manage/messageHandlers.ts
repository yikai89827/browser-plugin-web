// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { hierarchyManager } from './hierarchy';
import { generateCacheKey, generateCacheKeyForDate, generateSortInfoKey } from './cache';
import { footerMapping } from './config';
import { getCurrentPageState, findTableContainer, getColumnIndices, getColumnIndicesSync, findInnermostElement, extractAdsFromDom } from './dom';
import { renderCachedModifications, hasCachedModifications, saveModificationsToCache } from './cacheRenderer';

/**
 * 计算合并后的合计增加值
 * @param modifications 合并后的修改数据
 * @param originalTotals 原始合计数据
 * @returns 合并后的合计数据（包含增加值）
 */
export function calculateMergedTotals(modifications: any[], originalTotals: any): any {
  if (!modifications || modifications.length === 0) {
    return originalTotals || {};
  }
  
  // 需要累加的字段列表
  const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases', 'results'];
  
  // 计算所有修改项的增加值总和
  const totalIncreases: Record<string, number> = {};
  
  for (const modification of modifications) {
    if (!modification || !modification.modifiedFields) continue;
    
    for (const [field, value] of Object.entries(modification.modifiedFields)) {
      if (numericFields.includes(field)) {
        const numValue = parseFloat(String(value)) || 0;
        totalIncreases[field] = (totalIncreases[field] || 0) + numValue;
      } else if (field.startsWith('increase_')) {
        const baseField = field.replace('increase_', '');
        if (numericFields.includes(baseField)) {
          const numValue = parseFloat(String(value)) || 0;
          totalIncreases[baseField] = (totalIncreases[baseField] || 0) + numValue;
        }
      }
    }
  }
  
  // 创建合并后的合计数据
  const mergedTotals = { ...originalTotals };
  
  // 将计算的增加值添加到合计数据中
  for (const [field, value] of Object.entries(totalIncreases)) {
    mergedTotals[`increase_${field}`] = value;
    
    // 如果原始合计中存在该字段，计算合并后的值
    // 注意：originalTotals 现在是从DOM提取的原始值，不包含之前的增加值
    if (originalTotals && originalTotals[field] !== undefined) {
      // 提取原始值（去除货币符号和逗号）
      const originalValue = parseFloat(String(originalTotals[field]).replace(/[^\d.-]/g, '')) || 0;
      
      // 计算合并后的值：原始值 + 合并后的增加值
      mergedTotals[field] = Number((originalValue + value).toFixed(2));
    }
  }
  
  // 计算合计行的单次费用字段
  // 获取合并后的已花费金额
  const totalSpend = mergedTotals.spend || (parseFloat(String(originalTotals?.spend).replace(/[^\d.-]/g, '')) || 0);
  // 获取合并后的注册次数
  const totalRegistrations = mergedTotals.registrations || (parseFloat(String(originalTotals?.registrations).replace(/[^\d.-]/g, '')) || 0);
  // 获取合并后的购买次数
  const totalPurchases = mergedTotals.purchases || (parseFloat(String(originalTotals?.purchases).replace(/[^\d.-]/g, '')) || 0);
  // 获取合并后的成效次数
  const totalResults = mergedTotals.results || (parseFloat(String(originalTotals?.results).replace(/[^\d.-]/g, '')) || 0);
  console.log('totalSpend', totalSpend);
  console.log('totalRegistrations', totalRegistrations);
  console.log('totalPurchases', totalPurchases);
  console.log('totalResults', totalResults);
  // 计算单次费用
  mergedTotals.registration_cost = totalRegistrations > 0 && totalSpend > 0 
    ? Number((totalSpend / totalRegistrations).toFixed(2)) 
    : 0;
    
  mergedTotals.purchase_cost = totalPurchases > 0 && totalSpend > 0 
    ? Number((totalSpend / totalPurchases).toFixed(2)) 
    : 0;
    
  mergedTotals.costPerResult = totalResults > 0 && totalSpend > 0 
    ? Number((totalSpend / totalResults).toFixed(2)) 
    : 0;
  
  return mergedTotals;
}

// 更新合计行数据
export async function updateFooterData(totals: any, currencySymbol: string): Promise<void> {
  if (totals) {

    // 构建合计行的字段
    const footerFields: Record<string, number> = {};
    const footerIncreaseFields: Record<string, number> = {};
    
    // 处理数值字段
    const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
    numericFields.forEach(field => {
      if (totals[field] !== undefined) {
        footerFields[field] = totals[field];
      }
      if (totals[`increase_${field}`] !== undefined) {
        footerIncreaseFields[field] = totals[`increase_${field}`];
      }
    });
    
    // 处理费用字段
    const costFields = ['registration_cost', 'purchase_cost', 'costPerResult', 'spend'];
    costFields.forEach(field => {
      if (totals[field] !== undefined) {
        // 提取数值
        const valueStr = String(totals[field]);
        const value = parseFloat(valueStr.replace(/[^\d.-]/g, '')) || 0;
        footerFields[field] = value;
      }
    });
    
    // 更新合计行
    await updateFooterRow(footerFields, footerIncreaseFields, currencySymbol);
  }
}

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { ads, DomColumnMapping, sortInfo, currencySymbol, dateRanges } = await extractAdsFromDom();
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      // 生成缓存键
      const adsKey = await generateCacheKey('ads');
      
      // 保存到缓存
      const pageState = getCurrentPageState() || {};
      const level = pageState.level || 'Campaigns';
      const cacheData = { 
        ads: ads, 
        columnMapping: DomColumnMapping,
        level,
        currencySymbol
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      console.log('已从DOM提取数据并缓存:', { ads: ads.length, level, currencySymbol });
      
      sendResponse({ 
        success: true, 
        ads: ads, 
        DomColumnMapping, 
        sortInfo,
        level: level,
        currencySymbol,
        dateRanges
      });
    } catch (error: any) {
      console.error('从DOM获取数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 查找表格容器和表体
export function findTableBody(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('刷新页面数据: 未找到表格容器');
    return null;
  }
  
  const headerRow = tableContainer.querySelector('[role="row"]');
  if (!headerRow) {
    console.warn('刷新页面数据: 未找到表头行');
    return null;
  }
  
  const tableBody = headerRow.nextElementSibling;
  if (!tableBody) {
    console.warn('刷新页面数据: 未找到表体');
    return null;
  }
  
  return tableBody as HTMLElement;
}

// 查找合计行
export function findFooterRow(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('刷新页面数据: 未找到表格容器');
    return null;
  }
  
  // 查找带有data-pagelet="FixedDataTableNew_footerRow"属性的元素
  const footerRow = tableContainer.querySelector('[data-pagelet="FixedDataTableNew_footerRow"] > span > div > div > div');
  if (!footerRow) {
    console.warn('刷新页面数据: 未找到合计行');
    return null;
  }
  
  return footerRow as HTMLElement;
}

// 从DOM提取原始合计值
export function extractFooterData(): Record<string, number> {
  const footerRow = findFooterRow();
  if (!footerRow) {
    console.warn('提取合计数据: 未找到合计行');
    return {};
  }
  
  const footerData: Record<string, number> = {};
  const cells = footerRow.children?.[1]?.children[0]?.children || [];
  
  if (!cells || cells.length === 0) {
    console.warn('提取合计数据: 未找到可滚动列部分');
    return {};
  }
  
  const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases', 'results'];
  
  for (const field of numericFields) {
    const cellnode = Array.from(cells).find(cell => (cell as HTMLElement)?.dataset?.surface?.trim()?.includes(footerMapping[field]));
    if (cellnode) {
      const valueStr = cellnode.textContent?.trim() || '';
      const displayedValue = parseFloat(valueStr.replace(/[^\d.-]/g, '')) || 0;
      
      // 检查单元格是否有 data-add-value 属性（存储了之前添加的增加值）
      const addValueAttr = (cellnode as HTMLElement)?.dataset?.addValue;
      const addValue = parseFloat(String(addValueAttr)) || 0;
      
      // 如果有增加值属性，需要减去增加值才能得到原始值
      const originalValue = displayedValue - addValue;
      
      footerData[field] = originalValue;
      console.log(`提取合计数据: ${field} = ${displayedValue} (显示值) - ${addValue} (增加值) = ${originalValue} (原始值)`);
    }
  }
  
  return footerData;
}

// 根据ID查找行
export function findRowById(rows: Array<HTMLElement>, id: string): { row: HTMLElement; fixed: HTMLElement; scrollable: HTMLElement } | null {
  console.log(`查找ID为 ${id} 的行`);
  console.log(`  → 行数量: ${rows.length}`, rows);
  
  // 获取当前页面层级
  const pageState = getCurrentPageState();
  const currentLevel = pageState.level || 'Campaigns';
  console.log(`  → 当前层级: ${currentLevel}`);
  
  // 获取列索引
  const columnIndices = getColumnIndicesSync();
  
  // 根据当前层级选择正确的ID列名
  const idColumn = {
    Ads: 'ad_id',
    Adsets: 'adset_id',
    Campaigns: 'campaign_id'
  }[currentLevel] || 'campaign_id';
  console.log(`  → 使用ID列: ${idColumn}`);
  
  for (const row of rows) {
    const children = row.children;
    // console.log(`  → 子元素数量: ${children.length}`, children);
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;
      
      if (grandchildren.length >= 2) {
        const fixed = grandchildren[0] as HTMLElement;
        const scrollable = grandchildren[1] as HTMLElement;
        
        // 计算固定列长度
        const fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
        
        // 尝试通过ID查找行
        const scrollableCells = scrollable.children[0]?.children || [];
        if (scrollableCells.length > 0) {
          const idColumnIndex = columnIndices[idColumn];
          if (idColumnIndex !== undefined) {
            // 计算滚动列的索引（减去固定列的长度）
            const scrollableColumnIndex = idColumnIndex - fixedColumnLength;
            // console.log(`  → 固定列长度: ${fixedColumnLength}, ${idColumn}列索引: ${idColumnIndex}, 滚动列索引: ${scrollableColumnIndex}`);
            if (scrollableColumnIndex >= 0 && scrollableCells[scrollableColumnIndex]) {
              const idCell = scrollableCells[scrollableColumnIndex];
              const idText = idCell?.textContent?.trim() || '';
              // console.log(`缓存数据id:${id}  → ${idColumn}单元格文本: ${idText}`);
              if (idText === id) {
                return { row, fixed, scrollable };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

// 更新单元格数据
export function updateCell(cell: Element, field: string, value: number, increaseValue: number, currencySymbol: string = '$'): void {
  // 找到最内层的DOM元素进行更新
  const innermostElement = findInnermostElement(cell);
  
  // 定义金额字段列表
  const currencyFields = ['spend', 'registration_cost', 'purchase_cost', 'costPerResult'];
  
  // 如果是金额字段，保留货币符号
  if (currencyFields.includes(field)) {
    innermostElement.textContent = currencySymbol + (value.toFixed(2)?.toLocaleString() || '');
  } else {
    innermostElement.textContent = value?.toLocaleString() || '';
  }
  // 添加 data-add-value 属性，存储增加值
  innermostElement.setAttribute('data-add-value', String(increaseValue));
}

// 更新行数据
export async function updateRowData(scrollable: HTMLElement, fixed: HTMLElement, fields: Record<string, number>, increaseFields: Record<string, number>, currencySymbol: string = '$'): Promise<void> {
  // 获取列索引
  const columnIndices = await getColumnIndices();
  
  // 计算固定列长度
  const fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
  
  // 更新行数据
  const cells = scrollable.children[0]?.children || [];
  
  for (const [field, value] of Object.entries(fields)) {
    const originalIndex = columnIndices[field];
    if (originalIndex !== undefined) {
      // 计算滚动列的索引（减去固定列的长度）
      const columnIndex = originalIndex - fixedColumnLength;
      if (columnIndex >= 0 && cells[columnIndex]) {
        const cell = cells[columnIndex];
        const increaseValue = increaseFields[field] || 0;
        updateCell(cell, field, value, increaseValue, currencySymbol);
      }
    }
  }
}

// 更新合计行数据
async function updateFooterRow(fields: Record<string, number>, increaseFields: Record<string, number>, currencySymbol: string = '$'): Promise<void> {
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
  console.log('可滚动列部分:', cells, fields, increaseFields);
  
  for (const [field, value] of Object.entries(fields)) {
    const cellnode = Array.from(cells).find(cell => (cell as HTMLElement)?.dataset?.surface?.trim()?.includes(footerMapping[field]));
    if (!cellnode) {
      console.warn(`更新合计行数据: 未找到字段 ${field} 对应的单元格`);
      continue;
    }
    if (cellnode) {
      const increaseValue = increaseFields[field] || 0;
      // 注意：value 已经是原始值 + 增加值（在 calculateMergedTotals 中计算的）
      // 不需要再加上 increaseValue，否则会加两次
      const currentValue = Number(value.toFixed(2));
      updateCell(cellnode, field, currentValue, increaseValue, currencySymbol);  
      
      // 添加 data-add-value 属性，存储增加值（日期范围内所有增加值的和）
      (cellnode as HTMLElement).dataset.addValue = String(increaseValue);
      console.log(`更新合计行数据: ${field} = ${currentValue} (原始值+增加值), data-add-value=${increaseValue}`);
    }
  }
  console.log('已更新合计行数据');
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(data: { sortInfo: any; date: string; modifications: any[]; }, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 检查当前DOM日期范围是否有缓存的增加值
      const shouldRefreshPage = await hasCachedModifications();
      if (!shouldRefreshPage) {
        console.log('不需要刷新页面数据');
        sendResponse({ success: true, message: '不需要刷新页面数据' });
        return;
      }
      
      console.log(`[${new Date().toISOString()}] 刷新页面数据:`, data);

      // 使用统一的缓存渲染函数
      const result = await renderCachedModifications();
      sendResponse(result);
    } catch (error: any) {
      console.error('刷新页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleGetCachedData(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 获取当前 tab 的缓存数据
      const adsKey = await generateCacheKey('ads');
      const modificationsKey = await generateCacheKeyForDate('ad_modifications', date);
      console.log(`从缓存中加载修改数据（增加值） 当前键值: ${modificationsKey}`);
      
      const [adsData, modifications] = await Promise.all([
        browserStorage.get(adsKey),
        browserStorage.get(modificationsKey)
      ]);
      
      let ads = adsData?.cacheData?.ads || [];
      const columnMapping = adsData?.cacheData?.columnMapping || {};
      const level = adsData?.cacheData?.level || 'Campaigns';
      const sortInfo = adsData?.sortInfo || { field: null, direction: null };
      const currencySymbol = adsData?.cacheData?.currencySymbol || '$';
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      console.log(`当前页面的广告数据: ${ads?.length || 0}`, ads, modifications);
      sendResponse({ ads, columnMapping, level, sortInfo, currencySymbol, modifications });
    } catch (error) {
      console.error('获取缓存数据错误:', error);
      sendResponse({ ads: [], columnMapping: {}, level: 'Campaigns', sortInfo: { field: null, direction: null }, currencySymbol: '$', modifications: [] });
    }
  })();
  return true;
}

// 消息处理函数 - 保存缓存数据
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any; level: string; currencySymbol: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo, level, currencySymbol, tabType } = data;
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      
      // 确保每个广告对象都有id字段
      const processedAds = ads.map((ad: any) => {
        if (!ad.id) {
          // 根据当前层级选择正确的ID
          if (level === 'Ads' && ad.ad_id) {
            ad.id = ad.ad_id;
          } else if (level === 'Adsets' && ad.adset_id) {
            ad.id = ad.adset_id;
          } else if (level === 'Campaigns' && ad.campaign_id) {
            ad.id = ad.campaign_id;
          } 
        }
        return ad;
      });
      
      const cacheData = { ads: processedAds, columnMapping, level: level || tabType, currencySymbol };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      // 检测层级关系
      if (processedAds.length > 0) {
        hierarchyManager.detectHierarchy(processedAds);
      }
      
      console.log('已保存数据到缓存:', adsKey);
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('保存缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[]; currencySymbol: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { date, modifications, currencySymbol } = data; 
  (async () => {
    try {
      // 使用统一的缓存保存函数
      const result = await saveModificationsToCache(date, modifications, currencySymbol);
      sendResponse({ ...result, isFirstSave: true });
    } catch (error: any) {
      console.error('保存修改数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取排序信息
export function handleGetSortInfo(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const sortInfoKey = await generateSortInfoKey();
      console.log(`[${new Date().toISOString()}] 获取排序信息:`, sortInfoKey);
      
      browserStorage.get(sortInfoKey).then((sortInfo) => {
        sendResponse(sortInfo);
      }).catch((error) => {
        console.error('获取排序信息错误:', error);
        sendResponse({ field: null, direction: null });
      });
    } catch (error: any) {
      console.error('获取排序信息错误:', error);
      sendResponse({ field: null, direction: null });
    }
  })();
  return true;
}
