// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { hierarchyManager } from './hierarchy';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { footerMapping } from './config';
import { getCurrentPageState, findTableContainer, getColumnIndices, getColumnIndicesSync, getFilteredRows, findInnermostElement, extractAdsFromDom } from './dom';

// 更新合计行数据
export async function updateFooterData(totals: any, currencySymbol: string): Promise<void> {
  if (totals) {

    // 构建合计行的字段
    const footerFields: Record<string, number> = {};
    const footerIncreaseFields: Record<string, number> = {};
    
    // 处理数值字段
    const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
    numericFields.forEach(field => {
      if (totals[field] !== undefined) {
        footerFields[field] = totals[field];
      }
      if (totals[`increase_${field}`] !== undefined) {
        footerIncreaseFields[field] = totals[`increase_${field}`];
      }
    });
    
    // 处理费用字段
    const costFields = ['registration_cost', 'purchase_cost', 'costPerResult', 'spend'];
    costFields.forEach(field => {
      if (totals[field] !== undefined) {
        // 提取数值
        const valueStr = String(totals[field]);
        const value = parseFloat(valueStr.replace(/[^\d.-]/g, '')) || 0;
        footerFields[field] = value;
      }
    });
    
    // 更新合计行
    await updateFooterRow(footerFields, footerIncreaseFields, currencySymbol);
  }
}

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { ads, DomColumnMapping, sortInfo, currencySymbol, dateRanges } = await extractAdsFromDom();
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      // 生成缓存键
      const adsKey = await generateCacheKey('ads');
      
      // 保存到缓存
      const pageState = getCurrentPageState() || {};
      const level = pageState.level || 'Campaigns';
      const cacheData = { 
        ads: ads, 
        columnMapping: DomColumnMapping,
        level,
        currencySymbol
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      console.log('已从DOM提取数据并缓存:', { ads: ads.length, level, currencySymbol });
      
      sendResponse({ 
        success: true, 
        ads: ads, 
        DomColumnMapping, 
        sortInfo,
        level: level,
        currencySymbol,
        dateRanges
      });
    } catch (error: any) {
      console.error('从DOM获取数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 查找表格容器和表体
function findTableBody(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('刷新页面数据: 未找到表格容器');
    return null;
  }
  
  const headerRow = tableContainer.querySelector('[role="row"]');
  if (!headerRow) {
    console.warn('刷新页面数据: 未找到表头行');
    return null;
  }
  
  const tableBody = headerRow.nextElementSibling;
  if (!tableBody) {
    console.warn('刷新页面数据: 未找到表体');
    return null;
  }
  
  return tableBody as HTMLElement;
}

// 查找合计行
export function findFooterRow(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('刷新页面数据: 未找到表格容器');
    return null;
  }
  
  // 查找带有data-pagelet="FixedDataTableNew_footerRow"属性的元素
  const footerRow = tableContainer.querySelector('[data-pagelet="FixedDataTableNew_footerRow"] > span > div > div > div');
  if (!footerRow) {
    console.warn('刷新页面数据: 未找到合计行');
    return null;
  }
  
  return footerRow as HTMLElement;
}

