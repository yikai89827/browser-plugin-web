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

// 获取表格展示行 - 公共函数
export function getTablePresentationRows(tableContainer: HTMLElement): Array<HTMLElement> {
  const presentationRows: Array<HTMLElement> = [];

  try {
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('未找到表头行');
      return presentationRows;
    }

    // 获取表头行的下一个兄弟元素（表体元素）
    const tableBody = headerRow.nextElementSibling;
    if (!tableBody) {
      console.log('未找到表体');
      return presentationRows;
    }

    // 过滤有效的行
    presentationRows.push(...getFilteredRows(tableBody as HTMLElement));

  } catch (error) {
    console.error('获取表格展示行错误:', error);
  }

  console.log('找到展示行:', presentationRows.length);
  return presentationRows;
}

// 获取表格数据行 - 处理固定行和可滚动行
export function getTableDataRows(tableContainer: HTMLElement): Array<{ fixed: HTMLElement; scrollable: HTMLElement }> {
  const rowPairs: Array<{ fixed: HTMLElement; scrollable: HTMLElement }> = [];

  try {
    // 获取展示行
    const presentationRows = getTablePresentationRows(tableContainer);

    // 处理过滤后的节点
    presentationRows.forEach((presentationRow) => {
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
    return '¥'; // 默认货币符号
  } catch (error) {
    console.error('从文本提取货币符号错误:', error);
    return '¥'; // 默认货币符号
  }
}

// 尝试从页面的JavaScript变量中获取表格数据

// 从DOM中提取广告数据
export async function extractAdsFromDom() {
  try {
    const ads = [];
    const DomColumnMapping = await getColumnIndices();
    const sortInfo: any = getCurrentPageState() || {};
    let currencySymbol = '¥'; // 默认货币符号
    
    // 找到表格容器
    const tableContainer = await findTableContainer();
    if (!tableContainer) {
      console.log('extractAdsFromDom: 未找到表格容器');
      return { ads: [], DomColumnMapping: {}, sortInfo, currencySymbol };
    }
    
    // 等待表格数据完全渲染，最多等待5秒
    let rowPairs: Array<{ fixed: HTMLElement; scrollable: HTMLElement }> = [];
    for (let i = 0; i < 10; i++) {
      rowPairs = getTableDataRows(tableContainer);
      if (rowPairs.length > 0) {
        break;
      }
      // 等待500ms后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('找到的广告行数:', rowPairs.length);
    
    // 提取第一行数据以获取货币符号
    if (rowPairs.length > 0) {
      const firstRow = rowPairs[0];
      const { values } = extractRowData(firstRow, DomColumnMapping);
      
      // 检查费用相关字段
      const costFields = ['spend', 'costPerResult', 'registration_cost', 'purchase_cost', 'cost_per_result', 'registration_cost', 'purchase_cost'];
      for (const field of costFields) {
        if (values[field]) {
          currencySymbol = extractCurrencySymbolFromText(values[field]);
          console.log('从字段', field, '提取的货币符号:', currencySymbol);
          break;
        }
      }
    }
    
    for (const rowPair of rowPairs) {
      console.log(`  → 处理行对: `,rowPair);
      const adData = extractAdDataFromRowPair(rowPair, DomColumnMapping);
      if (adData) {
        ads.push(adData);
      }
    }
    
    console.log('提取的广告数据:', ads);
    return { ads, DomColumnMapping, sortInfo, currencySymbol };
  } catch (error) {
    console.error('提取广告数据错误:', error);
    return { ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null }, currencySymbol: '¥' };
  }
}

// 从行对中提取广告数据
function extractAdDataFromRowPair(rowPair: { fixed: HTMLElement; scrollable: HTMLElement }, columnMapping: Record<string, number>) {
  try {
    const { name, values } = extractRowData(rowPair, columnMapping);
    const adData: any = { name };
    Object.assign(adData, values);
    
    // 获取当前页面层级
    const pageState = getCurrentPageState();
    const currentLevel = pageState.level || 'Campaigns';
    
    // 根据当前层级选择正确的ID作为广告对象的id字段
    if (!adData.id) {
      if (currentLevel === 'Ads' && adData.ad_id) {
        adData.id = adData.ad_id;
      } else if (currentLevel === 'Adsets' && adData.adset_id) {
        adData.id = adData.adset_id;
      } else if (currentLevel === 'Campaigns' && adData.campaign_id) {
        adData.id = adData.campaign_id;
      } 
      // 如果都没有，使用name作为id
      else {
        adData.id = name;
      }
    }
    
    console.log(`  → 提取到的广告数据: ${JSON.stringify(adData)}`);
    return adData;
  } catch (error) {
    console.error('从行对提取广告数据错误:', error);
    return null;
  }
}

// 从行对中提取数据
export function extractRowData(rowPair: { fixed: HTMLElement; scrollable: HTMLElement }, columnIndices: Record<string, number>): {
  name: string;
  values: Record<string, string>;
  fixedColumnLength: number;
} {
  // 从固定列提取名称
  const nameDiv = rowPair.fixed.querySelector('div');
  let name = nameDiv?.textContent?.trim() || '';
  
  // 计算固定列长度
  fixedColumnLength = rowPair.fixed.children[0]?.children?.length - 1 || 0;
  
  // 从可滚动列提取数据
  const scrollableElements = rowPair.scrollable.children[0]?.children || [];
  const cells = Array.from(scrollableElements);
  const values: Record<string, string> = {};
  console.log(`  → 提取到的字段索引: ${JSON.stringify(columnIndices)}`,cells);
  for (const [field, originalIndex] of Object.entries(columnIndices)) {
    // 计算滚动列的索引（减去固定列的长度）
    const columnIndex = originalIndex - fixedColumnLength;
    // console.log(`  → 提取到的字段索引: ${field} = ${originalIndex}, 滚动列索引: ${columnIndex}, 固定列长度: ${fixedColumnLength}`);
    if (columnIndex !== undefined && columnIndex >= 0 && cells[columnIndex]) {
      // 找到最内层的DOM元素
      const innermostElement = findInnermostElement(cells[columnIndex]);
      let cellText = innermostElement.textContent?.trim() || '';

      console.log(`  → 提取到的原始文本: ${cellText}`, field, columnIndex);
      // 检查是否有 data-add-value 属性
      const dataAdValue = innermostElement.getAttribute('data-add-value');
      if (dataAdValue) {
        // 如果有，使用当前值减去增加值，得到原始值
        try {
          // 提取数值
          const currentValue = parseFloat(cellText.replace(/[^\d.-]/g, ''));
          const increaseValue = parseFloat(dataAdValue);
          if (!isNaN(currentValue) && !isNaN(increaseValue)) {
            const originalValue = currentValue - increaseValue;
            
            // 定义金额字段列表
            const currencyFields = ['spend', 'registration_cost', 'purchase_cost', 'costPerResult'];
            
            // 只对金额字段保留货币符号
            if (currencyFields.includes(field)) {
              // 提取货币符号
              const currencySymbol = extractCurrencySymbolFromText(cellText);
              cellText = currencySymbol + originalValue.toLocaleString();
            } else {
              // 非金额字段，直接显示数值
              cellText = originalValue.toLocaleString();
            }
          }
        } catch (error) {
          console.error('解析 data-add-value 属性错误:', error);
        }
      }
      
      values[field] = cellText;
    }
  }
  
  return {
    name,
    values,
    fixedColumnLength
  };
}

// 基础函数
function getColumnIndicesBase(isSync: boolean = false): Record<string, number> {
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log(`${isSync ? 'getColumnIndicesSync' : 'getColumnIndices'}: 未找到表格容器`);
      return {};
    }

    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log(`${isSync ? 'getColumnIndicesSync' : 'getColumnIndices'}: 未找到表头行`);
      return {};
    }

    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    if (!isSync) {
      console.log(`[${new Date().toISOString()}] 找到表头单元格数量:`, headerCells.length, fieldMappingConfig);
    }

    const indices: Record<string, number> = {};

    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，转换为小写进行匹配
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        if (!isSync) {
          // console.log(`[${new Date().toISOString()}] 表头列 ${index}: ${text}`);
        }

        // 遍历映射表，查找匹配的字段
        for (const { field, labels } of fieldMappingConfig) {
          if (!isSync) {
            // console.log(`  → 检查标签: ${labels.join(', ')}`, field);
          }
          if (labels.some(label => text === label.toLowerCase())) {
            if (!isSync) {
              // console.log(`  → 匹配字段: ${field}, 标签: ${labels.join(', ')}`);
            }
            indices[field] = index;
            break;
          }
        }
      }
    });

    // 非同步版本更新全局列索引
    if (!isSync) {
      columnIndices = indices;
      console.log('获取到的列索引:', indices);
    } else {
      console.log('同步获取到的列索引:', indices);
    }
    return indices;
  } catch (error) {
    console.error(`${isSync ? '同步' : ''}获取列索引错误:`, error);
    return {};
  }
}

