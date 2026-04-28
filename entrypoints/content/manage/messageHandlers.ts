// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { hierarchyManager } from './hierarchy';
import { generateCacheKey, generateCacheKeyForDate, generateSortInfoKey,getMergedModificationsForDateRange, parseChineseDate } from './cache';
import { footerMapping } from './config';
import { getCurrentPageState, findTableContainer, getColumnIndices, getColumnIndicesSync, getFilteredRows, findInnermostElement, extractAdsFromDom, extractDateRange } from './dom';

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
function findTableBody(): HTMLElement | null {
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

// 计算单次注册费用 = 已花费金额 / 注册次数
// 计算单次购买费用 = 已花费金额 / 购买次数
// 计算单次成效费用 = 已花费金额 / 成效次数
function calculatePerCost(spend: number, perCount: number): number {
  if (perCount === 0 || spend <= 0) {
    return 0;
  }
  return Number((spend / perCount).toFixed(2));
}

// 检查是否需要计算单次费用
function needsCostCalculation(modifiedFields: Record<string, number>): boolean {
  return modifiedFields.spend !== undefined || 
         modifiedFields.registrations !== undefined || 
         modifiedFields.purchases !== undefined || 
         modifiedFields.results !== undefined;
}

// 计算单次费用字段
function calculateCostFields(completeData: any, increaseFields: Record<string, number>): Record<string, number> {
  const costFields: Record<string, number> = {};
  
  // 获取已花费金额（原始值 + 增加值）
  const totalSpend = (parseFloat(String(completeData.spend)) || 0) + (increaseFields.spend || 0);
  
  // 获取注册次数（原始值 + 增加值）
  const totalRegistrations = (parseFloat(String(completeData.registrations)) || 0) + (increaseFields.registrations || 0);
  
  // 获取购买次数（原始值 + 增加值）
  const totalPurchases = (parseFloat(String(completeData.purchases)) || 0) + (increaseFields.purchases || 0);
  
  // 获取成效次数（原始值 + 增加值）
  const totalResults = (parseFloat(String(completeData.results)) || 0) + (increaseFields.results || 0);
  
  // 计算单次费用
  costFields.registration_cost = calculatePerCost(totalSpend, totalRegistrations);
  costFields.purchase_cost = calculatePerCost(totalSpend, totalPurchases);
  costFields.costPerResult = calculatePerCost(totalSpend, totalResults);
  
  return costFields;
}

// 应用修改数据到表格行
async function applyModificationsToRows(
  mergedModifications: any[], 
  currentAds: any[], 
  filteredRows: Array<HTMLElement>, 
  currentLevel: string
): Promise<{ success: boolean; successCount: number; failCount: number; currency: string }> {
  let successCount = 0;
  let failCount = 0;
  let currencySymbol = '$';
  
  for (const ad of currentAds) {
    // 找到对应广告的修改项（使用合并后的修改数据）
    const modification = mergedModifications.find(mod => {
      if (!mod || !mod.completeData) return false;
      
      // 根据当前层级选择正确的ID进行匹配
      switch (currentLevel) {
        case 'Ads':
          return mod.completeData.ad_id === ad.ad_id || mod.completeData.id === ad.ad_id;
        case 'Adsets':
          return mod.completeData.adset_id === ad.adset_id || mod.completeData.id === ad.adset_id;
        case 'Campaigns':
          return mod.completeData.campaign_id === ad.campaign_id || mod.completeData.id === ad.campaign_id;
        default:
          return mod.completeData.id === ad.id;
      }
    });
    
    if (modification && modification.completeData) {
      const { completeData, modifiedFields } = modification;
      const id = completeData.id;
      // 保存货币符号
      currencySymbol = completeData.currencySymbol || '$';
      
      // 构建增加值字段
      const increaseFields: Record<string, number> = {};
      Object.keys(modifiedFields).forEach(key => {
        increaseFields[key] = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
      });
      
      // 计算单次费用字段（如果有相关字段的修改）
      const costFields = needsCostCalculation(increaseFields) ? calculateCostFields(completeData, increaseFields) : {};
      
      // 过滤出需要保存的字段，只保存 completeData 中存在的字段，且value值是相加后的结果
      const saveFields = Object.keys(modifiedFields).reduce((acc: Record<string, number>, key: string) => {
        if (completeData.hasOwnProperty(key)) {
          // 将字符串转换为数字，去除货币符号和逗号等分隔符
          const originalValue = parseFloat(String(completeData[key]).replace(/[^\d.-]/g, '')) || 0;
          const increaseValue = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
          acc[key] = Number((Number(originalValue) + Number(increaseValue)).toFixed(2));
        }
        return acc;
      }, {});
      
      // 添加计算的单次费用字段
      Object.assign(saveFields, costFields);
      
      if (!id || !saveFields || Object.keys(saveFields).length === 0) {
        console.warn('刷新页面数据: 修改项缺少id或saveFields');
        failCount++;
        continue;
      }
      
      // 查找匹配的行
      let foundRow = null;
      let lookupId = '';
      
      // 根据当前层级选择正确的ID
      switch (currentLevel) {
        case 'Ads':
          lookupId = ad.ad_id || id;
          break;
        case 'Adsets':
          lookupId = ad.adset_id || id;
          break;
        case 'Campaigns':
          lookupId = ad.campaign_id || id;
          break;
        default:
          lookupId = ad.id || id;
      }
      
      if (lookupId) {
        foundRow = findRowById(filteredRows, lookupId);
      }
      
      if (!foundRow) {
        console.warn(`刷新页面数据: 未找到匹配的行: ${lookupId}`);
        failCount++;
        continue;
      }
      
      // 更新行数据，传递货币符号和增加值字段
      await updateRowData(foundRow.scrollable, foundRow.fixed, saveFields, increaseFields, currencySymbol);
      console.log(`已刷新页面数据行: ${id}`, saveFields);
      successCount++;
    }
  }
  
  return { success: true, successCount, failCount, currency: currencySymbol };
}

// 根据ID查找行
function findRowById(rows: Array<HTMLElement>, id: string): { row: HTMLElement; fixed: HTMLElement; scrollable: HTMLElement } | null {
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
async function updateRowData(scrollable: HTMLElement, fixed: HTMLElement, fields: Record<string, number>, increaseFields: Record<string, number>, currencySymbol: string = '$'): Promise<void> {
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
// 排序缓存的广告数据根据排序字段
async function sortCacheIds(modifications: any[] = [], ads: any[] = [], sortField: string, sortDirection: string): Promise<string[]> {
    // 应用修改数据到广告数据
  if (modifications && Array.isArray(modifications) && modifications.length > 0) {
    ads = ads.map((ad: any) => {
      let updatedAd = { ...ad };
      // 确保increaseValues对象存在
      if (!updatedAd.increaseValues) {
        updatedAd.increaseValues = {};
      }
      // 查找对应的修改记录
      const modification = modifications.find(mod => {
        return mod?.completeData?.id?.toString() === ad.id || 
                mod?.completeData?.ad_id?.toString() === ad.id || 
                mod?.completeData?.adset_id?.toString() === ad.id || 
                mod?.completeData?.campaign_id?.toString() === ad.id;
      });
      
      // 应用修改值
      if (modification) {
        for (const [field, value] of Object.entries(modification.modifiedFields)) {
          updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
        }
      }
      
      return updatedAd;
    });
  }
  
  // 对广告数据进行排序
  ads.sort((a: any, b: any) => {
    // 检查排序字段是否有数值
    const originalValueA = a[sortField];
    const originalValueB = b[sortField];
    const hasValueA = originalValueA !== undefined && originalValueA !== null && originalValueA !== '—' && originalValueA !== '';
    const hasValueB = originalValueB !== undefined && originalValueB !== null && originalValueB !== '—' && originalValueB !== '';
    
    // 处理没有数值的行，永远排在有数值的行的后面
    if (!hasValueA && hasValueB) {
      return 1; // a 没有数值，b 有数值，a 排在后面
    } else if (hasValueA && !hasValueB) {
      return -1; // a 有数值，b 没有数值，a 排在前面
    } else if (!hasValueA && !hasValueB) {
      return 0; // 两者都没有数值，保持原始顺序
    }
    
    // 对有数值的行进行排序
    let valueA = 0;
    let valueB = 0;
    
    // 获取原始值
    if (a[sortField] !== undefined) {
      valueA = parseFloat(String(a[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    if (b[sortField] !== undefined) {
      valueB = parseFloat(String(b[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    
    // 加上增加值
    if (a.increaseValues && a.increaseValues[sortField]) {
      valueA += a.increaseValues[sortField];
    }
    if (b.increaseValues && b.increaseValues[sortField]) {
      valueB += b.increaseValues[sortField];
    }
    
    if (sortDirection === 'desc') {
      return valueB - valueA;
    } else {
      return valueA - valueB;
    }
  });
  
  // 获取排序后的广告id数组
  const sortedAdIds = ads.map((ad: any) => ad.id);
  return sortedAdIds;
}
// 排序表格行
export async function sortTableRows(modifications: any[] = []): Promise<void> {
  try {
    // 获取当前页面状态和排序信息
    const pageState = getCurrentPageState();
    const { field, direction } = pageState;
    
    if (!field) {
      console.log('没有排序字段，跳过排序');
      return;
    }
    
    // 找到表体
    const tableBody = findTableBody();
    if (!tableBody) {
      console.warn('排序表格行: 未找到表体');
      return;
    }
    
    // 获取tableBody中的span子元素
    const spanElements = Array.from(tableBody.children).filter((child: Element) => child.tagName === 'SPAN');
    console.log('找到的span元素数量:', spanElements.length);
    
    // 收集所有span元素及其translate值
    const spanInfoArray: Array<{ span: Element; adId: string; translateElement: Element | null; originalIndex: number }> = [];
    
    spanElements.forEach((span, index) => {
      // 获取span的adId
      const surface = span.getAttribute('data-surface') || '';
      // 修改正则表达式，确保能正确匹配 adId
      const adIdMatch = surface.match(/(?<=table_row:)(\d+)(?=unit)/);
      const adId = adIdMatch ? adIdMatch[1] : null;
      // console.log(`行 ${index} surface: ${surface}, adId: ${adId}`);
      if (adId) {
        // 找到带有translate样式的子元素（span的唯一子元素）
        let translateElement: Element | null = span.firstElementChild;
        
        spanInfoArray.push({ span, adId, translateElement, originalIndex: index });
        console.log(`行 ${index} adId: ${adId}, originalIndex: ${index}, translateElement: ${translateElement}`);
      }
    });
    
    // 获取缓存数据
    const adsKey = await generateCacheKey('ads');
    const adsData = await browserStorage.get(adsKey);
    
    let ads: any[] = [];
    if (adsData && adsData.cacheData && adsData.cacheData.ads) {
      ads = adsData.cacheData.ads;
    }
    
    // 确保所有span元素都有对应的广告数据
    const allAdIds = spanInfoArray.map(info => info.adId);
    const existingAdIds = new Set(ads.map(ad => ad.id));
    
    // 为没有缓存数据的span元素创建默认广告数据
    allAdIds.forEach(adId => {
      if (!existingAdIds.has(adId)) {
        ads.push({
          id: adId,
          increaseValues: {},
          [field]: '—' // 设置排序字段为'—'，表示没有数值
        });
      }
    });
    
    console.log('排序前的广告id数组:', JSON.stringify(ads?.map((ad: any) => ad.id)));
    // 获取排序后的广告id数组
    const sortedAdIds = await sortCacheIds(modifications, ads, field, direction as string);
    console.log('排序后的广告id数组:', JSON.stringify(sortedAdIds));
    
    // 计算基准translate值，按照行索引生成
    const baseTranslateValues: string[] = [];
    spanElements.forEach((_, index) => {
      // 每行的translate值为 0px, 46px, 92px, 138px, ...
      const translateValue = `${index * 46}px`;
      baseTranslateValues.push(translateValue);
    });
    console.log('基准translate值列表:', baseTranslateValues);
    console.log('排序后的广告id数组:', sortedAdIds);
    
    // 为每个排序后的adId分配对应的translate值
    sortedAdIds.forEach((adId, index) => {
      if (index < baseTranslateValues.length) {
        // 找到对应的span信息
        const spanInfo = spanInfoArray.find(info => info.adId === adId);
        
        if (spanInfo && spanInfo.translateElement) {
          const newTranslate = baseTranslateValues[index];
          (spanInfo.translateElement as HTMLElement).style.transform = `translate(0px, ${newTranslate})`;
          // 验证修改是否成功
          const updatedTransform = (spanInfo.translateElement as HTMLElement).style.transform;
          console.log(`更新广告行 ${adId} 的translate值为: ${newTranslate}, 更新后transform: ${updatedTransform}`);
        } else {
          console.warn(`未找到广告行 ${adId} 的translate元素`);
        }
      }
    });
    
    // 保存translate值和行id到缓存
    const translateCache = sortedAdIds.map((adId, index) => ({
      adId,
      translate: baseTranslateValues[index] || ''
    }));
    browserStorage.set('adTranslateValues', translateCache);
    console.log('已保存translate值到StorageManager:', translateCache.length, '个值');
    
    console.log('表格行排序完成');
  } catch (error) {
    console.error('排序表格行错误:', error);
  }
}

// 消息处理函数 - 刷新页面数据
// 检查当前DOM日期范围是否有缓存的增加值
async function checkDateRangeForModifications(dateString: string): Promise<boolean> {
  try {
    // 提取当前DOM的日期范围
    // 提取日期范围
    const dateRanges = extractDateRange();
    console.log('当前DOM的日期范围:', dateRanges);
    
    // 如果没有日期范围，返回false
    if (!dateRanges || dateRanges.length === 0) {
      console.log('当前DOM没有日期范围，无需处理缓存');
      return false;
    }
    // 检查当前日期是否在DOM的日期范围内
    const targetDate = new Date(dateString);
    console.log('检查日期:', targetDate, dateRanges);
    // 检查目标日期是否在范围内（包括开始和结束日期）
    
    // 解析开始日期
    const startDate = parseChineseDate(dateRanges[0]).getTime();
    
    // 解析结束日期并设置为当天的23:59:59
    const endDate = parseChineseDate(dateRanges[1]);
    endDate.setHours(23, 59, 59, 999);

    const currentDate = new Date(targetDate).getTime();
    if (startDate <= currentDate && currentDate <= endDate.getTime()) {
      return true;
    }
    
    console.log('当前日期不在DOM日期范围内，无需处理缓存');
    return false;
  } catch (error) {
    console.error('检查日期范围错误:', error);
    return false;
  }
}

export function handleRefreshPageWithData(data: { sortInfo: any; date: string; modifications: any[]; }, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 检查当前DOM日期范围是否有缓存的增加值
      const shouldRefreshPage = await checkDateRangeForModifications(data?.date || '');
      if (!shouldRefreshPage) {
        console.log('不需要刷新页面数据');
        sendResponse({ success: true, message: '不需要刷新页面数据' });
        return;
      }
      
      console.log(`[${new Date().toISOString()}] 刷新页面数据:`, data);

      // 根据日期范围获取合并后的修改数据（已按字段求和）
      const mergedModifications = await getMergedModificationsForDateRange();
      console.log('合并后的修改项:', mergedModifications);
      
      // 找到表体
      const tableBody = findTableBody();
      if (!tableBody) {
        sendResponse({ success: false, error: '未找到表格结构' });
        return;
      }
      
      // 过滤有效的行
      const filteredRows = getFilteredRows(tableBody);
      
      // 处理每个修改项
      let successCount = 0;
      let failCount = 0;
      let currencySymbol = '$';
      
      // 从DOM中提取当前数据，确保按照DOM顺序处理
      const { ads: currentAds } = await extractAdsFromDom();
      
      // 获取当前页面层级
      const pageState = getCurrentPageState();
      const currentLevel = pageState.level || 'Campaigns';
      
      // 从DOM提取原始合计值（取消缓存，每次重新计算）
      const originalFooterData = extractFooterData();
      console.log('从DOM提取的原始合计数据:', originalFooterData);
      
      // 计算合并后的合计增加值（使用原始合计值）
      const mergedTotals = calculateMergedTotals(mergedModifications, originalFooterData);
      console.log('合并后的合计数据:', mergedTotals);
      
      // 应用修改数据到表格行
      const { success: applySuccess, successCount: appliedCount, failCount: failedCount, currency: appliedCurrency } = 
        await applyModificationsToRows(mergedModifications, currentAds, filteredRows, currentLevel);
      successCount += appliedCount;
      failCount += failedCount;
      if (appliedCurrency) {
        currencySymbol = appliedCurrency;
      }
      
      // 更新合计行数据（使用合并后的合计值）
      console.log('更新合计行数据:', mergedTotals);
      await updateFooterData(mergedTotals, currencySymbol);
      
      // 对表格行进行排序（使用合并后的数据）
      await sortTableRows(mergedModifications);
      
      console.log(`刷新页面数据完成: 成功 ${successCount} 条, 失败 ${failCount} 条`);
      sendResponse({ success: true, successCount, failCount });
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

// 处理修改数据，建立层级关系
function processModifications(modifications: any[], currentLevel: string) {
  return modifications.map(item => {
    if (item && item.completeData) {
      const completeData = item.completeData;
      
      // 根据当前层级建立parentId关系
      let parentId: string | undefined;
      let itemId: string = '';
      
      // 根据当前层级选择正确的ID
      switch (currentLevel) {
        case 'Ads':
          itemId = completeData?.ad_id || completeData?.id || '';
          parentId = completeData?.adset_id || '';
          break;
        case 'Adsets':
          itemId = completeData?.adset_id || completeData?.id || '';
          parentId = completeData?.campaign_id || '';
          break;
        case 'Campaigns':
          itemId = completeData?.campaign_id || completeData?.id || '';
          break;
        default:
          itemId = completeData?.id || '';
      }
      
      return { 
        ...item, 
        level: currentLevel,
        parentId: parentId,
        id: itemId,
        campaign_id: completeData?.campaign_id || '',
        adset_id: completeData?.adset_id || '',
        ad_id: completeData?.ad_id || ''
      };
    }
    // 如果completeData为null，跳过这个修改项
    return null;
  }).filter(item => item !== null);
}

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[]; currencySymbol: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { date, modifications, currencySymbol } = data; 
  (async () => {
    try {
      // 获取当前页面状态和层级
      const pageState = getCurrentPageState() || {};
      const currentLevel = pageState.level || 'Campaigns';
      
      // 处理修改数据，建立层级关系
      const modificationsWithId = processModifications(modifications, currentLevel);
      
      const modificationsKey = await generateCacheKeyForDate('ad_modifications', date);
      const sortInfoKey = await generateSortInfoKey();
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithId),
        browserStorage.set(sortInfoKey, pageState || {})
      ]);
      
      console.log('保存修改成功，当前层级:', currentLevel);
      
      sendResponse({ success: true, isFirstSave: true });
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
