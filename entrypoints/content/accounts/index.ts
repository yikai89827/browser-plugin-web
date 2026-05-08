import { browser } from 'wxt/browser';

export interface FacebookAccount {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  status: string;
  spend: number;
  balance: number;
  createdAt: number;
}

export async function fetchAccounts(): Promise<FacebookAccount[]> {
  const accounts: FacebookAccount[] = [];
  
  try {
    const url = window.location.href;
    
    if (url.includes('/adsmanager/manage/')) {
      console.log('Fetching accounts from Ads Manager');
      
      // 方法1: 尝试从DOM中提取账户信息
      const accountRows = document.querySelectorAll('[data-testid*="account-row"], [role="row"]');
      
      accountRows.forEach((row, index) => {
        try {
          const nameEl = row.querySelector('[data-testid*="account-name"], [data-visualcompletion="ignore-dynamic"]');
          const idEl = row.querySelector('[data-testid*="account-id"]');
          const statusEl = row.querySelector('[data-testid*="account-status"]');
          const spendEl = row.querySelector('[data-testid*="spend"], [data-testid*="amount"]');
          
          if (nameEl) {
            const account: FacebookAccount = {
              id: `fb_acc_${Date.now()}_${index}`,
              name: nameEl.textContent?.trim() || `Account ${index + 1}`,
              accountId: idEl?.textContent?.trim() || '',
              currency: 'USD',
              status: statusEl?.textContent?.trim() || 'Active',
              spend: parseSpend(spendEl?.textContent),
              balance: 0,
              createdAt: Date.now()
            };
            
            accounts.push(account);
          }
        } catch (err) {
          console.error('Error parsing account row:', err);
        }
      });
      
      // 方法2: 尝试从页面数据中提取
      if (accounts.length === 0) {
        const pageData = extractPageData();
        if (pageData?.accounts) {
          accounts.push(...pageData.accounts);
        }
      }
      
      console.log(`Found ${accounts.length} accounts`);
    }
    
    // 保存到本地存储
    await saveAccounts(accounts);
    
    return accounts;
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
}

function parseSpend(spendText?: string | null): number {
  if (!spendText) return 0;
  
  const cleaned = spendText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

function extractPageData() {
  try {
    const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent;
      if (content && content.includes('adsManagerContext')) {
        const match = content.match(/adsManagerContext\s*=\s*({[^;]+});/);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
  } catch (error) {
    console.error('Error extracting page data:', error);
  }
  return null;
}

async function saveAccounts(accounts: FacebookAccount[]) {
  try {
    const existingData = await browser.storage.local.get('fb_control_accounts');
    const existingAccounts = existingData['fb_control_accounts'] 
      ? JSON.parse(existingData['fb_control_accounts'] as string)
      : [];
    
    // 合并数据，避免重复
    const accountMap = new Map();
    existingAccounts.forEach((acc: { id: string; }) => accountMap.set(acc.id, acc));
    accounts.forEach((acc: { id: string; }) => accountMap.set(acc.id, acc));
    
    const mergedAccounts = Array.from(accountMap.values());
    
    await browser.storage.local.set({
      'fb_control_accounts': JSON.stringify(mergedAccounts)
    });
    
    console.log(`Saved ${mergedAccounts.length} accounts to storage`);
  } catch (error) {
    console.error('Error saving accounts:', error);
  }
}

export function isAccountPage(): boolean {
  return window.location.href.includes('/adsmanager/manage/');
}