// 异步版本
export async function getColumnIndices() {
  return getColumnIndicesBase(false);
}

// 同步版本
export function getColumnIndicesSync() {
  return getColumnIndicesBase(true);
}

// 检测排序信息
export function detectSortInfo() {

  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { field: null, direction: null };
    }
    // 如果没有找到排序属性，尝试从URL中获取排序信息
    const urlParams = new URLSearchParams(window.location.search);
    const sortParam = urlParams.get('sort');
    if (sortParam) {
      // console.log(`从URL获取排序信息: ${sortParam}`);
      // 解析URL中的排序参数，格式如：impressions~0（降序）或 impressions~1（升序）
      const sortParts = sortParam.split('~');
      // console.log('排序参数:', sortParts);
      if (sortParts.length === 2) {
        // console.log(`检测到排序信息: field=${sortParts[0]}, direction=${sortParts[1]}`);
        return { field: sortParts[0], direction: sortParts[1] === '0' ? 'desc' : 'asc' };
      }
    }
    // 查找具有sorting属性且role="columnheader"的元素
    const columnHeaderElements = document.querySelectorAll('[role="columnheader"]');

    // 使用for循环而不是forEach，以便能够提前返回
    for (let i = 0; i < columnHeaderElements.length; i++) {
      const element = columnHeaderElements[i];

      // 尝试多种方式获取排序属性
      const sortingAttr = element.getAttribute('sorting') ||
        element.getAttribute('aria-sort') ||
        element.getAttribute('data-sort');

      let sortField = null;
      let sortDirection = null;
      // 如果找到排序属性
      if (sortingAttr) {
        // 从元素文本中提取字段名
        const fieldName = element.textContent?.trim().toLowerCase() || '';

        // 尝试映射字段名到标准字段名
        for (const { field, labels } of fieldMappingConfig) {
          if (labels.some(label => fieldName.includes(label.toLowerCase()))) {
            sortField = field;
            break;
          }
        }

        // 如果没有匹配到标准字段，使用标准化的字段名
        if (!sortField) {
          sortField = fieldName
            .replace(/[^a-z0-9\s]/g, '') // 移除特殊字符
            .trim()
            .replace(/\s+/g, '_'); // 将空格替换为下划线
        }

        // 设置排序方向
        if (sortingAttr.toLowerCase() === 'asc' || sortingAttr.includes('↑') || sortingAttr.includes('up') || sortingAttr.includes('ascending')) {
          sortDirection = 'asc';
        } else if (sortingAttr.toLowerCase() === 'desc' || sortingAttr.includes('↓') || sortingAttr.includes('down') || sortingAttr.includes('descending')) {
          sortDirection = 'desc';
        }

        return { field: sortField, direction: sortDirection };
      }
    }

  } catch (error) {
    console.error('Error detecting sort info:', error);
  }
}

