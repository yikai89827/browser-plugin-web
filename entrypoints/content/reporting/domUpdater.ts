// 报告页面的DOM更新模块
// 负责处理DOM元素的更新和保持修改的值

import {
  getReportingTableDataRows,
  getReportingTableScrollParent,
  findInnermostElement,
  getColumnIndicesSync,
  extractRowData,
  processNames,
  generateAdId,
  getReportingTableFooter,
  extractDateFromPage,
  sortReportData,
  getSortConfig,
  getFieldValue,
  getRowType,
} from './dom';
import { getModifiedData } from './cache';

/** 虚拟行内容区高度，与 Meta 报表 DOM 一致；appendChild 改顺序后须重写 translate 才能与视觉一致 */
const REPORTING_VIRTUAL_ROW_HEIGHT_PX = 42;

/** 刷新后表格/虚拟行可能晚于脚本执行，有修改数据时在总时长内轮询等待 DOM 就绪 */
const REPORTING_TABLE_RETRY_MAX = 30;
const REPORTING_TABLE_RETRY_INTERVAL_MS = 100;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 切换排序后表头会重绘，getColumnIndicesSync 可能短暂为空；过早写单元格会全部跳过 */
async function waitForReportColumnMappingReady(): Promise<void> {
  const maxAttempts = 35;
  for (let i = 0; i < maxAttempts; i++) {
    const idx = getColumnIndicesSync();
    const keys = idx && typeof idx === 'object' ? Object.keys(idx) : [];
    if (keys.includes('impressions') || keys.length >= 5) {
      return;
    }
    await delayMs(80);
  }
  console.warn('报表列映射在等待后仍不完整，将继续尝试应用修改');
}

/** 插件重排/写单元格后，Facebook 会触发 data-surface/style 等 mutation，易被误判为「滚动停止」导致死循环；用时间窗 + 执行中标志在 content 侧忽略表格类 mutation（排序检测仍单独执行）。 */
let ignoreReportingObserverUntil = 0;
let updateDomElementsInFlight = false;
let extendObserverSuppressAfterThisRun = false;

function bumpIgnoreReportingObserver(ms: number): void {
  ignoreReportingObserverUntil = Math.max(ignoreReportingObserverUntil, Date.now() + ms);
}

export function shouldIgnoreReportingPageObserver(): boolean {
  return Date.now() < ignoreReportingObserverUntil || updateDomElementsInFlight;
}

/** 停滚后防抖：每次停滚从 DOM 重读行数据 + 缓存合成排序键，仅更新 translate（不 appendChild） */
let scrollStopUnifiedTimer: ReturnType<typeof setTimeout> | null = null;

export type UpdateDomElementsOptions = {
  /**
   * 为 true：只补丁合成数值与 footer，不做 appendChild 重排。
   * 为 false：appendChild + translate 按修改后指标完整重排（首屏、表头排序变更等）。
   */
  skipReorder?: boolean;
  /**
   * 与 skipReorder 同时为 true 时：停滚/滚动类更新在补丁后按当前 DOM 行 + 缓存再算顺序，只写子元素 translate，不 appendChild（适配虚拟列表）。
   * 仅应由滚动停稳路径或 content 的 isScrollRelated 传入。
   */
  scrollStopVisualReorder?: boolean;
};

let updateDomElementsQueue: Promise<void> = Promise.resolve();

// 更新DOM元素（并发调用会排成队列依次执行，避免排序监听与 MutationObserver 同时触发时后一次被直接丢弃）
export function updateDomElements(options?: UpdateDomElementsOptions): Promise<void> {
  const opts = options;
  updateDomElementsQueue = updateDomElementsQueue
    .then(() => runUpdateDomElementsOnce(opts))
    .catch((err) => {
      console.error('updateDomElements 执行失败:', err);
    });
  return updateDomElementsQueue;
}

