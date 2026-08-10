# story2video-bgm-notice Specification

## Purpose
让「BGM 被跳过」成为用户可见的 i18n 提示（消费 compose 已产出的 `bgmSkippedReason`），并为 selected-media 提供惰性老化回收、拆分 API-Key 错误正则便于维护。
## Requirements
### Requirement: BGM 跳过通知（i18n）

系统 SHALL 提供 `BGM_SKIPPED` 通知（zh/en），按 `bgmSkippedReason`（size_exceeded/format_unsupported/not_allowed/unreadable）本地化原因文案；未知 code 回退 unreadable 文案。服务层不得以硬编码中文作为最终用户文案的唯一来源。

#### Scenario: 四类原因本地化

- **WHEN** 传入 `bgmSkippedReason = 'size_exceeded'`
- **THEN** `formatBgmSkippedNotification` 返回含「文件超过大小上限」的中文消息（en 对应英文）

### Requirement: 前端展示 BGM 跳过提示

图片轮播结果 SHALL 在 `run.context.compose.bgmSkipped === true` 时显示可关闭提示条（i18n 文案，含 `data-testid="story2video-bgm-skipped-notice"`），并在新运行启动或用户关闭后不再显示。

#### Scenario: 完成态显示提示条

- **WHEN** `orchestrationContext.compose = { bgmSkipped: true, bgmSkippedReason: 'unreadable' }` 且运行完成
- **THEN** 提示条可见且文案含「背景音乐已跳过」

#### Scenario: 关闭后隐藏

- **WHEN** 用户点击关闭
- **THEN** 提示条隐藏，直到下一次运行再次出现 `bgmSkipped`

### Requirement: 导入时惰性老化回收

`importUserSelectedMedia` SHALL 以可配置间隔（默认 1 小时）best-effort 触发 `gcImportedMedia`（删除超过保留期的过期导入文件），失败静默不阻塞导入；与启动时回收互补，覆盖长会话场景。

#### Scenario: 间隔到期触发

- **WHEN** 距上次 GC 超过 `gcIntervalMs` 且导入目录存在过期文件
- **THEN** 导入成功后过期文件被删除

#### Scenario: 间隔内节流

- **WHEN** 距上次 GC 未超过 `gcIntervalMs`
- **THEN** 不重复扫描清理

### Requirement: API-Key 正则拆分

`MODEL_API_KEY_PATTERN` SHALL 拆分为命名子模式（未配置/缺失/解密失败）再组合，行为与拆分前一致（既有正反例测试锁定）。

#### Scenario: 行为不变

- **WHEN** 错误包含 `Missing API key` 或 api-key 上下文 `decrypt failed`
- **THEN** 仍映射 `MODEL_API_KEY_REQUIRED`

