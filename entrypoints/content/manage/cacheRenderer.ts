/**
 * 缓存渲染模块
 * 集中处理所有缓存数据的渲染逻辑
 * 包括：保存、页面刷新、排序变化、tab切换、滚动等场景
 */

import { browserStorage } from "../../../utils/storage";
import { generateCacheKey, generateCacheKeyForDate, getMergedModificationsForDateRange } from './cache';
import { findTableBody, findRowById, updateRowData, updateFooterData, extractFooterData, calculateMergedTotals } from './messageHandlers';
import { getCurrentPageState,extractAdsFromDom, getFilteredRows, getColumnIndices } from './dom';

// 渲染结果类型
export interface RenderResult {
  success: boolean;
  successCount: number;
  failCount: number;
  message?: string;
}
// 排序id逻辑
async function sortCacheIds(modifications: any[] = [], ads: any[] = [], sortField: string, sortDirection: string): Promise<string[]> {
  // 应用修改数据到广告数据
  if (modifications && Array.isArray(modifications) && modifications.length > 0) {
    ads = ads.map((ad: any) => {
      let updatedAd = { ...ad };
      if (!updatedAd.increaseValues) {
        updatedAd.increaseValues = {};
      }
      const modification = modifications.find(mod => {
        return mod?.completeData?.id?.toString() === ad.id || 
                mod?.completeData?.ad_id?.toString() === ad.id || 
                mod?.completeData?.adset_id?.toString() === ad.id || 
                mod?.completeData?.campaign_id?.toString() === ad.id;
      });
      
      if (modification) {
        for (const [field, value] of Object.entries(modification.modifiedFields)) {
          updatedAd.increaseValues[field] = (updatedAd.increaseValues[field] || 0) + value;
        }
      }
      
      return updatedAd;
    });
  }
  
  // 对广告数据进行排序
  ads.sort((a: any, b: any) => {
    const originalValueA = a[sortField];
    const originalValueB = b[sortField];
    const hasValueA = originalValueA !== undefined && originalValueA !== null && originalValueA !== '—' && originalValueA !== '';
    const hasValueB = originalValueB !== undefined && originalValueB !== null && originalValueB !== '—' && originalValueB !== '';
    console.log('排序字段值:', originalValueA, originalValueB, hasValueA, hasValueB);
    if (!hasValueA && hasValueB) {
      return 1;
    } else if (hasValueA && !hasValueB) {
      return -1;
    } else if (!hasValueA && !hasValueB) {
      return 0;
    }
    
    let valueA = 0;
    let valueB = 0;
    
    if (a[sortField] !== undefined) {
      valueA = parseFloat(String(a[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    if (b[sortField] !== undefined) {
      valueB = parseFloat(String(b[sortField]).replace(/[^\d.-]/g, '')) || 0;
    }
    
    if (a.increaseValues && a.increaseValues[sortField]) {
      valueA += a.increaseValues[sortField];
    }
    if (b.increaseValues && b.increaseValues[sortField]) {
      valueB += b.increaseValues[sortField];
    }
    
    if (sortDirection === 'desc') {
      return valueB - valueA;
    } else {
      return valueA - valueB;
    }
  });
  
  const sortedAdIds = ads.map((ad: any) => ad.id);
  return sortedAdIds;
}
// 排序表格行
export async function sortTableRows(modifications: any[] = []): Promise<void> {
  try {
    // 获取当前页面状态和排序信息
    const pageState = getCurrentPageState();
    const { field, direction } = pageState;
    
    if (!field) {
      console.log('没有排序字段，跳过排序');
      return;
    }
    
    // 找到表体
    const tableBody = findTableBody();
    if (!tableBody) {
      console.warn('排序表格行: 未找到表体');
      return;
    }
    
    // 获取tableBody中的span子元素
    const spanElements = Array.from(tableBody.children).filter((child: Element) => child.tagName === 'SPAN');
    console.log('找到的span元素数量:', spanElements.length);
    
    // 收集所有span元素及其translate值
    const spanInfoArray: Array<{ span: Element; adId: string; translateElement: Element | null; originalIndex: number }> = [];
    
    spanElements.forEach((span, index) => {
      // 获取span的adId
      const surface = span.getAttribute('data-surface') || '';
      // 修改正则表达式，确保能正确匹配 adId
      const adIdMatch = surface.match(/(?<=table_row:)(\d+)(?=unit)/);
      const adId = adIdMatch ? adIdMatch[1] : null;
      // console.log(`行 ${index} surface: ${surface}, adId: ${adId}`);
      if (adId) {
        // 找到带有translate样式的子元素（span的唯一子元素）
        let translateElement: Element | null = span.firstElementChild;
        
        spanInfoArray.push({ span, adId, translateElement, originalIndex: index });
        // console.log(`行 ${index} adId: ${adId}, originalIndex: ${index}, translateElement: ${translateElement}`);
      }
    });
    
    // 获取缓存数据
    const ads: any[] = [];
    
    // 确保所有span元素都有对应的广告数据
    const allAdIds = spanInfoArray.map(info => info.adId);
    const existingAdIds = new Set(ads.map(ad => ad.id));
    
    // 为没有缓存数据的span元素创建默认广告数据
    allAdIds.forEach(adId => {
      if (!existingAdIds.has(adId)) {
        ads.push({
          id: adId,
          increaseValues: {},
          [field]: '—' // 设置排序字段为'—'，表示没有数值
        });
      }
    });
    
    console.log('排序前的广告id数组:', JSON.stringify(ads?.map((ad: any) => ad.id)));
    // 获取排序后的广告id数组
    const sortedAdIds = await sortCacheIds(modifications, ads, field, direction as string);
    console.log('排序后的广告id数组:', JSON.stringify(sortedAdIds));
    
    // 计算基准translate值，按照行索引生成
    const baseTranslateValues: string[] = [];
    spanElements.forEach((_, index) => {
      // 每行的translate值为 0px, 46px, 92px, 138px, ...
      const translateValue = `${index * 46}px`;
      baseTranslateValues.push(translateValue);
    });
    console.log('基准translate值列表:', baseTranslateValues);
    console.log('排序后的广告id数组:', sortedAdIds);
    
    // 为每个排序后的adId分配对应的translate值
    sortedAdIds.forEach((adId, index) => {
      if (index < baseTranslateValues.length) {
        // 找到对应的span信息
        const spanInfo = spanInfoArray.find(info => info.adId === adId);
        
        if (spanInfo && spanInfo.translateElement) {
          const newTranslate = baseTranslateValues[index];
          (spanInfo.translateElement as HTMLElement).style.transform = `translate(0px, ${newTranslate})`;
          // 验证修改是否成功
          const updatedTransform = (spanInfo.translateElement as HTMLElement).style.transform;
          console.log(`更新广告行 ${adId} 的translate值为: ${newTranslate}, 更新后transform: ${updatedTransform}`);
        } else {
          console.warn(`未找到广告行 ${adId} 的translate元素`);
        }
      }
    });
    
    // 保存translate值和行id到缓存
    const translateCache = sortedAdIds.map((adId, index) => ({
      adId,
      translate: baseTranslateValues[index] || ''
    }));
    browserStorage.set('adTranslateValues', translateCache);
    console.log('已保存translate值到StorageManager:', translateCache.length, '个值');
    
    console.log('表格行排序完成');
  } catch (error) {
    console.error('排序表格行错误:', error);
  }
}
// 通用单次费用计算函数
function calculatePerCost(spend: number, perCount: number): number {
  if (perCount === 0 || spend <= 0) {
    return 0;
  }
  return Number((spend / perCount).toFixed(2));
}

// 检查是否需要计算单次费用
function needsCostCalculation(modifiedFields: Record<string, number>): boolean {
  return modifiedFields.spend !== undefined || 
         modifiedFields.registrations !== undefined || 
         modifiedFields.purchases !== undefined || 
         modifiedFields.results !== undefined;
}

// 根据 saveFields 和 completeData 计算单次费用字段
function calculateCostFieldsFromSaveFields(saveFields: Record<string, number>, completeData: any): Record<string, number> {
  const costFields: Record<string, number> = {};
  
  // 获取已花费金额：优先使用 saveFields（已包含增加值），否则使用 completeData
  const totalSpend = saveFields.spend !== undefined 
    ? saveFields.spend 
    : (parseFloat(String(completeData.spend)) || 0);
  
  // 获取注册次数：优先使用 saveFields（已包含增加值），否则使用 completeData
  const totalRegistrations = saveFields.registrations !== undefined 
    ? saveFields.registrations 
    : (parseFloat(String(completeData.registrations)) || 0);
  
  // 获取购买次数：优先使用 saveFields（已包含增加值），否则使用 completeData
  const totalPurchases = saveFields.purchases !== undefined 
    ? saveFields.purchases 
    : (parseFloat(String(completeData.purchases)) || 0);
  
  // 获取成效次数：优先使用 saveFields（已包含增加值），否则使用 completeData
  const totalResults = saveFields.results !== undefined 
    ? saveFields.results 
    : (parseFloat(String(completeData.results)) || 0);
  
  console.log('计算单次费用:', { totalSpend, totalRegistrations, totalPurchases, totalResults });
  
  // 计算单次费用
  costFields.registration_cost = calculatePerCost(totalSpend, totalRegistrations);
  costFields.purchase_cost = calculatePerCost(totalSpend, totalPurchases);
  costFields.costPerResult = calculatePerCost(totalSpend, totalResults);
  
  console.log('计算结果:', costFields);
  
  return costFields;
}

// 应用修改数据到表格行
async function applyModificationsToRows(
  mergedModifications: any[], 
  currentAds: any[], 
  filteredRows: Array<HTMLElement>, 
  currentLevel: string
): Promise<{ success: boolean; successCount: number; failCount: number; currency: string }> {
  let successCount = 0;
  let failCount = 0;
  let currencySymbol = '$';
  
  for (const ad of currentAds) {
    // 找到对应广告的修改项（使用合并后的修改数据）
    const modification = mergedModifications.find(mod => {
      if (!mod || !mod.completeData) return false;
      
      // 根据当前层级选择正确的ID进行匹配
      switch (currentLevel) {
        case 'Ads':
          return mod.completeData.ad_id === ad.ad_id || mod.completeData.id === ad.ad_id;
        case 'Adsets':
          return mod.completeData.adset_id === ad.adset_id || mod.completeData.id === ad.adset_id;
        case 'Campaigns':
          return mod.completeData.campaign_id === ad.campaign_id || mod.completeData.id === ad.campaign_id;
        default:
          return mod.completeData.id === ad.id;
      }
    });
    
    if (modification && modification.completeData) {
      const { completeData, modifiedFields } = modification;
      const id = completeData.id;
      // 保存货币符号
      currencySymbol = completeData.currencySymbol || '$';
      
      // 构建增加值字段
      const increaseFields: Record<string, number> = {};
      Object.keys(modifiedFields).forEach(key => {
        increaseFields[key] = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
      });
      
      // 过滤出需要保存的字段，只保存 completeData 中存在的字段，且value值是相加后的结果
      const saveFields = Object.keys(modifiedFields).reduce((acc: Record<string, number>, key: string) => {
        if (completeData.hasOwnProperty(key)) {
          // 将字符串转换为数字，去除货币符号和逗号等分隔符
          const originalValue = parseFloat(String(completeData[key]).replace(/[^\d.-]/g, '')) || 0;
          const increaseValue = parseFloat(String(modifiedFields[key]).replace(/[^\d.-]/g, '')) || 0;
          acc[key] = Number((Number(originalValue) + Number(increaseValue)).toFixed(2));
        }
        return acc;
      }, {});
      
      // 计算单次费用字段（使用 saveFields 和 completeData 中的值）
      if (needsCostCalculation(increaseFields)) {
        const costFields = calculateCostFieldsFromSaveFields(saveFields, completeData);
        Object.assign(saveFields, costFields);
      }
      
      if (!id || !saveFields || Object.keys(saveFields).length === 0) {
        console.warn('刷新页面数据: 修改项缺少id或saveFields');
        failCount++;
        continue;
      }
      
      // 查找匹配的行
      let foundRow = null;
      let lookupId = '';
      
      // 根据当前层级选择正确的ID
      switch (currentLevel) {
        case 'Ads':
          lookupId = ad.ad_id || id;
          break;
        case 'Adsets':
          lookupId = ad.adset_id || id;
          break;
        case 'Campaigns':
          lookupId = ad.campaign_id || id;
          break;
        default:
          lookupId = ad.id || id;
      }
      
      if (lookupId) {
        foundRow = findRowById(filteredRows, lookupId);
      }
      
      if (!foundRow) {
        console.warn(`刷新页面数据: 未找到匹配的行: ${lookupId}`);
        failCount++;
        continue;
      }
      
      // 更新行数据，传递货币符号和增加值字段
      await updateRowData(foundRow.scrollable, foundRow.fixed, saveFields, increaseFields, currencySymbol);
      console.log(`已刷新页面数据行: ${id}`, saveFields);
      successCount++;
    }
  }
  
  return { success: true, successCount, failCount, currency: currencySymbol };
}

/**
 * 统一的缓存渲染函数
 * 所有场景（保存、页面刷新、排序变化、tab切换、滚动等）都使用此函数
 */
export async function renderCachedModifications(): Promise<RenderResult> {
  console.log(`[${new Date().toISOString()}] 开始渲染缓存修改数据`);
  
  try {
    // 1. 获取日期范围内的合并修改数据
    console.log('开始获取日期范围内的合并修改数据');
    const mergedModifications = await getMergedModificationsForDateRange();
    console.log('合并后的修改项:', mergedModifications);
    console.log('合并后的修改项数量:', mergedModifications?.length || 0);
    
    if (!mergedModifications || mergedModifications.length === 0) {
      console.log('没有缓存的修改数据需要渲染');
      return { success: true, successCount: 0, failCount: 0, message: '没有缓存数据' };
    }
    
    // 2. 找到表体
    const tableBody = findTableBody();
    if (!tableBody) {
      console.error('渲染缓存数据: 未找到表格结构');
      return { success: false, successCount: 0, failCount: 0, message: '未找到表格结构' };
    }
    
    // 3. 过滤有效的行
    const filteredRows = getFilteredRows(tableBody);
    
    // 4. 从DOM中提取当前数据，确保按照DOM顺序处理
    const { ads: currentAds } = await extractAdsFromDom();
    
    // 5. 获取当前页面层级
    const pageState = getCurrentPageState();
    const currentLevel = pageState.level || 'Campaigns';
    
    // 6. 从DOM提取原始合计值
    const originalFooterData = extractFooterData();
    // console.log('从DOM提取的原始合计数据:', originalFooterData);
    
    // 7. 计算合并后的合计增加值
    const mergedTotals = calculateMergedTotals(mergedModifications, originalFooterData);
    console.log('合并后的合计数据:', mergedTotals);
    
    // 8. 应用修改数据到表格行
    const { success: applySuccess, successCount, failCount, currency: currencySymbol } = 
      await applyModificationsToRows(mergedModifications, currentAds, filteredRows, currentLevel);
    
    // 9. 更新合计行数据
    // console.log('更新合计行数据:', mergedTotals);
    await updateFooterData(mergedTotals, currencySymbol);
    
    // 10. 等待DOM更新完成后再进行排序
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 11. 对表格行进行排序（基于页面上实际显示的值）
    await sortTableRows(mergedModifications);
    
    console.log(`渲染缓存数据完成: 成功 ${successCount} 条, 失败 ${failCount} 条`);
    return { success: true, successCount, failCount };
    
  } catch (error: any) {
    console.error('渲染缓存数据错误:', error);
    return { success: false, successCount: 0, failCount: 0, message: error.message };
  }
}

/**
 * 检查是否有缓存数据需要渲染
 */
export async function hasCachedModifications(): Promise<boolean> {
  try {
    // 使用 getMergedModificationsForDateRange 来检查是否有缓存数据
    // 这个函数会根据日期范围从多个缓存键中获取数据
    const mergedModifications = await getMergedModificationsForDateRange();
    
    if (mergedModifications && Array.isArray(mergedModifications) && mergedModifications.length > 0) {
      console.log('存在缓存数据，需要渲染');
      return true;
    } else {
      console.log('没有缓存数据');
      return false;
    }
  } catch (error) {
    console.error('检查缓存数据错误:', error);
    return false;
  }
}

/**
 * 保存修改数据到缓存
 */
export async function saveModificationsToCache(
  date: string, 
  modifications: any[], 
  currencySymbol: string
): Promise<{ success: boolean; message?: string }> {
  try {
    // 获取当前页面状态和层级
    const pageState = getCurrentPageState() || {};
    const currentLevel = pageState.level || 'Campaigns';
    
    console.log('保存修改数据 - 日期:', date);
    console.log('保存修改数据 - 层级:', currentLevel);
    console.log('保存修改数据 - 修改项数量:', modifications.length);
    
    // 处理修改数据，建立层级关系
    const modificationsWithId = modifications.map(mod => {
      if (!mod || !mod.completeData) return null;
      
      const { completeData, modifiedFields } = mod;
      const id = completeData.id;
      
      if (!id) return null;
      
      return {
        completeData: {
          ...completeData,
          currencySymbol: completeData.currencySymbol || currencySymbol,
          // 根据层级添加对应的ID字段
          ...(currentLevel === 'Ads' && { ad_id: completeData.ad_id || id }),
          ...(currentLevel === 'Adsets' && { adset_id: completeData.adset_id || id }),
          ...(currentLevel === 'Campaigns' && { campaign_id: completeData.campaign_id || id }),
        },
        modifiedFields: modifiedFields || {}
      };
    }).filter(item => item !== null);
    
    const modificationsKey = await generateCacheKeyForDate('ad_modifications', date);
    const sortInfoKey = await generateCacheKey('ad_sort_info');
    
    // console.log('保存修改数据 - 缓存键:', modificationsKey);
    
    // 保存修改数据
    await Promise.all([
      browserStorage.set(modificationsKey, modificationsWithId),
      browserStorage.set(sortInfoKey, pageState || {})
    ]);
    
    console.log('保存修改成功，当前层级:', currentLevel);
    
    // 保存成功后立即渲染到页面
    // console.log('保存后立即渲染缓存数据到页面');
    const renderResult = await renderCachedModifications();
    console.log('渲染结果:', renderResult);
    
    return { success: true };
    
  } catch (error: any) {
    console.error('保存修改数据错误:', error);
    return { success: false, message: error.message };
  }
}

/**
 * 获取缓存的修改数据
 */
export async function getCachedModifications(date?: string): Promise<any[]> {
  try {
    const modificationsKey = date 
      ? await generateCacheKeyForDate('ad_modifications', date)
      : await generateCacheKey('ad_modifications');
    
    const modifications = await browserStorage.get(modificationsKey);
    return modifications || [];
  } catch (error) {
    console.error('获取缓存数据错误:', error);
    return [];
  }
}
