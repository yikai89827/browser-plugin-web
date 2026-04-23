// 报告页面的缓存模块
// 负责处理数据缓存和恢复

import { browserStorage } from '../../../utils/storage';

// 缓存键前缀
const CACHE_PREFIX = 'reporting_data_';

// 生成缓存键
export function generateCacheKey(): string {
  // 基于当前URL和时间戳生成缓存键
  const url = window.location.href;
  const timestamp = Math.floor(Date.now() / (1000 * 60 * 5)); // 每5分钟更新一次
  return `${CACHE_PREFIX}${btoa(url)}_${timestamp}`;
}

// 保存数据到缓存
export async function saveDataToCache(data: any): Promise<void> {
  const key = generateCacheKey();
  await browserStorage.set(key, data);
}

// 从缓存获取数据
export async function getDataFromCache(): Promise<any | null> {
  const key = generateCacheKey();
  return await browserStorage.get(key);
}

// 保存修改的数据
export async function saveModifiedData(modifiedData: any): Promise<void> {
  const key = `${CACHE_PREFIX}modified`;
  await browserStorage.set(key, modifiedData);
}

// 获取修改的数据
export async function getModifiedData(): Promise<any | null> {
  const key = `${CACHE_PREFIX}modified`;
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
