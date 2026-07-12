# @multi-publish/ai-autonomous-tester

> AI 全自动前端测试框架 + 需求验证。
> **框架只做事实采集，语义判断由 Agent（你）用自带 LLM 完成。**

---

## 一句话

本项目使用**像素对比 + OCR + Agent 语义判断**三层测试框架，**完全本地运行，无需任何外部 AI API Key**。

框架采集 PRD 需求 + 代码特征两类事实，打包给 Agent 做最终判断。
Agent 可以是 Codex / Claude Desktop / Cursor / Aider / 任何 LLM。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                     你的 Agent (LLM)                     │
│   Codex / Claude Desktop / Cursor / Aider / OpenAI /    │
│   Anthropic CLI / 任何 LLM                              │
├─────────────────────────────────────────────────────────┤
│                     AIAnalyzer.decide()                  │
│                     FixEngine.execute()                  │
├─────────────────────────────────────────────────────────┤
│  AgentJudge: 把 facts 打包成 prompt → 解析 verdict JSON  │
├─────────────────────────────────────────────────────────┤
│  RequirementsVerifier: collectFacts()                   │
│    ├─ PRDParser.parse()       ← 解析 PRD.md             │
│    └─ FeatureDetector.detect() ← 扫描代码                │
├─────────────────────────────────────────────────────────┤
│  VisualTestRunner    FunctionalTestRunner               │
│    ├─ PixelDiff       ├─ Playwright steps               │
│    └─ OCR            └─ Assertions                      │
└─────────────────────────────────────────────────────────┘
```

**核心原则**：PRD ↔ 代码的匹配是**语义推理任务**，框架算法不应承担。
框架只做：
1. **事实采集** — 解析 PRD item、检测代码 features、提取证据路径
2. **Prompt 打包** — 把 facts 结构化成 Agent 可直接读的 prompt
3. **Verdict 解析** — 把 Agent 的 JSON 输出归一化为稳定契约

Agent 负责：
1. **读 prompt**（含 PRD items + code features + evidence 文件路径）
2. **语义判断**（必要时 `read_file` / `view_image`）
3. **输出 verdict**（JSON schema 契约）

---

## 快速使用

### 安装

```bash
npm install @multi-publish/ai-autonomous-tester
```

### CLI（无 LLM，生成 prompt 包）

```bash
# 采集 facts → 输出 prompt 包 → exit 2 (NEED_HUMAN)
node scripts/run-agent-judge.js \
  --prd=./01-docs/PRD.md \
  --src=./apps/desktop/src
```

Agent 读 prompt 包 → `view_image` / `read_file` → 回答 JSON → 完成。

### CLI（注入 OpenAI）

```bash
OPENAI_API_KEY=sk-xxx node scripts/run-agent-judge.js \
  --prd=./01-docs/PRD.md \
  --src=./apps/desktop/src \
  --llm=openai \
  --model=gpt-4o-mini \
  --threshold=0.8
```

### CLI（注入 Anthropic）

```bash
ANTHROPIC_API_KEY=sk-ant-xxx node scripts/run-agent-judge.js \
  --prd=./01-docs/PRD.md \
  --src=./apps/desktop/src \
  --llm=anthropic \
  --model=claude-3-5-sonnet-latest
```

### CLI（自定义端点 — LM Studio / Ollama / vLLM）

```bash
LLM_BASE_URL=http://localhost:1234/v1 \
OPENAI_API_KEY=not-needed \
node scripts/run-agent-judge.js \
  --prd=./01-docs/PRD.md \
  --src=./apps/desktop/src \
  --llm=openai
```

### 退出码

| 码 | 含义 | 说明 |
|----|------|------|
| 0 | PASS | coverageRate >= threshold |
| 1 | FAIL | 有未实现需求，需修复 |
| 2 | NEED_HUMAN | 无 LLM 或 LLM 不确定，需人工审查 |
| 3 | INFRA_ERROR | 文件缺失、API 错误等 |


### 统一端到端命令（v0.12+）

`ash
# 单次检测（默认，像素对比 + 需求审计）
node scripts/run-autonomous-e2e.js --dev=apps/desktop

# 多轮自主循环（3 轮，含功能测试 + 多文档审计）
node scripts/run-autonomous-e2e.js \
  --iterations=3 \
  --functional \
  --docs="01-docs/PRD.md,README.md"

# CI 模式（跳过 server 和 visual，仅审计）
node scripts/run-autonomous-e2e.js \
  --skip-server --skip-visual --llm=openai
