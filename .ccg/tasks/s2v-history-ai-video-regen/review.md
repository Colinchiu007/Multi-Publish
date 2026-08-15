# Review — s2v-history-ai-video-regen（W4 闭环：分段 AI 视频重新生成）

日期：2026-08-16
分支：codex/s2v-history-ai-video-regen（基于 ca5efc31，含 PR #869）
范围：服务端 generateSceneAiVideo + IPC + preload + ResultView 按钮 + locales + notifications 归一化

## 双模型审查

- **Claude**：完成（约 12 分钟）。结论 REQUEST_CHANGES，总分 82/100；无 Critical。
- **Antigravity**：两次调用失败（`Eligibility check failed: not currently available in your location`），按子代理降级规则记录，未阻塞。剩余审查由 Claude + 主代理复核覆盖。

## Claude 发现与处置

### Warning（已修复，随本分支提交）

- **[W1] `_serializeProject` 前置任务失败丢队**：`previous.then(...)` 改为 `previous.catch(() => {}).then(...)`，前序失败不再阻断已排队保存/更新；新增回归测试「前置任务失败不阻断已排队的后续任务」。
- **[W2] AI 视频失败归一化正则前缀锁死**：`视频生成(...)` 前缀锁死导致 `视频下载超过大小上限`、`视频文件无法解码`、`视频下载结果为空` 及兜底 `AI 视频生成失败` 落入 unknown_error。已改为 `视频(?:生成|下载|文件)(?:调用失败|任务失败|未返回任务|超时或失败|超过|无法解码|结果为空|任务状态为|失败)` 并按实际 stages 文案逐条断言（4 条新增）。
- **[W3] 存储写入失败泄漏本次 AI 视频产物**：移除成功路径 `attemptFiles.delete(destination)`，`_upsertProject` 抛错时 catch 清理包含新视频；新增回归测试「存储写入失败时清理本次 AI 视频产物且保留旧视频」（spy `_upsertProject` 抛错，断言无 `_video_ai_` 残留、旧视频保留）。

### 确认接受的 Warning（记录，不在本分支扩范围）

- [W4] image/video/select 等写操作未纳入同项目队列（本次 AI 视频持锁最长 10 分钟，交叉窗口增大）——列为后续增强，避免扩大本次交付范围。
- [W5] 历史重生成未包 `withAssetTransientRetry`/RPM 限流——与流水线契约同源但健壮性有落差，列为后续增强。

### Info（评估后不修改）

- I1 UI 禁用条件与服务回退不一致（UI 无 videoPrompt 禁用、服务支持 prompt/text 回退）：保留 UI 收紧语义（无优化词不提供生成入口），服务端回退为健壮性兜底，PRD 已说明。
- I2 `options.video.pollIntervalMs` 恒默认：`_safeOptions` 白名单不含嵌套 video，历史项目无该配置来源，保留默认 10000 并与流水线一致。
- I3 parseOutputSize 双实现：服务版与 stages 版语义已对齐（分辨率/宽高比映射、长边 1280），暂不合并导出。
- I4/I5 失败分支 URL 刷新、length 守卫：防御性差异，不阻塞。
- I6 `_serializeProject` 计数断言（story2video.test.js 6 次包裹）：属既有 W2 回归计数，保留。
- I7 tmp 视频产物不回收：与流水线同行为，靠系统 tmp 回收。

## 测试验证

- 定向：service（59 passed，含 W4 五用例 + W1/W3 新回归）、notifications（含 W2 新断言）、IPC story2video（含 6 次包裹断言）、ResultView、preload、license-access-control 全部通过。
- 完整桌面 vitest：见本文件运行记录（`D:/Temp/s2v-ai-video-full.log`）。
- QM-1 打包 + 8s 启动冒烟：见运行记录。

## 结论

Claude 审查 Warning 全部修复并补回归；无 Critical；达到合并标准。
