# Proposal: ci-path-gating（Phase 1 规格化补全）

## Why

Phase 1（paths-ignore 路径门控，PR #430 → 558b4bc9）为 M 复杂度 CI 配置变更，交付时未建 OpenSpec change，导致该能力无规格真相源（Phase 2/3 均有 spec）。本 change 按「规格化前差异审计」把**已交付**行为规格化，补齐三阶段 CI 治理闭环；不引入新代码。

## 差异审计（基线 vs 现状）

**已交付（全部来自 PR #430，main 558b4bc9，本轮只规格化不实现）**：
- build/electron-ci/quality-gate 的 push/pull_request 增加 `paths-ignore` 黑名单（11 项：docs/md/LICENSE/.gitignore/.editorconfig/流程目录/openspec）
- doc-gate paths-ignore 补流程目录（.ccg/.claude/.hermes/.agents/openspec）
- 契约测试 `CI_IGNORED_PATHS` 单一来源守护（workflow-contract.test.js）
- 设计原则：黑名单 fail-closed（代码/依赖/CI 路径不排除）；tag 推送不受路径过滤影响（GitHub 官方行为）

## What Changes

- 仅规格化（openspec/specs/ci-path-gating/spec.md 合入）；无 workflow/代码/测试改动。
- tasks 全部标记 [已交付] 并附合并证据。

## Capabilities

### New Capabilities
- `ci-path-gating`: 全量 workflow 的文档/流程/配置类路径门控契约。

### Modified Capabilities
- （无既有 spec 的 Requirement 被修改。）
