/** 站点环境变量：插件管理后台地址（development / test 等 mode 对应 site/.env.*） */
export function getAdminUrlFromEnv(): string {
  const v = import.meta.env.VITE_WXT_ADMIN_URL;
  return typeof v === 'string' ? v.trim() : '';
}
