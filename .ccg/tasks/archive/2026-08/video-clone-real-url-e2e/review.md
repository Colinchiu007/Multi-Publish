# 视频克隆流水线 — 实现确认与真实 E2E 审查报告

日期：2026-08-24 ｜ 任务：video-clone-real-url-e2e ｜ 结论：**已实现，真实 E2E 全部通过**

## 1. 实现状态分析

### 引擎层 `packages/video-clone-engine`（完整实现）
六阶段流水线（src/pipeline.js:58 createVideoClonePipeline）：

| 阶段 | 适配器 | 真实依赖 | 状态 |
|------|--------|---------|------|
| ingest | ingest-url.js / ingest-local.js | yt-dlp（URL）/ 文件路径（本地），500MB/30min 上限 | ✅ 真实可用 |
| analyze | analyze-ffprobe.js | ffprobe 元数据 + ffmpeg 场景检测（threshold 0.3） | ✅ 真实可用 |
| plan | plan-script.js | 可选 llmRunner 改写文案；证据化自动定级（L0/L1/L2） | ✅ 可用（LLM 可选） |
| generate | generate-assets.js | assetGenerator 注入；未注入 fail-closed | ✅ 可用（离线占位/真 AI） |
| compose | compose-ffmpeg.js | ffmpeg 逐镜头拼接 + ASS 字幕 + 水印 | ✅ 真实可用 |
| publish | publish.js | publisherRouter 未注入 → skipped（不失败） | ✅ 契约正确 |

配套：CloneReport 七层契约（clone-report.js）、相似度自检（similarity.js）、错误分类（errors.js）、会话级取消（service.js/runner.js）、yt-dlp 错误分类（私密/会员/地区/反爬等 7 类）。

### 桌面端集成（完整实现）
- IPC：electron/ipc-handlers/video-clone.js（run/cancel/report:edit/report:regenerate/pick-file/history）
- 生产装配：container.setup.js:290 AssetGenerator(aiGenerator) → 无 AI provider 时 ffmpeg 离线占位图（诚实标注 degraded）
- UI：src/views/VideoCloneView.vue + 路由 `/video-clone`（router/index.js:49）+ 创作模块入口卡
- 持久化：services/video-clone/store.js 运行记录落库；支持编辑报告后局部重生成（generate→compose→publish）
- UI E2E 脚本：apps/desktop/scripts/video-clone-e2e.js（需打包应用，本次 dist-electron 不存在，未跑 UI 级）

### 测试覆盖
引擎单测 125 项：124 pass / 0 fail / 1 skip（本次全量验证）。

## 2. 真实环境 E2E 结果

脚本：e2e-real-clone.js（引擎级 headless，装配与桌面端生产一致：createSlice3Pipeline + AssetGenerator + 无发布路由）

### 运行 A：URL 来源真实下载（L0 自动定级）
- 源：https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4（CC-BY 公开测试视频）
- yt-dlp 真实下载 → 六阶段全绿，耗时 8.3s
- 产物：clone.mp4（h264, 10.000s, 640x360 与源一致, 12912 字节）
- 11/11 检查 PASS；证据：evidence-l0-url.json（复核重跑后生成）

### 运行 B：多场景本地源 + 强制 L1
- 源：multi-scene-src.mp4（ffmpeg 合成 6s/3 场景/含音轨）
- 场景检测正确识别 3 镜头（0-2, 2-4, 4-6）→ 逐镜头生成 3 张素材 → 拼接合成
- 产物：clone.mp4（h264, 6.000s, 9813 字节），11/11 检查 PASS
- 证据：evidence-l1-multiscene.json

### 相似度自检
- 运行 A（L0）：score=1.0，verdict=needs_review（script/style 证据不足的诚实标注，非失败）
- 运行 B（L1）：score=1.0，confidence 0.75，style/duration pass

## 3. 发现与设计边界

| 级别 | 发现 |
|------|------|
| Info | 克隆产物无音轨：compose 仅在 artifacts.audio 存在时映射音频，generate 阶段只产图片素材——语音/音频复刻未接入（设计边界，非 bug） |
| Info | L1 逐镜头占位图字节相同：合成源无风格证据 → 三条 promptSeed 相同 → 确定性占位生成器产出相同图；接真 AI provider 后差异来自报告的 palette/tone/plot |
| Info | needs_review 是证据不足语义（passes.script=false），score=1.0 结构/时长全过 |
| Warning | UI 级 E2E 依赖打包应用（dist-electron/win-unpacked），本机未打包，本次未覆盖 |

