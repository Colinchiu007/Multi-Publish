## Why

结果页「重试图片/重试视频」失败时用户只看到「当前操作未能完成，请稍后再试。」。服务层未校验图片生成器返回码，把 provider 真实原因（余额不足/限流/API Key/内容审核）替换成误导性存储错误；渲染层 catch 丢弃 error.message 并绕过既有错误归一化；主进程 handler 也不记日志。用户无法得知失败原因，故障也无法诊断。

## What Changes

- 服务层：`retrySegment` 与 `generateSceneImage` 校验 `generateImage` 返回结果（`code === 0` 且产物路径存在），失败时上抛原始 provider message（缺失时回退「图片生成失败」），不再落入 `_copyRequired` 的误导性「产物不存在」错误。
- 渲染层：`retrySegment` catch 把 `error.message` 交给 `showStory2VideoNotification` 走既有错误归一化（quota/rate-limit/API Key/权限等已映射类别显示具体文案），不再固定显示 `operation_failed`；未映射类别维持 operation_failed 兜底。
- 主进程：`story2video:retry-segment` 等关键 handler catch 增加 warn 级日志，保留可诊断痕迹。
- 回归测试：服务层新增 generateImage 失败用例（错误保留 + 回滚旧媒体 + 清理本次产物）；渲染层新增重试失败用例（错误文本进入通知归一化）。

## Capabilities

### New Capabilities

- `story2video-retry-error-transparency`: 分段重试/场景图片生成的失败原因透出契约——错误原样保留、渲染层归一化展示、主进程日志留痕，禁止把真实原因掩盖成通用失败文案。

### Modified Capabilities

（无。既有 `video-creation-failure-diagnostics` 面向 run 级失败分类，本次为段级重试/生成操作的错误透出，属于独立能力。）

## Impact

- `apps/desktop/electron/services/story2video-project-service.js`：retrySegment / generateSceneImage 增加结果校验。
- `apps/desktop/electron/ipc-handlers/story2video.js`：retry-segment catch 增加 warn 日志。
- `apps/desktop/src/views/ResultView.vue`：retrySegment catch 透传错误文本。
- `apps/desktop/electron/services/story2video-project-service.test.js`、`apps/desktop/src/views/ResultView.test.js`：新增回归用例。
