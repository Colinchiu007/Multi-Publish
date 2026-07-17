# PROJECT-003 Multi-Publish — 开发流程规范

本文件定义本项目开发的完整 SOP。支持 `AGENTS.md` 的 AI 工具（Cursor、Claude Code、Cline、Windsurf、GitHub Copilot 等）启动时自动读取，确保所有 AI 协作按规范执行。

---

## 核心原则

- **先文档再代码**：没有 PRD 不动手，没有架构设计不动手
- **TDD**：测试先于代码，提交前全部测试通过
- **Code Review**：每 2-3 个功能 review 一次
- **git 提交**：所有变更必须 commit，不允许未跟踪代码
- **分支隔离**：任何开发和代码变更必须在 git 分支上进行，禁止直接在 main 主分支上修改。完成后合并回 main。
- **错误处理**：所有关键路径必须有错误处理
- **质量节拍强制卡点**：提交前必须完成 `.quality-gates.md` 自检清单，违反不允许提交

---

## AI 角色分工

| 角色 | 阶段 | 产出物 |
|------|------|--------|
| **PM（产品经理）** | 需求分析 | PRD、用户故事、功能列表 |
| **架构师** | 技术设计 | 架构图、技术选型、目录结构 |
| **开发工程师** | 编码实现 | 功能代码、单元测试（TDD） |
| **QA（测试）** | 质量验证 | 测试用例、测试报告 |
| **CTO（技术总监）** | 代码评审 | 审查意见、安全审计 |

切换角色口令：
> 「现在你作为 PM，写 PRD」
> 「切换成架构师角色，设计技术方案」
> 「作为 CTO，review 一下这段代码」

---

## 7 阶段开发流程

### 阶段 1：想法澄清（CEO + COO）
把模糊想法变成一句话需求，确认：项目名称、目标用户、核心价值、MVP 范围。

### 阶段 2：PRD（PM）
产出：PRD，包含目标用户、P0/P1/P2 功能列表、验收标准、非功能需求。
**CEO 签字确认后才能进入下一阶段。**

### 阶段 3：技术架构（架构师）
产出：2-3 个方案对比、推荐方案、目录结构、数据流。
**原则：选最简单的方案，能不用数据库就不用，能不用第三方服务就不用。**

### 阶段 4：开发计划（PM）
把 MVP 拆成 ≤4h 的任务，标注依赖关系，标注可并行项。

### 阶段 5：编码实现（开发 + TDD）
- 先写测试，再写代码
- 每次完成做手动验证：能启动 ✅/核心功能 ✅/非法输入不崩溃 ✅/错误提示友好 ✅

### 阶段 6：代码评审（CTO）
整库扫描以下维度：
- **安全**：硬编码密钥、Shell 注入、eval
- **错误处理**：async vs .catch() 比例（健康 ≤5:1）
- **XSS**：v-html / dangerouslySetInnerHTML
- **Electron 安全**：contextIsolation、nodeIntegration、no-sandbox
- **日志污染**：console.log 在生产代码中
- **硬编码等待**：waitForTimeout

分类输出：
```
🔴 CRITICAL | 文件:行号 | 描述 | 修复建议
🟠 MAJOR   | 文件:行号 | 描述 | 修复建议
🟢 MINOR   | 文件:行号 | 描述 | 修复建议
```
CRITICAL 必须修复才能继续。

### 阶段 7：发布（运维）
打包/部署、生成安装包或部署指南、git tag。

---

## 质量门禁

**PRD 阶段**：MVP 范围清晰 ✅ / 验收标准可验证 ✅ / CEO 签字确认 ✅
**架构阶段**：最简单方案 ✅ / 目录结构明确 ✅
**开发阶段**：测试全通过 ✅ / 核心功能可手动验证 ✅ / 错误处理到位 ✅
**Code Review**：CRITICAL 问题已修复 ✅ / 代码规范一致 ✅
**发布阶段**：安装包可用 ✅ / git 已提交并 tag ✅

---

## 实用沟通模板

**启动任务**：
```
按正规开发流程实现 [功能]。先写测试，再实现，再 review。不跳步骤。
```

**加新功能**：
```
① 分析是否在 MVP 范围内
② 写功能规格
③ TDD 实现
④ 跑测试
⑤ Code Review
```

**改需求**：
```
先停。需求调整：[改动]。更新 PRD，告诉我哪些已完成的代码需要改。
```

**报错**：
```
[贴完整错误栈]。分析根因，给出修复方案。
```

---

## 避坑清单

