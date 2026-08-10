# ops-center/monorepo-integration Specification

## Purpose
ops-center 正式并入 Multi-Publish monorepo 后的开发与交付契约。
## Requirements
### Requirement: 子项目开发与验证契约
ops-center 在 Multi-Publish 内必须保持独立可验证：backend pytest 门禁（cd ops-center/backend && pytest）、frontend build（npm run build）、内容与冻结源仓库一致。

#### Scenario: 后端门禁
- **WHEN** 修改 ops-center/backend 代码
- **THEN** cd ops-center/backend && pytest 全部通过

#### Scenario: 前端构建
- **WHEN** 修改 ops-center/frontend 代码
- **THEN** cd ops-center/frontend && npm run build 通过

#### Scenario: 一致性
- **WHEN** subtree 并入完成
- **THEN** ops-center/ 内容与 Colinchiu007/ops-center main（78bebac）一致（仅行尾差异）