// 获取当前页面状态
export function getCurrentPageState() {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !window.location) {
    return {
      level: 'Campaigns',
      sortField: null,
      sortDirection: null
    };
  }

  // 从URL中获取当前tab名称
  const pathParts = window.location.href.split('/');
  const tab = pathParts[pathParts.length - 1];

  // 获取当前层级（竞选活动、广告组、广告）
  let level = 'Campaigns';
  if (tab.includes('campaigns')) {
    level = 'Campaigns';
  } else if (tab.includes('adsets')) {
    level = 'Adsets';
  } else if (tab.includes('ads')) {
    level = 'Ads';
  }

  // 获取当前排序状态
  const { field: sortField, direction: sortDirection } = detectSortInfo() || {};

  return {
    level,
    sortField,
    sortDirection
  };
}

// 更新元素文本
export function updateElementText(element: Element, text: string) {
  return new Promise<void>((resolve) => {
    if (element) {
      // 找到最内层的DOM元素进行更新
      let currentElement = element;
      while (currentElement.firstElementChild) {
        currentElement = currentElement.firstElementChild;
      }
      currentElement.textContent = text;
      resolve();
    } else {
      resolve();
    }
  });
}

// 更新可滚动行
export async function updateScrollableRow(row: Element, data: any, columnIndices: Record<string, number>, fixIndex: number) {
  try {
    // 直接使用传入的行元素
    const children = row.children;
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;

      if (grandchildren.length >= 2) {
        // const fixed = grandchildren[0] as HTMLElement;
        const scrollable = grandchildren[1] as HTMLElement;

        // 获取可滚动列的单元格
        const scrollableCells = scrollable.children[0]?.children || [];
        const updatePromises = [];

        // 遍历需要更新的字段
        for (const [field, value] of Object.entries(data)) {
          if (field === 'name') continue; // 跳过名称字段

          const columnIndex = columnIndices[field] - fixIndex;
          if (columnIndex !== undefined && scrollableCells[columnIndex]) {
            updatePromises.push(updateElementText(scrollableCells[columnIndex], String(value)));
          }
        }

        // 并行更新所有元素
        await Promise.all(updatePromises);
        console.log(`updateScrollableRow: 已更新行 ${data?.name}`);
        return;
      }
    }
    
    console.warn('updateScrollableRow: 行元素结构不正确');
  } catch (error) {
    console.error('更新可滚动行错误:', error);
  }
}

