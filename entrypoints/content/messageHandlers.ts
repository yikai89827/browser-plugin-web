// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../utils/storage';
import { dataExtractor } from './dataExtractor';
import { hierarchyManager, AdEntity } from './hierarchy';
import { valueSyncManager } from './syncValue';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { getCurrentPageState, findTableContainer, getColumnIndices, getColumnIndicesSync, getFilteredRows, findInnermostElement } from './dom';

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { entities, columnIndices, level } = dataExtractor.extractFromDom();
      
      // 检测层级关系
      hierarchyManager.detectHierarchy(entities);
      
      // 生成缓存键
      const adsKey = await generateCacheKey('ads');
      
      // 保存到缓存
      const sortInfo = getCurrentPageState() || {};
      const cacheData = { 
        ads: entities, 
        columnMapping: columnIndices,
        level
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      console.log('已从DOM提取数据并缓存:', { entities: entities.length, level });
      
      sendResponse({ 
        success: true, 
        ads: entities, 
        columnMapping: columnIndices, 
        level 
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
              acc[key] = completeData[key] + modifiedFields[key];
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
      
      // 检测其他 tab 的同步任务
      ads = await processSyncTasks(tabType, ads, sortInfo);
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      sendResponse({ ads, columnMapping, level, sortInfo, modifications });
    } catch (error) {
      console.error('获取缓存数据错误:', error);
      sendResponse({ ads: [], columnMapping: {}, level: 'Campaigns', sortInfo: { field: null, direction: null }, modifications: [] });
    }
  })();
  return true;
}

// 消息处理函数 - 保存缓存数据
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any; level: string; tabType: string }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo, level, tabType } = data;
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      
      const cacheData = { ads, columnMapping, level };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
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
        campaign_id: completeData?.campaign_id || '',
        adset_id: completeData?.adset_id || ''
      };
    }
    // 如果completeData为null，跳过这个修改项
    return null;
  }).filter(item => item !== null);
}

