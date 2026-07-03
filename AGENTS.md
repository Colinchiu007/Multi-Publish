# PROJECT-003 Multi-Publish — 开发流程规范

本文件定义本项目开发的完整 SOP。支持 `AGENTS.md` 的 AI 工具（Cursor、Claude Code、Cline、Windsurf、GitHub Copilot 等）启动时自动读取，确保所有 AI 协作按规范执行。

---

## 核心原则

- **先文档再代码**：没有 PRD 不动手，没有架构设计不动手
- **TDD**：测试先于代码，提交前全部测试通过
- **Code Review**：每 2-3 个功能 review 一次
- **git 提交**：所有变更必须 commit，不允许未跟踪代码
- **错误处理**：所有关键路径必须有错误处理

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


## 详细规范

本文档只包含开发流程框架。详细规范已拆分到 `references/` 子目录：

- **[references/quality-gates.md](references/quality-gates.md)** — 质量门禁详细说明
- **[references/templates.md](references/templates.md)** — 沟通模板与避坑清单
- **[references/build.md](references/build.md)** — 打包验证与构建发布

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
│   ├── rpa-engine/        # RPA 发布引擎
│   └── shared-utils/      # 共享工具库
├── team-workflow/scripts/ # 团队自动化脚本
├── .hermes/plans/         # 实施计划存档
├── .github/workflows/     # CI/CD 配置
├── PRD.md / CHANGELOG.md / README.md / AGENTS.md / INTEGRATION.md
└── ARCHITECTURE-PLAYWRIGHT.md / DESIGN.md / DEVELOPMENT_REPORT.md
```

## 打包验证（质量门禁 QM-1 补充）

- **打包**：`npm run dist:win`（需 node_modules 里有 electron@33.4.0 + electron-builder@25.1.8）
- **Playwright 浏览器捆绑**：打包前需执行 `cd apps/desktop && PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium`，浏览器自动捆入 `extraResources`
- **离线支持**：安装包自带 Chromium 浏览器（~170MB），无需代理；
  自动更新模块内置 GFW 网络错误静默处理，无网络时静默失败不弹错
- **CI**：.github/workflows/build.yml 自动完成 Playwright 安装 + 浏览器捆绑

## 强制质量门禁（MUST）## 强制质量流程

本项目的所有需求变更、规划、开发、评审和测试，**必须**遵循质量节拍 skill 定义的流程。

质量节拍的核心分层：
```
日常循环（每次编码必执行）：
  source-driven-dev → TDD → incremental-impl → /review

阶段检查（每 Phase / 里程碑结束时必执行）：
  verification-before-completion → /health → documentation-and-adrs

特殊场景（按需自动触发）：
  /investigate | /cso | defense-in-depth | dispatching-parallel-agents | ...
```

详细定义文件：`.codex/skills/质量节拍/SKILL.md`

斜杠命令（Claude Code / Cursor）：
- `/质量节拍` — 加载并执行质量节拍流程

违规后果：
- 跳过 TDD 直接写代码 = 代码不被接受
- 跳过 /review 直接合入 = 合入被拒绝
- 跳过阶段检查直接进入下一 Phase = 项目暂停直到补完检查
