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
  name: 'reporting_table_column_name',//广告名称
  impressions: 'reporting_table_column_impressions',//展示次数
  reach: 'reporting_table_column_reach',//覆盖次数
  spend: 'reporting_table_column_spend',//花费
  results: 'reporting_table_column_results',//成效
  cost_per_result: 'reporting_table_column_cost_per_result',//单次成效
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
      } else if (message.action === 'refreshPageWithData') {
        // 收到刷新页面的请求，重新同步数据
        syncAdDataToPage().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('Error refreshing page data:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
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

      for (const [field, idPattern] of Object.entries(columnMapping)) {
        if (cellId.includes(idPattern)) {
          columnIndices[field] = index;
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
    const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');
    
    // 先过滤掉没有孙子元素的节点，以及孙子元素是SVG的节点
    const filteredPresentationRows = Array.from(presentationRows).filter((row, index) => {
      const hasGrandchildren = row.children[0]?.children.length > 0;
      const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
      
      if (!hasGrandchildren) {
        // console.log(`Filtering out presentation row ${index} with no grandchildren`);
        return false;
      }
      
      if (!hasNonSvgchildren) {
        // console.log(`Filtering out presentation row ${index} with only SVG grandchildren`);
        return false;
      }
      
      return true;
    });
     console.log('Filtered presentation rows1:', filteredPresentationRows);
    console.log('Filtered presentation rows2:', filteredPresentationRows.length);
    
    // 处理过滤后的节点
    filteredPresentationRows.forEach((presentationRow, index) => {
      console.log(`Processing presentation row ${index}`, presentationRow);
      
      // 获取孙元素（固定行、滚动行和分割线）
      const children = presentationRow.children;
      if (children.length === 1) { // 确保只有一个子元素
        const firstChild = children[0] as HTMLElement;
        const grandchildren = firstChild.children;
        console.log(`Found grandchildren: ${grandchildren.length}`, grandchildren);
        
        if (grandchildren.length >= 2) { // 至少有固定行和滚动行
          const fixed = grandchildren[0] as HTMLElement; // 第一个是固定行数据
          const scrollable = grandchildren[1] as HTMLElement; // 第二个是滚动行数据
          // 第三个是分割线元素，忽略
          
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
    '下拉菜单',
    'ChartsEditDuplicateOpen Drop-down',
    'Edit',
    'Duplicate',
    'Open',
    'Drop-down'
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
function parseNumber(text: string): number | string {
  if (!text) return 0;
  const cleanedText = text.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleanedText);
  return isNaN(num) ? '-' : num;
}

// 从DOM提取广告数据
function extractAdsFromDom() {
  const ads = [];
  
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found');
      return ads;
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('Header row not found');
      return ads;
    }
    
    // 解析表头，确定各列的索引
    const headerCells = Array.from(headerRow.querySelectorAll('[role="columnheader"]'));
    const DomColumnMapping = {};
    
    // 首先找出固定列的数量（通常只有名称列是固定的）
    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，排除子元素的文本
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        console.log(`Header column ${index}: ${text}`);
        
        // 匹配常见的表头文本
        if (text.includes('name') || text.includes('名称')) {
          DomColumnMapping.name = index;
        } else if (text==='results' || text==='成效'|| text==='结果') {
          // 滚动列的索引需要减去固定列的数量
          DomColumnMapping.results = index;
        } else if (text.includes('spend') || text.includes('花费') || text.includes('金额') || text.includes('支出金额')) {
          DomColumnMapping.spend = index;
        } else if (text.includes('impression') || text.includes('展示') || text.includes('印象')) {
          DomColumnMapping.impressions = index;  
        } else if (text.includes('reach') || text.includes('覆盖') || text.includes('抵达')) {
          DomColumnMapping.reach = index;
        } else if (text.includes('per') || text.includes('单次') || text.includes('每次结果成本')) {
          DomColumnMapping.costPerResult = index;
        }
      }
    });
    console.log('Column mapping:', DomColumnMapping);
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found row pairs:',rowPairs, rowPairs.length);
    
    rowPairs.forEach((rowPair, rowIndex) => {
      console.log(`Processing row pair ${rowIndex}`, rowPair);
      const { fixed, scrollable } = rowPair;
      
      // 提取广告名称 - 从固定行获取
      let name = '';
      const nameElements = fixed.querySelectorAll('div, span');
      console.log(`Found fixed length:`, fixed.children[0]?.children?.length-1 || 0);
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
        // console.log(`Skipping row ${rowIndex} with invalid name: ${name}`);
        return;
      }
      
      // 提取广告ID（从行索引生成）
      const adId = `ad_${rowIndex}`;
      
      // 从可滚动行获取其他数据
      const scrollableElements = scrollable.children[0]?.children || [];
      // console.log(`Found scrollable elements for ${name}:`, scrollableElements.length);
      
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
      
      // 检查本地存储中是否有对应的广告数据
      // 注意：这里需要在同步环境中检查，所以使用try-catch
      try {
        // 尝试从本地存储中获取保存的广告数据
        const storedAdData = localStorage.getItem(`ad_${adId}_updated`);
        if (storedAdData) {
          const parsedAdData = JSON.parse(storedAdData);
          // 保留原始值，只恢复增加的值
          ad.increase_impressions = parsedAdData.increase_impressions || 0;
          ad.increase_reach = parsedAdData.increase_reach || 0;
          ad.increase_spend = parsedAdData.increase_spend || 0;
          ad.increase_results = parsedAdData.increase_results || 0;
          console.log(`Found stored ad data for ${name}:`, parsedAdData);
        }
      } catch (error) {
        console.error('Error getting stored ad data:', error);
      }
      
      // // 存储所有文本内容用于调试
      const allTexts = [];
      Array.from(scrollableElements).forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          allTexts.push(`${index}: ${text}`);
        }
      });
      console.log(`Found scrollable elements:`, allTexts);
      
      // 根据表头映射提取数据
      Object.entries(DomColumnMapping).forEach(([key, index]) => {
        const fixIndex = index - (fixed.children[0]?.children?.length-1 || 0);
        console.log(`${name}: Processing ${key} at fixIndex: ${fixIndex} index :${index}`);
        
        if (scrollableElements[fixIndex]) {
          const text = scrollableElements[fixIndex].textContent?.trim();
          if (text) {
            console.log(`${name}: Processing ${key} at index ${fixIndex}: ${text}`);
            // 尝试解析数值
            const cleanedText = text.replace(/[^0-9.]/g, '');
            const num = parseFloat(cleanedText);
            
            if (!isNaN(num) || cleanedText === '0') {
              ad[key] = cleanedText === '0' ? (text?.includes('—') ? '—' : 0) : num;
              console.log(`Extracted ${key} for ${name}: ${ad[key]} (raw: ${text})`);
            }
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
    
    // 筛选出广告数据和列修改值
    const adDataMap = new Map();
    const columnModifications = new Map();
    
    for (const key in storageItems) {
      if (key.endsWith('_updated')) {
        // 完整的广告数据
        const adData = storageItems[key];
        adDataMap.set(adData.id, adData);
      } else if (key.includes('_column_')) {
        // 列修改值
        const parts = key.split('_column_');
        if (parts.length === 2) {
          const adId = parts[0];
          const columnIndex = parts[1];
          if (!columnModifications.has(adId)) {
            columnModifications.set(adId, new Map());
          }
          columnModifications.get(adId)?.set(columnIndex, storageItems[key]);
        }
      }
    }
    
    if (adDataMap.size === 0 && columnModifications.size === 0) {
      console.log('No ad data found in storage');
      return;
    }
    
    console.log('Found ad data map:', adDataMap);
    console.log('Found column modifications:', columnModifications);
    
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found for sync');
      return;
    }
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found rows for sync:', rowPairs.length);
    
    rowPairs.forEach((rowPair, rowIndex) => {
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
      
      // 生成广告ID（与popup中的ID对应）
      const adId = `ad_${rowIndex}`;
      
      // 查找对应的广告数据
      const adData = adDataMap.get(adId);
      const columnMods = columnModifications.get(adId);
      
      if (!adData && !columnMods) return;
      
      console.log('Syncing data for ad:', name, 'ID:', adId);
      
      // 从可滚动行获取元素并更新
      const scrollableElements = scrollable.children[0]?.children || [];
      console.log(`Found scrollable elements: ${scrollableElements.length}`);
      
      // 尝试更新各列数据
      // 按照用户要求：
      // 1. 插件表格左侧显示原始值（从DOM中获取的原值）
      // 2. 右侧显示可输入的增加的值（从本地存储中获取）
      // 3. 保存时两个值都需要保存
      // 4. 在原页面加载完成重新渲染新值时，是把这两个值相加显示在页面上
      // 5. 当修改完成后，插件再次点击查询，需要查询到正确的原始值和前面输入的增加的值
      
      // 首先获取原始值
      const originalValues = new Map();
      Array.from(scrollableElements).forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          const cleanedText = text.replace(/[^0-9.]/g, '');
          const originalValue = parseFloat(cleanedText);
          if (!isNaN(originalValue)) {
            originalValues.set(index, originalValue);
          }
        }
      });
      
      // 然后更新页面上的显示值（原始值 + 增加的值）
      Array.from(scrollableElements).forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          console.log(`Processing element at index ${index}: ${text}`);
          
          // 检查是否有对应的列修改值
          let increaseValue = 0;
          
          if (columnMods) {
            // 根据列索引获取修改值
            const modValue = columnMods.get(index.toString());
            if (modValue) {
              increaseValue = modValue;
            }
          } else if (adData) {
            // 从完整广告数据中获取修改值
            switch (index) {
              case 0: // impressions
                increaseValue = adData.increase_impressions || 0;
                break;
              case 1: // reach
                increaseValue = adData.increase_reach || 0;
                break;
              case 2: // spend
                increaseValue = adData.increase_spend || 0;
                break;
              case 3: // results
                increaseValue = adData.increase_results || 0;
                break;
            }
          }
          
          if (increaseValue > 0) {
            // 获取原始值
            const originalValue = originalValues.get(index) || 0;
            
            // 计算新值：原始值 + 增加的值（简单加法）
            const newValue = originalValue + increaseValue;
            
            // 更新元素的文本内容
            // 注意：这里可能需要根据实际DOM结构调整更新方式
            console.log(`Updating ad ${name} column ${index}: ${originalValue} + ${increaseValue} = ${newValue}`);
            
            // 尝试直接更新文本内容
            if (element.textContent) {
              // 保留原始格式（如货币符号、千位分隔符等）
              // 只替换数字部分，保持其他文本元素不变
              const formattedNewValue = newValue.toFixed(2);
              console.log(`Formatted new value: ${formattedNewValue}`);
              
              // 使用正则表达式匹配数字部分，保留其他文本
              // 匹配所有数字（包括整数和小数）
              const updatedText = text.replace(/(\D*)(\d+(?:\.\d+)?)(\D*)/, (match, prefix, number, suffix) => {
                return prefix + formattedNewValue + suffix;
              });
              console.log(`Updated text: ${updatedText}`);
              // element.textContent = updatedText;
            }
          }
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