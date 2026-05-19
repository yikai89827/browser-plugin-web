import { browser } from 'wxt/browser';
import path from 'path';
import { defineConfig } from 'wxt';
import tsconfigPaths from 'vite-tsconfig-paths'
import { hostPermissions } from './config/wxtConfig'
import { loadEnv } from 'vite';

const httpsRE = /^https:\/\//;
const env = loadEnv('development', process.cwd(), 'WXT_');

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  define: {
    'import.meta.env.WXT_API_URL': JSON.stringify(env.WXT_API_URL),
    'import.meta.env.WXT_ADMIN_URL': JSON.stringify(env.WXT_ADMIN_URL),
    'import.meta.env.WXT_TASK_INTERVAL': JSON.stringify(env.WXT_TASK_INTERVAL),
    'import.meta.env.WXT_PAGE_SIZE': JSON.stringify(env.WXT_PAGE_SIZE),
    'import.meta.env.WXT_MODAL_TIMEOUT': JSON.stringify(env.WXT_MODAL_TIMEOUT),
    'import.meta.env.WXT_COUPON_API_URL': JSON.stringify(env.WXT_COUPON_API_URL),
    'import.meta.env.WXT_API_CONNECTNAME': JSON.stringify(env.WXT_API_CONNECTNAME),
    'import.meta.env.WXT_API_TIMEOUT': JSON.stringify(env.WXT_API_TIMEOUT),
    'import.meta.env.WXT_API_HEARTBEAT': JSON.stringify(env.WXT_API_HEARTBEAT),
  },
  // builder: {
  //   rollupOptions: {
  //     output: {
  //       manualChunks: (id) => {
  //         console.log('manualChunks',id)
  //       }
  //     }
  //   }
  // },
  plugins: [tsconfigPaths({
    tsconfigPath: path.resolve(__dirname, './tsconfig.json')
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './utils')
    }
  },
  manifest: () => {
    return {
      version: '3',
      name: '账户管理',
      host_permissions: [
        "*://*.facebook.com/*",
        "https://api.frankfurter.app/*",
        "https://open.er-api.com/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
        "http://192.168.110.77/*",
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
        type: "module"
      },

      web_accessible_resources: [{
        resources: [
          'fb-control-token-probe.js',
          'icon/*.png',
          'icon/*.svg',
          '*.js',
          '*.csv',
          '*.xlsx',
        ],
        matches: [
          '*://*.facebook.com/*',
          '*://*.business.facebook.com/*',
          'http://localhost/*',
          'http://127.0.0.1/*',
          'http://192.168.110.77/*',
        ],
        use_dynamic_url: true,
      }],
      // 使用commands代替部分action操作
      commands: {
        _execute_action: {
          suggested_key: {
            default: "Ctrl+Shift+F",
            mac: "Command+Shift+F"
          }
        }
      },
      action: {
        default_popup: "popup.html"
      },
      externally_connectable: {
        matches: [
          'http://localhost:*/*',
          'http://127.0.0.1:*/*',
          'http://192.168.110.77:*/*',
        ],
      },
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