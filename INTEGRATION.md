# INTEGRATION — 集成说明

## 项目架构

```
multi-publish/                           # Monorepo (npm workspaces)
├── apps/desktop/                        # Electron 桌面应用
│   ├── electron/                        # 主进程（main process）
│   ├── src/                             # Vue 3 + Vite 前端
│   └── dist-electron/                   # 打包产物
├── packages/
│   ├── rpa-engine/                      # RPA 发布引擎（独立包）
│   └── shared-utils/                    # 共享工具库
└── .github/workflows/                   # CI/CD
```

## 外部集成

### GitHub Integrations

| 集成 | 用途 | 配置位置 |
|------|------|---------|
| GitHub Actions CI | 构建 + 测试 + 发布 | `.github/workflows/build.yml` |
| GitHub Releases | 安装包分发 | 自动，CI 推 tag 触发 |
| Gitee 镜像 | 国内加速下载 | CI workflow `Sync to Gitee Release` step |

### Gitee

- 仓库：`ColinChiu007/Multi-Publish`
- 功能：GitHub Release 的国内镜像（需 `GITEE_TOKEN` secret）
- 只同步 Release assets，代码另由 Gitee GitHub 同步功能自动镜像

### 第三方服务

| 服务 | 用途 | 备注 |
|------|------|------|
| gh-proxy.com | 国内下载加速 | README 中备用链接 |
| sharp (libvips) | 图片处理 | platform-specific native module |
| better-sqlite3 | 本地数据持久化 | native module, @electron/rebuild 编译 |
| playwright | 浏览器 RPA | Chromium ~170MB，extraResources 捆绑 |

## 依赖关系

```
apps/desktop
  ├── @multi-publish/rpa-engine   (workspace:*)
  │     ├── playwright
  │     └── @multi-publish/shared-utils  (workspace:*)
  │           ├── js-yaml
  │           └── sharp
  └── @multi-publish/shared-utils  (workspace:*)
```

### 包内引用的特殊说明

所有包之间使用 **workspace 包名**（`@multi-publish/xxx`）引用，**不允许**跨包相对路径。
electron-builder 打包后 asar 内部不保留 monorepo 目录结构，跨包相对路径无法解析。

**验证方式**（每次打包后必须执行）：
```bash
# 1. 检查 asar 文件是否正确包含
npx asar list dist-electron/win-unpacked/resources/app.asar | grep logger

# 2. 解压后模拟内部 require 链
npx asar extract dist-electron/win-unpacked/resources/app.asar /tmp/app-test
node -e "require('/tmp/app-test/node_modules/@multi-publish/shared-utils/src/logger')"

# 3. 启动验证（8秒不崩溃即通过）
start /B dist-electron/win-unpacked/Multi-Publish.exe
```

## 自动化工作流

### CI Pipeline（`.github/workflows/build.yml`）

```
push (main 或 v* tag)
  └── build job
        ├── Setup Node.js
        ├── Sync version with tag  (仅 tag 触发)
        ├── Install deps (npm ci)
        ├── Build Vue frontend
        ├── Rebuild native modules (@electron/rebuild)
        ├── Install & bundle Playwright Chromium
        ├── Build Windows installer
        ├── Build Linux installer (dir)
        └── Upload artifacts
  └── release job (仅 v* tag)
        ├── Download Windows artifact
        ├── Generate release notes
        ├── Upload to GitHub Release
        └── Sync to Gitee Release
```

### 核心脚本

| 脚本 | 位置 | 作用 |
|------|------|------|
| `npm run build:win` | apps/desktop | Windows 安装包构建 |
| `npm run dev` | apps/desktop | 开发模式（Vite HMR + Electron） |
| `npm run test` | packages/shared-utils | 单元测试 |

## 故障恢复

### CI 失败常见原因

| 症状 | 原因 | 修复 |
|------|------|------|
| shell 语法错误 | Windows runner 用 PowerShell 执行 bash 命令 | 加 `shell: bash` |
| app-builder-lib rebuild 失败 | 内置 rebuilder 缺失 | 手动 `@electron/rebuild` |
| Playwright 安装失败 | PowerShell 不支持 `VAR=val cmd` | `shell: bash` |
| require 路径错误 | asar 内不支持跨包相对路径 | 改用 workspace 包名 |

## 版本管理

- **语义版本**：`vMAJOR.MINOR.PATCH`
- **发布流程**：git tag → CI 自动 build + release
- **安装包文件名**：由 package.json version 决定（CI 自动同步 tag 版本号）

## 质量门禁

每次修改后必须验证：

1. `npx asar list` 包含所有被 require 的文件
2. `node -e "require('@multi-publish/rpa-engine')"` 无报错
3. Electron 启动 8 秒不崩溃
