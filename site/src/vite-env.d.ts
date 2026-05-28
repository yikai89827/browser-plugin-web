/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID?: string;
  /** 插件管理后台地址（与根目录 WXT_ADMIN_URL / 各环境 .env 对齐） */
  readonly VITE_WXT_ADMIN_URL?: string;
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
