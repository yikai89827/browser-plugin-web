import { browser } from 'wxt/browser';
import path from 'path';
import { defineConfig } from 'wxt';
import tsconfigPaths from 'vite-tsconfig-paths'
import { hostPermissions } from './config/wxtConfig'
const httpsRE = /^https:\/\//;
// import path from 'path'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  //@ts-ignore
  // define: {
  //   'import.meta.env.WXT_API_URL': WXT_API_URL,
  //   'import.meta.env.WXT_TASK_INTERVAL': WXT_TASK_INTERVAL,
  //   'import.meta.env.WXT_PAGE_SIZE': WXT_PAGE_SIZE,
  //   'import.meta.env.WXT_MODAL_TIMEOUT': WXT_MODAL_TIMEOUT,
  //   'import.meta.env.WXT_COUPON_API_URL': WXT_COUPON_API_URL,
  //   'import.meta.env.WXT_API_CONNECTNAME': WXT_API_CONNECTNAME,
  //   'import.meta.env.WXT_API_TIMEOUT': WXT_API_TIMEOUT,
  //   'import.meta.env.WXT_API_HEARTBEAT': WXT_API_HEARTBEAT,
  // },
  // builder: {
  //   rollupOptions: {
  //     output: {
  //       manualChunks: (id) => {
  //         console.log('manualChunks',id)
  //       }
  //     }
  //   }
  // },
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './utils'),  // 核心路径映射
      '@/*': path.resolve(__dirname, './utils/*')  // 通配符支持
    }
  },
  entrypointsDir: 'entrypoints',
  manifest: () => {
    return {
      version: '3',
      name: 'erp助手',
      host_permissions: [
        "*://*.baidu.com/*",
        "*://*.facebook.com/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
        "http://192.168.110.106/*",
        ...hostPermissions
      ],
      permissions: [
        "scripting",
        "storage",
        'webNavigation',
        "proxy",
        "webRequest",
        "declarativeNetRequest",
        "activeTab",
        "cookies",
        "offscreen",
        "alarms",
        "downloads",
        "tabs",
        // "tabGroups",
        // "downloads.shelf",
        // "downloads.open"
        // "debugger",
        // "unlimitedStorage",
      ],
      declarative_net_request: {
        rule_resources: [{
          id: "ruleset",
          path: "rules.json",
          enabled: true
        }]
      },
      background: {
        persistent: true,
        service_worker: "entrypoints/background.ts",
        type: "module"
      },
      content_scripts: [
        {
          matches: [
            '*://*.baidu.com/*',
            "*://*.facebook.com/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "http://192.168.110.106/*",
            ...hostPermissions,
          ],
          js: ['content-scripts/content.js'],
          run_at: "document_end",
          world: "MAIN",
          all_frames: true// 允许在所有框架中运行
        }
      ],
      web_accessible_resources: [{
        resources: ['*.js', "*.csv", "*.xlsx"],
        matches: [
          '*://*.baidu.com/*',
          "*://*.facebook.com/*",
          "http://localhost/*",
          "http://127.0.0.1/*",
          "http://192.168.110.106/*",
          ...hostPermissions
        ],
        "use_dynamic_url": true  // 动态URL防止指纹追踪
      }],
      // 使用commands代替部分action操作
      commands: {
        _execute_action: {
          suggested_key: {
            default: "Ctrl+Shift+F",
            mac: "Command+Shift+F"
          }
        }
      }
      // "content_security_policy": {
      //   "extension_pages": "script-src 'self' 'unsafe-eval'; connect-src http://localhost:* http://127.0.0.1:* http://192.168.*:*"
      // }
      // externally_connectable: {
      //   matches: ['*://*/*']
      // },
      // "content_security_policy": {
      //   "extension_pages": "script-src 'self'; object-src 'self'"
      // },
      // content_security_policy: {// 安全策略 限制脚本加载资源和请求地址
      //   extension_pages: "script-src 'self'; object-src 'self'; connect-src https://your-api-domain.com"
      // }
    }
  },
});