import { fieldMappingConfig } from './config';
// 全局遮盖层元素
let overlayElement: HTMLElement | null = null;

// 固定列数量
export let fixedColumnLength = 1;

// 列索引映射
export let columnIndices: Record<string, number> = {};

// 找到表格容器
export function findTableContainer(): HTMLElement | null {
  const selectors = [
    'div[role="table"]',
    'div._3hi._1mie[role="table"]',
    'div[data-surface="//int/table"]',
    'div[class*="table"]',
    'div[style*="table"]'
  ];

  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container) {
      console.log(`使用选择器找到表格容器: ${selector}`);
      return container as HTMLElement;
    }
  }
  
  console.log('未找到任何匹配的表格容器');
  return null;
}

// 获取表格数据行 - 处理固定行和可滚动行
export function getTableDataRows(tableContainer: HTMLElement): Array<{ fixed: HTMLElement; scrollable: HTMLElement }> {
  const rowPairs: Array<{ fixed: HTMLElement; scrollable: HTMLElement }> = [];

  try {
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('未找到表头行');
      return rowPairs;
    }

    // 获取表头行的下一个兄弟元素（表体元素）
    const tableBody = headerRow.nextElementSibling;
    if (!tableBody) {
      console.log('未找到表体');
      return rowPairs;
    }

    // 找到所有role=presentation的元素（每一行的容器）
    const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');

    // 过滤掉没有孙子元素的节点，以及孙子元素是SVG的节点
    const filteredPresentationRows = Array.from(presentationRows).filter((row) => {
      const hasGrandchildren = row.children[0]?.children.length > 0;
      const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
      return hasGrandchildren && hasNonSvgchildren;
    });

    // 处理过滤后的节点
    filteredPresentationRows.forEach((presentationRow) => {
      const children = presentationRow.children;
      if (children.length === 1) {
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;

        if (grandchildren.length >= 2) {
          const fixed = grandchildren[0] as HTMLElement;
          const scrollable = grandchildren[1] as HTMLElement;

          rowPairs.push({
            fixed: fixed,
            scrollable: scrollable
          });
        }
      }
    });

  } catch (error) {
    console.error('获取表格数据行错误:', error);
  }

  console.log('找到行对:', rowPairs.length);
  return rowPairs;
}

// 从DOM中提取广告数据
export async function extractAdsFromDom() {
  try {
    const ads = [];
    const DomColumnMapping = await getColumnIndices();
    const sortInfo = detectSortInfo();
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('extractAdsFromDom: 未找到表格容器');
      return { ads: [], DomColumnMapping: {}, sortInfo };
    }
    
    // 获取表格数据行
    const rowPairs = getTableDataRows(tableContainer);
    console.log('找到的广告行数:', rowPairs.length);
    
    for (const rowPair of rowPairs) {
      const adData = extractAdDataFromRowPair(rowPair, DomColumnMapping);
      if (adData) {
        ads.push(adData);
      }
    }
    
    console.log('提取的广告数据:', ads);
    return { ads, DomColumnMapping, sortInfo };
  } catch (error) {
    console.error('提取广告数据错误:', error);
    return { ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null } };
  }
}

// 从行对中提取广告数据
function extractAdDataFromRowPair(rowPair: { fixed: HTMLElement; scrollable: HTMLElement }, columnMapping: Record<string, number>) {
  try {
    const adData: any = {};
    
    // 从固定列提取名称
    const nameDiv = rowPair.fixed.querySelector('div');
    if (nameDiv) {
      adData.name = nameDiv.textContent?.trim() || '';
    }
    
    // 从可滚动列提取数值字段
    const cells = rowPair.scrollable.querySelectorAll('div');
    
    for (const [field, columnIndex] of Object.entries(columnMapping)) {
      if (columnIndex !== undefined && cells[columnIndex]) {
        const cellText = cells[columnIndex].textContent?.trim() || '';
        adData[field] = cellText;
      }
    }
    
    return adData;
  } catch (error) {
    console.error('从行对提取广告数据错误:', error);
    return null;
  }
}

