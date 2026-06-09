# Multi-Publish

多平台内容一键发布桌面工具。支持微信公众号、知乎、微博、抖音等平台的 RPA 自动化发布。

## 安装

```bash
# 从 GitHub Release 下载（推荐）
# 访问 https://github.com/Colinchiu007/Multi-Publish/releases
# 下载 Multi-Publish Setup x.x.x.exe

# 或者从源码构建
git clone https://github.com/Colinchiu007/Multi-Publish.git
cd Multi-Publish
npm install
npm run build:vue
npx electron-builder --win --x64
```

## 首次使用

1. **下载安装包** — 从 [Releases](https://github.com/Colinchiu007/Multi-Publish/releases) 下载
2. **安装 Python 后端依赖** — 首次运行自动安装（需 Python 3.12+ 已安装）
3. **安装 Playwright 浏览器** — 首次运行自动检测并提示安装
4. **登录平台账号** — 每个平台需要单独登录并保存 Cookie

## 支持平台

| 平台 | 状态 | 特性 |
|:----:|:----:|------|
| ✅ 微信公众号 | 已实现 | 草稿编辑 → 群发，支持富文本/封面/作者设置 |
| ✅ 知乎 | 已实现 | 文章发布，支持话题标签 |
| ✅ 微博 | 已实现 | 图文发布，支持长文 |
| ✅ 抖音 | 已实现 | 图文发布 |
| ⏳ 小红书 | 计划中 | |

## 架构

```
┌──────────────────────────────────┐
│  Electron Shell (Vue 3 + Vite)   │  ← 桌面 GUI
├──────────────────────────────────┤
│  IPC Bridge (preload.js)         │  ← 前后端通信
├──────────┬──────────┬───────────┤
│  Task    │ Scheduler│  History  │  ← 任务管理
│  Queue   │ (定时)   │  (JSONL)  │
├──────────┴──────────┴───────────┤
│  Playwright RPA Engine           │  ← 浏览器自动化
├──────────────────────────────────┤
│  FastAPI Backend (:8299)         │  ← Python RPA 适配器
├──────────────────────────────────┤
│  4 Platform Publishers            │  ← 平台独立发布模块
│  (WeChat / Zhihu / Weibo / Douyin)│
└──────────────────────────────────┘
```

## 使用场景

### 多平台一键发布
1. 在富文本编辑器撰写文章
2. 勾选需要发布的平台
3. 点击发布 → 自动执行各平台 RPA

### 定时发布
1. 撰写文章后选择「定时发布」
2. 设定发布时间
3. 到点时自动执行

### PROJECT-001 集成
通过 aggregator bridge 接收内容聚合器的文章，自动多平台发布。

## 开发

```bash
# 启动开发服务器
npm run dev

# 构建前端
npm run build:vue

# 构建安装包
npm run build:win

# 构建（仅目录，快速测试）
npm run build:dir
```

### 后端服务

```bash
cd python
pip install -r requirements-runtime.txt
python server.py
```

服务运行在 `http://127.0.0.1:8299`

## CI/CD

GitHub Actions 自动构建 Windows (.exe) 和 Linux (.AppImage) 安装包。
推送到 `main` 或打 `v*` tag 时触发。

## 项目结构

```
electron/                  # Electron 主进程
├── main.js               # 入口 + IPC
├── preload.js            # 预加载桥
├── playwright-manager.js # 浏览器管理器
├── task-queue.js         # 任务队列
├── scheduler.js          # 定时发布
├── publish-history.js    # 发布历史
├── aggregator-bridge.js  # 001 集成桥
├── python-bridge.js      # Python 后端桥
├── cookie-store.js       # Cookie 加密存储
└── publishers/           # 平台发布器
    ├── base-rpa-publisher.js
    ├── registry.js
    ├── wechat-mp-rpa.js
    ├── zhihu-rpa.js
    ├── weibo-rpa.js
    └── douyin-rpa.js

python/                   # Python 后端
├── server.py             # FastAPI 服务
└── publishers/           # RPA 适配器

src-frontend/             # Vue 3 前端
├── views/
│   └── Publish.vue       # 发布页面
└── router/               # 路由

.github/workflows/        # CI 流水线
```

## License

MIT