// 报表页面的消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { generateCacheKey as generateManageCacheKey } from '../reporting/cache';
import { extractDataFromDom } from './dom';
import { saveModifiedData, getModifiedData } from './cache';
import { updateDomElements } from './domUpdater';


// 消息处理函数 - 从DOM获取数据
export function handleReportingGetDataFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log('开始从报表页面DOM提取数据...');
      // 从DOM提取数据
      const { data, columnMapping, currencySymbol } = await extractDataFromDom();
      console.log('提取的报表数据:', data);
      console.log('提取的列映射:', columnMapping);
      console.log('提取的货币符号:', currencySymbol);
      
      // 生成缓存键
      const dataKey = await generateManageCacheKey('reporting_data', );
      
      // 保存到缓存
      const cacheData = { 
        data: data, 
        columnMapping: columnMapping,
        currencySymbol
      };
      
      await browserStorage.set(dataKey, cacheData);
      
      console.log('已从报表页面DOM提取数据并缓存:', { data: data, currencySymbol, columnMapping });
      
      sendResponse({ 
        success: true, 
        data: data, 
        columnMapping: columnMapping, 
        currencySymbol
      });
    } catch (error: any) {
      console.error('从报表页面DOM获取数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 刷新报告页面数据
export function handleReportingRefresh(message: any, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log('刷新报告页面数据:', message);
      
      // 处理刷新逻辑
      const { modifications } = message;
      console.log('修改数据:', modifications);
      
      let successCount = 0;
      let failCount = 0;
      
      // 保存修改数据
      const existingModifiedData = await getModifiedData() || {};
      const updatedModifiedData = { ...existingModifiedData, ...modifications };
      await saveModifiedData(updatedModifiedData);
      console.log('保存修改后的数据:', updatedModifiedData);
      
      // 更新DOM元素
      await updateDomElements();
      
      successCount = Object.keys(modifications).length;
      
      console.log(`刷新报表页面数据完成`);
      sendResponse({ success: true, successCount, failCount });
    } catch (error: any) {
      console.error('刷新报表页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleReportingGetCachedData(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const dataKey = await generateManageCacheKey('reporting_data');
      const cachedData = await browserStorage.get(dataKey);
      
      console.log('获取报告页面缓存数据:', cachedData);
      sendResponse({ success: true, data: cachedData });
    } catch (error: any) {
      console.error('获取报告页面缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 初始化报告页面
export function handleReportingInit(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log('初始化报告页面');
      
      // 初始化DOM更新
      await updateDomElements();
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('初始化报告页面错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
