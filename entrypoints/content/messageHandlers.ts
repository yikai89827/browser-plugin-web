import { extractAdsFromDom } from './dom';
import { createOverlay, removeOverlay } from './dom';
import { syncAdDataToPage } from './sync';
import { browserStorage } from '../../utils/storage';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { generateUniqueId } from './uniqueId';
import { detectSortInfo } from './dom';
import { debouncedSync } from './sync';

// 消息处理函数 - 从 DOM 获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  extractAdsFromDom().then(({ ads, DomColumnMapping, sortInfo }) => {
    sendResponse({ ads, DomColumnMapping, sortInfo });
  }).catch((error) => {
    console.error('提取广告数据错误:', error);
    sendResponse({ ads: [], DomColumnMapping: {}, sortInfo: { field: null, direction: null } });
  });
  return true;
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(sortInfo: any, sendResponse: (response: any) => void): boolean {
  createOverlay();
  syncAdDataToPage(sortInfo).then(() => {
    sendResponse({ success: true });
  }).catch((error) => {
    console.error('刷新页面数据错误:', error);
    sendResponse({ success: false, error: error.message });
  });
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
      const sortInfo = adsData?.sortInfo || { field: null, direction: null };
      
      sendResponse({ ads, columnMapping, sortInfo, modifications });
    } catch (error) {
      console.error('获取缓存数据错误:', error);
      sendResponse({ ads: [], columnMapping: {}, sortInfo: { field: null, direction: null }, modifications: [] });
    }
  })();
  return true;
}

// 消息处理函数 - 保存缓存数据
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo } = data;
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      
      const cacheData = { ads, columnMapping };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      console.log('已保存数据到缓存:', adsKey);
      
      sendResponse({ success: true });
    } catch (error) {
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
      const columnMappingKey = await generateCacheKey('columnMapping');
      const columnIndex = await browserStorage.get(columnMappingKey);
      console.log('保存时获取的列索引:', columnIndex);
      
      const modificationsWithUniqueId = modifications.map(item => {
        if (item && item.completeData) {
          const originalValues = {};
          
          console.log('completeData:', item.completeData);
          console.log('modifiedFields:', item.modifiedFields);
          
          Object.keys(item.completeData).forEach(key => {
            if (!key.startsWith('increase_')) {
              originalValues[key] = item.completeData[key];
            }
          });
          
          if (item.modifiedFields) {
            Object.keys(item.modifiedFields).forEach(key => {
              const originalValue = item.completeData[key] !== undefined && item.completeData[key] !== '' ? item.completeData[key] : 0;
              originalValues[key] = originalValue;
            });
          }
          
          console.log('生成唯一标识时的原始值:', originalValues);
          
          const uniqueId = generateUniqueId(item.completeData.name, originalValues);
          
          const processedModifiedFields = {};
          if (item.modifiedFields) {
            Object.keys(item.modifiedFields).forEach(key => {
              const value = item.modifiedFields[key];
              processedModifiedFields[key] = value === undefined || value === null || value === '' ? 0 : value;
            });
          }
          
          return { ...item, modifiedFields: processedModifiedFields, uniqueId };
        }
        return item;
      });
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const sortInfo = detectSortInfo();
      const sortInfoKey = await generateSortInfoKey();
      
      console.log('当前排序信息:', sortInfo, sortInfoKey);
      
      const existingModifications = await browserStorage.get(modificationsKey);
      const isFirstSave = !existingModifications || !Array.isArray(existingModifications) || existingModifications.length === 0;
      console.log(`是否第一次保存: ${isFirstSave}`);
      
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithUniqueId),
        browserStorage.set(sortInfoKey, sortInfo)
      ]);
      
      console.log('保存修改成功，触发页面刷新');
      console.log('保存的排序信息:', sortInfo);
      debouncedSync();
      sendResponse({ success: true, isFirstSave });
    } catch (error) {
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
    } catch (error) {
      console.error('生成排序信息缓存键错误:', error);
      sendResponse({ field: null, direction: null });
    }
  })();
  return true;
}
