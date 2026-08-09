# 视频创作 E2E 待办 / 待验证清单（2026-08-06）

> 记录本轮 E2E（12 条已实现流水线）中因条件不足无法验证、或失败待重测的项。
> 已跑通项见 `01-docs/STORY2VIDEO-E2E-REPORT.md`。复现脚本 `C:\tmp\e2e-pipelines.js`（`E2E_FILTER` 指定子集）。

## 待办 A：配置视频生成模型后重测（4 条 videogen 流水线）
- **前置**：在 设置-模型设置 配置并启用任一 type=video 的默认 provider（Agnes Video / CogVideo / Runway / Kling / Veo 等）。
- **流水线**：`animation`、`avatar-spokesperson`、`character-animation`、`hybrid`
- **当前状态**：引擎可正常推进至 animate/merge 阶段并 fail closed（`VIDEO_MODEL_NOT_CONFIGURED`，给出配置引导）；配置模型后应产出真实视频并回归本清单。
- **重测命令**：`E2E_FILTER=animation,avatar-spokesperson,character-animation,hybrid node C:\tmp\e2e-pipelines.js`

## 待办 B：实现引擎后重测（无引擎流水线）
- ✅ **`podcast-repurpose`（音频 → 可视化视频）已实现引擎（2026-08-07）**：analyze（ffprobe 时长 + 文案分句/语音识别转写）→ visualize（每段生成配图）→ assemble（ffmpeg 切分音频片段 + 组装场景）→ render（内置 compose 合成，fade 转场）。`available=true`。待重测：真实音频 → 成片 E2E（含无文案时语音识别转写路径）。
- ⏳ `screen-demo`（录屏 → 自动标注）：`available=false`，UI 标记开发中、启动禁用；录屏采集与自动标注为独立工作流，按下一优先级实现。

## 待验证 C：真实供应商/账号验收（需真实账号、API、素材）
1. **TTS 音色克隆上传**（MiniMax voice_clone）：真实上传 → 克隆 → 下拉选择 → 用克隆音色生成成片；含 7 天未调用被清理的边界提示。
2. **个人音色槽位**（Doubao 等）：官方控制台创建个人音色 + `listVoices` 官方 API 证据 → 下拉展示并设为默认。
3. **图片生成敏感词降级**：真实 provider 命中内容政策 → 5 次安全化改写 → `needs_user_input` → 修改文案重启；确认提示友好、不伪造成功。2026-08-07 补充：MiniMax 类「HTTP 200 但 `image_urls` 为空」的静默拒绝已纳入合同（adapter 显式抛错 + 重试循环内校验，5 次后 `needs_user_input(reason=empty_result)`，PR #384），真实 provider 命中该路径的端到端证据仍待补。
4. **媒体流水线真实素材**：talking-head / cinematic / clip-factory / localization-dub 目前用 12s 样例视频验证流程；真实用户素材的字幕、调色、片段提取、配音替换效果待验收。
5. **长文案 + 视频模型**：✅ 排队/限流部分已实测（2026-08-06）：1400+ 字文案拆 27 场景，27 TTS（minimax-tts rpm20 → 中位间隔 2.94s）+ 27 图片（minimax-image 并发 2）全部成功，仅 1 次排队超时被重试恢复，无 429 整线失败；compose 因 ffmpeg x264 内存不足失败（见新待办 D）。剩余：配置视频生成模型后 videogen 路径的额度/排队表现。

## 下次重测步骤
1. 确认 profile 已配置所需模型（视频生成模型等），模型 enabled=1。
2. 停应用 → 起独立 vite（5174）→ 运行 `C:\tmp\e2e-pipelines.js`（或 UI 手动逐条）。
3. 结果写入 `STORY2VIDEO-E2E-REPORT.md`，逐项勾销本清单；真实账号验收项单独记录证据（request id 不展示）。

## 待办 E：2026-08-08 系列修复真实验收（需真实 provider/账号/素材）

> 对应 PR #397-400、#402；代码/单测/CI 不能替代真实 provider 与真实成片行为。

