/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID?: string;
  /** 批量 Graph 步骤间隔（毫秒），覆盖 `config/fbControlBatch.json` */
  readonly VITE_FB_BATCH_STEP_DELAY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};

declare module 'vue-router' {
  interface RouteMeta {
    navId?: string;
    title?: string;
  }
}
