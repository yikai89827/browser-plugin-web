// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../utils/storage';
import { dataExtractor } from './dataExtractor';
import { hierarchyManager, AdEntity } from './hierarchy';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { getCurrentDate } from './date';
import { getSavedAccountId } from './account';
import { getCurrentPageState, findTableContainer, getColumnIndices, getColumnIndicesSync, getFilteredRows, findInnermostElement, extractAdsFromDom } from './dom';

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { ads, DomColumnMapping, sortInfo, currencySymbol } = await extractAdsFromDom();
      
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
        DomColumnMapping: DomColumnMapping, 
        sortInfo: sortInfo,
        level: level,
        currencySymbol: currencySymbol
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
            console.log(`  → 固定列长度: ${fixedColumnLength}, ${idColumn}列索引: ${idColumnIndex}, 滚动列索引: ${scrollableColumnIndex}`);
            if (scrollableColumnIndex >= 0 && scrollableCells[scrollableColumnIndex]) {
              const idCell = scrollableCells[scrollableColumnIndex];
              const idText = idCell?.textContent?.trim() || '';
              console.log(`缓存数据id:${id}  → ${idColumn}单元格文本: ${idText}`);
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


// 更新行数据
async function updateRowData(scrollable: HTMLElement, fixed: HTMLElement, fields: Record<string, number>): Promise<void> {
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
        // 找到最内层的DOM元素进行更新
        const innermostElement = findInnermostElement(cell);
        innermostElement.textContent = String(value);
      }
    }
  }
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(data: { sortInfo: any; date: string; modifications: any[] }, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log(`[${new Date().toISOString()}] 刷新页面数据:`, data);
      
      const { modifications } = data;
      
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
      
      for (const modification of modifications) {
        if (modification && modification.completeData) {
          const { completeData, modifiedFields } = modification;
          const id = completeData.id;
          // 过滤出需要保存的字段，只保存 completeData 中存在的字段，且value值是相加后的结果，
          const saveFields = Object.keys(modifiedFields).reduce((acc: Record<string, number>, key: string) => {
            if (completeData.hasOwnProperty(key)) {
              acc[key] = Number((Number(completeData[key]) + Number(modifiedFields[key])).toFixed(2));
            }
            return acc;
          }, {});
          
          if (!id || !saveFields || Object.keys(saveFields).length === 0) {
            console.warn('刷新页面数据: 修改项缺少id或saveFields');
            failCount++;
            continue;
          }
          
          // 查找匹配的行
          const foundRow = findRowById(filteredRows, id);
          if (!foundRow) {
            console.warn(`刷新页面数据: 未找到匹配的行: ${id}`);
            failCount++;
            continue;
          }
          
          // 更新行数据
          await updateRowData(foundRow.scrollable, foundRow.fixed, saveFields);
          console.log(`已刷新页面数据行: ${id}`, saveFields);
          successCount++;
        }
      }
      
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
      if (currentLevel === 'Adsets' && completeData.campaign_id) {
        parentId = completeData?.campaign_id || '';
      } else if (currentLevel === 'Ads' && completeData.adset_id) {
        parentId = completeData?.adset_id || '';
      }
      
      return { 
        ...item, 
        level: currentLevel,
        parentId: parentId,
        id: completeData?.id || '',
        campaign_id: completeData?.campaign_id || '',
        adset_id: completeData?.adset_id || ''
      };
    }
    // 如果completeData为null，跳过这个修改项
    return null;
  }).filter(item => item !== null);
}

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[]; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { modifications, tabType } = data;
  (async () => {
    try {
      // 获取当前页面状态和层级
      const pageState = getCurrentPageState() || {};
      const currentLevel = pageState.level || 'Campaigns';
      
      // 处理修改数据，建立层级关系
      const modificationsWithId = processModifications(modifications, currentLevel);
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const sortInfoKey = await generateSortInfoKey();
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithId),
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
