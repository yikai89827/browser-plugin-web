// @ts-nocheck
import { defineContentScript } from 'wxt/sandbox';
import { browserStorage } from '../../utils/storage';

// 广告数据类型
interface AdData {
  id: string;
  name: string;
  increase_impressions: number;
  increase_reach: number;
  increase_spend: number;
  increase_results: number;
  updated_at: string;
}

export default defineContentScript({
  matches: ['*://*.facebook.com/adsmanager/*'],
  main() {
    console.log('Content script loaded for Facebook Ads Manager');
    
    // 等待页面加载完成
    setTimeout(async () => {
      await syncAdDataToPage();
    }, 2000);
    
    // 监听页面变化
    const observer = new MutationObserver(async () => {
      await syncAdDataToPage();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
});

// 同步广告数据到页面
async function syncAdDataToPage() {
  try {
    // 获取存储的所有广告数据
    const storageItems = await browser.storage.local.get(null);
    const adDataList: AdData[] = [];
    
    // 筛选出广告数据
    for (const key in storageItems) {
      if (key.startsWith('ad_')) {
        adDataList.push(storageItems[key]);
      }
    }
    
    if (adDataList.length === 0) {
      console.log('No ad data found in storage');
      return;
    }
    
    console.log('Found ad data:', adDataList);
    
    // 查找页面上的广告列表
    const adRows = document.querySelectorAll('[data-testid^="ad-row-"]');
    console.log('Found ad rows:', adRows.length);
    
    adRows.forEach(row => {
      // 提取广告ID
      const adId = row.getAttribute('data-testid')?.replace('ad-row-', '');
      if (!adId) return;
      
      // 查找对应的广告数据
      const adData = adDataList.find(data => data.id === adId);
      if (!adData) return;
      
      console.log('Syncing data for ad:', adId);
      
      // 查找页面上的输入字段并更新
      
      // 覆盖人数增加
      const reachIncreaseField = row.querySelector('[data-testid="reach-increase"]');
      if (reachIncreaseField instanceof HTMLInputElement) {
        reachIncreaseField.value = adData.increase_reach.toString();
      }
      
      // 展示次数增加
      const impressionsIncreaseField = row.querySelector('[data-testid="impressions-increase"]');
      if (impressionsIncreaseField instanceof HTMLInputElement) {
        impressionsIncreaseField.value = adData.increase_impressions.toString();
      }
      
      // 花费金额增值
      const spendIncreaseField = row.querySelector('[data-testid="spend-increase"]');
      if (spendIncreaseField instanceof HTMLInputElement) {
        spendIncreaseField.value = adData.increase_spend.toString();
      }
      
      // 加成效
      const resultsIncreaseField = row.querySelector('[data-testid="results-increase"]');
      if (resultsIncreaseField instanceof HTMLInputElement) {
        resultsIncreaseField.value = adData.increase_results.toString();
      }
    });
  } catch (error) {
    console.error('Error syncing ad data:', error);
  }
}