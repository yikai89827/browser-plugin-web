import { browserStorage } from '../../../utils/storage';
import { getCurrentDate } from './date';
import { getSavedAccountId } from './account';
import { getCurrentPageState } from './dom';

// 生成缓存键（不包含排序信息，排序信息使用独立的key存储）
export async function generateCacheKey(prefix: string) {
  const date = getCurrentDate();
  const {level} = getCurrentPageState();
  const accountId = await getSavedAccountId();
  
  return `${prefix}_${accountId}_${date}_${level}`;
}

// 生成排序信息的缓存键
export async function generateSortInfoKey() {
  const date = getCurrentDate();
  const {level} = getCurrentPageState();
  const accountId = await getSavedAccountId();
  return `sortInfo_${accountId}_${date}_${level}`;
}

// 生成指定日期的缓存键
export async function generateCacheKeyForDate(prefix: string, date: string) {
  const {level} = getCurrentPageState();
  const accountId = await getSavedAccountId();
  return `${prefix}_${accountId}_${date}_${level}`;
}

// 预加载缓存数据
export async function loadCachedData() {
  if (!(window as any).isSyncing) {
    (window as any).isSyncing = true;
    try {
      // 获取当前页面状态
      const pageState = getCurrentPageState();
      
      // 使用新的缓存键生成函数获取缓存数据
      const modificationsKey = await generateCacheKey('ad_modifications');
      const columnMappingKey = await generateCacheKey('columnMapping');
      
      const modifications = await browserStorage.get(modificationsKey);
      const columnMapping = await browserStorage.get(columnMappingKey);
      
      console.log('预加载缓存数据:', { modifications, columnMapping, pageState });
      
      return { modifications, columnMapping };
    } catch (error) {
      console.error('加载缓存数据错误:', error);
      return { modifications: null, columnMapping: null };
    } finally {
      (window as any).isSyncing = false;
    }
  }
  return { modifications: null, columnMapping: null };
}