1. **MiniMax 异步 T2A 成片**：✅ **已通过（2026-08-08，真实 provider）**。真实复测发现并修复两层问题：① 克隆音色 `voice_id="01"` 不合规（官方要求长度 [8,256]/首字符英文字母）→ `invalid params, voice id wrong`（PR #413：合规生成 + 失效标记 + 偏好回退默认音色）；② 官方查询接口把 `status/file_id` 放响应**顶层**、实现只读 `data.*` → 90s 查询超时（PR #414：顶层与 data 双层兼容）。修复后 `minimax-tts synthesize success（约 13s）`，**图片 1/1 · 旁白 1/1**，成片 20s 生成，视频预览可见旁白与分段音频。待办 C-1（用克隆音色生成成片）仍需真实重新克隆后验证。
2. **分段图片显示**：真实流水线完成后进入视频预览页，确认【分段编辑】每段图片可见（媒体服务 image/* Content-Type）。
3. **下载视频/分段/旁白**：点击各下载按钮弹出系统保存对话框，确认文件成功保存；取消不提示；路径选择任意位置（如桌面/下载目录）。
4. **失败任务历史展示**：真实流水线失败后重启应用，进入【历史记录】确认失败任务仍在且状态「生成失败」；从断点继续成功后旧失败记录不残留。
5. **provider 异常横幅**：配置一个慢/超时的真实 provider，流水线运行中确认顶部非阻塞横幅出现且不阻断运行；【模型设置】切换后横幅消失。

## 待办 D：25+ 场景 compose 渲染资源限制（✅ 已修复，PR #376）
- **现象**：27 个场景（720x1280）合成时，单条 ffmpeg 命令构建 27 路 xfade/acrossfade 图，x264 报 malloc of size 1586256 failed 失败（环境内存不足）。
- **影响**：W2/W3 排队验证不受影响（资源生成阶段全部成功）；但超长流水线的 compose 需要拆分渲染或限制单命令输入路数。
- **修复**：compose 分块合成（单命令 ≤8 路输入，块内 xfade + 递归合并中间文件），25+ 场景不再触发单命令内存失败；真实 ffmpeg 验证 10 段分块合成产出 16.39s 视频。
- **2026-08-09 追加（同 class 不同触发点）**：27 场景 run 在 `generate_assets` 全部成功（27 图+27 旁白）后，compose 第 13 段失败——单段「2x 工作分辨率 zoompan」（1080p 输出 → 3840x2160 画布）编码速度约 10-20fps，20.79s 片段需 40s+，被固定 30s 片段编码超时误杀。修复：`computeSegmentEncodeTimeoutMs` 按「时长×帧率」估算（最低 30s/上限 5min），编码失败时工作分辨率降档重试（2x→1.5x→1x）。真实 ffmpeg 验证 20s/1080p 段 23.5s 编码成功，单元测试覆盖超时公式与降档循环。
- **2026-08-09 追加（4K 能力开关）**：4K（3840x2160）输出在「2x 中间分辨率」下会产生 8K 中间画布，资源/时长爆炸；且图片生成只传 aspect_ratio 并非真 4K。新增运营开关 `videoCreation.maxOutputResolution`（默认 `1080p` 禁止 4K，`4k` 开启；env `MAX_OUTPUT_RESOLUTION` 可覆盖）：compose/renderSegment fail-closed 拒绝 4K；前端两处分辨率选项、模板、历史恢复不出现/归一化 4K；中间分辨率长边封顶 3840 且保持宽高比。回归：engine 82 + CreateView 108 + 单点 8 测试通过。

## 待办 E：后台并发专项重测（2026-08-07 新增）
- **已实测（`C:\tmp\e2e-concurrency.js`，真实 minimax-tts/minimax-image/agnes-llm/sensenova-llm）**：
  1. ✅ 2 条流水线并行启动成功；`pipeline:history` 返回运行中任务（含阶段状态）；切到其他模块后仍在 `generate_assets` 后台继续运行。
  2. ⚠️ 第 3 条未被拒绝：本机高配，自适应并发上限=4，3 条并发在设计范围内；「超限拒绝 + 友好提示」仅由引擎单测覆盖（注入上限 1/2），真实应用内触发需低配环境或设固定上限开关。
- **PR #384 修复已确认（2026-08-07，`C:\tmp\e2e-confirm.js`）**：
  - ✅ ② compose 转场：3 场景轮多段 xfade 路径成功（成片 `s2v_1786089323107_1_output.mp4`，33.2s/2.3MB），`xfade=transition=undefined` 不再出现。
  - ✅ ① MiniMax Image：3 场景 generate_assets 全部完成（3 图+3 TTS 均返回可用结果）；「静默 200-empty」为间歇性未复现，重试/降级由单测覆盖（adapter 显式抛错 + 5 次后 `needs_user_input`）。
- **✅ 并发上限固定开关已验证（2026-08-07，`STORY2VIDEO_MAX_CONCURRENT_RUNS=2`）**：A/B 并行启动成功；第 3 条被拒，返回 `PIPELINE_CONCURRENCY_LIMIT` + 友好文案「当前已有 2 条流水线正在运行，最多同时运行 2 条，请等待其中一条完成后再启动。」；历史仅含 2 条运行中；切模块后仍在后台运行（`C:\tmp\e2e-concurrency-report.json`，limitVerified=true）。至此待办 E 全部闭环。
- **重测命令**：`node C:\tmp\e2e-concurrency.js` / `node C:\tmp\e2e-confirm.js`（需先停已运行的应用实例，避免 profile 单实例锁冲突；报告 `C:\tmp\e2e-*-report.json`）。## 待办 F：多模态模型扩展真实验收（2026-08-08 新增）

> 用户已在【模型设置】配置 minimax-multimodal API Key（其余模型 API 已全部删除），
> 后续验证统一使用该已保存的多模态模型。

1. **多模态 LLM（MiniMax-M2.7）真实链路**：用已保存的 minimax-multimodal 跑一次「文字推理」真实调用（AI 写稿/流水线文案拆分/提示词优化），确认 OpenAI 兼容 `POST /v1/chat/completions` 生效、默认模型 MiniMax-M2.7 可用；若账号未开通该模型，按运营后台 `default_model` 调整后重测。
2. **C-1 克隆音色重新克隆 → 成片（复用多模态模型）**：真实上传音频 → 克隆 → 下拉选择克隆音色 → 用克隆音色生成完整成片（待办 C-1 原项，改为使用已保存的多模态模型验证）。
3. **sensenova-llm API Key 解密失败**：建议在【模型设置】重新填写该服务商 API Key（旧 Key 由旧版 safeStorage 加密，当前 Electron 无法解密）；重新填写后可继续使用。
4. **删除交互真实验收**：预设服务商点「删除」→ 二次确认 → 从列表隐藏；「添加服务商 → 预设目录」可重新添加并恢复。
5. **多模态表单 Base URL 隐藏**：新增/编辑 minimax-multimodal 时确认无 Base URL 输入项，保存后能力 chips 显示 4 项（文字推理/TTS语音/生图/生成视频）。
6. **运营后台模型预设设置**：登录 ops-center 后验证「预设模型」页 CRUD、默认模型预填、doc_links ≤10 校验、is_visible 开关。

## 待办 G：运行中任务持久化 + 托盘后台运行真实验收（2026-08-09 新增）

> 对应 PRD 7.1.21；代码/单测（run-state-store 16 / pipeline-engine 32 / resume 23 / shutdown 25 / window 49 / system-tray 26 / CreateView 109）不能替代真实进程行为。

1. **关闭窗口 → 托盘续跑**：启动一条流水线（图片轮播）→ 运行中关闭窗口 → 断言 Electron 进程存活、任务在后台继续推进（日志/成片），系统托盘图标可恢复窗口；无运行任务时关闭窗口直接退出。
2. **强杀重启 → 历史「运行中」可继续**：运行中 `taskkill /F` 杀进程 → 重启应用 → 历史-流水线记录出现「运行中」任务 → 点击「继续生成」从中断阶段重建续跑并出成片。
3. **完成后无残留**：续跑完成后重启应用，历史中该任务为终态（已完成/失败/已取消），不存在「运行中」残留快照。
4. **失败/取消语义回归**：失败任务仍显示「生成失败」且可「从断点继续」；取消任务显示「已取消」且不可恢复。
5. **dev 托盘图标**：dev 模式（dist 未构建）启动应用，托盘可用（内嵌占位图标），关闭运行中窗口仍隐藏到托盘。
6. **macOS（真机，前瞻）**：关闭窗口任务继续后台运行、Dock 点击恢复窗口（activate）；菜单栏图标为模板图标且深/浅色适配；运行任务时关窗不出现菜单栏残留窗口；快照读写/断点续跑与 Windows 一致。
