# browser-e2e-navigation-resilience Specification

## Purpose
定义 Windows Browser E2E 与打包电影工程 E2E 的有限恢复合同：精确、可观察的瞬态错误恢复不得掩盖真实失败，慢速 fallback 必须在有界时间内产生可分类终态。
## Requirements
### Requirement: Browser E2E 导航瞬态错误恢复

`FunctionalRunner` 的 `goto` 和 `resetToRoute` SHALL 通过同一导航策略调用 Playwright。仅当 `page.goto` 抛出的错误消息包含精确标识 `net::ERR_NO_BUFFER_SPACE` 时，该策略 SHALL 在短暂延迟后额外尝试一次；任何其他错误以及第二次失败 SHALL 原样抛出。`waitForAppReady` SHALL 仅在导航调用成功返回后执行。

#### Scenario: 瞬态缓冲错误恢复后就绪

- **WHEN** 第一次 `page.goto` 抛出包含 `net::ERR_NO_BUFFER_SPACE` 的错误，第二次成功
- **THEN** runner 恰好调用两次 `page.goto`，记录一次恢复动作，并在第二次成功后调用 `waitForAppReady`

#### Scenario: 非匹配错误立即失败

- **WHEN** `page.goto` 抛出不包含 `net::ERR_NO_BUFFER_SPACE` 的错误
- **THEN** runner 不重试、不等待应用就绪，并原样抛出该错误

#### Scenario: 重试耗尽仍失败

- **WHEN** 两次 `page.goto` 都抛出包含 `net::ERR_NO_BUFFER_SPACE` 的错误
- **THEN** runner 在第二次后停止，并原样抛出第二次错误，不调用 `waitForAppReady`

#### Scenario: 重置导航一致应用恢复策略

- **WHEN** `resetToRoute` 遇到一次匹配的瞬态错误后成功
- **THEN** 它使用与 `goto` 相同的恢复策略，并仅在成功后以调用方的 ready timeout 等待目标路由

### Requirement: 打包电影工程 E2E 捕获延迟生成终态

电影工程打包 E2E SHALL 在点击生成后等待既有的成功、Provider/配置阻断、生成失败或参数校验终态消息，观察预算 SHALL 为 30 秒。测试模块被 node:test require 时 SHALL NOT 启动 Electron；`waitForToast` SHALL 可独立验证延迟到达的匹配消息。

#### Scenario: fallback 终态在旧窗口后到达

- **WHEN** Windows 打包 fallback 在 15 秒之后、30 秒之前产生 `生成失败` 消息
- **THEN** E2E 捕获该消息并将结果分类为生成失败，而不是报告未知结果

#### Scenario: 合同导入不启动应用

- **WHEN** node:test require 电影工程 E2E 模块以验证等待 helper
- **THEN** 该模块不启动 Electron、也不依赖本地打包 exe