async function runUpdateDomElementsOnce(options?: UpdateDomElementsOptions): Promise<void> {
  const skipReorder = options?.skipReorder === true;
  const scrollStopVisualReorder = options?.scrollStopVisualReorder === true;
  updateDomElementsInFlight = true;
  try {
  // 获取当前排序配置
  const sortConfig = getSortConfig();
  console.log('更新DOM元素，当前排序配置:', sortConfig);
  
  // 从页面提取日期范围
  const dateRange: string[] = extractDateFromPage();
  console.log('更新DOM元素，页面日期范围:', dateRange);
  
  // 获取修改的数据（按页面日期范围）
  let modifiedData: any = {};
  if (dateRange.length >= 2) {
    const startDate = dateRange[0];
    const endDate = dateRange[1];
    
    if (startDate && endDate && startDate === endDate) {
      // 单个日期
      modifiedData = await getModifiedData(startDate) || {};
      console.log('单个日期查询，修改的数据:', modifiedData);
    } else if (startDate && endDate) {
      // 日期范围，累加范围内所有日期的修改数据
      modifiedData = await getModifiedData(startDate, endDate) || {};
      console.log('日期范围查询，累加后的修改数据:', modifiedData);
    }
  }
  console.log('更新DOM元素，修改的数据:', modifiedData);
  if (Object.keys(modifiedData).length === 0) {
    console.log('没有修改数据，无需更新DOM元素');
    return;
  }

  let tableContainer: Element | null = null;
  let dataRows: HTMLElement[] = [];

  for (let attempt = 0; attempt < REPORTING_TABLE_RETRY_MAX; attempt++) {
    tableContainer = document.querySelector('[role="table"]');
    dataRows = tableContainer ? getReportingTableDataRows() : [];
    if (tableContainer && dataRows.length > 0) {
      if (attempt > 0) {
        console.log(`报表表格就绪，第 ${attempt + 1} 次检测`);
      }
      break;
    }
    if (attempt === 0) {
      console.log('报表表格或数据行尚未就绪，等待重试…');
    }
    if (attempt < REPORTING_TABLE_RETRY_MAX - 1) {
      await delayMs(REPORTING_TABLE_RETRY_INTERVAL_MS);
    }
  }

  if (!tableContainer || dataRows.length === 0) {
    console.warn(
      `报表表格在等待约 ${(REPORTING_TABLE_RETRY_MAX - 1) * REPORTING_TABLE_RETRY_INTERVAL_MS}ms 后仍无数据行，跳过本次 DOM 更新`,
    );
    return;
  }

  await waitForReportColumnMappingReady();

  extendObserverSuppressAfterThisRun = true;

  console.log('找到的数据行数:', dataRows.length);
  
  // 构建ID到行的映射
  let idToRowMap: Record<string, HTMLElement> = {};
  let allRowData: any[] = [];
  
  const columnIndicesSnapshot = getColumnIndicesSync();

  // 第一次遍历，构建映射和收集所有行数据（挂上对应 DOM 行；allRowData 仅为有 id 的行，不能与 dataRows 按下标对齐）
  dataRows.forEach((row) => {
    const rowData = extractRowData(row, columnIndicesSnapshot);
    if (rowData && rowData.id) {
      rowData._reportingRowEl = row;
      idToRowMap[rowData.id] = row;
      allRowData.push(rowData);
    }
  });
  
  // 处理名称赋值，确保所有行都有完整的账户、系列、组和广告名称
  allRowData = processNames(allRowData);
  
  // 重新构建ID到行的映射，使用处理后的名称数据
  const updatedIdToRowMap: Record<string, HTMLElement> = {};
  allRowData.forEach((rowData) => {
    if (rowData && rowData.id) {
      // 不要重新生成ID，使用第一次提取时生成的ID
      // 这样可以确保与modifiedData中的ID匹配
      updatedIdToRowMap[rowData.id] = idToRowMap[rowData.id] || rowData._reportingRowEl;
    }
  });
  idToRowMap = updatedIdToRowMap;
  
  // 计算合计行的增加值
  const summaryValues = calculateSummaryValues(allRowData, modifiedData);
  
  // 第二次遍历，只更新修改过的行和相关的合计行（按 allRowData + 对应 DOM 行，避免与 dataRows 下标错位）
  allRowData.forEach((rowData) => {
    const row = rowData._reportingRowEl as HTMLElement | undefined;
    if (!rowData?.id || !row) return;

    let matchedModification = null;

    if (modifiedData[rowData.id]) {
      matchedModification = modifiedData[rowData.id];
    }

    if (!matchedModification && rowData.ad_id && modifiedData[rowData.ad_id]) {
      matchedModification = modifiedData[rowData.ad_id];
    }

    if (!matchedModification && summaryValues[rowData.id]) {
      matchedModification = summaryValues[rowData.id];
    }

    if (!matchedModification && rowData.accountName && !rowData.ad_id && !rowData.adset_id && !rowData.campaign_id) {
      matchedModification = summaryValues[rowData.accountName];
    }

    if (matchedModification) {
      updateAdRow(row, matchedModification, rowData);
    }
  });
  // 完整重排：appendChild + translate，并重置「已见 id 排序键」缓存；停滚：扁平按合成指标 + 连续 translate（虚拟列表不全量层级）
  if (!skipReorder) {
    resetReportingSeenSortMergeCache();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    reorderDomRowsBySortValue(allRowData, modifiedData, summaryValues, { translateOnly: false });
    mergeReportingSeenSortFromRows(allRowData, sortConfig.field, modifiedData, summaryValues);
  } else if (scrollStopVisualReorder) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    applyScrollStopHierarchyTranslateContiguous(allRowData, modifiedData, summaryValues);
  }
  // 更新表格底部合计行
  updateFooterRows(modifiedData, summaryValues);
  } finally {
    updateDomElementsInFlight = false;
    if (extendObserverSuppressAfterThisRun) {
      extendObserverSuppressAfterThisRun = false;
      bumpIgnoreReportingObserver(900);
    }
  }
}