// 根据ID查找行
function findRowById(rows: Array<HTMLElement>, id: string): { row: HTMLElement; fixed: HTMLElement; scrollable: HTMLElement } | null {
  console.log(`查找ID为 ${id} 的行`);
  console.log(`  → 行数量: ${rows.length}`, rows);
  
  // 获取当前页面层级
  const pageState = getCurrentPageState();
  const currentLevel = pageState.level || 'Campaigns';
  console.log(`  → 当前层级: ${currentLevel}`);
  
  // 获取列索引
  const columnIndices = getColumnIndicesSync();
  
  // 根据当前层级选择正确的ID列名
  const idColumn = {
    Ads: 'ad_id',
    Adsets: 'adset_id',
    Campaigns: 'campaign_id'
  }[currentLevel] || 'campaign_id';
  console.log(`  → 使用ID列: ${idColumn}`);
  
  for (const row of rows) {
    const children = row.children;
    console.log(`  → 子元素数量: ${children.length}`, children);
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;
      
      if (grandchildren.length >= 2) {
        const fixed = grandchildren[0] as HTMLElement;
        const scrollable = grandchildren[1] as HTMLElement;
        
        // 计算固定列长度
        const fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
        
        // 尝试通过ID查找行
        const scrollableCells = scrollable.children[0]?.children || [];
        if (scrollableCells.length > 0) {
          const idColumnIndex = columnIndices[idColumn];
          if (idColumnIndex !== undefined) {
            // 计算滚动列的索引（减去固定列的长度）
            const scrollableColumnIndex = idColumnIndex - fixedColumnLength;
            // console.log(`  → 固定列长度: ${fixedColumnLength}, ${idColumn}列索引: ${idColumnIndex}, 滚动列索引: ${scrollableColumnIndex}`);
            if (scrollableColumnIndex >= 0 && scrollableCells[scrollableColumnIndex]) {
              const idCell = scrollableCells[scrollableColumnIndex];
              const idText = idCell?.textContent?.trim() || '';
              // console.log(`缓存数据id:${id}  → ${idColumn}单元格文本: ${idText}`);
              if (idText === id) {
                return { row, fixed, scrollable };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

// 更新单元格数据
export function updateCell(cell: Element, field: string, value: number, increaseValue: number, currencySymbol: string = '$'): void {
  // 找到最内层的DOM元素进行更新
  const innermostElement = findInnermostElement(cell);
  
  // 定义金额字段列表
  const currencyFields = ['spend', 'registration_cost', 'purchase_cost', 'costPerResult'];
  
  // 如果是金额字段，保留货币符号
  if (currencyFields.includes(field)) {
    innermostElement.textContent = currencySymbol + (value.toFixed(2)?.toLocaleString() || '');
  } else {
    innermostElement.textContent = value?.toLocaleString() || '';
  }
  // 添加 data-add-value 属性，存储增加值
  innermostElement.setAttribute('data-add-value', String(increaseValue));
}

// 更新行数据
async function updateRowData(scrollable: HTMLElement, fixed: HTMLElement, fields: Record<string, number>, increaseFields: Record<string, number>, currencySymbol: string = '$'): Promise<void> {
  // 获取列索引
  const columnIndices = await getColumnIndices();
  
  // 计算固定列长度
  const fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
  
  // 更新行数据
  const cells = scrollable.children[0]?.children || [];
  
  for (const [field, value] of Object.entries(fields)) {
    const originalIndex = columnIndices[field];
    if (originalIndex !== undefined) {
      // 计算滚动列的索引（减去固定列的长度）
      const columnIndex = originalIndex - fixedColumnLength;
      if (columnIndex >= 0 && cells[columnIndex]) {
        const cell = cells[columnIndex];
        const increaseValue = increaseFields[field] || 0;
        updateCell(cell, field, value, increaseValue, currencySymbol);
      }
    }
  }
}

// 更新合计行数据
async function updateFooterRow(fields: Record<string, number>, increaseFields: Record<string, number>, currencySymbol: string = '$'): Promise<void> {
  // 查找合计行
  const footerRow = findFooterRow();
  if (!footerRow) {
    console.warn('更新合计行数据: 未找到合计行');
    return;
  }
  
  
  // 找到可滚动列部分
  const cells = footerRow.children?.[1]?.children[0]?.children || [];
  if (!cells) {
    console.warn('更新合计行数据: 未找到可滚动列部分');
    return;
  }
  console.log('可滚动列部分:', cells, fields, increaseFields);
  
  for (const [field, value] of Object.entries(fields)) {
    const cellnode = Array.from(cells).find(cell => (cell as HTMLElement)?.dataset?.surface?.trim()?.includes(footerMapping[field]));
    if (!cellnode) {
      console.warn(`更新合计行数据: 未找到字段 ${field} 对应的单元格`);
      continue;
    }
    if (cellnode) {
      const increaseValue = increaseFields[field] || 0;
      const currentValue = Number((Number(value) + Number(increaseValue)).toFixed(2));
      updateCell(cellnode, field, currentValue, increaseValue, currencySymbol);  
    }
  }
  console.log('已更新合计行数据');
}
// 排序缓存的广告数据根据排序字段
async function sortCacheIds(modifications: any[] = [], ads: any[] = [], sortField: string, sortDirection: string): Promise<string[]> {
    // 应用修改数据到广告数据
  if (modifications && Array.isArray(modifications) && modifications.length > 0) {
    ads = ads.map((ad: any) => {
      let updatedAd = { ...ad };
      // 确保increaseValues对象存在
      if (!updatedAd.increaseValues) {
        updatedAd.increaseValues = {};
      }
      // 查找对应的修改记录
      const modification = modifications.find(mod => {
        return mod?.completeData?.id?.toString() === ad.id || 
                mod?.completeData?.ad_id?.toString() === ad.id || 
                mod?.completeData?.adset_id?.toString() === ad.id || 
                mod?.completeData?.campaign_id?.toString() === ad.id;
      });
      
      // 应用修改值
      if (modification) {
        for (const [field, value] of Object.entries(modification.modifiedFields)) {
          updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
        }
      }
      
      return updatedAd;
    });
  }
  
  // 对广告数据进行排序
  ads.sort((a: any, b: any) => {
    // 检查排序字段是否有数值
    const originalValueA = a[sortField];
    const originalValueB = b[sortField];
    const hasValueA = originalValueA !== undefined && originalValueA !== null && originalValueA !== '—' && originalValueA !== '';
    const hasValueB = originalValueB !== undefined && originalValueB !== null && originalValueB !== '—' && originalValueB !== '';
    
    // 处理没有数值的行，永远排在有数值的行的后面
    if (!hasValueA && hasValueB) {
      return 1; // a 没有数值，b 有数值，a 排在后面
    } else if (hasValueA && !hasValueB) {
      return -1; // a 有数值，b 没有数值，a 排在前面
    } else if (!hasValueA && !hasValueB) {
      return 0; // 两者都没有数值，保持原始顺序
    }
    
    // 对有数值的行进行排序
    let valueA = 0;
    let valueB = 0;
    
    // 获取原始值
    if (a[sortField] !== undefined) {
      valueA = parseFloat(String(a[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    if (b[sortField] !== undefined) {
      valueB = parseFloat(String(b[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    
    // 加上增加值
    if (a.increaseValues && a.increaseValues[sortField]) {
      valueA += a.increaseValues[sortField];
    }
    if (b.increaseValues && b.increaseValues[sortField]) {
      valueB += b.increaseValues[sortField];
    }
    
    if (sortDirection === 'desc') {
      return valueB - valueA;
    } else {
      return valueA - valueB;
    }
  });
  
  // 获取排序后的广告id数组
  const sortedAdIds = ads.map((ad: any) => ad.id);
  return sortedAdIds;
}
// 排序表格行
export async function sortTableRows(modifications: any[] = []): Promise<void> {
  try {
    // 获取当前页面状态和排序信息
    const pageState = getCurrentPageState();
    const { field, direction } = pageState;
    
    if (!field) {
      console.log('没有排序字段，跳过排序');
      return;
    }
    
    // 找到表体
    const tableBody = findTableBody();
    if (!tableBody) {
      console.warn('排序表格行: 未找到表体');
      return;
    }
    
    // 获取tableBody中的span子元素
    const spanElements = Array.from(tableBody.children).filter((child: Element) => child.tagName === 'SPAN');
    console.log('找到的span元素数量:', spanElements.length);
    
    // 收集所有span元素及其translate值
    const spanInfoArray: Array<{ span: Element; adId: string; translateElement: Element | null; originalIndex: number }> = [];
    
    spanElements.forEach((span, index) => {
      // 获取span的adId
      const surface = span.getAttribute('data-surface') || '';
      // 修改正则表达式，确保能正确匹配 adId
      const adIdMatch = surface.match(/(?<=table_row:)(\d+)(?=unit)/);
      const adId = adIdMatch ? adIdMatch[1] : null;
      console.log(`行 ${index} surface: ${surface}, adId: ${adId}`);
      if (adId) {
        // 找到带有translate样式的子元素（span的唯一子元素）
        let translateElement: Element | null = span.firstElementChild;
        
        spanInfoArray.push({ span, adId, translateElement, originalIndex: index });
        console.log(`行 ${index} adId: ${adId}, originalIndex: ${index}, translateElement: ${translateElement}`);
      }
    });
    
    // 获取缓存数据
    const adsKey = await generateCacheKey('ads');
    const adsData = await browserStorage.get(adsKey);
    
    let ads: any[] = [];
    if (adsData && adsData.cacheData && adsData.cacheData.ads) {
      ads = adsData.cacheData.ads;
    }
    
    // 确保所有span元素都有对应的广告数据
    const allAdIds = spanInfoArray.map(info => info.adId);
    const existingAdIds = new Set(ads.map(ad => ad.id));
    
    // 为没有缓存数据的span元素创建默认广告数据
    allAdIds.forEach(adId => {
      if (!existingAdIds.has(adId)) {
        ads.push({
          id: adId,
          increaseValues: {},
          [field]: '—' // 设置排序字段为'—'，表示没有数值
        });
      }
    });
    
    console.log('排序前的广告id数组:', JSON.stringify(ads?.map((ad: any) => ad.id)));
    // 获取排序后的广告id数组
    const sortedAdIds = await sortCacheIds(modifications, ads, field, direction as string);
    console.log('排序后的广告id数组:', JSON.stringify(sortedAdIds));
    
    // 计算基准translate值，按照行索引生成
    const baseTranslateValues: string[] = [];
    spanElements.forEach((_, index) => {
      // 每行的translate值为 0px, 46px, 92px, 138px, ...
      const translateValue = `${index * 46}px`;
      baseTranslateValues.push(translateValue);
    });
    console.log('基准translate值列表:', baseTranslateValues);
    console.log('排序后的广告id数组:', sortedAdIds);
    
    // 为每个排序后的adId分配对应的translate值
    sortedAdIds.forEach((adId, index) => {
      if (index < baseTranslateValues.length) {
        // 找到对应的span信息
        const spanInfo = spanInfoArray.find(info => info.adId === adId);
        
        if (spanInfo && spanInfo.translateElement) {
          const newTranslate = baseTranslateValues[index];
          (spanInfo.translateElement as HTMLElement).style.transform = `translate(0px, ${newTranslate})`;
          // 验证修改是否成功
          const updatedTransform = (spanInfo.translateElement as HTMLElement).style.transform;
          console.log(`更新广告行 ${adId} 的translate值为: ${newTranslate}, 更新后transform: ${updatedTransform}`);
        } else {
          console.warn(`未找到广告行 ${adId} 的translate元素`);
        }
      }
    });
    
    // 保存translate值和行id到缓存
    const translateCache = sortedAdIds.map((adId, index) => ({
      adId,
      translate: baseTranslateValues[index] || ''
    }));
    browserStorage.set('adTranslateValues', translateCache);
    console.log('已保存translate值到StorageManager:', translateCache.length, '个值');
    
    console.log('表格行排序完成');
  } catch (error) {
    console.error('排序表格行错误:', error);
  }
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(data: { sortInfo: any; date: string; modifications: any[]; totals?: any }, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log(`[${new Date().toISOString()}] 刷新页面数据:`, data);
      
      const { modifications, totals } = data;
      
      // 找到表体
      const tableBody = findTableBody();
      if (!tableBody) {
        sendResponse({ success: false, error: '未找到表格结构' });
        return;
      }
      
      // 过滤有效的行
      const filteredRows = getFilteredRows(tableBody);
      
      // 处理每个修改项
      let successCount = 0;
      let failCount = 0;
      let currencySymbol = '$';
      
      // 从DOM中提取当前数据，确保按照DOM顺序处理
      const { ads: currentAds } = await extractAdsFromDom();
      
      // 获取当前页面层级
      const pageState = getCurrentPageState();
      const currentLevel = pageState.level || 'Campaigns';
      
      // 按照DOM顺序处理修改数据
      for (const ad of currentAds) {
        // 找到对应广告的修改项
        const modification = modifications.find(mod => {
          if (!mod || !mod.completeData) return false;
          
          // 根据当前层级选择正确的ID进行匹配
          switch (currentLevel) {
            case 'Ads':
              return mod.completeData.ad_id === ad.ad_id || mod.completeData.id === ad.ad_id;
            case 'Adsets':
              return mod.completeData.adset_id === ad.adset_id || mod.completeData.id === ad.adset_id;
            case 'Campaigns':
              return mod.completeData.campaign_id === ad.campaign_id || mod.completeData.id === ad.campaign_id;
            default:
              return mod.completeData.id === ad.id;
          }
        });
        
        if (modification && modification.completeData) {
          const { completeData, modifiedFields } = modification;
          const id = completeData.id;
          // 保存货币符号
          currencySymbol = completeData.currencySymbol || '$';
          // 过滤出需要保存的字段，只保存 completeData 中存在的字段，且value值是相加后的结果，
          const saveFields = Object.keys(modifiedFields).reduce((acc: Record<string, number>, key: string) => {
            if (completeData.hasOwnProperty(key)) {
              // 将字符串转换为数字，去除货币符号和逗号等分隔符
              const originalValue = parseFloat(String(completeData[key]).replace(/[^\d.-]/g, '')) || 0;
              const increaseValue = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
              acc[key] = Number((Number(originalValue) + Number(increaseValue)).toFixed(2));
            }
            return acc;
          }, {});
          
          if (!id || !saveFields || Object.keys(saveFields).length === 0) {
            console.warn('刷新页面数据: 修改项缺少id或saveFields');
            failCount++;
            continue;
          }
          
          // 查找匹配的行
          let foundRow = null;
          let lookupId = '';
          
          // 根据当前层级选择正确的ID
          switch (currentLevel) {
            case 'Ads':
              lookupId = ad.ad_id || id;
              break;
            case 'Adsets':
              lookupId = ad.adset_id || id;
              break;
            case 'Campaigns':
              lookupId = ad.campaign_id || id;
              break;
            default:
              lookupId = ad.id || id;
          }
          
          if (lookupId) {
            foundRow = findRowById(filteredRows, lookupId);
          }
          
          if (!foundRow) {
            console.warn(`刷新页面数据: 未找到匹配的行: ${lookupId}`);
            failCount++;
            continue;
          }
          
          // 构建增加值字段
          const increaseFields: Record<string, number> = {};
          Object.keys(modifiedFields).forEach(key => {
            increaseFields[key] = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
          });
          
          // 更新行数据，传递货币符号和增加值字段
          await updateRowData(foundRow.scrollable, foundRow.fixed, saveFields, increaseFields, currencySymbol);
          console.log(`已刷新页面数据行: ${id}`, saveFields);
          successCount++;
        }
      }
      console.log(`更新合计行数据`,modifications, totals);
      // 更新合计行数据
      await updateFooterData(totals, currencySymbol);
      
      // 对表格行进行排序
      await sortTableRows(modifications);
      
      console.log(`刷新页面数据完成: 成功 ${successCount} 条, 失败 ${failCount} 条`);
      sendResponse({ success: true, successCount, failCount });
    } catch (error: any) {
      console.error('刷新页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleGetCachedData(data: { date: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { date, tabType } = data;
  (async () => {
    try {
      // 获取当前 tab 的缓存数据
      const adsKey = await generateCacheKey('ads');
      const modificationsKey = await generateCacheKey('ad_modifications');
      
      const [adsData, modifications] = await Promise.all([
        browserStorage.get(adsKey),
        browserStorage.get(modificationsKey)
      ]);
      
      let ads = adsData?.cacheData?.ads || [];
      const columnMapping = adsData?.cacheData?.columnMapping || {};
      const level = adsData?.cacheData?.level || tabType;
      const sortInfo = adsData?.sortInfo || { field: null, direction: null };
      const currencySymbol = adsData?.cacheData?.currencySymbol || '¥';
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      sendResponse({ ads, columnMapping, level, sortInfo, currencySymbol, modifications });
    } catch (error) {
      console.error('获取缓存数据错误:', error);
      sendResponse({ ads: [], columnMapping: {}, level: 'Campaigns', sortInfo: { field: null, direction: null }, currencySymbol: '¥', modifications: [] });
    }
  })();
  return true;
}

// 消息处理函数 - 保存缓存数据
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any; level: string; currencySymbol: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo, level, currencySymbol, tabType } = data;
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      
      // 确保每个广告对象都有id字段
      const processedAds = ads.map((ad: any) => {
        if (!ad.id) {
          // 根据当前层级选择正确的ID
          if (level === 'Ads' && ad.ad_id) {
            ad.id = ad.ad_id;
          } else if (level === 'Adsets' && ad.adset_id) {
            ad.id = ad.adset_id;
          } else if (level === 'Campaigns' && ad.campaign_id) {
            ad.id = ad.campaign_id;
          } 
        }
        return ad;
      });
      
      const cacheData = { ads: processedAds, columnMapping, level: level || tabType, currencySymbol };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      // 检测层级关系
      if (processedAds.length > 0) {
        hierarchyManager.detectHierarchy(processedAds);
      }
      
      console.log('已保存数据到缓存:', adsKey);
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('保存缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 处理修改数据，建立层级关系
function processModifications(modifications: any[], currentLevel: string) {
  return modifications.map(item => {
    if (item && item.completeData) {
      const completeData = item.completeData;
      
      // 根据当前层级建立parentId关系
      let parentId: string | undefined;
      let itemId: string = '';
      
      // 根据当前层级选择正确的ID
      switch (currentLevel) {
        case 'Ads':
          itemId = completeData?.ad_id || completeData?.id || '';
          parentId = completeData?.adset_id || '';
          break;
        case 'Adsets':
          itemId = completeData?.adset_id || completeData?.id || '';
          parentId = completeData?.campaign_id || '';
          break;
        case 'Campaigns':
          itemId = completeData?.campaign_id || completeData?.id || '';
          break;
        default:
          itemId = completeData?.id || '';
      }
      
      return { 
        ...item, 
        level: currentLevel,
        parentId: parentId,
        id: itemId,
        campaign_id: completeData?.campaign_id || '',
        adset_id: completeData?.adset_id || '',
        ad_id: completeData?.ad_id || ''
      };
    }
    // 如果completeData为null，跳过这个修改项
    return null;
  }).filter(item => item !== null);
}

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[]; totals?: any; currencySymbol: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { modifications, totals } = data;
  (async () => {
    try {
      // 获取当前页面状态和层级
      const pageState = getCurrentPageState() || {};
      const currentLevel = pageState.level || 'Campaigns';
      
      // 处理修改数据，建立层级关系
      const modificationsWithId = processModifications(modifications, currentLevel);
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const sortInfoKey = await generateSortInfoKey();
      const totalsKey = await generateCacheKey('ad_totals');
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithId),
        browserStorage.set(totalsKey, totals),
        browserStorage.set(sortInfoKey, pageState || {})
      ]);
      
      console.log('保存修改成功，当前层级:', currentLevel);
      
      sendResponse({ success: true, isFirstSave: true });
    } catch (error: any) {
      console.error('保存修改数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取排序信息
export function handleGetSortInfo(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const sortInfoKey = await generateSortInfoKey();
      console.log(`[${new Date().toISOString()}] 获取排序信息:`, sortInfoKey);
      
      browserStorage.get(sortInfoKey).then((sortInfo) => {
        sendResponse(sortInfo);
      }).catch((error) => {
        console.error('获取排序信息错误:', error);
        sendResponse({ field: null, direction: null });
      });
    } catch (error: any) {
      console.error('获取排序信息错误:', error);
      sendResponse({ field: null, direction: null });
    }
  })();
  return true;
}
