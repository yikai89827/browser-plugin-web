// 报告页面的DOM更新模块
// 负责处理DOM元素的更新和保持修改的值

import { getReportingTableDataRows, findInnermostElement, getColumnIndicesSync, extractRowData, processNames, generateAdId } from './dom';
import { getModifiedData } from './cache';

// 更新DOM元素
export async function updateDomElements() {
  // 获取修改的数据
  const modifiedData = await getModifiedData() || {};
  console.log('更新DOM元素，修改的数据:', modifiedData);
  
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
  
  // 第二次遍历，更新所有行
  dataRows.forEach((row) => {
    // 重新提取行数据，确保ID匹配
    let rowData = extractRowData(row, getColumnIndicesSync());
    if (rowData && rowData.id) {
      // 处理名称赋值，确保行数据有完整的账户、系列、组和广告名称
      // 简单处理：如果账户名称为空，尝试从ID中提取
      if (!rowData.accountName && rowData.id) {
        const idParts = rowData.id.split('_');
        if (idParts.length >= 4) {
          rowData.accountName = idParts[0];
        }
      }
      
      // 尝试多种ID格式进行匹配
      let matchedModification = null;
      
      // 1. 直接使用rowData.id匹配（组合格式）
      if (modifiedData[rowData.id]) {
        matchedModification = modifiedData[rowData.id];
      }
      
      // 2. 如果rowData.id包含多个下划线，尝试提取ad_id进行匹配（简化格式）
      if (!matchedModification && rowData.id) {
        const idParts = rowData.id.split('_');
        if (idParts.length >= 4) {
          const adIdOnly = idParts[idParts.length - 1];
          if (adIdOnly && modifiedData[adIdOnly]) {
            matchedModification = modifiedData[adIdOnly];
          }
        }
      }
      
      if (matchedModification) {
        // 更新数据行
        updateAdRow(row, matchedModification);
      } else {
        // 对于合计行，总是计算并更新
        let summaryModification = summaryValues[rowData.id];
        
        // 账户合计行：使用账户名称匹配
        if (!summaryModification && rowData.accountName && !rowData.ad_id) {
          summaryModification = summaryValues[rowData.accountName];
        }
        
        if (summaryModification) {
          // 更新合计行
          updateAdRow(row, summaryModification);
        } else {
          // 没有修改数据，确保合计行显示为0
          const zeroModification = {
            impressions: 0,
            reach: 0,
            spend: 0,
            clicks: 0,
            registrations: 0,
            purchases: 0
          };
          updateAdRow(row, zeroModification);
        }
      }
    }
  });
}

