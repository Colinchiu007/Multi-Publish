# Tasks — s2v-retry-image-error-masking

进度唯一来源（openspec-integration Requirement: 进度单一来源）。

## 实施

- [x] 服务层：`story2video-project-service.js` `retrySegment()` 在 `_copyRequired` 前校验 `generateImage` 结果（`code === 0` 且产物路径存在），失败 `throw new Error(generated?.message || '图片生成失败')`
- [x] 服务层：`generateSceneImage()` 同样校验（同缺陷类）
- [x] 渲染层：`ResultView.vue` `retrySegment` catch 改为 `showStory2VideoNotification({ error: error?.message || '' })`
- [x] 主进程：warn 日志（含错误 message）——实现落点在 `story2video-project-service.js` 的 `retrySegment` / `generateSceneImage` catch（覆盖两个入口且与持久化失败状态的路径同一处），未改 `ipc-handlers/story2video.js`（其 catch 仅透传 `error.message`，服务层日志已满足 spec 场景）

## 回归测试（spec 场景映射）

- [x] `story2video-project-service.test.js`：generateImage 返回 `{ code: -1, message: '余额不足' }` → retry 拒绝且错误保留、旧媒体保留、本次产物清理、分段 failed + error 持久化（spec：分段重试失败保留真实原因）
- [x] `story2video-project-service.test.js`：generateSceneImage code ≠ 0 同样保留错误（spec：同上）
- [x] `ResultView.test.js`：重试失败 → 通知 messageKey 为 quota 类而非 operation_failed（spec：渲染层错误归一化展示）
- [x] 审查落实（Claude APPROVE 0C/2W/5I）：两服务用例补 `log.warn` 断言（spec R3 日志场景自动化）；ResultView 补未映射兜底用例（messageKey=operation_failed、raw 文本不进弹窗，spec R2 场景 2）；design.md 修正 regenerateSceneAudio 参照物措辞（路径守卫 ≠ code 校验）

## 验证

- [x] 运行 `story2video-project-service.test.js`（61 passed）+ `ResultView.test.js`（51 passed）+ `story2video-notifications.test.js`（26 passed）
- [x] QM-1：`cd apps/desktop && pnpm exec electron-builder --win --dir`（改动含 electron/ 代码）
- [x] openspec validate 通过（本 change PASS；其余 3 个失败为其他分支存量 change）
- [x] 提交、推送、创建 PR
