<script lang="ts" setup>
import { ref, computed, onMounted, watch, reactive } from 'vue';
import type { FbAdAccountRecord, FbAdAccountPaymentActivity } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  fetchAccountsFromExtension,
  fetchAdAccountPaymentActivitiesFromExtension,
  fetchAdAccountAssignedUsersFromExtension,
  getStoredExtensionId,
  getFbTokenMetaFromExtension,
  mergeAccountInExtension,
  pingExtension,
  setStoredExtensionId,
  syncAdAccountsFromGraphViaExtension,
  setFbAccessTokenInExtension,
  clearFbAccessTokenInExtension,
  usesExtensionIdFromEnv,
  type FbTokenMeta,
} from '../lib/extensionBridge';
import { fbControlLog } from '../../../utils/fbControlLog';

const COL_COUNT = 31;

/**
 * 广告账户管理页：通过扩展桥接读取 IndexedDB、触发 Graph 同步与 Token 操作。
 */
const extensionIdInput = ref(getStoredExtensionId());
const accounts = ref<FbAdAccountRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
const lastUpdated = ref<string>('');
const extensionOk = ref<boolean | null>(null);
const tokenMeta = ref<FbTokenMeta | null>(null);
const showPasteToken = ref(false);
const pasteTokenInput = ref('');
/** 行多选（仅前端会话，导出等可后续接） */
const selectedIds = ref<Record<string, boolean>>({});

/** 表格分页：当前页、每页条数 */
const currentPage = ref(1);
const pageSize = ref(15);

/** 支付记录弹窗 */
const paymentModalOpen = ref(false);
const paymentModalTitle = ref('');
const paymentModalRows = ref<FbAdAccountPaymentActivity[]>([]);
const paymentModalHint = ref('');

/** 每行支付按钮：idle | loading | empty | error（仅成功有数据时弹窗，空/错在按钮上展示） */
const paymentUi = reactive<Record<string, 'idle' | 'loading' | 'empty' | 'error'>>({});

/** 隐藏管理员「加载」请求中 */
const hiddenAdminUi = reactive<Record<string, 'loading' | 'error'>>({});

function payState(accountId: string): 'idle' | 'loading' | 'empty' | 'error' {
  return paymentUi[accountId] ?? 'idle';
}

function hiddenAdminState(accountId: string): 'idle' | 'loading' | 'error' {
  return hiddenAdminUi[accountId] ?? 'idle';
}

/** 将行内可展示字段拼成一段小写文本，供关键词过滤 */
function haystack(row: FbAdAccountRecord): string {
  return Object.values(row)
    .filter((v) => v != null && typeof v !== 'object')
    .join(' ')
    .toLowerCase();
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return accounts.value;
  return accounts.value.filter((a) => haystack(a).includes(q));
});

