// 报告页面的DOM更新模块
// 负责处理DOM元素的更新和保持修改的值

import { getReportingTableDataRows, findInnermostElement, getColumnIndicesSync } from './dom';
import { getModifiedData } from './cache';

// 更新DOM元素
export async function updateDomElements() {
  // 获取修改的数据
  const modifiedData = await getModifiedData() || {};
  
  // 找到表格容器
  const tableContainer = document.querySelector('[role="table"]');
  if (!tableContainer) {
    return;
  }
  
  // 获取数据行
  const dataRows = getReportingTableDataRows();
  
  // 遍历数据行
  dataRows.forEach((row, index) => {
    // 提取行数据
    const rowData = extractRowData(row);
    
    // 识别行类型
    const rowType = identifyRowType(rowData);
    
    // 只处理广告行
    if (rowType === 'ad') {
      // 生成唯一标识符
      const adId = generateAdId(rowData);
      
      // 检查是否有修改的数据
      if (modifiedData[adId]) {
        // 更新DOM元素
        updateAdRow(row, modifiedData[adId]);
      }
    }
  });
}

// 提取行数据
export function extractRowData(row: HTMLElement): any {
  const data: any = {};
  
  // 固定列数据
  const cells = row.querySelector('[role="presentation"]')?.children[0];
  if (!cells?.childNodes?.length) {
    return data;
  }
  
  const fixedColumnCells = cells?.children[0];
  const fixedColumnCellsArray = Array.from(fixedColumnCells?.children[0]?.children);
  
  // 提取账户名称、广告系列名称、广告组名称和广告名称
  if (fixedColumnCellsArray.length >= 4) {
    data.accountName = fixedColumnCellsArray[0]?.textContent?.trim() || '';
    data.campaignName = fixedColumnCellsArray[1]?.textContent?.trim() || '';
    data.adSetName = fixedColumnCellsArray[2]?.textContent?.trim() || '';
    data.adName = fixedColumnCellsArray[3]?.textContent?.trim() || '';
  }
  
  return data;
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

// 生成广告唯一标识符
export function generateAdId(adData: any): string {
  const originalId = `${adData.accountName}_${adData.campaignName}_${adData.adSetName}_${adData.adName}`;
  const hash = stringToHash(originalId);
  return hashToBase62(hash);
}

// 将字符串转换为哈希值
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为 32 位整数
  }
  return Math.abs(hash);
}

// 将数字转换为 62 进制
function hashToBase62(num: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  let n = num;
  
  if (n === 0) return '0';
  
  while (n > 0) {
    result = chars[n % 62] + result;
    n = Math.floor(n / 62);
  }
  
  return result;
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
      
      // 获取原始值
      const originalText = innermostElement.textContent?.trim() || '';
      const originalValue = parseNumber(originalText);
      
      // 计算新值
      const newValue = originalValue + Number(value);
      
      // 更新DOM元素
      innermostElement.textContent = String(newValue);
      
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