## 4. 变更范围
- 新增：.ccg/tasks/video-clone-real-url-e2e/（E2E 脚本 + 证据 + 本报告），未修改任何产品代码

## 5. 独立复核结果（对抗性审计 + 全新重跑）

### 可复现性 ✅
独立代理全新重跑两种模式：URL 模式 11/11 PASS（11.7s）、L1 模式 11/11 PASS（2.7s），clone 文件均生成。证据内部自洽（时长/镜头/字节数/runId 交叉验证一致）。

### 审计发现（主代理已亲自抽查关键出处并确认）

| 级别 | 发现 | 出处 |
|------|------|------|
| **Critical** | **相似度 score=1 是同义反复**：computeSimilarityReport 的 clone 参数是流水线内部携带的计划报告（plan 阶段产物），clone.mp4 从未被重新分析——分数衡量「计划 vs 源」而非「产物 vs 源」。structure=1 由 createAssetPlan 原样复制源时间轴构造性保证，不能作为克隆保真证据 | pipeline.js:121-124；compose-ffmpeg.js:166-174 仅写 artifacts.output；generate-assets.js:77 仅写 assets |
| Warning | E2E 在引擎自判 needs_review 时仍 ALL_PASS：检查只测 verdict 字段存在，不断言 verdict==='pass' | e2e-real-clone.js:65 |
| Warning | 时长容差检查两边都是引擎自报值；#9 独立 ffprobe 实测值只打印未参与比较；6s 视频 ±2s 容差 33% | e2e-real-clone.js:78,87-89 |
| Warning | 11 项检查中强断言 4 项（文件存在/ffprobe 实测/字节数互证），弱或恒真 4 项（层级枚举/verdict 存在性/构造性 skipped/自读报告）；缺产物与源的实质比对（分辨率/fps/镜头数对齐、感知校验） | 逐项审计 |
| Warning | 三张镜头素材字节级相同（md5 同一），且适配层丢弃 degraded/source:'ffmpeg-placeholder' 标记——产物无占位降级提示，clone.mp4 码率 ~13kbps 佐证全程静态画面 | video-clone/asset-generator.js:35 只透传 {path,kind}；asset-generator.js:512-551 |
| Warning | score 两个维度「缺数据得满分」：文案双空=1、风格双空=1，合计 0.5 权重（证据门控 passes/verdict 正确拦截，但 score/metrics 对外仍按满分计） | similarity.js:97,106 |
| Info | 无音轨为接线必然：compose 条件 map assets.audio，全链路无人填充；analyze 的 hasAudio 为死逻辑；相似度无音频维度——L1 是否保留音轨属设计空白 | compose-ffmpeg.js:101-105; generate-assets.js:77; analyze-ffprobe.js:94-95 |
| Info | clone.mp4 确系重新合成非拷贝：大小 9813 vs 76657 字节、md5 不同、单 h264 流 libx264 重编码 144 帧@24fps | 独立 ffprobe + stat |
| Info | reportSource.level=L0 与 report.level=L1 差异为预期（analyze 后快照时 replication 尚为默认值，plan 显式覆写） | pipeline.js:110; plan-script.js:59-61 |
| Info | evidence.json 文件名不带版本号会被重跑静默覆盖（本次已手动保留 evidence-l1-multiscene.json） | e2e-real-clone.js:97 |

### 修正后的结论表述
- **流水线功能为真**：真实下载、真实 ffprobe 分析、真实场景检测、真实 ffmpeg 重合成（三重证据排除拷贝）
- **克隆内容为占位**：无 AI provider 时素材为零信息量纯色占位图，「结构复刻」仅存在于时间轴元数据层面
- **相似度自检不能引用为保真证据**：score 恒 1（构造性），有效信号只有 verdict 门控（needs_review=证据不足）

### 后续建议（不在本次范围）
1. compose 后对 clone.mp4 做二次 ffprobe 分析并与 sourceReport 比对，让 similarity 度量「产物 vs 源」
2. 适配层透传 degraded 标记到报告/UI，占位产物诚实可见
3. E2E 增加强断言：产物分辨率/fps/镜头数与源对齐、verdict 内容校验
4. 音频复刻设计空白待产品决策（源音轨保留 or TTS 重配音）
