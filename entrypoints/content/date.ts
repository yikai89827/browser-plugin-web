import { detectSortInfo } from './dom';
// 获取当前日期，格式为YYYY-MM-DD
export function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}


// 获取当前页面状态
export function getCurrentPageState() {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !window.location) {
    return {
      level: '',
      sortField: null,
      sortDirection: null
    };
  }
  
  // 从URL中获取当前tab名称
  const pathParts = window.location.href.split('/');
  const tab = pathParts[pathParts.length - 1];
  
  // 获取当前层级（竞选活动、广告组、广告）
  let level = '';
  if (tab.includes('campaigns')) {
    level = 'Campaigns';
  } else if (tab.includes('adsets')) {
    level = 'Adsets';
  } else if (tab.includes('ads')) {
    level = 'Ads';
  }
  
  // 获取当前排序状态
  const { field: sortField, direction: sortDirection } = detectSortInfo() || {};
  
  return {
    level,
    sortField,
    sortDirection
  };
}
