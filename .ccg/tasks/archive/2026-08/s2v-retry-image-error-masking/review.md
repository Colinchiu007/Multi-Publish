# Review — s2v-retry-image-error-masking

## 审查方式
- 双模型并行 wrapper：antigravity + Claude（reviewer.md）。
- antigravity：`Error: Eligibility check failed ... not currently available in your location` —— 地区不可用，**降级记录**（与既往会话一致）。
- Claude：codeagent-wrapper --backend claude 独立审查（约 11 分钟）返回 **0 Critical / 2 Warning / 5 Info**。

## Claude 结论处置
- **Critical：0**
- **Warning（2，全部落实）**：
  - **W1** 两服务用例未注入 `log:{warn:vi.fn()}`、warn 日志无断言 → 用例补注入并断言 `expect(warn).toHaveBeenCalledWith(expect.stringContaining('余额不足'))`。
  - **W2** `design.md` 以 `regenerateSceneAudio` 作参照物措辞失准（该函数是路径守卫、非 code 校验）→ 措辞修正；TTS 同族校验留 follow-up。
- **Info（5）**：
  - **I1-I4**（code 缺失边界、IPC 日志落点、孤立输出目录、VOICE_INVALID 参数）评估可接受，未改，记录于 change/design.md。
  - **I5** 渲染层未映射兜底用例缺失 → `ResultView.test.js` 补「未映射回退」用例（messageKey=`story2video.operation_failed`，raw 文本不进弹窗；实测 `resolveStory2VideoNotification` 兜底为 operation_failed，非 unknown_error）。

## 验证
- `story2video-project-service.test.js` 61 passed（+2 服务用例含 warn 断言）；`ResultView.test.js` 51 passed（+1）；`story2video-notifications.test.js` 26 passed；eslint 干净。
- QM-1：`electron-builder --win --x64 --dir --publish never` exit 0。
- 合并后定向重跑：story2video-project-service + story2video IPC handler 87 passed（含 #879 并入后的合并语义）。