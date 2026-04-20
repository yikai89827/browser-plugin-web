// 消息处理模块
// 负责处理来自popup的消息

import { browserStorage } from '../../utils/storage';
import { dataExtractor } from './dataExtractor';
import { hierarchyManager, AdEntity } from './hierarchy';
import { valueSyncManager } from './syncValue';
import { generateCacheKey, generateSortInfoKey } from './cache';
import { detectSortInfo, findTableContainer, getColumnIndices } from './dom';
import { getCurrentPageState } from './date';

// 消息处理函数 - 从DOM获取广告数据
export function handleGetAdsFromDom(sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      // 从DOM提取数据
      const { entities, columnIndices, level } = dataExtractor.extractFromDom();
      
      // 检测层级关系
      hierarchyManager.detectHierarchy(entities);
      
      // 生成缓存键
      const adsKey = await generateCacheKey('ads');
      
      // 保存到缓存
      const sortInfo = detectSortInfo();
      const cacheData = { 
        ads: entities, 
        columnMapping: columnIndices,
        level
      };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      console.log('已从DOM提取数据并缓存:', { entities: entities.length, level });
      
      sendResponse({ 
        success: true, 
        ads: entities, 
        columnMapping: columnIndices, 
        level 
      });
    } catch (error: any) {
      console.error('从DOM获取数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 查找表格容器和表体
function findTableBody(): HTMLElement | null {
  const tableContainer = findTableContainer();
  if (!tableContainer) {
    console.warn('刷新页面数据: 未找到表格容器');
    return null;
  }
  
  const headerRow = tableContainer.querySelector('[role="row"]');
  if (!headerRow) {
    console.warn('刷新页面数据: 未找到表头行');
    return null;
  }
  
  const tableBody = headerRow.nextElementSibling;
  if (!tableBody) {
    console.warn('刷新页面数据: 未找到表体');
    return null;
  }
  
  return tableBody as HTMLElement;
}

// 过滤有效的表格行
function getFilteredRows(tableBody: HTMLElement): Array<HTMLElement> {
  const presentationRows = tableBody.querySelectorAll('div > [role="presentation"]');
  
  return Array.from(presentationRows).filter((row) => {
    const hasGrandchildren = row.children[0]?.children.length > 0;
    const hasNonSvgchildren = row.children[0]?.tagName.toLowerCase() !== 'svg';
    return hasGrandchildren && hasNonSvgchildren;
  }) as Array<HTMLElement>;
}

// 根据ID查找行
function findRowById(rows: Array<HTMLElement>, id: string): { row: HTMLElement; fixed: HTMLElement; scrollable: HTMLElement } | null {
  console.log(`查找ID为 ${id} 的行`);
  console.log(`  → 行数量: ${rows.length}`, rows);
  
  for (const row of rows) {
    const children = row.children;
    console.log(`  → 子元素数量: ${children.length}`, children);
    if (children.length === 1) {
      const firstChild = children[0] as HTMLElement;
      const grandchildren = firstChild.children;
      
      if (grandchildren.length >= 2) {
        const fixed = grandchildren[0] as HTMLElement;
        const scrollable = grandchildren[1] as HTMLElement;
        
        // 尝试通过ID查找行
        const scrollableCells = scrollable.children[0]?.children || [];
        if (scrollableCells.length > 0) {
          const idCell = scrollableCells[0];
          const idText = idCell?.textContent?.trim() || '';
          console.log(`缓存数据id:${id}  → ID单元格文本: ${idText}`);
          if (idText === id) {
            return { row, fixed, scrollable };
          }
        }
      }
    }
  }
  return null;
}

// 找到最内层的DOM元素
function findInnermostElement(element: Element): Element {
  let current = element;
  while (current.firstElementChild) {
    current = current.firstElementChild;
  }
  return current;
}

// 更新行数据
async function updateRowData(scrollable: HTMLElement, fixed: HTMLElement, fields: Record<string, number>): Promise<void> {
  // 获取列索引
  const columnIndices = await getColumnIndices();
  
  // 计算固定列长度
  const fixedColumnLength = fixed.children[0]?.children?.length - 1 || 0;
  
  // 更新行数据
  const cells = scrollable.children[0]?.children || [];
  
  for (const [field, value] of Object.entries(fields)) {
    const originalIndex = columnIndices[field];
    if (originalIndex !== undefined) {
      // 计算滚动列的索引（减去固定列的长度）
      const columnIndex = originalIndex - fixedColumnLength;
      if (columnIndex >= 0 && cells[columnIndex]) {
        const cell = cells[columnIndex];
        // 找到最内层的DOM元素进行更新
        const innermostElement = findInnermostElement(cell);
        innermostElement.textContent = String(value);
      }
    }
  }
}

// 消息处理函数 - 刷新页面数据
export function handleRefreshPageWithData(data: { id: string; fields: Record<string, number> }, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      console.log(`[${new Date().toISOString()}] 刷新页面数据:`, data);
      
      const { id, fields } = data;
      
      // 找到表体
      const tableBody = findTableBody();
      if (!tableBody) {
        sendResponse({ success: false, error: '未找到表格结构' });
        return;
      }
      
      // 过滤有效的行
      const filteredRows = getFilteredRows(tableBody);
      
      // 查找匹配的行
      const foundRow = findRowById(filteredRows, id);
      if (!foundRow) {
        console.warn(`刷新页面数据: 未找到匹配的行: ${id}`);
        sendResponse({ success: false, error: `未找到匹配的行: ${id}` });
        return;
      }
      
      // 更新行数据
      await updateRowData(foundRow.scrollable, foundRow.fixed, fields);
      console.log(`已刷新页面数据行: ${id}`, fields);
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('刷新页面数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取缓存数据
export function handleGetCachedData(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      const modificationsKey = await generateCacheKey('ad_modifications');
      
      const [adsData, modifications] = await Promise.all([
        browserStorage.get(adsKey),
        browserStorage.get(modificationsKey)
      ]);
      
      const ads = adsData?.cacheData?.ads || [];
      const columnMapping = adsData?.cacheData?.columnMapping || {};
      const level = adsData?.cacheData?.level || 'Campaigns';
      const sortInfo = adsData?.sortInfo || { field: null, direction: null };
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      sendResponse({ ads, columnMapping, level, sortInfo, modifications });
    } catch (error) {
      console.error('获取缓存数据错误:', error);
      sendResponse({ ads: [], columnMapping: {}, level: 'Campaigns', sortInfo: { field: null, direction: null }, modifications: [] });
    }
  })();
  return true;
}

// 消息处理函数 - 保存缓存数据
export function handleSaveCachedData(data: { date: string; ads: any; columnMapping: any; sortInfo: any; level: string }, sendResponse: (response: any) => void): boolean {
  const { ads, columnMapping, sortInfo, level } = data;
  (async () => {
    try {
      const adsKey = await generateCacheKey('ads');
      
      const cacheData = { ads, columnMapping, level };
      const dataToSave = { sortInfo, cacheData };
      
      await browserStorage.set(adsKey, dataToSave);
      
      // 检测层级关系
      if (ads.length > 0) {
        hierarchyManager.detectHierarchy(ads);
      }
      
      console.log('已保存数据到缓存:', adsKey);
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('保存缓存数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 保存修改数据
export function handleSaveModifications(data: { date: string; modifications: any[] }, sendResponse: (response: any) => void): boolean {
  const { modifications } = data;
  (async () => {
    try {
      // 获取当前页面状态和层级
      const pageState = getCurrentPageState();
      const currentLevel = pageState.level || 'Campaigns';
      
      // 处理修改数据，建立层级关系
      const modificationsWithId = modifications.map(item => {
        if (item && item.completeData) {
          const completeData = item.completeData;
          
          // 根据当前层级建立parentId关系
          let parentId: string | undefined;
          if (currentLevel === 'Adsets' && completeData.campaign_id) {
            parentId = completeData?.campaign_id || '';
          } else if (currentLevel === 'Ads' && completeData.adset_id) {
            parentId = completeData?.adset_id || '';
          }
          
          return { 
            ...item, 
            level: currentLevel,
            parentId: parentId,
            campaign_id: completeData?.campaign_id || '',
            adset_id: completeData?.adset_id || ''
          };
        }
        // 如果completeData为null，跳过这个修改项
        return null;
      }).filter(item => item !== null);
      
      const modificationsKey = await generateCacheKey('ad_modifications');
      const syncTasksKey = await generateCacheKey('sync_tasks');
      const sortInfo = detectSortInfo();
      const sortInfoKey = await generateSortInfoKey();
      
      // 保存修改数据
      await Promise.all([
        browserStorage.set(modificationsKey, modificationsWithId),
        browserStorage.set(sortInfoKey, sortInfo)
      ]);
      
      console.log('保存修改成功，当前层级:', currentLevel);
      
      // 生成同步任务
      if (modificationsWithId.length > 0) {
        // 为每个修改的实体生成同步任务
        const syncTasks: Array<{
          sourceEntity: {
            id: string;
            name: string;
            level: string;
            parentId?: string;
            grandParentId?: string;
          };
          modifiedFields: Record<string, number>;
          syncDirection: 'down' | 'up';
          timestamp: number;
        }> = [];
        
        modificationsWithId.forEach(item => {
          if (item && item.completeData && item.modifiedFields && Object.keys(item.modifiedFields).length > 0) {
            // 向下同步：父级修改同步到子级
            if (currentLevel === 'Campaigns') {
              syncTasks.push({
                sourceEntity: {
                  id: item.completeData.id,
                  name: item.completeData.name || 'Unknown',
                  level: currentLevel
                },
                modifiedFields: item.modifiedFields,
                syncDirection: 'down',
                timestamp: Date.now()
              });
            }
            // 向上同步：子级修改同步到父级
            else if (currentLevel === 'Adsets') {
              syncTasks.push({
                sourceEntity: {
                  id: item.completeData.id,
                  name: item.completeData.name || 'Unknown',
                  level: currentLevel,
                  parentId: item.parentId,
                  grandParentId: item.campaign_id
                },
                modifiedFields: item.modifiedFields,
                syncDirection: 'up',
                timestamp: Date.now()
              });
            }
            else if (currentLevel === 'Ads') {
              syncTasks.push({
                sourceEntity: {
                  id: item.completeData.id,
                  name: item.completeData.name || 'Unknown',
                  level: currentLevel,
                  parentId: item.parentId,
                  grandParentId: item.campaign_id
                },
                modifiedFields: item.modifiedFields,
                syncDirection: 'up',
                timestamp: Date.now()
              });
            }
          }
        });
        
        // 保存同步任务
        if (syncTasks.length > 0) {
          await browserStorage.set(syncTasksKey, syncTasks);
          console.log('已保存同步任务:', syncTasks);
        }
        
        // 在当前tab直接执行数值更新（因为当前tab的数据已经在DOM中）
        const entities: AdEntity[] = modificationsWithId.map(item => ({
          id: item?.completeData?.id || '',
          name: item?.completeData?.name || '',
          level: item?.level || currentLevel,
          parentId: item?.parentId || '',
          values: item?.completeData || {},
          increaseValues: item?.modifiedFields || {}
        }));
        
        // 过滤掉没有ID的实体
        const validEntities = entities.filter(entity => entity.id);
        
        // 检测层级关系
        hierarchyManager.detectHierarchy(validEntities);
        
        // 执行同步（更新当前tab的DOM）
        const syncResult = await valueSyncManager.batchSync(validEntities, currentLevel === 'Campaigns' ? 'down' : 'up');
        console.log('当前tab数值同步结果:', syncResult);
      }
      
      sendResponse({ success: true, isFirstSave: true });
    } catch (error: any) {
      console.error('保存修改数据错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// 消息处理函数 - 获取排序信息
export function handleGetSortInfo(date: string, sendResponse: (response: any) => void): boolean {
  (async () => {
    try {
      const sortInfoKey = await generateSortInfoKey();
      console.log(`[${new Date().toISOString()}] 获取排序信息:`, sortInfoKey);
      
      browserStorage.get(sortInfoKey).then((sortInfo) => {
        sendResponse(sortInfo);
      }).catch((error) => {
        console.error('获取排序信息错误:', error);
        sendResponse({ field: null, direction: null });
      });
    } catch (error: any) {
      console.error('获取排序信息错误:', error);
      sendResponse({ field: null, direction: null });
    }
  })();
  return true;
}

// 消息处理函数 - 执行数值同步
export function handleSyncValues(data: { entities: any[]; direction: string }, sendResponse: (response: any) => void): boolean {
  const { entities, direction } = data;
  (async () => {
    try {
      // 检测层级关系
      hierarchyManager.detectHierarchy(entities as AdEntity[]);
      
      // 执行同步
      console.log(`[${new Date().toISOString()}] 执行数值同步:`, entities, direction);
      const syncResult = await valueSyncManager.batchSync(entities as AdEntity[], direction as 'up' | 'down');
      console.log(`[${new Date().toISOString()}] 执行数值同步:`, syncResult);
      
      sendResponse({ success: true, syncResult });
    } catch (error: any) {
      console.error('执行数值同步错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
