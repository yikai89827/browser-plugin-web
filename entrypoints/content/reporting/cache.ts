// 报告页面的缓存模块
// 负责处理数据缓存和恢复

import { browserStorage } from '../../../utils/storage';
import { getSavedAccountId } from '../manage/account';
import { getCurrentDate } from '../manage/date';

// 缓存键前缀
const CACHE_PREFIX = 'reporting_data_';

// 生成缓存键（不包含排序信息，排序信息使用独立的key存储）
export async function generateCacheKey(prefix: string) {
  const date = getCurrentDate();
  const accountId = await getSavedAccountId();
  
  return `${prefix}_${accountId}_${date}`;
}

// 生成日期范围内的所有日期数组
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  while (start <= end) {
    const dateStr = start.toISOString().split('T')[0];
    dates.push(dateStr);
    start.setDate(start.getDate() + 1);
  }
  
  return dates;
}

// 生成指定日期的缓存键
export async function generateCacheKeyForDate(prefix: string, date: string) {
  const accountId = await getSavedAccountId();
  return `${prefix}_${accountId}_${date}`;
}

// 保存修改的数据
export async function saveModifiedData(modifiedData: any, date?: string): Promise<void> {
  const key = date ? await generateCacheKeyForDate('modified', date) : await generateCacheKey('modified');
  await browserStorage.set(key, modifiedData);
}

// 获取修改的数据（支持单个日期或日期范围）
export async function getModifiedData(dateOrStartDate?: string, endDate?: string): Promise<any | null> {
  // 如果没有提供日期，使用当前日期
  if (!dateOrStartDate) {
    const key = await generateCacheKey('modified');
    return await browserStorage.get(key);
  }
  
  // 如果提供了结束日期，说明是日期范围查询
  if (endDate) {
    console.log(`获取日期范围 ${dateOrStartDate} 到 ${endDate} 的修改数据`);
    
    // 生成日期范围内的所有日期
    const dates = generateDateRange(dateOrStartDate, endDate);
    console.log('日期范围内的日期:', dates);
    
    // 累加所有日期的修改数据
    const mergedData: any = {};
    
    for (const date of dates) {
      const key = await generateCacheKeyForDate('modified', date);
      const dateData = await browserStorage.get(key);
      
      if (dateData) {
        // 累加每个广告的修改值
        for (const adId of Object.keys(dateData)) {
          if (!mergedData[adId]) {
            mergedData[adId] = {};
          }
          
          for (const field of Object.keys(dateData[adId])) {
            mergedData[adId][field] = (mergedData[adId][field] || 0) + Number(dateData[adId][field]);
          }
        }
      }
    }
    
    console.log('累加后的修改数据:', mergedData);
    return Object.keys(mergedData).length > 0 ? mergedData : null;
  }
  
  // 单个日期查询
  const key = await generateCacheKeyForDate('modified', dateOrStartDate);
  return await browserStorage.get(key);
}

// 检查指定日期或日期范围是否有缓存的修改数据
export async function checkDateRangeForModifications(dateOrStartDate?: string | null, endDate?: string): Promise<boolean> {
  try {
    const modifiedData = await getModifiedData(dateOrStartDate || '', endDate);
    if (modifiedData && Object.keys(modifiedData).length > 0) {
      console.log('检测到存在修改数据');
      return true;
    }
    console.log('未检测到修改数据');
    return false;
  } catch (error) {
    console.error('检查日期范围修改数据时出错:', error);
    return false;
  }
}

// 清除缓存
export async function clearCache(): Promise<void> {
  const keys = await browserStorage.keys();
  for (const key of keys) {
    if (key.startsWith(CACHE_PREFIX)) {
      await browserStorage.remove(key);
    }
  }
}