`

#### 参数说明
| 参数 | 默认值 | 说明 |
|------|--------|------|
| --iterations=N | 1 | 多轮循环次数（>1 启用 TestOrchestrator） |
| --functional | false | 启用 Playwright 交互功能测试 |
| --docs="a,b" | "PRD.md" | 多文档审计路径（支持 PRD/README/ARCH/...） |
| --llm=openai | none | LLM provider（openai/anthropic/留空=prompt包） |
| --skip-server | false | 跳过 dev server 启动 |
| --skip-visual | false | 跳过视觉测试 |
| --threshold=0.5 | 0.5 | 覆盖率阈值 |
| --auto-fix-visual | false | 自动更新视觉基线 |

#### npm scripts
`ash
# 全自主 3 轮循环
npm run test:autonomous:full

# 仅功能测试
npm run test:autonomous:functional

# 仅多文档覆盖审计
npm run test:autonomous:multi-doc

# CI 模式（需设置 LLM_PROVIDER）
npm run test:autonomous:e2e:ci
`

---### 作为库使用

```javascript
const {
  // Providers
  PixelDiffProvider, OCRProvider,
  // Runners
  VisualTestRunner, FunctionalTestRunner,
  RequirementsTestRunner, AutonomousTestRunner,
  // AI Loop
  TestOrchestrator, AIAnalyzer, FixEngine,
  // Requirements
  PRDParser, FeatureDetector, RequirementsVerifier,
  // Agent
  AgentJudge,
  // Utils
  findProjectRoot,
} = require("@multi-publish/ai-autonomous-tester");
```

---

## 核心组件

### AgentJudge — 语义判断桥接层

```javascript
const { AgentJudge } = require("@multi-publish/ai-autonomous-tester");

// 模式 A: 生成 prompt 包（无 LLM）
const judge = new AgentJudge();
const pkg = judge.judge({ facts, task: "coverage" });
// pkg._mode === "prompt" → 把 pkg.prompt 给 Agent 读

// 模式 B: 注入 LLM 函数（自动判断）
const judge = new AgentJudge({
  llmFn: async (prompt) => llmClient.complete(prompt),
});
const verdict = await judge.judge({ facts, task: "coverage" });
// verdict.decision === "PASS" | "FAIL" | "NEED_HUMAN"
```

Verdict JSON Schema（跨任务稳定契约）:

```json
{
  "task": "coverage",
  "decision": "PASS",
  "score": 0.85,
  "items": [
    {
      "prdFeature": "用户登录",
      "status": "COVERED",
      "matchedImpl": "LoginView",
      "evidence": "src/views/Login.vue",
      "reasoning": "路由和视图均存在"
    }
  ],
  "summary": { "covered": 1, "partial": 0, "missing": 0, "coverageRate": 1.0 },
  "recommendations": ["高优先级缺失项"],
  "reasoning": "整体判断说明"
}
```

### RequirementsVerifier — 事实采集器

```javascript
const { RequirementsVerifier } = require("@multi-publish/ai-autonomous-tester");

const verifier = new RequirementsVerifier();
const facts = await verifier.collectFacts({
  prdPath: "./PRD.md",       // PRD 文件路径
  srcDir: "./apps/desktop/src",  // 源码目录
});

// facts = { prdItems: [...], implItems: [...], evidence: [...], summary: {...} }
```

| 字段 | 来源 | 说明 |
|------|------|------|
| `prdItems` | PRDParser.parse() | PRD 中提取的功能项（checkbox/numbered/heading） |
| `implItems` | FeatureDetector.detect() | 代码中检测的功能（route/nav/title/testid/component） |
| `evidence` | implItems 精简 | 每条功能对应的文件路径，供 Agent read_file |
| `summary` | 统计 | prdCount / implCount |

### FixEngine — 修复计划生成

```javascript
const { FixEngine } = require("@multi-publish/ai-autonomous-tester");

// 从 verdict 自动生成 priority-sorted fixes
const fixes = FixEngine.fromVerdict(verdict, { maxFixes: 10 });

// 输出: [{ type, priority, effort, testName, description, suggestedFix, source }]
```

排序规则：
1. **priority**: HIGH → MEDIUM → LOW
2. **effort**: LOW → MEDIUM → HIGH（先易后难）
3. 去重：recommendation + item 合并

### AIAnalyzer — 决策引擎

```javascript
const { AIAnalyzer } = require("@multi-publish/ai-autonomous-tester");

const analyzer = new AIAnalyzer();
const analysis = await analyzer.analyze(testResults);
const decision = analyzer.decide(analysis);
```

决策路径：
- `verdict._mode === "prompt"` → **NEED_HUMAN**（Agent 必须先回答）
- `verdict.decision === "FAIL"` → **FIX_AND_RETRY** + verdictToFixes
- `verdict.decision === "NEED_HUMAN"` → **NEED_HUMAN**
- `verdict.decision === "PASS"` → 继续 baseline 检查
- `visual regression` → **FIX_AND_RETRY**
- `visual expected change` → **UPDATE_BASELINE**
- 全部通过 → **STOP_SUCCESS**

---

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/agent-judge.yml`

