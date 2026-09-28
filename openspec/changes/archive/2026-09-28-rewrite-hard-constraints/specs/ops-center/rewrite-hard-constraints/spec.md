# ops-center/rewrite-hard-constraints (delta: rewrite-hard-constraints)

## ADDED Requirements

### Requirement: 改写硬约束多版本管理（唯一默认）

系统 SHALL 提供改写硬约束 CRUD（约束 ID 限 a-z0-9_-、标题 ≤200 字、内容 ≤5000 字），多版本并存且 `is_default=1` 至多一条；设默认 SHALL 在事务内先清除其他默认再设目标；默认版本 SHALL NOT 可删除（返回 400）；软删除行重建 SHALL 恢复激活而非主键冲突 500（冲突兜底 409）。

#### Scenario: 设默认后其他版本自动取消默认

- **WHEN** 对版本 A 调用 set-default（已有版本 B 为默认）
- **THEN** 事务内 B 的 is_default 清零、A 置 1，列表中默认版本唯一

#### Scenario: 删除默认版本被拒绝

- **WHEN** 对 is_default=1 的版本调用 DELETE
- **THEN** 返回 400，默认版本不被删除

#### Scenario: 软删除行重建恢复激活

- **WHEN** 创建与已软删除行同主键/同 ID 的版本
- **THEN** 恢复该行激活（软删除标记清除）而非主键冲突 500；确不可恢复时兜底 409

#### Scenario: 启动时种子初始化

- **WHEN** ops-center 后端首次启动（空表）
- **THEN** 种子初始化默认版本 hard-constraint-default-v1（纯文案输出 v1）

### Requirement: bootstrap 下发默认硬约束

runtime/bootstrap SHALL 携带唯一默认版本的改写硬约束（单对象）；无默认时该字段为 null；出现多默认异常数据时按确定性排序（ORDER BY）取一，保证下发稳定。

#### Scenario: bootstrap 响应含默认硬约束

- **WHEN** 已存在 is_default=1 的版本时请求 runtime/bootstrap
- **THEN** 响应含 rewrite_hard_constraints 字段，为该默认版本对象

#### Scenario: 双默认异常时确定性返回

- **WHEN** 异常数据导致多条 is_default=1
- **THEN** 按 ORDER BY 确定性排序取第一条返回，不抛错
