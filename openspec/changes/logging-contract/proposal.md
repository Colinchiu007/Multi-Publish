## Why

审计（LOGGING-AUDIT-2026-08-12）与 7 项加固已落地，但日志体系仍缺**单一权威合同**：level 枚举、脱敏清单、字段格式、保留策略分散在 5 套设施（L1-L5）与 6 个 OpenSpec spec 中，新代码与 AI 代理容易漂移（例如 3 处 JS 内联脱敏正则若单边修改即静默失配）。本 change 把已固化的行为收敛为可执行、可验证的日志合同。

## What Changes

- 新增 `01-docs/LOGGING-CONTRACT.md`：人读合同——level 枚举、5 组脱敏清单、字段格式、保留策略、强制日志点、禁止项、静默边界、证据索引（file:line）。
- 新增 `.ccg/spec/observability/index.md`：代理读合同（精简版，作为 .ccg/spec 首个 observability 条目）。
- 新增契约防漂移测试：`packages/shared-utils/src/__tests__/logging-contract.test.js`——断言 3 处 JS 脱敏实现同源、各设施保留/截断常量与合同文档一致。
- OpenSpec change `logging-contract`：把合同契约化为 5 项 Requirement（脱敏同源/Level 与默认/保留策略/强制日志点/禁止与静默边界）。

## Capabilities

### New Capabilities
- `logging-contract`: 统一日志合同——跨设施 level/脱敏/字段/保留/强制日志点/静默边界的单一权威文档与防漂移测试。

### Modified Capabilities
<!-- 无：纯文档 + 契约测试，不改运行时行为 -->

## Impact

- 文档：`01-docs/LOGGING-CONTRACT.md`（新增）、`.ccg/spec/observability/index.md`（新增）
- 测试：`packages/shared-utils/src/__tests__/logging-contract.test.js`（新增，vitest）
- 零运行时行为变更；文档门禁（check-docs-sync）随 01-docs 变更自动满足