const totalPages = computed(() => {
  const n = filtered.value.length;
  return Math.max(1, Math.ceil(n / pageSize.value) || 1);
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

watch([filtered, searchQuery], () => {
  currentPage.value = 1;
});

watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

watch(pageSize, () => {
  currentPage.value = 1;
});

function saveExtensionId() {
  setStoredExtensionId(extensionIdInput.value);
}

function toggleRowSelected(accountId: string) {
  selectedIds.value = {
    ...selectedIds.value,
    [accountId]: !selectedIds.value[accountId],
  };
}

function toggleSelectAll(checked: boolean) {
  const next: Record<string, boolean> = { ...selectedIds.value };
  for (const row of filtered.value) {
    next[row.accountId] = checked;
  }
  selectedIds.value = next;
}

const allFilteredSelected = computed(() => {
  if (!filtered.value.length) return false;
  return filtered.value.every((r) => selectedIds.value[r.accountId]);
});

function rowSerial(idx: number): number {
  return (currentPage.value - 1) * pageSize.value + idx + 1;
}

function closePaymentModal() {
  paymentModalOpen.value = false;
  paymentModalRows.value = [];
  paymentModalHint.value = '';
  paymentModalTitle.value = '';
}

async function onLoadPaymentRecords(row: FbAdAccountRecord) {
  if (!extensionConfigured()) {
    errorMsg.value = '请配置 VITE_EXTENSION_ID 或页面扩展 ID';
    return;
  }
  paymentUi[row.accountId] = 'loading';
  try {
    const res = await fetchAdAccountPaymentActivitiesFromExtension(row.accountId);
    if (!res.success) {
      paymentUi[row.accountId] = 'error';
      return;
    }
    const p = res.payload!;
    if (!p.items?.length) {
      paymentUi[row.accountId] = 'empty';
      return;
    }
    paymentModalTitle.value = `${row.name}（${row.accountId}）`;
    paymentModalRows.value = p.items;
    paymentModalHint.value =
      p.message ||
      `原始活动 ${p.rawCount} 条 · 展示计费/支付相关 ${p.filteredCount} 条`;
    paymentModalOpen.value = true;
    paymentUi[row.accountId] = 'idle';
  } catch {
    paymentUi[row.accountId] = 'error';
  }
}

/** 加载 / 重试：空态与失败态点击可再次查询 */
function onPayCellClick(row: FbAdAccountRecord) {
  const s = payState(row.accountId);
  if (s === 'loading') return;
  if (s === 'empty' || s === 'error') {
    delete paymentUi[row.accountId];
  }
  void onLoadPaymentRecords(row);
}

async function onLoadHiddenAdmins(row: FbAdAccountRecord) {
  if (!extensionConfigured()) {
    errorMsg.value = '请配置 VITE_EXTENSION_ID 或页面扩展 ID';
    return;
  }
  hiddenAdminUi[row.accountId] = 'loading';
  try {
    const res = await fetchAdAccountAssignedUsersFromExtension(row.accountId);
    if (!res.success) {
      hiddenAdminUi[row.accountId] = 'error';
      return;
    }
    const count = res.payload?.count ?? 0;
    await mergeAccountInExtension({ accountId: row.accountId, hiddenAdminCount: count });
    row.hiddenAdminCount = count;
    delete hiddenAdminUi[row.accountId];
  } catch {
    hiddenAdminUi[row.accountId] = 'error';
  }
}

function onHiddenAdminClick(row: FbAdAccountRecord) {
  if (hiddenAdminState(row.accountId) === 'loading') return;
  if (hiddenAdminState(row.accountId) === 'error') {
    delete hiddenAdminUi[row.accountId];
  }
  void onLoadHiddenAdmins(row);
}

async function testExtension() {
  errorMsg.value = '';
  extensionOk.value = null;
  saveExtensionId();
  fbControlLog('site:account-page', '检测扩展连接');
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 配置 VITE_EXTENSION_ID，或在页面填写扩展 ID';
    return;
  }
  try {
    const res = await pingExtension();
    extensionOk.value = Boolean(res.success && res.payload?.ok);
    if (!extensionOk.value) errorMsg.value = res.error || '扩展无响应';
    else fbControlLog('site:account-page', '扩展 PING 成功');
  } catch (e: any) {
    extensionOk.value = false;
    errorMsg.value = e?.message || String(e);
  }
}

async function refreshFromExtension() {
  errorMsg.value = '';
  loading.value = true;
  saveExtensionId();
  fbControlLog('site:account-page', '从扩展拉取账户列表');
  try {
    if (!extensionConfigured()) {
      throw new Error('请配置 VITE_EXTENSION_ID 或页面扩展 ID，并确保 manifest 中 externally_connectable 包含本站点');
    }
    const res = await fetchAccountsFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    accounts.value = [...(res.payload?.list || [])].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    lastUpdated.value = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fbControlLog('site:account-page', '账户列表已更新', { count: accounts.value.length });
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function dash(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  NZD: 'NZ$',
  KRW: '₩',
  CHF: 'CHF ',
  MXN: 'MX$',
  BRL: 'R$',
  INR: '₹',
  THB: '฿',
  MYR: 'RM',
  PHP: '₱',
  VND: '₫',
  TRY: '₺',
  ILS: '₪',
  PLN: 'zł',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  ZAR: 'R',
  AED: 'AED ',
  SAR: 'SAR ',
};

function currencySymbol(code?: string): string {
  const c = (code || 'USD').trim().toUpperCase();
  return CURRENCY_SYMBOL[c] || `${c} `;
}

/** Graph 金额常为「最小货币单位」（如美分） */
function formatMinorAmount(minor: number | undefined | null, currency?: string): string {
  if (minor == null || Number.isNaN(minor)) return '—';
  const sym = currencySymbol(currency);
  const major = minor / 100;
  return (
    sym +
    major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** 已为主单位的小数金额 */
function formatMajorAmount(n: number, currency?: string): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sym = currencySymbol(currency);
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 纯数字字符串按「最小单位」解析；否则原样加符号（若能识别为数字） */
function formatMoneyishRaw(raw: string | undefined, currency?: string): string {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  if (!s || s === '—') return '—';
  if (s.includes('不限')) return s;
  const sym = currencySymbol(currency);
  if (/^-?\d+$/.test(s)) {
    const minor = parseInt(s, 10);
    if (!Number.isNaN(minor)) return formatMinorAmount(minor, currency);
  }
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isNaN(n) && /^-?[\d.]+$/.test(cleaned)) {
    return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return s;
}

function totalSpentCell(row: FbAdAccountRecord) {
  if (row.totalSpentMinor != null) return formatMinorAmount(row.totalSpentMinor, row.currency);
  if (row.totalSpent !== undefined && row.totalSpent !== '') {
    return typeof row.totalSpent === 'number'
      ? formatMajorAmount(row.totalSpent, row.currency)
      : formatMoneyishRaw(String(row.totalSpent), row.currency);
  }
  if (row.paymentAmount) return formatMoneyishRaw(String(row.paymentAmount), row.currency);
  if (row.spend != null) return formatMajorAmount(row.spend, row.currency);
  return '—';
}

function balanceCell(row: FbAdAccountRecord) {
  if (row.balanceMinor != null) return formatMinorAmount(row.balanceMinor, row.currency);
  return formatMoneyishRaw(row.balance, row.currency);
}

function billingAmountCell(row: FbAdAccountRecord) {
  const m = row.billingAmountMinor ?? row.balanceMinor;
  if (m != null) return formatMinorAmount(m, row.currency);
  return formatMoneyishRaw(row.balance, row.currency);
}

function thresholdCell(row: FbAdAccountRecord) {
  const m = row.paymentThresholdMinor ?? row.spendCapMinor;
  if (m === 0) return '不限额';
  if (m != null) return formatMinorAmount(m, row.currency);
  return formatMoneyishRaw(row.spendingLimit, row.currency);
}

function dailyLimitCell(row: FbAdAccountRecord) {
  if (row.minDailyBudgetMinor != null && row.minDailyBudgetMinor > 0) {
    return formatMinorAmount(row.minDailyBudgetMinor, row.currency);
  }
  const s = row.dailyLimit;
  if (!s) return '—';
  return formatMoneyishRaw(String(s), row.currency);
}

function spendingLimitCell(row: FbAdAccountRecord) {
  if (row.spendCapMinor === 0) return '不限额';
  if (row.spendCapMinor != null) return formatMinorAmount(row.spendCapMinor, row.currency);
  return formatMoneyishRaw(row.spendingLimit, row.currency);
}

function periodSpentCell(row: FbAdAccountRecord) {
  const s = row.periodSpent;
  if (!s) return '—';
  return formatMoneyishRaw(String(s), row.currency);
}

function adminBadgeText(row: FbAdAccountRecord) {
  const n = row.adminCount;
  return n == null || Number.isNaN(Number(n)) ? '0' : String(n);
}

function statusOn(row: FbAdAccountRecord) {
  const s = (row.status || '').trim();
  const sl = s.toLowerCase();
  if (!s || s === '未知') return false;
  if (s.includes('活跃') || s.includes('可投放') || s.includes('运行')) return true;
  return sl.includes('active') || sl.includes('enabled') || s === '1';
}

async function loadTokenMeta() {
  errorMsg.value = '';
  if (!extensionConfigured()) {
    tokenMeta.value = null;
    return;
  }
  fbControlLog('site:account-page', '读取 Token 元数据');
  try {
    saveExtensionId();
    const res = await getFbTokenMetaFromExtension();
    if (!res.success) throw new Error(res.error || '读取 Token 状态失败');
    tokenMeta.value = (res.payload ?? null) as FbTokenMeta | null;
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
    tokenMeta.value = null;
  }
}

async function syncFromGraph() {
  errorMsg.value = '';
  loading.value = true;
  saveExtensionId();
  fbControlLog('site:account-page', '请求扩展执行 Graph 同步');
  try {
    if (!extensionConfigured()) {
      throw new Error('请配置 VITE_EXTENSION_ID 或页面扩展 ID');
    }
    const res = await syncAdAccountsFromGraphViaExtension();
    if (!res.success) throw new Error(res.error || 'Graph 同步失败');
    fbControlLog('site:account-page', 'Graph 同步成功，刷新列表');
    await refreshFromExtension();
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function savePastedToken() {
  errorMsg.value = '';
  const t = pasteTokenInput.value.trim();
  if (!t) {
    errorMsg.value = '请粘贴 access_token';
    return;
  }
  fbControlLog('site:account-page', '保存粘贴的 Token');
  loading.value = true;
  try {
    const res = await setFbAccessTokenInExtension(t, 'local_site_paste');
    if (!res.success) throw new Error(res.error || '保存失败');
    showPasteToken.value = false;
    pasteTokenInput.value = '';
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function onClearToken() {
  if (!confirm('确定清除本地保存的 Facebook access_token？')) return;
  errorMsg.value = '';
  fbControlLog('site:account-page', '清除 Token');
  try {
    const res = await clearFbAccessTokenInExtension();
    if (!res.success) throw new Error(res.error || '清除失败');
    await loadTokenMeta();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  }
}

async function onToggleFavorite(row: FbAdAccountRecord) {
  errorMsg.value = '';
  try {
    const next = !row.favorite;
    await mergeAccountInExtension({ accountId: row.accountId, favorite: next });
    row.favorite = next;
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  }
}

onMounted(() => {
  extensionIdInput.value = getStoredExtensionId();
  fbControlLog('site:account-page', '页面挂载，自动拉取账户');
  refreshFromExtension()
    .then(() => loadTokenMeta())
    .catch(() => {});
});
</script>

<template>
  <div class="fb-page">
    <div class="toolbar">
      <div class="meta">
        <span v-if="lastUpdated">上次更新 | {{ lastUpdated }}</span>
        <span v-else class="muted">数据来自扩展 IndexedDB</span>
        <span v-if="extensionOk === true" class="badge ok">扩展已连接</span>
        <span v-else-if="extensionOk === false" class="badge err">扩展未连接</span>
      </div>
      <div class="toolbar-actions">
        <div v-if="usesExtensionIdFromEnv()" class="ext-id ext-id--env">
          <span>扩展 ID</span>
          <code class="ext-id-preview" :title="getStoredExtensionId()">{{ getStoredExtensionId().slice(0, 12) }}…</code>
        </div>
        <label v-else class="ext-id">
          <span>扩展 ID</span>
          <input
            v-model="extensionIdInput"
            type="text"
            placeholder="chrome://extensions 中的 ID"
            @change="saveExtensionId"
          />
        </label>
        <button class="btn ghost" type="button" :disabled="loading" @click="testExtension">检测连接</button>
        <button class="btn primary" type="button" :disabled="loading" @click="refreshFromExtension">
          {{ loading ? '加载中…' : '更新' }}
        </button>
      </div>
    </div>

    <div v-if="extensionConfigured()" class="token-bar">
      <div class="token-info">
        <span class="badge" :class="tokenMeta?.hasToken ? 'ok' : 'warn'">
          {{ tokenMeta?.hasToken ? 'Token 已保存' : '未捕获 Token' }}
        </span>
        <span v-if="tokenMeta?.hasToken && tokenMeta.updatedAt" class="muted token-detail">
          更新于 {{ new Date(tokenMeta.updatedAt).toLocaleString('zh-CN') }}
          <template v-if="tokenMeta.sourceHost"> · {{ tokenMeta.sourceHost }}</template>
          <template v-if="tokenMeta.tokenPrefix"> · {{ tokenMeta.tokenPrefix }}</template>
        </span>
      </div>
      <div class="token-actions">
        <button class="btn ghost sm" type="button" :disabled="loading" @click="loadTokenMeta">Token 状态</button>
        <button class="btn primary sm" type="button" :disabled="loading" @click="syncFromGraph">Graph 同步账户</button>
        <button class="btn ghost sm" type="button" :disabled="loading" @click="showPasteToken = true">粘贴 Token</button>
        <button class="btn danger sm" type="button" :disabled="loading" @click="onClearToken">清除 Token</button>
      </div>
    </div>

    <div v-if="showPasteToken" class="modal-overlay" @click.self="showPasteToken = false">
      <div class="modal-box">
        <h3>粘贴 access_token</h3>
        <p class="muted small">将自动保存到扩展本地 storage，供 Graph 拉取广告账户使用。</p>
        <textarea v-model="pasteTokenInput" rows="4" placeholder="EAAB…" />
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="showPasteToken = false">取消</button>
          <button type="button" class="btn primary" :disabled="loading" @click="savePastedToken">保存</button>
        </div>
      </div>
    </div>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div class="hint">
      在 Chrome 中打开并操作
      <strong>Facebook 广告管理</strong>
      （任意会请求 Graph 的页面）时，扩展会在后台从请求 URL 中捕获
      <code>access_token</code>
      并保存到本地。随后在管理页点击「Graph 同步账户」即可用该 token 调用
      <code>me/adaccounts</code>
      写入账户表。收藏等仍写入 IndexedDB。
    </div>

    <div class="search-row">
      <input v-model="searchQuery" type="search" placeholder="搜索：请输入广告账号…" />
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="chk sticky-col sticky-chk">
              <input
                type="checkbox"
                :checked="allFilteredSelected"
                @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th class="num sticky-col sticky-num">序号</th>
            <th class="ico sticky-col sticky-ico">收藏</th>
            <th class="sticky-col sticky-status">状态</th>
            <th class="sticky-col sticky-account">账号</th>
            <th>推送状态</th>
            <th>管理员</th>
            <th>隐藏管理员</th>
            <th>账号类型</th>
            <th>账单金额</th>
            <th>门槛</th>
            <th>日限额</th>
            <th>总花费</th>
            <th>花费限额</th>
            <th>已花费</th>
            <th>余额</th>
            <th>备注</th>
            <th>币种</th>
            <th>账户类型</th>
            <th>所有者角色</th>
            <th>支付方法</th>
            <th>账单期</th>
            <th>锁定原因</th>
            <th>创建日期</th>
            <th>时区</th>
            <th>原始 ID</th>
            <th>创建自 BM</th>
            <th>所属 BM</th>
            <th>国家编码</th>
            <th>支付记录</th>
            <th>采集时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in pagedRows" :key="row.accountId">
            <td class="chk sticky-col sticky-chk">
              <input
                type="checkbox"
                :checked="!!selectedIds[row.accountId]"
                @change="toggleRowSelected(row.accountId)"
              />
            </td>
            <td class="num sticky-col sticky-num">{{ rowSerial(idx) }}</td>
            <td class="ico sticky-col sticky-ico">
              <button
                type="button"
                class="star"
                :class="{ on: row.favorite }"
                :title="row.favorite ? '取消收藏' : '收藏'"
                @click="onToggleFavorite(row)"
              >
                ★
              </button>
            </td>
            <td class="sticky-col sticky-status">
              <span class="dot" :class="statusOn(row) ? 'on' : 'off'" />
            </td>
            <td class="account-cell sticky-col sticky-account">
              <div class="name">{{ dash(row.name) }}</div>
              <div class="mono sub">{{ dash(row.accountId) }}</div>
            </td>
            <td>{{ dash(row.pushStatus) }}</td>
            <td>
              <span class="admin-badge">{{ adminBadgeText(row) }}</span>
            </td>
            <td class="hidden-admin-cell">
              <button
                type="button"
                class="btn-pay btn-pay--sm"
                :class="{ 'btn-pay--err': hiddenAdminState(row.accountId) === 'error' }"
                :disabled="hiddenAdminState(row.accountId) === 'loading'"
                @click="onHiddenAdminClick(row)"
              >
                <template v-if="hiddenAdminState(row.accountId) === 'loading'">
                  <span class="pay-spin" aria-hidden="true" />
                  加载中
                </template>
                <template v-else-if="hiddenAdminState(row.accountId) === 'error'">重试</template>
                <template v-else>加载</template>
              </button>
              <span v-if="row.hiddenAdminCount != null" class="muted small hidden-admin-count">
                {{ row.hiddenAdminCount }} 人
              </span>
            </td>
            <td>{{ dash(row.accountKindLabel) }}</td>
            <td>{{ billingAmountCell(row) }}</td>
            <td>{{ thresholdCell(row) }}</td>
            <td>{{ dailyLimitCell(row) }}</td>
            <td>{{ totalSpentCell(row) }}</td>
            <td>{{ spendingLimitCell(row) }}</td>
            <td>{{ periodSpentCell(row) }}</td>
            <td>{{ balanceCell(row) }}</td>
            <td>{{ dash(row.remark) }}</td>
            <td>{{ dash(row.currency) }}</td>
            <td>{{ dash(row.accountType) }}</td>
            <td class="linkish">{{ dash(row.ownerRole) }}</td>
            <td>{{ dash(row.paymentMethod) }}</td>
            <td>{{ dash(row.billingPeriod) }}</td>
            <td class="lock" :class="{ policy: !!row.lockReason }">{{ dash(row.lockReason) }}</td>
            <td>{{ dash(row.createdDate) }}</td>
            <td class="small">{{ dash(row.timezone) }}</td>
            <td class="mono small">{{ dash(row.originalId) }}</td>
            <td class="bm">
              <div class="linkish">{{ dash(row.createdFromBmName) }}</div>
              <div v-if="row.createdFromBmId" class="mono sub">{{ row.createdFromBmId }}</div>
            </td>
            <td class="bm">
              <div class="linkish">{{ dash(row.belongsToBmName) }}</div>
              <div v-if="row.belongsToBmId" class="mono sub">{{ row.belongsToBmId }}</div>
            </td>
            <td>{{ dash(row.countryCode) }}</td>
            <td class="pay-cell">
              <button
                type="button"
                class="btn-pay"
                :class="{
                  'btn-pay--loading': payState(row.accountId) === 'loading',
                  'btn-pay--empty': payState(row.accountId) === 'empty',
                  'btn-pay--err': payState(row.accountId) === 'error',
                }"
                :disabled="payState(row.accountId) === 'loading'"
                :title="
                  payState(row.accountId) === 'empty' || payState(row.accountId) === 'error'
                    ? '点击重新查询'
                    : ''
                "
                @click="onPayCellClick(row)"
              >
                <template v-if="payState(row.accountId) === 'loading'">
                  <span class="pay-spin" aria-hidden="true" />
                  加载中
                </template>
                <template v-else-if="payState(row.accountId) === 'empty'">无支付记录</template>
                <template v-else-if="payState(row.accountId) === 'error'">获取失败</template>
                <template v-else>加载</template>
              </button>
            </td>
            <td class="muted small">{{ row.capturedAt ? new Date(row.capturedAt).toLocaleString('zh-CN') : '—' }}</td>
          </tr>
          <tr v-if="!filtered.length">
            <td :colspan="COL_COUNT" class="empty">
              暂无数据。请确认扩展已加载、扩展 ID 正确，并已在 Facebook 相关页面触发采集。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="filtered.length" class="pager">
      <div class="pager-info">
        共 <strong>{{ filtered.length }}</strong> 条
        <label class="pager-size">
          每页
          <select v-model.number="pageSize">
            <option :value="10">10</option>
            <option :value="15">15</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
          条
        </label>
      </div>
      <div class="pager-nav">
        <button type="button" class="btn ghost sm" :disabled="currentPage <= 1" @click="currentPage = 1">
          首页
        </button>
        <button
          type="button"
          class="btn ghost sm"
          :disabled="currentPage <= 1"
          @click="currentPage = Math.max(1, currentPage - 1)"
        >
          上一页
        </button>
        <span class="pager-page">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button
          type="button"
          class="btn ghost sm"
          :disabled="currentPage >= totalPages"
          @click="currentPage = Math.min(totalPages, currentPage + 1)"
        >
          下一页
        </button>
        <button
          type="button"
          class="btn ghost sm"
          :disabled="currentPage >= totalPages"
          @click="currentPage = totalPages"
        >
          末页
        </button>
      </div>
    </div>

    <div
      v-if="paymentModalOpen"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="closePaymentModal"
    >
      <div class="modal-box modal-box--wide">
        <h3>支付记录 · {{ paymentModalTitle }}</h3>
        <p class="muted small pay-hint">{{ paymentModalHint }}</p>
        <div class="pay-table-wrap">
          <table class="pay-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>对象</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pr, pi) in paymentModalRows" :key="pi">
                <td class="mono small">{{ dash(pr.eventTime) }}</td>
                <td>{{ dash(pr.translatedEventType || pr.eventType) }}</td>
                <td>{{ dash(pr.objectName) }}</td>
                <td class="small pay-detail">{{ dash(pr.detail) }}</td>
              </tr>
              <tr v-if="!paymentModalRows.length">
                <td colspan="4" class="empty">暂无计费/支付类活动记录，或当前 token 无读取权限。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn primary" @click="closePaymentModal">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb-page {
  color: var(--fb-page-text, #e8eaed);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--fb-surface-b, #1f2937);
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
}
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.muted { color: var(--fb-muted, #9ca3af); }
.toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ext-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fb-muted, #9ca3af);
}
.ext-id input {
  width: 260px;
  max-width: 50vw;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 12px;
}
.ext-id--env { flex-wrap: wrap; align-items: center; }
.ext-id-preview {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--fb-input-bg, #111827);
  border: 1px solid var(--fb-code-border, #374151);
  color: var(--fb-link, #93c5fd);
  font-size: 12px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tiny { font-size: 11px; }
.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary { background: #2563eb; color: #fff; }
.btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.ghost { background: var(--fb-ghost-bg, #374151); color: var(--fb-ghost-text, #e5e7eb); }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.badge.ok { background: #064e3b; color: #6ee7b7; }
.badge.err { background: #7f1d1d; color: #fecaca; }
.alert {
  background: #7f1d1d;
  color: #fecaca;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 10px;
}
.hint {
  font-size: 12px;
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 12px;
  line-height: 1.5;
}
.search-row input {
  width: 100%;
  max-width: 480px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  margin-bottom: 12px;
}
.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-a, #111827);
}
table {
  width: max-content;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
tbody tr:nth-child(even) { background: var(--fb-row-even, #0c1222); }
tbody tr:nth-child(even) td.sticky-col {
  background-color: var(--fb-row-even, #0c1222);
}
tbody tr:nth-child(odd) td.sticky-col {
  background-color: var(--fb-surface-a, #111827);
}
th, td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
  vertical-align: middle;
}
th {
  background: var(--fb-th-bg, #0f172a);
  color: var(--fb-th-text, #9ca3af);
  font-weight: 600;
  white-space: nowrap;
}
thead th.sticky-col {
  z-index: 5;
  background-color: var(--fb-th-bg, #0f172a);
}
tbody td.sticky-col {
  z-index: 2;
}
.sticky-col {
  position: sticky;
  background-clip: padding-box;
}
.sticky-chk {
  left: 0;
  width: 40px;
  min-width: 40px;
  max-width: 40px;
  box-sizing: border-box;
}
.sticky-num {
  left: 40px;
  width: 52px;
  min-width: 52px;
  max-width: 52px;
  box-sizing: border-box;
}
.sticky-ico {
  left: 92px;
  width: 48px;
  min-width: 48px;
  max-width: 48px;
  box-sizing: border-box;
}
.sticky-status {
  left: 140px;
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  box-sizing: border-box;
  text-align: center;
}
.sticky-account {
  left: 196px;
  min-width: 200px;
  max-width: 300px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.55);
}
.admin-badge {
  display: inline-flex;
  min-width: 28px;
  padding: 2px 8px;
  justify-content: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--fb-ghost-bg, #374151);
  color: var(--fb-ghost-text, #e5e7eb);
}
.hidden-admin-cell {
  white-space: nowrap;
}
.hidden-admin-count {
  margin-left: 8px;
}
.btn-pay--sm {
  min-width: 56px;
  padding: 4px 8px;
  font-size: 11px;
}
.chk { width: 40px; min-width: 40px; max-width: 40px; text-align: center; box-sizing: border-box; }
.num { width: 52px; min-width: 52px; text-align: right; color: var(--fb-muted, #9ca3af); }
.ico { width: 48px; min-width: 48px; max-width: 48px; text-align: center; }
.star {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--fb-star-off, #4b5563);
  padding: 0;
}
.star.on { color: #fbbf24; }
.account-cell .name { color: var(--fb-link, #93c5fd); font-weight: 500; }
.linkish { color: var(--fb-link, #93c5fd); }
.sub { margin-top: 2px; }
.mono { font-family: ui-monospace, monospace; color: var(--fb-mono, #d1d5db); }
.small { font-size: 11px; }
.bm { min-width: 120px; }
.lock.policy { color: #f87171; font-weight: 500; }
.badge.warn { background: #78350f; color: #fcd34d; }
.token-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: var(--fb-surface-a, #111827);
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
}
.token-info { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.token-detail { font-size: 12px; }
.token-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.btn.sm { padding: 6px 12px; font-size: 12px; }
.btn.danger { background: #7f1d1d; color: #fecaca; }
.btn.danger:hover { background: #991b1b; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal-box {
  width: 420px;
  max-width: 92vw;
  padding: 20px;
  background: var(--fb-modal-bg, #1f2937);
  border-radius: 10px;
  border: 1px solid var(--fb-modal-border, #374151);
  color: var(--fb-modal-text, #e5e7eb);
}
.modal-box h3 { margin: 0 0 8px; font-size: 16px; }
.modal-box textarea {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-modal-text, #e5e7eb);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.empty {
  text-align: center;
  color: var(--fb-muted, #6b7280);
  padding: 28px 12px;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fb-muted, #6b7280);
}
.dot.on { background: #22c55e; }
.dot.off { background: #ef4444; }

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--fb-surface-a, #111827);
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  font-size: 13px;
}
.pager-info { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; color: var(--fb-muted, #9ca3af); }
.pager-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.pager-size select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--fb-pager-select-border, #4b5563);
  background: var(--fb-pager-select-bg, #0f172a);
  color: var(--fb-pager-select-text, #e5e7eb);
  font-size: 12px;
}
.pager-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pager-page { color: var(--fb-mono, #d1d5db); padding: 0 6px; }

.pay-cell { white-space: nowrap; }
.btn-pay {
  min-width: 72px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #3b82f6;
  background: #1e3a5f;
  color: #93c5fd;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-pay:disabled {
  opacity: 0.85;
  cursor: wait;
}
.btn-pay--empty,
.btn-pay--err {
  border-color: #4b5563;
  background: #1f2937;
  cursor: pointer;
  opacity: 1;
}
.btn-pay--empty { color: #9ca3af; }
.btn-pay--err { color: #f87171; border-color: #7f1d1d; }
.btn-pay--loading { cursor: wait; }

.pay-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(147, 197, 253, 0.35);
  border-top-color: #93c5fd;
  border-radius: 50%;
  animation: pay-spin-anim 0.65s linear infinite;
}
@keyframes pay-spin-anim {
  to {
    transform: rotate(360deg);
  }
}

.modal-box--wide {
  width: min(920px, 96vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.pay-hint { margin: 0 0 10px; line-height: 1.4; }
.pay-table-wrap {
  overflow: auto;
  max-height: min(520px, 60vh);
  border: 1px solid var(--fb-border, #374151);
  border-radius: 8px;
  background: var(--fb-surface-a, #111827);
}
.pay-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pay-table th,
.pay-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--fb-cell-border, #1f2937);
  vertical-align: top;
}
.pay-table th {
  background: var(--fb-th-bg, #0f172a);
  color: var(--fb-th-text, #9ca3af);
  position: sticky;
  top: 0;
  z-index: 1;
}
.pay-detail {
  max-width: 360px;
  word-break: break-word;
  color: var(--fb-mono, #cbd5e1);
}
</style>
