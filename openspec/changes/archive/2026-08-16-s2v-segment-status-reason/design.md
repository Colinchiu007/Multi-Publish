## Context

- 现状：`apps/desktop/src/views/ResultView.vue:210` 直接渲染 `{{ segment.status || 'completed' }}` 英文原值；分段卡片不展示 `segment.error`。
- 主进程成功写回：`story2video-project-service.js` 多处把 `status` 置 `completed` 时基于旧分段 spread（`segment = { ...old, status: 'processing' }` → 成功后 `status='completed'`），`error` 字段被原样保留。
- 既有归一化：`apps/desktop/src/story2video/story2video-notifications.js` 的 `resolveMessageKey` / `formatStory2VideoNotification` 已能把原始错误映射为本地化类别文案（QUOTA_EXCEEDED / RATE_LIMITED / API_KEY_INVALID / PROVIDER_PARAMS_UNSUPPORTED / ...），zh/en 文案已存在。
- 既有范式：`CreateViewHistory.vue` 任务级本地化状态标签（`tr('statuses.' + status)`）+ 失败行，可复用其风格。

## Design

### 1. 渲染层（ResultView.vue）

- 状态徽标：`{{ segmentStatusLabel(segment.status) }}`，映射 `story2video.segmentStatus.{completed|failed|processing|pending}`，默认 `completed` 本地化文案；保留现有 `:class="segment.status"` 与样式。
- 失败原因行（仅 `status === 'failed'` 且存在 error）：在分段头部下方输出一行可读原因，文案来自 `resolveStory2VideoNotification({ error: segment.error })` 的 `message`，按码点截断（约 120 字符）；未映射类别回退 `operation_failed` 通用文案。`completed` 状态下即使 `error` 残留也不渲染原因行与失败样式（对旧数据兜底）。
- 复用既有样式体系（新增或复用 `.history-failed-hint` 风格的小号提示块）。

### 2. 文案（locales zh/en 成对）

- 新增 `story2video.segmentStatus`（completed/failed/processing/pending 四态）；失败原因主体复用既有 `story2video.*` 归一化文案，不重复定义。

### 3. 主进程（story2video-project-service.js）

- 在各成功写回点置 `status: 'completed'` 时同步清除 `error`（`error: undefined`），失败 catch 路径保持写 `error` 不变。
- 涉及函数（实现时逐一核对）：`replaceSegmentAudio`、`regenerateSceneAudio` 成功分支、`retrySegment`（image/video 成功分支）、`generateSceneImage`、`generateSceneVideo` 成功分支、`regenerateScenePrompt` 成功后、`regenerateSceneSubtitle` 成功后、`assignSceneMaterial` 等置 completed 的写回。
- 统一改为显式字段列表，避免继续 spread 旧 `error`；JSON 序列化时 `undefined` 字段自然消失。

### 4. 测试

- 服务层（`story2video-project-service.test.js`）：曾失败分段经重试/生成成功后 `error` 为空；失败路径仍写 `error`；不破坏既有断言。
- 渲染层（`ResultView.test.js`）：failed 显示本地化标签与归一化原因；completed（含残留 error）只显示完成标签、无原因行。

## Non-goals

- 不做 `errorKey` 持久化与存储迁移（方案 C 后置，前端归一化回退可兼容旧数据）。
- 不改 IPC / 存储契约，不新增 API。