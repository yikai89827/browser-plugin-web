/**
 * 页面脚本与 content script 之间的 token 传递协议（通道二：与 webRequest 通道一并使用，双保险）。
 * 兼容 fbjw2：`{ action: 'saveAccessToken', accessToken }`。
 *
 * 页面探测脚本中的常量须与此处一致：`public/fb-control-token-probe.js`
 */
export const FB_TOKEN_PAGE_MESSAGE_SOURCE = 'FB_CONTROL_PAGE';

/** 推荐：统一使用本 action + token 字段 */
export const FB_TOKEN_PAGE_ACTION_SAVE = 'SAVE_ACCESS_TOKEN';

/** fbjw2 使用的 action 名 */
export const FB_TOKEN_LEGACY_ACTION_SAVE = 'saveAccessToken';

export type FbTokenPageMessage =
  | {
      source: typeof FB_TOKEN_PAGE_MESSAGE_SOURCE;
      action: typeof FB_TOKEN_PAGE_ACTION_SAVE;
      token?: string;
      accessToken?: string;
    }
  | {
      action: typeof FB_TOKEN_LEGACY_ACTION_SAVE;
      accessToken: string;
    };
