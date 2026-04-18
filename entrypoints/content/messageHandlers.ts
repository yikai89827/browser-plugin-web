// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../utils/storage';
import { dataExtractor } from './dataExtractor';
import { hierarchyManager } from './hierarchy';
import { valueSyncManager } from './syncValue';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { detectSortInfo } from './dom';

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { entities, level } = dataExtractor.extractFromDom();
      const columnMapping = {};
      
      // 检测层级关系
      hierarchyManager.detectHierarchy(entities);
      
      // 生成缓存键
      const adsKey = await generateCacheKey('ads');
      
      // 保存到缓存
      const sortInfo = detectSortInfo();
      const cacheData = { 
        ads: entities, 
        columnMapping,
        level
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      console.log('已从DOM提取数据并缓存:', { entities: entities.length, level });
      
      sendResponse({ 
        success: true, 
        ads: entities, 
        columnMapping, 
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
      // 处理修改数据
      const modificationsWithUniqueId = modifications.map(item => {
        if (item && item.completeData) {
          // 这里可以添加唯一ID生成逻辑
          return { ...item, uniqueId: item.completeData.id || `id_${Math.random().toString(36).substr(2, 9)}` };
        }
        return item;
      });
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const sortInfo = detectSortInfo();
      const sortInfoKey = await generateSortInfoKey();
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithUniqueId),
        browserStorage.set(sortInfoKey, sortInfo)
      ]);
      
      console.log('保存修改成功，触发数值同步');
      
      // 执行数值同步
      if (modificationsWithUniqueId.length > 0) {
        const entities = modificationsWithUniqueId.map(item => ({
          id: item.uniqueId,
          name: item.completeData?.name || 'Unknown',
          level: item.level || 'Campaigns',
          values: item.completeData || {},
          increaseValues: item.modifiedFields || {}
        }));
        
        // 检测层级关系
        hierarchyManager.detectHierarchy(entities);
        
        // 执行向下同步
        const syncResult = await valueSyncManager.batchSync(entities, 'down');
        console.log('数值同步结果:', syncResult);
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
      hierarchyManager.detectHierarchy(entities);
      
      // 执行同步
      const syncResult = await valueSyncManager.batchSync(entities, direction as 'up' | 'down');
      
      sendResponse({ success: true, syncResult });
    } catch (error: any) {
      console.error('执行数值同步错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