// 计算合计行的增加值
function calculateSummaryValues(allRowData: any[], modifiedData: any): Record<string, any> {
  const summaryValues: Record<string, any> = {};
  
  // 按账户分组
  const accountGroups: Record<string, any[]> = {};
  
  allRowData.forEach(rowData => {
    if (rowData.id) {
      // 尝试多种ID格式进行匹配
      let matchedModification = null;
      
      // 1. 直接使用rowData.id匹配（组合格式）
      if (modifiedData[rowData.id]) {
        matchedModification = modifiedData[rowData.id];
      }
      
      // 2. 如果rowData.id包含多个下划线，尝试提取ad_id进行匹配（简化格式）
      if (!matchedModification && rowData.id) {
        const idParts = rowData.id.split('_');
        if (idParts.length >= 4) {
          const adIdOnly = idParts[idParts.length - 1];
          if (adIdOnly && modifiedData[adIdOnly]) {
            matchedModification = modifiedData[adIdOnly];
          }
        }
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
      rowData.campaignName === '全部' && 
      rowData.adSetName === '全部' && 
      rowData.adName === '全部'
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
    
    // 按广告系列分组
    const campaignGroups: Record<string, any[]> = {};
    accountAds.forEach(rowData => {
      const campaignKey = `${rowData.accountName}_${rowData.campaignName}`;
      if (!campaignGroups[campaignKey]) {
        campaignGroups[campaignKey] = [];
      }
      campaignGroups[campaignKey].push(rowData);
    });
    
    // 计算每个广告系列的合计
    Object.keys(campaignGroups).forEach(campaignKey => {
      const campaignAds = campaignGroups[campaignKey];
      const [accountName, campaignName] = campaignKey.split('_');
      const campaignSummary = allRowData.find(rowData => 
        rowData.accountName === accountName && 
        rowData.campaignName === campaignName && 
        rowData.adSetName === '全部' && 
        rowData.adName === '全部'
      );
      
      const campaignModifications = calculateGroupModifications(campaignAds, modifiedData);
      if (Object.keys(campaignModifications).length > 0 && campaignSummary && campaignSummary.id) {
        summaryValues[campaignSummary.id] = campaignModifications;
      }
    });
    
    // 按广告组分组
    const adsetGroups: Record<string, any[]> = {};
    accountAds.forEach(rowData => {
      const adsetKey = `${rowData.accountName}_${rowData.campaignName}_${rowData.adSetName}`;
      if (!adsetGroups[adsetKey]) {
        adsetGroups[adsetKey] = [];
      }
      adsetGroups[adsetKey].push(rowData);
    });
    
    // 计算每个广告组的合计
    Object.keys(adsetGroups).forEach(adsetKey => {
      const adsetAds = adsetGroups[adsetKey];
      const [accountName, campaignName, adSetName] = adsetKey.split('_');
      const adsetSummary = allRowData.find(rowData => 
        rowData.accountName === accountName && 
        rowData.campaignName === campaignName && 
        rowData.adSetName === adSetName && 
        rowData.adName === '全部'
      );
      
      const adsetModifications = calculateGroupModifications(adsetAds, modifiedData);
      if (Object.keys(adsetModifications).length > 0 && adsetSummary && adsetSummary.id) {
        summaryValues[adsetSummary.id] = adsetModifications;
      }
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
  // 根据数据判断行类型
  if (rowData.campaignName === '全部' && rowData.adSetName === '全部' && rowData.adName === '全部') {
    return 'account';
  } else if (rowData.adSetName === '全部' && rowData.adName === '全部') {
    return 'campaign';
  } else if (rowData.adName === '全部') {
    return 'adset';
  } else {
    return 'ad';
  }
}

// 更新广告行
export function updateAdRow(row: HTMLElement, modifications: any) {
  // 固定列数据
  const cells = row.querySelector('[role="presentation"]')?.children[0];
  if (!cells?.childNodes?.length) {
    return;
  }
  
  // 获取列索引
  const columnIndices = getColumnIndicesSync();
  
  // 获取可滚动列数据
  const scrollableColumn = cells.children[1];
  const scrollableColumnCellsArray = Array.from(scrollableColumn.children[0].children);
  
  // 遍历修改的数据
  Object.entries(modifications).forEach(([field, value]) => {
    // 确定列索引
    const columnIndex = columnIndices[field] ?? -1;
    
    if (columnIndex >= 0 && scrollableColumnCellsArray[columnIndex]) {
      const cell = scrollableColumnCellsArray[columnIndex];
      const innermostElement = findInnermostElement(cell);
      
      // 检查是否有增加值属性
      const existingIncrease = innermostElement.getAttribute('data-increase');
      
      // 获取原始值
      let originalText = innermostElement.textContent?.trim() || '';
      // 去掉数值后面的中括号和数字，如 "12[2]" → "12"
      originalText = originalText.replace(/\[\d+\]$/, '');
      let originalValue = parseNumber(originalText);
      
      // 如果有增加值属性，说明不是原始值，需要减去现有增加值
      if (existingIncrease) {
        originalValue -= Number(existingIncrease);
      }
      
      // 计算新值
      const newValue = originalValue + Number(value);
      
      // 保留千分位格式
      let formattedValue = String(newValue);
      // 检查原始文本是否包含货币符号
      if (originalText.includes('$')) {
        // 货币格式，保留两位小数并添加千分位
        formattedValue = '$' + parseFloat(newValue.toString()).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      } else if (!isNaN(newValue) && Number.isInteger(newValue)) {
        // 整数格式，添加千分位
        formattedValue = newValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      
      // 更新DOM元素
      innermostElement.textContent = formattedValue;
      
      // 添加属性，存储增加值
      innermostElement.setAttribute('data-increase', String(value));
    }
  });
}

// 解析数字
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
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
