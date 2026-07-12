# ARCH-AI-TESTING: AI 全自动前端测试框架

> **目标**: 让 Agent 能够全自动循环执行前端测试、发现问题、修复问题，直到所有测试通过或达到最大迭代次数。

**状态**: 设计中
**版本**: v0.1.0
**最后更新**: 2026-07-13

---

## 1. 概念与愿景

### 1.1 什么是 AI-Driven Autonomous Testing？

AI 驱动的自主测试是一种新型测试范式，其中测试执行、结果分析、问题定位、修复决策形成闭环，由 AI Agent 自主完成，无需人工介入每个步骤。

```
传统测试:
  Human → Write Tests → Run → Analyze → Fix → Repeat (manual loop)

AI 自主测试:
  Agent → Run Tests → Analyze → Decide → Fix → Validate → Loop (autonomous)
```

### 1.2 核心价值

| 价值 | 描述 |
|------|------|
| **效率提升** | 7x24 小时运行，快速迭代 |
| **覆盖全面** | 像素级视觉 + 语义级理解 + 需求级验证 |
| **自我修复** | 发现问题后自动定位并尝试修复 |
| **文档驱动** | 从 PRD/README 自动生成测试用例 |

### 1.3 设计原则

1. **最小化外部依赖** - 不依赖外部 API，本地可运行
2. **渐进式复杂度** - 从简单像素对比开始，逐步增加语义理解
3. **可干预性** - Agent 无法决策时，清晰提示人工介入
4. **可追溯性** - 每次迭代都有记录，失败原因明确

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI Autonomous Testing Framework                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Orchestrator (协调器)                               │   │
│  │  - 管理测试循环生命周期                                               │   │
│  │  - 控制迭代次数和退出条件                                            │   │
│  │  - 协调各模块执行顺序                                                │   │
│  │  - 维护测试状态和历史                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│         ┌──────────────────────────┼──────────────────────────┐              │
│         │                          │                          │              │
│         ▼                          ▼                          ▼              │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│  │ Test Runner  │          │  AI Analyzer │          │ Fix Engine   │      │
│  │   (执行器)   │          │   (分析器)   │          │   (修复器)   │      │
│  └──────────────┘          └──────────────┘          └──────────────┘      │
│         │                          │                          │              │
│         ▼                          ▼                          ▼              │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│  │ 视觉回归测试 │          │ 差异分类     │          │ 代码修复    │      │
│  │ 功能测试    │          │ 根因分析     │          │ Baseline更新│      │
│  │ 需求验证    │          │ 覆盖率分析   │          │ 文档更新    │      │
│  └──────────────┘          └──────────────┘          └──────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责

| 模块 | 职责 | 关键接口 |
|------|------|----------|
| **Orchestrator** | 协调整个测试循环 | `start()`, `pause()`, `resume()`, `stop()` |
| **Test Runner** | 执行各类测试 | `runVisual()`, `runFunctional()`, `runRequirements()` |
| **AI Analyzer** | 分析测试结果，做决策 | `analyze()`, `decide()`, `classify()` |
| **Fix Engine** | 生成修复方案并执行 | `fix()`, `updateBaseline()`, `validate()` |

---

## 3. 测试类型

### 3.1 视觉回归测试

| 能力 | 技术实现 | 验证内容 |
|------|----------|----------|
| **像素对比** | Resemble.js | 布局、颜色、字体、间距 |
| **语义理解** | Agent view_image + LLM | 组件级验证、UX 合理性 |
| **OCR 文字** | Tesseract.js | 文字内容、标签、提示信息 |

### 3.2 功能测试

| 能力 | 技术实现 | 验证内容 |
|------|----------|----------|
| **交互测试** | Playwright 事件模拟 | 点击、输入、拖拽、滚动 |
| **流程验证** | 状态机跟踪 | 操作序列、状态转换、路由跳转 |
| **API 验证** | HTTP 请求 | 数据一致性、错误处理 |

### 3.3 需求验证

| 能力 | 技术实现 | 验证内容 |
|------|----------|----------|
| **PRD 解析** | Markdown Parser | 功能点提取 |
| **功能检测** | 路由 + 组件分析 | 已实现功能识别 |
| **覆盖率分析** | 比对算法 | 需求覆盖百分比 |

---

## 4. AI 分析器核心逻辑

### 4.1 差异分类

```
┌─────────────────────────────────────────┐
│           差异分类决策树                   │
├─────────────────────────────────────────┤
│                                          │
│  差异 > 阈值?                           │
│     ├── NO  → 噪声，忽略                 │
│     │                                      │
│     └── YES → 是已知变更?                 │
│                ├── YES → 预期变化，更新baseline │
│                │                          │
│                └── NO → 回归问题?         │
│                       ├── YES → 需要修复   │
│                       │                   │
│                       └── NO → 不确定     │
│                              → 需要人工    │
└─────────────────────────────────────────┘
```

### 4.2 决策类型

