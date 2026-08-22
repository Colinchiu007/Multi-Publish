# Review

## 根因

`6f2ec3f98` 引入共享 `tryReCloneVoice` helper 时，重试回调固定调用 `assetGenerator.generateTTS`。legacy Python TTS 路径没有 `assetGenerator`，实际初次合成走 `serviceBus.callPythonSkill('generate_tts', ...)`；重克隆成功后回调访问 `undefined.generateTTS` 抛 TypeError 并被 helper 吞掉，最终返回原始音色错误。

`d2b1b31dc` 已交付 MiniMax 业务错误 fail-closed 与禁止静默切换官方音色，但未修复 TTS 后端分叉。

## 修复

- `generate_assets` 与 `finalize_assets` 均构造本地 `generateTts` 闭包，初次合成与重克隆重试复用同一后端选择。
- 存在 `assetGenerator` 时调用 `generateTTS`；否则调用 `serviceBus.callPythonSkill('generate_tts', ...)`。
- 重试只替换 `voice_id`，保留初次解析的 `voice_model`。
- 文本解析失败时不进入无意义重克隆；失败仍透传原始音色错误，不调用默认官方音色。

## 测试

- `story2video-stages.test.js`：4 条主路径（legacy/assetGenerator × generate/finalize）重克隆回归。
- `pipeline-story2video-contract.test.js`：新增真实 `PipelineEngine + StageExecutor` 调度链 E2E 回归，覆盖 legacy generate_assets/finalize_assets。
- 相关 5 文件 Vitest：`5 passed`、`309 passed`。
- `node --check` 与 `git diff --check` 通过。
- ESLint 存量 error 4 个，均在本次 diff 之外（`story2video-stages.js:2027/2034/3330/3332`），未新增。

## 打包门禁

- 默认 `dist-electron` 输出路径在本次环境中被写保护/干扰，`addWinAsarIntegrity` 多次写坏 exe；改用临时输出目录 `D:\Temp\mp-dist-electron-fix-001` 后完整打包成功。
- `app.asar` 包含 `dist/index.html` 与 `electron/services/story2video-stages.js`。
- 打包后真实 `@multi-publish/rpa-engine` require 链通过。
- packaged 启动 8 秒存活，主窗口显示，stderr 无窗口加载错误；PythonBridge 报 `spawn python ENOENT` 属当前 shell PATH 未包含 Python 的环境现象。

## 审查

- 两个内部只读审查代理：Critical 0、Major 0。
- 外部双模型审查尝试：Claude 后端不可用（`claude command not found in PATH`）；opencode 无报告，已停止。不得将外部审查标记为通过。

## 残余 Info

- `serviceBus._assetGenerator` 注入形式未单独覆盖。
- provider 返回 `{ success: false }` 而非抛异常时不触发重克隆，需按既有 provider 合同确认是否补场景。
- 组合完整流水线已在本机复跑并通过：真实 split→scene_context→optimize→select_video_scenes→generate_assets→compose→publish，ffmpeg 解码成功；publish 未启用平台时按 skipped 收尾。
