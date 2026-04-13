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
  costPerResult: 'reporting_table_column_costPerResult',//单次成效
};

// 存储列索引
let columnIndices: Record<string, number> = {};

// 获取当前日期，格式为YYYY-MM-DD
function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default {
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Content script loaded for Facebook Ads Manager');
    
    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getAdsFromDom') {
        // 处理异步的extractAdsFromDom函数
        extractAdsFromDom().then(({ ads, DomColumnMapping, sortInfo }) => {
          sendResponse({ ads, DomColumnMapping, sortInfo });
        }).catch((error) => {
          console.error('Error extracting ads from DOM:', error);
          sendResponse({ ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null } });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'refreshPageWithData') {
        // 收到刷新页面的请求，重新同步数据
        const sortInfo = message.sortInfo;
        syncAdDataToPage(sortInfo).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('Error refreshing page data:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'getCachedData') {
        // 从缓存中获取数据
        const date = message.date;
        Promise.all([
          browserStorage.get(`ads_${date}`),
          browserStorage.get(`columnMapping_${date}`),
          browserStorage.get(`sortInfo_${date}`),
          browserStorage.get(`ad_modifications_${date}`)
        ]).then(([ads, columnMapping, sortInfo, modifications]) => {
          sendResponse({ ads, columnMapping, sortInfo, modifications });
        }).catch((error) => {
          console.error('Error getting cached data:', error);
          sendResponse({ ads: [], columnMapping: {}, sortInfo: { field: null, direction: null }, modifications: [] });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'saveCachedData') {
        // 保存缓存数据
        const { date, ads, columnMapping, sortInfo } = message;
        Promise.all([
          browserStorage.set(`ads_${date}`, ads),
          browserStorage.set(`columnMapping_${date}`, columnMapping),
          browserStorage.set(`sortInfo_${date}`, sortInfo)
        ]).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('Error saving cached data:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'saveModifications') {
        // 保存修改数据
        const { date, modifications } = message;
        browserStorage.set(`ad_modifications_${date}`, modifications).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('Error saving modifications:', error);
          sendResponse({ success: false, error: error.message });
        });
        // 返回true表示异步响应
        return true;
      } else if (message.action === 'getSortInfo') {
        // 获取排序信息
        const date = message.date;
        browserStorage.get(`sortInfo_${date}`).then((sortInfo) => {
          sendResponse(sortInfo);
        }).catch((error) => {
          console.error('Error getting sort info:', error);
          sendResponse({ field: null, direction: null });
        });
        // 返回true表示异步响应
        return true;
      }
    });
    
    // 立即开始获取缓存数据
    let cachedModifications = null;
    let cachedColumnMapping = null;
    let isSyncing = false;
    const currentDate = getCurrentDate();
    
    // 预加载缓存数据
    const loadCachedData = async () => {
      try {
        // 尝试获取按日期存储的修改数据
        let modifications = await browserStorage.get(`ad_modifications_${currentDate}`);
        let columnMapping = await browserStorage.get(`columnMapping_${currentDate}`);
        
        // 如果没有按日期存储的数据，尝试获取旧的存储
        if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
          modifications = await browserStorage.get('ad_modifications');
          console.log('Using old ad_modifications:', modifications);
        }
        
        if (!columnMapping || Object.keys(columnMapping).length === 0) {
          columnMapping = await browserStorage.get('columnMapping');
          console.log('Using old columnMapping:', columnMapping);
        }
        
        cachedModifications = modifications;
        cachedColumnMapping = columnMapping;
        console.log('Preloaded cached data:', { modifications, columnMapping });
        
        // 数据加载完成后立即尝试同步
        if (cachedModifications) {
          await syncAdDataToPage();
        }
      } catch (error) {
        console.error('Error loading cached data:', error);
      }
    };
    
    // 立即加载缓存数据
    loadCachedData();
    
    // 防抖函数
    let syncTimeout = null;
    const debouncedSync = async () => {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        if (!isSyncing) {
          isSyncing = true;
          try {
            await getColumnIndices();
            await syncAdDataToPage();
          } catch (error) {
            console.error('Error in debounced sync:', error);
          } finally {
            isSyncing = false;
          }
        }
      }, 100);
    };
    
    // 使用MutationObserver来拦截页面渲染
    const observer = new MutationObserver((mutations) => {
      // 检查是否有表格相关的DOM变化
      const hasTableChanges = mutations.some(mutation => {
        // 检查添加的节点
        const hasAddedTableNodes = Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            return element.querySelector('[role="table"]') || 
                   element.querySelector('[role="row"]') ||
                   element.querySelector('[role="columnheader"]') ||
                   element.classList.contains('_3hi') || // 表格容器类
                   element.classList.contains('_1mie'); // 表格容器类
          }
          return false;
        });
        
        // 检查属性变化（例如样式变化）
        const hasAttributeChanges = mutation.type === 'attributes' && 
                                   mutation.target.nodeType === Node.ELEMENT_NODE &&
                                   (mutation.attributeName === 'style' || 
                                    mutation.attributeName === 'class');
        
        return hasAddedTableNodes || hasAttributeChanges;
      });
      
      if (hasTableChanges) {
        debouncedSync();
      }
    });
    
    // 开始观察页面变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true // 增加对属性变化的监听
    });
    
    // 同时设置多个定时器，确保在页面加载的不同阶段都能同步数据
    setTimeout(debouncedSync, 0);    // 立即执行
    setTimeout(debouncedSync, 500);  // 半秒后执行
    setTimeout(debouncedSync, 1000); // 1秒后执行
  }
};

