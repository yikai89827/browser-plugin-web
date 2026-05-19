# `utils/fb` 目录说明

Facebook Graph / Token 相关工具，按业务域分子目录；**根目录保留各功能共用的基础设施**。

## 目录结构

| 路径 | 用途 |
|------|------|
| **`adAccount/`** | 广告账户管理：Graph 拉取/同步、批量操作、BM 邀请、支付记录、展示映射、花费上限币种等 |
| **`pixel/`** | 像素管理：BM 像素拉取、同步、批量分享/操作 |
| **`adsPanel/`** | 广告管理页悬浮窗：字段展示格式化、汇率换算 |
| **根目录** | 共用：access token、Graph 请求封装、`/me`、个人资料、批处理延迟、Comet 解析等 |

## 引用约定

- 子目录内引用共用模块：`../accessTokenStore`、`../graphExternalFetch` 等
- 子目录内引用同域模块：`./graphFetchAdAccounts` 等
- 跨域引用：`../adAccount/...`、`../pixel/...`、`../adsPanel/...`
- 站点 / content / messaging 从项目根使用完整路径，例如 `utils/fb/adAccount/graphAdAccountBatchOperations`
