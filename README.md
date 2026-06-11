# Multi-Publish

> 多平台内容一键发布桌面工具。支持 10 个平台的 RPA 自动化发布。
>
> **中文文档**: [README.md](README.md) | **Roadmap**: [docs/roadmap-v1.1.0.md](docs/roadmap-v1.1.0.md) | **PRD**: [PRD.md](PRD.md)

---

一键发布文章到 **微信公众号、知乎、微博、抖音、小红书、视频号、快手、今日头条、YouTube、TikTok**。

## 📥 安装

| 方式 | 说明 |
|------|------|
| **下载安装包** | [GitHub Releases](https://github.com/Colinchiu007/Multi-Publish/releases) → 下载 `.exe` |
| **自动更新** | 打开 App 后自动检测新版本（electron-updater） |
| **源码构建** | 见下方「开发」章节 |

## 🚀 首次使用

1. 下载安装包并安装
2. 首次运行自动安装 Python 依赖 + Playwright Chromium
3. 点击「账号管理」→ 选择平台 → 扫码/登录 → Cookie 加密保存
4. 撰写文章 → 选择平台 → 点击发布

## 🌐 支持平台（10 个）

| 平台 | 类型 | 说明 |
|------|------|------|
| 微信公众号 | 图文 | 草稿编辑 → 群发 |
| 知乎 | 图文 | 文章 + 话题标签 |
| 微博 | 图文 | 支持长文 |
| 抖音 | 图文 + 视频 | |
| 小红书 | 图文 | |
| 视频号 | 视频 + 图文 | |
| 快手 | 视频 + 图文 | |
| 今日头条 | 图文 + 视频 | |
| YouTube | 视频 | |
| TikTok | 视频 | |

## 🏗️ 架构

```
┌──────────────────────────────────────────┐
│  apps/desktop/                    ← Electron + Vue 3 UI
│  ├── electron/                ← 主进程 + IPC
│  └── src/                     ← 前端页面
├──────────────────────────────────────────┤
│  packages/rpa-engine/        ← Playwright RPA 引擎（10 平台）
│  packages/shared-utils/      ← 任务队列 + 共享工具
│  packages/python-backend/    ← FastAPI 后端
└──────────────────────────────────────────┘
```

Monorepo 结构，独立 npm workspace 管理。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 开发模式（Vue HMR + Electron）
npm run dev

# 构建 Windows 安装包
npm run build:win

# 仅构建目录（快速测试）
npm run build:dir
```

### Python 后端

```bash
cd packages/python-backend
pip install -r src/requirements-runtime.txt
python src/server.py  # http://127.0.0.1:8299
```

## 📊 功能

- ✅ 单篇/批量发布到多平台
- ✅ 定时发布（持久化 + 重启恢复）
- ✅ 发布历史 + 统计看板
- ✅ Cookie AES-256 加密存储
- ✅ 自动更新（GitHub Release）
- ✅ PROJECT-001 集成（内容聚合 → 自动发布）

## 📄 文档

| 文档 | 说明 |
|------|------|
| [PRD.md](PRD.md) | 产品需求文档 |
| [docs/roadmap-v1.1.0.md](docs/roadmap-v1.1.0.md) | v1.1.0 路线图 |
| [docs/pricing-strategy.md](docs/pricing-strategy.md) | 定价策略 |
| [docs/user-manual.md](docs/user-manual.md) | 用户手册 |
| [standards/coding-standards.md](standards/coding-standards.md) | 代码规范 |
| [standards/git-workflow.md](standards/git-workflow.md) | Git 工作流 |

## 📝 发布流程

```bash
# 1. 合并 develop → main
git checkout main
git merge develop

# 2. 同步版本号
# 编辑 package.json → version 字段

# 3. 提交 + 打 tag
git add -A
git commit -m "chore: bump version 1.0.x → 1.1.0"
git tag v1.1.0
git push origin main
git push origin v1.1.0
# → CI 自动构建 + Release + auto-updater 生效
```

## 📄 License

MIT
