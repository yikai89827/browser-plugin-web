// 报告页面的DOM更新模块
// 负责处理DOM元素的更新和保持修改的值

import { getReportingTableDataRows, findInnermostElement, getColumnIndicesSync, extractRowData, processNames, generateAdId, getReportingTableFooter, extractDateFromPage, sortReportData, getSortConfig, getFieldValue, getRowType } from './dom';
import { getModifiedData } from './cache';

// 更新DOM元素
export async function updateDomElements() {
  // 从页面提取日期范围
  const dateRange: string[] = extractDateFromPage();
  console.log('更新DOM元素，页面日期范围:', dateRange);
  
  // 获取修改的数据（按页面日期范围）
  let modifiedData: any = {};
  if (dateRange.length >= 2) {
    const startDate = dateRange[0];
    const endDate = dateRange[1];
    
    if (startDate && endDate && startDate === endDate) {
      // 单个日期
      modifiedData = await getModifiedData(startDate) || {};
      console.log('单个日期查询，修改的数据:', modifiedData);
    } else if (startDate && endDate) {
      // 日期范围，累加范围内所有日期的修改数据
      modifiedData = await getModifiedData(startDate, endDate) || {};
      console.log('日期范围查询，累加后的修改数据:', modifiedData);
    }
  }
  console.log('更新DOM元素，修改的数据:', modifiedData);
  if (Object.keys(modifiedData).length === 0) {
    console.log('没有修改数据，无需更新DOM元素');
    return;
  }
  
  // 找到表格容器
  const tableContainer = document.querySelector('[role="table"]');
  if (!tableContainer) {
    return;
  }
  
  // 获取数据行
  const dataRows = getReportingTableDataRows();
  console.log('找到的数据行数:', dataRows.length);
  
  // 构建ID到行的映射
  let idToRowMap: Record<string, HTMLElement> = {};
  let allRowData: any[] = [];
  
  // 第一次遍历，构建映射和收集所有行数据
  dataRows.forEach((row) => {
    const rowData = extractRowData(row, getColumnIndicesSync());
    if (rowData && rowData.id) {
      idToRowMap[rowData.id] = row;
      allRowData.push(rowData);
    }
  });
  
  // 处理名称赋值，确保所有行都有完整的账户、系列、组和广告名称
  allRowData = processNames(allRowData);
  
  // 重新构建ID到行的映射，使用处理后的名称数据
  const updatedIdToRowMap: Record<string, HTMLElement> = {};
  allRowData.forEach((rowData, index) => {
    if (rowData && rowData.id) {
      // 不要重新生成ID，使用第一次提取时生成的ID
      // 这样可以确保与modifiedData中的ID匹配
      updatedIdToRowMap[rowData.id] = idToRowMap[rowData.id] || dataRows[index];
    }
  });
  idToRowMap = updatedIdToRowMap;
  
  // 计算合计行的增加值
  const summaryValues = calculateSummaryValues(allRowData, modifiedData);
  
  // 第二次遍历，只更新修改过的行和相关的合计行
  dataRows.forEach((row, index) => {
    // 使用处理后的行数据，而不是重新提取
    // 这样可以确保行数据有完整的名称信息
    const rowData = allRowData[index];
    if (rowData && rowData.id) {
      // 尝试匹配修改数据
      let matchedModification = null;
      
      // 1. 直接使用rowData.id匹配（DOM解析出的ID与缓存中的ID匹配）
      if (modifiedData[rowData.id]) {
        matchedModification = modifiedData[rowData.id];
      }
      
      // 2. 如果没有匹配，尝试使用ad_id匹配
      if (!matchedModification && rowData.ad_id && modifiedData[rowData.ad_id]) {
        matchedModification = modifiedData[rowData.ad_id];
      }
      
      // 3. 检查是否为合计行，使用ID匹配
      if (!matchedModification && summaryValues[rowData.id]) {
        matchedModification = summaryValues[rowData.id];
      }
      
      // 4. 最后尝试使用账户名称匹配账户合计行
      if (!matchedModification && rowData.accountName && !rowData.ad_id && !rowData.adset_id && !rowData.campaign_id) {
        matchedModification = summaryValues[rowData.accountName];
      }
      
      if (matchedModification) {
        // 更新行（使用列索引确定列）
        updateAdRow(row, matchedModification);
      }
      // 对于没有修改的行，不做处理
    }
  });
  
  // 更新表格底部合计行
  updateFooterRows(modifiedData, summaryValues);

  // 根据增加了值后的数据重新排序DOM行
  reorderDomRowsBySortValue(dataRows, allRowData, modifiedData);
}

