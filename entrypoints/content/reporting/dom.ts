import { fieldMappingConfig } from './config';
import { getModifiedData } from './cache';
// 报告页面的DOM操作模块
// 负责处理报表页面的DOM元素查找和操作

// 找到表格容器
export function findTableContainer(): HTMLElement | null {
  const element = document.querySelector('[role="table"]');
  return element as HTMLElement || null;
}

// 解析中文日期格式 "2026年3月1日" 为 "YYYY-MM-DD"
function parseChineseDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  // 匹配 "2026年3月1日" 或 "2026年03月01日"
  const match = trimmed.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const year = match[1];
    const month = String(match[2]).padStart(2, '0');
    const day = String(match[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

// 从页面提取日期（支持单个日期或日期范围）
export function extractDateFromPage(): string[] {
  try {
    // 查找日期范围元素
    const dateRangeElements: any = document.querySelectorAll('#PNG_EXPORT div[role="button"] > span > div > div > div[role="presentation"]');
    const rangeElement: any = Array.from(dateRangeElements)?.find((element: any) => ['年','月','日'].every((item: string) => element?.nextElementSibling?.textContent?.trim()?.includes(item)));
    if (!rangeElement) {
      console.log('未找到日期范围元素');
      return [];
    }
    
    // 处理多种可能的分隔符：长破折号(–)、短破折号(-)、中文破折号(—)
    const textContent = rangeElement?.nextElementSibling?.textContent?.trim() || '';
    const dateRanges: string[] = textContent.split(/[–\-—]/) || [];
    if (dateRanges.length > 0) {
      console.log('找到日期范围:', dateRanges);
    }
    
    // 解析中文日期格式为标准日期格式
    const parsedDates = dateRanges.map(date => parseChineseDate(date)).filter(date => date);
    
    if (parsedDates.length === 1) {
      return [parsedDates[0], parsedDates[0]];
    }
    return parsedDates;
    
  } catch (error) {
    console.error('提取日期范围错误:', error);
    return [];
  }
}

// 获取表格标题
export function getReportingTableHeader(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    return null;
  }
  // 报告页面的表格标题查找逻辑
  const element = tableContainer.children[0]?.children[1];
  return element as HTMLElement || null;
}

// 获取列索引
export function getColumnIndicesSync(): any {
  const headerElement = getReportingTableHeader();
  if (!headerElement) {
    return {};
  }
  
  const columnIndices: Record<string, number> = {};
  const headerCells = Array.from(headerElement.children);
  const fixedCells:any = headerCells[0]?.firstChild?.childNodes;  const scrollableCells:any = headerCells[1]?.firstChild?.childNodes;
  // console.log('固定列:', fixedCells?.length);
  // console.log('可滚动列:', scrollableCells?.length);
  if (!scrollableCells) {
    return {};
  }
  const scrollableCellsArray = Array.from(scrollableCells);
   scrollableCellsArray.forEach((cell: any, index: number) => {
    const cellText = cell.textContent?.trim() || '';
    const lowerText = cellText.toLowerCase();
    const text = lowerText.replace('打开列内操作菜单', '');
    
    // 获取data-surface属性，可能包含字段信息
    const dataSurface = cell.getAttribute?.('data-surface') || '';
    // const dataId = cell.getAttribute?.('data-id') || '';
    
    // 调试：输出每个表头单元格的文本
    // console.log(`表头单元格[${index}]: "${cellText}" (小写: "${text}") data-surface: "${dataSurface}" data-id: "${dataId}"`);
    
    // 首先尝试通过data-surface属性匹配
    if (dataSurface.includes('account_id')) {
      columnIndices['account_id'] = index;
      // console.log(`通过data-surface匹配到 account_id 在索引 ${index}`);
      return;
    }
    if (dataSurface.includes('campaign_id')) {
      columnIndices['campaign_id'] = index;
      // console.log(`通过data-surface匹配到 campaign_id 在索引 ${index}`);
      return;
    }
    if (dataSurface.includes('adset_id')) {
      columnIndices['adset_id'] = index;
      // console.log(`通过data-surface匹配到 adset_id 在索引 ${index}`);
      return;
    }
    if (dataSurface.includes('ad_id')) {
      columnIndices['ad_id'] = index;
      // console.log(`通过data-surface匹配到 ad_id 在索引 ${index}`);
      return;
    }
    
    // 然后尝试通过文本匹配
    for (const { field, labels } of fieldMappingConfig) {
      if (labels.some(label => text.includes(label.toLowerCase()))) {
        // 确保字段名与extractRowData中使用的一致
        let mappedField = field;
        // 特殊处理ID字段，确保与extractRowData中使用的字段名一致
        if (field === 'account_id') {
          mappedField = 'account_id';
        } else if (field === 'campaign_id') {
          mappedField = 'campaign_id';
        } else if (field === 'adset_id') {
          mappedField = 'adset_id';
        } else if (field === 'ad_id') {
          mappedField = 'ad_id';
        }
        columnIndices[mappedField] = index;
        // console.log(`匹配到字段: ${field} -> ${mappedField} 在索引 ${index}`);
        break;
      }
    }
  });
  
  // console.log('生成的列映射:', columnIndices);
  return columnIndices;
}

// 获取表格数据行
export function getReportingTableDataRows(): HTMLElement[] {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    return [];
  }
  const element = tableContainer.children[0]?.children[2]?.children;
  if (!element) {
    return [];
  }
  console.log('表格数据行:', element);
  // 报告页面的表格数据行查找逻辑
  return Array.from(element) as HTMLElement[];
}

