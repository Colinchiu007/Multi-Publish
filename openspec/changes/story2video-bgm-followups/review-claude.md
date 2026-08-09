# Review: story2video-bgm-followups (Claude 独立审查)

- 后端：claude（codeagent-wrapper）；antigravity 降级（`agy` 缺失，2026-08-10 记录）。
- 结论：**Critical 0**。

## 合入前已修复（审查发现）

- W1 `model-provider-manager.js`：存量清洗（trim/去空/去重）仅在回填新预设模型时落库，单独清洗被丢弃 → 清洗前后差异并入 `modelsChanged` 持久化；补「预设已全部存在但存量脏数据」测试。
- W2 `ipc-handlers/story2video.js`：`gcImportedMedia()` 副作用硬编码在 registerHandlers 且不可注入，测试环境会触碰真实临时目录 → 改为 `deps.runImportedMediaGc === true` 才执行 + `deps.gcImportedMedia` 可注入；生产接线在 `ipc-handlers/index.js` 传 `runImportedMediaGc: true`。
- W3 `story2video-compose-engine.js`：无扩展名文件被误判 `unreadable` → 去掉 `extension &&` 守卫，空扩展名归 `format_unsupported`；补无扩展名用例。
- Info `not_allowed`：可读未超限但不在允许根目录 → 新增第 4 个机器码 `not_allowed` 与中文文案；补越界用例。

## 记录为后续项（不阻塞）

- `diagnoseBgmSkipReason` 用 `MAX_BGM_FILE_BYTES` 判超限，自定义 `maxInputFileBytes < 15MB` 时可能误报（生产默认一致，启发式局限注释）。
- `bgmSkippedReason`/`warnings` 尚无前端消费者，接线任务需明确归属；BGM 警告为中文硬编码，后续由 renderer 依 reason 本地化。
- `MODEL_API_KEY_PATTERN` 复杂（7 分支嵌套），建议拆分命名子模式；`decryption failed` 无邻近 api-key 不命中属可接受取舍。
- `gcImportedMedia` 仅启动一次，长会话内仍会增长；建议低频定时/惰性触发。
- 测试覆盖缺口：`story2video.test.js` 未注入 GC stub（现已被 runImportedMediaGc 门控，无真实目录风险）、诊断函数的符号链接边界未测。