// 计算合计行的增加值
function calculateSummaryValues(allRowData: any[], modifiedData: any): Record<string, any> {
  const summaryValues: Record<string, any> = {};
  
  // 按账户分组
  const accountGroups: Record<string, any[]> = {};
  
  allRowData.forEach(rowData => {
    // 只处理广告统计行（有 ad_id 的）
    if (rowData.ad_id && rowData.ad_id.trim() !== '') {
      // 简化匹配逻辑：使用DOM解析出的ID与缓存中的ID匹配
      let matchedModification = null;
      
      // 1. 优先使用rowData.id匹配（DOM解析出的ID）
      if (modifiedData[rowData.id]) {
        matchedModification = modifiedData[rowData.id];
      }
      
      // 2. 如果没有匹配，使用ad_id匹配
      if (!matchedModification && rowData.ad_id && modifiedData[rowData.ad_id]) {
        matchedModification = modifiedData[rowData.ad_id];
      }
      
      if (matchedModification) {
        const accountKey = rowData.accountName;
        if (!accountGroups[accountKey]) {
          accountGroups[accountKey] = [];
        }
        accountGroups[accountKey].push({ ...rowData, modification: matchedModification });
      }
    }
  });
  
  // 计算每个账户的合计
  Object.keys(accountGroups).forEach(accountName => {
    const accountAds = accountGroups[accountName];
    const accountSummary = allRowData.find(rowData => 
      rowData.accountName === accountName && 
      !rowData.ad_id && 
      !rowData.adset_id && 
      !rowData.campaign_id
    );
    
    // 计算账户合计的增加值
    const accountModifications = calculateGroupModifications(accountAds, modifiedData);
    if (Object.keys(accountModifications).length > 0) {
      // 使用账户名称作为键，确保账户合计行能匹配
      summaryValues[accountName] = accountModifications;
      // 同时使用账户合计行的ID作为键
      if (accountSummary && accountSummary.id) {
        summaryValues[accountSummary.id] = accountModifications;
      }
    }
    
    // 按广告系列分组（使用 campaign_id）
    const campaignGroups: Record<string, any[]> = {};
    accountAds.forEach(rowData => {
      const campaign_id = rowData.campaign_id;
      if (campaign_id) {
        if (!campaignGroups[campaign_id]) {
          campaignGroups[campaign_id] = [];
        }
        campaignGroups[campaign_id].push(rowData);
      }
    });
    
    // 计算每个广告系列的合计
    Object.keys(campaignGroups).forEach(campaign_id => {
      const campaignAds = campaignGroups[campaign_id];
      const campaignSummary = allRowData.find(rowData => 
        rowData.campaign_id === campaign_id && 
        !rowData.ad_id && 
        !rowData.adset_id
      );
      
      const campaignModifications = calculateGroupModifications(campaignAds, modifiedData);
      if (Object.keys(campaignModifications).length > 0 && campaignSummary && campaignSummary.id) {
        summaryValues[campaignSummary.id] = campaignModifications;
      }
      
      // 按广告组分组（使用 adset_id）- 移到广告系列循环内部
      const adsetGroups: Record<string, any[]> = {};
      campaignAds.forEach(rowData => {
        const adset_id = rowData.adset_id;
        if (adset_id) {
          if (!adsetGroups[adset_id]) {
            adsetGroups[adset_id] = [];
          }
          adsetGroups[adset_id].push(rowData);
        }
      });
      
      // 计算每个广告组的合计 - 移到广告系列循环内部
      Object.keys(adsetGroups).forEach(adset_id => {
        const adsetAds = adsetGroups[adset_id];
        const adsetSummary = allRowData.find(rowData => 
          rowData.adset_id === adset_id && 
          !rowData.ad_id
        );
        
        const adsetModifications = calculateGroupModifications(adsetAds, modifiedData);
        if (Object.keys(adsetModifications).length > 0 && adsetSummary && adsetSummary.id) {
          summaryValues[adsetSummary.id] = adsetModifications;
        }
      });
    });
  });
  
  return summaryValues;
}

