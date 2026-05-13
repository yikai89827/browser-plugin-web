/// <reference types="vite/client" />

export {};

declare module 'vue-router' {
  interface RouteMeta {
    navId?: string;
    title?: string;
  }
}
