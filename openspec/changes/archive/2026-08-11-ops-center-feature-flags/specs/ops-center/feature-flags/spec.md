## Purpose
桌面端功能开关由运营后台维护，随运行时 bootstrap 下发，桌面端同步后即时生效；4K 输出能力开关为首个真实用例。

## ADDED Requirements

### Requirement: 功能开关管理
`feature_flags` 表 + `GET/POST /api/v1/feature-flags`、`PUT/DELETE /api/v1/feature-flags/{key}`（admin）。校验：key 字符集 `^[A-Za-z0-9_.-]{1,128}$`（拒绝 `__proto__`/`constructor`/`prototype`）、value_type ∈ string/boolean/number、boolean value ∈ true/false/1/0、number value 有限（float 可解析 + `math.isfinite`，含科学计数法）、value ≤512、description ≤200。POST 重复 key → 409；PUT/DELETE 不存在 → 404；PUT 部分更新忽略 body 中 key（key 不可变），并发冲突 IntegrityError → 409；种子并发冲突幂等忽略。种子 `videoCreation.maxOutputResolution`='1080p'（已存在即跳过）。

#### Scenario: 校验与 CRUD
- **WHEN** 非法 key / value_type / 无法解析的 value
- **THEN** 400 且提示字段
- **WHEN** POST 重复 key / PUT 不存在 key
- **THEN** 409 / 404
- **WHEN** 首次启动
- **THEN** 4K 能力开关种子存在且可编辑

### Requirement: 运行时下发
`GET /api/v1/runtime/bootstrap` 返回 `feature_flags`（enabled=1 项，`{key: typed_value}`）。

#### Scenario: 下发
- **WHEN** 开关 enabled=1
- **THEN** bootstrap 返回其 typed value；enabled=0 不返回

### Requirement: 桌面端功能开关应用与 4K 开关
`OpsCenterSync` 应用并持久化 `feature_flags`（仅基本类型值、≤100 项，非法结构 fail-closed 空对象；恢复路径同样归一化）；`getFeatureFlag(key)` 仅返回自有属性且拒绝 `__proto__`/`constructor`/`prototype`；渲染端经 `opsCenterSyncRuntime` 读取。4K 能力开关读取优先级：环境变量 → 运营功能开关 → store → 默认 1080p；引擎 compose/renderSegment 惰性读取当前值（fail-closed）。

#### Scenario: 4K 开关
- **WHEN** 运营功能开关 `videoCreation.maxOutputResolution`='4k' 且引擎构造期快照为 1080p
- **THEN** compose 4K 输出不被能力闸拦截（惰性读取生效）
- **WHEN** 运营功能开关回退 '1080p'
- **THEN** 4K 输出被拒绝（fail-closed）