// 计算一组广告的合计修改值
function calculateGroupModifications(ads: any[], modifiedData: any): any {
  const modifications: any = {};
  
  ads.forEach(ad => {
    if (ad.modification) {
      // 使用已匹配的修改数据
      const adModifications = ad.modification;
      Object.entries(adModifications).forEach(([field, value]) => {
        if (!modifications[field]) {
          modifications[field] = 0;
        }
        modifications[field] += Number(value);
      });
    } else if (ad.id && modifiedData[ad.id]) {
      // 回退到直接匹配
      const adModifications = modifiedData[ad.id];
      Object.entries(adModifications).forEach(([field, value]) => {
        if (!modifications[field]) {
          modifications[field] = 0;
        }
        modifications[field] += Number(value);
      });
    }
  });
  
  return modifications;
}

// 识别行类型
export function identifyRowType(rowData: any): string {
  // 根据ID字段判断行类型
  if (rowData.ad_id && rowData.ad_id.trim() !== '') {
    return 'ad';
  }
  
  if (rowData.adset_id && rowData.adset_id.trim() !== '') {
    return 'adset';
  }
  
  if (rowData.campaign_id && rowData.campaign_id.trim() !== '') {
    return 'campaign';
  }
  
  return 'account';
}

// 更新广告行
export function updateAdRow(row: Element, modifications: any) {
  const cells = row.querySelector('[role="presentation"]')?.children[0];
  if (!cells?.childNodes?.length) {
    return;
  }
  
  const scrollableColumn = cells.children[1];
  const scrollableColumnCellsArray = Array.from(scrollableColumn.children[0].children);
  
  applyModificationsToCells(scrollableColumnCellsArray, modifications);
}

