// 列映射配置 - 表头ID到字段名的映射
export const columnMapping = {
  name: 'reporting_table_column_name',//广告名称
  impressions: 'reporting_table_column_impressions',//展示次数
  reach: 'reporting_table_column_reach',//覆盖次数
  spend: 'reporting_table_column_spend',//花费
  clicks: 'reporting_table_column_clicks',//点击（全部）
  registrations: 'reporting_table_column_actions:omni_complete_registration)',//注册已完成
  purchases: 'reporting_table_column_actions:omni_purchase',//购买次数
  results: 'ads_manager_table_results_column_label_id',//成效
  costPerResult: 'reporting_table_column_cost_per_result',//单次成效
};

// 数值类字段配置
export const numericFields = ['impressions', 'reach', 'spend', 'results', 'costPerResult'];

// 固定列数量
export let fixedColumnLength = 1;

// 列索引映射
export let columnIndices: Record<string, number> = {};

// 从DOM中提取广告数据
export async function extractAdsFromDom() {
  try {
    const ads = [];
    const DomColumnMapping = await getColumnIndices();
    const sortInfo = detectSortInfo();
    
    // 找到所有广告行
    const rows = document.querySelectorAll('[role="rowgroup"] > [role="row"]');
    console.log('找到的广告行数:', rows.length);
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const adData = extractAdDataFromRow(row, DomColumnMapping);
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

// 从行中提取广告数据
function extractAdDataFromRow(row: Element, columnMapping: Record<string, number>) {
  try {
    const adData: any = {};
    
    // 提取固定列数据
    const fixed = row.querySelector('[role="presentation"]');
    if (fixed) {
      const nameElement = fixed.querySelector('div');
      if (nameElement) {
        // 提取广告名称（排除按钮部分）
        const nameText = nameElement.textContent || '';
        adData.name = nameText.trim();
      }
    }
    
    // 提取可滚动列数据
    const scrollable = row.querySelector('[role="presentation"] + [role="presentation"]');
    if (scrollable) {
      const cells = scrollable.querySelectorAll('div');
      cells.forEach((cell, index) => {
        adData[`scrollable_${index}`] = cell.textContent || '';
      });
    }
    
    return adData;
  } catch (error) {
    console.error('从行提取广告数据错误:', error);
    return null;
  }
}

// 获取列索引
export async function getColumnIndices() {
  try {
    const headers = document.querySelectorAll('[role="columnheader"]');
    const indices: Record<string, number> = {};
    
    headers.forEach((header, index) => {
      const headerId = header.id;
      if (headerId) {
        for (const [field, expectedId] of Object.entries(columnMapping)) {
          if (headerId.includes(expectedId)) {
            indices[field] = index;
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
    const headers = document.querySelectorAll('[role="columnheader"]');
    const indices: Record<string, number> = {};
    
    headers.forEach((header, index) => {
      const headerId = header.id;
      if (headerId) {
        for (const [field, expectedId] of Object.entries(columnMapping)) {
          if (headerId.includes(expectedId)) {
            indices[field] = index;
            break;
          }
        }
      }
    });
    
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
    const scrollable = row.querySelector('[role="presentation"] + [role="presentation"]');
    if (scrollable) {
      const cells = scrollable.querySelectorAll('div');
      const updatePromises = [];
      
      // 遍历需要更新的字段
      for (const [field, value] of Object.entries(data)) {
        const columnIndex = columnIndices[field];
        if (columnIndex !== undefined) {
          const cellIndex = columnIndex - fixIndex;
          if (cellIndex >= 0 && cellIndex < cells.length) {
            updatePromises.push(updateElementText(cells[cellIndex], value));
          }
        }
      }
      
      // 并行更新所有元素
      await Promise.all(updatePromises);
    }
  } catch (error) {
    console.error('更新可滚动行错误:', error);
  }
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

// 全局遮盖层元素
let overlayElement: HTMLElement | null = null;