// 获取列索引
async function getColumnIndices() {
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
    
    // 确保所有必要的列都被找到
    const requiredFields = ['impressions', 'reach', 'spend', 'results', 'costPerResult'];
    const missingFields = requiredFields.filter(field => !columnIndices[field]);
    
    if (missingFields.length > 0) {
      console.log('Missing column indices for fields:', missingFields);
      // 尝试再次获取，可能表头还没有完全加载
      await new Promise(resolve => setTimeout(resolve, 100));
      await getColumnIndices();
    } else {
      console.log('Column indices:', columnIndices);
    }
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
async function extractAdsFromDom() {
  const ads = [];
  const DomColumnMapping = {};
  
  // 存储排序信息
  const sortInfo = {
    field: null,
    direction: null
  };
  
  try {
    // 找到表格容器
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found');
      return { ads, DomColumnMapping, sortInfo };
    }
    
    // 找到表头行
    const headerRow = tableContainer.querySelector('[role="row"]');
    if (!headerRow) {
      console.log('Header row not found');
      return { ads, DomColumnMapping, sortInfo };
    }
    
    // 解析表头，确定各列的索引
    const headerCells = Array.from(headerRow.querySelectorAll('[role="columnheader"]'));
    
    // 首先找出固定列的数量（通常只有名称列是固定的）
    headerCells.forEach((cell, index) => {
      // 获取单元格的文本内容，排除子元素的文本
      const text = cell.textContent?.trim().toLowerCase();
      if (text) {
        console.log(`Header column ${index}: ${text}`);
        
        // 匹配常见的表头文本
        if (text==='Campaign' || text==='活动'||text==='ad set' || text==='广告组'|| text==='ad' || text==='广告') {
          DomColumnMapping.name = index;
        } else if (text==='results' || text==='成效'|| text==='结果') {
          // 滚动列的索引需要减去固定列的数量
          DomColumnMapping.results = index;
        } else if (text==='amount spent' || text==='花费' || text==='金额' || text==='支出金额') {
          DomColumnMapping.spend = index;
        } else if (text==='impressions' || text==='展示' || text==='印象') {
          DomColumnMapping.impressions = index;  
        } else if (text==='reach' || text==='覆盖' || text==='抵达') {
          DomColumnMapping.reach = index;
        } else if (text==='cost per result' || text==='单次成效' || text==='每次结果成本') {
          DomColumnMapping.costPerResult = index;
        }
      }
    });
    console.log('Dom Column mapping:', DomColumnMapping);
    
    // 获取表格数据行对
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found row pairs:',rowPairs, rowPairs.length);
    
    // 使用for循环代替forEach，确保异步操作按顺序完成
    for (let rowIndex = 0; rowIndex < rowPairs.length; rowIndex++) {
      const rowPair = rowPairs[rowIndex];
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
        continue;
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
        costPerResult: 0,
        other_events: 0,
        website_clicks: 0,
        increase_website_clicks: 0,
        registrations: 0,
        increase_registrations: 0,
        registration_cost: 0,
        increase_registration_cost: 0
      };
      
      // 检查本地存储中是否有对应的广告数据
      try {
        // 获取当前日期，格式为YYYY-MM-DD
        const getCurrentDate = () => {
          const now = new Date();
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        };
        
        // 从新的缓存结构中获取数据
        const currentDate = getCurrentDate();
        const modificationsArray = await browserStorage.get(`ad_modifications_${currentDate}`);
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray[rowIndex]) {
          const rowData = modificationsArray[rowIndex];
          if (rowData && rowData.modifiedFields) {
            // 恢复增加的值
            ad.increase_impressions = rowData.modifiedFields.impressions || 0;
            ad.increase_reach = rowData.modifiedFields.reach || 0;
            ad.increase_spend = rowData.modifiedFields.spend || 0;
            ad.increase_results = rowData.modifiedFields.results || 0;
            ad.increase_website_clicks = rowData.modifiedFields.website_clicks || 0;
            ad.increase_registrations = rowData.modifiedFields.registrations || 0;
            ad.increase_registration_cost = rowData.modifiedFields.registration_cost || 0;
            console.log(`Found stored ad data for ${name}:`, rowData);
          }
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
      console.log(`Found scrollable elements:`,DomColumnMapping, allTexts);
      
      // 根据表头映射提取数据
      Object.entries(DomColumnMapping).forEach(([key, index]) => {
        console.log(`${name}: Processing ${key} at index ${index}`);
        // 计算滚动列的索引（减去固定列的数量）
        const fixIndex = index - (fixed.children[0]?.children?.length-1 || 0);
        console.log(`${name}: Processing ${key} at fixIndex: ${fixIndex} index :${index}`);
        
        // 尝试使用计算的fixIndex
        let targetElement = scrollableElements[fixIndex];
        
        
        if (targetElement) {
          const text = targetElement.textContent?.trim();
          if (text) {
            console.log(`${name}: Processing ${key} at index ${fixIndex}: ${text}`);
            // 尝试解析数值
            const cleanedText = text.replace(/[^0-9.]/g, '');
            const num = parseFloat(cleanedText);
            
            if (!isNaN(num) || cleanedText === '0') {
              // 计算原始值
              let originalValue = cleanedText === '0' ? (text?.includes('—') ? '—' : 0) : num;
              
              // 如果有保存的增加值，需要从DOM中提取的值中减去增加值，得到原始值
              if (typeof originalValue === 'number') {
                if (key === 'impressions' && ad.increase_impressions !== undefined && ad.increase_impressions !== 0) {
                  originalValue = originalValue - ad.increase_impressions;
                } else if (key === 'reach' && ad.increase_reach !== undefined && ad.increase_reach !== 0) {
                  originalValue = originalValue - ad.increase_reach;
                } else if (key === 'spend' && ad.increase_spend !== undefined && ad.increase_spend !== 0) {
                  originalValue = originalValue - ad.increase_spend;
                } else if (key === 'results' && ad.increase_results !== undefined && ad.increase_results !== 0) {
                  originalValue = originalValue - ad.increase_results;
                }
              }
              
              ad[key] = originalValue;
              console.log(`Extracted ${key} for ${name}: ${ad[key]} (raw: ${text}, increase: ${ad[`increase_${key}`]})`);
            }
          }
        } else {
          console.log(`${name}: No element found for ${key} at index ${fixIndex}`);
        }
      });
      
      // 输出提取的数据用于调试
      console.log(`Extracted data for ${name}:`, ad);
      
      ads.push(ad);
    }
    
    console.log('Extracted ads from DOM:', ads);
    
    // 根据数据判断排序字段和方向
    if (ads.length > 1) {
      // 可能的排序字段
      const possibleFields = ['impressions', 'reach', 'spend', 'results'];
      
      for (const field of possibleFields) {
        // 检查是否按该字段降序排序
        let isDescending = true;
        for (let i = 0; i < ads.length - 1; i++) {
          if (ads[i][field] < ads[i + 1][field]) {
            isDescending = false;
            break;
          }
        }
        
        // 检查是否按该字段升序排序
        let isAscending = true;
        for (let i = 0; i < ads.length - 1; i++) {
          if (ads[i][field] > ads[i + 1][field]) {
            isAscending = false;
            break;
          }
        }
        
        if (isDescending) {
          sortInfo.field = field;
          sortInfo.direction = 'desc';
          break;
        } else if (isAscending) {
          sortInfo.field = field;
          sortInfo.direction = 'asc';
          break;
        }
      }
    }
    
    console.log('Detected sort info:', sortInfo);
    
    // 保存DomColumnMapping到浏览器存储
    try {
      if (browser && browser.storage) {
        await browser.storage.local.set({ DomColumnMapping });
        console.log('Saved DomColumnMapping to storage:', DomColumnMapping);
      }
    } catch (error) {
      console.error('Error saving DomColumnMapping:', error);
    }
  } catch (error) {
    console.error('Error extracting ads from DOM:', error);
  }
  
  return { ads, DomColumnMapping, sortInfo };
}

