# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

---

## Summary

[Extract from feature spec: primary requirement + technical approach]

## Technical Context

**Language/Version**: [e.g., Python 3.12, TypeScript 5.x, Vue 3.x]
**Primary Dependencies**: [e.g., FastAPI, Ant Design 5.x, Tailwind CSS]
**Storage**: [e.g., PostgreSQL, Redis, aiosqlite WAL]
**Testing**: [e.g., pytest, Playwright, Vitest]
**Target Platform**: [e.g., Web SPA, mobile H5, desktop Electron]
**Project Type**: [e.g., web-service, fullstack-app, mobile-app]
**Performance Goals**: [e.g., <200ms p95, <800MB peak memory]
**Constraints**: [e.g., 4G ECS, single-node deployment]
**Coding Rules**: [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) 框架规则 + [toss-style-design-system](https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/toss-style-design-system.mdc)（UI项目）
**Scale/Scope**: [e.g., 10k DAU, 20 pages, 5 API endpoints]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

---

## Quality Rhythm Integration

> 本方案的执行必须遵循质量节拍（quality-rhythm）阶段门禁。

| Phase | 质量节拍阶段 | Spec Kit 命令 | 产出物 | 门禁检查 |
|-------|------------|--------------|--------|---------|
| 0 | 探索期 | `/speckit.specify` + `/speckit.clarify` | spec.md, clarified requirements | Phase 0 Gate Checklist 全部 [x] |
| 1 | 规划期 | `/speckit.plan` + `/speckit.tasks` | plan.md, tasks.md, data-model.md | TDD 场景覆盖率 >= 80% |
| 2 | 开发期 | `/speckit.implement` | 代码 + 测试 | 所有 P1 测试通过 |
| 3 | 交付期 | QA + deploy | 可部署产物 | QA 健康分 >= 8/10 |
| 4 | 复盘期 | retro | 复盘文档 | - |

---

## Test-First Development Plan

<!--
 TDD 是本方案的核心。测试场景从 Spec 的验收标准直接映射，
 不是事后补写。每个任务必须先写测试，再写实现。
-->

### Test Scenario Priority Matrix

| Priority | Scenario Count | Strategy |
|----------|---------------|----------|
| P1 (Must Have) | [count] | TDD: Red → Green → Refactor |
| P2 (Should Have) | [count] | TDD: Red → Green → Refactor |
| P3 (Nice to Have) | [count] | Write tests alongside implementation |

### Test Infrastructure

| Test Type | Framework | Runner | Coverage Target | Environment |
|-----------|----------|--------|----------------|-------------|
| Unit | [e.g., pytest] | [runner] | [e.g., >= 80%] | local |
| Integration | [e.g., pytest + httpx] | [runner] | [e.g., >= 60%] | local + test DB |
| E2E | [e.g., Playwright] | [runner] | [e.g., P1 stories] | staging |
| Visual Regression | [e.g., Playwright screenshot] | [runner] | [e.g., all pages] | staging |
| API Contract | [e.g., schemathesis] | [runner] | [e.g., all endpoints] | local |

### Visual Regression Plan

> 涉及 UI 变更时，必须在 PR 合入前执行视觉回归测试。

| Page/Component | Desktop Snapshot | Mobile Snapshot | Baseline |
|---------------|-----------------|----------------|----------|
| [page] | [ ] required | [ ] required | [link] |

---

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── spec.md          # Feature specification (from /speckit.specify)
├── plan.md          # This file
├── research.md      # Phase 0 research output
├── data-model.md    # Data model design
├── quickstart.md    # Key validation scenarios
├── contracts/       # API contracts
│   ├── rest.md
│   └── events.md
└── tasks.md         # Executable task list (from /speckit.tasks)
```

### Source Code (repository root)

```text
# Web Application (default for frontend features)
frontend/
├── src/
│   ├── components/    # Reusable UI components
│   ├── pages/         # Page-level components
│   ├── services/      # API calls and business logic
│   ├── stores/        # State management
│   └── utils/         # Utility functions
└── tests/
    ├── unit/          # Unit tests
    ├── integration/   # Integration tests
    ├── e2e/           # End-to-end tests (Playwright)
    └── visual/        # Visual regression baselines

backend/
├── src/
│   ├── models/        # Data models
│   ├── services/      # Business logic
│   ├── api/           # API endpoints
│   └── utils/         # Utility functions
└── tests/
    ├── unit/
    ├── integration/
    └── contract/      # API contract tests
```

**Structure Decision**: [选择理由]

---

## Implementation Tasks

<!--
 由 /speckit.tasks 从本 plan 自动生成 tasks.md。
 每个任务必须：
 1. 先写测试（TDD Red）
 2. 再写实现（TDD Green）
 3. 重构（TDD Refactor）
 4. 标注依赖关系和并行可能性 [P]
-->

### Task Group 1: Foundation (Parallel-safe)

| Task | Description | Dependencies | Parallel? |
|------|------------|-------------|-----------|
| T-1.1 | [task] | none | [P] |
| T-1.2 | [task] | none | [P] |

### Task Group 2: Core Features

| Task | Description | Dependencies | Parallel? |
|------|------------|-------------|-----------|
| T-2.1 | [task] | T-1.1, T-1.2 | [P] |

### Task Group 3: UI Implementation

| Task | Description | Dependencies | Parallel? |
|------|------------|-------------|-----------|
| T-3.1 | [task] | T-2.1 | |

### Task Group 4: Integration & Polish

| Task | Description | Dependencies | Parallel? |
|------|------------|-------------|-----------|
| T-4.1 | [task] | T-3.1 | |

### Task Group 5: Testing & QA

| Task | Description | Dependencies | Parallel? |
|------|------------|-------------|-----------|
| T-5.1 | Visual regression baseline capture | T-3.1 | [P] |
| T-5.2 | E2E test suite | T-3.1 | [P] |
| T-5.3 | API contract tests | T-2.1 | [P] |

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., new dependency] | [current need] | [why existing solution insufficient] |
