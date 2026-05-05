// 报表页面的消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../../utils/storage';
import { generateCacheKey, generateCacheKeyForDate } from '../reporting/cache';
import { extractDataFromDom } from './dom';
import { saveModifiedData, getModifiedData } from './cache';
import { updateDomElements } from './domUpdater';
import { numericFields } from './config';



// 消息处理函数 - 从DOM获取数据
export function handleReportingGetDataFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log('开始从报表页面DOM提取数据...');
      // 从DOM提取数据（原始数据每次从DOM获取，不从缓存）
      const { data, columnMapping, currencySymbol } = await extractDataFromDom();
      console.log('提取的报表数据:', data);
      console.log('提取的列映射:', columnMapping);
      console.log('提取的货币符号:', currencySymbol);
      
      console.log('已从报表页面DOM提取数据:', { data: data, currencySymbol, columnMapping });
      
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
      const { modifications, date } = message;
      console.log('修改数据:', modifications);
      console.log('日期:', date);
      
      let successCount = 0;
      let failCount = 0;
      
      // 保存修改数据（使用日期参数）
      const existingModifiedData = await getModifiedData(date) || {};
      const updatedModifiedData = { ...existingModifiedData, ...modifications };
      await saveModifiedData(updatedModifiedData, date);
      console.log('保存修改后的数据:', updatedModifiedData);
      
      // 从DOM重新提取数据，确保包含所有行（包括滚动后可见的行）和ID字段
      const { data, columnMapping, currencySymbol } = await extractDataFromDom();
      console.log('重新提取的报表数据:', data);
      
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

// 计算广告组的合计修改值
function calculateAdsetModifications(adsetAds: any[]): Record<string, number> {
  return adsetAds.reduce((sum: Record<string, number>, ad: any) => {
    const mod = ad.modification;
    Object.keys(mod).forEach(field => {
      sum[field] = (sum[field] || 0) + Number(mod[field]);
    });
    return sum;
  }, {});
}

// 计算广告系列的合计修改值
function calculateCampaignModifications(campaignAds: any[]): Record<string, number> {
  return campaignAds.reduce((sum: Record<string, number>, ad: any) => {
    const mod = ad.modification;
    Object.keys(mod).forEach(field => {
      sum[field] = (sum[field] || 0) + Number(mod[field]);
    });
    return sum;
  }, {});
}

// 计算账户的合计修改值
function calculateAccountModifications(accountAds: any[]): Record<string, number> {
  return accountAds.reduce((sum: Record<string, number>, ad: any) => {
    const mod = ad.modification;
    Object.keys(mod).forEach(field => {
      sum[field] = (sum[field] || 0) + Number(mod[field]);
    });
    return sum;
  }, {});
}

// 消息处理函数 - 获取缓存数据（只返回增加值数据）
export function handleReportingGetCachedData(message: any, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const { date } = message;
      console.log('获取缓存数据（增加值），日期:', date);
      
      // 获取修改的数据（按指定日期）
      const modifiedData = await getModifiedData(date) || {};
      if (!modifiedData || Object.keys(modifiedData).length === 0) {
        sendResponse({ success: true, data: {} });
        return;
      }
      
      console.log('返回缓存的增加值数据:', modifiedData);
      sendResponse({ success: true, data: modifiedData });
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
