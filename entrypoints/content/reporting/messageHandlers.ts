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
      // 从DOM提取数据
      const { data, columnMapping, currencySymbol } = await extractDataFromDom();
      console.log('提取的报表数据:', data);
      console.log('提取的列映射:', columnMapping);
      console.log('提取的货币符号:', currencySymbol);
      
      // 获取修改的数据（增加值）
      const modifiedData = await getModifiedData() || {};
      console.log('获取的修改数据（增加值）:', modifiedData);
      
      
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
      const dataKey = await generateCacheKey('reporting_data');
      
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
      
      // 生成缓存键
      const dataKey = await generateCacheKey('reporting_data');
      
      // 保存更新后的数据到缓存
      const cacheData = { 
        data: data, 
        columnMapping,
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

// 计算合计行的增加值
function calculateSummaryValuesForCache(allRowData: any[], modifiedData: any): Record<string, any> {
  const summaryValues: Record<string, any> = {};
  
  // 按账户分组
  const accountGroups = groupAdsByAccount(allRowData, modifiedData);
  
  // 计算每个账户的合计
  Object.keys(accountGroups).forEach(accountName => {
    const accountAds = accountGroups[accountName];
    
    // 计算账户合计的增加值
    const accountModifications = calculateAccountModifications(accountAds);
    
    // 找到账户合计行
    const accountSummary = findAccountSummaryRow(allRowData, accountName);
    
    if (Object.keys(accountModifications).length > 0) {
      if (accountSummary && accountSummary.id) {
        summaryValues[accountSummary.id] = accountModifications;
      }
      summaryValues[accountName] = accountModifications;
    }
    
    // 按广告系列分组并计算合计
    calculateCampaignSummaries(accountAds, allRowData, summaryValues);
  });
  
  return summaryValues;
}

// 按账户分组广告
function groupAdsByAccount(allRowData: any[], modifiedData: any): Record<string, any[]> {
  const accountGroups: Record<string, any[]> = {};
  
  allRowData.forEach(rowData => {
    // 只处理广告统计行（有 ad_id 的）
    if (rowData.ad_id && rowData.ad_id.trim() !== '') {
      const matchedModification = findMatchingModification(rowData, modifiedData);
      
      if (matchedModification) {
        const accountKey = rowData.accountName;
        if (!accountGroups[accountKey]) {
          accountGroups[accountKey] = [];
        }
        accountGroups[accountKey].push({ ...rowData, modification: matchedModification });
      }
    }
  });
  
  return accountGroups;
}

// 查找匹配的修改数据
function findMatchingModification(rowData: any, modifiedData: any): any | null {
  // 1. 优先使用rowData.id匹配（DOM解析出的ID）
  if (modifiedData[rowData.id]) {
    return modifiedData[rowData.id];
  }
  
  // 2. 如果没有匹配，使用ad_id匹配
  if (rowData.ad_id && modifiedData[rowData.ad_id]) {
    return modifiedData[rowData.ad_id];
  }
  
  return null;
}

// 找到账户合计行
function findAccountSummaryRow(allRowData: any[], accountName: string): any | undefined {
  return allRowData.find(rowData => 
    rowData.accountName === accountName && 
    !rowData.ad_id && 
    !rowData.adset_id && 
    !rowData.campaign_id
  );
}

// 计算广告系列合计
function calculateCampaignSummaries(accountAds: any[], allRowData: any[], summaryValues: Record<string, any>): void {
  // 按广告系列分组（使用 campaign_id）
  const campaignGroups: Record<string, any[]> = {};
  accountAds.forEach((ad: any) => {
    const campaign_id = ad.campaign_id;
    if (campaign_id) {
      if (!campaignGroups[campaign_id]) {
        campaignGroups[campaign_id] = [];
      }
      campaignGroups[campaign_id].push(ad);
    }
  });
  
  // 计算每个广告系列的合计
  Object.keys(campaignGroups).forEach(campaign_id => {
    const campaignAds = campaignGroups[campaign_id];
    const campaignModifications = calculateCampaignModifications(campaignAds);
    
    // 找到广告系列合计行
    const campaignSummary = allRowData.find(rowData => 
      rowData.campaign_id === campaign_id && 
      !rowData.ad_id && 
      !rowData.adset_id
    );
    
    if (Object.keys(campaignModifications).length > 0 && campaignSummary && campaignSummary.id) {
      summaryValues[campaignSummary.id] = campaignModifications;
    }
    
    // 按广告组分组并计算合计
    calculateAdsetSummaries(campaignAds, allRowData, summaryValues);
  });
}

// 计算广告组合计
function calculateAdsetSummaries(campaignAds: any[], allRowData: any[], summaryValues: Record<string, any>): void {
  // 按广告组分组（使用 adset_id）
  const adsetGroups: Record<string, any[]> = {};
  campaignAds.forEach((ad: any) => {
    const adset_id = ad.adset_id;
    if (adset_id) {
      if (!adsetGroups[adset_id]) {
        adsetGroups[adset_id] = [];
      }
      adsetGroups[adset_id].push(ad);
    }
  });
  
  // 计算每个广告组的合计
  Object.keys(adsetGroups).forEach(adset_id => {
    const adsetAds = adsetGroups[adset_id];
    const adsetModifications = calculateAdsetModifications(adsetAds);
    
    // 找到广告组合计行
    const adsetSummary = allRowData.find(rowData => 
      rowData.adset_id === adset_id && 
      !rowData.ad_id
    );
    
    if (Object.keys(adsetModifications).length > 0 && adsetSummary && adsetSummary.id) {
      summaryValues[adsetSummary.id] = adsetModifications;
    }
  });
}

// 合并原始数据和修改数据
function mergeDataWithModifications(cachedData: any, modifiedData: any, summaryValues: Record<string, any>): any[] {
  const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];
  
  return cachedData.data.map((item: any) => {
    // 初始化增加字段
    const itemWithIncrease: any = { ...item };
    
    numericFields.forEach(field => {
      itemWithIncrease[`increase_${field}`] = 0;
    });
    
    // 查找匹配的修改数据
    const matchedModification = findRowModification(item, modifiedData, summaryValues);
    
    // 如果有修改数据，应用修改
    if (matchedModification) {
      Object.entries(matchedModification).forEach(([field, value]) => {
        itemWithIncrease[`increase_${field}`] = Number(value) || 0;
      });
    }
    
    return itemWithIncrease;
  });
}

