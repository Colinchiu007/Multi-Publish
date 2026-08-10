## Why

ops-center 此前是独立仓库（Colinchiu007/ops-center）+ Multi-Publish vendored 快照双轨，存在两份代码漂移风险；用户确认按方案 A（git subtree 正式并入）统一开发、PR/CI/质量门禁。

## What Changes

- 移除 Multi-Publish 内 vendored ops-center/ 快照，以 git subtree --squash 并入独立仓库 main（78bebac，含 PR #1/#2/#3 全部能力）。
- 之后 ops-center 直接在 Multi-Publish 内开发；独立仓库冻结归档（tag + README 说明）。
- 验证：ops-center pytest 66 passed、前端 build 通过、内容与源仓库一致。

## Capabilities

### New Capabilities
- `ops-center/monorepo-integration`: ops-center 作为 Multi-Publish 内置子项目的开发/验证/交付契约（backend pytest 门禁、frontend build、子目录边界）。

## Impact

- ops-center/（subtree 替换 vendored）、01-docs/PRD.md 或 AGENTS 补充说明、CI（ops-center 变更触发）
