// 报告页面的缓存模块
// 负责处理数据缓存和恢复

import { browserStorage } from '../../../utils/storage';
import { getSavedAccountId } from '../manage/account';
import { getCurrentDate } from '../manage/date';

// 缓存键前缀
const CACHE_PREFIX = 'reporting_data_';

// 生成缓存键
// 生成缓存键（不包含排序信息，排序信息使用独立的key存储）
export async function generateCacheKey(prefix: string) {
  const date = getCurrentDate();
  const accountId = await getSavedAccountId();
  
  return `${prefix}_${accountId}_${date}`;
}

// 保存数据到缓存
export async function saveDataToCache(data: any): Promise<void> {
  const key = await generateCacheKey('reporting_data');
  await browserStorage.set(key, data);
}

// 从缓存获取数据
export async function getDataFromCache(): Promise<any | null> {
  const key = await generateCacheKey('reporting_data');
  return await browserStorage.get(key);
}

// 保存修改的数据
export async function saveModifiedData(modifiedData: any): Promise<void> {
  const key = await generateCacheKey('modified');
  await browserStorage.set(key, modifiedData);
}

// 获取修改的数据
export async function getModifiedData(): Promise<any | null> {
  const key = await generateCacheKey('modified');
  return await browserStorage.get(key);
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
