# FB广告管理插件

基于 WXT + Vue 3 开发的浏览器插件，用于读取和管理 Facebook 广告账户信息及像素分享。

## 功能特性

- **广告账户管理**：自动获取 Facebook 广告账户信息，包括账户ID、名称、状态、余额等
- **像素管理**：获取和管理 Facebook 像素信息，支持像素分享功能
- **数据同步**：插件获取的数据可同步到后端服务进行管理
- **管理站点**：独立的管理站点，提供仪表盘、账户管理、像素分享三个核心页面

## 技术栈

- **框架**：WXT + Vue 3 + TypeScript
- **构建工具**：Vite
- **样式**：原生 CSS
- **存储**：浏览器 Storage API + IndexedDB

## 项目结构

```
fbControl/
├── entrypoints/          # 插件入口文件
│   ├── background.ts     # 后台脚本
│   ├── content.ts        # 内容脚本
│   ├── content/          # 内容脚本模块
│   │   ├── accounts/     # 账户数据获取
│   │   └── pixels/       # 像素数据获取
│   └── popup/            # 弹窗页面
│       ├── App.vue
│       ├── main.ts
│       └── index.html
├── site/                 # 管理站点
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   │   ├── Dashboard.vue
│   │   │   ├── AccountManagement.vue
│   │   │   └── PixelSharing.vue
│   │   ├── App.vue
│   │   └── main.ts
│   ├── index.html
│   └── vite.config.ts
├── utils/                # 工具函数
│   ├── connect/          # 连接相关
│   ├── scraper/          # 数据抓取
│   └── storage/          # 存储管理
└── interfaces/           # 类型定义
```

## 安装依赖

```bash
npm install
```

## 开发命令

```bash
# 启动插件开发服务器
npm run dev

# 构建插件（生产环境）
npm run build

# 启动管理站点开发服务器
npm run site:dev

# 构建管理站点
npm run site:build
```

## 使用说明

1. **安装插件**：在 Chrome/Edge 浏览器中加载已解压的扩展程序（`.output/chrome-mv3` 目录）

2. **访问 Facebook**：打开 Facebook 广告管理页面或事件管理页面

3. **获取数据**：插件会自动获取广告账户和像素信息，存储到本地

4. **管理数据**：访问管理站点查看和管理获取的数据

## 权限说明

插件需要以下权限：
- `activeTab`：访问当前标签页
- `storage`：本地数据存储
- `scripting`：脚本注入
- `webNavigation`：页面导航监听
- `webRequest`：网络请求监听
- `cookies`：Cookie 访问
- `tabs`：标签页管理

## 开发环境

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## License

MIT