// 执行同步
async function executeSync(modificationsWithId: any[], currentLevel: string) {
  // 在当前tab直接执行数值更新（因为当前tab的数据已经在DOM中）
  const entities: AdEntity[] = modificationsWithId.map(item => ({
    id: item?.completeData?.id || '',
    name: item?.completeData?.name || '',
    level: item?.level || currentLevel,
    parentId: item?.parentId || '',
    values: item?.completeData || {},
    increaseValues: item?.modifiedFields || {}
  }));
  
  // 过滤掉没有ID的实体
  const validEntities = entities.filter(entity => entity.id);
  
  // 检测层级关系
  hierarchyManager.detectHierarchy(validEntities);
  
  // 执行同步（更新当前tab的DOM）
  const syncResult = await valueSyncManager.batchSync(validEntities, currentLevel === 'Campaigns' ? 'down' : 'up');
  console.log('当前tab数值同步结果:', syncResult);
  
  return syncResult;
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
      
      // 生成同步任务
      if (modificationsWithId.length > 0) {
        // 执行同步
        await executeSync(modificationsWithId, currentLevel);
        
        // 同步到其他tab的缓存
        await syncToOtherTabs(modificationsWithId, currentLevel);
      }
      
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

// 消息处理函数 - 执行数值同步
export function handleSyncValues(data: { entities: any[]; direction: string }, sendResponse: (response: any) => void): boolean {
  const { entities, direction } = data;
  (async () => {
    try {
      // 检测层级关系
      hierarchyManager.detectHierarchy(entities as AdEntity[]);
      
      // 执行同步
      console.log(`[${new Date().toISOString()}] 执行数值同步:`, entities, direction);
      const syncResult = await valueSyncManager.batchSync(entities as AdEntity[], direction as 'up' | 'down');
      console.log(`[${new Date().toISOString()}] 执行数值同步:`, syncResult);
      
      sendResponse({ success: true, syncResult });
    } catch (error: any) {
      console.error('执行数值同步错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 同步到其他tab的缓存
async function syncToOtherTabs(modificationsWithId: any[], currentLevel: string): Promise<void> {
  // 同步到其他tab的缓存
  const otherTabTypes = ['Ads', 'Adsets', 'Campaigns'].filter(t => t !== currentLevel);
  let syncTasks: any[] = [];
  
  for (const otherTabType of otherTabTypes) {
    // 生成其他tab的缓存键
    const otherAdsKey = await generateCacheKey('ads');
    const otherAdsData = await browserStorage.get(otherAdsKey);
    
    if (otherAdsData && otherAdsData.cacheData && otherAdsData.cacheData.ads && otherAdsData.cacheData.ads.length > 0) {
      // 其他tab有缓存，直接同步增加值
      console.log('其他tab有缓存，直接同步增加值:', otherTabType);
      
      let otherAds = otherAdsData.cacheData.ads;
      let hasChanges = false;
      
      // 应用修改值到其他tab的缓存数据
      for (const modification of modificationsWithId) {
        if (modification && modification.completeData && modification.modifiedFields) {
          const { completeData, modifiedFields } = modification;
          
          // 查找其他tab中对应的实体
          otherAds = otherAds.map((ad: any) => {
            let updatedAd = ad;
            
            // 确保increaseValues对象存在
            if (!updatedAd.increaseValues) {
              updatedAd.increaseValues = {};
            }
            
            // 根据层级关系查找对应的实体
            if (otherTabType === 'Campaigns') {
              if (ad.campaign_id === completeData.campaign_id || ad.id === completeData.campaign_id) {
                // 广告系列tab，查找对应的广告系列
                for (const [field, value] of Object.entries(modifiedFields)) {
                  updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
                  hasChanges = true;
                }
              }
            } else if (otherTabType === 'Adsets') {
              if (ad.adset_id === completeData.adset_id || ad.id === completeData.adset_id) {
                // 广告组tab，查找对应的广告组
                for (const [field, value] of Object.entries(modifiedFields)) {
                  updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
                  hasChanges = true;
                }
              }
            } else if (otherTabType === 'Ads') {
              if (ad.ad_id === completeData.ad_id || ad.id === completeData.ad_id) {
                // 广告tab，查找对应的广告
                for (const [field, value] of Object.entries(modifiedFields)) {
                  updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
                  hasChanges = true;
                }
              }
            }
            
            return updatedAd;
          });
        }
      }
      
      // 如果有修改，保存到其他tab的缓存
      if (hasChanges) {
        const updatedCacheData = {
          ads: otherAds,
          columnMapping: otherAdsData.cacheData.columnMapping || {},
          level: otherTabType
        };
        const updatedDataToSave = {
          sortInfo: otherAdsData.sortInfo || { field: null, direction: null },
          cacheData: updatedCacheData
        };
        
        await browserStorage.set(otherAdsKey, updatedDataToSave);
        console.log('已同步增加值到其他tab的缓存:', otherTabType);
      }
    } else {
      // 其他tab没有缓存，保存同步任务
      console.log('其他tab没有缓存，保存同步任务:', otherTabType);
      const task = {
        sourceEntity: {
          id: modificationsWithId[0]?.completeData?.id || '',
          name: modificationsWithId[0]?.completeData?.name || 'Unknown',
          level: currentLevel,
          parentId: modificationsWithId[0]?.parentId || '',
          grandParentId: modificationsWithId[0]?.campaign_id || ''
        },
        modifiedFields: modificationsWithId[0]?.modifiedFields || {},
        syncDirection: currentLevel === 'Campaigns' ? 'down' : 'up',
        timestamp: Date.now(),
        status: 'pending'
      };
      syncTasks.push(task);
    }
  }
  
  // 保存同步任务
  if (syncTasks.length > 0) {
    const syncTasksKey = await generateCacheKey('sync_tasks');
    await browserStorage.set(syncTasksKey, syncTasks);
    console.log('已保存同步任务:', syncTasks);
  }
}

// 处理同步任务
async function processSyncTasks(tabType: string, ads: any[], sortInfo: any): Promise<any[]> {
  // 检测其他 tab 的同步任务
  const syncTasksKey = await generateCacheKey('sync_tasks');
  const syncTasks = await browserStorage.get(syncTasksKey) || [];
  
  // 处理同步任务
  if (syncTasks.length > 0) {
    console.log('检测到同步任务:', syncTasks.length, '个');
    
    // 过滤与当前 tab 相关的同步任务
    const relevantSyncTasks = syncTasks.filter((task: any) => {
      // 检查同步方向和层级关系
      if (task.syncDirection === 'down' && task.sourceEntity.level === 'Campaigns' && (tabType === 'Adsets' || tabType === 'Ads')) {
        return true; // 从广告系列同步到广告组或广告
      } else if (task.syncDirection === 'down' && task.sourceEntity.level === 'Adsets' && tabType === 'Ads') {
        return true; // 从广告组同步到广告
      } else if (task.syncDirection === 'up' && task.sourceEntity.level === 'Ads' && (tabType === 'Adsets' || tabType === 'Campaigns')) {
        return true; // 从广告同步到广告组或广告系列
      } else if (task.syncDirection === 'up' && task.sourceEntity.level === 'Adsets' && tabType === 'Campaigns') {
        return true; // 从广告组同步到广告系列
      }
      return false;
    });
    
    if (relevantSyncTasks.length > 0) {
      console.log('与当前 tab 相关的同步任务:', relevantSyncTasks.length, '个');
      
      // 执行同步操作
      if (ads.length > 0) {
        // 检测层级关系
        hierarchyManager.detectHierarchy(ads);
        
        // 为当前 tab 创建实体
        const entities: any[] = ads.map((ad: AdEntity) => ({
          id: ad.id,
          name: ad.name,
          level: tabType,
          parentId: ad.parentId || '',
          values: ad,
          increaseValues: {}
        }));
        
        // 执行同步
        const syncResult = await valueSyncManager.batchSync(entities, 'up');
        console.log('同步其他 tab 数据到当前 tab 结果:', syncResult);
        
        // 更新当前 tab 的缓存数据
        if (syncResult.successCount > 0) {
          // 重新从 DOM 提取数据，确保数据是最新的
          const { entities: updatedEntities, columnIndices: updatedColumnIndices, level: updatedLevel } = dataExtractor.extractFromDom();
          
          // 保存更新后的数据到缓存
          const updatedAdsKey = await generateCacheKey('ads');
          const updatedCacheData = { ads: updatedEntities, columnMapping: updatedColumnIndices, level: updatedLevel };
          const updatedDataToSave = { sortInfo, cacheData: updatedCacheData };
          
          await browserStorage.set(updatedAdsKey, updatedDataToSave);
          
          // 更新返回的数据
          ads = updatedEntities;
          console.log('已更新当前 tab 的缓存数据');
        }
      } else {
        // 没有缓存数据，从 DOM 提取
        console.log('没有缓存数据，从 DOM 提取');
        const { entities: extractedEntities, columnIndices: extractedColumnIndices, level: extractedLevel } = dataExtractor.extractFromDom();
        
        // 应用同步任务中的修改值
        let updatedEntities = extractedEntities;
        for (const task of relevantSyncTasks) {
          updatedEntities = updatedEntities.map((entity: any) => {
            let updatedEntity = entity;
            
            // 确保increaseValues对象存在
            if (!updatedEntity.increaseValues) {
              updatedEntity.increaseValues = {};
            }
            
            // 根据层级关系查找对应的实体
            if (tabType === 'Campaigns') {
              if (entity.campaign_id === task.sourceEntity.grandParentId || entity.id === task.sourceEntity.grandParentId) {
                // 广告系列tab，查找对应的广告系列
                for (const [field, value] of Object.entries(task.modifiedFields)) {
                  updatedEntity.increaseValues[field] = (updatedEntity.increaseValues[field] || 0) + value;
                }
              }
            } else if (tabType === 'Adsets') {
              if (entity.adset_id === task.sourceEntity.parentId || entity.id === task.sourceEntity.parentId) {
                // 广告组tab，查找对应的广告组
                for (const [field, value] of Object.entries(task.modifiedFields)) {
                  updatedEntity.increaseValues[field] = (updatedEntity.increaseValues[field] || 0) + value;
                }
              }
            } else if (tabType === 'Ads') {
              if (entity.ad_id === task.sourceEntity.id || entity.id === task.sourceEntity.id) {
                // 广告tab，查找对应的广告
                for (const [field, value] of Object.entries(task.modifiedFields)) {
                  updatedEntity.increaseValues[field] = (updatedEntity.increaseValues[field] || 0) + value;
                }
              }
            }
            
            return updatedEntity;
          });
        }
        
        // 保存更新后的数据到缓存
        const updatedAdsKey = await generateCacheKey('ads');
        const updatedCacheData = { ads: updatedEntities, columnMapping: extractedColumnIndices, level: extractedLevel };
        const updatedDataToSave = { sortInfo, cacheData: updatedCacheData };
        
        await browserStorage.set(updatedAdsKey, updatedDataToSave);
        
        // 更新返回的数据
        ads = updatedEntities;
        console.log('已从 DOM 提取数据并应用同步任务');
      }
      
      // 删除同步任务
      await browserStorage.remove(syncTasksKey);
      console.log('已删除同步任务');
    }
  }
  
  return ads;
}