| 决策 | 描述 | 后续动作 |
|------|------|----------|
| `STOP_SUCCESS` | 所有测试通过 | 结束循环 |
| `FIX_AND_RETRY` | 有问题需要修复 | 执行修复，继续循环 |
| `UPDATE_BASELINE` | 预期变更，更新基线 | 更新 baseline，继续循环 |
| `NEED_HUMAN` | 需要人工判断 | 暂停，等待人工介入 |
| `MAX_ITERATIONS` | 达到最大迭代次数 | 结束循环，输出报告 |

---

## 5. 自主循环流程

### 5.1 流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Execution Loop                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │   Run   │───▶│ Analyze │───▶│  Decide  │              │
│  │  Tests  │    │ Results │    │  Action  │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ 视觉对比 │    │ 差异分类 │    │ 修复/Baseline│           │
│  │ 功能验证 │    │ 根因分析 │    │ 更新/人工  │              │
│  │ 需求核对 │    │ 覆盖率   │    │ 跳过      │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                              │
│       ◀──────────────── Loop ──────────────────▶             │
│                                                              │
│  退出条件: SUCCESS / MAX_ITERATIONS / NEED_HUMAN            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 迭代示例

```
Iteration 1:
  → Run Tests: 50 total, 45 passed, 5 failed
  → Analyze: 3 regressions, 2 expected changes
  → Decide: FIX_AND_RETRY
  → Apply Fixes: 3 fixes, 2 applied

Iteration 2:
  → Run Tests: 50 total, 48 passed, 2 failed
  → Analyze: 2 regressions
  → Decide: FIX_AND_RETRY
  → Apply Fixes: 2 fixes, 1 applied

Iteration 3:
  → Run Tests: 50 total, 50 passed, 0 failed
  → Analyze: All passed
  → Decide: STOP_SUCCESS
  → Exit Loop

Result: SUCCESS (3 iterations)
```

---

## 6. 使用方式

### 6.1 快速开始

```bash
cd apps/desktop

# 运行完整测试循环
npm run test:ai:autonomous

# 指定测试类型
npm run test:ai:autonomous -- --target=visual,functional

# 指定 PRD
npm run test:ai:autonomous -- --prd ./01-docs/PRD.md
```

### 6.2 配置文件

```javascript
// config/ai-testing.config.js
module.exports = {
  maxIterations: 5,
  iterationDelay: 5000,
  
  targets: {
    visual: ['home', 'accounts', 'publish', 'monitor'],
    functional: ['account-add', 'publish-quick'],
    requirements: './01-docs/PRD.md'
  },
  
  thresholds: {
    visual: 1.0,    // 1%
    functional: 0     // 0% 失败容忍
  },
  
  knownChanges: [
    { name: 'home-hero', reason: 'Redesigned in PR #123' }
  ]
};
```

---

## 7. 输出报告

### 7.1 JSON 报告

```json
{
  "generatedAt": "2026-07-13T10:30:00.000Z",
  "duration": "45.2s",
  "iterations": 3,
  "finalStatus": "SUCCESS",
  
  "summary": {
    "total": 50,
    "passed": 48,
    "failed": 2
  },
  
  "iterations": [
    {
      "iteration": 1,
      "tests": { "total": 50, "passed": 45, "failed": 5 },
      "action": "FIX_AND_RETRY",
      "fixes": [
        { "type": "visual", "testName": "home-banner", "applied": true }
      ]
    }
  ]
}
```

### 7.2 Markdown 报告

```markdown
# AI Autonomous Test Report

**Generated**: 2026-07-13 10:30:00
**Duration**: 45.2s
**Iterations**: 3/5
**Status**: ✅ SUCCESS

## Summary

| Category | Total | Passed | Failed |
|----------|-------|--------|--------|
| Visual | 20 | 20 | 0 |
| Functional | 25 | 23 | 2 |
| Requirements | 5 | 5 | 0 |
| **Total** | **50** | **48** | **2** |

## Details

### Functional Tests
- ❌ publish-flow: Button not found after timeout
  - Suggested Fix: Increase wait timeout

- ❌ account-edit: Form validation error
  - Suggested Fix: Check required fields
```

---

## 8. 路线图

### Phase 1: 基础框架
- [x] 架构设计文档
- [ ] Orchestrator 实现
- [ ] Test Runner (视觉 + 功能)
- [ ] 基础 AI Analyzer

### Phase 2: 增强分析
- [ ] AI Analyzer 增强
- [ ] Fix Engine 基础实现
- [ ] 报告生成器

### Phase 3: 需求验证
- [ ] PRD Parser
- [ ] Feature Detector
- [ ] Requirements Verifier

### Phase 4: 自主循环
- [ ] 完整迭代循环
- [ ] 自动修复
- [ ] 人工干预机制

### Phase 5: 优化
- [ ] 并行测试
- [ ] 增量测试
- [ ] 自学习

---

## 9. 技术栈

- **Playwright** - 浏览器自动化
- **Resemble.js** - 像素对比
- **Tesseract.js** - OCR 文字识别
- **Agent LLM** - 语义分析、决策
- **Node.js** - 运行环境