// 计算合计行的增加值
function calculateSummaryValues(allRowData: any[], modifiedData: any): Record<string, any> {
  const summaryValues: Record<string, any> = {};
  
  // 按账户分组
  const accountGroups: Record<string, any[]> = {};
  
  allRowData.forEach(rowData => {
    // 只处理广告统计行（有 ad_id 的）
    if (rowData.ad_id && rowData.ad_id.trim() !== '') {
      // 简化匹配逻辑：使用DOM解析出的ID与缓存中的ID匹配
      let matchedModification = null;
      
      // 1. 优先使用rowData.id匹配（DOM解析出的ID）
      if (modifiedData[rowData.id]) {
        matchedModification = modifiedData[rowData.id];
      }
      
      // 2. 如果没有匹配，使用ad_id匹配
      if (!matchedModification && rowData.ad_id && modifiedData[rowData.ad_id]) {
        matchedModification = modifiedData[rowData.ad_id];
      }
      
      if (matchedModification) {
        const accountKey = rowData.accountName;
        if (!accountGroups[accountKey]) {
          accountGroups[accountKey] = [];
        }
        accountGroups[accountKey].push({ ...rowData, modification: matchedModification });
      }
    }
  });
  
  // 计算每个账户的合计
  Object.keys(accountGroups).forEach(accountName => {
    const accountAds = accountGroups[accountName];
    const accountSummary = allRowData.find(rowData => 
      rowData.accountName === accountName && 
      !rowData.ad_id && 
      !rowData.adset_id && 
      !rowData.campaign_id
    );
    
    // 计算账户合计的增加值
    const accountModifications = calculateGroupModifications(accountAds, modifiedData);
    if (Object.keys(accountModifications).length > 0) {
      // 使用账户名称作为键，确保账户合计行能匹配
      summaryValues[accountName] = accountModifications;
      // 同时使用账户合计行的ID作为键
      if (accountSummary && accountSummary.id) {
        summaryValues[accountSummary.id] = accountModifications;
      }
    }
    
    // 按广告系列分组（使用 campaign_id）
    const campaignGroups: Record<string, any[]> = {};
    accountAds.forEach(rowData => {
      const campaign_id = rowData.campaign_id;
      if (campaign_id) {
        if (!campaignGroups[campaign_id]) {
          campaignGroups[campaign_id] = [];
        }
        campaignGroups[campaign_id].push(rowData);
      }
    });
    
    // 计算每个广告系列的合计
    Object.keys(campaignGroups).forEach(campaign_id => {
      const campaignAds = campaignGroups[campaign_id];
      const campaignSummary = allRowData.find(rowData => 
        rowData.campaign_id === campaign_id && 
        !rowData.ad_id && 
        !rowData.adset_id
      );
      
      const campaignModifications = calculateGroupModifications(campaignAds, modifiedData);
      if (Object.keys(campaignModifications).length > 0 && campaignSummary && campaignSummary.id) {
        summaryValues[campaignSummary.id] = campaignModifications;
      }
      
      // 按广告组分组（使用 adset_id）- 移到广告系列循环内部
      const adsetGroups: Record<string, any[]> = {};
      campaignAds.forEach(rowData => {
        const adset_id = rowData.adset_id;
        if (adset_id) {
          if (!adsetGroups[adset_id]) {
            adsetGroups[adset_id] = [];
          }
          adsetGroups[adset_id].push(rowData);
        }
      });
      
      // 计算每个广告组的合计 - 移到广告系列循环内部
      Object.keys(adsetGroups).forEach(adset_id => {
        const adsetAds = adsetGroups[adset_id];
        const adsetSummary = allRowData.find(rowData => 
          rowData.adset_id === adset_id && 
          !rowData.ad_id
        );
        
        const adsetModifications = calculateGroupModifications(adsetAds, modifiedData);
        if (Object.keys(adsetModifications).length > 0 && adsetSummary && adsetSummary.id) {
          summaryValues[adsetSummary.id] = adsetModifications;
        }
      });
    });
  });
  
  return summaryValues;
}

// 计算一组广告的合计修改值
function calculateGroupModifications(ads: any[], modifiedData: any): any {
  const modifications: any = {};
  
  ads.forEach(ad => {
    if (ad.modification) {
      // 使用已匹配的修改数据
      const adModifications = ad.modification;
      Object.entries(adModifications).forEach(([field, value]) => {
        if (!modifications[field]) {
          modifications[field] = 0;
        }
        modifications[field] += Number(value);
      });
    } else if (ad.id && modifiedData[ad.id]) {
      // 回退到直接匹配
      const adModifications = modifiedData[ad.id];
      Object.entries(adModifications).forEach(([field, value]) => {
        if (!modifications[field]) {
          modifications[field] = 0;
        }
        modifications[field] += Number(value);
      });
    }
  });
  
  return modifications;
}

