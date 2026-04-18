// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../utils/storage';
import { dataExtractor } from './dataExtractor';
import { hierarchyManager, AdEntity } from './hierarchy';
import { valueSyncManager } from './syncValue';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { detectSortInfo } from './dom';
import { getCurrentPageState } from './date';

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
      const sortInfo = detectSortInfo();
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

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(sortInfo: any, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 这里可以实现页面数据刷新逻辑
      console.log('刷新页面数据:', sortInfo);
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('刷新页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleGetCachedData(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      const modificationsKey = await generateCacheKey('ad_modifications');
      
      const [adsData, modifications] = await Promise.all([
        browserStorage.get(adsKey),
        browserStorage.get(modificationsKey)
      ]);
      
      const ads = adsData?.cacheData?.ads || [];
      const columnMapping = adsData?.cacheData?.columnMapping || {};
      const level = adsData?.cacheData?.level || 'Campaigns';
      const sortInfo = adsData?.sortInfo || { field: null, direction: null };
      
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
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any; level: string }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo, level } = data;
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

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[] }, sendResponse: (response: any) => void): boolean {
  const { modifications } = data;
  (async () => {
    try {
      // 获取当前页面状态和层级
      const pageState = getCurrentPageState();
      const currentLevel = pageState.level || 'Campaigns';
      
      // 处理修改数据，建立层级关系
      const modificationsWithUniqueId = modifications.map(item => {
        if (item && item.completeData) {
          const completeData = item.completeData;
          
          // 根据当前层级建立parentId关系
          let parentId: string | undefined;
          if (currentLevel === 'Adsets' && completeData.campaign_id) {
            parentId = completeData.campaign_id;
          } else if (currentLevel === 'Ads' && completeData.adset_id) {
            parentId = completeData.adset_id;
          }
          
          // 使用编号字段作为唯一标识
          return { 
            ...item, 
            uniqueId: completeData.id || `id_${Math.random().toString(36).slice(2, 9)}`,
            level: currentLevel,
            parentId: parentId
          };
        }
        return item;
      });
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const syncTasksKey = await generateCacheKey('sync_tasks');
      const sortInfo = detectSortInfo();
      const sortInfoKey = await generateSortInfoKey();
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithUniqueId),
        browserStorage.set(sortInfoKey, sortInfo)
      ]);
      
      console.log('保存修改成功，当前层级:', currentLevel);
      
      // 生成同步任务
      if (modificationsWithUniqueId.length > 0) {
        // 为每个修改的实体生成同步任务
        const syncTasks: Array<{
          sourceEntity: {
            id: string;
            name: string;
            level: string;
            parentId?: string;
          };
          modifiedFields: Record<string, number>;
          syncDirection: 'down' | 'up';
          timestamp: number;
        }> = [];
        
        modificationsWithUniqueId.forEach(item => {
          if (item && item.modifiedFields && Object.keys(item.modifiedFields).length > 0) {
            // 向下同步：父级修改同步到子级
            if (currentLevel === 'Campaigns') {
              syncTasks.push({
                sourceEntity: {
                  id: item.uniqueId,
                  name: item.completeData?.name || 'Unknown',
                  level: currentLevel
                },
                modifiedFields: item.modifiedFields,
                syncDirection: 'down',
                timestamp: Date.now()
              });
            }
            // 向上同步：子级修改同步到父级
            else if (currentLevel === 'Adsets' || currentLevel === 'Ads') {
              syncTasks.push({
                sourceEntity: {
                  id: item.uniqueId,
                  name: item.completeData?.name || 'Unknown',
                  level: currentLevel,
                  parentId: item.parentId
                },
                modifiedFields: item.modifiedFields,
                syncDirection: 'up',
                timestamp: Date.now()
              });
            }
          }
        });
        
        // 保存同步任务
        if (syncTasks.length > 0) {
          await browserStorage.set(syncTasksKey, syncTasks);
          console.log('已保存同步任务:', syncTasks);
        }
        
        // 在当前tab直接执行数值更新（因为当前tab的数据已经在DOM中）
        const entities: AdEntity[] = modificationsWithUniqueId.map(item => ({
          id: item.uniqueId,
          name: item.completeData?.name || 'Unknown',
          level: item.level || currentLevel,
          parentId: item.parentId,
          values: item.completeData || {},
          increaseValues: item.modifiedFields || {}
        }));
        
        // 检测层级关系
        hierarchyManager.detectHierarchy(entities);
        
        // 执行同步（更新当前tab的DOM）
        const syncResult = await valueSyncManager.batchSync(entities, currentLevel === 'Campaigns' ? 'down' : 'up');
        console.log('当前tab数值同步结果:', syncResult);
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
      const syncResult = await valueSyncManager.batchSync(entities as AdEntity[], direction as 'up' | 'down');
      
      sendResponse({ success: true, syncResult });
    } catch (error: any) {
      console.error('执行数值同步错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
