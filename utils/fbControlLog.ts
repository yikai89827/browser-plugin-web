/**
 * fbControl 统一控制台日志：固定前缀 `[fbControl:scope]`，便于在 DevTools 中过滤。
 * 与业务 `console.log` 区分，用于关键流程节点与排障。
 */

/** 流程信息（默认 console.info） */
export function fbControlLog(scope: string, message: string, details?: unknown): void {
  if (details !== undefined) {
    console.info(`[fbControl:${scope}] ${message}`, details);
  } else {
    console.info(`[fbControl:${scope}] ${message}`);
  }
}

/** 可恢复或非致命异常 */
export function fbControlWarn(scope: string, message: string, details?: unknown): void {
  console.warn(`[fbControl:${scope}] ${message}`, details ?? '');
}

/** 失败、监听器异常等 */
export function fbControlError(scope: string, message: string, details?: unknown): void {
  console.error(`[fbControl:${scope}] ${message}`, details ?? '');
}