// 获取表格底部
export function getReportingTableFooter(): HTMLElement[] {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    return [];
  }
  const element = tableContainer.children[0]?.children[3]?.querySelector('[role="presentation"]')?.children[0]?.children[1]?.children[0]?.children;
  if (!element) {
    return [];
  }
  console.log('表格底部:', element);
  return Array.from(element) as HTMLElement[];
}


// 从文本中提取货币符号
function extractCurrencySymbolFromText(text: string): string {
  try {
    if (text) {
      // 尝试从文本中提取货币符号
      // 匹配开头的非数字、非逗号字符
      const currencyMatch = text.match(/^([^\d,]+)/);
      if (currencyMatch && currencyMatch[1].trim()) {
        return currencyMatch[1].trim();
      }
      
      // 特殊处理美元符号（可能在数字前面）
      const dollarMatch = text.match(/(\$)/);
      if (dollarMatch) {
        return '$';
      }
    }
    return '$'; // 默认货币符号
  } catch (error) {
    console.error('从文本提取货币符号错误:', error);
    return '$'; // 默认货币符号
  }
}

// 将文本值转换为数字（处理货币符号、千分位分隔符、空值等）
function parseValueToNumber(text: string): number {
  try {
    if (!text) return 0;
    const trimmed = text.trim();
    
    // 处理空值表示
    if (trimmed === '' || trimmed === '-' || trimmed === '—' || trimmed === '--' || trimmed === '---') {
      return 0;
    }
    
    // 去掉货币符号和千分位分隔符
    let cleaned = trimmed;
    // 去掉所有非数字、非小数点、非负号的字符
    cleaned = cleaned.replace(/[^\d.\-]/g, '');
    
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  } catch (error) {
    console.error('解析数值错误:', error);
    return 0;
  }
}