// 识别行类型
export function identifyRowType(rowData: any): string {
  // 根据ID字段判断行类型
  if (rowData.ad_id && rowData.ad_id.trim() !== '') {
    return 'ad';
  }
  
  if (rowData.adset_id && rowData.adset_id.trim() !== '') {
    return 'adset';
  }
  
  if (rowData.campaign_id && rowData.campaign_id.trim() !== '') {
    return 'campaign';
  }
  
  return 'account';
}

// 更新广告行（baseRowData 为 extractRowData 结果时，数值列以行数据为基数，避免虚拟列表复用 DOM 时误读 data-increase）
export function updateAdRow(row: Element, modifications: any, baseRowData?: any) {
  const cells = row.querySelector('[role="presentation"]')?.children[0];
  if (!cells?.childNodes?.length) {
    return;
  }
  
  const scrollableColumn = cells.children[1];
  const scrollableColumnCellsArray = Array.from(scrollableColumn.children[0].children);
  
  applyModificationsToCells(scrollableColumnCellsArray, modifications, baseRowData);
}

// 应用修改到单元格数组
function applyModificationsToCells(cellsArray: Element[], modifications: any, baseRowData?: any) {
  const columnIndices = getColumnIndicesSync();
  // ID字段列表，这些字段不应该被当成数值处理
  const idFields = ['account_id', 'campaign_id', 'adset_id', 'ad_id'];

  Object.entries(modifications).forEach(([field, value]) => {
    // 跳过ID字段，这些字段不需要处理
    if (idFields.includes(field)) {
      return;
    }
    
    const columnIndex = columnIndices[field] ?? -1;
    
    if (columnIndex >= 0 && cellsArray[columnIndex]) {
      const cell = cellsArray[columnIndex];
      const innermostElement = findInnermostElement(cell);

      let originalText = innermostElement.textContent?.trim() || '';
      originalText = originalText.replace(/\[\d+\]$/, '');

      let originalValue: number;
      const baseCandidate =
        baseRowData &&
        baseRowData[field] !== undefined &&
        baseRowData[field] !== null &&
        baseRowData[field] !== ''
          ? Number(baseRowData[field])
          : NaN;
      if (Number.isFinite(baseCandidate)) {
        originalValue = baseCandidate;
      } else {
        const existingIncrease = innermostElement.getAttribute('data-increase');
        originalValue = parseNumber(originalText);
        if (existingIncrease) {
          const existingIncreaseValue = Number(existingIncrease);
          originalValue = originalValue - existingIncreaseValue;
        }
      }

      const newValue = originalValue + Number(value);
      
      let formattedValue = String(newValue);
      if (originalText.includes('$')) {
        formattedValue = '$' + parseFloat(newValue.toString()).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      } else if (!isNaN(newValue) && Number.isInteger(newValue)) {
        formattedValue = newValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      
      innermostElement.textContent = formattedValue;
      
      if (Number(value) !== 0) {
        innermostElement.setAttribute('data-increase', String(value));
      } else {
        innermostElement.removeAttribute('data-increase');
      }
    }
  });
}

// 解析数字
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// 更新表格底部合计行
function updateFooterRows(modifiedData: any, summaryValues: Record<string, any>) {
  // 获取表格底部行
  const footerRows = getReportingTableFooter();
  console.log('表格底部行:', footerRows);
  console.log('%c数据修改缓存:', 'color: green;background-color: #e6f7ff;', modifiedData);
  console.log('%c账户合计值:', 'color: green;background-color: #e6f7ff;', summaryValues );
  if (footerRows.length === 0) {
    return;
  }
  
  // 计算所有账户合计增加值的总和
  const totalModifications = calculateTotalModifications(modifiedData);
  console.log('%c底部合计行修改值:', 'color: green;background-color: #e6f7ff;', totalModifications);
  
  const footerCellsArray = Array.from(footerRows);
  applyModificationsToCells(footerCellsArray, totalModifications);
}

// 计算所有账户合计增加值的总和
function calculateTotalModifications(modifiedData: any): any {
  const total: any = {
    impressions: 0,
    reach: 0,
    spend: 0,
    clicks: 0,
    registrations: 0,
    purchases: 0
  };
  
  // 遍历所有修改的数据，只计算广告行的修改，不包括合计行
  // 广告行的ID格式为 `${account_id}_${campaign_id}_${adset_id}_${ad_id}`，包含多个下划线
  // 合计行的ID通常只是单个ID（account_id/campaign_id/adset_id），不包含下划线或只有一个下划线
  Object.entries(modifiedData).forEach(([adId, modifications]) => {
    // 只有广告行的ID包含多个下划线（格式为 account_campaign_adset_ad）
    // 合计行的ID是单个值，不包含下划线或下划线数量少于3个
    const underscoreCount = (adId.match(/_/g) || []).length;
    if (underscoreCount >= 3) {
      // 这是广告统计行，累加其增加值
      Object.entries(modifications as Record<string, unknown>).forEach(([field, value]) => {
        if (total[field] !== undefined) {
          total[field] += Number(value) || 0;
        }
      });
    }
    // 合计行的修改值不应该被计入底部总计
  });
  
  return total;
}

const SCROLL_STOP_DEBOUNCE_MS = 550;

function isReportingInnerScrollTarget(el: HTMLElement, table: HTMLElement): boolean {
  if (!table.contains(el)) return false;
  const st = window.getComputedStyle(el);
  const oy = st.overflowY;
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 4;
}

// 监听表格滚动（真实滚动多在 table 内部 div；用 capture 才能拿到 e.target.scrollTop）
export function setupScrollListener() {
  const table = document.querySelector('[role="table"]') as HTMLElement | null;
  if (!table) {
    return;
  }

  const onScrollCapture = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (!el || !table.contains(el)) {
      return;
    }
    // 侧栏透视表等滚动：e.target 不包含报表数据行，忽略（否则会误判 scrollTop、从不触发主表回顶重排）
    const anchor = getReportingTableDataRows()[0] as HTMLElement | undefined;
    if (!anchor || !el.contains(anchor)) {
      return;
    }
    if (!isReportingInnerScrollTarget(el, table)) {
      return;
    }

    if (scrollStopUnifiedTimer !== null) {
      clearTimeout(scrollStopUnifiedTimer);
    }
    scrollStopUnifiedTimer = setTimeout(() => {
      scrollStopUnifiedTimer = null;
      void updateDomElements({ skipReorder: true, scrollStopVisualReorder: true });
    }, SCROLL_STOP_DEBOUNCE_MS);
  };

  document.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
}

