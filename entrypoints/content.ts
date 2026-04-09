// @ts-nocheck
import { browserStorage } from '../utils/storage';

// 广告数据类型
interface AdData {
  id: string;
  name: string;
  increase_impressions: number;
  increase_reach: number;
  increase_spend: number;
  increase_results: number;
  updated_at: string;
}

// 列映射配置 - 表头ID到字段名的映射
const columnMapping = {
  name: 'reporting_table_column_name',
  impressions: 'reporting_table_column_impressions',
  reach: 'reporting_table_column_reach',
  spend: 'reporting_table_column_spend',
  results: 'reporting_table_column_results',
  cost_per_result: 'reporting_table_column_cost_per_result'
};

// 存储列索引
let columnIndices: Record<string, number> = {};

export default {
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Content script loaded for Facebook Ads Manager');
    
    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getAdsFromDom') {
        const ads = extractAdsFromDom();
        sendResponse({ ads });
      }
    });
    
    // 等待页面加载完成
    setTimeout(async () => {
      // 先获取列索引
      getColumnIndices();
      await syncAdDataToPage();
    }, 2000);
    
    // 监听页面变化
    const observer = new MutationObserver(async () => {
      await syncAdDataToPage();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
};

// 获取列索引
function getColumnIndices() {
  columnIndices = {};
  
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.log('Table container not found');
      return;
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('Header row not found');
      return;
    }
    
    // 获取所有表头单元格
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    console.log('Found header cells:', headerCells.length);
    
    headerCells.forEach((cell, index) => {
      // 检查单元格的ID是否匹配列映射（在孙元素上查找ID）
      const cellId = cell?.children[0]?.children[0]?.id || '';
      console.log(`Checking cell ID: ${cellId}`, cell); 

      for (const [field, idPattern] of Object.entries(columnMapping)) {
        console.log(`${cellId}=====1=======Checking field ${field} with pattern ${idPattern}`);
        if (cellId.includes(idPattern)) {
          console.log(`${cellId}=====2=======Matched field ${field} with pattern ${idPattern}`);
          columnIndices[field] = index;
          console.log(`Found column ${field} at index ${index}`);
          break;
        }
      }
    });
    
    console.log('Column indices:', columnIndices);
  } catch (error) {
    console.error('Error getting column indices:', error);
  }
}

// 查找表格容器
function findTableContainer() {
  // 根据DOM截图，表格容器是带有role="table"属性的div
  // 尝试多种选择器来找到正确的表格容器
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
      console.log(`Found table container with selector: ${selector}`);
      return container;
    }
  }
  
  console.log('Table container not found with any selector');
  return null;
}

// 获取表格数据行 - 处理固定行和可滚动行
function getTableDataRows(tableContainer: HTMLElement) {
  const rowPairs: Array<{ fixed: HTMLElement; scrollable: HTMLElement }> = [];
  
  try {
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('Header row not found');
      return rowPairs;
    }
    
    // 获取表头行的下一个兄弟元素（表体元素）
    const tableBody = headerRow.nextElementSibling;
    if (!tableBody) {
      console.log('Table body not found');
      return rowPairs;
    }
    
    console.log('Found table body:', tableBody);
    
    // 找到所有role=presentation的元素（每一行的容器）
    const presentationRows = tableBody.querySelectorAll('[role="presentation"]');
    console.log('Found presentation rows:', presentationRows.length);
    
    presentationRows.forEach((presentationRow, index) => {
      console.log(`Processing presentation row ${index}`, presentationRow);
      
      // 获取孙元素（固定行和可滚动行）
      const children = presentationRow.children;
      if (children.length >= 1) {
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;
        console.log(`Found grandchildren: ${grandchildren.length}`, grandchildren);
        
        if (grandchildren.length >= 2) {
          const fixed = grandchildren[0] as HTMLElement;
          const scrollable = grandchildren[1] as HTMLElement;
          
          console.log(`Found fixed row:`, fixed);
          console.log(`Found scrollable row:`, scrollable);
          
          rowPairs.push({
            fixed: fixed,
            scrollable: scrollable
          });
        }
      }
    });
  } catch (error) {
    console.error('Error getting table data rows:', error);
  }
  
  console.log('Found row pairs:', rowPairs.length);
  return rowPairs;
}

// 清理广告名称
function cleanAdName(name: string): string {
  // 移除常见的额外文本
  const unwantedTexts = [
    '图表编辑复制打开下拉菜单',
    '图表编辑',
    '复制',
    '打开',
    '下拉菜单'
  ];
  
  let cleanedName = name;
  for (const text of unwantedTexts) {
    cleanedName = cleanedName.replace(text, '').trim();
  }
  
  // 移除数字后缀（如 -102）
  cleanedName = cleanedName.replace(/\s*-\s*\d+$/, '').trim();
  
  return cleanedName;
}

// 解析数值
function parseNumber(text: string): number {
  if (!text) return 0;
  const cleanedText = text.replace(/[^0-9.]/g, '');
  return parseFloat(cleanedText) || 0;
}

