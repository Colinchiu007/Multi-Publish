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
5. **长文案 + 视频模型**：✅ 排队/限流部分已实测（2026-08-06）：1400+ 字文案拆 27 场景，27 TTS（minimax-tts rpm20 → 中位间隔 2.94s）+ 27 图片（minimax-image 并发 2）全部成功，仅 1 次排队超时被重试恢复，无 429 整线失败；compose 因 ffmpeg x264 内存不足失败（见新待办 D）。剩余：配置视频生成模型后 videogen 路径的额度/排队表现。

## 下次重测步骤
1. 确认 profile 已配置所需模型（视频生成模型等），模型 enabled=1。
2. 停应用 → 起独立 vite（5174）→ 运行 `C:\tmp\e2e-pipelines.js`（或 UI 手动逐条）。
3. 结果写入 `STORY2VIDEO-E2E-REPORT.md`，逐项勾销本清单；真实账号验收项单独记录证据（request id 不展示）。

## 待办 D：25+ 场景 compose 渲染资源限制（✅ 已修复，PR #376）
- **现象**：27 个场景（720x1280）合成时，单条 ffmpeg 命令构建 27 路 xfade/acrossfade 图，x264 报 malloc of size 1586256 failed 失败（环境内存不足）。
- **影响**：W2/W3 排队验证不受影响（资源生成阶段全部成功）；但超长流水线的 compose 需要拆分渲染或限制单命令输入路数。
- **修复**：compose 分块合成（单命令 ≤8 路输入，块内 xfade + 递归合并中间文件），25+ 场景不再触发单命令内存失败；真实 ffmpeg 验证 10 段分块合成产出 16.39s 视频。