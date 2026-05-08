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

function parseSpend(spendText?: string | null): number {
  if (!spendText) return 0;
  const cleaned = spendText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : value;
}

function parseAmountSpent(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseSpend(String(v));
}

/** 将页面/Graph 风格对象映射为表格行（字段尽量对齐截图） */
function mapGraphLikeAccount(
  a: Record<string, unknown>,
  accountId: string,
  now: number,
  url: string
): FbAdAccountRecord {
  const currency = String(a.currency ?? '');
  const balance = a.balance != null ? String(a.balance) : '';
  const spendCap = a.spend_cap != null ? String(a.spend_cap) : '';
  const amountSpent = parseAmountSpent(a.amount_spent ?? a.amount_spent_string ?? a.spend);
  const prepay = a.is_prepay_account;
  let accountType: string | undefined;
  if (prepay === true || prepay === 1) accountType = '预付';
  else if (prepay === false || prepay === 0) accountType = '后付费';

  const business = (a.business ?? a.owner_business) as Record<string, unknown> | undefined;
  const bmId = business?.id != null ? String(business.id) : undefined;
  const bmName = business?.name != null ? String(business.name) : undefined;
  const createdTime = a.created_time != null ? String(a.created_time) : '';
  const createdDate = createdTime.length >= 10 ? createdTime.slice(0, 10) : undefined;

  const oid =
    a.id != null && String(a.id) !== String(accountId)
      ? String(a.id)
      : a.account_id != null
        ? String(a.account_id)
        : accountId;

  return {
    accountId,
    name: String(a.name ?? a.account_name ?? accountId),
    status: String(a.account_status ?? a.status ?? 'unknown'),
    currency: currency || undefined,
    accountType,
    balance: balance || undefined,
    dailyLimit:
      a.min_daily_budget != null
        ? String(a.min_daily_budget)
        : spendCap
          ? spendCap
          : undefined,
    spendingLimit: spendCap || undefined,
    totalSpent: amountSpent,
    periodSpent:
      a.amount_spent != null
        ? String(a.amount_spent)
        : a.amount_spent_string != null
          ? String(a.amount_spent_string)
          : undefined,
    ownerRole: a.user_role != null ? String(a.user_role) : undefined,
    paymentMethod:
      a.funding_source != null
        ? String(a.funding_source)
        : a.payment_method != null
          ? String(a.payment_method)
          : undefined,
    billingPeriod:
      a.next_bill_date != null
        ? String(a.next_bill_date)
        : a.end_advertiser != null
          ? String(a.end_advertiser)
          : undefined,
    lockReason: a.disable_reason != null ? String(a.disable_reason) : undefined,
    createdDate,
    timezone:
      (a.timezone_name ?? a.timezone_id ?? a.timezone_offset_hours_utc) != null
        ? String(a.timezone_name ?? a.timezone_id ?? a.timezone_offset_hours_utc)
        : undefined,
    originalId: oid,
    createdFromBmName: bmName,
    createdFromBmId: bmId,
    belongsToBmName: a.business_name != null ? String(a.business_name) : undefined,
    belongsToBmId:
      a.business_id != null
        ? String(a.business_id)
        : a.owner_business_id != null
          ? String(a.owner_business_id)
          : undefined,
    countryCode:
      a.country_code != null
        ? String(a.country_code)
        : a.country != null
          ? String(a.country)
          : undefined,
    spend: amountSpent,
    capturedAt: now,
    sourceUrl: url,
  };
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
              totalSpent: spend,
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
        const list = pageData?.accounts ?? pageData?.adaccounts ?? pageData?.ad_accounts;
        if (Array.isArray(list) && list.length) {
          for (let i = 0; i < list.length; i++) {
            const a = list[i] as Record<string, unknown>;
            const accountId = normalizeAccountId(
              String(a.account_id ?? a.id ?? ''),
              `ctx_${i}`
            );
            accounts.push(mapGraphLikeAccount(a, accountId, now, url));
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
