import { ref } from 'vue';

/** 像素列表最近一次从扩展拉取成功的时间（展示在 App 顶栏） */
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

/** 像素页扩展门闸已通过，顶栏可显示「更新」 */
export const pixelsShellExtensionReady = ref(false);

type PixelRefreshFn = () => Promise<void>;
let pixelRefreshFn: PixelRefreshFn | null = null;

export const pixelListRefreshRunning = ref(false);

export function registerPixelListRefresh(fn: PixelRefreshFn) {
  pixelRefreshFn = fn;
}

export function unregisterPixelListRefresh() {
  pixelRefreshFn = null;
}

export async function requestPixelListRefresh() {
  if (!pixelRefreshFn) return;
  pixelListRefreshRunning.value = true;
  try {
    await pixelRefreshFn();
  } finally {
    pixelListRefreshRunning.value = false;
  }
}
