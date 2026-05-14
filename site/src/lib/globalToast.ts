import { ref } from 'vue';

export type GlobalToastKind = 'error' | 'success';

export type GlobalToastItem = {
  id: number;
  message: string;
  kind: GlobalToastKind;
};

const items = ref<GlobalToastItem[]>([]);
let nextId = 1;
const DEFAULT_MS = 8000;

function remove(id: number) {
  items.value = items.value.filter((t) => t.id !== id);
}

function push(message: string, kind: GlobalToastKind) {
  const id = nextId++;
  items.value = [...items.value, { id, message, kind }];
  window.setTimeout(() => remove(id), DEFAULT_MS);
}

/** 顶部全局错误条（与 Ads Manager 风格接近：白底、左侧红圈白叉） */
export function showToastError(message: string) {
  push(message, 'error');
}

export function showToastSuccess(message: string) {
  push(message, 'success');
}

export function dismissToast(id: number) {
  remove(id);
}

export function useGlobalToastItems() {
  return items;
}
