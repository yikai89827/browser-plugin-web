<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue';
import * as XLSX from 'xlsx';
import type { FbAdAccountRecord, FbAdAccountPaymentActivity } from '../../../interfaces/fbControl';
import {
  extensionConfigured,
  executeAdAccountBatchFromSite,
  fetchAccountsFromExtension,
  fetchAdAccountPaymentActivitiesFromExtension,
  fetchAdAccountAssignedUsersFromExtension,
  fetchAdAccountManageAdminsFromExtension,
  type AdAccountAssignedUserDetail,
  mergeAccountInExtension,
  syncSpendCapPatchesFromGraph,
  type SpendCapRecordPatch,
  renameAdAccountFromSite,
  fetchUsdExchangeRateFromExtension,
  syncAdAccountsFromGraphViaExtension,
  type AdAccountBatchResultRow,
  type FriendVerifyResultPayload,
} from '../lib/extensionBridge';
import {
  accountsGraphSyncRunning,
  markAccountsListFetched,
  registerAccountsGraphSync,
  unregisterAccountsGraphSync,
} from '../lib/accountListSyncHub';
import { fbControlLog } from '../../../utils/fbControlLog';
import {
  formatAccountKindLabelZh,
  formatOwnerRoleForTable,
  normalizeFundingDisplayString,
} from '../../../utils/fb/adAccount/adAccountDisplayMaps';
import {
  isPrepayAccount,
  resolveDailySpendLimitMinor,
  resolvePaymentThresholdMinor,
} from '../../../utils/fb/adAccount/accountSpendLimits';
import {
  resolveSpendCapMinorForRecord,
  type SpendCapNormalizeHints,
} from '../../../utils/fb/adAccount/spendCapCurrency';
import {
  effectiveUsdToAccountRate,
  fxRateSourceLabel,
  type FxRateSource,
} from '../../../utils/fb/adsPanel/currencyExchange';
import {
  formatMajorAmount,
  formatMinorAmount,
  formatMoneyDualFromMinor,
  type MoneyDisplay,
} from '../../../utils/fb/adAccount/moneyDisplay';
import BatchOperationDrawer from '../components/BatchOperationDrawer.vue';
import MoneyCellDisplay from '../components/MoneyCellDisplay.vue';
import { getBatchDrawerPreset } from '../lib/batchOperationPresets';
import type { BatchAccountPreviewRow, BatchDrawerSubmitPayload } from '../lib/batchOperationTypes';
import { showToastError } from '../lib/globalToast';

const COL_COUNT = 30;

/**
 * 广告账户管理页：通过扩展桥接读取 IndexedDB、Graph 同步与行内编辑。
 */
const accounts = ref<FbAdAccountRecord[]>([]);
const searchQuery = ref('');
const loading = ref(false);
const errorMsg = ref('');
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
/** 隐藏管理员加载失败原因（供 tooltip / 重试提示） */
const hiddenAdminErrors = reactive<Record<string, string>>({});
/** 隐藏管理员详情缓存（加载成功后供点击人数打开抽屉） */
const hiddenAdminDetailsCache = reactive<Record<string, AdAccountAssignedUserDetail[]>>({});
/** 1 USD = ? 账户币种（表格双行金额折算） */
const fxUsdToAccount = reactive<Record<string, number>>({});
/** 汇率来源（与 fxUsdToAccount 同键，供批量限额换算日志） */
const fxUsdToAccountSource = reactive<Record<string, string>>({});

/** 管理员 / 隐藏管理员详情抽屉 */
const adminDrawerOpen = ref(false);
const adminDrawerKind = ref<'manage' | 'hidden'>('manage');
const adminDrawerTitle = ref('');
const adminDrawerSubtitle = ref('');
const adminDrawerRows = ref<AdAccountAssignedUserDetail[]>([]);
const adminDrawerLoading = ref(false);
const adminDrawerError = ref('');

/** 行备注编辑 */
const remarkModalRow = ref<FbAdAccountRecord | null>(null);
const remarkDraft = ref('');

/** 行账号名称编辑 */
const nameModalRow = ref<FbAdAccountRecord | null>(null);
const nameDraft = ref('');
/** 改名弹窗：保存请求进行中（至 Graph + 写缓存结束） */
const nameModalSavePending = ref(false);

/** 「更多」下拉 */
const moreMenuOpen = ref(false);
const moreWrapRef = ref<HTMLElement | null>(null);

/** 右侧批量操作抽屉（UI 与选项见 BatchOperationDrawer + batchOperationPresets） */
const batchDrawerOpen = ref(false);
const batchDrawerKey = ref('');
const batchDrawerResults = ref<AdAccountBatchResultRow[]>([]);
const batchDrawerRunning = ref(false);
/** 好友预检返回的当前 Facebook 主页，用于结果卡「当前账号」兜底 */
const batchDrawerCurrentFbUrl = ref<string | null>(null);

const batchDrawerPreset = computed(() =>
  batchDrawerOpen.value && batchDrawerKey.value ? getBatchDrawerPreset(batchDrawerKey.value) : null
);

function payState(accountId: string): 'idle' | 'loading' | 'empty' | 'error' {
  return paymentUi[accountId] ?? 'idle';
}

function hiddenAdminState(accountId: string): 'idle' | 'loading' | 'error' {
  return hiddenAdminUi[accountId] ?? 'idle';
}

function statusOn(row: FbAdAccountRecord) {
  const s = (row.status || '').trim();
  const sl = s.toLowerCase();
  if (!s || s === '未知') return false;
  if (s.includes('活跃') || s.includes('可投放') || s.includes('运行')) return true;
  return sl.includes('active') || sl.includes('enabled') || s === '1';
}

/** 将行内可展示字段拼成一段小写文本，供关键词过滤 */
function haystack(row: FbAdAccountRecord): string {
  return Object.values(row)
    .filter((v) => v != null && typeof v !== 'object')
    .join(' ')
    .toLowerCase();
}

const advModalOpen = ref(false);
const committedAdvFilter = ref({
  accountIdsText: '',
  bmId: '',
  limitKind: 'any' as 'any' | 'unlimited' | 'limited',
  statusKind: 'any' as 'any' | 'active' | 'inactive',
});
const advDraft = reactive({
  accountIdsText: '',
  bmId: '',
  limitKind: 'any' as 'any' | 'unlimited' | 'limited',
  statusKind: 'any' as 'any' | 'active' | 'inactive',
});

function parseAccountIdSet(text: string): Set<string> {
  const set = new Set<string>();
  for (const part of text.split(/[\s,;\n\r]+/).filter(Boolean)) {
    const id = part.replace(/^act_/i, '').trim();
    if (id) set.add(id);
  }
  return set;
}

const advFilteredList = computed(() => {
  let list = accounts.value;
  const f = committedAdvFilter.value;
  const idSet = parseAccountIdSet(f.accountIdsText);
  if (idSet.size) {
    list = list.filter((r) => idSet.has(String(r.accountId).replace(/^act_/i, '')));
  }
  if (f.bmId.trim()) {
    const q = f.bmId.trim().toLowerCase();
    list = list.filter(
      (r) =>
        (r.belongsToBmId && r.belongsToBmId.toLowerCase().includes(q)) ||
        (r.createdFromBmId && r.createdFromBmId.toLowerCase().includes(q))
    );
  }
  if (f.limitKind === 'unlimited') {
    list = list.filter((r) => {
      if (r.spendCapMinor === 0 || resolvePaymentThresholdMinor(r) === 0) return true;
      const sl = r.spendingLimit;
      if (sl && String(sl).includes('不限')) return true;
      return !(r.spendCapMinor != null && r.spendCapMinor > 0);
    });
  } else if (f.limitKind === 'limited') {
    list = list.filter((r) => {
      if (r.spendCapMinor != null && r.spendCapMinor > 0) return true;
      if (r.minDailyBudgetMinor != null && r.minDailyBudgetMinor > 0) return true;
      return false;
    });
  }
  if (f.statusKind === 'active') list = list.filter((r) => statusOn(r));
  else if (f.statusKind === 'inactive') list = list.filter((r) => !statusOn(r));
  return list;
});

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return advFilteredList.value;
  return advFilteredList.value.filter((a) => haystack(a).includes(q));
});

type SortKey = string;

const sortCol = ref<SortKey | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');

function sortToggle(key: SortKey) {
  if (sortCol.value !== key) {
    sortCol.value = key;
    sortDir.value = 'asc';
  } else {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  }
  currentPage.value = 1;
}

function sortMark(key: SortKey): 'none' | 'asc' | 'desc' {
  if (sortCol.value !== key) return 'none';
  return sortDir.value;
}

function coalesceStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

function coalesceNum(v: unknown, alt = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return alt;
}

/** 从可能带货币符号的字符串中解析排序用数字，失败则返回 alt；「不限额」等视为极大值便于升序排在金额之后 */
function parseMoneyishForSort(raw: unknown, alt = -1e18): number {
  if (raw == null || raw === '') return alt;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  const s = String(raw).trim();
  if (!s || s === '—' || s === '-') return alt;
  if (/不限/.test(s)) return 1e18;
  const normalized = s.replace(/,/g, '');
  const cleaned = normalized.replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : alt;
}

function formatMoneyDisplayText(d: MoneyDisplay): string {
  return d.secondary ? `${d.primary} (${d.secondary})` : d.primary;
}

function moneySortValue(
  minor: number | null | undefined,
  d: MoneyDisplay
): number {
  if (typeof minor === 'number' && !Number.isNaN(minor)) return minor;
  if (d.primary === '不限额') return 1e18;
  return parseMoneyishForSort(d.primary);
}

function getSortableValue(row: FbAdAccountRecord, key: SortKey): string | number {
  switch (key) {
    case 'accountId': {
      const raw = String(row.accountId || '')
        .replace(/^act_/i, '')
        .trim();
      const n = Number(raw);
      return Number.isFinite(n) && raw !== '' ? n : coalesceStr(row.accountId);
    }
    case 'name':
      return coalesceStr(row.name);
    case 'status':
      return coalesceStr(row.status);
    case 'pushStatus':
      return coalesceStr(row.pushStatus);
    case 'adminCount':
      return coalesceNum(row.adminCount);
    case 'hiddenAdminCount':
      return coalesceNum(hiddenAdminCountEffective(row), -1e18);
    case 'accountKindLabel':
      return coalesceStr(formatAccountKindLabelZh(row.accountKindLabel));
    case 'billingMinor':
      return moneySortValue(row.billingAmountMinor ?? row.balanceMinor, billingAmountCell(row));
    case 'threshold':
      return moneySortValue(resolvePaymentThresholdMinor(row), thresholdCell(row));
    case 'dailyLimit':
      return moneySortValue(
        resolveDailySpendLimitMinor(row, fxRateForRow(row)),
        dailyLimitCell(row)
      );
    case 'totalSpent':
      return moneySortValue(row.totalSpentMinor, totalSpentCell(row));
    case 'spendingLimit':
      return moneySortValue(row.spendCapMinor, spendingLimitCell(row));
    case 'periodSpent':
      return parseMoneyishForSort(periodSpentCell(row).primary, -1e18);
    case 'balance':
      return moneySortValue(row.balanceMinor, balanceCell(row));
    case 'remark':
      return coalesceStr(row.remark);
    case 'currency':
      return coalesceStr(row.currency);
    case 'accountType':
      return coalesceStr(row.accountType);
    case 'ownerRole':
      return formatOwnerRoleForTable(row).toLowerCase();
    case 'paymentMethod':
      return coalesceStr(paymentMethodCell(row));
    case 'billingPeriod': {
      const s = row.billingPeriod;
      if (s == null || s === '') return -1e18;
      const d = new Date(String(s));
      const t = d.getTime();
      return Number.isNaN(t) ? -1e17 : t;
    }
    case 'lockReason':
      return coalesceStr(row.lockReason);
    case 'createdDate':
      return coalesceStr(row.createdDate);
    case 'timezone':
      return coalesceStr(row.timezone);
    case 'originalId':
      return coalesceStr(row.originalId);
    case 'createdFromBmName':
      return coalesceStr(row.createdFromBmName);
    case 'belongsToBmName':
      return coalesceStr(row.belongsToBmName);
    case 'countryCode':
      return coalesceStr(row.countryCode);
    case 'capturedAt':
      return row.capturedAt || 0;
    case 'favorite':
      return row.favorite ? 1 : 0;
    default:
      return '';
  }
}

