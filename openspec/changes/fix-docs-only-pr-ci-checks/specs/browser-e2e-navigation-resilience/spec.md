## ADDED Requirements

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