// 从DOM提取数据
export async function extractDataFromDom(): Promise<{ data: any[], columnMapping: any, currencySymbol: string }> {
  try {
    const data = [];
    const columnMapping = getColumnIndicesSync();
    let currencySymbol = '$'; // 默认货币符号
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('extractDataFromDom: 未找到表格容器');
      return { data: [], columnMapping: {}, currencySymbol };
    }
    
    // 等待表格数据完全渲染，最多等待500毫秒
    let dataRows: HTMLElement[] = getReportingTableDataRows();
    
    console.log('找到的报表数据行数:', dataRows.length);
    console.log('列映射:', columnMapping);
    console.log('找到的报表数据:', dataRows);
    
    // 提取第一行数据以获取货币符号
    if (dataRows.length > 0) {
      const firstRow = dataRows[0];
      const cells = Array.from(firstRow.children);
      
      // 检查费用相关字段
      const columnIndex = columnMapping['spend'];
      if (columnIndex !== undefined && cells[columnIndex]) {
        const cellText = cells[columnIndex].textContent?.trim() || '';
        currencySymbol = extractCurrencySymbolFromText(cellText);
        console.log('从字段spend提取的货币符号:', currencySymbol);
      }
    }
    
    // 遍历数据行，提取报表数据
    for (const row of dataRows) {
      const rowData = extractRowData(row, columnMapping);
      if (rowData) {
        data.push(rowData);
      }
    }
    
    // 处理名称赋值，确保所有行都有完整的账户、系列、组和广告名称
    const processedData = processNames(data);

    // 从缓存获取增加值数据，从DOM值中减去增加值得到真正的原始值
    const dateRange = extractDateFromPage();
    if (dateRange.length >= 2) {
      const startDate = dateRange[0];
      const endDate = dateRange[1];
      let modifiedData: any = {};

      if (startDate && endDate) {
        if (startDate === endDate) {
          modifiedData = await getModifiedData(startDate) || {};
        } else {
          modifiedData = await getModifiedData(startDate, endDate) || {};
        }
      }

      if (Object.keys(modifiedData).length > 0) {
        console.log('提取DOM数据时减去增加值, modifiedData:', modifiedData);
        console.log('缓存中的ID列表:', Object.keys(modifiedData));
        
        processedData.forEach(rowData => {
          console.log('处理行 - id:', rowData.id, 'ad_id:', rowData.ad_id, 'isAdRow:', !!(rowData.ad_id && rowData.ad_id.trim() !== ''));
          console.log('行的四个ID字段 - account_id:', rowData.account_id, 'campaign_id:', rowData.campaign_id, 'adset_id:', rowData.adset_id, 'ad_id:', rowData.ad_id);
          
          // 尝试多种方式匹配缓存数据
          let matchedModification = null;
          let matchedId = null;
          
          // 1. 首先尝试使用完整的组合ID匹配
          if (rowData.id && modifiedData[rowData.id]) {
            matchedModification = modifiedData[rowData.id];
            matchedId = rowData.id;
            console.log('通过完整ID匹配成功:', matchedId);
          }
          
          // 2. 如果完整ID不匹配，尝试使用ad_id匹配
          if (!matchedModification && rowData.ad_id && modifiedData[rowData.ad_id]) {
            matchedModification = modifiedData[rowData.ad_id];
            matchedId = rowData.ad_id;
            console.log('通过ad_id匹配成功:', matchedId);
          }
          
          // 3. 如果ad_id也不匹配，尝试使用账户ID匹配（针对账户合计行）
          if (!matchedModification && !rowData.ad_id && !rowData.adset_id && !rowData.campaign_id && rowData.account_id && modifiedData[rowData.account_id]) {
            matchedModification = modifiedData[rowData.account_id];
            matchedId = rowData.account_id;
            console.log('通过account_id匹配成功:', matchedId);
          }
          
          // 4. 如果以上都不匹配，尝试检查缓存中是否有包含ad_id的键
          if (!matchedModification && rowData.ad_id) {
            const cachedKeyWithAdId = Object.keys(modifiedData).find(key => key.includes(rowData.ad_id));
            if (cachedKeyWithAdId) {
              matchedModification = modifiedData[cachedKeyWithAdId];
              matchedId = cachedKeyWithAdId;
              console.log(`通过包含ad_id的键匹配成功: ${rowData.ad_id} -> ${cachedKeyWithAdId}`);
            }
          }
          
          if (matchedModification) {
            console.log('找到匹配的修改数据:', rowData.id, matchedModification);
            // 注意：增加值已在 extractRowData 函数中直接从DOM扣除，此处不再重复扣除
          } else {
            console.log('未找到匹配的修改数据:', rowData.id);
          }
        });
      }
    }

    console.log('提取的报表数据（原始值）:', processedData);
    return { data: processedData, columnMapping, currencySymbol };
  } catch (error) {
    console.error('提取报表数据错误:', error);
    return { data: [], columnMapping: {}, currencySymbol: '$' };
  }
}

// 生成广告唯一标识符（基于名称的备用方案）
export function generateAdId(adData: any): string {
  const originalId = `${adData.accountName}_${adData.campaignName}_${adData.adSetName}_${adData.adName}`;
  const charCodeString = stringToCharCodeString(originalId);
  const num = charCodeStringToNumber(charCodeString);
  return numberToBase62(num);
}

