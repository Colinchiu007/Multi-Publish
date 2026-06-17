# P0 实施计划：Electron + Vue.js 脚手架 + Playwright 集成 + 微信公众号 RPA 发布

> **文档版本**：v1.0  
> **创建日期**：2026-06-08  
> **作者**：Hermes Agent  
> **基线分支**：`develop`  
> **工作目录**：`C:\Users\邱领\projects\003-workspace\multi-publish\`

---

## 一、代码审查总结

### 1.1 已有资产（可直接复用）

| 资产 | 路径 | 说明 |
|------|------|------|
| **共享模块** | `shared_modules/` | pip 可安装，含 `wechat_mp/`（API发布）+ `rpa_engine/`（反检测配置） |
| **微信公众号 API 发布器** | `shared_modules/wechat_mp/publisher.py` | create_draft/get_draft/create_image_post |
| **微信 API 客户端** | `shared_modules/wechat_mp/wechat_api.py` | get_access_token/upload_image/upload_thumb |
| **凭证加密** | `shared_modules/wechat_mp/crypto.py` | AES-256 + PBKDF2 |
| **账号存储** | `shared_modules/wechat_mp/account_store.py` | JSON 文件 CRUD，加密存储 |
| **数据模型** | `shared_modules/wechat_mp/models.py` | PlatformAccount / PlatformType / PublishResult |
| **反检测配置** | `shared_modules/rpa_engine/anti_detection.py` | 浏览器启动参数 + 人类延迟 |
| **旧 Phase 1 代码** | `src/multi_publish/` | BasePublisher、TaskQueue、Scheduler（参考用，需适配 Electron 架构） |

### 1.2 缺失部分（P0 需创建）

| 缺失项 | 说明 |
|--------|------|
| **Electron 骨架** | 无 `package.json`、`main.js`、`preload.js` |
| **Vue 3 + Vite 前端** | 无前端代码、无 UI 框架 |
| **Playwright 集成** | 无 Node.js Playwright 脚本、无 Electron ↔ Playwright IPC |
| **RPA 基础模块** | `rpa_engine/base.py`、`browser_pool.py`、`cookie_manager.py` 不存在（仅 __init__.py + anti_detection.py） |
| **Electron ↔ Python 子进程通信** | 无 subprocess 管理、无 WebSocket/stdio 通道 |
| **Cookie 持久化机制** | 无加密 Cookie 文件、无自动加载/刷新逻辑 |
| **构建/打包配置** | 无 electron-builder、无`dev`/`build`脚本 |

### 1.3 技术栈确认

| 组件 | 技术 | 版本 |
|------|------|------|
| **桌面壳** | Electron | 33.x（latest stable） |
| **前端框架** | Vue 3 + Vite | Vue 3.5+ / Vite 6.x |
| **UI 组件库** | Element Plus | 2.9.x（轻量、中文友好） |
| **状态管理** | Pinia | 2.3.x |
| **路由** | Vue Router | 4.5.x |
| **浏览器自动化** | Playwright (Node.js) | 1.52.x |
| **Python 后端** | FastAPI | >=0.110.0 |
| **共享模块安装** | pip editable install | `shared_modules/` |
| **加密** | cryptography (Fernet/AES-256) | >=42.0.0 |

---

## 二、P0 里程碑与文件清单

### 里程碑 M1：Electron + Vue 3 脚手架（Hello World）

**目标**：Electron 窗口加载 Vue 3 页面，可热更新开发

#### 需创建的文件

```
multi-publish/
├── package.json                    # Node.js 项目配置（新建）
├── electron/
│   ├── main.js                     # Electron 主进程入口（新建）
│   ├── preload.js                  # 预加载脚本（contextBridge）（新建）
│   └── python-bridge.js            # Python 子进程管理模块（新建，骨架）
├── src-frontend/                   # Vue 3 前端源码（新建）
│   ├── index.html                  # Vite 入口 HTML（新建）
│   ├── main.js                     # Vue app 初始化（新建）
│   ├── App.vue                     # 根组件（新建）
│   ├── router/
│   │   └── index.js                # Vue Router 配置（新建）
│   ├── stores/
│   │   └── publisher.js            # Pinia 发布状态 store（新建）
│   ├── views/
│   │   └── Home.vue                # 首页/一键发布页（新建）
│   └── components/
│       └── HelloWorld.vue          # 测试组件（新建）
├── vite.config.js                  # Vite 配置（新建）
├── build/
│   └── electron-builder.yml        # electron-builder 打包配置（新建）
```

#### 验证步骤
1. `npm install` → 无报错
2. `npm run dev` → Electron 窗口弹出，显示 Vue 3 "Hello World" 页面
3. 修改 `App.vue` → 热更新生效（无需重启 Electron）
4. `npm run build` → 生成 `.exe` 安装包（可跳过，CI 做）

---

### 里程碑 M2：Playwright 集成 + Cookie 持久化

**目标**：Electron 主进程可启动 Playwright Chromium 实例，控制浏览器，加密持久化 Cookie

#### 需创建的文件（补齐 rpa_engine + Playwright 脚本）

```
shared_modules/rpa_engine/
├── base.py                         # BaseRPAPublisher 基类（新建）
├── browser_pool.py                 # 浏览器实例池管理（新建）
├── cookie_manager.py               # Cookie 加密持久化 + 自动加载（新建）

