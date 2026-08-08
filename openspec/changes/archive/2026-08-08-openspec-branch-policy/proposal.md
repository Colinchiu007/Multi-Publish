## Why

项目已有分支隔离规则（AGENTS.md PROJECT-003：所有代码变更必须分支），但实际执行存在空白：纯流程/规格/文档变更（openspec/、.ccg/、docs/）被要求与运行时代码同等走分支+PR，增加迭代成本；同时 OpenSpec 契约（openspec-integration spec）完全未涉及分支策略，新会话无法从契约层获得分支指引。本次将分层分支策略固化为 OpenSpec 契约，并与 AGENTS.md 修订保持一致。

## What Changes

- 在 openspec-integration spec 新增 Requirement「分层分支策略」：运行时代码强制分支+PR；纯流程/规格/文档变更允许 main 直接小步提交（可回滚、不与并发脏文件冲突）
- 同步修订 AGENTS.md PROJECT-003 分支隔离条款为分层表述（工作区已改，提交时机由平台/用户决定）
- 变更范围：openspec/ 契约 + AGENTS.md 单条款；不涉及运行时代码

## Capabilities

### New Capabilities
<!-- 无 -->

### Modified Capabilities
- `openspec-integration`: 追加「分层分支策略」Requirement（第 11 条）

## Impact

- openspec/specs/openspec-integration/spec.md（经本 change delta +1 Requirement）
- AGENTS.md 分支隔离条款（第 13 行修订为分层表述）