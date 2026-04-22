// 新页面的消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { generateCacheKey, generateSortInfoKey } from '../manage/cache';
import { extractDataFromDom, getCurrentPageState } from './dom';
import { dataExtractor } from './dataExtractor';

// 消息处理函数 - 从DOM获取数据
export function handleGetDataFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { data, columnMapping, sortInfo, currencySymbol } = await extractDataFromDom();
      
      // 生成缓存键
      const dataKey = await generateCacheKey('newpage_data');
      
      // 保存到缓存
      const pageState = getCurrentPageState() || {};
      const level = pageState.level || 'NewPage';
      const cacheData = { 
        data: data, 
        columnMapping: columnMapping,
        level,
        currencySymbol
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(dataKey, dataToSave);
      
      console.log('已从新页面DOM提取数据并缓存:', { data: data.length, level, currencySymbol });
      
      sendResponse({ 
        success: true, 
        data: data, 
        columnMapping: columnMapping, 
        sortInfo: sortInfo,
        level: level,
        currencySymbol: currencySymbol
      });
    } catch (error: any) {
      console.error('从新页面DOM获取数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(message: any, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log('刷新新页面数据:', message);
      
      // 处理刷新逻辑
      const { modifications, totals } = message;
      let successCount = 0;
      let failCount = 0;
      
      // 这里添加刷新页面数据的具体逻辑
      
      console.log(`刷新新页面数据完成: 成功 ${successCount} 条, 失败 ${failCount} 条`);
      sendResponse({ success: true, successCount, failCount });
    } catch (error: any) {
      console.error('刷新新页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleGetCachedData(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const dataKey = await generateCacheKey('newpage_data');
      const cachedData = await browserStorage.get(dataKey);
      
      console.log('获取新页面缓存数据:', cachedData);
      sendResponse({ success: true, data: cachedData });
    } catch (error: any) {
      console.error('获取新页面缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