// 从DOM提取广告数据
function extractAdsFromDom() {
  const ads = [];
  
  try {
    // 如果列索引为空，先获取
    if (Object.keys(columnIndices).length === 0) {
      getColumnIndices();
    }
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found');
      return ads;
    }
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found row pairs:', rowPairs.length);
    
    rowPairs.forEach((rowPair, rowIndex) => {
      const { fixed, scrollable } = rowPair;
      
      // 提取广告名称 - 从固定行获取
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      for (const element of nameElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && !text.match(/^\s*\$?\d+(\.\d+)?\s*$/)) {
          name = text;
          break;
        }
      }
      
      // 清理广告名称
      name = cleanAdName(name);
      
      // 跳过没有有效名称的行
      if (!name || name === '' || name.match(/^广告\s*\d+$/)) {
        console.log(`Skipping row ${rowIndex} with invalid name: ${name}`);
        return;
      }
      
      // 提取广告ID（从行索引生成）
      const adId = `ad_${rowIndex}`;
      
      // 从可滚动行获取其他数据
      const scrollableElements = scrollable.querySelectorAll('div, span');
      console.log(`Found scrollable elements for ${name}:`, scrollableElements.length);
      
      // 提取各列数据
      const ad = {
        id: adId,
        name: name,
        status: 'ACTIVE',
        campaign_id: `campaign_${rowIndex}`,
        adset_id: `adset_${rowIndex}`,
        impressions: 0,
        increase_impressions: 0,
        reach: 0,
        increase_reach: 0,
        spend: 0,
        increase_spend: 0,
        results: 0,
        increase_results: 0,
        cost_per_result: 0,
        other_events: 0
      };
      
      // 存储所有文本内容用于调试
      const allTexts = [];
      scrollableElements.forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          allTexts.push({ index, text });
          console.log(`Scrollable element ${index} for ${name}: ${text}`);
        }
      });
      
      // 根据截图分析，可滚动行的列顺序可能是：
      // 0: 成效 (Results)
      // 1: 单次成效 (Cost per result)
      // 2: 预算 (Budget)
      // 3: 花费金额 (Spend)
      // 4: 展示次数 (Impressions)
      // 5: 覆盖人数 (Reach)
      
      // 尝试从可滚动行提取数据
      scrollableElements.forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          // 尝试根据位置推断数据类型
          switch (index) {
            case 0:
              ad.results = parseNumber(text);
              break;
            case 1:
              ad.cost_per_result = parseNumber(text);
              break;
            case 3:
              ad.spend = parseNumber(text);
              break;
            case 4:
              ad.impressions = parseNumber(text);
              break;
            case 5:
              ad.reach = parseNumber(text);
              break;
          }
        }
      });
      
      // 输出提取的数据用于调试
      console.log(`Extracted data for ${name}:`, ad);
      
      ads.push(ad);
    });
    
    console.log('Extracted ads from DOM:', ads);
  } catch (error) {
    console.error('Error extracting ads from DOM:', error);
  }
  
  return ads;
}

// 同步广告数据到页面
async function syncAdDataToPage() {
  try {
    // 检查扩展上下文是否有效
    if (!browser || !browser.storage) {
      console.error('Extension context invalid');
      return;
    }
    
    // 如果列索引为空，先获取
    if (Object.keys(columnIndices).length === 0) {
      getColumnIndices();
    }
    
    // 获取存储的所有广告数据
    const storageItems = await browserStorage.get(null);
    const adDataList: AdData[] = [];
    
    // 筛选出广告数据
    for (const key in storageItems) {
      if (key.startsWith('ad_')) {
        adDataList.push(storageItems[key]);
      }
    }
    
    if (adDataList.length === 0) {
      console.log('No ad data found in storage');
      return;
    }
    
    console.log('Found ad data:', adDataList);
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found for sync');
      return;
    }
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found rows for sync:', rowPairs.length);
    
    rowPairs.forEach((rowPair) => {
      const { fixed, scrollable } = rowPair;
      
      // 提取广告名称用于匹配
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      for (const element of nameElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && !text.match(/^\s*\$?\d+(\.\d+)?\s*$/)) {
          name = text;
          break;
        }
      }
      
      // 清理广告名称
      name = cleanAdName(name);
      
      if (!name) return;
      
      // 查找对应的广告数据
      const adData = adDataList.find(data => data.name === name);
      if (!adData) return;
      
      console.log('Syncing data for ad:', name);
      
      // 从可滚动行获取元素并更新
      const scrollableElements = scrollable.querySelectorAll('div, span');
      
      // 尝试更新各列数据
      scrollableElements.forEach((element, index) => {
        // 查找输入元素（考虑到修改是通过弹窗进行的，可能需要特殊处理）
        let input = element.querySelector('input');
        
        // 如果没有找到输入元素，尝试在子元素中查找
        if (!input) {
          const allElements = Array.from(element.querySelectorAll('*'));
          input = allElements.find(el => el instanceof HTMLInputElement);
        }
        
        if (input instanceof HTMLInputElement) {
          switch (index) {
            case 4:
              // 更新展示次数增加字段
              input.value = adData.increase_impressions.toString();
              input.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            case 5:
              // 更新覆盖人数增加字段
              input.value = adData.increase_reach.toString();
              input.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            case 3:
              // 更新花费金额增值字段
              input.value = adData.increase_spend.toString();
              input.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            case 0:
              // 更新加成效字段
              input.value = adData.increase_results.toString();
              input.dispatchEvent(new Event('change', { bubbles: true }));
              break;
          }
        } else {
          // 如果没有输入元素，记录日志
          console.log(`No input element found for index ${index} in ad ${name}`);
        }
      });
    });
  } catch (error: any) {
    // 处理扩展上下文无效的错误
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('Extension context invalidated, stopping sync');
    } else {
      console.error('Error syncing ad data:', error);
    }
  }
}