// 生成广告统计行的ID（使用四个ID字段组合）
export function generateAdRowId(account_id: string, campaign_id: string, adset_id: string, ad_id: string): string {
  return `${account_id || 'NA'}_${campaign_id || 'NA'}_${adset_id || 'NA'}_${ad_id}`;
}

// 将字符串转换为字符编码字符串
function stringToCharCodeString(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    // 确保每个字符编码占3位，不足前面补0
    result += charCode.toString().padStart(3, '0');
  }
  return result;
}

// 将字符编码字符串转换为数字
function charCodeStringToNumber(charCodeString: string): number {
  // 处理长字符串，避免parseInt返回NaN
  const maxLength = 15; // 限制长度，确保能转换为数字
  const truncated = charCodeString.substring(0, maxLength);
  const num = parseInt(truncated, 10);
  return isNaN(num) ? 0 : num;
}

// 将数字转换为 62 进制
function numberToBase62(num: number): string {
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

// 从行中提取数据
export function extractRowData(row: HTMLElement, columnMapping: Record<string, number>): any {
  try {
    const rowData: any = {};
    
    // console.log('处理行:', row);
    // console.log('列映射:', columnMapping);
    // 固定列数据
    const cells = row.querySelector('[role="presentation"]')?.children[0];
    // 提取账户名称、广告系列名称、广告组名称和广告名称
    if (!cells?.childNodes?.length) {
      console.error('固定列单元格未找到');
      return null;
    }
    const fixedColumnCells = cells?.children[0];
    const fixedColumnCellsArray = Array.from(fixedColumnCells?.children[0]?.children);
    if (fixedColumnCellsArray.length >= 4) {
      rowData.accountName = fixedColumnCellsArray[0]?.textContent?.trim() || '';
      rowData.campaignName = fixedColumnCellsArray[1]?.textContent?.trim() || '';
      rowData.adSetName = fixedColumnCellsArray[2]?.textContent?.trim() || '';
      rowData.adName = fixedColumnCellsArray[3]?.textContent?.trim() || '';
      // console.log('提取的名称数据:', rowData.accountName, rowData.campaignName, rowData.adSetName, rowData.adName);
    }
    
    // 可滚动列数据
    const scrollableColumn = cells.children[1];
    const scrollableColumnCellsArray = Array.from(scrollableColumn.children[0].children);
    // console.log('可滚动列单元格数量:', scrollableColumnCellsArray.length);
    
    // 提取数值数据
    for (const [field, columnIndex] of Object.entries(columnMapping)) {
      if (columnIndex >= 0 && scrollableColumnCellsArray[columnIndex]) {
        const cellElement = scrollableColumnCellsArray[columnIndex];
        let cellText = cellElement.textContent?.trim() || '';
        
        // 获取最内层DOM的 data-increase 属性值
        const innermostElement = findInnermostElement(cellElement);
        const dataIncrease = innermostElement.getAttribute('data-increase');
        const increaseValue = dataIncrease ? Number(dataIncrease) : 0;
        
        // ID字段保持为字符串，数值字段转换为数字并扣除增加值
        if (['account_id', 'campaign_id', 'adset_id', 'ad_id'].includes(field)) {
          rowData[field] = cellText;
        } else {
          const rawValue = parseValueToNumber(cellText);
          let appliedIncrease = increaseValue;
          // 虚拟列表复用单元格时，data-increase 常来自上一行；文本已是当前行的展示值，再减旧增量会得到错误基数（负展示次数等）
          if (appliedIncrease !== 0 && Number.isFinite(appliedIncrease) && Number.isFinite(rawValue)) {
            if (rawValue >= 0 && (appliedIncrease > rawValue || rawValue - appliedIncrease < 0)) {
              appliedIncrease = 0;
            }
          }
          rowData[field] = rawValue - appliedIncrease;
          if (increaseValue !== 0 && appliedIncrease === 0 && innermostElement?.removeAttribute) {
            innermostElement.removeAttribute('data-increase');
          }
        }
        // console.log('提取的字段数据:', field, columnIndex, cellText, rowData[field]);
      }
    }
    
    // 确保所有名称字段都有值
    rowData.accountName = rowData.accountName || '';
    rowData.campaignName = rowData.campaignName || '';
    rowData.adSetName = rowData.adSetName || '';
    rowData.adName = rowData.adName || '';
    
    // 提取ID字段（确保始终为字符串类型）
    rowData.account_id = String(rowData.account_id || '');
    rowData.campaign_id = String(rowData.campaign_id || '');
    rowData.adset_id = String(rowData.adset_id || '');
    rowData.ad_id = String(rowData.ad_id || '');
    
    // 处理破折号表示空值的情况，同时去除千分位分隔符
    const normalizeId = (id: string): string => {
      const trimmed = id.trim();
      if (trimmed === '' || trimmed === '-' || trimmed === '—') {
        return '';
      }
      // 去除千分位分隔符（如 "20,244,868" -> "20244868"）
      const cleanedId = trimmed.replace(/,/g, '');
      return cleanedId;
    };
    
    rowData.account_id = normalizeId(rowData.account_id);
    rowData.campaign_id = normalizeId(rowData.campaign_id);
    rowData.adset_id = normalizeId(rowData.adset_id);
    rowData.ad_id = normalizeId(rowData.ad_id);
    
    // 生成ID：数据行使用多个ID字段的组合，合计行使用各自的ID
    if (rowData.ad_id) {
      // 数据行：使用广告ID、广告组ID、广告系列ID和账户ID的组合作为唯一标识
      rowData.id = generateAdRowId(rowData.account_id, rowData.campaign_id, rowData.adset_id, rowData.ad_id);
    } else if (rowData.adset_id) {
      // 广告组合计行：使用广告组ID作为唯一标识
      rowData.id = rowData.adset_id;
    } else if (rowData.campaign_id) {
      // 广告系列合计行：使用广告系列ID作为唯一标识
      rowData.id = rowData.campaign_id;
    } else if (rowData.account_id) {
      // 账户合计行：使用账户ID作为唯一标识
      rowData.id = rowData.account_id;
    } else {
      // 其他情况：使用生成的ID
      rowData.id = generateAdId(rowData);
    }
    
    // console.log('提取的行数据:', rowData);
    return rowData;
  } catch (error) {
    console.error('从行提取数据错误:', error);
    return null;
  }
}

// 处理名称赋值，确保所有行都有完整的账户、系列、组和广告名称
// 从URL参数获取排序配置
export function getSortConfig(): { field: string; direction: 'asc' | 'desc' } {
  const urlParams = new URLSearchParams(window.location.search);
  const sortSpec = urlParams.get('sort_spec');
  
  if (sortSpec) {
    const [field, direction] = sortSpec.split('~');
    return {
      field: field || 'impressions',
      direction: (direction === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
    };
  }
  
  // 默认排序：展示次数倒序
  return { field: 'impressions', direction: 'desc' };
}

// 判断行类型
export function getRowType(item: any): string {
  const hasAdId = item.ad_id && item.ad_id.trim() !== '';
  const hasAdsetId = item.adset_id && item.adset_id.trim() !== '';
  const hasCampaignId = item.campaign_id && item.campaign_id.trim() !== '';
  
  if (hasAdId) {
    return 'ad';
  } else if (hasAdsetId) {
    return 'adset';
  } else if (hasCampaignId) {
    return 'campaign';
  }
  return 'account';
}

// 获取指定字段的数值
export function getFieldValue(item: any, field: string): number {
  const value = item[field];
  if (value === undefined || value === null) {
    return 0;
  }
  
  // 处理字符串值
  const stringValue = String(value).trim();
  
  // 处理空值、破折号、"—"、"--"等表示空值的情况
  if (stringValue === '' || stringValue === '-' || stringValue === '—' || stringValue === '--' || stringValue === '---') {
    return 0;
  }
  
  // 尝试转换为数字
  const numValue = Number(stringValue);
  if (!isNaN(numValue)) {
    return numValue;
  }
  
  return 0;
}

// 按层级排序数据：账户合计 → 系列合计 → 组合计 → 广告统计
export function sortReportData(data: any[]): any[] {
  if (!data || data.length === 0) {
    return data;
  }
  
  // 获取排序配置
  const sortConfig = getSortConfig();
  const sortField = sortConfig.field;
  const sortDirection = sortConfig.direction;
  
  // 排序逻辑
  return [...data].sort((a, b) => {
    // 首先按账户ID排序（确保同一账户的数据在一起）
    const accountCompare = (a.account_id || '').localeCompare(b.account_id || '');
    if (accountCompare !== 0) {
      return accountCompare;
    }

    // 然后按campaign_id排序（确保同一系列的数据在一起）
    const campaignA = a.campaign_id || '';
    const campaignB = b.campaign_id || '';
    const campaignCompare = campaignA.localeCompare(campaignB);
    if (campaignCompare !== 0) {
      return campaignCompare;
    }

    // 获取行类型
    const typeA = getRowType(a);
    const typeB = getRowType(b);

    // 账户合计行排在最前面
    if (typeA === 'account' && typeB !== 'account') {
      return -1;
    }
    if (typeA !== 'account' && typeB === 'account') {
      return 1;
    }

    // 系列合计行（有campaign_id，没有adset_id和ad_id）排在该系列的组和广告前面
    if (typeA === 'campaign' && typeB !== 'campaign') {
      return -1;
    }
    if (typeA !== 'campaign' && typeB === 'campaign') {
      return 1;
    }

    // 按adset_id排序（确保同一组的数据在一起，区分同名组）
    const adsetA = a.adset_id || '';
    const adsetB = b.adset_id || '';
    const adsetCompare = adsetA.localeCompare(adsetB);
    if (adsetCompare !== 0) {
      return adsetCompare;
    }

    // 组合计行（有campaign_id和adset_id，没有ad_id）排在该组的广告前面
    if (typeA === 'adset' && typeB === 'ad') {
      return -1;
    }
    if (typeA === 'ad' && typeB === 'adset') {
      return 1;
    }

    // 最后按指定字段排序（同一组内的广告按排序字段排序）
    const valueA = getFieldValue(a, sortField);
    const valueB = getFieldValue(b, sortField);

    if (sortDirection === 'desc') {
      return valueB - valueA;
    }
    return valueA - valueB;
  });
}

export function processNames(data: any[]): any[] {
  try {
    if (!data || data.length === 0) {
      return data;
    }
    
    let currentAccountName = '';
    let currentCampaignName = '';
    let currentAdSetName = '';
    let currentAdName = '';
    
    for (const item of data) {
      // 如果当前行有账户名，更新当前账户名
      if (item.accountName && item.accountName.trim() !== '') {
        currentAccountName = item.accountName;
        // 重置系列和组名称，因为账户变更了
        currentCampaignName = '';
        currentAdSetName = '';
        currentAdName = '';
      }
      // 如果当前行有广告系列名称，更新当前系列名
      if (item.campaignName && item.campaignName.trim() !== '') {
        currentCampaignName = item.campaignName;
        // 重置组名称，因为系列变更了
        currentAdSetName = '';
      }
      // 如果当前行有广告组名称，更新当前组名
      if (item.adSetName && item.adSetName.trim() !== '') {
        currentAdSetName = item.adSetName;
      }
      
      // 如果当前行没有账户名，但有其他数据，使用当前账户名
      if (currentAccountName && item.accountName === '') {
        item.accountName = currentAccountName;
      }
      // 如果当前行没有系列名，但有其他数据，使用当前系列名
      if (currentCampaignName && item.campaignName === '') {
        item.campaignName = currentCampaignName;
      }
      // 如果当前行没有组名，但有其他数据，使用当前组名
      if (currentAdSetName && item.adSetName === '') {
        item.adSetName = currentAdSetName;
      }
      // 如果当前行没有广告名，但有其他数据，使用当前广告名
      if (currentAdName && item.adName === '') {
        item.adName = currentAdName;
      }
    }
    
    return data;
  } catch (error) {
    console.error('处理名称错误:', error);
    return data;
  }
}

// 获取列索引
export async function getColumnIndices(): Promise<any> {
  // 报告页面的列索引获取逻辑
  return {};
}

// 查找最内层元素
export function findInnermostElement(element: any): any {
  let current = element;
  while (current.firstElementChild) {
    current = current.firstElementChild;
  }
  return current;
}
