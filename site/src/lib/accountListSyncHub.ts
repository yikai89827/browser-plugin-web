import { ref } from 'vue';

/** 账户列表最近一次从扩展拉取成功的时间（展示在 App 顶栏） */
export const accountsListLastUpdatedDisplay = ref('');

export function markAccountsListFetched() {
  accountsListLastUpdatedDisplay.value = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type GraphSyncFn = () => Promise<void>;

let graphSyncFn: GraphSyncFn | null = null;

/** 账户页已挂载并注册了 Graph「更新」逻辑 */
export const accountsGraphSyncReady = ref(false);

/** 顶栏「更新」执行中 */
export const accountsGraphSyncRunning = ref(false);

export function registerAccountsGraphSync(fn: GraphSyncFn) {
  graphSyncFn = fn;
  accountsGraphSyncReady.value = true;
}

export function unregisterAccountsGraphSync() {
  graphSyncFn = null;
  accountsGraphSyncReady.value = false;
}

export async function requestAccountsGraphSync() {
  if (!graphSyncFn) return;
  accountsGraphSyncRunning.value = true;
  try {
    await graphSyncFn();
    /** graphSyncFn（账户页注册的 syncFromGraph）内部已在成功后 await refreshFromExtension；此处保留钩子便于以后做二次刷新或全局提示 */
  } finally {
    accountsGraphSyncRunning.value = false;
  }
}
