# Design: story2video-bgm-notice

## 1. 通知层（单一 i18n 来源）

- `STORY2VIDEO_NOTIFICATION_KEYS.BGM_SKIPPED = 'story2video.bgm_skipped'`
- zh：`背景音乐已跳过（{reason}），成片不含背景音乐。` en：`Background music was skipped ({reason}). The video has no background music.`
- `bgmSkippedReasonText(reason, locale)`：size_exceeded=「文件超过大小上限」/format_unsupported=「格式不支持」/not_allowed=「文件不在允许的读取范围」/unreadable=「文件不存在或不可读」；未知 code 回退 unreadable 文案。
- `formatBgmSkippedNotification(reason, locale)` 返回 `{ messageKey, message }`（复用 `messageFor`）。
- `MODEL_API_KEY_PATTERN` 拆分：`API_KEY_UNCONFIGURED_PATTERN`（not configured/尚未配置/未配置/未设置）、`API_KEY_MISSING_PATTERN`（missing api key/api key required/no api key/未找到）、`API_KEY_DECRYPT_PATTERN`（api-key 上下文 decrypt failed/解密失败），组合为 `MODEL_API_KEY_PATTERN`（行为不变，现有测试锁定）。

## 2. CreateView 提示条

- 模板：在 provider-warning-banner 后加 `bgm-skipped-notice`（`v-if="story2videoBgmSkippedNotice"`，含关闭按钮 `data-testid="dismiss-bgm-skipped-notice"`）。
- computed `story2videoBgmSkippedNotice`：`orchestrationContext?.compose?.bgmSkipped === true` 且 `!dismissedBgmSkippedNotice` → `formatBgmSkippedNotification(reason).message`；否则 ''。
- `updateOrchestrationStatus` 每次轮询重算（compose 阶段 output 写入 context.compose 后自动出现）；新运行 `startPipeline` 与关闭按钮重置 dismissed；`cancelPipeline` 清空。

## 3. GC 惰性触发

- `story2video-paths.js`：模块级 `let _lastImportedMediaGcAt = 0`；`importUserSelectedMedia(..., { gcIntervalMs = 60*60*1000 })` 在复制前若 `Date.now() - _lastImportedMediaGcAt >= gcIntervalMs` 则 best-effort `gcImportedMedia({ baseDir })`（失败静默），并更新时间戳；`gcIntervalMs: 0` 强制每次触发（测试用）。
- 与启动时 `gcImportedMedia()`（ipc-handlers/index.js 生产接线）互补。

## 测试映射

| 场景 | 测试 |
|---|---|
| BGM_SKIPPED 4 原因中英文案 | notifications.test.js |
| key 目录完整（zh/en 均有） | notifications.test.js 既有遍历 |
| MODEL_API_KEY_PATTERN 拆分后行为不变 | notifications.test.js 既有 decrypt/missing 用例 |
| context.compose.bgmSkipped → 提示条显示 | CreateView.test.js |
| 无跳过/已关闭 → 不显示 | CreateView.test.js |
| 导入触发惰性 GC（间隔到期删旧文件） | story2video-paths.test.js |
| 间隔内不重复触发 | story2video-paths.test.js |