multi-publish/electron/
├── playwright-manager.js           # Playwright 浏览器生命周期管理（新建）
├── cookie-store.js                 # Cookie 读取/写入/加密（新建）
```

#### 需修改的文件

```
shared_modules/rpa_engine/
└── __init__.py                     # 更新导出（补充 base、browser_pool、cookie_manager）
```

#### 验证步骤
1. `npm run dev` → Electron 主进程启动时自动启动隐藏 Chromium 实例
2. Playwright 打开 `https://mp.weixin.qq.com/` → 浏览器窗口可见
3. Cookie 加密保存到 `{userDataDir}/cookies/wechat_mp.enc` → 文件存在
4. 重启应用 → Cookie 自动加载 → 无需重新扫码

---

### 里程碑 M3：Python 后端子进程集成

**目标**：Electron 主进程启动时派生 Python FastAPI 子进程，通过 stdio/HTTP 双向通信

#### 需创建的文件

```
multi-publish/python/
├── server.py                       # FastAPI 独立服务入口（新建，轻量版）
├── rpa_bridge.py                   # Playwright RPA Node.js ↔ Python 桥梁（新建）
├── requirements-runtime.txt        # Python 运行时依赖（新建）
```

#### 需修改的文件

```
multi-publish/electron/
└── python-bridge.js                # 补全：spawn Python 子进程 + 健康检查 + 优雅关闭
```

#### 验证步骤
1. `npm run dev` → Python 子进程自动启动（控制台可见 `INFO: Uvicorn running on http://127.0.0.1:8299`）
2. `python-bridge.js` 健康检查通过（`GET /api/health` → 200）
3. 关闭 Electron → Python 子进程自动终止（无残留进程）

---

### 里程碑 M4：微信公众号 RPA 发布器

**目标**：Node.js Playwright 脚本实现微信公众号登录检查、新建草稿、发布全流程

#### 需创建的文件

```
multi-publish/electron/publishers/
├── base-rpa-publisher.js           # RPA 发布器基类（新建）
└── wechat-mp-rpa.js                # 微信公众号 RPA 发布脚本（新建）

multi-publish/python/publishers/
└── rpa_wechat_mp.py                # Python 侧 RPA 发布适配器（新建）
```

#### 验证步骤
1. 调用 `wechat-mp-rpa.js` → Playwright 打开 mp.weixin.qq.com
2. Cookie 有效 → 自动进入后台（跳过扫码）
3. Cookie 无效 → 显示登录二维码，等待用户扫码
4. 测试模式下：填写标题 + HTML 正文 → 点击"保存" → 返回 draft URL
5. 所有元素选择器匹配当前 mp.weixin.qq.com DOM

---

### 里程碑 M5：基础一键发布 UI

**目标**：Vue 3 页面可输入标题/正文/封面，点击"一键发布"触发 RPA 流程

#### 需创建的文件

```
multi-publish/src-frontend/
├── views/
│   ├── Publish.vue                 # 发布页（新建）
│   └── Accounts.vue                # 账号管理页（新建）
├── components/
│   ├── ArticleEditor.vue           # 文章编辑器组件（新建）
│   ├── PlatformSelector.vue        # 平台勾选组件（新建）
│   ├── PublishProgress.vue         # 发布进度显示组件（新建）
│   └── AccountList.vue             # 账号列表组件（新建）
├── api/
│   └── publisher.js                # 调用 Electron IPC / Python API（新建）
└── router/
    └── index.js                    # 补充新路由（修改）
```

