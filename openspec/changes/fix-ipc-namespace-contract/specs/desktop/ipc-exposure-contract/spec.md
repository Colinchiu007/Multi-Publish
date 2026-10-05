## Purpose

规定渲染层经 `invokeWithFallback` 调用 Electron 能力时，调用名必须真实存在于 preload 实际暴露面（扁平键或命名空间成员），并要求存在一条跨两侧的反向对账测试，使「调用名不存在 ⇒ 桥接层静默返回 `undefined` ⇒ 功能永久失效且界面零报错」这一形状无法进入主干。

## ADDED Requirements

### Requirement: 调用名与 preload 暴露面必须双向对账

渲染层在 `src/api/**` 中经 `invokeWithFallback("<方法名>", ...)` 发起的每一次调用，其 `<方法名>` SHALL 能在 preload 实际暴露面上找到对应项——或为 `window.electronAPI` 上的扁平键，或为某个命名空间对象下的成员方法。系统 SHALL 存在一条契约测试，执行该对账并在缺失时判红。

#### Scenario: 扁平调用名在暴露面完全不存在

- **WHEN** 渲染层以 `filmEngineeringRetryShot` 发起调用，而 preload 只在 `filmEngineering` 命名空间下暴露 `retryShot`、不存在该扁平键
- **THEN** 对账测试判红，并明确点名该调用名不在暴露面内
- **AND** 该缺陷不得因为 preload 侧测试全绿、渲染层测试把 `@/api/publisher` 整体 mock 掉而放行

#### Scenario: 调用名以命名空间成员形式存在

- **WHEN** 渲染层改为经命名空间成员调用（如 `filmEngineering.retryShot`），而 preload 确实在同一命名空间下暴露 `retryShot`
- **THEN** 对账测试判绿，不因命名空间嵌套而误报

#### Scenario: 合法调用不得被误伤

- **WHEN** 调用名对应的 preload 暴露项存在，但写法含成员空格、方括号访问、可选链或跨行等形态
- **THEN** 对账测试仍判绿；判据须按语义解析而非字符邻接，否则下一个会话会直接把锁删掉

### Requirement: 对账失败必须是阻塞级门禁

对账测试失败 SHALL 使 CI 判红并阻塞合并，不得以 advisory 观察态或告警形式放行——因为该类缺陷在生产侧的表现是「功能永久失效且无任何错误提示」，观察态等于不设防。

#### Scenario: 提交引入一个不存在的调用名

- **WHEN** 某个 PR 新增了一处 `invokeWithFallback("<新调用名>", ...)`，而 preload 未暴露该名
- **THEN** CI 判红且该 PR 不得合并，直到调用侧改对或 preload 补上暴露

#### Scenario: 删除 preload 已暴露且被调用的能力

- **WHEN** 某个 PR 从 preload 暴露面移除了一个仍被渲染层调用的方法
- **THEN** 对账测试判红，该移除不得单独合入

### Requirement: 扫描域必须显式登记并有棘轮自检

对账测试的扫描域 SHALL 以显式文件清单登记在测试内，并 SHALL 包含一条自检：`src/api/**` 下每个含 `invokeWithFallback` 调用的文件都已在扫描域内。已知边界是静态抽取只认写死清单，新增同用途文件不会自动被守——本条要求即为该边界的兜底。

#### Scenario: 新增一个含调用的 api 文件但未纳入扫描域

- **WHEN** 新增 `src/api/` 下的某个文件且其中含 `invokeWithFallback` 调用，但该文件未被加入扫描域清单
- **THEN** 棘轮自检判红，强制显式登记，而不是静默失去守护