function compareRowsBySortKey(a: FbAdAccountRecord, b: FbAdAccountRecord, key: SortKey, dir: 1 | -1): number {
  const va = getSortableValue(a, key);
  const vb = getSortableValue(b, key);
  if (typeof va === 'number' && typeof vb === 'number') {
    if (Object.is(va, vb)) return 0;
    return va < vb ? -dir : dir;
  }
  const sa = String(va);
  const sb = String(vb);
  const cmp = sa.localeCompare(sb, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  if (cmp === 0) return 0;
  return cmp > 0 ? dir : -dir;
}

const sortedFiltered = computed(() => {
  const list = [...filtered.value];
  const key = sortCol.value;
  if (!key) return list;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const primary = compareRowsBySortKey(a, b, key, dir);
    if (primary !== 0) return primary;
    return String(a.accountId).localeCompare(String(b.accountId), undefined, { numeric: true });
  });
  return list;
});

const totalPages = computed(() => {
  const n = sortedFiltered.value.length;
  return Math.max(1, Math.ceil(n / pageSize.value) || 1);
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedFiltered.value.slice(start, start + pageSize.value);
});

watch(
  () =>
    `${searchQuery.value}\t${committedAdvFilter.value.accountIdsText}\t${committedAdvFilter.value.bmId}\t${committedAdvFilter.value.limitKind}\t${committedAdvFilter.value.statusKind}`,
  () => {
    currentPage.value = 1;
  }
);

watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

watch(pageSize, () => {
  currentPage.value = 1;
});

const selectedCount = computed(
  () => sortedFiltered.value.filter((r) => selectedIds.value[r.accountId]).length
);

const selectedAccountIds = computed(() =>
  sortedFiltered.value.filter((r) => selectedIds.value[r.accountId]).map((r) => r.accountId)
);

const batchDrawerAccountRows = computed((): BatchAccountPreviewRow[] => {
  const idSet = new Set(selectedAccountIds.value);
  return sortedFiltered.value
    .filter((r) => idSet.has(r.accountId))
    .map((r) => ({
      accountId: r.accountId,
      name: r.name,
      currency: r.currency,
      timezone: r.timezone,
      belongsToBmId: r.belongsToBmId,
      spendCapMinor: resolveSpendCapMinorForRecord(r) ?? r.spendCapMinor,
      balanceMinor: r.balanceMinor,
      totalSpentMinor: r.totalSpentMinor,
      spendingLimit: r.spendingLimit,
      balance: r.balance,
    }));
});

function toggleRowSelected(accountId: string) {
  selectedIds.value = {
    ...selectedIds.value,
    [accountId]: !selectedIds.value[accountId],
  };
}

function toggleSelectAll(checked: boolean) {
  const next: Record<string, boolean> = { ...selectedIds.value };
  for (const row of sortedFiltered.value) {
    next[row.accountId] = checked;
  }
  selectedIds.value = next;
}

const allFilteredSelected = computed(() => {
  if (!sortedFiltered.value.length) return false;
  return sortedFiltered.value.every((r) => selectedIds.value[r.accountId]);
});

function rowSerial(idx: number): number {
  return (currentPage.value - 1) * pageSize.value + idx + 1;
}

/** 表格数据单元格悬停说明（浏览器原生 title 气泡） */
function tipChkCell(): string {
  return '勾选：选中本广告账户后，可使用筛选栏右侧的批量操作（授权、BM、限额、推送、导出 Excel 等）。未勾选时批量按钮不可用。';
}

function tipSerialCell(idx: number): string {
  return `序号：在「搜索 + 高级筛选 + 列排序」后的结果中，按当前每页条数分页显示的行号。\n当前值：${rowSerial(idx)}`;
}

function tipFavoriteCell(row: FbAdAccountRecord): string {
  const s = row.favorite ? '已收藏' : '未收藏';
  return `收藏：标记常用账户，仅写入扩展本地 IndexedDB，与 Facebook 后台无关。\n当前：${s}。点击星形可切换。`;
}

function tipStatusCell(row: FbAdAccountRecord): string {
  const on = statusOn(row);
  return `状态：根据账户状态字段粗判可投放/活跃（绿）与受限或未启用（红），仅供参考，以广告管理后台为准。\n当前：${on ? '判断为正常/可投放倾向' : '判断为受限或未启用倾向'}`;
}

function tipAccountCell(row: FbAdAccountRecord): string {
  return [
    '账号：广告账户显示名称与数字 ID（通常对应 act_）。',
    '名称旁「✎」可修改本地展示名称（合并到扩展 IndexedDB）；与 Graph 同步后的名称冲突时以实际同步结果为准。',
    `当前名称：${dash(row.name)}`,
    `当前 ID：${dash(row.accountId)}`,
  ].join('\n');
}

function tipPushStatusCell(row: FbAdAccountRecord): string {
  return `推送状态：与业务侧「是否已推送/同步」相关的标记（若扩展未采集该字段则显示为 —）。\n当前值：${dash(row.pushStatus)}`;
}

function tipAdminCell(row: FbAdAccountRecord): string {
  const clickHint = adminCountNumber(row) > 0 ? '；点击数字可查看详情' : '';
  return [
    '管理员：广告账户协作者中，除您以外具备 MANAGE（管理）权限的人数。',
    '与「隐藏管理员」不重复：有 MANAGE 的他人只计入本列。',
    clickHint,
    `当前值：${adminBadgeText(row)}`,
  ].join('\n');
}

function hiddenAdminAccountLabel(row: FbAdAccountRecord): string {
  const name = (row.name || '').trim();
  return name ? `${name}（${row.accountId}）` : row.accountId;
}

function formatHiddenAdminFailureToast(
  failures: { row: FbAdAccountRecord; error: string }[]
): string {
  if (!failures.length) return '隐藏管理员加载失败';
  if (failures.length === 1) {
    const f = failures[0];
    return `隐藏管理员加载失败：${hiddenAdminAccountLabel(f.row)}\n${f.error}`;
  }
  const lines = failures.map((f) => `· ${hiddenAdminAccountLabel(f.row)}：${f.error}`);
  return `隐藏管理员加载失败（${failures.length} 个账户）：\n${lines.join('\n')}`;
}