#### 需修改的文件

```
multi-publish/electron/preload.js   # 暴露发布相关 API
multi-publish/electron/main.js      # 注册 ipcMain 处理发布请求
multi-publish/src-frontend/App.vue  # 添加导航/布局
multi-publish/src-frontend/main.js  # 注册 Pinia/VueRouter
```

#### 验证步骤
1. 访问首页 → 显示文章编辑器（标题、正文 textarea、封面上传）
2. 勾选"微信公众号" → 点击"一键发布"
3. IPC 消息发送到主进程 → Playwright 启动 → 执行发布
4. 进度显示：`[公众号] 打开后台 → 填写内容 → 保存草稿 → 发布成功 ✓`
5. 发布完成后显示结果 URL

---

## 三、分步执行计划（详细操作步骤）

### 步骤 1：搭建 Electron + Vue 3 项目骨架

```bash
cd /c/Users/邱领/projects/003-workspace/multi-publish
git checkout develop
git pull origin develop

# 1a. 初始化 package.json
npm init -y

# 1b. 安装核心依赖
npm install electron@latest --save-dev
npm install vite@latest vue@latest vue-router@latest pinia@latest element-plus@latest @vitejs/plugin-vue --save
npm install electron-builder --save-dev
npm install concurrently wait-on --save-dev

# 1c. 创建目录结构
mkdir -p electron src-frontend/{views,components,stores,router,api} build
```

**创建文件**（按顺序）：
1. `package.json` — scripts: `dev`, `build`, `dev:vue`, `dev:electron`
2. `vite.config.js` — Vue 3 插件 + 开发服务器端口 5173
3. `src-frontend/index.html` — Vite 入口
4. `src-frontend/main.js` — 创建 Vue app，注册 Element Plus + Pinia + Router
5. `src-frontend/App.vue` — element-plus 布局
6. `src-frontend/router/index.js` — 首页路由 `/`
7. `src-frontend/views/Home.vue` — Hello World 测试
8. `electron/main.js` — 创建 BrowserWindow，加载 `http://localhost:5173`
9. `electron/preload.js` — contextBridge 暴露简单 API
10. `build/electron-builder.yml` — 基础打包配置

**验证**：
```bash
npm run dev   # Electron 窗口弹出，显示 "来自 Hermes 的多平台发布工具"
```

### 步骤 2：安装并集成 Playwright

```bash
npm install playwright@latest --save
npx playwright install chromium
```

**创建文件**：
1. `electron/playwright-manager.js` — `launch()` / `close()` / `getPage()` / `getContext()`
2. `electron/cookie-store.js` — `loadCookies(platform)` / `saveCookies(platform, cookies)` / `encrypt()` / `decrypt()`

**关键设计**：
- `playwright-manager.js` 使用 `chromium.launchPersistentContext` 以 `browser-data/` 作为持久目录
- `cookie-store.js` 使用 Node.js `crypto` 模块 AES-256-GCM 加密
- Cookie 文件路径：`electron.browserDataDir + '/cookies/' + platform + '.enc'`

**验证**：
```bash
npm run dev
# 控制台输出: "[Playwright] Chromium 实例已启动"
# 用户目录下出现 browser-data/cookies/wechat_mp.enc
```

### 步骤 3：补齐 rpa_engine Python 模块

创建 `shared_modules/rpa_engine/base.py`：
- `BaseRPAPublisher` 基类 — `login()`, `check_login()`, `publish()`, `close()`
- 继承自 `BasePublisher` 的设计模式（可参考 `src/multi_publish/publishers/base.py`）

创建 `shared_modules/rpa_engine/browser_pool.py`：
- `BrowserPool` 单例 — `acquire(account_id)`, `release(account_id)`, `close_all()`
- 使用 `playwright.sync_api` 或 `async_api`

创建 `shared_modules/rpa_engine/cookie_manager.py`：
- `CookieManager` — `load(platform)`, `save(platform, cookies)`, `encrypt()`, `decrypt()`
- 注意：这是 **Python 版本**；Node.js 侧的 `cookie-store.js` 是等价实现

修改 `shared_modules/rpa_engine/__init__.py`：
- 追加 `from .base import BaseRPAPublisher` 等三个导出

重新安装共享模块：
```bash
cd C:\Users\邱领\projects\003-workspace\shared_modules
pip install -e . --force-reinstall
```