**触发条件**: PR / push main / 手动 dispatch

```yaml
name: AI Agent Judge
on:
  pull_request:
    branches: [main]
    paths:
      - "packages/ai-autonomous-tester/**"
      - "01-docs/PRD.md"
      - "apps/desktop/src/**"
  workflow_dispatch:
```

**行为**：
- 无 `OPENAI_API_KEY` → exit 2 (NEED_HUMAN)，Agent 读 prompt 包
- 有 Key → 自动 verdict + PR 评论 markdown 表格
- 决策 gate：PASS 放行，FAIL/NEED_HUMAN 阻塞 PR

**PR 评论示例**：
```

### 全自动多轮循环（v0.12+）

Workflow: utonomous-loop.yml

- **触发**：push main / PR labeled / 手动 dispatch
- **行为**：启动 dev server → 像素对比 → 功能测试 → 多文档审计 → 修复 → 重测（最多 N 轮）
- **基线管理**：Agent 智能判断 diff 是否预期变更，自动更新 baseline
- **修复脚本**：生成 uto-fix-commands.bat 和 patches/*.patch 供 Agent 执行
- **报告**：每轮输出 JSON + Markdown 报告，归档 artifacts

`yaml
# 手动触发
gh workflow run autonomous-loop.yml -f iterations=3 -f functional=true
`

---## ✅ AI Agent Judge — Coverage Audit

**Decision**: PASS  **Score**: 0.85  **Coverage**: 100.0%

| Status | Count |
|--------|------:|
| ✅ Covered | 8 |
| ⚠️ Partial | 0 |
| ❌ Missing | 0 |
```

---

## 测试

```bash
cd packages/ai-autonomous-tester

# 全部测试（50 个）
npm test

# 带覆盖率
npm run test:coverage

# Watch 模式
npm run test:watch
```

使用 Node.js 22 内置 `node:test` + `node:assert/strict`，零外部测试依赖。

---

## 命令速查

```bash
# 需求覆盖审计（无 LLM → prompt 包）
npm run agent-judge -- --prd=01-docs/PRD.md --src=apps/desktop/src

# 需求覆盖审计（注入 OpenAI）
OPENAI_API_KEY=sk-xxx npm run agent-judge:openai -- --prd=01-docs/PRD.md

# 需求覆盖审计（注入 Anthropic）
ANTHROPIC_API_KEY=sk-ant-xxx npm run agent-judge:anthropic
```

---

## 版本历史

| 版本 | 内容 |
|------|------|
| v0.9.0 | 单元测试 50/50 |
| v0.8.0 | GitHub Actions CLI + CI 入口 |
| v0.7.0 | FixEngine 接 verdict 推荐闭环 |
| v0.6.0 | AgentJudge 接入主路径 |
| v0.5.0 | 架构 pivot: Agent 做语义判断 |
| v0.4.0 | 关键词匹配算法（废弃） |
| v0.3.0 | 端到端自主循环 |

---

##  License

MIT

## ? AI Agent ?????

### ???

???????? **"??????????????? Agent"** ???
???????OCR?DOM ?????????**???? API Key**??
Agent ??????????????

### ??????????? API Key?

| ?? | ??? | ?? |
|------|--------|------|
| ???? | Resemble.js | ?? vs baseline ? diff ??? |
| OCR ???? | Tesseract.js | ????????? |
| Agent ???? | **Agent ??? LLM** | ????? diff ??? PASS/FAIL ?? |

### ?????

```
1. Agent ? `node scripts/run-autonomous-e2e.js --iterations=3 --functional`
2. ?? ? ?? ? ???? ? OCR ? ?? ? judge-report.md
3. Agent ? ? view_image ? diff ?
4. Agent ? ??: ???? ? ?? baseline / ?? bug ? ????
5. Agent ? ????
6. ?? 2-5 ?????? (144 tests green)
```

### ????

- **? LLM?CI ?? api key?**?????? OpenAI/Anthropic ? verdict
- **? LLM??? Agent?**????? prompt ??Agent ??? prompt + ??? + ???
- **Agent ??? Codex/Claude Desktop**????????????????? LLM ????

### ??

1. ????? `packages/ai-autonomous-tester/` ???
2. ????? `apps/desktop/tests/visual-testing/reports/`??? `view_image` ? diff ?
3. ???????????????????????? ACCEPT / REJECT
4. ??????? `npm test`??144 ?????????????

