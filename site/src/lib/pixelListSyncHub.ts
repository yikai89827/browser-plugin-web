import { ref } from 'vue';

/** 像素列表最近一次从扩展 IndexedDB 拉取成功的时间（展示在 App 顶栏） */
export const pixelListLastUpdatedDisplay = ref('');

export function markPixelListFetched() {
  pixelListLastUpdatedDisplay.value = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type PixelGraphSyncFn = () => Promise<void>;

let graphSyncFn: PixelGraphSyncFn | null = null;

/** 像素页已挂载并注册了 Graph「更新」逻辑 */
export const pixelsGraphSyncReady = ref(false);

/** 顶栏「更新」执行中 */
export const pixelsGraphSyncRunning = ref(false);

/** 像素页扩展门闸已通过，顶栏可显示「更新」 */
export const pixelsShellExtensionReady = ref(false);

export function registerPixelsGraphSync(fn: PixelGraphSyncFn) {
  graphSyncFn = fn;
  pixelsGraphSyncReady.value = true;
}

export function unregisterPixelsGraphSync() {
  graphSyncFn = null;
  pixelsGraphSyncReady.value = false;
}

/** 顶栏「更新」：Graph 同步并写入扩展 IndexedDB，完成后由页面刷新表格 */
export async function requestPixelsGraphSync() {
  if (!graphSyncFn) return;
  pixelsGraphSyncRunning.value = true;
  try {
    await graphSyncFn();
  } finally {
    pixelsGraphSyncRunning.value = false;
  }
}
