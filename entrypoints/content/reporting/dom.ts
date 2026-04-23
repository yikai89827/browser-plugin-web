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
  
  headerCells.forEach((cell: any, index: number) => {
    const cellText = cell.textContent?.trim().toLowerCase() || '';
    
    // 查找匹配的字段
    for (const { field, labels } of fieldMappingConfig) {
      if (labels.some(label => cellText.includes(label.toLowerCase()))) {
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
  const element = tableContainer.children[0]?.children[2];
  if (!element) {
    return [];
  }
  // 报告页面的表格数据行查找逻辑
  return Array.from(element.children) as HTMLElement[];
}

// 获取表格底部
export function getReportingTableFooter(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    return null;
  }
  // 报告页面的表格底部查找逻辑
  const element = tableContainer.children[0]?.children[3];
  return element as HTMLElement || null;
}

// 获取当前页面状态
export function getCurrentPageState(): any {
  // 报告页面的状态获取逻辑
  return {
    sortField: null,
    sortDirection: null,
    level: 'Reporting'
  };
}

// 从DOM提取数据
export async function extractDataFromDom(): Promise<{ data: any[], columnMapping: any, sortInfo: any, currencySymbol: string }> {
  // 报告页面的数据提取逻辑
  return {
    data: [],
    columnMapping: {},
    sortInfo: { field: null, direction: null },
    currencySymbol: '$'
  };
}

// 获取列索引
export async function getColumnIndices(): Promise<any> {
  // 报告页面的列索引获取逻辑
  return {};
}


// 查找数据行
export function getRowElement(id: string): HTMLElement | null {
  // 报告页面的数据行查找逻辑
  return null;
}
// 查找最内层元素
export function findInnermostElement(element: any): any {
  let current = element;
  while (current.firstElementChild) {
    current = current.firstElementChild;
  }
  return current;
}
