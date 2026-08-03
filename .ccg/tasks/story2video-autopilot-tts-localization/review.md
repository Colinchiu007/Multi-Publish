# Review: Story2Video 图片轮播自动化与 TTS 音色

日期：2026-08-03
分支：`codex/story2video-autopilot-tts-localization`

## 审查范围

- 图片轮播流水线自动执行、中文/英文名称和阶段清单。
- TTS provider/model 音色目录、用户默认音色、ElevenLabs 前台用户音色克隆。
- owner 隔离、SQLite 最小元数据、主进程文件选择与 IPC/preload 边界。
- 图片生成敏感内容失败后的安全化重试与 `needs_user_input` 终态。
- Vue UI、视觉回归、Electron 打包和 ASAR/资源闭包。
- PRD、架构文档、质量门禁记录与 CCG 任务材料。

## 外部双模型审查

按 CCG 要求并行尝试了两个 wrapper，但当前环境不提供可用后端：

- antigravity：`agy command not found in PATH`，wrapper 退出状态 1。
- Claude：wrapper 启动后以状态 1 退出，未产生审查报告。

因此不把外部审查标记为通过，也不伪造模型结论。原始错误曾短暂写入任务目录的 `.out` 文件，确认后已删除。

## 本地 Luna 审查

### Critical

- 之前发现的 TTS clone catalog wiring 问题已解决：`apps/desktop/electron/ipc-handlers/tts-voice-catalog.js` 将 owner-scoped `TtsVoiceCloneService` 注入 `TtsVoiceService`；组合回归覆盖 create → catalog → select → preference。

### Warning

- Doubao 个人音色严格保持官方控制台边界；未伪造未验收的 provider connector 或个人音色列表。
- 用户音色文件完全属于桌面端前台用户功能；不写入 OpsCenter，不暴露音频字节、base64、绝对路径或跨 owner 数据。
- 全量 TypeScript 与 desktop lint 仍有既有基线失败；本次新增文件无诊断，不将基线失败归因于本次变更。

### Info

- 后续新增 provider 时应先补官方文档合同、模型能力矩阵和持久化目录种子，再接入 clone adapter。
- 用户确认后再执行 `01-docs/UX-IMAGE-CAROUSEL-CONFIGURATION-PROPOSAL-2026-08.md` 的 UE 简化方案；本次不提前扩大范围。

## 验证结论

- 受影响测试：22 个文件、367 个用例通过。
- preload sandbox true/false、Vue build、像素视觉 17/17、目标文件 ESLint、Windows QM-1 均通过。
- 最终打包窗口可见，`window.electronAPI` 存在，TTS capability 在 public license 下正确拒绝且不崩溃。
- ASAR 解包后真实 require `@multi-publish/rpa-engine` 成功；媒体资源和 `resources/playwright-browsers/chromium-1228` 均存在。

## 结论

本地审查无未关闭 Critical；外部双模型审查因环境不可用而保持 `UNAVAILABLE`，交付时必须如实披露。变更可进入提交/PR 阶段，但 CI 仍是最终合并门禁。
