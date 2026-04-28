import { browserStorage } from '../../../utils/storage';
import { getCurrentDate } from './date';
import { getSavedAccountId } from './account';
import { extractDateRange, getCurrentPageState } from './dom';
import { getCachedModifications } from './cacheRenderer';

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
// 解析中文日期
export const parseChineseDate = (dateStr: string): Date => {
  const cleaned = dateStr.trim();
  const match = cleaned.match(/(\d+)年(\d+)月(\d+)日/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
};
/**
 * 生成日期范围内的所有日期数组
 * @param startDate 开始日期 (Date对象)
 * @param endDate 结束日期 (Date对象)
 * @returns 日期字符串数组 (YYYY-MM-DD格式)
 */
export function getDatesInRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * 根据日期范围读取所有缓存的修改增加值，按字段求和后返回
 * @param startDate 开始日期 (YYYY-MM-DD格式字符串或Date对象)
 * @param endDate 结束日期 (YYYY-MM-DD格式字符串或Date对象)
 * @returns 合并后的修改数据数组，相同ID的增加值已按字段求和
 */
export async function getMergedModificationsForDateRange(): Promise<any[]> {
  try {
    const dateRanges = extractDateRange();
    console.log('当前DOM的日期范围:', dateRanges);
    
    // 检查日期范围是否有效
    if (!dateRanges || dateRanges.length < 2) {
      console.log('日期范围无效，尝试使用当前日期');
      // 使用当前日期作为默认值
      const currentDate = getCurrentDate();
      return await getCachedModifications(currentDate);
    }
    
    // 解析开始日期
    const start = parseChineseDate(dateRanges[0]);
    
    // 解析结束日期并设置为当天的23:59:59
    const end = parseChineseDate(dateRanges[1]);
    end.setHours(23, 59, 59, 999);
    
    // 获取日期范围内的所有日期
    const datesInRange = getDatesInRange(start, end);
    console.log('日期范围内的所有日期:', datesInRange);
    
    // 从缓存中获取所有日期的修改数据
    const modificationsArray = await Promise.all(
      datesInRange.map(async (date) => {
        const modificationsKey = await generateCacheKeyForDate('ad_modifications', date);
        const modifications = await browserStorage.get(modificationsKey);
        // console.log(`获取日期 ${date} 的修改数据: ${modifications ? modifications.length : 0} 条`);
        return modifications || [];
      })
    );
    
    // 合并修改数据，按字段求和
    const mergedModifications = mergeModificationsByField(modificationsArray);
    console.log('合并后的修改数据:', mergedModifications);
    
    return mergedModifications;
  } catch (error) {
    console.error('获取合并修改数据失败:', error);
    return [];
  }
}

/**
 * 合并多个日期的修改数据，按字段求和数值类型的字段
 * @param modificationsArray 多个日期的修改数据数组
 * @returns 合并后的修改数据数组
 */
function mergeModificationsByField(modificationsArray: any[][]): any[] {
  const mergedMap = new Map<string, any>();
  
  // 数值字段列表，这些字段需要累加
  const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases', 'results', 'registration_cost', 'purchase_cost', 'costPerResult'];
  
  for (const modifications of modificationsArray) {
    if (!modifications || !Array.isArray(modifications)) continue;
    
    for (const modification of modifications) {
      if (!modification || !modification.completeData || !modification.completeData.id) continue;
      
      const id = modification.completeData.id.toString();
      
      if (!mergedMap.has(id)) {
        // 第一次遇到该ID，创建新的合并项
        mergedMap.set(id, {
          ...modification,
          completeData: { ...modification.completeData },
          modifiedFields: { ...modification.modifiedFields }
        });
      } else {
        // 已存在该ID，合并增加值
        const existing = mergedMap.get(id);
        
        // 合并modifiedFields中的字段
        for (const [field, value] of Object.entries(modification.modifiedFields)) {
          const newValue = parseFloat(String(value));
          
          // 如果是数值字段（包括increase_前缀的字段），进行累加
          if (!isNaN(newValue) && (numericFields.includes(field) || field.startsWith('increase_'))) {
            const existingValue = parseFloat(String(existing.modifiedFields[field])) || 0;
            existing.modifiedFields[field] = existingValue + newValue;
          } else {
            // 非数值字段或不在列表中，保留最新值
            existing.modifiedFields[field] = value;
          }
        }
        
        // 更新completeData中的计算字段（如果有）
        for (const [field, value] of Object.entries(modification.completeData)) {
          if (field.startsWith('calculated_')) {
            existing.completeData[field] = value;
          }
        }
      }
    }
  }
  
  return Array.from(mergedMap.values());
}