// 同步广告数据到页面
async function syncAdDataToPage(sortInfo = null) {
  console.log('Starting syncAdDataToPage function with sort info:', sortInfo);
  try {
    // 检查扩展上下文是否有效
    if (!browser || !browser.storage) {
      console.error('Extension context invalid');
      return;
    }
    
    console.log('Extension context is valid');
    
    // 确保列索引已获取
    if (Object.keys(columnIndices).length === 0) {
      console.log('Column indices are empty, getting them');
      await getColumnIndices();
      console.log('Got column indices:', columnIndices);
    }
    
    // 获取存储的所有广告数据
    console.log('Getting storage items');
    const currentDate = getCurrentDate();
    let modificationsArray = await browserStorage.get(`ad_modifications_${currentDate}`);
    
    // 如果没有按日期存储的数据，尝试获取旧的存储
    if (!modificationsArray || !Array.isArray(modificationsArray) || modificationsArray.length === 0) {
      modificationsArray = await browserStorage.get('ad_modifications');
      console.log('Using old ad_modifications:', modificationsArray);
      
      if (!modificationsArray || !Array.isArray(modificationsArray) || modificationsArray.length === 0) {
        console.log('No ad data found in storage');
        return;
      }
    }
    
    // 过滤出有效的修改数据
    const validModifications = modificationsArray.filter(item => item !== undefined);
    console.log('Valid modifications:', validModifications);
    
    // 根据排序信息对数据进行排序
    if (sortInfo && sortInfo.field && sortInfo.direction) {
      console.log('Sorting data by:', sortInfo.field, sortInfo.direction);
      validModifications.sort((a, b) => {
        const field = sortInfo.field;
        const valueA = a.completeData[field] || 0;
        const valueB = b.completeData[field] || 0;
        
        if (sortInfo.direction === 'asc') {
          return valueA - valueB;
        } else {
          return valueB - valueA;
        }
      });
      console.log('Sorted modifications:', validModifications);
    }
    
    console.log('Found modifications array:', modificationsArray);
    
    // 找到表格容器
    console.log('Finding table container');
    const tableContainer = findTableContainer();
    
    if (!tableContainer) {
      console.log('Table container not found for sync');
      return;
    }
    
    console.log('Found table container:', tableContainer);
    
    // 获取表格数据行对
    console.log('Getting table data rows');
    const rowPairs = getTableDataRows(tableContainer);
    console.log('Found rows for sync:', rowPairs.length);
    
    rowPairs.forEach(async(rowPair, rowIndex) => {
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
      
      // 从修改数组中获取对应行的数据
      let rowData;
      if (sortInfo && sortInfo.field && sortInfo.direction) {
        // 如果有排序信息，使用排序后的数据
        rowData = validModifications[rowIndex];
      } else {
        // 否则使用原始数组的数据
        rowData = modificationsArray[rowIndex];
      }
      
      if (!rowData) return;
      
      console.log('Syncing data for ad:', name, 'ID:', adId, 'Row data:', rowData);
      
      // 检查整行是否有修改
      if (!rowData.modifiedFields || Object.keys(rowData.modifiedFields).length === 0) {
        console.log(`No modifications for ad ${name}, skipping update`);
        return;
      }
      
      // 从可滚动行获取元素并更新
      const scrollableElements = scrollable.children[0]?.children || [];
      console.log(`Found scrollable elements: ${scrollableElements.length}`);
      
      // 1. 插件表格左侧显示原始值（从DOM中获取的原值）
      // 2. 右侧显示可输入的增加的值（从本地存储中获取）
      // 3. 保存时两个值都需要保存
      // 4. 在原页面加载完成重新渲染新值时，是把这两个值相加显示在页面上
      // 5. 当修改完成后，插件再次点击查询，需要查询到正确的原始值和前面输入的增加的值
      const currentDate = getCurrentDate();
      let DomColumnMapping = await browserStorage.get(`columnMapping_${currentDate}`);
      console.log('Dom Column mapping:', DomColumnMapping);
      
      // 如果没有找到按日期存储的DomColumnMapping，尝试获取旧的存储
      if (!DomColumnMapping || Object.keys(DomColumnMapping).length === 0) {
        const oldDomColumnMapping = await browserStorage.get('DomColumnMapping');
        if (oldDomColumnMapping && Object.keys(oldDomColumnMapping).length > 0) {
          console.log('Using old DomColumnMapping:', oldDomColumnMapping);
          DomColumnMapping = oldDomColumnMapping;
        } else {
          // 尝试获取不带日期的columnMapping
          const oldColumnMapping = await browserStorage.get('columnMapping');
          if (oldColumnMapping && Object.keys(oldColumnMapping).length > 0) {
            console.log('Using old columnMapping:', oldColumnMapping);
            DomColumnMapping = oldColumnMapping;
          } else {
            console.error('No DomColumnMapping found');
            return;
          }
        }
      }
      
      const fixIndex = fixed.children[0]?.children?.length-1;
      
      // 然后更新页面上的显示值（原始值 + 增加的值）
      Array.from(scrollableElements).forEach((element, index) => {
        console.log(`Processing element at index ${index}: `,DomColumnMapping, element);
        const text = element.textContent?.trim();
        if (text) {
          // 检查是否有对应的列修改值
          let increaseValue = 0;
          let originalValueFromData = 0;
          let hasModification = false;
          
          // 根据DomColumnMapping确定字段类型
          if (index === DomColumnMapping.results-fixIndex) {
            // 成效 (results)
            if (rowData?.modifiedFields?.results !== undefined) {
              increaseValue = rowData.modifiedFields.results || 0;
              originalValueFromData = rowData.completeData?.results || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.reach-fixIndex) {
            // 覆盖人数 (reach)
            if (rowData?.modifiedFields?.reach !== undefined) {
              increaseValue = rowData.modifiedFields.reach || 0;
              originalValueFromData = rowData.completeData?.reach || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.spend-fixIndex) {
            // 花费 (spend)
            if (rowData?.modifiedFields?.spend !== undefined) {
              increaseValue = rowData.modifiedFields.spend || 0;
              originalValueFromData = rowData.completeData?.spend || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.impressions-fixIndex) {
            // 展示次数 (impressions)
            if (rowData?.modifiedFields?.impressions !== undefined) {
              increaseValue = rowData.modifiedFields.impressions || 0;
              originalValueFromData = rowData.completeData?.impressions || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.costPerResult-fixIndex) {
            // 每次结果成本 (costPerResult)
            if (rowData?.modifiedFields?.costPerResult !== undefined) {
              increaseValue = rowData.modifiedFields.costPerResult || 0;
              originalValueFromData = rowData.completeData?.costPerResult || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.website_clicks-fixIndex) {
            // 网站点击 (website_clicks)
            if (rowData?.modifiedFields?.website_clicks !== undefined) {
              increaseValue = rowData.modifiedFields.website_clicks || 0;
              originalValueFromData = rowData.completeData?.website_clicks || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.registrations-fixIndex) {
            // 注册 (registrations)
            if (rowData?.modifiedFields?.registrations !== undefined) {
              increaseValue = rowData.modifiedFields.registrations || 0;
              originalValueFromData = rowData.completeData?.registrations || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          } else if (index === DomColumnMapping.registration_cost-fixIndex) {
            // 注册成本 (registration_cost)
            if (rowData?.modifiedFields?.registration_cost !== undefined) {
              increaseValue = rowData.modifiedFields.registration_cost || 0;
              originalValueFromData = rowData.completeData?.registration_cost || 0;
              hasModification = true;
              console.log(`Processing element at index ${index}: ${text}`);
              console.log(`Original value from data: `, originalValueFromData);
              console.log(`Increase value: `, increaseValue);
            }
          }
            
          // 只有当当前列有修改时才更新
          if (hasModification) {
            // 检查原始值是否为--且新增值为0
            const currentText = element.textContent?.trim();
            const isOriginalDash = currentText.includes('—');
            const isIncreaseZero = increaseValue === 0;
            
            // 如果原始值是--且新增值为0，则不更新
            if (isOriginalDash && isIncreaseZero) {
              console.log(`Skipping update for ad ${name} column ${index}: original value is — and increase value is 0`);
              return;
            }
            
            // 当increaseValue为0时，也需要更新，恢复为原始值
            // 计算新值：使用插件传来的原值 + 增加的值
            const newValue = originalValueFromData + increaseValue;
            
            // 更新元素的文本内容
            console.log(`Updating ad ${name} column ${index}: ${originalValueFromData} + ${increaseValue} = ${newValue}`);
            
            // 递归查找并更新DOM元素
            function findAndUpdateElement(el: Element) {
              if (el.children.length > 0) {
                // 
                if(el.children?.[0] instanceof HTMLElement){
                  findAndUpdateElement(el.children?.[0]);
                } else {
                  console.log(`Skipping non-HTMLElement child: ${el.children?.[0]}`);
                }
              } else {
                // 找到最终的文本元素
                console.log(`Updating element innerText: ${el.innerText}`);
                
                // 保存原始文本，用于提取货币符号
                const originalText = el.innerText;
                
                // 根据字段类型决定显示格式
                if (index === DomColumnMapping.spend-fixIndex) {
                  // 花费字段：保留2位小数，保留货币符号
                  console.log(`Updating spend field: ${newValue.toFixed(2)}`);
                  
                  // 提取货币符号（如果有）
                  const currencyMatch = originalText.match(/^[^0-9]+/);
                  const currencySymbol = currencyMatch ? currencyMatch[0] : '';
                  
                  // 保留货币符号并更新数值
                  console.log(`Currency symbol: ${currencySymbol}`);
                  el.innerText = currencySymbol + newValue.toFixed(2);
                } else {
                  // 其他字段：整数
                  console.log(`Updating non-spend field: ${Math.round(newValue)}`);
                  el.innerText = Math.round(newValue).toString();
                }
              }
            }
            
            // 开始递归查找
            findAndUpdateElement(element);
          } else {
            console.log(`No modification for ad ${name} column ${index}, skipping update`);
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