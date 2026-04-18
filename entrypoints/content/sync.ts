import { browserStorage } from '../../utils/storage';
import { extractAdsFromDom, getColumnIndices, updateScrollableRow, createOverlay, removeOverlay } from './dom';
import { generateCacheKey } from './cache';

// 全局同步状态
if (typeof window !== 'undefined') {
  (window as any).isSyncing = false;
}

// 防抖函数
let syncTimeout: NodeJS.Timeout | null = null;
let lastSyncTime = 0;
let isUpdatingDOM = false;

// 防抖同步函数
export function debouncedSync() {
  // 检查是否在短时间内已经执行过同步，避免频繁调用
  const now = Date.now();
  if (now - lastSyncTime < 300) {
    console.log('跳过同步，距离上次同步时间太短');
    return;
  }
  
  clearTimeout(syncTimeout!);
  syncTimeout = setTimeout(async () => {
    // 检查全局的isSyncing变量
    if (!(window as any).isSyncing && !isUpdatingDOM) {
      (window as any).isSyncing = true;
      lastSyncTime = now;
      try {
        // 检查是否有缓存数据
        const modificationsKey = await generateCacheKey('ad_modifications');
        const modificationsArray = await browserStorage.get(modificationsKey);
        
        // 只有在有缓存数据时才创建遮盖层
        if (modificationsArray && Array.isArray(modificationsArray) && modificationsArray.length > 0) {
          createOverlay();
        }
        
        // 重新获取列索引
        await getColumnIndices();
        
        // 重新提取广告数据（包括原始值）
        const { ads, DomColumnMapping, sortInfo } = await extractAdsFromDom();
        
        // 保存更新后的列映射
        if (DomColumnMapping && Object.keys(DomColumnMapping).length > 0) {
          const columnMappingKey = await generateCacheKey('columnMapping');
          await browserStorage.set(columnMappingKey, DomColumnMapping);
        }
        
        // 同步广告数据到页面
        await syncAdDataToPage(sortInfo);
      } catch (error) {
        console.error('刷新页面数据错误:', error);
      } finally {
        // 无论成功失败都关闭遮盖层
        removeOverlay();
        (window as any).isSyncing = false;
      }
    }
  }, 0);
}

// 同步广告数据到页面
export async function syncAdDataToPage(sortInfo?: { field: string | null; direction: string | null }) {
  try {
    // 获取缓存的修改数据
    const modificationsKey = await generateCacheKey('ad_modifications');
    const modifications = await browserStorage.get(modificationsKey);
    
    if (!modifications || !Array.isArray(modifications)) {
      console.log('没有缓存的修改数据');
      return;
    }
    
    console.log('同步广告数据到页面，修改数据数量:', modifications.length);
    
    // 提取当前页面的广告数据
    const { ads } = await extractAdsFromDom();
    console.log('当前页面的广告数据:', ads.length);
    
    // 遍历修改数据，更新到页面
    for (const modification of modifications) {
      if (!modification || !modification.uniqueId || !modification.modifiedFields) {
        continue;
      }
      
      // 找到对应的广告行
      const adRow = findAdRowByUniqueId(ads, modification.uniqueId);
      if (adRow) {
        // 计算原始值和增加值的总和
        const valuesToUpdate = calculateValuesToUpdate(modification);
        
        // 更新到页面
        await updateAdRow(adRow, valuesToUpdate);
      } else {
        console.log('未找到匹配的广告行:', modification.uniqueId);
      }
    }
    
    console.log('同步广告数据到页面完成');
  } catch (error) {
    console.error('同步广告数据到页面错误:', error);
  }
}

// 根据唯一标识查找广告行
function findAdRowByUniqueId(ads: any[], uniqueId: string) {
  return ads.find(ad => ad && ad.uniqueId === uniqueId);
}

// 计算要更新的值
function calculateValuesToUpdate(modification: any) {
  const valuesToUpdate: Record<string, string> = {};
  
  if (modification.completeData && modification.modifiedFields) {
    Object.keys(modification.modifiedFields).forEach(field => {
      const originalValue = modification.completeData[field] || 0;
      const increaseValue = modification.modifiedFields[field] || 0;
      const totalValue = parseFloat(originalValue) + parseFloat(increaseValue);
      valuesToUpdate[field] = totalValue.toFixed(2);
    });
  }
  
  return valuesToUpdate;
}

// 更新广告行
async function updateAdRow(adRow: any, valuesToUpdate: Record<string, string>) {
  try {
    const rowElement = document.querySelector(`[data-ad-id="${adRow.id}"]`) || 
                      document.querySelectorAll('[role="rowgroup"] > [role="row"]')[adRow.index];
    
    if (rowElement) {
      // 获取固定列数量
      const fixed = rowElement.querySelector('[role="presentation"]');
      const fixIndex = fixed?.children[0]?.children?.length ? (fixed.children[0].children.length - 1) : 0;
      
      // 从DOM中获取列索引
      const columnIndices = await getColumnIndices();
      
      // 更新可滚动行
      await updateScrollableRow(rowElement, valuesToUpdate, columnIndices, fixIndex);
    }
  } catch (error) {
    console.error('更新广告行错误:', error);
  }
}