// 查找行的修改数据
function findRowModification(item: any, modifiedData: any, summaryValues: Record<string, any>): any | null {
  // 1. 直接使用item.id匹配
  if (modifiedData[item.id]) {
    return modifiedData[item.id];
  }
  
  // 2. 如果item.id包含多个下划线，尝试提取ad_id进行匹配
  if (item.id) {
    const idParts = item.id.split('_');
    if (idParts.length >= 4) {
      const adIdOnly = idParts[idParts.length - 1];
      if (adIdOnly && modifiedData[adIdOnly]) {
        return modifiedData[adIdOnly];
      }
      if (!modifiedData[adIdOnly] && idParts.length >= 3) {
        const adsetIdOnly = idParts[idParts.length - 2];
        if (adsetIdOnly && modifiedData[adsetIdOnly]) {
          return modifiedData[adsetIdOnly];
        }
      }
    }
  }
  
  // 3. 检查是否为合计行
  if (summaryValues[item.id]) {
    return summaryValues[item.id];
  }
  
  // 4. 使用账户名称匹配账户合计行
  if (item.accountName && !item.ad_id && !item.adset_id && !item.campaign_id && summaryValues[item.accountName]) {
    return summaryValues[item.accountName];
  }
  
  return null;
}

// 消息处理函数 - 获取缓存数据
export function handleReportingGetCachedData(message: any, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const { date } = message;
      console.log('获取缓存数据，日期:', date);
      
      // 获取缓存数据
      const cachedData = await fetchCachedData();
      
      // 获取修改的数据
      const modifiedData = await getModifiedData(date) || {};
      console.log('获取的修改数据（增加值）:', modifiedData);
      
      if (cachedData && cachedData.data) {
        // 计算合计行的增加值
        const summaryValues = calculateSummaryValuesForCache(cachedData.data, modifiedData);
        
        // 合并原始数据和修改数据
        const mergedData = mergeDataWithModifications(cachedData, modifiedData, summaryValues);
        
        // 更新缓存数据中的data为合并后的数据
        const updatedCachedData = {
          ...cachedData,
          data: mergedData
        };
        
        console.log('获取报告页面缓存数据并合并修改数据:', updatedCachedData);
        sendResponse({ success: true, data: updatedCachedData });
      } else {
        // 缓存中没有数据，返回空数据
        console.log('缓存中没有数据');
        sendResponse({ success: true, data: null });
      }
    } catch (error: any) {
      console.error('获取报告页面缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 获取缓存数据
async function fetchCachedData(): Promise<any | null> {
  const dataKey = await generateCacheKey('reporting_data');
  return await browserStorage.get(dataKey);
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
