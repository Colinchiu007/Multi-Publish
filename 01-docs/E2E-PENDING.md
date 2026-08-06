# 视频创作 E2E 待办 / 待验证清单（2026-08-06）

> 记录本轮 E2E（12 条已实现流水线）中因条件不足无法验证、或失败待重测的项。
> 已跑通项见 `01-docs/STORY2VIDEO-E2E-REPORT.md`。复现脚本 `C:\tmp\e2e-pipelines.js`（`E2E_FILTER` 指定子集）。

## 待办 A：配置视频生成模型后重测（4 条 videogen 流水线）
- **前置**：在 设置-模型设置 配置并启用任一 type=video 的默认 provider（Agnes Video / CogVideo / Runway / Kling / Veo 等）。
- **流水线**：`animation`、`avatar-spokesperson`、`character-animation`、`hybrid`
- **当前状态**：引擎可正常推进至 animate/merge 阶段并 fail closed（`VIDEO_MODEL_NOT_CONFIGURED`，给出配置引导）；配置模型后应产出真实视频并回归本清单。
- **重测命令**：`E2E_FILTER=animation,avatar-spokesperson,character-animation,hybrid node C:\tmp\e2e-pipelines.js`

## 待办 B：实现引擎后重测（2 条无引擎流水线）
- `podcast-repurpose`（音频 → 可视化视频）、`screen-demo`（录屏 → 自动标注）
- **当前状态**：`available=false`，UI 标记开发中、启动禁用；不属于“缺模型”，属于“未实现引擎”独立工作流。实现后纳入 E2E。

## 待验证 C：真实供应商/账号验收（需真实账号、API、素材）
1. **TTS 音色克隆上传**（MiniMax voice_clone）：真实上传 → 克隆 → 下拉选择 → 用克隆音色生成成片；含 7 天未调用被清理的边界提示。
2. **个人音色槽位**（Doubao 等）：官方控制台创建个人音色 + `listVoices` 官方 API 证据 → 下拉展示并设为默认。
3. **图片生成敏感词降级**：真实 provider 命中内容政策 → 5 次安全化改写 → `needs_user_input` → 修改文案重启；确认提示友好、不伪造成功。
4. **媒体流水线真实素材**：talking-head / cinematic / clip-factory / localization-dub 目前用 12s 样例视频验证流程；真实用户素材的字幕、调色、片段提取、配音替换效果待验收。
5. **长文案 + 视频模型**：25+ 场景文案在配置视频生成模型后的额度/限流/排队表现（governor 时间槽排队已就绪）。

## 下次重测步骤
1. 确认 profile 已配置所需模型（视频生成模型等），模型 enabled=1。
2. 停应用 → 起独立 vite（5174）→ 运行 `C:\tmp\e2e-pipelines.js`（或 UI 手动逐条）。
3. 结果写入 `STORY2VIDEO-E2E-REPORT.md`，逐项勾销本清单；真实账号验收项单独记录证据（request id 不展示）。