1. 不写 PRD 直接开发 → 做着做着不知道要做什么
2. 不写测试 → 改一行崩一片
3. 不做代码评审 → 代码越来越乱
4. 不建 git → 改坏了救不回来
5. 一次说太多需求 → AI 记不住，漏掉
6. 不问「为什么这么选」→ 被带进复杂方案
7. 不做手动验证 → 测试过但实际用不了

---

## 参考文件

- `PRD.md` — 产品需求文档
- `P0/P1/P2-IMPLEMENTATION-PLAN.md` — 实现计划
- `ARCHITECTURE-PLAYWRIGHT.md` — 架构设计
- `DEVELOPMENT_REPORT.md` — 开发报告
- `CHANGELOG.md` — 变更日志
- `DESIGN.md` — 设计规范
- `INTEGRATION.md` — 集成说明

## 目录结构

```
.
├── apps/desktop/          # Electron 桌面应用
├── packages/
│   ├── ai-writer/         # AI 写作引擎
│   ├── ai-writer-api/     # AI 写作 API 封装
│   ├── api-publish-engine/ # API 发布引擎
│   ├── python-backend/    # Python 后端
│   ├── remotion-composer/ # Remotion 视频合成
│   ├── rpa-engine/        # RPA 发布引擎
│   └── shared-utils/      # 共享工具库
├── 01-docs/               # PRD、架构、设计等文档
├── config/                # 配置文件（config.yaml, platforms.yaml）
├── scripts/               # 脚本（check-docs-sync.sh 等）
├── .hermes/plans/         # 实施计划存档
├── .github/workflows/     # CI/CD 配置
├── CHANGELOG.md / README.md / AGENTS.md
└── 01-docs/PRD.md / ARCHITECTURE-PLAYWRIGHT.md / DESIGN.md / DEVELOPMENT_REPORT.md
```

## 打包验证（质量门禁 QM-1 补充）

每次修改 `apps/desktop/electron/` 或 `packages/rpa-engine/` 下代码后：

```bash
cd apps/desktop
rm -rf dist-electron
npx electron-builder --win --dir --publish never

# 验证 1：asar 文件清单
npx asar list dist-electron/win-unpacked/resources/app.asar | grep "logger"

# 验证 2：require 链测试
npx asar extract dist-electron/win-unpacked/resources/app.asar /tmp/app-test
node -e "require('/tmp/app-test/node_modules/@multi-publish/rpa-engine')"

# 验证 3：启动测试（8 秒不崩溃）
dist-electron/win-unpacked/Multi-Publish.exe &
sleep 8 && kill $!
```

> 本文件由 Hermes `professional-ai-coding-workflow` 技能转换生成，适配通用 AI 编码工具。

---

## 构建与发布

- **打包**：`npm run build:win`（需 node_modules 里有 electron@33.4.0 + electron-builder@25.1.8）
- **Playwright 浏览器捆绑**：打包前需执行 `cd apps/desktop && PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium`，浏览器自动捆入 `extraResources`
- **离线支持**：安装包自带 Chromium 浏览器（~170MB），无需代理；
  自动更新模块内置 GFW 网络错误静默处理，无网络时静默失败不弹错
- **CI**：.github/workflows/build.yml 自动完成 Playwright 安装 + 浏览器捆绑

## 强制质量门禁（MUST）

> 违反以下任何一条，任务不算完成。

### QM-1：electron 主进程代码 — 本地打包验证

每次修改 `apps/desktop/electron/` 下的代码后，**必须**在本地执行一次：

```bash
cd apps/desktop && node ../../node_modules/electron-builder/cli.js --win --x64
```

- ✅ 返回 exit code 0 → 提交代码
- ❌ 打包失败 → 修复后重新打包，直到成功
- ❌ 打包成功但应用启动报错 → 修复后重新打包

**不打包不提交。** 单元测试不能替代完整打包验证（require 路径、文件 glob 覆盖、语法错误等只能在打包产物中检测）。

### QM-2：代码审查必检项

Code review 时除逻辑正确性外，必须逐项检查：

