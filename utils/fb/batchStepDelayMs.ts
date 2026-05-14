import cfg from '../../config/fbControlBatch.json';

type BatchCfg = { graphStepDelayMs?: number };

const DEFAULT_MS = 200;
const MAX_MS = 600_000;

function clampMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_MS);
}

/**
 * 批量 Graph 请求之间的默认间隔（毫秒）。
 * - 环境变量 `VITE_FB_BATCH_STEP_DELAY_MS`（站点构建）优先于 JSON。
 * - 未设置或无效时读 `config/fbControlBatch.json` 的 `graphStepDelayMs`，再退回 200。
 */
export function getConfiguredGraphBatchStepDelayMs(): number {
  const fromEnv = import.meta.env?.VITE_FB_BATCH_STEP_DELAY_MS;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const p = Number(String(fromEnv).trim());
    if (Number.isFinite(p) && p >= 0) return clampMs(p);
  }
  const raw = Number((cfg as BatchCfg).graphStepDelayMs);
  if (Number.isFinite(raw) && raw >= 0) return clampMs(raw);
  return DEFAULT_MS;
}
