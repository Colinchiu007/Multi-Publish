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

> 本文件由 Hermes `professional-ai-coding-workflow` 技能转换生成，适配通用 AI 编码工具。

---

## 构建与发布

- **打包**：`npm run dist:win`（需 node_modules 里有 electron@33.4.0 + electron-builder@25.1.8）
- **CI**：.github/workflows/build.yml 使用 --no-save 安装精确版本，避免 CI 拉取 26.x 导致 schema 验证失败

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
- **注释语法**：`/* */` 成对出现，`* text` 开头的行必须前面有 `/*`
- **模块导出**：`module.exports = {` 后不能有多余逗号
- **文件 glob 覆盖**：`package.json` 的 `files` 数组必须包含所有被 require 的非 node_modules 文件

### QM-3：测试策略

- 单元测试（56 个）：覆盖核心业务逻辑 ✅
- 本地打包验证：覆盖 require 链、文件包含、语法 ✅（新增）
- 后续补充：main.js 启动测试（`node -e "require('./electron/main.js')"`）