- **require 路径**：每个 `require('../x')` / `require('./y')` 的解析目标文件是否真实存在
- **preload sandbox 兼容**：修改 preload 后必须在 sandbox:true 和 sandbox:false 两种模式下验证 `window.electronAPI` 可用
- **preload 重启验证**：修改 preload.js 后必须重启 Electron 应用（preload 只在窗口创建时加载，Vite HMR 不会热更新 preload）
- **IPC 测试环境**：涉及 IPC 调用的功能必须在 Electron 窗口中测试，浏览器打开 Vite 开发服务器无 `window.electronAPI`，所有 IPC 调用静默 fallback
- **IPC 参数序列化安全**：所有传给 `ipcRenderer.invoke()` / `window.electronAPI.*()` 的参数必须是纯 JSON 对象。Vue ref/reactive 包装的嵌套对象是 reactive proxy，直接传入会报 "An object could not be cloned"。规则：从 Vue ref 取出的对象一律 `JSON.parse(JSON.stringify(obj))` 脱壳后再传 IPC。
- **路径层级**：多包工作区中 `..` 层级必须用 path-utils 统一模块，禁止凭直觉估算
- **注释语法**：`/* */` 成对出现，`* text` 开头的行必须前面有 `/*`
- **模块导出**：`module.exports = {` 后不能有多余逗号
- **文件 glob 覆盖**：`package.json` 的 `files` 数组必须包含所有被 require 的非 node_modules 文件

### QM-3：测试策略

- 单元测试（1830 passed | 10 skipped）：覆盖核心业务逻辑 ✅
- 本地打包验证：覆盖 require 链、文件包含、语法 ✅（新增）
- 后续补充：main.js 启动测试（`node -e "require('./electron/main.js')"`）

### QM-4：视觉回归测试

**框架位置**：`apps/desktop/tests/visual-testing/`

| 测试模式 | 依赖 | 适用场景 |
|----------|------|----------|
| **像素对比** | Resemble.js | 日常开发（默认，无需 API Key） |
| **OCR 文字提取** | Tesseract.js | 日常开发（默认，无需 API Key） |
| **AI 视觉** | OpenAI / Claude（可选） | 仅 CI 无人值守流水线 |

**集成规则**：

- `pre-commit`：**不集成**视觉测试（需要 dev server 运行，触发频率过高）
- **日常开发**：改完 UI 后用 `--single` 单独验证
  ```bash
  node apps/desktop/tests/visual-testing/views/all-views.visual.test.js --single home-default
  ```
- **PR 合入前（必须通过）**：像素对比核心视图，无需 API Key
  ```bash
  cd apps/desktop && npm run test:visual:pixel
  ```
- **发版前（必须通过）**：完整回归（77 个测试：45 视图 + 32 工作流）
  ```bash
  npm run test:all:visual
  ```
- **CI 流水线**：AI 视觉可选，有 Key 才跑，无 Key 安全跳过
  ```bash
  npm run test:visual:ci
  ```

**依赖**（已在 `package.json` 中）：
- `playwright` — 浏览器自动化
- `resemblejs` — 像素对比
- `tesseract.js` — OCR 识别
- `openai` / `@anthropic-ai/sdk` — AI 视觉（仅 CI 可选）

**门禁规则**：

> `npm run test:visual:pixel` 返回非零退出码 → **禁止合入 PR**


## 视觉测试框架(供其他 AI 使用)

> 完整说明文档:[apps/desktop/tests/visual-testing/USAGE.md](apps/desktop/tests/visual-testing/USAGE.md)

### 一句话介绍

本项目使用**像素对比 + OCR + Agent 视觉判断**三层视觉回归测试框架,**完全本地运行,无需任何外部 AI API Key**。

### 框架位置

```
apps/desktop/tests/visual-testing/
├── views/        # 单视图快照(45 用例)
├── workflows/    # 多步工作流(32 用例)
├── providers/    # 本地检测器:像素对比 + OCR
├── base-screenshots/  # 基准图(8 张核心视图)
└── reports/      # diff 图 + judge-report.md + JSON
```

### 三种检测能力

| 能力 | 是否需 Key | 适用 |
|------|-----------|------|
| 像素对比(Resemble.js) | ❌ 本地 | 日常开发、PR 合入 |
| OCR(Tesseract.js) | ❌ 本地 | 文字内容校验 |
| Agent 视觉判断 | ❌ 自带 | 像素失败后最终判断 |

### 命令速查(必须 `cd apps/desktop`)

```bash
# 单视图快速验证(改完 UI 后)
node tests/visual-testing/views/all-views.visual.test.js --single home-default

# PR 合入前(必跑,门禁)
npm run test:visual:pixel

# 像素失败后生成 Agent 判断报告
npm run test:visual:agent

# 发版前(必跑,77 用例全量)
npm run test:all:visual
```

### 强制规则(MUST)

1. **pre-commit 不集成**视觉测试(需 dev server,触发频率过高)
2. **PR 合入前必须通过** `npm run test:visual:pixel`(非零退出码禁止合入)
3. **发版前必须通过** `npm run test:all:visual`
4. **baseline 更新需人工审核** diff 图,确认是预期变化后再覆盖
5. **像素失败后**必须跑 `npm run test:visual:agent` 生成报告,Agent 用 view_image 看图判断
6. 所有命令必须在 `apps/desktop/` 目录下执行