// 监听排序变动
export function setupSortListener() {
  const tableHeaders = document.querySelectorAll('[role="columnheader"]');
  console.log('找到的表头数量:', tableHeaders.length);
  
  tableHeaders.forEach((header, index) => {
    const headerText = header.textContent?.trim() || '未知';
    console.log(`表头 ${index}: ${headerText}`);
    
    header.addEventListener('click', async (event) => {
      console.log('表头被点击:', headerText);
      console.log('点击事件目标:', event.target);
      
      // 获取点击前的排序配置
      const beforeSortConfig = getSortConfig();
      console.log('点击前排序配置:', beforeSortConfig);
      
      // 延迟执行，等待 URL 与表头列映射稳定（过短会导致列索引未就绪、合成值整表未写入）
      setTimeout(async () => {
        // 获取点击后的排序配置
        const afterSortConfig = getSortConfig();
        console.log('点击后排序配置:', afterSortConfig);
        
        if (beforeSortConfig.field !== afterSortConfig.field || beforeSortConfig.direction !== afterSortConfig.direction) {
          console.log('排序发生变化，触发DOM更新');
          await updateDomElements({ skipReorder: false });
        } else {
          console.log('排序未发生变化，跳过DOM更新');
        }
      }, 520);
    });
  });
}

type ReportingRowEntry = { rowData: any; rowElement: HTMLElement };

type AdsetBlock = { summary?: ReportingRowEntry; ads: ReportingRowEntry[] };
type CampaignBlock = { summary?: ReportingRowEntry; adsets: AdsetBlock[] };
type AccountBlock = { summary?: ReportingRowEntry; campaigns: CampaignBlock[] };

/** 当前排序列上「展示值」用于比较：底层行数据 + 缓存增加值（与 updateDomElements 写入逻辑一致） */
function effectiveSortValue(
  rowData: any,
  sortField: string,
  modifiedData: any,
  summaryValues: Record<string, any>,
): number {
  let v = getFieldValue(rowData, sortField);

  if (rowData.ad_id && String(rowData.ad_id).trim() !== '') {
    const m = modifiedData[rowData.id] || modifiedData[rowData.ad_id];
    if (m && m[sortField] != null) v += Number(m[sortField]);
    return v;
  }

  const sum =
    summaryValues[rowData.id] ||
    (rowData.accountName &&
      !rowData.ad_id &&
      !rowData.adset_id &&
      !rowData.campaign_id &&
      summaryValues[rowData.accountName]);
  if (sum && sum[sortField] != null) v += Number(sum[sortField]);
  return v;
}

/** 与 effectiveSortValue 中「缓存/合计」部分一致：当前排序列上的增加值（不含 DOM 基数） */
function getSortFieldCacheDelta(
  rowData: any,
  sortField: string,
  modifiedData: any,
  summaryValues: Record<string, any>,
): number {
  if (rowData.ad_id && String(rowData.ad_id).trim() !== '') {
    const m = modifiedData[rowData.id] || modifiedData[rowData.ad_id];
    if (m && m[sortField] != null) return Number(m[sortField]) || 0;
    return 0;
  }
  const sum =
    summaryValues[rowData.id] ||
    (rowData.accountName &&
      !rowData.ad_id &&
      !rowData.adset_id &&
      !rowData.campaign_id &&
      summaryValues[rowData.accountName]);
  if (sum && sum[sortField] != null) return Number(sum[sortField]) || 0;
  return 0;
}