### 步骤 4：集成 Python 后端子进程

**创建文件**：
1. `multi-publish/python/server.py` — 最小 FastAPI 应用：
   - `GET /api/health` → `{"status": "ok"}`
   - `POST /api/publish/wechat` — 接收发布请求，调用 RPA 流程
   - `GET /api/accounts` — 列出账号
   - 端口：8299（避开常见端口冲突）
2. `multi-publish/python/requirements-runtime.txt`：
   ```
   fastapi>=0.110.0
   uvicorn>=0.27.0
   cryptography>=42.0.0
   httpx>=0.27.0
   loguru>=0.7.0
   ```
3. `electron/python-bridge.js` — `startPythonBackend()` / `stopPythonBackend()` / `healthCheck()`：
   - `child_process.spawn('python', ['-m', 'uvicorn', 'server:app', '--port', '8299'])`
   - 工作目录设置为 `python/`
   - 健康检查：轮询 `http://127.0.0.1:8299/api/health`

**修改**：
- `electron/main.js` — 在 `app.whenReady()` 中调用 `pythonBridge.startPythonBackend()`
- `electron/main.js` — 在 `app.on('before-quit')` 中调用 `pythonBridge.stopPythonBackend()`

**验证**：
```bash
npm run dev
# Python 子进程 PID 可见
# curl http://127.0.0.1:8299/api/health → {"status":"ok"}
# 关闭 Electron → python.exe 进程退出
```

### 步骤 5：实现微信公众号 RPA 发布脚本

**创建文件**：
1. `electron/publishers/base-rpa-publisher.js`：
   - `class BaseRPAPublisher` with:
   - `async init()` — 获取 Playwright context
   - `async publish(article)` — 抽象方法
   - `async cleanup()` — 关闭页面
2. `electron/publishers/wechat-mp-rpa.js`：
   - `class WeChatMPPublisher extends BaseRPAPublisher`
   - `async checkLogin()` — 访问 mp.weixin.qq.com，检测"扫码登录"元素
   - `async waitForLogin()` — 等待用户扫码（最多 120s）
   - `async createDraft(article)` — 新建图文素材
     - 点击"新建图文"
     - 填写标题、作者、正文（iframe 编辑器）
     - 上传封面图
   - `async publish()` — 点击"保存并群发"
   - `async publishArticle(article)` — 完整流程：checkLogin → login → createDraft → publish

**关键反检测策略**（参考 `shared_modules/rpa_engine/anti_detection.py`）：
- 设置 `navigator.webdriver = false`
- 随机延迟 1-3 秒
- 使用真实 UA
- 窗口大小 1920x1080
- 禁用 `--enable-automation`

**验证**：
```bash
# 测试模式（不实际发布）
node electron/publishers/wechat-mp-rpa.js --dry-run
# 输出: ✓ 元素定位成功 | ✓ Cookie 有效 | 跳过实际发布
```

### 步骤 6：打通端到端发布流程

**修改**：
1. `electron/preload.js` — 新增 IPC 通道：
   - `invoke('publish:wechat', articleData)` → 触发发布
   - `on('publish:progress', callback)` → 接收进度
   - `invoke('accounts:list')` → 获取账号列表
2. `electron/main.js` — 注册 ipcMain handlers：
   - `ipcMain.handle('publish:wechat', ...)` → 调用 WeChatMPPublisher
   - `ipcMain.handle('accounts:list', ...)` → 调用 Python API
   - 进度推送：`mainWindow.webContents.send('publish:progress', ...)`
3. `src-frontend/api/publisher.js` — 封装 IPC 调用

### 步骤 7：完成基础 UI

**创建/修改**：
1. `src-frontend/views/Publish.vue` — 发布页：
   - 标题输入框
   - 正文 textarea（后期升级为富文本编辑器）
   - 封面图上传（Element Plus Upload）
   - 平台勾选框（目前只有微信公众号）
   - "一键发布"按钮
   - 进度显示区域
2. `src-frontend/views/Accounts.vue` — 账号管理页：
   - 账号列表（显示平台、名称、状态）
   - "添加账号"按钮 → 打开 Playwright 浏览器窗口
   - 删除/禁用操作
3. `src-frontend/router/index.js` — 补充 `/publish` 和 `/accounts` 路由
4. `src-frontend/App.vue` — 添加侧边导航（Element Plus Menu）