//根据当前层级选择正确的ID列名
export function getIdColumn() {
  // 获取当前页面层级
  const pageState = getCurrentPageState();
  const currentLevel = pageState.level || 'Campaigns';
  return {
    Ads: 'ad_id',
    Adsets: 'adset_id',
    Campaigns: 'campaign_id'
  }[currentLevel] || 'campaign_id';
}

// 获取广告行元素
export function getAdRowElement(adRow: any): Element | null {
  // 获取当前页面层级对应的ID列名
  const idColumn = getIdColumn();
  
  // 获取要比较的ID值
  const rowId = adRow[idColumn] || adRow.id;
  if (!rowId) {
    return null;
  }
  
  let tableContainer = findTableContainer();
  if (tableContainer) {
    // 获取展示行
    const presentationRows = getTablePresentationRows(tableContainer);
    
    // 获取列索引
    const columnIndices = getColumnIndicesSync();
    
    for (const presentationRow of presentationRows) {
      const children = presentationRow.children;
      if (children.length === 1) {
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;
        
        if (grandchildren.length >= 2) {
          const fixed = grandchildren[0] as HTMLElement;
          const scrollable = grandchildren[1] as HTMLElement;
          
          // 计算固定列长度
          fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
          
          // 查找编号列
          const scrollableCells = scrollable.children[0]?.children || [];
          if (scrollableCells.length > 0 && columnIndices[idColumn]) {
            // 计算滚动列的索引（减去固定列的长度）
            const idColumnIndex = columnIndices[idColumn];
            const scrollableIndex = idColumnIndex - fixedColumnLength;
            
            if (scrollableIndex >= 0 && scrollableCells[scrollableIndex]) {
              const idCell = scrollableCells[scrollableIndex];
              const idText = idCell?.textContent?.trim() || '';
              
              if (idText === rowId) {
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
// 找到最内层的DOM元素
export function findInnermostElement(element: Element): Element {
  let current = element;
  while (current.firstElementChild) {
    current = current.firstElementChild;
  }
  return current;
}
// 更新行数据
// 从可滚动行元素更新数据
export async function updateRowDataWithScrollable(presentationRow: HTMLElement, data: Record<string, number>, columnIndices: Record<string, number>) {
  const children = presentationRow.children;
  if (children.length !== 1) return;

  const firstChild = children[0] as HTMLElement;
  const grandchildren = firstChild.children;

  if (grandchildren.length < 2) return;

  const scrollable = grandchildren[1] as HTMLElement;
  const scrollableCells = scrollable.children[0]?.children || [];
  const updatePromises = [];

  for (const [field, value] of Object.entries(data)) {
    if (field === 'name') continue;

    const columnIndex = columnIndices[field];
    if (columnIndex !== undefined && scrollableCells.length > 0) {
      // 计算滚动列的索引（减去固定列的长度）
      const scrollableIndex = columnIndex - fixedColumnLength;
      if (scrollableIndex >= 0 && scrollableCells[scrollableIndex]) {
        const cell = scrollableCells[scrollableIndex];
        // 找到最内层的DOM元素进行更新
        const innermostElement = findInnermostElement(cell);
        innermostElement.textContent = String(value);
        updatePromises.push(Promise.resolve());
      }
    }
  }

  await Promise.all(updatePromises);
}
// 过滤有效的表格行
export function getFilteredRows(tableBody: HTMLElement): Array<HTMLElement> {
  const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');
  
  return Array.from(presentationRows).filter((row) => {
    const hasGrandchildren = row.children[0]?.children.length > 0;
    const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
    return hasGrandchildren && hasNonSvgchildren;
  }) as Array<HTMLElement>;
}
// 通过实体在DOM中查找并更新行
export async function updateDomRowByEntity(entity: any, data: Record<string, number>) {
  // 找到表格容器
  const tableContainer = findTableContainer();
  // 获取展示行
  const filteredRows = getTablePresentationRows(tableContainer as HTMLElement);

  // 遍历查找匹配的行
  for (const presentationRow of filteredRows) {
    const children = presentationRow.children;
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;

      if (grandchildren.length >= 2) {
        // const fixed = grandchildren[0] as HTMLElement;
        // const scrollable = grandchildren[1] as HTMLElement;

        const columnIndices = await getColumnIndices();

        // 更新行数据
        await updateRowDataWithScrollable(presentationRow as HTMLElement, data, columnIndices);
        console.log(`已更新DOM行: ${entity.name}`, data);
        return;
      }
    }
  }

  console.warn(`updateDomRowByEntity: 未找到匹配的DOM行: ${entity.name}`);
}

// 创建遮盖层
export function createOverlay() {
  // 如果遮盖层已经存在，先移除
  if (overlayElement) {
    overlayElement.remove();
  }

  // 找到表格容器
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.log('未找到表格容器，使用全屏覆盖层');
    // 如果找不到表格容器，使用全屏遮盖层
    overlayElement = document.createElement('div');
    overlayElement.style.position = 'fixed';
    overlayElement.style.top = '0';
    overlayElement.style.left = '0';
    overlayElement.style.width = '100%';
    overlayElement.style.height = '100%';
    overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 1)'; // 完全不透明
    overlayElement.style.zIndex = '999999';
    overlayElement.style.display = 'flex';
    overlayElement.style.justifyContent = 'center';
    overlayElement.style.alignItems = 'center';
  } else {
    // 获取表格容器的位置和大小
    const rect = tableContainer.getBoundingClientRect();

    // 创建遮盖层元素
    overlayElement = document.createElement('div');
    overlayElement.style.position = 'fixed';
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
    overlayElement.style.backgroundColor = 'rgba(255, 255, 255, 1)'; // 完全不透明
    overlayElement.style.zIndex = '999999';
    overlayElement.style.display = 'flex';
    overlayElement.style.justifyContent = 'center';
    overlayElement.style.alignItems = 'center';
  }

  // 添加加载动画
  const spinner = document.createElement('div');
  spinner.style.border = '4px solid rgba(0, 0, 0, 0.1)';
  spinner.style.borderLeftColor = '#3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '40px';
  spinner.style.height = '40px';
  spinner.style.animation = 'spin 1s linear infinite';

  // 添加关闭按钮
  const closeButton = document.createElement('button');
  closeButton.textContent = '关闭';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '10px';
  closeButton.style.padding = '8px 16px';
  closeButton.style.backgroundColor = '#3498db';
  closeButton.style.color = 'white';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '14px';
  closeButton.style.fontWeight = 'bold';
  closeButton.style.zIndex = '1000000';
  closeButton.onclick = () => {
    removeOverlay();
  };

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  overlayElement.appendChild(spinner);
  overlayElement.appendChild(closeButton);
  document.body.appendChild(overlayElement);
}

// 移除遮盖层
export function removeOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