### 失败处理流程

1. 查看 `tests/visual-testing/reports/pixel-diff/*.png` 确认 diff 范围
2. 判断是否为预期变化:
   - ✅ 是 → `cp screenshots/<view>-current.png base-screenshots/<view>.png` 更新基准
   - ❌ 否 → 修复 UI 后重跑
3. 仍有疑问 → 跑 `npm run test:visual:agent`,Agent 读 judge-report.md 判断

### 无外部 AI 依赖

**重要**:本项目视觉测试**不使用** OpenAI / Claude / 任何云端 AI。所有能力本地完成:
- 像素对比、OCR 走本地 Node 库
- Agent 视觉判断走 Agent 自带的 LLM(view_image 工具)

---
## 测试质量增强工具（v0.16.0）

### 新增 npm 命令（`cd apps/desktop` 下执行）

| 命令 | 作用 | 运行时间 |
|------|------|---------|
| `npm run test:mutation` | Stryker 变异测试，找出"假测试" | 数小时（55293 突变体） |
| `npm run test:coverage` | 覆盖率报告（branches ≥ 60% 门禁） | 30 秒 |
| `npm run test:fault` | 故障注入测试，20% IPC 请求随机失败 | 10 秒 |
| `npm run test:monkey` | 500 次随机 IPC 操作序列 | 5 秒 |
| `npm run test:quality` | 一键跑全部（fault + monkey + mutation） | 数小时 |

### 配置说明

- **Stryker 配置**：项目根目录 `stryker.conf.json`（`inPlace: true` 模式，避免 Windows junction 链接复制问题）
- **Vitest 专用配置**：`apps/desktop/vitest.stryker.config.js`（排除不兼容 Instrumentation 的测试文件）
- **运行方式**：从项目根目录用 `node node_modules/@stryker-mutator/core/bin/stryker.js run stryker.conf.json` 执行

### 质量门禁（提交前必须检查）

- 变异测试得分 ≥ 30%（见 `.quality-gates.md`，首次运行需数小时）
- 分支覆盖率 ≥ 40%（`npm run test:coverage`）
- 故障注入测试通过（`npm run test:fault`）

### 用户会话录制

设置 `BACKLOT_RECORD_SESSION=true` 后正常使用软件，IPC 调用序列自动录制到 `tests/sessions/`，可通过 `SessionRecorder.replaySession()` 回放为测试。

---
## 新增模块（蚁小二逆向工程集成）

- `electron/services/account-state-restorer.js` — 账号登录状态持久化（JSONL）
- `electron/services/credential-store.js` — localStorage + accountInfo 加密存储（AES-256-GCM）
- `electron/services/publish-monitor.js` — 发布后状态自动查询（QueryStateTaskScheduler）
- `electron/services/system-tray.js` — 系统托盘（最小化到托盘 + 托盘菜单）
- `electron/services/api-platform-adapter.js` — API 模式发布适配器（微博/抖音/B站/知乎）
- `electron/services/webview-manager.js` — **分屏监控**（P0，WebContentsView 多屏布局，支持2/3/4/6屏）
- `electron/services/callback-server.js` — **实时回调服务器**（P1，HTTP POST回调 + 59s心跳，端口16521）
- `electron/monitor-preload.js` — 分屏视图预加载脚本
- `electron/services/qrcode-login.js` — **二维码扫码登录**（P2，自动检测页面二维码，扫码即登录）
- `electron/auth-qrcode-preload.js` — 扫码登录视图预加载脚本
- `electron/services/store.js` — **统一 SQLite 持久化**（P2，sql.js，替代零散JSONL）
- `electron/services/oauth-manager.js` — **OAuth 2.0 认证**（P2，YouTube/TikTok/微博/抖音 API Token 授权）
- `electron/services/batch-manager.js` — **批量发布管理器**（批量编辑/排期/复制，支持多篇文章独立选平台+定时）
- `electron/services/url-collector.js` — **URL 内容采集**（HTTP+Playwright双模式，og:meta提取）
- `electron/services/hotkeys.js` — **全局快捷键**（6组 Ctrl+Alt+... 导航快捷键）

---

## 质量节拍强制执行

本仓库已启用质量节拍（quality-rhythm）门禁系统。每次新任务自动执行：
1. 判断变更类型（14种全覆盖）
2. 评估变更规模
3. 路由到对应 Phase
4. 用户确认后开始

**视觉测试强制：** UI 文件变更时自动提示视觉回归测试。

