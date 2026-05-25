import { browser } from 'wxt/browser';
import type { FbAdAccountRecord } from '../../../interfaces/fbControl';
import {
  buildAdsPanelDisplayRows,
  buildDisplayOptions,
  formatAccountLocalTime,
  formatUsdConversionPreview,
  type AdsPanelDisplayRow,
} from '../../../utils/fb/adsPanel/adAccountPanelDisplay';
import { sanitizeAdAccountRecordForDisplay } from '../../../utils/fb/adAccount/adAccountDisplayMaps';
import { fbControlError, fbControlLog } from '../../../utils/fbControlLog';
import { detectSelectedAccountId, watchSelectedAccount } from './detectSelectedAccount';
import { fetchHiddenAdminCount, fetchUsdToAccountRate } from './panelFieldLoaders';

const ROOT_ID = 'fb-control-ads-panel-root';
const PANEL_W = 340;
const FAB_SIZE = 52;
/** 弹窗默认贴在主内容区右上（日期/列配置行一带），避开 FB 顶栏与右侧竖条 */
const PANEL_DEFAULT_TOP = 108;
const PANEL_RIGHT_GUTTER = 56;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PANEL_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.wrap {
  position: fixed;
  z-index: 2147483646;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  color: #1c1e21;
  pointer-events: none;
}
.wrap * { pointer-events: auto; }
.fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: ${FAB_SIZE}px;
  height: ${FAB_SIZE}px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,.12);
  background: #fff;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform .15s ease, box-shadow .15s ease;
}
.fab:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,.22); }
.fab img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
.panel {
  position: fixed;
  width: ${PANEL_W}px;
  max-height: min(78vh, 640px);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.08);
}
.panel[hidden] { display: none !important; }
.hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #1877f2 0%, #0d65d9 100%);
  color: #fff;
  cursor: move;
  user-select: none;
}
.hdr-title { flex: 1; font-weight: 600; font-size: 14px; }
.hdr-actions { display: flex; gap: 4px; }
.icon-btn {
  width: 28px; height: 28px;
  border: none; border-radius: 6px;
  background: rgba(255,255,255,.18);
  color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1;
}
.icon-btn:hover { background: rgba(255,255,255,.32); }
.icon-btn:disabled { opacity: .5; cursor: not-allowed; }
.icon-btn.spin svg { animation: fc-spin .8s linear infinite; }
@keyframes fc-spin { to { transform: rotate(360deg); } }
.acc-head {
  padding: 10px 12px 8px;
  border-bottom: 1px solid #e4e6eb;
}
.acc-name-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}
.acc-name {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
  margin: 0;
  word-break: break-word;
}
.rename-btn {
  flex-shrink: 0;
  border: 1px solid #ccd0d5;
  background: #fff;
  color: #1877f2;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.rename-btn:hover { background: #f0f2f5; }
.ccy-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #1c1e21;
}
.ccy-bar[hidden] { display: none !important; }
.ccy-dollar { color: #1877f2; font-weight: 600; }
.ccy-usd-input {
  width: 52px;
  border: 1px solid #ccd0d5;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  text-align: right;
}
.ccy-converted {
  margin-left: 4px;
  background: #e7f3ff;
  color: #1877f2;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}
.ccy-converted.loading { color: transparent; min-width: 48px; min-height: 18px; }
.acc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #65676b;
}
.ccy-select {
  border: 1px solid #ccd0d5;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  background: #fff;
  color: #1c1e21;
}
.acc-sub { font-size: 12px; color: #65676b; margin: 0; }
.rename-bar {
  display: none;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  background: #f7f8fa;
  border-radius: 6px;
}
.rename-bar.open { display: flex; }
.rename-input {
  width: 100%;
  border: 1px solid #ccd0d5;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
}
.rename-actions { display: flex; gap: 6px; justify-content: flex-end; }
.rename-actions button {
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.rename-save { background: #1877f2; color: #fff; }
.rename-save:disabled { opacity: .5; }
.rename-cancel { background: #e4e6eb; color: #1c1e21; }
.body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid #f0f2f5;
}
.row:last-child { border-bottom: none; }
.row-icon {
  width: 22px; height: 22px; flex-shrink: 0;
  border-radius: 50%;
  background: #e7f3ff;
  color: #1877f2;
  font-size: 11px;
  display: flex; align-items: center; justify-content: center;
}
.row-label { flex: 0 0 96px; color: #65676b; font-size: 12px; line-height: 1.35; }
.row-value {
  flex: 1;
  text-align: right;
  font-size: 12px;
  line-height: 1.35;
  word-break: break-word;
}
.row-value.mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.row-value.status-active { color: #1877f2; font-weight: 600; }
.row-value.status-inactive { color: #e41e3f; font-weight: 600; }
.row-value .badge {
  display: inline-block;
  background: #e7f3ff;
  color: #1877f2;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.row-value .money-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #1877f2;
  font-weight: 500;
}
.hint, .err {
  padding: 16px 12px;
  text-align: center;
  color: #65676b;
  font-size: 12px;
  line-height: 1.5;
}
.err { color: #e41e3f; }
`;

export class AdsPanelWidget {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panelEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private nameEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private refreshBtn: HTMLButtonElement | null = null;
  private renameBar: HTMLElement | null = null;
  private renameInput: HTMLInputElement | null = null;
  private renameSaveBtn: HTMLButtonElement | null = null;
  private ccySelect: HTMLSelectElement | null = null;
  private ccyBar: HTMLElement | null = null;
  private ccyUsdInput: HTMLInputElement | null = null;
  private ccyConvertedEl: HTMLElement | null = null;
  private usdToAccountRate: number | null = null;
  private open = false;
  private syncing = false;
  private renaming = false;
  private displayAsUsd = false;
  private accountId: string | null = null;
  private record: FbAdAccountRecord | null = null;
  private displayRows: AdsPanelDisplayRow[] = [];
  private panelPos = { left: 0, top: 0 };
  private unwatch: (() => void) | null = null;
  private timeTimer: ReturnType<typeof setInterval> | null = null;

  mount(): void {
    if (document.getElementById(ROOT_ID)) return;

    const host = document.createElement('div');
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);
    this.host = host;

    const shadow = host.attachShadow({ mode: 'closed' });
    this.shadow = shadow;

    const logoUrl = browser.runtime.getURL('icon/48.png');
    shadow.innerHTML = `
<style>${PANEL_CSS}</style>
<div class="wrap">
  <div class="panel" hidden>
    <div class="hdr" data-drag>
      <span class="hdr-title">fbControl AdsData</span>
      <div class="hdr-actions">
        <button type="button" class="icon-btn" data-refresh title="刷新数据" aria-label="刷新">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        <button type="button" class="icon-btn" data-close title="关闭" aria-label="关闭">×</button>
      </div>
    </div>
    <div class="acc-head">
      <div class="acc-name-row">
        <p class="acc-name" data-name>—</p>
        <button type="button" class="rename-btn" data-rename-open>重命名</button>
      </div>
      <div class="rename-bar" data-rename-bar>
        <input class="rename-input" data-rename-input type="text" maxlength="200" placeholder="新账户名称" />
        <div class="rename-actions">
          <button type="button" class="rename-cancel" data-rename-cancel>取消</button>
          <button type="button" class="rename-save" data-rename-save>保存</button>
        </div>
      </div>
      <div class="ccy-bar" data-ccy-bar hidden>
        <span class="ccy-dollar">$</span>
        <input class="ccy-usd-input" data-ccy-usd type="number" value="1" min="0" step="0.01" />
        <span>USD</span>
        <span class="ccy-converted" data-ccy-converted></span>
      </div>
      <div class="acc-toolbar">
        <span>美元切换</span>
        <select class="ccy-select" data-ccy-select title="仅切换金额展示单位">
          <option value="native">原币种</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <p class="acc-sub" data-sub>未选择广告账户</p>
    </div>
    <div class="body" data-body></div>
  </div>
  <button type="button" class="fab" data-fab title="fbControl 账户数据">
    <img src="${escapeHtml(logoUrl)}" alt="fbControl" />
  </button>
</div>`;

    this.panelEl = shadow.querySelector('.panel');
    this.bodyEl = shadow.querySelector('[data-body]');
    this.nameEl = shadow.querySelector('[data-name]');
    this.subEl = shadow.querySelector('[data-sub]');
    this.refreshBtn = shadow.querySelector('[data-refresh]');
    this.renameBar = shadow.querySelector('[data-rename-bar]');
    this.renameInput = shadow.querySelector('[data-rename-input]');
    this.renameSaveBtn = shadow.querySelector('[data-rename-save]');
    this.ccySelect = shadow.querySelector('[data-ccy-select]');
    this.ccyBar = shadow.querySelector('[data-ccy-bar]');
    this.ccyUsdInput = shadow.querySelector('[data-ccy-usd]');
    this.ccyConvertedEl = shadow.querySelector('[data-ccy-converted]');

    shadow.querySelector('[data-fab]')?.addEventListener('click', () => this.togglePanel());
    shadow.querySelector('[data-close]')?.addEventListener('click', () => this.closePanel());
    this.refreshBtn?.addEventListener('click', () => void this.onRefresh());
    shadow.querySelector('[data-rename-open]')?.addEventListener('click', () => this.openRenameBar());
    shadow.querySelector('[data-rename-cancel]')?.addEventListener('click', () => this.closeRenameBar());
    this.renameSaveBtn?.addEventListener('click', () => void this.saveRename());
    this.ccySelect?.addEventListener('change', () => void this.onCurrencyChange());
    this.ccyUsdInput?.addEventListener('input', () => this.updateConversionPreview());

    const dragHdr = shadow.querySelector('[data-drag]');
    if (dragHdr && this.panelEl) this.bindDrag(dragHdr as HTMLElement);

    this.placePanelDefault();
    this.unwatch = watchSelectedAccount((id) => {
      this.accountId = id;
      void this.loadAccount(this.open);
    });

    this.accountId = detectSelectedAccountId();
    void this.loadAccount();

    fbControlLog('content:ads-panel', '悬浮窗已挂载');
  }

  private buildOpts() {
    if (!this.record) return {};
    return buildDisplayOptions(this.record, this.displayAsUsd, this.usdToAccountRate);
  }

  private updateConversionPreview(): void {
    if (!this.ccyConvertedEl || !this.record) return;
    const usd = parseFloat(this.ccyUsdInput?.value || '1');
    if (!Number.isFinite(usd) || usd < 0) {
      this.ccyConvertedEl.textContent = '—';
      return;
    }
    const acct = (this.record.currency || 'USD').trim().toUpperCase();
    if (acct === 'USD') {
      this.ccyConvertedEl.textContent = formatUsdConversionPreview(usd, 'USD', 1);
      return;
    }
    if (this.usdToAccountRate == null) {
      this.ccyConvertedEl.classList.add('loading');
      this.ccyConvertedEl.textContent = '';
      return;
    }
    this.ccyConvertedEl.classList.remove('loading');
    this.ccyConvertedEl.textContent = formatUsdConversionPreview(usd, acct, this.usdToAccountRate);
  }

  private async loadExchangeRate(): Promise<void> {
    const acct = this.record?.currency?.trim().toUpperCase() || 'USD';
    if (acct === 'USD') {
      this.usdToAccountRate = 1;
      if (this.ccyBar) this.ccyBar.hidden = true;
      return;
    }
    if (this.ccyBar) this.ccyBar.hidden = false;
    if (this.ccyConvertedEl) {
      this.ccyConvertedEl.classList.add('loading');
      this.ccyConvertedEl.textContent = '';
    }
    try {
      this.usdToAccountRate = await fetchUsdToAccountRate(acct);
      this.updateConversionPreview();
    } catch {
      this.usdToAccountRate = null;
      if (this.ccyConvertedEl) {
        this.ccyConvertedEl.classList.remove('loading');
        this.ccyConvertedEl.textContent = '汇率不可用';
      }
    }
  }

  private async onCurrencyChange(): Promise<void> {
    this.displayAsUsd = this.ccySelect?.value === 'USD';
    if (!this.record) return;
    if (this.usdToAccountRate == null && (this.record.currency || 'USD').toUpperCase() !== 'USD') {
      await this.loadExchangeRate();
    }
    void this.renderAccount(this.record);
  }

  private openRenameBar(): void {
    if (!this.record || !this.renameBar || !this.renameInput) return;
    this.renameInput.value = this.record.name || '';
    this.renameBar.classList.add('open');
    this.renameInput.focus();
  }

  private closeRenameBar(): void {
    this.renameBar?.classList.remove('open');
    if (this.renameInput) this.renameInput.value = '';
  }

  private async saveRename(): Promise<void> {
    if (!this.record || !this.renameInput || this.renaming) return;
    const name = this.renameInput.value.trim();
    if (!name) {
      this.renderBodyMessage('名称不能为空', true);
      return;
    }
    this.renaming = true;
    if (this.renameSaveBtn) this.renameSaveBtn.disabled = true;
    try {
      const res = (await browser.runtime.sendMessage({
        action: 'FB_CONTROL_RENAME_AD_ACCOUNT',
        data: { accountId: this.record.accountId, name },
      })) as { success?: boolean; error?: string };
      if (!res?.success) {
        this.renderBodyMessage(res?.error || '重命名失败', true);
        return;
      }
      this.record = { ...this.record, name };
      if (this.nameEl) this.nameEl.textContent = name;
      this.closeRenameBar();
      this.renderAccount(this.record);
    } catch (e) {
      fbControlError('content:ads-panel', 'rename', e);
      this.renderBodyMessage(e instanceof Error ? e.message : String(e), true);
    } finally {
      this.renaming = false;
      if (this.renameSaveBtn) this.renameSaveBtn.disabled = false;
    }
  }

  private togglePanel(): void {
    if (this.open) this.closePanel();
    else this.openPanel();
  }

  private openPanel(): void {
    this.open = true;
    if (this.panelEl) {
      this.panelEl.hidden = false;
      this.placePanelDefault();
    }
    void this.loadAccount(true);
    this.startTimeTicker();
  }

  private closePanel(): void {
    this.open = false;
    this.closeRenameBar();
    if (this.panelEl) this.panelEl.hidden = true;
    this.stopTimeTicker();
  }

  private placePanelDefault(): void {
    const left = Math.max(8, window.innerWidth - PANEL_RIGHT_GUTTER - PANEL_W);
    const top = Math.max(8, PANEL_DEFAULT_TOP);
    this.panelPos = { left, top };
    this.applyPanelPos();
  }

  private applyPanelPos(): void {
    if (!this.panelEl) return;
    const maxLeft = Math.max(8, window.innerWidth - PANEL_W - 8);
    const maxTop = Math.max(8, window.innerHeight - 120);
    const left = Math.min(Math.max(8, this.panelPos.left), maxLeft);
    const top = Math.min(Math.max(8, this.panelPos.top), maxTop);
    this.panelPos = { left, top };
    this.panelEl.style.left = `${left}px`;
    this.panelEl.style.top = `${top}px`;
  }

  private bindDrag(handle: HTMLElement): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = this.panelPos.left;
      originTop = this.panelPos.top;
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      this.panelPos = {
        left: originLeft + (e.clientX - startX),
        top: originTop + (e.clientY - startY),
      };
      this.applyPanelPos();
    };
    const onUp = () => {
      dragging = false;
    };
    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private setSyncing(v: boolean): void {
    this.syncing = v;
    if (this.refreshBtn) {
      this.refreshBtn.disabled = v;
      this.refreshBtn.classList.toggle('spin', v);
    }
  }

  /** 手动刷新：全量 Graph 同步（与插件后台「更新」一致） */
  private async onRefresh(): Promise<void> {
    if (this.syncing) return;
    this.setSyncing(true);
    this.renderBodyMessage('正在同步账户…', false);
    try {
      const res = (await browser.runtime.sendMessage({
        action: 'FB_CONTROL_SYNC_AD_ACCOUNTS_FROM_GRAPH',
      })) as { success?: boolean; error?: string };
      if (!res?.success) {
        this.renderBodyMessage(res?.error || '同步失败，请确认已捕获 access_token', true);
        return;
      }
      await this.loadAccount(false);
    } catch (e) {
      fbControlError('content:ads-panel', 'Graph 同步失败', e);
      this.renderBodyMessage(e instanceof Error ? e.message : String(e), true);
    } finally {
      this.setSyncing(false);
    }
  }

  /** 单账户 Graph 拉取并落库 */
  private async fetchAccountFromGraph(accountId: string): Promise<FbAdAccountRecord | null> {
    const res = (await browser.runtime.sendMessage({
      action: 'FB_CONTROL_SYNC_AD_ACCOUNT_FROM_GRAPH',
      data: { accountId },
    })) as {
      success?: boolean;
      error?: string;
      payload?: { account?: FbAdAccountRecord };
    };
    if (!res?.success) {
      throw new Error(res?.error || '拉取账户失败');
    }
    const account = res.payload?.account ?? null;
    return account ? sanitizeAdAccountRecordForDisplay(account) : null;
  }

  /**
   * @param autoFetchIfMissing 打开窗口且本地无缓存时自动 Graph 拉取
   */
  private async loadAccount(autoFetchIfMissing = false): Promise<void> {
    const id = this.accountId;
    if (!id) {
      this.record = null;
      this.usdToAccountRate = null;
      if (this.ccyBar) this.ccyBar.hidden = true;
      if (this.nameEl) this.nameEl.textContent = '—';
      if (this.subEl) {
        this.subEl.hidden = false;
        this.subEl.textContent = '请在页面顶部选择广告账户';
      }
      this.renderBodyMessage('未检测到当前广告账户 ID', false);
      return;
    }

    if (this.subEl) {
      this.subEl.hidden = false;
      this.subEl.textContent = '';
    }

    try {
      let account: FbAdAccountRecord | null = null;

      const cached = (await browser.runtime.sendMessage({
        action: 'FB_CONTROL_GET_ACCOUNT',
        data: { accountId: id },
      })) as { success?: boolean; error?: string; payload?: { account?: FbAdAccountRecord | null } };

      if (!cached?.success) {
        this.renderBodyMessage(cached?.error || '读取账户失败', true);
        return;
      }

      account = cached.payload?.account ?? null;
      if (account) account = sanitizeAdAccountRecordForDisplay(account);

      if (!account && autoFetchIfMissing) {
        this.renderBodyMessage('正在获取账户数据…', false);
        account = await this.fetchAccountFromGraph(id);
      }

      this.record = account;

      if (!account) {
        if (this.nameEl) this.nameEl.textContent = id;
        this.renderBodyMessage('暂无该账户数据，请点击右上角刷新', false);
        return;
      }

      await this.renderAccount(account);
    } catch (e) {
      fbControlError('content:ads-panel', 'loadAccount', e);
      this.renderBodyMessage(e instanceof Error ? e.message : String(e), true);
    }
  }

  private async renderAccount(account: FbAdAccountRecord): Promise<void> {
    if (this.nameEl) this.nameEl.textContent = account.name || account.accountId;
    if (this.subEl) {
      this.subEl.textContent = '';
      this.subEl.hidden = true;
    }
    if (this.ccySelect) {
      const native = (account.currency || 'USD').trim().toUpperCase();
      const nativeOpt = this.ccySelect.querySelector('option[value="native"]');
      if (nativeOpt) nativeOpt.textContent = native === 'USD' ? '原币种 (USD)' : `原币种 (${native})`;
    }
    await this.loadExchangeRate();
    if (this.record?.accountId !== account.accountId) return;
    this.refreshAccountRows(account);
    void this.loadAsyncCounts(account);
  }

  private refreshAccountRows(account: FbAdAccountRecord): void {
    this.displayRows = buildAdsPanelDisplayRows(account, this.buildOpts());
    this.renderRows(this.displayRows);
  }

  private async loadAsyncCounts(account: FbAdAccountRecord): Promise<void> {
    const id = account.accountId;
    try {
      const hidden = await fetchHiddenAdminCount(id, account);
      if (this.record?.accountId !== id) return;
      account.hiddenAdminCount = hidden;
      this.refreshAccountRows(account);
    } catch (e) {
      fbControlError('content:ads-panel', 'loadAsyncCounts', e);
    }
  }

  private renderBodyMessage(msg: string, isError: boolean): void {
    if (!this.bodyEl) return;
    this.bodyEl.innerHTML = `<p class="${isError ? 'err' : 'hint'}">${escapeHtml(msg)}</p>`;
  }

  private renderRows(rows: AdsPanelDisplayRow[]): void {
    if (!this.bodyEl) return;
    const icons = ['$', '◎', '◇', '◆', '▣', '▤', '▥', '▦', '▧', '▨', '▩', '◉', '○', '●', '◐', '◑'];
    this.bodyEl.innerHTML = rows
      .map((r, i) => {
        const kind = r.valueKind || '';
        const cls = ['row-value', kind].filter(Boolean).join(' ');
        const sub =
          r.secondaryValue != null && r.secondaryValue !== ''
            ? `<span class="money-sub">${escapeHtml(r.secondaryValue)}</span>`
            : '';
        const valInner =
          kind === 'badge'
            ? `<span class="badge">${escapeHtml(r.value)}</span>${sub}`
            : `${escapeHtml(r.value)}${sub}`;
        return `<div class="row" data-label="${escapeHtml(r.label)}">
          <span class="row-icon">${icons[i % icons.length]}</span>
          <span class="row-label">${escapeHtml(r.label)}</span>
          <span class="${cls}">${valInner}</span>
        </div>`;
      })
      .join('');
  }

  private startTimeTicker(): void {
    this.stopTimeTicker();
    this.timeTimer = setInterval(() => {
      if (!this.open || !this.record?.timezone || !this.bodyEl) return;
      const row = this.bodyEl.querySelector('.row[data-label="账号时间"] .row-value');
      if (row) row.textContent = formatAccountLocalTime(this.record.timezone);
    }, 1000);
  }

  private stopTimeTicker(): void {
    if (this.timeTimer) clearInterval(this.timeTimer);
    this.timeTimer = null;
  }
}