// 应用修改到单元格数组
function applyModificationsToCells(cellsArray: Element[], modifications: any) {
  const columnIndices = getColumnIndicesSync();

  Object.entries(modifications).forEach(([field, value]) => {
    const columnIndex = columnIndices[field] ?? -1;
    
    if (columnIndex >= 0 && cellsArray[columnIndex]) {
      const cell = cellsArray[columnIndex];
      const innermostElement = findInnermostElement(cell);
      
      const existingIncrease = innermostElement.getAttribute('data-increase');
      
      let originalText = innermostElement.textContent?.trim() || '';
      originalText = originalText.replace(/\[\d+\]$/, '');
      let originalValue = parseNumber(originalText);
      
      if (existingIncrease) {
        const existingIncreaseValue = Number(existingIncrease);
        originalValue = originalValue - existingIncreaseValue;
      }
      
      const newValue = originalValue + Number(value);
      
      let formattedValue = String(newValue);
      if (originalText.includes('$')) {
        formattedValue = '$' + parseFloat(newValue.toString()).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      } else if (!isNaN(newValue) && Number.isInteger(newValue)) {
        formattedValue = newValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      
      innermostElement.textContent = formattedValue;
      
      if (Number(value) !== 0) {
        innermostElement.setAttribute('data-increase', String(value));
      } else {
        innermostElement.removeAttribute('data-increase');
      }
    }
  });
}

// 解析数字
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// 更新表格底部合计行
function updateFooterRows(modifiedData: any, summaryValues: Record<string, any>) {
  // 获取表格底部行
  const footerRows = getReportingTableFooter();
  console.log('表格底部行:', footerRows);
  console.log('%c数据修改缓存:', 'color: green;background-color: #e6f7ff;', modifiedData);
  console.log('%c账户合计值:', 'color: green;background-color: #e6f7ff;', summaryValues );
  if (footerRows.length === 0) {
    return;
  }
  
  // 计算所有账户合计增加值的总和
  const totalModifications = calculateTotalModifications(modifiedData);
  console.log('%c底部合计行修改值:', 'color: green;background-color: #e6f7ff;', totalModifications);
  
  const footerCellsArray = Array.from(footerRows);
  applyModificationsToCells(footerCellsArray, totalModifications);
}

// 计算所有账户合计增加值的总和
function calculateTotalModifications(modifiedData: any): any {
  const total: any = {
    impressions: 0,
    reach: 0,
    spend: 0,
    clicks: 0,
    registrations: 0,
    purchases: 0
  };
  
  // 遍历所有修改的数据，只计算广告行的修改，不包括合计行
  // 广告行的ID格式为 `${account_id}_${campaign_id}_${adset_id}_${ad_id}`，包含多个下划线
  // 合计行的ID通常只是单个ID（account_id/campaign_id/adset_id），不包含下划线或只有一个下划线
  Object.entries(modifiedData).forEach(([adId, modifications]) => {
    // 只有广告行的ID包含多个下划线（格式为 account_campaign_adset_ad）
    // 合计行的ID是单个值，不包含下划线或下划线数量少于3个
    const underscoreCount = (adId.match(/_/g) || []).length;
    if (underscoreCount >= 3) {
      // 这是广告统计行，累加其增加值
      Object.entries(modifications as Record<string, unknown>).forEach(([field, value]) => {
        if (total[field] !== undefined) {
          total[field] += Number(value) || 0;
        }
      });
    }
    // 合计行的修改值不应该被计入底部总计
  });
  
  return total;
}

// 监听表格滚动
export function setupScrollListener() {
  const tableContainer = document.querySelector('[role="table"]');
  if (tableContainer) {
    tableContainer.addEventListener('scroll', async () => {
      await updateDomElements();
    });
  }
}

// 监听排序变动
export function setupSortListener() {
  const tableHeaders = document.querySelectorAll('[role="columnheader"]');
  tableHeaders.forEach(header => {
    header.addEventListener('click', async () => {
      // 延迟执行，等待DOM更新
      setTimeout(async () => {
        await updateDomElements();
      }, 100);
    });
  });
}

// 根据排序值重新排序DOM行
function reorderDomRowsBySortValue(dataRows: HTMLElement[], allRowData: any[], modifiedData: any) {
  const sortConfig = getSortConfig();
  const sortField = sortConfig.field;
  const sortDirection = sortConfig.direction;

  // 为每行数据计算增加了值后的排序值
  const rowsWithSortValue = allRowData.map((rowData, index) => {
    let sortValue = getFieldValue(rowData, sortField);

    // 如果有修改数据，加上增加值
    if (rowData.ad_id && modifiedData[rowData.id]) {
      const modification = modifiedData[rowData.id];
      if (modification && modification[sortField]) {
        sortValue += Number(modification[sortField]);
      }
    }

    return {
      rowData,
      rowElement: dataRows[index],
      sortValue,
      index
    };
  });

  // 排序
  rowsWithSortValue.sort((a, b) => {
    // 首先按账户ID排序
    const accountCompare = (a.rowData.account_id || '').localeCompare(b.rowData.account_id || '');
    if (accountCompare !== 0) return accountCompare;

    // 按campaign_id排序
    const campaignCompare = (a.rowData.campaign_id || '').localeCompare(b.rowData.campaign_id || '');
    if (campaignCompare !== 0) return campaignCompare;

    // 按adset_id排序
    const adsetCompare = (a.rowData.adset_id || '').localeCompare(b.rowData.adset_id || '');
    if (adsetCompare !== 0) return adsetCompare;

    // 按行类型排序（合计行在前）
    const typeA = getRowType(a.rowData);
    const typeB = getRowType(b.rowData);
    const typePriority: Record<string, number> = { account: 0, campaign: 1, adset: 2, ad: 3 };
    const typeCompare = typePriority[typeA] - typePriority[typeB];
    if (typeCompare !== 0) return typeCompare;

    // 最后按排序值排序
    if (sortDirection === 'desc') {
      return b.sortValue - a.sortValue;
    }
    return a.sortValue - b.sortValue;
  });

  // 获取表格tbody
  const tableBody = document.querySelector('[role="table"] > div[aria-label]');
  if (!tableBody) return;

  // 重新排列DOM元素
  rowsWithSortValue.forEach((item, newIndex) => {
    if (item.rowElement && item.rowElement.parentNode === tableBody) {
      tableBody.appendChild(item.rowElement);
    }
  });
}
