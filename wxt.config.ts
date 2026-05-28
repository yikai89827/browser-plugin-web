import path from 'path';
import { defineConfig } from 'wxt';
import tsconfigPaths from 'vite-tsconfig-paths';
import { loadEnv } from 'vite';
import { parseAdminUrlForManifest } from './config/adminUrlEnv';

/** WXT 解析配置时尚未注入 mode，从 CLI 推断（与 wxt COMMAND_MODES 一致） */
function resolveWxtConfigMode(): string {
  const args = process.argv;
  const idx = args.indexOf('--mode');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  if (args.some((a) => a === 'build' || a === 'zip')) return 'production';
  return 'development';
}

const mode = resolveWxtConfigMode();
const env = loadEnv(mode, process.cwd(), 'WXT_');
const adminPatterns = parseAdminUrlForManifest(env.WXT_ADMIN_URL);

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
  plugins: [
    tsconfigPaths({
      tsconfigPath: path.resolve(__dirname, './tsconfig.json'),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './utils'),
    },
  },
  manifest: () => ({
    version: '3',
    name: '账户管理',
    host_permissions: [
      '*://*.facebook.com/*',
      'https://api.frankfurter.app/*',
      'https://open.er-api.com/*',
      ...adminPatterns.hostPermissions,
    ],
    permissions: [
      'scripting',
      'storage',
      'webNavigation',
      'proxy',
      'webRequest',
      'declarativeNetRequest',
      'activeTab',
      'cookies',
      'offscreen',
      'alarms',
      'downloads',
      'tabs',
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'ruleset',
          path: 'rules.json',
          enabled: true,
        },
      ],
    },
    background: {
      type: 'module',
    },
    web_accessible_resources: [
      {
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
          ...adminPatterns.webAccessibleMatches,
        ],
        use_dynamic_url: true,
      },
    ],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+F',
          mac: 'Command+Shift+F',
        },
      },
    },
    action: {
      default_popup: 'popup.html',
    },
    externally_connectable: {
      matches: adminPatterns.externallyConnectable,
    },
  }),
});