// 获取列索引
export async function getColumnIndices() {
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('getColumnIndices: 未找到表格容器');
      return {};
    }

    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('getColumnIndices: 未找到表头行');
      return {};
    }

    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    console.log('getColumnIndices: 找到表头单元格数量:', headerCells.length);

    const indices: Record<string, number> = {};

    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，转换为小写进行匹配
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        console.log(`表头列 ${index}: ${text}`);

        // 遍历映射表，查找匹配的字段
        for (const { field, labels } of fieldMappingConfig) {
          if (labels.some(label => text.includes(label.toLowerCase()))) {
            indices[field] = index;
            console.log(`  → 匹配字段: ${field}, 标签: ${labels.join(', ')}`);
            break;
          }
        }
      }
    });

    // 更新全局列索引
    columnIndices = indices;
    console.log('获取到的列索引:', indices);
    return indices;
  } catch (error) {
    console.error('获取列索引错误:', error);
    return {};
  }
}

// 同步获取列索引
export function getColumnIndicesSync() {
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('getColumnIndicesSync: 未找到表格容器');
      return {};
    }

    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('getColumnIndicesSync: 未找到表头行');
      return {};
    }

    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');

    const indices: Record<string, number> = {};

    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，转换为小写进行匹配
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        // 遍历映射表，查找匹配的字段
        for (const { field, labels } of fieldMappingConfig) {
          console.log(`  → 检查标签: ${labels.join(', ')}`);
          if (labels.some(label => text.includes(label.toLowerCase()))) {
            console.log(`  → 匹配字段: ${field}, 标签: ${labels.join(', ')}`);
            indices[field] = index;
            break;
          }
        }
      }
    });
    console.log('同步获取到的列索引:', indices);
    return indices;
  } catch (error) {
    console.error('同步获取列索引错误:', error);
    return {};
  }
}

// 检测排序信息
export function detectSortInfo() {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !window.location) {
    return { field: null, direction: null };
  }
  
  const url = window.location.href;
  const sortMatch = url.match(/sort=([^&]+)/);
  
  if (sortMatch) {
    const sortValue = sortMatch[1];
    const parts = sortValue.split('~');
    if (parts.length === 2) {
      return {
        field: parts[0],
        direction: parts[1] === '1' ? 'desc' : 'asc'
      };
    }
  }
  
  return { field: null, direction: null };
}

// 更新元素文本
export function updateElementText(element: Element, text: string) {
  return new Promise<void>((resolve) => {
    if (element) {
      element.textContent = text;
      resolve();
    } else {
      resolve();
    }
  });
}

// 更新可滚动行
export async function updateScrollableRow(row: Element, data: any, columnIndices: Record<string, number>, fixIndex: number) {
  try {
    // 找到所有role=presentation的元素（每一行的容器）
    const presentationRows = document.body.querySelectorAll('div > [role="presentation"]');

    // 遍历查找匹配的行
    for (const presentationRow of Array.from(presentationRows)) {
      const children = presentationRow.children;
      if (children.length === 1) {
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;

        if (grandchildren.length >= 2) {
          const fixed = grandchildren[0] as HTMLElement;
          const scrollable = grandchildren[1] as HTMLElement;

          // 检查是否是匹配的行（通过名称匹配或其他方式）
          const nameDiv = fixed?.querySelector('div');
          const rowName = nameDiv?.textContent?.trim() || '';

          // 如果行名称匹配
          if (rowName && data.name && rowName === data.name) {
            const cells = scrollable?.querySelectorAll('div');
            const updatePromises = [];

            // 遍历需要更新的字段
            for (const [field, value] of Object.entries(data)) {
              if (field === 'name') continue; // 跳过名称字段

              const columnIndex = columnIndices[field];
              if (columnIndex !== undefined && cells && cells[columnIndex]) {
                updatePromises.push(updateElementText(cells[columnIndex], String(value)));
              }
            }

            // 并行更新所有元素
            await Promise.all(updatePromises);
            console.log(`updateScrollableRow: 已更新行 ${rowName}`);
            return;
          }
        }
      }
    }

    console.warn('updateScrollableRow: 未找到匹配的行');
  } catch (error) {
    console.error('更新可滚动行错误:', error);
  }
}