---

## 四、测试/验证检查清单

### M1 验证
- [ ] `npm run dev` 弹出 Electron 窗口
- [ ] 显示"Hello World" Vue 3 页面
- [ ] 修改代码热更新生效
- [ ] `npm run build` 生成 exe（可选）

### M2 验证
- [ ] Chromium 实例随 Electron 启动
- [ ] 浏览器打开 mp.weixin.qq.com 可见
- [ ] Cookie 加密文件生成
- [ ] 重启后 Cookie 自动加载

### M3 验证
- [ ] Python 子进程自动启动
- [ ] `/api/health` 返回 200
- [ ] Electron 退出时 Python 进程终止
- [ ] 端口 8299 独占

### M4 验证
- [ ] Cookie 有效时跳过扫码
- [ ] Cookie 过期时显示二维码
- [ ] 填写标题/正文到编辑器
- [ ] 保存草稿成功（返回 media_id）
- [ ] 正式发布成功（可选，依赖公众号权限）

### M5 验证
- [ ] 发布页 UI 完整
- [ ] 输入内容 → 选平台 → 点发布 → 走通全流程
- [ ] 进度条正确显示
- [ ] 发布结果显示
- [ ] 账号管理页可查看/删除账号

---

## 五、共享模块复用对照

| 功能 | 复用来源 | 适配说明 |
|------|----------|----------|
| **微信公众号 API 发布** | `shared_modules/wechat_mp/publisher.py` | Python 端直接使用，`create_draft()` / `get_draft()` |
| **凭证加密** | `shared_modules/wechat_mp/crypto.py` | Python 端使用；Node.js 侧实现等价版本 `cookie-store.js` |
| **账号存储 CRUD** | `shared_modules/wechat_mp/account_store.py` | Python FastAPI 直接使用 |
| **数据模型** | `shared_modules/wechat_mp/models.py` | Python 端直接使用 |
| **反检测配置** | `shared_modules/rpa_engine/anti_detection.py` | 指南参考；Playwright 启动参数需在 `playwright-manager.js` 实现 |
| **BaseRPAPublisher 基类** | `rpa_engine/base.py`（新建） | Python 侧；Node.js 侧 `base-rpa-publisher.js` 独立实现 |

---

## 六、依赖安装命令汇总

```bash
# ---- Node.js 依赖 ----
cd /c/Users/邱领/projects/003-workspace/multi-publish
npm install electron@latest --save-dev
npm install vite@latest vue@latest vue-router@latest pinia@latest element-plus@latest @vitejs/plugin-vue --save
npm install playwright@latest --save
npm install electron-builder concurrently wait-on --save-dev
npx playwright install chromium

# ---- Python 依赖 ----
cd /c/Users/邱领/projects/003-workspace/shared_modules
pip install -e . --force-reinstall

cd /c/Users/邱领/projects/003-workspace/multi-publish/python
pip install -r requirements-runtime.txt
```

---

## 七、开发注意事项

1. **Git 分支策略**：所有改动在 `develop` 分支上进行。每完成一个里程碑提交一次。
2. **Playwright 元素选择器**：mp.weixin.qq.com DOM 可能变化，使用 `aria-label` / `placeholder` / `text=` 等稳定选择器。
3. **Cookie 加密**：Node.js 侧用 `crypto.createCipheriv('aes-256-gcm', ...)` ，Python 侧用 `cryptography.fernet`。
4. **Python 子进程路径**：由于项目路径含中文（`邱领`），确保 `child_process.spawn` 正确处理 Unicode。
5. **Windos 兼容**：Playwright 的 `waitForTimeout` 在 Windows 上正常，`page.pause()` 会等待用户操作。
6. **性能**：P0 不追求并发，一次只发一个任务。每个平台独立 browser context。

---

## 八、预计工时

| 里程碑 | 文件数 | 预计工时 |
|--------|--------|----------|
| M1: Electron + Vue 3 脚手架 | ~12 个 | 2-3 小时 |
| M2: Playwright + Cookie 持久化 | ~5 个 | 2-3 小时 |
| M3: Python 子进程集成 | ~3 个 | 1-2 小时 |
| M4: 微信公众号 RPA 发布器 | ~3 个 | 3-4 小时 |
| M5: 基础 UI | ~6 个 | 2-3 小时 |
| **总计** | **~29 个文件** | **10-15 小时** |
