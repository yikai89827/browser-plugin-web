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
      
      // 获取修改的数据（增加值）
      const modifiedData = await getModifiedData() || {};
      console.log('获取的修改数据（增加值）:', modifiedData);
      
      // 定义数值字段
      const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
      
      // 合并原始数据和修改数据
      const mergedData = data.map((item: any) => {
        // 初始化增加字段
        const itemWithIncrease: any = { ...item };
        
        numericFields.forEach(field => {
          itemWithIncrease[`increase_${field}`] = 0;
        });
        
        // 如果有修改数据，应用修改
        if (modifiedData[item.id]) {
          Object.entries(modifiedData[item.id]).forEach(([field, value]) => {
            itemWithIncrease[`increase_${field}`] = Number(value) || 0;
          });
        }
        
        return itemWithIncrease;
      });
      
      // 生成缓存键
      const dataKey = await generateManageCacheKey('reporting_data');
      
      // 保存原始数据到缓存
      const cacheData = { 
        data: data, 
        columnMapping: columnMapping,
        currencySymbol
      };
      
      await browserStorage.set(dataKey, cacheData);
      
      console.log('已从报表页面DOM提取数据并缓存:', { data: data, currencySymbol, columnMapping });
      console.log('合并后的数据:', mergedData);
      
      sendResponse({ 
        success: true, 
        data: mergedData, 
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
      
      // 从DOM重新提取数据，确保包含所有行（包括滚动后可见的行）
      const { data, columnMapping, currencySymbol } = await extractDataFromDom();
      console.log('重新提取的报表数据:', data);
      
      // 生成缓存键
      const dataKey = await generateManageCacheKey('reporting_data');
      
      // 保存更新后的数据到缓存
      const cacheData = { 
        data: data, 
        columnMapping: columnMapping,
        currencySymbol
      };
      
      await browserStorage.set(dataKey, cacheData);
      console.log('已更新缓存数据:', cacheData);
      
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
      
      if (cachedData && cachedData.data) {
        // 获取修改的数据（增加值）
        const modifiedData = await getModifiedData() || {};
        console.log('获取的修改数据（增加值）:', modifiedData);
        
        // 定义数值字段
        const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
        
        // 合并原始数据和修改数据
        const mergedData = cachedData.data.map((item: any) => {
          // 初始化增加字段
          const itemWithIncrease: any = { ...item };
          
          numericFields.forEach(field => {
            itemWithIncrease[`increase_${field}`] = 0;
          });
          
          // 如果有修改数据，应用修改
          if (modifiedData[item.id]) {
            Object.entries(modifiedData[item.id]).forEach(([field, value]) => {
              itemWithIncrease[`increase_${field}`] = Number(value) || 0;
            });
          }
          
          return itemWithIncrease;
        });
        
        // 更新缓存数据中的data为合并后的数据
        const updatedCachedData = {
          ...cachedData,
          data: mergedData
        };
        
        console.log('获取报告页面缓存数据并合并修改数据:', updatedCachedData);
        sendResponse({ success: true, data: updatedCachedData });
      } else {
        console.log('获取报告页面缓存数据:', cachedData);
        sendResponse({ success: true, data: cachedData });
      }
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
