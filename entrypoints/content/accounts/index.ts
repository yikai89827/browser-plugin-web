import { browser } from 'wxt/browser';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';

export type { FbAdAccountRecord };

function extractNumericAccountId(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/\b(\d{10,})\b/);
  return m ? m[1] : '';
}

function normalizeAccountId(raw: string, fallbackKey: string): string {
  const trimmed = (raw || '').replace(/^act_/i, '').trim();
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  const fromBlob = extractNumericAccountId(raw);
  if (fromBlob) return fromBlob;
  return fallbackKey;
}

async function persistAccounts(rows: FbAdAccountRecord[]) {
  if (!rows.length) return;
  try {
    await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SAVE_ACCOUNTS',
      data: rows,
    });
    console.log(`[fbControl] persisted ${rows.length} accounts to extension IndexedDB`);
  } catch (e) {
    console.error('[fbControl] persist accounts failed', e);
  }
}

export async function fetchAccounts(): Promise<FbAdAccountRecord[]> {
  const accounts: FbAdAccountRecord[] = [];
  const now = Date.now();
  const url = window.location.href;

  try {
    if (url.includes('/adsmanager/manage/') || url.includes('business.facebook.com')) {
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

          if (nameText || accountId) {
            const spend = parseSpend(spendEl?.textContent);
            accounts.push({
              accountId,
              name: nameText || accountId,
              status: statusEl?.textContent?.trim() || 'unknown',
              currency: 'USD',
              spend,
              capturedAt: now,
              sourceUrl: url,
            });
          }
        } catch (err) {
          console.error('Error parsing account row:', err);
        }
      });

      if (accounts.length === 0) {
        const pageData = extractPageData();
        if (pageData?.accounts?.length) {
          for (let i = 0; i < pageData.accounts.length; i++) {
            const a = pageData.accounts[i];
            const accountId = normalizeAccountId(
              String(a.account_id || a.id || ''),
              `ctx_${i}`
            );
            accounts.push({
              accountId,
              name: String(a.name || a.account_name || accountId),
              status: String(a.account_status || a.status || 'unknown'),
              currency: String(a.currency || 'USD'),
              spend: typeof a.amount_spent === 'string' ? parseSpend(a.amount_spent) : Number(a.amount_spent) || 0,
              capturedAt: now,
              sourceUrl: url,
            });
          }
        }
      }

      console.log(`[fbControl] collected ${accounts.length} ad accounts`);
    }

    await persistAccounts(accounts);
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
  return Number.isNaN(value) ? 0 : value;
}

function extractPageData(): { accounts?: any[] } | null {
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
    console.error('Error extracting page data:', error);
  }
  return null;
}

export function isAccountPage(): boolean {
  return (
    window.location.href.includes('/adsmanager/manage/') ||
    window.location.href.includes('adsmanager') ||
    window.location.href.includes('business.facebook.com/settings/ad-accounts')
  );
}
