import { browserStorage } from '../../utils/storage';

// 存储账户ID
let accountId: string = '';

// 从URL中提取act参数的值
export function getAccountId() {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }
  
  const url = window.location.href;
  const match = url.match(/act=(\d+)/);
  return match ? match[1] : '';
}

// 保存账户ID到浏览器存储
export async function saveAccountId() {
  const id = getAccountId();
  if (id) {
    accountId = id;
    await browserStorage.set('facebookAdAccountId', id);
    console.log('账户ID已保存:', id);
  } else {
    // 尝试从存储中获取
    const savedId = await browserStorage.get('facebookAdAccountId');
    if (savedId) {
      accountId = savedId;
      console.log('从存储中获取账户ID:', savedId);
    }
  }
}

// 获取保存的账户ID
export async function getSavedAccountId() {
  // 如果内存中有账户ID，直接返回
  if (accountId) {
    return accountId;
  }
  
  // 从缓存中读取
  try {
    const savedId = await browserStorage.get('facebookAdAccountId');
    if (savedId) {
      accountId = savedId;
      console.log('从缓存中获取账户ID:', savedId);
    }
  } catch (error) {
    console.error('从缓存读取账户ID失败:', error);
  }
  
  return accountId;
}
