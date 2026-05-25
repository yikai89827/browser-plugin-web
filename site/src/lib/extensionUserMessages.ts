/** 站点与 Chrome 扩展通信相关的用户可见中文文案 */

export const EXT_MSG_NO_EXTENSION_ID =
  '未配置扩展 ID：请在 site/.env.development（或 .env）中设置 VITE_EXTENSION_ID，与 Chrome 扩展页中的 ID 一致。';

export const EXT_MSG_NO_CHROME_RUNTIME =
  '未能连接到 FB 控制扩展：请使用 Chrome 打开本站，在「扩展程序」中安装并启用本项目扩展；确认扩展 ID 与配置一致，且站点来源已写入扩展 externally_connectable。';

export const EXT_MSG_NO_ACCESS_TOKEN =
  '未保存 access_token。请在已登录的 Facebook 广告管理页操作以自动捕获，或使用扩展设置粘贴 Token。';

export const EXT_MSG_READ_TOKEN_FAILED = '读取扩展 token 失败';

/** 将底层异常转为可读中文（修复历史乱码、chrome.runtime 英文报错） */
export function formatExtensionUserError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).trim();
  if (!msg) return EXT_MSG_NO_CHROME_RUNTIME;
  if (/^\?+/.test(msg) || msg.includes('????')) {
    if (/chrome\.runtime/i.test(msg)) return EXT_MSG_NO_CHROME_RUNTIME;
    if (/VITE_EXTENSION_ID|\.env/i.test(msg)) return EXT_MSG_NO_EXTENSION_ID;
    return EXT_MSG_NO_CHROME_RUNTIME;
  }
  if (
    /chrome\.runtime|sendMessage|Receiving end does not exist|Could not establish connection/i.test(
      msg
    )
  ) {
    return EXT_MSG_NO_CHROME_RUNTIME;
  }
  if (/VITE_EXTENSION_ID|未配置扩展/i.test(msg)) {
    return EXT_MSG_NO_EXTENSION_ID;
  }
  return msg;
}
