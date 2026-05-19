import { browser } from 'wxt/browser';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import {
  isLikelyFacebookAdAccountId,
  mapGraphApiAdAccountToRecord,
  normalizeAccountId,
} from '../../../utils/fb/adAccount/mapGraphAdAccount';
import { fbControlError, fbControlLog } from '../../../utils/fbControlLog';

export type { FbAdAccountRecord };

/** ‰ª? DOM Ê??Ê?¨Ëß£Ê?êË?±Ë¥πÊ?∞Â≠? */
function parseSpend(spendText?: string | null): number {
  if (!spendText) return 0;
  const cleaned = spendText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : value;
}

/** Â∞?È??È??Áª?Ê??Âè?È?ÅÂ?∞Âê?Âè∞ `FB_CONTROL_SAVE_ACCOUNTS` */
async function persistAccounts(rows: FbAdAccountRecord[]) {
  if (!rows.length) return;
  try {
    fbControlLog('content:accounts', 'persistAccounts', { count: rows.length });
    await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SAVE_ACCOUNTS',
      data: rows,
    });
  } catch (e) {
    fbControlError('content:accounts', 'persistAccounts Â§±Ë¥•', e);
  }
}

/**
 * Â?®ÂπøÂ??ÁÆ°Áê? / BM Ë¥¶Ê?∑Â??Ë°®È°µ‰ª? DOMÔº?Ê??È°µÈù¢Â??Âµ? JSONÔº?È??È??ÂπøÂ??Ë¥¶Ê?∑Âπ∂Ê?Å‰π?Â??„??
 */
export async function fetchAccounts(): Promise<FbAdAccountRecord[]> {
  const accounts: FbAdAccountRecord[] = [];
  const now = Date.now();
  const url = window.location.href;

  try {
    if (url.includes('/adsmanager/manage/') || url.includes('business.facebook.com')) {
      fbControlLog('content:accounts', 'Âº?Âß? DOM Ê?´ÊèèË¥¶Ê?∑Ë°?', { url });
      const accountRows = document.querySelectorAll(
        '[data-testid*="account-row"], [role="row"]'
      );

      accountRows.forEach((row, index) => {
        try {
          const nameEl = row.querySelector(
            '[data-testid*="account-name"], [data-visualcompletion="ignore-dynamic"]'
          );
          const idEl = row.querySelector('[data-testid*="account-id"]');
          const statusEl = row.querySelector('[data-testid*="account-status"]');
          const spendEl = row.querySelector('[data-testid*="spend"], [data-testid*="amount"]');

          const nameText = nameEl?.textContent?.trim() || '';
          const idText = idEl?.textContent?.trim() || '';
          const fallbackKey = `row_${index}_${nameText.slice(0, 32)}`;
          const accountId = normalizeAccountId(idText || nameText, fallbackKey);
          if (!isLikelyFacebookAdAccountId(accountId)) return;

          if (nameText || accountId) {
            const spend = parseSpend(spendEl?.textContent);
            accounts.push({
              accountId,
              name: nameText || accountId,
              status: statusEl?.textContent?.trim() || 'unknown',
              currency: 'USD',
              spend,
              totalSpent: spend,
              capturedAt: now,
              sourceUrl: url,
            });
          }
        } catch (err) {
          fbControlError('content:accounts', 'Ëß£Ê?êÂç?Ë°? DOM Â§±Ë¥•', err);
        }
      });

      if (accounts.length === 0) {
        fbControlLog('content:accounts', 'DOM Ê?†Ë°?Ôº?Â∞ùËØ? adsManagerContext Â??Âµ? JSON');
        const pageData = extractPageData();
        const list = pageData?.accounts ?? pageData?.adaccounts ?? pageData?.ad_accounts;
        if (Array.isArray(list) && list.length) {
          for (let i = 0; i < list.length; i++) {
            const a = list[i] as Record<string, unknown>;
            const accountId = normalizeAccountId(
              String(a.account_id ?? a.id ?? ''),
              `ctx_${i}`
            );
            accounts.push(mapGraphApiAdAccountToRecord(a, accountId, now, url));
          }
        }
      }

      fbControlLog('content:accounts', 'È??È??ÂÆ?Ê?ê', { count: accounts.length });
    }

    await persistAccounts(accounts);
    return accounts;
  } catch (error) {
    fbControlError('content:accounts', 'fetchAccounts Â§±Ë¥•', error);
    throw error;
  }
}

/** ‰ª?È°µÈù¢ script ‰∏≠Ëß£Ê?ê `adsManagerContext` JSONÔº?Â??È??Ê?∞ÊçÆÊ∫êÔº? */
function extractPageData(): { accounts?: any[]; adaccounts?: any[]; ad_accounts?: any[] } | null {
  try {
    const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent;
      if (content && content.includes('adsManagerContext')) {
        const match = content.match(/adsManagerContext\s*=\s*({[\s\S]+?});/);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
  } catch (error) {
    fbControlError('content:accounts', 'extractPageData Â§±Ë¥•', error);
  }
  return null;
}

/** ÂΩ?Â?ç URL Ê?ØÂê¶‰∏∫ÂπøÂ??Ë¥¶Ê?∑Á?∏Â?≥ÁÆ°Áê?È°µ */
export function isAccountPage(): boolean {
  return (
    window.location.href.includes('/adsmanager/manage/') ||
    window.location.href.includes('adsmanager') ||
    window.location.href.includes('business.facebook.com/settings/ad-accounts')
  );
}