// 获取广告行元素
export function getAdRowElement(adRow: any): Element | null {
  // 然后尝试通过索引查找
  let tableContainer = findTableContainer();

  // 最后尝试通过名称查找
  if (tableContainer) {
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (headerRow) {
      const tableBody = headerRow.nextElementSibling;
      if (tableBody) {
        const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');
        
        for (const presentationRow of Array.from(presentationRows)) {
          const children = presentationRow.children;
          if (children.length === 1) {
            const firstChild = children[0] as HTMLElement;
            const grandchildren = firstChild.children;
            
            if (grandchildren.length >= 2) {
              const fixed = grandchildren[0] as HTMLElement;
              const nameDiv = fixed?.querySelector('div');
              const rowName = nameDiv?.textContent?.trim() || '';
              
              if (rowName === adRow.name || rowName.includes(adRow.name) || adRow.name.includes(rowName)) {
                return presentationRow as Element;
              }
            }
          }
        }
      }
    }
  }
  
  return null;
}

// 使用可滚动行元素更新数据
export async function updateRowDataWithScrollable(presentationRow: HTMLElement, data: Record<string, number>, columnIndices: Record<string, number>) {
  const children = presentationRow.children;
  if (children.length !== 1) return;

  const firstChild = children[0] as HTMLElement;
  const grandchildren = firstChild.children;

  if (grandchildren.length < 2) return;

  const scrollable = grandchildren[1] as HTMLElement;
  const cells = scrollable?.querySelectorAll('div');
  const updatePromises = [];

  for (const [field, value] of Object.entries(data)) {
    if (field === 'name') continue;

    const columnIndex = columnIndices[field];
    if (columnIndex !== undefined && cells && cells[columnIndex]) {
      const cell = cells[columnIndex];
      if (cell) {
        cell.textContent = String(value);
        updatePromises.push(Promise.resolve());
      }
    }
  }

  await Promise.all(updatePromises);
}

// 通过实体在DOM中查找并更新行
export async function updateDomRowByEntity(entity: any, data: Record<string, number>) {
  // 找到表格容器
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('updateDomRowByEntity: 未找到表格容器');
    return;
  }

  // 获取表格数据行
  const headerRow = tableContainer.querySelector('[role="row"]');
  if (!headerRow) return;

  const tableBody = headerRow.nextElementSibling;
  if (!tableBody) return;

  const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');

  // 过滤有效的行
  const filteredRows = Array.from(presentationRows).filter((row) => {
    const hasGrandchildren = row.children[0]?.children.length > 0;
    const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
    return hasGrandchildren && hasNonSvgchildren;
  });

  // 遍历查找匹配的行
  for (const presentationRow of filteredRows) {
    const children = presentationRow.children;
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;

      if (grandchildren.length >= 2) {
        const fixed = grandchildren[0] as HTMLElement;
        const scrollable = grandchildren[1] as HTMLElement;

        // 检查是否是匹配的行（通过名称匹配）
        const nameDiv = fixed?.querySelector('div');
        const rowName = nameDiv?.textContent?.trim() || '';

        // 如果名称匹配
        if (rowName === entity.name || rowName.includes(entity.name) || entity.name.includes(rowName)) {
          // 获取列索引
          const columnIndices = await getColumnIndices();

          // 更新行数据
          await updateRowDataWithScrollable(presentationRow as HTMLElement, data, columnIndices);
          console.log(`已更新DOM行: ${entity.name}`, data);
          return;
        }
      }
    }
  }

  console.warn(`updateDomRowByEntity: 未找到匹配的DOM行: ${entity.name}`);
}

// 创建遮盖层
export function createOverlay() {
  // 检查是否已存在遮盖层
  if (overlayElement) {
    return;
  }
  
  // 创建遮盖层元素
  overlayElement = document.createElement('div');
  overlayElement.style.position = 'fixed';
  overlayElement.style.top = '0';
  overlayElement.style.left = '0';
  overlayElement.style.width = '100%';
  overlayElement.style.height = '100%';
  overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  overlayElement.style.zIndex = '9999';
  overlayElement.style.display = 'flex';
  overlayElement.style.justifyContent = 'center';
  overlayElement.style.alignItems = 'center';
  
  // 创建加载指示器
  const loader = document.createElement('div');
  loader.style.fontSize = '18px';
  loader.style.color = '#333';
  loader.textContent = '正在同步数据...';
  
  overlayElement.appendChild(loader);
  document.body.appendChild(overlayElement);
}

// 移除遮盖层
export function removeOverlay() {
  if (overlayElement && overlayElement.parentNode) {
    overlayElement.parentNode.removeChild(overlayElement);
    overlayElement = null;
  }
}

