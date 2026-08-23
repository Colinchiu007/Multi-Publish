# Design — 分段重试错误透出

## 现状与缺陷链

`ResultView.vue L301 重试图片` → `retrySegment() L1097-1124` → `story2video:retry-segment`（ipc-handlers/story2video.js L135-144）→ `Story2VideoProjectService.retrySegment()`（L679-743）。

两层掩盖：
1. **服务层（L700-705）**：`generateImage` 返回 `{ code: -1, message: <真实原因> }` 时未校验，`generatedPath` 为 undefined 直接进 `_copyRequired`（L427-431）抛「Story2Video 产物不存在、不可读或超出限制」。同文件 `generateSceneImage()`（L1197-1202）同样缺陷；对照 `regenerateSceneAudio()`（L985-986）的 `!generatedPath → throw generated?.message` 守卫——它只校验「路径缺失」、不校验 `code !== 0`，是更弱的守卫（本次新增守卫多查 code，更严格；`regenerateSceneAudio` 的 code 校验列为 follow-up，本次范围外）。
2. **渲染层（L1115-1118）**：catch 调 `showStory2VideoOperationFailure()` 传固定 `OPERATION_FAILED`，丢弃 `error.message`，绕过 `story2video-notifications.js resolveMessageKey()`（L234-261）的归一化（QUOTA_EXCEEDED / RATE_LIMITED / MODEL_API_KEY / ACCESS_DENIED 等模式已存在）。其他方法（selectSceneMaterial L587、generateSceneImage L636）均传 error 文本。
3. **IPC（L143）**：catch 只返回 message 不记日志。

## 方案

### a) 服务层：结果校验（retrySegment + generateSceneImage）

在 `_copyRequired` 之前：

```js
const generatedPath = generated?.data?.path || generated?.data?.image_path || generated?.path
if (!generated || generated.code !== 0 || !generatedPath) {
  throw new Error(generated?.message || '图片生成失败')
}
```

保持既有失败回滚路径（catch 中保留旧媒体、清理 attemptFiles、持久化 failed + error）。

### b) 渲染层：错误透传给归一化

`retrySegment` catch 改为：

```js
} catch (error) {
  await this.refreshSegmentImageUrls().catch(() => {})
  this.showStory2VideoNotification({ error: error?.message || '' })
}
```

对齐同文件 selectSceneMaterial L587 的既有模式。已映射类别（余额/限流/API Key/权限/内容审核等）显示具体本地化文案；未映射类别由 resolveMessageKey 回退 operation_failed，不新增文案、不泄露内部路径。

### c) 主进程：warn 日志

`story2video:retry-segment` catch 增加 `log.warn`（handler 模块已可访问 logger，实现时确认），记录 request 摘要与 error.message。

## 影响面与风险

- 成功路径零改动；仅失败路径的文案与日志变化。
- 不新增 locale key（复用既有归一化与 operation_failed 兜底），满足 i18n-content-sync。
- 回归保护：服务层 2 个新用例（generateImage 失败、generateSceneImage code≠0）；渲染层 1 个新用例（重试失败 → 通知归一化断言 quota 文案）。
- 风险：错误 message 可能包含 provider 原始文本，归一化仅透出已映射类别，未映射类别不显示原文，避免内部信息暴露。