/** 当前挂载行里是否至少有一行在排序列上有非零缓存增量（否则与 FB 排序一致，无需插件重排） */
function anyVisibleRowHasSortFieldCacheDelta(
  allRowData: any[],
  sortField: string,
  modifiedData: any,
  summaryValues: Record<string, any>,
): boolean {
  for (const rowData of allRowData) {
    if (!rowData?.id) continue;
    if (Math.abs(getSortFieldCacheDelta(rowData, sortField, modifiedData, summaryValues)) > 1e-9) {
      return true;
    }
  }
  return false;
}

function maxAdSortValue(
  ads: ReportingRowEntry[],
  sortField: string,
  modifiedData: any,
  summaryValues: Record<string, any>,
): number {
  if (!ads.length) return 0;
  const vals = ads.map((e) => effectiveSortValue(e.rowData, sortField, modifiedData, summaryValues));
  return Math.max(...vals);
}

function compareBlockValue(
  va: number,
  vb: number,
  tieA: string,
  tieB: string,
  desc: boolean,
): number {
  if (va !== vb) return desc ? vb - va : va - vb;
  return tieA.localeCompare(tieB);
}

/** 停滚多次后合并的「已见行」排序键：id → 当前排序列原始值 + 合成值；换排序列/方向时清空 */
const reportingSeenSortById = new Map<string, { baseValue: number; effectiveValue: number }>();
let reportingSeenSortSignature = '';

function currentSortSignature(): string {
  const c = getSortConfig();
  return `${c.field}\0${c.direction}`;
}

function resetReportingSeenSortMergeCache(): void {
  reportingSeenSortById.clear();
  reportingSeenSortSignature = currentSortSignature();
}

function ensureReportingSeenSortSignature(): void {
  const sig = currentSortSignature();
  if (sig !== reportingSeenSortSignature) {
    reportingSeenSortById.clear();
    reportingSeenSortSignature = sig;
  }
}

/** 把本次 DOM 中的行并入累积表（与首屏缓存合成更大的 id→键 集合，慢滚到底可逼近全表已见集合） */
function mergeReportingSeenSortFromRows(
  allRowData: any[],
  sortField: string,
  modifiedData: any,
  summaryValues: Record<string, any>,
): void {
  ensureReportingSeenSortSignature();
  for (const rowData of allRowData) {
    if (!rowData?.id) continue;
    const id = String(rowData.id);
    const baseValue = getFieldValue(rowData, sortField);
    const effectiveValue = effectiveSortValue(rowData, sortField, modifiedData, summaryValues);
    reportingSeenSortById.set(id, { baseValue, effectiveValue });
  }
}

