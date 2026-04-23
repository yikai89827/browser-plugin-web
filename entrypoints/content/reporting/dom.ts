import { fieldMappingConfig } from './config';
// 报告页面的DOM操作模块
// 负责处理报表页面的DOM元素查找和操作

// 找到表格容器
export function findTableContainer(): HTMLElement | null {
  const element = document.querySelector('[role="table"]');
  return element as HTMLElement || null;
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
  console.log('固定列:', fixedCells);
  console.log('可滚动列:', scrollableCells);
  if (!scrollableCells) {
    return {};
  }
  const scrollableCellsArray = Array.from(scrollableCells);
   scrollableCellsArray.forEach((cell: any, index: number) => {
    const cellText = cell.textContent?.trim().toLowerCase() || '';
    const text = cellText.replace('打开列内操作菜单', '');
    
    // 查找匹配的字段
    for (const { field, labels } of fieldMappingConfig) {
      if (labels.some(label => text.includes(label.toLowerCase()))) {
        columnIndices[field] = index;
        break;
      }
    }
  });
  
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
export function getReportingTableFooter(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    return null;
  }
  const element = tableContainer.children[0]?.children[3];
  if (!element) {
    return null;
  }
  console.log('表格底部:', element);
  return element as HTMLElement;
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
    
    console.log('提取的报表数据:', processedData);
    return { data: processedData, columnMapping, currencySymbol };
  } catch (error) {
    console.error('提取报表数据错误:', error);
    return { data: [], columnMapping: {}, currencySymbol: '$' };
  }
}

// 生成广告唯一标识符
export function generateAdId(adData: any): string {
  const originalId = `${adData.accountName}_${adData.campaignName}_${adData.adSetName}_${adData.adName}`;
  const charCodeString = stringToCharCodeString(originalId);
  const num = charCodeStringToNumber(charCodeString);
  return numberToBase62(num);
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
  return parseInt(charCodeString, 10);
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
    
    console.log('处理行:', row);
    console.log('列映射:', columnMapping);
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
      console.log('提取的名称数据:', rowData.accountName, rowData.campaignName, rowData.adSetName, rowData.adName);
    }
    
    // 可滚动列数据
    const scrollableColumn = cells.children[1];
    const scrollableColumnCellsArray = Array.from(scrollableColumn.children[0].children);
    console.log('可滚动列单元格数量:', scrollableColumnCellsArray.length);
    
    // 提取数值数据
    for (const [field, columnIndex] of Object.entries(columnMapping)) {
      if (columnIndex >= 0 && scrollableColumnCellsArray[columnIndex]) {
        let cellText = scrollableColumnCellsArray[columnIndex].textContent?.trim() || '';
        // 去掉数值后面的中括号和数字，如 "12[2]" → "12"
        cellText = cellText.replace(/\[\d+\]$/, '');
        rowData[field] = cellText;
        console.log('提取的字段数据:', field, columnIndex, cellText);
      }
    }
    
    // 确保所有名称字段都有值
    rowData.accountName = rowData.accountName || '';
    rowData.campaignName = rowData.campaignName || '';
    rowData.adSetName = rowData.adSetName || '';
    rowData.adName = rowData.adName || '';
    
    // 生成 ID
    rowData.id = generateAdId(rowData);
    
    console.log('提取的行数据:', rowData);
    return rowData;
  } catch (error) {
    console.error('从行提取数据错误:', error);
    return null;
  }
}

// 处理名称赋值，确保所有行都有完整的账户、系列、组和广告名称
export function processNames(data: any[]): any[] {
  try {
    if (!data || data.length === 0) {
      return data;
    }
    
    let currentAccountName = '';
    let currentCampaignName = '';
    let currentAdSetName = '';
    
    for (const item of data) {
      // 如果当前行有账户名，更新当前账户名
      if (item.accountName && item.accountName.trim() !== '') {
        currentAccountName = item.accountName;
        // 重置系列和组名称，因为账户变更了
        currentCampaignName = '';
        currentAdSetName = '';
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