function tipHiddenAdminCell(row: FbAdAccountRecord): string {
  const eff = hiddenAdminCountEffective(row);
  const n = eff != null ? String(eff) : '未加载';
  const clickHint = eff != null && eff > 0 ? '；点击人数可查看详情' : '';
  const err = hiddenAdminErrors[row.accountId];
  const errLine = err ? `上次失败：${err}` : '';
  return [
    '隐藏管理员：已分配协作者中无 MANAGE 权限的人员（不含您本人）；有 MANAGE 的他人只计入「管理员」列。',
    '「加载」后写入计数；若管理员≥1 且无仅投广协作者，本列应为 0。',
    clickHint,
    `当前计数：${n}`,
    errLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function tipAccountKindCell(row: FbAdAccountRecord): string {
  return `账号类型：如企业/个人等业务分类（来自采集字段）。\n当前值：${dash(formatAccountKindLabelZh(row.accountKindLabel))}`;
}

function tipBillingCell(row: FbAdAccountRecord): string {
  return `账单金额：与账单/余额相关的展示金额（可能为最小货币单位换算，与币种列一致）。\n当前值：${formatMoneyDisplayText(billingAmountCell(row))}`;
}

function tipThresholdCell(row: FbAdAccountRecord): string {
  const kind = isPrepayAccount(row) ? '预付账户无付款门槛，固定显示 0' : '后付费：Graph min_campaign_group_spend_cap；0=不限额';
  return `门槛：${kind}。\n当前值：${formatMoneyDisplayText(thresholdCell(row))}`;
}

function tipDailyLimitCell(row: FbAdAccountRecord): string {
  return `日限额：Graph min_daily_budget；非 USD 且低于约 $50 时按 Meta 默认日花费上限 $50 等值展示。\n当前值：${formatMoneyDisplayText(dailyLimitCell(row))}`;
}

function tipTotalSpentCell(row: FbAdAccountRecord): string {
  return `总花费：账户历史或汇总维度的花费展示（与 Graph 字段映射有关）。\n当前值：${formatMoneyDisplayText(totalSpentCell(row))}`;
}

function tipSpendingLimitCell(row: FbAdAccountRecord): string {
  return `花费限额：账户花费上限（0=不限额）。批量「设置限额」会写入 Meta 并更新本列。\n当前值：${formatMoneyDisplayText(spendingLimitCell(row))}`;
}

function tipPeriodSpentCell(row: FbAdAccountRecord): string {
  return `已花费：当前账单周期或统计周期内已产生花费。\n当前值：${formatMoneyDisplayText(periodSpentCell(row))}`;
}

function tipBalanceCell(row: FbAdAccountRecord): string {
  return `余额：账户可用余额或预付余额类展示（含币种）。\n当前值：${formatMoneyDisplayText(balanceCell(row))}`;
}

function tipRemarkCell(row: FbAdAccountRecord): string {
  return [
    '备注：本地备注文本，仅保存在扩展 IndexedDB，不会直接修改 Facebook。',
    `当前值：${dash(row.remark)}`,
  ].join('\n');
}

function tipCurrencyCell(row: FbAdAccountRecord): string {
  return `币种：金额列换算与符号所依据的货币代码（如 USD）。\n当前值：${dash(row.currency)}`;
}

function tipAccountTypeCell(row: FbAdAccountRecord): string {
  return `账户类型：如预付/后付等计费类型（来自 Graph/扩展字段）。\n当前值：${dash(row.accountType)}`;
}

function tipOwnerRoleCell(row: FbAdAccountRecord): string {
  return `所有者角色：当前 token 或业务映射下的账户角色说明（便于区分管理员/广告主等）。\n当前值：${formatOwnerRoleForTable(row)}`;
}

function tipPaymentMethodCell(row: FbAdAccountRecord): string {
  return `支付方法：账户绑定的付款方式摘要（卡、PayPal 等，以实际采集为准）。\n当前值：${dash(paymentMethodCell(row))}`;
}

function tipBillingPeriodCell(row: FbAdAccountRecord): string {
  return `账单期：当前或最近账单统计周期（常显示为日期）。\n当前值：${formatBillingPeriodDisplay(row.billingPeriod)}`;
}

function tipLockReasonCell(row: FbAdAccountRecord): string {
  return `锁定原因：账户被限制、审核或政策相关时的说明文案（无则显示 —）。\n当前值：${dash(row.lockReason)}`;
}

function tipCreatedDateCell(row: FbAdAccountRecord): string {
  return `创建日期：广告账户在 Meta 侧创建日期或扩展同步字段。\n当前值：${dash(row.createdDate)}`;
}

function tipTimezoneCell(row: FbAdAccountRecord): string {
  return `时区：账户所用时区标识，用于理解日切与报表时间。\n当前值：${dash(row.timezone)}`;
}

function tipOriginalIdCell(row: FbAdAccountRecord): string {
  return `原始 ID：Graph 或业务系统中的原始标识（与列表主 ID 可能不同）。\n当前值：${dash(row.originalId)}`;
}

function tipCreatedBmCell(row: FbAdAccountRecord): string {
  return [
    '创建自 BM：创建该广告账户时所处 Business Manager 名称与 ID。',
    `名称：${dash(row.createdFromBmName)}`,
    `ID：${dash(row.createdFromBmId) || '—'}`,
  ].join('\n');
}

function tipBelongsBmCell(row: FbAdAccountRecord): string {
  return [
    '所属 BM：该账户当前归属的 Business Manager 名称与 ID。',
    `名称：${dash(row.belongsToBmName)}`,
    `ID：${dash(row.belongsToBmId) || '—'}`,
  ].join('\n');
}

function tipCountryCell(row: FbAdAccountRecord): string {
  return `国家编码：账户关联国家/地区代码（如 US）。\n当前值：${dash(row.countryCode)}`;
}

function tipPayActionCell(row: FbAdAccountRecord): string {
  const st = payState(row.accountId);
  const base =
    '支付记录：通过扩展读取 token 后，向 Graph 查询与计费/支付相关的活动；成功则弹窗列表，空/失败可点击重试。';
  if (st === 'loading') return `${base}\n状态：正在查询…`;
  if (st === 'empty') return `${base}\n状态：暂无计费/支付类活动或权限不足。点击按钮可重试。`;
  if (st === 'error') return `${base}\n状态：上次请求失败。点击按钮重试。`;
  return `${base}\n状态：尚未查询，点击「加载」开始。`;
}

function closePaymentModal() {
  paymentModalOpen.value = false;
  paymentModalRows.value = [];
  paymentModalHint.value = '';
  paymentModalTitle.value = '';
}

async function onLoadPaymentRecords(row: FbAdAccountRecord) {
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
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

/** 表格展示用：优先用本次会话内最新查询结果，避免 IndexedDB 旧值仍为 1 */
function hiddenAdminCountEffective(row: FbAdAccountRecord): number | null {
  if (row.hiddenAdminCount == null) return null;
  if (Object.prototype.hasOwnProperty.call(hiddenAdminDetailsCache, row.accountId)) {
    return hiddenAdminDetailsCache[row.accountId].length;
  }
  return row.hiddenAdminCount;
}

async function applyHiddenAdminQueryResult(
  row: FbAdAccountRecord,
  items: AdAccountAssignedUserDetail[]
) {
  hiddenAdminDetailsCache[row.accountId] = items;
  row.hiddenAdminCount = items.length;
  try {
    await mergeAccountInExtension({ accountId: row.accountId, hiddenAdminCount: items.length });
  } catch {
    /* 展示以行内与缓存为准 */
  }
}

function clearHiddenAdminSessionState() {
  for (const k of Object.keys(hiddenAdminDetailsCache)) {
    delete hiddenAdminDetailsCache[k];
  }
  for (const k of Object.keys(hiddenAdminUi)) {
    delete hiddenAdminUi[k];
  }
  for (const k of Object.keys(hiddenAdminErrors)) {
    delete hiddenAdminErrors[k];
  }
}

async function onLoadHiddenAdmins(
  row: FbAdAccountRecord,
  opts?: { suppressToast?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (!extensionConfigured()) {
    const err = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    errorMsg.value = err;
    if (!opts?.suppressToast) {
      showToastError(formatHiddenAdminFailureToast([{ row, error: err }]));
    }
    return { ok: false, error: err };
  }
  hiddenAdminUi[row.accountId] = 'loading';
  delete hiddenAdminErrors[row.accountId];
  try {
    const res = await fetchAdAccountAssignedUsersFromExtension(row.accountId, hintBmIdsForRow(row));
    if (!res.success) {
      const msg = res.error || '未知错误';
      hiddenAdminUi[row.accountId] = 'error';
      hiddenAdminErrors[row.accountId] = msg;
      if (!opts?.suppressToast) {
        showToastError(formatHiddenAdminFailureToast([{ row, error: msg }]));
      }
      return { ok: false, error: msg };
    }
    await applyHiddenAdminQueryResult(row, res.payload?.items ?? []);
    delete hiddenAdminUi[row.accountId];
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    hiddenAdminUi[row.accountId] = 'error';
    hiddenAdminErrors[row.accountId] = msg;
    if (!opts?.suppressToast) {
      showToastError(formatHiddenAdminFailureToast([{ row, error: msg }]));
    }
    return { ok: false, error: msg };
  }
}

/** 工具栏「隐藏管理员」：对勾选账户直接拉取隐藏管理员人数，不打开批量抽屉 */
async function batchLoadHiddenAdminsForSelection() {
  if (!extensionConfigured()) {
    const err = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    errorMsg.value = err;
    showToastError(err);
    return;
  }
  const rows = sortedFiltered.value.filter((r) => selectedIds.value[r.accountId]);
  if (!rows.length) return;
  errorMsg.value = '';
  const failures: { row: FbAdAccountRecord; error: string }[] = [];
  await Promise.all(
    rows.map(async (row) => {
      const r = await onLoadHiddenAdmins(row, { suppressToast: true });
      if (!r.ok && r.error) failures.push({ row, error: r.error });
    })
  );
  if (failures.length) {
    showToastError(formatHiddenAdminFailureToast(failures));
  }
}

function onHiddenAdminClick(row: FbAdAccountRecord) {
  if (hiddenAdminState(row.accountId) === 'loading') return;
  if (hiddenAdminState(row.accountId) === 'error') {
    delete hiddenAdminUi[row.accountId];
    delete hiddenAdminErrors[row.accountId];
  }
  void onLoadHiddenAdmins(row);
}

function applySpendCapPatchesToAccounts(patches: SpendCapRecordPatch[]) {
  for (const p of patches) {
    const i = accounts.value.findIndex((a) => a.accountId === p.accountId);
    if (i < 0) continue;
    const row = accounts.value[i];
    accounts.value[i] = {
      ...row,
      spendCapMinor: p.spendCapMinor,
      paymentThresholdMinor: p.paymentThresholdMinor,
      spendingLimit: p.spendingLimit,
      ...(p.currency ? { currency: p.currency } : {}),
    };
  }
}

async function refreshFromExtension() {
  errorMsg.value = '';
  loading.value = true;
  fbControlLog('site:account-page', '从扩展拉取账户列表');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID，并确保 manifest 中 externally_connectable 包含本站点');
    }
    const res = await fetchAccountsFromExtension();
    if (!res.success) throw new Error(res.error || '读取失败');
    accounts.value = [...(res.payload?.list || [])].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    markAccountsListFetched();
    fbControlLog('site:account-page', '账户列表已更新', { count: accounts.value.length });
    clearHiddenAdminSessionState();
    void prefetchFxRates(accounts.value);
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

function paymentMethodCell(row: FbAdAccountRecord): string {
  const raw = row.paymentMethod;
  if (raw == null || !String(raw).trim()) return '';
  return normalizeFundingDisplayString(String(raw));
}

/** 纯数字字符串按「最小单位」解析；否则原样加符号（若能识别为数字） */
function formatMoneyishRaw(raw: string | undefined, currency?: string): string {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  if (!s || s === '—') return '—';
  if (s.includes('不限')) return s;
  if (/^-?\d+$/.test(s)) {
    const minor = parseInt(s, 10);
    if (!Number.isNaN(minor)) return formatMinorAmount(minor, currency);
  }
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isNaN(n) && /^-?[\d.]+$/.test(cleaned)) {
    return formatMajorAmount(n, currency);
  }
  return s;
}

function fxRateForRow(row: FbAdAccountRecord): number | null {
  const ccy = (row.currency || 'USD').trim().toUpperCase();
  if (ccy === 'USD') return 1;
  const r = fxUsdToAccount[ccy];
  return effectiveUsdToAccountRate(r);
}

async function ensureFxRate(currency?: string): Promise<number | null> {
  const ccy = (currency || 'USD').trim().toUpperCase();
  if (ccy === 'USD') return 1;
  if (fxUsdToAccount[ccy] != null) return fxUsdToAccount[ccy];
  if (!extensionConfigured()) return null;
  try {
    const res = await fetchUsdExchangeRateFromExtension(ccy);
    if (res.success && res.payload?.rate != null && res.payload.rate > 0) {
      fxUsdToAccount[ccy] = res.payload.rate;
      if (res.payload.source) fxUsdToAccountSource[ccy] = res.payload.source;
      const src = res.payload.source as FxRateSource | undefined;
      console.info('[fbControl:site:fx] 汇率已就绪（账户管理页）', {
        currency: ccy,
        source: src ?? 'unknown',
        sourceLabel: src ? fxRateSourceLabel(src) : '未知',
        rawRate: res.payload.rate,
        effectiveRate: res.payload.effectiveRate ?? effectiveUsdToAccountRate(res.payload.rate),
      });
      return res.payload.rate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function prefetchFxRates(rows: FbAdAccountRecord[]) {
  const ccys = [
    ...new Set(
      rows
        .map((r) => (r.currency || '').trim().toUpperCase())
        .filter((c) => c && c !== 'USD')
    ),
  ];
  await Promise.all(ccys.map((c) => ensureFxRate(c)));
}

function legacyMoneyDisplay(row: FbAdAccountRecord, text: string): MoneyDisplay {
  if (!text || text === '—' || text.includes('不限')) return { primary: text || '—' };
  const ccy = (row.currency || 'USD').trim().toUpperCase();
  if (ccy === 'USD') return { primary: text };
  const rate = fxRateForRow(row);
  if (rate == null || rate <= 0) return { primary: text };
  const cleaned = text.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const major = parseFloat(cleaned);
  if (!Number.isFinite(major)) return { primary: text };
  const eff = effectiveUsdToAccountRate(rate);
  if (eff == null) return { primary: text };
  const usdMajor = major / eff;
  return { primary: text, secondary: formatMajorAmount(usdMajor, 'USD') };
}

function totalSpentCell(row: FbAdAccountRecord): MoneyDisplay {
  if (row.totalSpentMinor != null) return moneyCell(row, row.totalSpentMinor);
  if (row.totalSpent !== undefined && row.totalSpent !== '') {
    const text =
      typeof row.totalSpent === 'number'
        ? formatMajorAmount(row.totalSpent, row.currency)
        : formatMoneyishRaw(String(row.totalSpent), row.currency);
    return legacyMoneyDisplay(row, text);
  }
  if (row.paymentAmount) {
    return legacyMoneyDisplay(row, formatMoneyishRaw(String(row.paymentAmount), row.currency));
  }
  if (row.spend != null) {
    return legacyMoneyDisplay(row, formatMajorAmount(row.spend, row.currency));
  }
  return { primary: '—' };
}

function balanceCell(row: FbAdAccountRecord): MoneyDisplay {
  if (row.balanceMinor != null) return moneyCell(row, row.balanceMinor);
  return legacyMoneyDisplay(row, formatMoneyishRaw(row.balance, row.currency));
}

function billingAmountCell(row: FbAdAccountRecord): MoneyDisplay {
  const m = row.billingAmountMinor ?? row.balanceMinor;
  if (m != null) return moneyCell(row, m);
  return legacyMoneyDisplay(row, formatMoneyishRaw(row.balance, row.currency));
}

function moneyCell(row: FbAdAccountRecord, minor: number | null | undefined, opts?: { unlimitedZero?: boolean }): MoneyDisplay {
  return formatMoneyDualFromMinor(minor, row, fxRateForRow(row), opts);
}

function thresholdCell(row: FbAdAccountRecord): MoneyDisplay {
  const m = resolvePaymentThresholdMinor(row);
  if (m == null) return { primary: '—' };
  if (m === 0) {
    if (isPrepayAccount(row)) return moneyCell(row, 0);
    return moneyCell(row, 0, { unlimitedZero: true });
  }
  return moneyCell(row, m);
}

function dailyLimitCell(row: FbAdAccountRecord): MoneyDisplay {
  const m = resolveDailySpendLimitMinor(row, fxRateForRow(row));
  if (m != null && m > 0) return moneyCell(row, m);
  return { primary: '—' };
}

function spendingLimitCell(row: FbAdAccountRecord): MoneyDisplay {
  const minor = resolveSpendCapMinorForRecord(row);
  if (minor === 0) return { primary: '不限额' };
  if (minor != null && minor > 0) return moneyCell(row, minor, { unlimitedZero: true });
  return { primary: '—' };
}

function periodSpentCell(row: FbAdAccountRecord): MoneyDisplay {
  const s = row.periodSpent;
  if (!s) return { primary: '—' };
  return legacyMoneyDisplay(row, formatMoneyishRaw(String(s), row.currency));
}

function adminBadgeText(row: FbAdAccountRecord) {
  const n = row.adminCount;
  if (n == null || Number.isNaN(Number(n))) return '0';
  return String(Math.max(0, Math.floor(Number(n))));
}

function hiddenAdminBadgeText(row: FbAdAccountRecord): string {
  const eff = hiddenAdminCountEffective(row);
  if (eff == null) return '0';
  return String(Math.max(0, Math.floor(eff)));
}

function adminCountNumber(row: FbAdAccountRecord): number {
  const n = row.adminCount;
  if (n == null || Number.isNaN(Number(n))) return 0;
  return Math.max(0, Math.floor(Number(n)));
}

function hintBmIdsForRow(row: FbAdAccountRecord): string[] {
  return [row.belongsToBmId, row.createdFromBmId].filter(
    (id): id is string => typeof id === 'string' && /^\d{5,}$/.test(id.trim())
  );
}

function formatAssignedUserTasks(tasks: string[]): string {
  if (!tasks.length) return '—';
  return tasks.join(', ');
}

type AdminDrawerField = {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
  title?: string;
};

function adminDrawerCardTitle(ar: AdAccountAssignedUserDetail, index: number): string {
  const name = ar.name?.trim();
  if (name) return name;
  return `协作者 ${index + 1}`;
}

function formatAdminDrawerFacebookUid(ar: AdAccountAssignedUserDetail): string {
  if (ar.facebookUserId?.trim()) return ar.facebookUserId.trim();
  return '—';
}

function adminDrawerFields(ar: AdAccountAssignedUserDetail): AdminDrawerField[] {
  const uidMissing = !ar.facebookUserId?.trim();
  return [
    { label: '名称', value: dash(ar.name) },
    {
      label: '商务用户 ID',
      value: dash(ar.assignedUserId),
      mono: true,
      title:
        'BM 协作者编号，来自 assigned_users 的 id，用于 Graph 授权/删除；与邮箱一致时即表示编号正确。',
    },
    {
      label: 'Facebook UID',
      value: formatAdminDrawerFacebookUid(ar),
      mono: true,
      title: uidMissing
        ? '个人主页数字编号。Meta 未返回 user{id} 时无法显示，不影响按商务用户 ID 操作。'
        : '个人 Facebook 主页数字编号（非商务用户 ID）。',
    },
    { label: '邮箱', value: dash(ar.email) },
    { label: '权限', value: formatAssignedUserTasks(ar.tasks), full: true },
  ];
}

function closeAdminDrawer() {
  adminDrawerOpen.value = false;
  adminDrawerKind.value = 'manage';
  adminDrawerTitle.value = '';
  adminDrawerSubtitle.value = '';
  adminDrawerRows.value = [];
  adminDrawerLoading.value = false;
  adminDrawerError.value = '';
}

function openAdminDrawerShell(kind: 'manage' | 'hidden', title: string, subtitle: string) {
  adminDrawerKind.value = kind;
  adminDrawerTitle.value = title;
  adminDrawerSubtitle.value = subtitle;
  adminDrawerRows.value = [];
  adminDrawerError.value = '';
  adminDrawerLoading.value = true;
  adminDrawerOpen.value = true;
}

function adminDrawerEmptyText(): string {
  if (adminDrawerKind.value === 'hidden') {
    return '暂无隐藏管理员（无 MANAGE 的协作者），或当前 token 无读取权限。';
  }
  return '暂无其他 MANAGE 管理员，或当前 token 无读取权限。';
}

async function onAdminCountClick(row: FbAdAccountRecord) {
  const n = adminCountNumber(row);
  if (n <= 0) return;
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }
  openAdminDrawerShell(
    'manage',
    '管理员详情',
    `${row.name}（${row.accountId}） · 其他具备 MANAGE 的协作者`
  );
  try {
    const res = await fetchAdAccountManageAdminsFromExtension(row.accountId, hintBmIdsForRow(row));
    if (!res.success) {
      adminDrawerError.value = res.error || '查询失败';
      return;
    }
    adminDrawerRows.value = res.payload?.items ?? [];
  } catch (e: unknown) {
    adminDrawerError.value = e instanceof Error ? e.message : String(e);
  } finally {
    adminDrawerLoading.value = false;
  }
}

async function onHiddenAdminCountClick(row: FbAdAccountRecord) {
  const n = hiddenAdminCountEffective(row);
  if (n == null || n <= 0) return;
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }
  openAdminDrawerShell(
    'hidden',
    '隐藏管理员详情',
    `${row.name}（${row.accountId}） · 无 MANAGE 的协作者（不含您本人）`
  );
  try {
    const res = await fetchAdAccountAssignedUsersFromExtension(row.accountId, hintBmIdsForRow(row));
    if (!res.success) {
      adminDrawerError.value = res.error || '查询失败';
      return;
    }
    const items = res.payload?.items ?? [];
    await applyHiddenAdminQueryResult(row, items);
    adminDrawerRows.value = items;
  } catch (e: unknown) {
    adminDrawerError.value = e instanceof Error ? e.message : String(e);
  } finally {
    adminDrawerLoading.value = false;
  }
}

async function syncFromGraph() {
  errorMsg.value = '';
  loading.value = true;
  fbControlLog('site:account-page', '请求扩展执行 Graph 同步');
  try {
    if (!extensionConfigured()) {
      throw new Error('请在 site/.env.development 中配置 VITE_EXTENSION_ID');
    }
    const res = await syncAdAccountsFromGraphViaExtension();
    if (!res.success) throw new Error(res.error || 'Graph 同步失败');
    fbControlLog('site:account-page', 'Graph 同步成功，刷新列表');
    /** 扩展侧 IndexedDB 写入完成后，再拉全量列表，避免表格仍显示同步前缓存 */
    clearHiddenAdminSessionState();
    await refreshFromExtension();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  } finally {
    loading.value = false;
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

function formatBillingPeriodDisplay(v?: string) {
  if (!v) return '—';
  const s = String(v).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function openRemarkModal(row: FbAdAccountRecord) {
  remarkModalRow.value = row;
  remarkDraft.value = (row.remark && String(row.remark)) || '';
}

function closeRemarkModal() {
  remarkModalRow.value = null;
  remarkDraft.value = '';
}

async function saveRemarkModal() {
  if (!remarkModalRow.value) return;
  const row = remarkModalRow.value;
  errorMsg.value = '';
  try {
    const text = remarkDraft.value.trim();
    await mergeAccountInExtension({ accountId: row.accountId, remark: text });
    row.remark = text || undefined;
    closeRemarkModal();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
  }
}

function openAdvFilterModal() {
  advDraft.accountIdsText = committedAdvFilter.value.accountIdsText;
  advDraft.bmId = committedAdvFilter.value.bmId;
  advDraft.limitKind = committedAdvFilter.value.limitKind;
  advDraft.statusKind = committedAdvFilter.value.statusKind;
  advModalOpen.value = true;
}

function applyAdvFilterFromModal() {
  committedAdvFilter.value = {
    accountIdsText: advDraft.accountIdsText.trim(),
    bmId: advDraft.bmId.trim(),
    limitKind: advDraft.limitKind,
    statusKind: advDraft.statusKind,
  };
  advModalOpen.value = false;
  currentPage.value = 1;
}

function resetAdvFilterInsideModal() {
  advDraft.accountIdsText = '';
  advDraft.bmId = '';
  advDraft.limitKind = 'any';
  advDraft.statusKind = 'any';
}

function openBatchDrawer(key: string) {
  if (!selectedCount.value) return;
  moreMenuOpen.value = false;
  batchDrawerResults.value = [];
  batchDrawerCurrentFbUrl.value = null;
  batchDrawerRunning.value = false;
  batchDrawerKey.value = key;
  batchDrawerOpen.value = true;
  if (key === 'setLimit' || key === 'resetLimit') {
    const rows = accounts.value.filter((a) => selectedAccountIds.value.includes(a.accountId));
    void prefetchFxRates(rows);
  }
}

function onDocumentClickCloseMore(e: MouseEvent) {
  if (!moreMenuOpen.value) return;
  const root = moreWrapRef.value;
  if (root && !root.contains(e.target as Node)) {
    moreMenuOpen.value = false;
  }
}

function onMoreMenuPick(action: string) {
  moreMenuOpen.value = false;
  if (!selectedCount.value) {
    errorMsg.value = '请先在表格中勾选至少一条账户';
    return;
  }
  if (action === 'exportExcel') {
    errorMsg.value = '';
    exportAccountsToExcel();
    return;
  }
  openBatchDrawer(action);
}

function openRenameModal(row: FbAdAccountRecord) {
  nameModalSavePending.value = false;
  nameModalRow.value = row;
  nameDraft.value = (row.name && String(row.name)) || '';
}

function closeRenameModal() {
  if (nameModalSavePending.value) return;
  nameModalRow.value = null;
  nameDraft.value = '';
}

function dismissPageAlert() {
  errorMsg.value = '';
}

async function saveRenameModal() {
  if (!nameModalRow.value) return;
  const row = nameModalRow.value;
  const name = nameDraft.value.trim();
  if (!name) {
    errorMsg.value = '名称不能为空';
    return;
  }
  errorMsg.value = '';
  nameModalSavePending.value = true;
  try {
    await renameAdAccountFromSite(row.accountId, name);
    await mergeAccountInExtension({ accountId: row.accountId, name });
    row.name = name;
    nameModalRow.value = null;
    nameDraft.value = '';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToastError(`重命名失败：${msg}`);
    errorMsg.value = msg;
  } finally {
    nameModalSavePending.value = false;
  }
}

/** Excel 列宽估算：全角/CJK 记 2，ASCII 记 1（与 Excel 默认列宽习惯接近） */
function excelColWidthUnits(v: unknown): number {
  const s = String(v ?? '');
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x4e00 && c <= 0x9fff) n += 2;
    else if (c > 127) n += 2;
    else n += 1;
  }
  return n;
}

/** 表头与各数据行同列取最大显示宽度后写入工作表 !cols */
function applyExcelColumnWidths(ws: import('xlsx').WorkSheet, dataRows: Record<string, unknown>[]) {
  if (!dataRows.length) return;
  const keys = Object.keys(dataRows[0]);
  ws['!cols'] = keys.map((key) => {
    let wch = excelColWidthUnits(key);
    for (const row of dataRows) {
      wch = Math.max(wch, excelColWidthUnits(row[key]));
    }
    return { wch: Math.min(Math.max(wch + 1, 6), 80) };
  });
}

/** 导出当前勾选、且在当前筛选+排序结果中的行为 .xlsx（与表格列一致） */
function exportAccountsToExcel() {
  const ids = selectedIds.value;
  const list = sortedFiltered.value.filter((row) => ids[row.accountId]);
  if (!list.length) {
    errorMsg.value = '没有可导出的数据';
    return;
  }
  const rows = list.map((row, i) => ({
    序号: i + 1,
    收藏: row.favorite ? '是' : '否',
    状态: row.status ?? '',
    账号名称: row.name ?? '',
    账号ID: row.accountId ?? '',
    推送状态: row.pushStatus ?? '',
    管理员: row.adminCount ?? 0,
    隐藏管理员人数: row.hiddenAdminCount ?? '',
    账号类型: formatAccountKindLabelZh(row.accountKindLabel) || row.accountKindLabel || '',
    账单金额: formatMoneyDisplayText(billingAmountCell(row)),
    门槛: formatMoneyDisplayText(thresholdCell(row)),
    日限额: formatMoneyDisplayText(dailyLimitCell(row)),
    总花费: formatMoneyDisplayText(totalSpentCell(row)),
    花费限额: formatMoneyDisplayText(spendingLimitCell(row)),
    已花费: formatMoneyDisplayText(periodSpentCell(row)),
    余额: formatMoneyDisplayText(balanceCell(row)),
    备注: row.remark ?? '',
    币种: row.currency ?? '',
    账户类型: row.accountType ?? '',
    所有者角色: formatOwnerRoleForTable(row),
    支付方法: paymentMethodCell(row) || '',
    账单期: formatBillingPeriodDisplay(row.billingPeriod),
    锁定原因: row.lockReason ?? '',
    创建日期: row.createdDate ?? '',
    时区: row.timezone ?? '',
    原始ID: row.originalId ?? '',
    创建自BM名称: row.createdFromBmName ?? '',
    创建自BM_ID: row.createdFromBmId ?? '',
    所属BM名称: row.belongsToBmName ?? '',
    所属BM_ID: row.belongsToBmId ?? '',
    国家编码: row.countryCode ?? '',
  })) as Record<string, unknown>[];
  const ws = XLSX.utils.json_to_sheet(rows);
  applyExcelColumnWidths(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '广告账户');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  XLSX.writeFile(wb, `fb-ad-accounts-${stamp}.xlsx`);
  fbControlLog('site:account-page', '已导出 Excel', { rows: rows.length });
}

function closeBatchDrawer() {
  batchDrawerOpen.value = false;
  batchDrawerKey.value = '';
  batchDrawerResults.value = [];
  batchDrawerCurrentFbUrl.value = null;
  batchDrawerRunning.value = false;
}

function onFriendVerifyResult(payload: FriendVerifyResultPayload) {
  batchDrawerResults.value = payload.rows;
  batchDrawerCurrentFbUrl.value = payload.currentUserProfileUrl;
}

async function attachFxRatesForLimitOps(payload: BatchDrawerSubmitPayload): Promise<void> {
  if (payload.operationId !== 'set_limit' && payload.operationId !== 'reset_limit') return;
  const ccys = [
    ...new Set(
      accounts.value
        .filter((a) => payload.selectedAccountIds.includes(a.accountId))
        .map((a) => (a.currency || '').trim().toUpperCase())
        .filter((c) => c && c !== 'USD')
    ),
  ];
  const fxMap: Record<string, { rate: number; source?: string }> = {};
  for (const ccy of ccys) {
    await ensureFxRate(ccy);
    if (fxUsdToAccount[ccy] != null) {
      fxMap[ccy] = {
        rate: fxUsdToAccount[ccy],
        source: fxUsdToAccountSource[ccy],
      };
    }
  }
  if (Object.keys(fxMap).length) payload.fxUsdToAccount = fxMap;
}

async function onBatchDrawerConfirm(payload: BatchDrawerSubmitPayload) {
  errorMsg.value = '';
  if (!extensionConfigured()) {
    errorMsg.value = '请在 site/.env.development 中配置 VITE_EXTENSION_ID';
    return;
  }
  batchDrawerRunning.value = true;
  batchDrawerResults.value = [];
  await attachFxRatesForLimitOps(payload);
  fbControlLog('site:account-page', '批量操作 Graph 执行开始', {
    entryKey: payload.entryKey,
    operationId: payload.operationId,
    subId: payload.subId,
    accountCount: payload.selectedAccountIds.length,
    fxUsdToAccount: payload.fxUsdToAccount,
  });
  try {
    const rows = await executeAdAccountBatchFromSite(payload);
    batchDrawerResults.value = rows;
    fbControlLog('site:account-page', '批量操作 Graph 执行完成', { rows: rows.length });
    if (payload.operationId === 'account_rename') {
      const okRows = rows.filter((r) => r.status === '成功');
      const badRows = rows.filter((r) => r.status !== '成功');
      if (badRows.length) {
        const detail = badRows.map((r) => `${r.accountId}: ${r.detail}`).join('\n');
        showToastError(
          badRows.length === rows.length
            ? `账号重命名全部失败：\n${detail}`
            : `部分账号重命名失败（成功 ${okRows.length} / ${rows.length}）：\n${detail}`
        );
        errorMsg.value =
          badRows.length === rows.length ? '账号重命名全部失败' : `重命名：${badRows.length} 条失败`;
      }
      const renamedFromDetail = (detail: string): string => {
        const m = detail.match(/名称已更新为「([^」]*)」/);
        return (m?.[1] ?? '').trim();
      };
      for (const r of okRows) {
        const newName = renamedFromDetail(r.detail);
        try {
          await mergeAccountInExtension({ accountId: r.accountId, name: newName || undefined });
        } catch (mergeErr: unknown) {
          const m = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
          fbControlLog('site:account-page', '重命名 Graph 成功但写扩展缓存失败', { accountId: r.accountId, m });
          showToastError(`接口已成功但写本地缓存失败 ${r.accountId}：${m}`);
        }
      }
      if (okRows.length) {
        await refreshFromExtension();
      }
    }
    if (payload.operationId === 'account_push') {
      const emails = (payload.accountPushForm?.recipients ?? [])
        .map((x) => x.recipientEmail?.trim())
        .filter(Boolean);
      const pushLabel =
        emails.length > 1
          ? `已推送至 ${emails.length} 个邮箱`
          : emails[0]
            ? `已推送至 ${emails[0]}`
            : '已推送';
      const okRows = rows.filter((r) => r.status === '成功');
      const partialRows = rows.filter((r) => r.status === '部分成功');
      for (const r of okRows) {
        try {
          await mergeAccountInExtension({
            accountId: r.accountId,
            pushStatus: pushLabel,
          });
        } catch {
          /* ignore cache write errors */
        }
      }
      for (const r of partialRows) {
        try {
          await mergeAccountInExtension({
            accountId: r.accountId,
            pushStatus: pushLabel ? `${pushLabel}（部分失败）` : '部分推送成功',
          });
        } catch {
          /* ignore */
        }
      }
      if (okRows.length || partialRows.length) {
        await refreshFromExtension();
      }
    }
    if (payload.operationId === 'set_limit' || payload.operationId === 'reset_limit') {
      const okRows = rows.filter((r) => r.status === '成功');
      if (okRows.length) {
        try {
          const syncHints: Record<string, SpendCapNormalizeHints> = {
            ...(payload.accountSpendCapHints ?? {}),
          };
          for (const r of okRows) {
            if (r.spendCapMinorAfter != null && r.spendCapMinorAfter >= 0) {
              syncHints[r.accountId] = {
                ...syncHints[r.accountId],
                spendCapMinor: r.spendCapMinorAfter,
                currency: syncHints[r.accountId]?.currency,
              };
            }
          }
          const patches = await syncSpendCapPatchesFromGraph(
            okRows.map((r) => r.accountId),
            syncHints
          );
          applySpendCapPatchesToAccounts(patches);
        } catch (syncErr: unknown) {
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          fbControlLog('site:account-page', '限额操作后回读 spend_cap 失败', { msg });
          showToastError(`操作已提交，但列表额度刷新失败：${msg}。可点击「Graph 同步」重试。`);
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errorMsg.value = msg;
    batchDrawerResults.value = payload.selectedAccountIds.map((accountId) => ({
      accountId,
      status: '失败',
      detail: msg,
    }));
  } finally {
    batchDrawerRunning.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClickCloseMore);
  registerAccountsGraphSync(syncFromGraph);
  fbControlLog('site:account-page', '页面挂载，自动拉取账户');
  refreshFromExtension().catch(() => {});
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClickCloseMore);
  unregisterAccountsGraphSync();
});
</script>

<template>
  <div class="fb-page">
    <div v-if="errorMsg" class="alert alert--bar" role="alert">
      <span class="alert-text">{{ errorMsg }}</span>
      <button type="button" class="alert-dismiss" aria-label="关闭提示" @click="dismissPageAlert">×</button>
    </div>

    <div class="search-actions-row">
      <div class="search-cluster search-row search-row--flex">
        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="搜索：请输入广告账号…"
        />
        <button type="button" class="btn-filter" title="高级筛选" @click="openAdvFilterModal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16v4H4zM7 12h10v4H7zM10 20h4v2h-4z"></path>
          </svg>
        </button>
      </div>
      <div class="batch-cluster">
        <span class="batch-meta">已选 <strong>{{ selectedCount }}</strong> 条</span>
        <div class="batch-btns">
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('addAuth')">
            增加授权
          </button>
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('removeAuth')">
            删除授权
          </button>
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('addBm')">
            添加到 BM
          </button>
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('setLimit')">
            设置限额
          </button>
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('resetLimit')">
            重置限额
          </button>
          <button
            type="button"
            class="btn batch-btn"
            :disabled="!selectedCount"
            @click="batchLoadHiddenAdminsForSelection"
          >
            隐藏管理员
          </button>
          <button type="button" class="btn batch-btn" :disabled="!selectedCount" @click="openBatchDrawer('accountPush')">
            账号推送
          </button>
          <div ref="moreWrapRef" class="more-wrap">
            <button
              type="button"
              class="btn batch-btn batch-btn--more"
              :disabled="!selectedCount"
              @click.stop="moreMenuOpen = !moreMenuOpen"
            >
              更多
              <span class="more-chev" :class="{ open: moreMenuOpen }">▼</span>
            </button>
            <ul v-show="moreMenuOpen" class="more-dropdown" role="menu" @click.stop>
              <li>
                <button
                  type="button"
                  class="more-item"
                  role="menuitem"
                  :disabled="!selectedCount"
                  @click="onMoreMenuPick('bmPartner')"
                >
                  BM合作伙伴
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="more-item"
                  role="menuitem"
                  :disabled="!selectedCount"
                  @click="onMoreMenuPick('accountRename')"
                >
                  账号重命名
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="more-item"
                  role="menuitem"
                  :disabled="!selectedCount"
                  @click="onMoreMenuPick('updateCompany')"
                >
                  更新公司信息
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="more-item"
                  role="menuitem"
                  :disabled="!selectedCount"
                  @click="onMoreMenuPick('batchPaymentRecords')"
                >
                  支付记录
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="more-item"
                  role="menuitem"
                  :disabled="!selectedCount"
                  @click="onMoreMenuPick('exportExcel')"
                >
                  导出 Excel
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="accounts-table-area">
      <div
        v-if="accountsGraphSyncRunning"
        class="table-loading-mask"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="table-loading-spin" aria-hidden="true"></span>
        <span class="table-loading-text">正在更新账户列表…</span>
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
            <th
              class="num sticky-col sticky-num sort-th"
              :class="{ 'sort-th--on': sortMark('accountId') !== 'none' }"
              @click="sortToggle('accountId')"
            >
              <span class="sort-th-label">序号</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('accountId') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('accountId') === 'desc' }">▼</span></span>
            </th>
            <th
              class="ico sticky-col sticky-ico sort-th"
              :class="{ 'sort-th--on': sortMark('favorite') !== 'none' }"
              @click="sortToggle('favorite')"
            >
              <span class="sort-th-label">收藏</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('favorite') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('favorite') === 'desc' }">▼</span></span>
            </th>
            <th
              class="sticky-col sticky-status sort-th"
              :class="{ 'sort-th--on': sortMark('status') !== 'none' }"
              @click="sortToggle('status')"
            >
              <span class="sort-th-label">状态</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('status') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('status') === 'desc' }">▼</span></span>
            </th>
            <th
              class="sticky-col sticky-account sort-th"
              :class="{ 'sort-th--on': sortMark('name') !== 'none' }"
              @click="sortToggle('name')"
            >
              <span class="sort-th-label">账号</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('name') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('name') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('pushStatus') !== 'none' }" @click="sortToggle('pushStatus')">
              <span class="sort-th-label">推送状态</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('pushStatus') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('pushStatus') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('adminCount') !== 'none' }" @click="sortToggle('adminCount')">
              <span class="sort-th-label">管理员</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('adminCount') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('adminCount') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('hiddenAdminCount') !== 'none' }" @click="sortToggle('hiddenAdminCount')">
              <span class="sort-th-label">隐藏管理员</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('hiddenAdminCount') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('hiddenAdminCount') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('accountKindLabel') !== 'none' }" @click="sortToggle('accountKindLabel')">
              <span class="sort-th-label">账号类型</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('accountKindLabel') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('accountKindLabel') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('billingMinor') !== 'none' }" @click="sortToggle('billingMinor')">
              <span class="sort-th-label">账单金额</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('billingMinor') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('billingMinor') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('threshold') !== 'none' }" @click="sortToggle('threshold')">
              <span class="sort-th-label">门槛</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('threshold') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('threshold') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('dailyLimit') !== 'none' }" @click="sortToggle('dailyLimit')">
              <span class="sort-th-label">日限额</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('dailyLimit') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('dailyLimit') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('totalSpent') !== 'none' }" @click="sortToggle('totalSpent')">
              <span class="sort-th-label">总花费</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('totalSpent') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('totalSpent') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('spendingLimit') !== 'none' }" @click="sortToggle('spendingLimit')">
              <span class="sort-th-label">花费限额</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('spendingLimit') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('spendingLimit') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('periodSpent') !== 'none' }" @click="sortToggle('periodSpent')">
              <span class="sort-th-label">已花费</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('periodSpent') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('periodSpent') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('balance') !== 'none' }" @click="sortToggle('balance')">
              <span class="sort-th-label">余额</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('balance') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('balance') === 'desc' }">▼</span></span>
            </th>
            <th
              class="sort-th remark-col"
              :class="{ 'sort-th--on': sortMark('remark') !== 'none' }"
              @click="sortToggle('remark')"
            >
              <span class="sort-th-label">备注</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('remark') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('remark') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('currency') !== 'none' }" @click="sortToggle('currency')">
              <span class="sort-th-label">币种</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('currency') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('currency') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('accountType') !== 'none' }" @click="sortToggle('accountType')">
              <span class="sort-th-label">账户类型</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('accountType') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('accountType') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('ownerRole') !== 'none' }" @click="sortToggle('ownerRole')">
              <span class="sort-th-label">所有者角色</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('ownerRole') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('ownerRole') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('paymentMethod') !== 'none' }" @click="sortToggle('paymentMethod')">
              <span class="sort-th-label">支付方法</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('paymentMethod') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('paymentMethod') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('billingPeriod') !== 'none' }" @click="sortToggle('billingPeriod')">
              <span class="sort-th-label">账单期</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('billingPeriod') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('billingPeriod') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('lockReason') !== 'none' }" @click="sortToggle('lockReason')">
              <span class="sort-th-label">锁定原因</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('lockReason') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('lockReason') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('createdDate') !== 'none' }" @click="sortToggle('createdDate')">
              <span class="sort-th-label">创建日期</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('createdDate') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('createdDate') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('timezone') !== 'none' }" @click="sortToggle('timezone')">
              <span class="sort-th-label">时区</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('timezone') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('timezone') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('originalId') !== 'none' }" @click="sortToggle('originalId')">
              <span class="sort-th-label">原始 ID</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('originalId') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('originalId') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('createdFromBmName') !== 'none' }" @click="sortToggle('createdFromBmName')">
              <span class="sort-th-label">创建自 BM</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('createdFromBmName') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('createdFromBmName') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('belongsToBmName') !== 'none' }" @click="sortToggle('belongsToBmName')">
              <span class="sort-th-label">所属 BM</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('belongsToBmName') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('belongsToBmName') === 'desc' }">▼</span></span>
            </th>
            <th class="sort-th" :class="{ 'sort-th--on': sortMark('countryCode') !== 'none' }" @click="sortToggle('countryCode')">
              <span class="sort-th-label">国家编码</span>
              <span class="sort-carets"><span class="caret" :class="{ on: sortMark('countryCode') === 'asc' }">▲</span><span class="caret" :class="{ on: sortMark('countryCode') === 'desc' }">▼</span></span>
            </th>
            <th>支付记录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in pagedRows" :key="row.accountId">
            <td class="chk sticky-col sticky-chk" :title="tipChkCell()">
              <input
                type="checkbox"
                :checked="!!selectedIds[row.accountId]"
                @change="toggleRowSelected(row.accountId)"
              />
            </td>
            <td class="num sticky-col sticky-num" :title="tipSerialCell(idx)">{{ rowSerial(idx) }}</td>
            <td class="ico sticky-col sticky-ico" :title="tipFavoriteCell(row)">
              <button
                type="button"
                class="star"
                :class="{ on: row.favorite }"
                @click="onToggleFavorite(row)"
              >
                ★
              </button>
            </td>
            <td class="sticky-col sticky-status" :title="tipStatusCell(row)">
              <span class="dot" :class="statusOn(row) ? 'on' : 'off'"></span>
            </td>
            <td class="account-cell sticky-col sticky-account" :title="tipAccountCell(row)">
              <div class="account-name-row">
                <div class="name">{{ dash(row.name) }}</div>
                <button
                  type="button"
                  class="btn-icon-account"
                  title="修改名称"
                  @click.stop="openRenameModal(row)"
                >
                  ✎
                </button>
              </div>
              <div class="mono sub">{{ dash(row.accountId) }}</div>
            </td>
            <td :title="tipPushStatusCell(row)">{{ dash(row.pushStatus) }}</td>
            <td class="count-badge-cell" :title="tipAdminCell(row)">
              <button
                v-if="adminCountNumber(row) > 0"
                type="button"
                class="count-badge count-badge--link"
                @click="onAdminCountClick(row)"
              >
                {{ adminBadgeText(row) }}
              </button>
              <span v-else class="count-badge">{{ adminBadgeText(row) }}</span>
            </td>
            <td class="count-badge-cell hidden-admin-cell" :title="tipHiddenAdminCell(row)">
              <button
                v-if="
                  row.hiddenAdminCount == null ||
                  hiddenAdminState(row.accountId) === 'loading' ||
                  hiddenAdminState(row.accountId) === 'error'
                "
                type="button"
                class="btn-pay btn-pay--sm"
                :class="{ 'btn-pay--err': hiddenAdminState(row.accountId) === 'error' }"
                :disabled="hiddenAdminState(row.accountId) === 'loading'"
                @click="onHiddenAdminClick(row)"
              >
                <template v-if="hiddenAdminState(row.accountId) === 'loading'">
                  <span class="pay-spin" aria-hidden="true"></span>
                  加载中
                </template>
                <template v-else-if="hiddenAdminState(row.accountId) === 'error'">重试</template>
                <template v-else>加载</template>
              </button>
              <button
                v-if="hiddenAdminCountEffective(row) != null && hiddenAdminCountEffective(row)! > 0"
                type="button"
                class="count-badge count-badge--link"
                @click="onHiddenAdminCountClick(row)"
              >
                {{ hiddenAdminBadgeText(row) }}
              </button>
              <span
                v-else-if="hiddenAdminCountEffective(row) != null"
                class="count-badge"
              >
                {{ hiddenAdminBadgeText(row) }}
              </span>
            </td>
            <td :title="tipAccountKindCell(row)">{{ dash(formatAccountKindLabelZh(row.accountKindLabel)) }}</td>
            <td :title="tipBillingCell(row)"><MoneyCellDisplay :display="billingAmountCell(row)" /></td>
            <td :title="tipThresholdCell(row)"><MoneyCellDisplay :display="thresholdCell(row)" /></td>
            <td :title="tipDailyLimitCell(row)"><MoneyCellDisplay :display="dailyLimitCell(row)" /></td>
            <td :title="tipTotalSpentCell(row)"><MoneyCellDisplay :display="totalSpentCell(row)" /></td>
            <td :title="tipSpendingLimitCell(row)"><MoneyCellDisplay :display="spendingLimitCell(row)" /></td>
            <td :title="tipPeriodSpentCell(row)"><MoneyCellDisplay :display="periodSpentCell(row)" /></td>
            <td :title="tipBalanceCell(row)"><MoneyCellDisplay :display="balanceCell(row)" /></td>
            <td class="remark-cell" :title="tipRemarkCell(row)">
              <div class="remark-cell-inner">
                <span class="remark-text">{{ dash(row.remark) }}</span>
                <button type="button" class="btn-icon-edit" title="编辑备注" @click="openRemarkModal(row)">✎</button>
              </div>
            </td>
            <td :title="tipCurrencyCell(row)">{{ dash(row.currency) }}</td>
            <td :title="tipAccountTypeCell(row)">{{ dash(row.accountType) }}</td>
            <td class="linkish owner-role-cell" :title="tipOwnerRoleCell(row)">{{ formatOwnerRoleForTable(row) }}</td>
            <td :title="tipPaymentMethodCell(row)">{{ dash(paymentMethodCell(row)) }}</td>
            <td :title="tipBillingPeriodCell(row)">{{ formatBillingPeriodDisplay(row.billingPeriod) }}</td>
            <td class="lock" :class="{ policy: !!row.lockReason }" :title="tipLockReasonCell(row)">{{ dash(row.lockReason) }}</td>
            <td :title="tipCreatedDateCell(row)">{{ dash(row.createdDate) }}</td>
            <td class="small" :title="tipTimezoneCell(row)">{{ dash(row.timezone) }}</td>
            <td class="mono small" :title="tipOriginalIdCell(row)">{{ dash(row.originalId) }}</td>
            <td class="bm" :title="tipCreatedBmCell(row)">
              <div class="linkish">{{ dash(row.createdFromBmName) }}</div>
              <div v-if="row.createdFromBmId" class="mono sub">{{ row.createdFromBmId }}</div>
            </td>
            <td class="bm" :title="tipBelongsBmCell(row)">
              <div class="linkish">{{ dash(row.belongsToBmName) }}</div>
              <div v-if="row.belongsToBmId" class="mono sub">{{ row.belongsToBmId }}</div>
            </td>
            <td :title="tipCountryCell(row)">{{ dash(row.countryCode) }}</td>
            <td class="pay-cell" :title="tipPayActionCell(row)">
              <button
                type="button"
                class="btn-pay"
                :class="{
                  'btn-pay--loading': payState(row.accountId) === 'loading',
                  'btn-pay--empty': payState(row.accountId) === 'empty',
                  'btn-pay--err': payState(row.accountId) === 'error',
                }"
                :disabled="payState(row.accountId) === 'loading'"
                :title="tipPayActionCell(row)"
                @click="onPayCellClick(row)"
              >
                <template v-if="payState(row.accountId) === 'loading'">
                  <span class="pay-spin" aria-hidden="true"></span>
                  加载中
                </template>
                <template v-else-if="payState(row.accountId) === 'empty'">无支付记录</template>
                <template v-else-if="payState(row.accountId) === 'error'">获取失败</template>
                <template v-else>加载</template>
              </button>
            </td>
          </tr>
          <tr v-if="!sortedFiltered.length">
            <td :colspan="COL_COUNT" class="empty">
              暂无数据。请确认扩展已加载、扩展 ID 正确，并已在 Facebook 相关页面触发采集。
            </td>
          </tr>
        </tbody>
      </table>
      </div>

    <div v-if="sortedFiltered.length" class="pager">
      <div class="pager-info">
        共 <strong>{{ sortedFiltered.length }}</strong> 条
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
    </div>

    <Teleport to="body">
      <Transition name="admin-drawer">
        <div
          v-if="adminDrawerOpen"
          class="admin-drawer-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeAdminDrawer"
        >
          <aside class="admin-drawer-panel">
            <div class="admin-drawer-head">
              <h3>{{ adminDrawerTitle }}</h3>
              <button type="button" class="admin-drawer-close" aria-label="关闭" @click="closeAdminDrawer">
                ×
              </button>
            </div>
            <p v-if="adminDrawerSubtitle" class="muted small admin-drawer-sub">{{ adminDrawerSubtitle }}</p>
            <p v-if="adminDrawerLoading" class="muted small admin-drawer-status">加载中…</p>
            <p v-else-if="adminDrawerError" class="admin-drawer-error">{{ adminDrawerError }}</p>
            <div v-else class="admin-drawer-scroll">
              <p v-if="!adminDrawerRows.length" class="admin-drawer-empty">
                {{ adminDrawerEmptyText() }}
              </p>
              <article
                v-for="(ar, ai) in adminDrawerRows"
                :key="ar.assignedUserId || ai"
                class="admin-user-card"
              >
                <h4 class="admin-user-card-title">{{ adminDrawerCardTitle(ar, ai) }}</h4>
                <div class="admin-user-card-grid">
                  <div
                    v-for="(field, fi) in adminDrawerFields(ar)"
                    :key="fi"
                    class="admin-user-field"
                    :class="{ 'admin-user-field--full': field.full }"
                  >
                    <div class="admin-user-field-label" :title="field.title">{{ field.label }}</div>
                    <div class="admin-user-field-value" :class="{ mono: field.mono }">
                      {{ field.value }}
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <div class="admin-drawer-foot">
              <button type="button" class="btn primary" @click="closeAdminDrawer">关闭</button>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

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

    <div
      v-if="nameModalRow"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="!nameModalSavePending && closeRenameModal()"
    >
      <div class="modal-box">
        <h3>修改账号名称</h3>
        <p class="muted small">账号 ID：{{ nameModalRow.accountId }}</p>
        <input
          v-model="nameDraft"
          type="text"
          class="name-input"
          placeholder="输入名称…"
          :readonly="nameModalSavePending"
        />
        <div class="modal-actions">
          <button type="button" class="btn ghost" :disabled="nameModalSavePending" @click="closeRenameModal">
            取消
          </button>
          <button
            type="button"
            class="btn primary btn--with-spinner"
            :disabled="nameModalSavePending"
            @click="saveRenameModal"
          >
            <span v-if="nameModalSavePending" class="btn-inline-spinner" aria-hidden="true" />
            <span>{{ nameModalSavePending ? '保存中…' : '保存' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="remarkModalRow" class="modal-overlay" role="dialog" aria-modal="true" @click.self="closeRemarkModal">
      <div class="modal-box">
        <h3>编辑备注</h3>
        <textarea v-model="remarkDraft" rows="4" class="remark-textarea" placeholder="填写备注…"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="closeRemarkModal">取消</button>
          <button type="button" class="btn primary" :disabled="loading" @click="saveRemarkModal">保存</button>
        </div>
      </div>
    </div>

    <div v-if="advModalOpen" class="modal-overlay" role="dialog" aria-modal="true" @click.self="advModalOpen = false">
      <div class="modal-box modal-box--wide">
        <h3>高级搜索</h3>
        <div class="adv-grid">
          <label class="adv-field">
            <span class="adv-label">输入广告账号 ID</span>
            <textarea v-model="advDraft.accountIdsText" rows="3" placeholder="每行一个 ID，或用逗号、空格分隔"></textarea>
          </label>
          <label class="adv-field">
            <span class="adv-label">请输入 BM ID</span>
            <input v-model="advDraft.bmId" type="text" placeholder="所属 / 创建 BM ID 片段" />
          </label>
          <label class="adv-field">
            <span class="adv-label">账号限额</span>
            <select v-model="advDraft.limitKind">
              <option value="any">不限</option>
              <option value="unlimited">不限额（无花费上限）</option>
              <option value="limited">有限额</option>
            </select>
          </label>
          <label class="adv-field">
            <span class="adv-label">账号状态</span>
            <select v-model="advDraft.statusKind">
              <option value="any">不限</option>
              <option value="active">可投放 / 活跃</option>
              <option value="inactive">非活跃</option>
            </select>
          </label>
        </div>
        <div class="modal-actions adv-modal-actions">
          <button type="button" class="btn ghost" @click="resetAdvFilterInsideModal">重置</button>
          <button type="button" class="btn ghost" @click="advModalOpen = false">关闭</button>
          <button type="button" class="btn primary" @click="applyAdvFilterFromModal">确定</button>
        </div>
      </div>
    </div>

    <BatchOperationDrawer
      :open="batchDrawerOpen"
      :preset="batchDrawerPreset"
      :selected-account-ids="selectedAccountIds"
      :selected-account-rows="batchDrawerAccountRows"
      :batch-results="batchDrawerResults"
      :batch-running="batchDrawerRunning"
      :current-fb-profile-url="batchDrawerCurrentFbUrl"
      :fx-usd-to-account="fxUsdToAccount"
      @close="closeBatchDrawer"
      @friend-verify-result="onFriendVerifyResult"
      @batch-results-update="batchDrawerResults = $event"
      @confirm="onBatchDrawerConfirm"
    />
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
.muted { color: var(--fb-muted, #9ca3af); }
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
.alert--bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 14px;
}
.alert-text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.alert-dismiss {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin: -2px -4px -2px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fecaca;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.alert-dismiss:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.btn--with-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 7.5rem;
}
.btn-inline-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: fb-btn-spin 0.65s linear infinite;
}
@keyframes fb-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
.search-actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--fb-surface-b, #1f2937);
  border: 1px solid var(--fb-border, #374151);
}
.search-actions-row .search-cluster {
  flex: 1;
  min-width: 240px;
}
.search-actions-row .batch-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
}
.search-actions-row .search-row--flex .search-input {
  margin-bottom: 0;
  max-width: none;
}
.search-row input,
.search-row--flex .search-input {
  width: 100%;
  max-width: 480px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  margin-bottom: 12px;
}
.accounts-table-area {
  position: relative;
  margin-bottom: 12px;
}
.table-loading-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--fb-surface-a, #111827) 82%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: all;
}
.table-loading-spin {
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, var(--fb-link, #93c5fd) 35%, transparent);
  border-top-color: var(--fb-link, #93c5fd);
  border-radius: 50%;
  animation: table-loading-spin 0.7s linear infinite;
}
.table-loading-text {
  font-size: 13px;
  color: var(--fb-page-text, #e5e7eb);
}
@keyframes table-loading-spin {
  to {
    transform: rotate(360deg);
  }
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
  scrollbar-width: thin;
  scrollbar-color: var(--fb-scrollbar-thumb, #475569) var(--fb-scrollbar-track, #0c1220);
}
.table-wrap::-webkit-scrollbar {
  height: 8px;
  width: 8px;
}
.table-wrap::-webkit-scrollbar-track {
  background: var(--fb-scrollbar-track, #0c1220);
  border-radius: 4px;
}
.table-wrap::-webkit-scrollbar-thumb {
  background: var(--fb-scrollbar-thumb, #475569);
  border-radius: 4px;
}
.table-wrap::-webkit-scrollbar-thumb:hover {
  background: var(--fb-scrollbar-thumb-hover, #64748b);
}
.table-wrap tbody td[title] {
  cursor: help;
}
table {
  width: max-content;
  min-width: 100%;
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
  text-align: center;
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
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  box-sizing: border-box;
}
.sticky-num {
  left: 44px;
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  box-sizing: border-box;
}
.sticky-ico {
  left: 100px;
  width: 52px;
  min-width: 52px;
  max-width: 52px;
  box-sizing: border-box;
}
.sticky-status {
  left: 152px;
  width: 64px;
  min-width: 64px;
  max-width: 64px;
  box-sizing: border-box;
  text-align: center;
}
.sticky-account {
  left: 216px;
  min-width: 240px;
  max-width: 380px;
  box-shadow: 6px 0 12px -8px rgba(0, 0, 0, 0.55);
}
.count-badge-cell {
  text-align: center;
  white-space: nowrap;
}
.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  background: var(--fb-count-badge-bg, #eff6ff);
  color: var(--fb-count-badge-text, #1d4ed8);
  border: 1px solid var(--fb-count-badge-border, #bfdbfe);
}
.count-badge--link {
  cursor: pointer;
  font-family: inherit;
}
.count-badge--link:hover {
  background: var(--fb-count-badge-hover-bg, #dbeafe);
}
.hidden-admin-cell {
  white-space: nowrap;
}
.hidden-admin-cell .btn-pay--sm {
  vertical-align: middle;
}
.btn-pay--sm {
  min-width: 64px;
  padding: 4px 8px;
  font-size: 11px;
}
.chk { width: 44px; min-width: 44px; max-width: 44px; text-align: center; box-sizing: border-box; }
.num { width: 56px; min-width: 56px; text-align: center; color: var(--fb-muted, #9ca3af); }
.ico { width: 52px; min-width: 52px; max-width: 52px; text-align: center; }
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
.account-name-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}
.account-name-row .name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-icon-account {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--fb-link, #60a5fa);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  transform: scaleX(-1);
}
.btn-icon-account:hover {
  color: #93c5fd;
  background: transparent;
}
.linkish { color: var(--fb-link, #93c5fd); }
.sub { margin-top: 2px; }
.mono { font-family: ui-monospace, monospace; color: var(--fb-mono, #d1d5db); }
.small { font-size: 11px; }
.bm { min-width: 140px; }
.lock.policy { color: #f87171; font-weight: 500; }
.badge.warn { background: #78350f; color: #fcd34d; }
.btn.sm { padding: 6px 12px; font-size: 12px; }
.btn.danger { background: #7f1d1d; color: #fecaca; }
.btn.danger:hover { background: #991b1b; }
.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.45);
}
.admin-drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(560px, 96vw);
  height: 100vh;
  z-index: 2600;
  display: flex;
  flex-direction: column;
  background: var(--fb-modal-bg, #1f2937);
  color: var(--fb-modal-text, #e5e7eb);
  border-left: 1px solid var(--fb-modal-border, #374151);
  box-shadow: -12px 0 36px rgba(0, 0, 0, 0.45);
}
.admin-drawer-enter-active .admin-drawer-panel,
.admin-drawer-leave-active .admin-drawer-panel {
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.admin-drawer-enter-active,
.admin-drawer-leave-active {
  transition: opacity 0.28s ease;
}
.admin-drawer-enter-from,
.admin-drawer-leave-to {
  opacity: 0;
}
.admin-drawer-enter-from .admin-drawer-panel,
.admin-drawer-leave-to .admin-drawer-panel {
  transform: translateX(100%);
}
.admin-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
  border-bottom: 1px solid var(--fb-modal-border, #374151);
}
.admin-drawer-head h3 {
  margin: 0;
  font-size: 16px;
}
.admin-drawer-close {
  border: none;
  background: none;
  color: var(--fb-muted, #9ca3af);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.admin-drawer-close:hover {
  color: #e5e7eb;
}
.admin-drawer-sub {
  margin: 10px 18px 0;
}
.admin-drawer-status,
.admin-drawer-error {
  margin: 16px 18px;
}
.admin-drawer-error {
  color: #f87171;
}
.admin-drawer-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 12px 18px;
  padding-right: 6px;
}
.admin-drawer-scroll::-webkit-scrollbar {
  width: 8px;
}
.admin-drawer-scroll::-webkit-scrollbar-track {
  background: var(--fb-scrollbar-track, #0c1220);
  border-radius: 4px;
}
.admin-drawer-scroll::-webkit-scrollbar-thumb {
  background: var(--fb-scrollbar-thumb, #475569);
  border-radius: 4px;
}
.admin-drawer-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--fb-scrollbar-thumb-hover, #64748b);
}
.admin-drawer-empty {
  text-align: center;
  color: var(--fb-muted, #6b7280);
  padding: 28px 12px;
  margin: 0;
}
.admin-user-card {
  background: var(--fb-surface-a, #111827);
  border: 1px solid var(--fb-modal-border, #374151);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.admin-user-card:last-child {
  margin-bottom: 0;
}
.admin-user-card-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fb-modal-text, #e5e7eb);
}
.admin-user-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}
.admin-user-field-label {
  font-size: 11px;
  color: var(--fb-muted, #9ca3af);
  margin-bottom: 4px;
}
.admin-user-field-value {
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
  color: var(--fb-modal-text, #e5e7eb);
}
.admin-user-field-value.mono {
  font-family: ui-monospace, monospace;
  color: var(--fb-mono, #d1d5db);
  word-break: break-all;
}
.admin-user-field--full {
  grid-column: 1 / -1;
}
.admin-drawer-foot {
  margin-top: auto;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--fb-modal-border, #374151);
  display: flex;
  justify-content: flex-end;
}
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
.modal-box .name-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-modal-text, #e5e7eb);
  font-size: 14px;
  font-family: inherit;
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
  min-width: 84px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-btn-pay-border, #3b82f6);
  background: var(--fb-btn-pay-bg, #1e3a5f);
  color: var(--fb-btn-pay-text, #93c5fd);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-pay:hover:not(:disabled) {
  background: var(--fb-btn-pay-hover-bg, #254a73);
}
.btn-pay--empty:hover:not(:disabled),
.btn-pay--err:hover:not(:disabled) {
  background: var(--fb-btn-pay-alt-bg, #1f2937);
}
.btn-pay:disabled {
  opacity: 0.85;
  cursor: wait;
}
.btn-pay--empty,
.btn-pay--err {
  border-color: var(--fb-btn-pay-alt-border, #4b5563);
  background: var(--fb-btn-pay-alt-bg, #1f2937);
  cursor: pointer;
  opacity: 1;
}
.btn-pay--empty {
  color: var(--fb-btn-pay-empty-text, #9ca3af);
}
.btn-pay--err {
  color: var(--fb-btn-pay-err-text, #f87171);
  border-color: var(--fb-btn-pay-err-border, #7f1d1d);
}
.btn-pay--loading { cursor: wait; }

.pay-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--fb-btn-pay-spin-dim, rgba(147, 197, 253, 0.35));
  border-top-color: var(--fb-btn-pay-text, #93c5fd);
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
  scrollbar-width: thin;
  scrollbar-color: var(--fb-scrollbar-thumb, #475569) var(--fb-scrollbar-track, #0c1220);
}
.pay-table-wrap::-webkit-scrollbar {
  height: 8px;
  width: 8px;
}
.pay-table-wrap::-webkit-scrollbar-track {
  background: var(--fb-scrollbar-track, #0c1220);
  border-radius: 4px;
}
.pay-table-wrap::-webkit-scrollbar-thumb {
  background: var(--fb-scrollbar-thumb, #475569);
  border-radius: 4px;
}
.pay-table-wrap::-webkit-scrollbar-thumb:hover {
  background: var(--fb-scrollbar-thumb-hover, #64748b);
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
  text-align: left;
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

.search-row--flex {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.search-row--flex .search-input {
  flex: 1;
  min-width: 200px;
}
.btn-filter {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-a, #111827);
  color: var(--fb-muted, #9ca3af);
  cursor: pointer;
}
.btn-filter:hover {
  color: var(--fb-link, #93c5fd);
  border-color: var(--fb-link, #3b82f6);
}

.batch-meta {
  font-size: 13px;
  color: var(--fb-muted, #9ca3af);
}
.batch-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.batch-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
  transition: opacity 0.2s;
}
.batch-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.batch-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.more-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.batch-btn--more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.more-chev {
  font-size: 9px;
  margin-left: 2px;
  opacity: 0.9;
  transition: transform 0.2s;
  display: inline-block;
}
.more-chev.open {
  transform: rotate(180deg);
}
.more-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  margin: 0;
  padding: 6px 0;
  min-width: 180px;
  list-style: none;
  background: var(--fb-modal-bg, #1f2937);
  border: 1px solid var(--fb-modal-border, #374151);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  z-index: 100;
}
.more-item {
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--fb-modal-text, #e5e7eb);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.more-item:hover:not(:disabled) {
  background: var(--fb-ghost-bg, #374151);
  color: var(--fb-link, #93c5fd);
}
.more-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sort-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sort-th:hover {
  color: var(--fb-link, #93c5fd);
}
.sort-th-label {
  margin-right: 4px;
}
.sort-carets {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  margin-left: 4px;
  vertical-align: middle;
  font-size: 10px;
  line-height: 1;
}
.sort-th:not(.sort-th--on) .sort-carets .caret {
  color: var(--fb-muted, #6b7280);
  opacity: 0.45;
}
.sort-th--on .sort-carets .caret:not(.on) {
  opacity: 0.22;
  color: var(--fb-muted, #6b7280);
  transform: scale(0.92);
}
.sort-th--on .sort-carets .caret.on {
  opacity: 1;
  color: #38bdf8;
  font-weight: 700;
  font-size: 11px;
  text-shadow: 0 0 10px rgba(56, 189, 248, 0.45);
}

/** 备注列：与设计稿相近的固定宽度；勿在 td 上使用 flex，避免与行框底边错位 */
th.remark-col,
td.remark-cell {
  min-width: 230px;
  max-width: 230px;
  width: 230px;
  box-sizing: border-box;
  vertical-align: middle;
}
.remark-cell-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 1.25em;
}
.remark-text {
  flex: 0 1 auto;
  max-width: calc(100% - 28px);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
  text-align: center;
}
.btn-icon-edit {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--fb-link, #93c5fd);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transform: scaleX(-1);
}
.btn-icon-edit:hover {
  background: var(--fb-ghost-bg, #374151);
}
.remark-textarea {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-modal-text, #e5e7eb);
  font-size: 13px;
  resize: vertical;
}
.adv-grid {
  display: grid;
  gap: 14px;
  margin-top: 12px;
}
.adv-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--fb-modal-text, #e5e7eb);
}
.adv-field input,
.adv-field textarea,
.adv-field select {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #4b5563);
  background: var(--fb-modal-input-bg, #111827);
  color: var(--fb-input-text, #e5e7eb);
  font-size: 13px;
  font-family: inherit;
}
.adv-label {
  font-size: 13px;
  color: var(--fb-muted, #9ca3af);
}
.adv-modal-actions {
  margin-top: 16px;
}

.owner-role-cell {
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