/** 当前累积的、按合成值排好序的已见 id（滚停多次后变长；换排序列/方向会清空重攒） */
export function getReportingSeenSortMergedIds(): string[] {
  ensureReportingSeenSortSignature();
  const desc = getSortConfig().direction === 'desc';
  const entries = Array.from(reportingSeenSortById.entries());
  entries.sort((a, b) => {
    const va = a[1].effectiveValue;
    const vb = b[1].effectiveValue;
    if (va !== vb) return desc ? vb - va : va - vb;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([id]) => id);
}

/** 将扁平行序解析为 账户 → 系列 → 组 → 广告 四层树（与报表 UI 展开顺序一致） */
function buildReportingHierarchy(allRowData: any[]): AccountBlock[] {
  const accounts: AccountBlock[] = [];
  let curAccount: AccountBlock | null = null;
  let curCampaign: CampaignBlock | null = null;
  let curAdset: AdsetBlock | null = null;

  const ensureAccount = () => {
    if (!curAccount) {
      curAccount = { campaigns: [] };
      accounts.push(curAccount);
    }
    return curAccount;
  };
  const ensureCampaign = () => {
    const acc = ensureAccount();
    if (!curCampaign) {
      curCampaign = { adsets: [] };
      acc.campaigns.push(curCampaign);
    }
    return curCampaign;
  };
  const ensureAdset = () => {
    const camp = ensureCampaign();
    if (!curAdset) {
      curAdset = { ads: [] };
      camp.adsets.push(curAdset);
    }
    return curAdset;
  };

  for (let i = 0; i < allRowData.length; i++) {
    const rowData = allRowData[i];
    const rowElement = rowData?._reportingRowEl as HTMLElement | undefined;
    if (!rowData || !rowElement) continue;

    const entry: ReportingRowEntry = { rowData, rowElement };
    const type = getRowType(rowData);

    if (type === 'account') {
      curAccount = { summary: entry, campaigns: [] };
      accounts.push(curAccount);
      curCampaign = null;
      curAdset = null;
    } else if (type === 'campaign') {
      const acc = ensureAccount();
      curAccount = acc;
      curCampaign = { summary: entry, adsets: [] };
      acc.campaigns.push(curCampaign);
      curAdset = null;
    } else if (type === 'adset') {
      const camp = ensureCampaign();
      curCampaign = camp;
      curAdset = { summary: entry, ads: [] };
      camp.adsets.push(curAdset);
    } else if (type === 'ad') {
      const adset = ensureAdset();
      curAdset = adset;
      adset.ads.push(entry);
    }
  }

  return accounts;
}

function flattenReportingHierarchy(accounts: AccountBlock[]): ReportingRowEntry[] {
  const out: ReportingRowEntry[] = [];
  for (const acc of accounts) {
    if (acc.summary) out.push(acc.summary);
    for (const camp of acc.campaigns) {
      if (camp.summary) out.push(camp.summary);
      for (const adset of camp.adsets) {
        if (adset.summary) out.push(adset.summary);
        out.push(...adset.ads);
      }
    }
  }
  return out;
}

/** 四层树内按合成指标排序（与 appendChild 重排前一致） */
function sortReportingAccountsHierarchy(
  accounts: AccountBlock[],
  sortField: string,
  desc: boolean,
  modifiedData: any,
  summaryValues: Record<string, any>,
): void {
  for (const acc of accounts) {
    for (const camp of acc.campaigns) {
      for (const adset of camp.adsets) {
        adset.ads.sort((a, b) => {
          const va = effectiveSortValue(a.rowData, sortField, modifiedData, summaryValues);
          const vb = effectiveSortValue(b.rowData, sortField, modifiedData, summaryValues);
          return compareBlockValue(va, vb, a.rowData.ad_id || '', b.rowData.ad_id || '', desc);
        });
      }

      camp.adsets.sort((a, b) => {
        const va = a.summary
          ? effectiveSortValue(a.summary.rowData, sortField, modifiedData, summaryValues)
          : maxAdSortValue(a.ads, sortField, modifiedData, summaryValues);
        const vb = b.summary
          ? effectiveSortValue(b.summary.rowData, sortField, modifiedData, summaryValues)
          : maxAdSortValue(b.ads, sortField, modifiedData, summaryValues);
        const tieA = a.summary?.rowData.adset_id || a.ads[0]?.rowData.adset_id || '';
        const tieB = b.summary?.rowData.adset_id || b.ads[0]?.rowData.adset_id || '';
        return compareBlockValue(va, vb, tieA, tieB, desc);
      });
    }

    acc.campaigns.sort((a, b) => {
      const va = a.summary
        ? effectiveSortValue(a.summary.rowData, sortField, modifiedData, summaryValues)
        : Math.max(
            ...a.adsets.map((as) =>
              as.summary
                ? effectiveSortValue(as.summary.rowData, sortField, modifiedData, summaryValues)
                : maxAdSortValue(as.ads, sortField, modifiedData, summaryValues),
            ),
            0,
          );
      const vb = b.summary
        ? effectiveSortValue(b.summary.rowData, sortField, modifiedData, summaryValues)
        : Math.max(
            ...b.adsets.map((as) =>
              as.summary
                ? effectiveSortValue(as.summary.rowData, sortField, modifiedData, summaryValues)
                : maxAdSortValue(as.ads, sortField, modifiedData, summaryValues),
            ),
            0,
          );
      const tieA = a.summary?.rowData.campaign_id || a.adsets[0]?.summary?.rowData.campaign_id || '';
      const tieB = b.summary?.rowData.campaign_id || b.adsets[0]?.summary?.rowData.campaign_id || '';
      return compareBlockValue(va, vb, tieA, tieB, desc);
    });
  }

  accounts.sort((a, b) => {
    const va = a.summary
      ? effectiveSortValue(a.summary.rowData, sortField, modifiedData, summaryValues)
      : Math.max(
          ...a.campaigns.map((c) =>
            c.summary
              ? effectiveSortValue(c.summary.rowData, sortField, modifiedData, summaryValues)
              : Math.max(
                  ...c.adsets.map((as) =>
                    as.summary
                      ? effectiveSortValue(as.summary.rowData, sortField, modifiedData, summaryValues)
                      : maxAdSortValue(as.ads, sortField, modifiedData, summaryValues),
                  ),
                  0,
                ),
          ),
          0,
        );
    const vb = b.summary
      ? effectiveSortValue(b.summary.rowData, sortField, modifiedData, summaryValues)
      : Math.max(
          ...b.campaigns.map((c) =>
            c.summary
              ? effectiveSortValue(c.summary.rowData, sortField, modifiedData, summaryValues)
              : Math.max(
                  ...c.adsets.map((as) =>
                    as.summary
                      ? effectiveSortValue(as.summary.rowData, sortField, modifiedData, summaryValues)
                      : maxAdSortValue(as.ads, sortField, modifiedData, summaryValues),
                  ),
                  0,
                ),
          ),
          0,
        );
    const tieA = a.summary?.rowData.account_id || a.campaigns[0]?.summary?.rowData.account_id || '';
    const tieB = b.summary?.rowData.account_id || b.campaigns[0]?.summary?.rowData.account_id || '';
    return compareBlockValue(va, vb, tieA, tieB, desc);
  });
}

function readTranslateYPx(row: HTMLElement): number | null {
  const inner = row.firstElementChild as HTMLElement | null;
  if (!inner) return null;
  const inline = inner.style.transform?.trim();
  const t =
    inline && inline !== 'none'
      ? inner.style.transform
      : window.getComputedStyle(inner).transform;
  if (!t || t === 'none') return null;
  const matrix = t.match(/^matrix\(([-0-9eE.]+(?:,\s*[-0-9eE.]+){5})\)$/);
  if (matrix) {
    const vals = matrix[1].split(/\s*,\s*/).map(Number);
    if (vals.length >= 6 && Number.isFinite(vals[5])) return vals[5];
  }
  const matrix3d = t.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3d) {
    const vals = matrix3d[1].split(/\s*,\s*/).map(Number);
    if (vals.length >= 14 && Number.isFinite(vals[13])) return vals[13];
  }
  const tr = t.match(/translate\(\s*[^,]+\s*,\s*([-0-9.]+)\s*(?:px)?\s*\)/);
  if (tr) return parseFloat(tr[1]);
  const tr3d = t.match(/translate3d\(\s*[^,]+,\s*([-0-9.]+)\s*(?:px)?\s*,/);
  if (tr3d) return parseFloat(tr3d[1]);
  const trY = t.match(/translateY\(\s*([-0-9.]+)\s*(?:px)?\s*\)/);
  if (trY) return parseFloat(trY[1]);
  return null;
}

/**
 * 停滚：仅改 translate；视口内连续 Y（anchor + i×行高）。
 * 虚拟列表只有局部行时四层树不完整，层级排序会把展示次数等指标排错（滚回错位）；此处按当前挂载行**扁平**按合成指标排序，改动面最小。
 */
function applyScrollStopHierarchyTranslateContiguous(
  allRowData: any[],
  modifiedData: any,
  summaryValues: Record<string, any>,
): void {
  const sortConfig = getSortConfig();
  const sortField = sortConfig.field;
  const desc = sortConfig.direction === 'desc';
  if (!anyVisibleRowHasSortFieldCacheDelta(allRowData, sortField, modifiedData, summaryValues)) {
    return;
  }
  mergeReportingSeenSortFromRows(allRowData, sortField, modifiedData, summaryValues);

  const rows = allRowData.filter((r) => r?.id && r._reportingRowEl);
  if (rows.length === 0) return;
  const sorted = [...rows].sort((a, b) => {
    const va = effectiveSortValue(a, sortField, modifiedData, summaryValues);
    const vb = effectiveSortValue(b, sortField, modifiedData, summaryValues);
    return compareBlockValue(va, vb, String(a.id), String(b.id), desc);
  });

  const H = REPORTING_VIRTUAL_ROW_HEIGHT_PX;
  const rawYs = sorted
    .map((rowData) => readTranslateYPx(rowData._reportingRowEl as HTMLElement))
    .filter((y): y is number => y != null && Number.isFinite(y));
  if (rawYs.length === 0) {
    console.warn('停滚重排：无法从 DOM 读取 translateY，跳过写 transform');
    return;
  }
  const minY = Math.min(...rawYs);
  const anchorY = Math.floor(minY / H) * H;

  sorted.forEach((rowData, i) => {
    const row = rowData._reportingRowEl as HTMLElement;
    const inner = row.firstElementChild as HTMLElement | null;
    if (!inner) return;
    inner.style.transform = `translate(0px, ${anchorY + i * H}px)`;
  });
}

// 按「修改后的指标」对四层块排序：整块账户（账户合计+其下全部）相对其它账户移动；组内同理。
// translateOnly：仅保留接口；停滚路径已改用 applyScrollStopHierarchyTranslateContiguous。
function reorderDomRowsBySortValue(
  allRowData: any[],
  modifiedData: any,
  summaryValues: Record<string, any>,
  opts?: { translateOnly?: boolean },
) {
  const translateOnly = opts?.translateOnly === true;
  const sortConfig = getSortConfig();
  const sortField = sortConfig.field;
  const sortDirection = sortConfig.direction;
  const desc = sortDirection === 'desc';

  const accounts = buildReportingHierarchy(allRowData);
  sortReportingAccountsHierarchy(accounts, sortField, desc, modifiedData, summaryValues);

  const ordered = flattenReportingHierarchy(accounts);

  const tableBody = ordered[0]?.rowElement?.parentElement;
  if (!tableBody) return;

  if (!translateOnly) {
    for (const item of ordered) {
      const el = item.rowElement as HTMLElement | undefined;
      if (el?.parentNode === tableBody) {
        tableBody.appendChild(el);
      }
    }
  }

  ordered.forEach((item, index) => {
    const row = item.rowElement as HTMLElement | undefined;
    if (!row) return;
    const inner = row.firstElementChild as HTMLElement | null;
    if (!inner) return;
    inner.style.transform = `translate(0px, ${index * REPORTING_VIRTUAL_ROW_HEIGHT_PX}px)`;
  });
}
