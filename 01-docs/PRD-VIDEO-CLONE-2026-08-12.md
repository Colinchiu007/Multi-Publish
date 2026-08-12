# PRD — 视频对标拆解与再创作（视频克隆）

> 版本：v1.1（实现切片 1 详细规格）· 日期：2026-08-12 · 状态：**需求已确认；下一步 OpenSpec 提案（/opsx:propose）+ 实施计划（/create-plan）**
> 关联：PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md、PRD-video-creation.md v1.8
> 产出方式：按 `/pm` 技能流程（Phase 1 澄清 → Phase 2 方案对比 → Phase 3 PRD → Phase 4 审查）产出，融合 Claude 双模型分析交叉验证；antigravity 因账号所在地区限制不可用，按降级规则由主代理补足。

---

## 0. 一句话定位（建议改名）

把「视频克隆 / 尽量 100% 一样」重新定义为 **「视频对标拆解与再创作」**：

- 输入一条视频（8 平台链接或本地文件），输出一份**可编辑的结构化拆解报告**；
- 基于报告生成 **「同款结构 + 同款风格 + 内容再创作」** 的成片；
- 「100% 一样」拆解为可量化的**复刻层级 L0–L3**，其中 L3（素材级复刻/直接搬运）**明确不在范围**。

**理由**：① 像素级/素材级复刻技术上不现实；② 直接翻拍他人作品是版权与平台 ToS 红线；③ 用户真实诉求是「省创意 / 省拍摄 / 省剪辑」，对标拆解已覆盖该价值。

**产品形态（已定）：独立「视频克隆」流水线（VideoClonePipeline）**——独立编排、独立报告产物（CloneReport）、独立成功标准（相似度自检）；底层引擎与 Story2Video 共享，避免重复造轮子（详见 §2）。

### 复刻层级（需求的锚点）

| 层级 | 定义 | 示例 | 法律/技术可行性 |
|---|---|---|---|
| L0 信息一致 | 剧情、文案内容一致 | 同一脚本 → 重新配音/重新出画 | ✅ 可行（文案需改写而非照抄） |
| L1 结构近似 | 叙事骨架/节奏/时长近似 | 同样 Hook→铺垫→高潮→CTA 结构 | ✅ 可行 |
| L2 风格迁移 | 画面风格/调色/字幕/BGM 风格相似 | 同款运镜、同款字幕样式、同款 BGM 情绪 | 🟡 可行（受版权元素除外） |
| L3 素材级复刻 | 逐帧/逐镜头还原、去水印、搬运 | 翻拍原片、搬运 | ❌ 不做（版权+ToS+深伪红线） |

**已确认（2026-08-12）：L0 + L1 + L2 三层全部支持，逐层逼近「100% 一样」（以 §3 F4 相似度自检量化，100% 为理想上限）；L3 素材级复刻明确不做。**

---

## 1. 需求澄清（Phase 1）

### 1.1 目标用户（已确认：对标创作者）

- **对标学习型创作者**：拆解爆款视频的结构/文案/风格，产出自己的内容（主定位）
- **内容运营 / 企业团队**：批量拆解竞品，输出选题、脚本与风格参考
- ⛔ **不支持**「搬运矩阵号 / 洗稿」定位（已确认）

### 1.2 核心问题

- **痛点**：从 0 写脚本、拍画面、剪节奏成本高；对标视频的信息分散在视频里，人工拆解慢且不系统。
- **价值**：一条链接/文件 → 结构化报告（剧情/文案/风格/元素/节奏/参数）→ 半自动成片，创作效率数量级提升，并与既有 15 平台发布闭环打通。

### 1.3 成功标准（默认，可量化）

- 拆解报告维度齐全率 ≥ 90%（10 条人工样本核对）；
- 成片与目标视频：结构骨架一致、文案达发布级（AI 标识后）、画面风格相似、时长偏差 ≤ ±10%；
- 单条成片成本与耗时不作硬性预算约束（用户已确认，§7.3 仅作参考）。

### 1.4 约束

- 技术栈：复用 Electron 主进程 + Python sidecar（8002 分句 / 8013 prompt-engine）+ ModelProviderManager + ffmpeg 合成 + PublisherRouter 发布；
- 输入：本地文件（mp4/mov/webm…，≤500MB，≤30min）优先；链接输入为 P3 范围；
- 合规：深度合成 AI 标识、授权确认、不做规避反爬；不做真人声音/人脸克隆（形象仅风格近似，非真实身份）。

### 1.5 已拍板决策（2026-08-12，详见 §8）

1. **复刻层级**：L0 + L1 + L2 全部支持，逐层逼近 100%（理想指标）；L3 不做。
2. **目标用户**：对标创作者（不支持搬运/洗稿定位）。
3. **声音/人脸**：不克隆真人声音与人脸；形象风格相似即可（TTS 常规 voice + 风格化形象）。
4. **视频类型**：剧情短剧（第一优先）> B-roll > 口播；录屏教程不在首期范围。
5. **成本/耗时**：不作为约束（保留估算供参考，§7.3）。

---

## 2. 方案对比（Phase 2）——已定：独立流水线

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **B. 独立 video-clone 流水线** | 独立的 VideoClonePipeline 编排（ingest→analyze→plan→generate→compose→publish），阶段状态机/报告产物/错误契约独立；底层引擎以共享服务方式复用 | 输入契约不同（视频 vs 文案）、领域模型不同（CloneReport vs TextConfig）、成功标准不同（相似度 vs 文案一致性）、合规要求不同（AI 标识/授权确认）；独立演进，不破坏已稳定的 Story2Video；独立测试与门禁 | 需维护两条编排 | ✅ **用户已拍板** |
| A. 解析报告作为 story2video-compose 前置阶段 | 在 S2V 六阶段前插一段「视频解析」 | 复用最大化 | 把视频输入、报告编辑、复刻模式、相似度自检硬塞进文案管线，破坏 S2V 契约与稳定性；两条产品线互相拖累 | ❌ 已否决 |
| C. 仅文案级复刻 | 只做 ASR + 改写出文案 | 最快最便宜 | 不满足画面/风格诉求 | 作为 P1 起点保留 |

**架构要点（独立编排 + 共享引擎）**：

```
VideoClonePipeline：
  ingest    — 链接下载（8 平台 adapter，P3）/ 本地文件校验 + ffprobe 探测
  analyze   — ASR + 抽帧 + VLM + 音频/文本分析 → CloneReport（可编辑）
  plan      — 复刻模式（L1/L2/灵感）+ 文案改写 + 风格/参数确认
  generate  — prompt-engine(8013) → ModelProviderManager（图片/TTS/视频）+ 一致性（风格化角色/continuity/LUT，非人脸克隆）
  compose   — ffmpeg 合成（字幕样式还原/动效/转场/BGM/水印/调色）+ 相似度自检（F4）
  publish   — PublisherRouter 可选
```

**共享（不重复造）**：smart-sentence-splitter、scene-context 中间层、PromptBridge(8013)、ModelProviderManager、TTS adapters、ffmpeg 合成能力、PublisherRouter、StageExecutor 检查点/错误/重试框架。

**新增（不共享）**：视频下载器（8 平台）、分析报告引擎、CloneReport schema、复刻模式/相似度自检、AI 标识/授权确认。

---

## 3. 功能需求（Phase 3 规格）

**支持视频类型（已确认）**：剧情短剧（第一优先）> B-roll > 口播；录屏教程不在首期范围（§9）。

### F1 输入

- **F1.1 本地文件上传**：格式/大小/时长校验；ffprobe 探测（画幅/分辨率/帧率/码率/音轨）；文件名与元数据展示。
- **F1.2 链接输入（P3 范围）**：8 平台解析器（抖音/小红书/快手/B 站/视频号/YouTube/TikTok/Ins）；无水印下载；失败分类（链接失效/私密/会员/地区限制/反爬/格式不支持）。
- **F1.3 授权确认**：首次使用展示「你拥有该内容的合法使用权」确认 + 免责声明，留痕。

### F2 拆解分析（核心增值点：7 层 26+ 维度）

| 层级 | 维度 | 子项 | 采集/分析方式 | 对生成侧作用 |
|---|---|---|---|---|
| 0 平台/账号层 | 平台格式 | 画幅/分辨率/帧率/时长分布/码率 | ffprobe | 直接映射合成参数（现有 ffmpeg 已支持） |
| | 账号人设 | 开场白/口头禅/结尾惯用语 | 跨视频统计（可选） | 生成「这个人设」的口播 |
| 1 叙事层 | 叙事结构 | Hook→铺垫→发展→高潮→CTA 时间轴与占比 | ASR + 时间轴切分 | 复刻结构骨架 |
| | 剧情主线 | 起因/冲突/转折/结果、角色关系 | VLM 抽帧 + ASR | 产出剧情梗概与场景清单 |
| | 文案全文 | 逐字转录（修正、去口语噪声）、双语 | ASR（如 Whisper） | 作为克隆流水线文案输入（可改写） |
| | 分镜脚本 | 每段画面「在说什么」 | ASR × 镜头对齐 | 一段画面配一段文案的生成单元 |
| 2 文案风格层 | 人称与语气 | 第一/第二人称、命令式/叙述式、口头禅密度 | 文本统计 + LLM | 提示词风格锚点 |
| | 句式特征 | 句长分布、短句比例、排比/设问 | 文本分析 | 改写保持语感 |
| | 金句密度 | 每 30s 记忆点数量 | 规则 + LLM | 判断是否重排文案 |
| 3 视觉层 | 画面风格 | 调色（冷暖/饱和度/对比度）、影调、材质质感、滤镜倾向 | 抽帧 + 色彩直方图 + VLM | 注入 image/video 提示词 |
| | 景别构图 | 远全中近特、构图（中心/三分/对称） | VLM 抽帧 | 镜头提示词 |
| | 镜头运动 | 推拉摇移/运镜速度/固定机位 | VLM + 光流（可选） | video prompt 运动参数 |
| | 转场 | 硬切/淡入淡出/滑入/缩放等 | 帧差检测 + VLM | 合成转场参数 |
| | 字幕样式 | 字号/字体/描边/位置/动效/关键词高亮 | OCR + 视觉识别 | 合成字幕样式还原 |
| | 贴纸/文字卡 | 贴纸、文字卡模板、角标 | 视觉识别 | 元素清单 |
| 4 听觉层 | BGM | 风格/情绪/BPM/段落起止 | 音频分析 + 标签 | BGM 匹配（授权库） |
| | 音效 | 音效点位与类型 | 音频事件检测 | 音效还原 |
| | 人声特征 | 语速/停顿/情绪曲线（不采集音色身份，不做声音克隆） | 音频特征 + ASR 时间戳 | 口播节奏与 TTS 参数（风格近似非原声） |
| 5 元素层 | 人物/角色 | 角色形象风格（服装/发型/气质，非真实人脸身份） | VLM 抽帧 | 风格化角色一致性（非人脸克隆） |
| | 场景道具 | 关键道具/场景元素 | VLM | 场景提示词锚点 |
| | 品牌元素 | 品牌色/Logo 露出 | 视觉识别 | 提示或移除（合规） |

**产出**：结构化 JSON 报告 + 人类可读 Markdown 报告；**报告必须可编辑**（VLM/ASR 会错，人是最终兜底），编辑后触发重新生成。

### F3 生成

- **F3.1 复刻模式**：信息复刻（L0，文案/剧情一致，重新出画配音）/ 结构复刻（L1）/ 风格复刻（L2）/ 灵感复刻（仅借鉴结构与节奏，内容全新）；可叠加组合，逐层逼近 100%。
- **F3.2 生成链（VideoClonePipeline generate→compose 阶段）**：报告 → 文案（改写/保留）→ scene-context 增强 → prompt-engine（video domain）→ 素材生成（图/视频/TTS）→ ffmpeg 合成（字幕/动效/转场/BGM/水印/调色 LUT）→ 相似度自检 → 可选发布（PublisherRouter）。
- **F3.3 一致性**：风格化角色一致性（character reference，非真实人脸克隆；技术路线参考 V-Express/StableAnimator 等的参考图/一致性保持方法，见调研 §8）、场景 continuity token、全局色调 LUT 套用。
- **F3.4 AI 标识**：成片强制 AI 生成标识/水印（符合深度合成管理规定）。
- **F3.5 声音策略（已确认）**：不克隆原视频人声；TTS 使用风格近似的常规 voice，语速/停顿/情绪按报告参数化（非原声）。
- **F3.6 形象策略（已确认）**：不克隆真实人脸；人物形象按「风格近似」生成（同服装/发型/气质/画风，非同一身份），规避深伪红线。

### F4 相似度自检（「接近 100% 一样」的可量化定义）

| 指标 | 定义 | P1 目标 | P2 目标 |
|---|---|---|---|
| 结构相似度 | 叙事段落时间轴对齐（DTW） | ≥ 0.8 | ≥ 0.85 |
| 文案相似度 | 改写后语义相似（BLEU/embedding） | 70–90%（避免照抄） | 70–90% |
| 风格相似度 | 色调直方图/风格标签一致 | — | ≥ 0.7 |
| 时长偏差 | 成片/原片时长 | ≤ ±10% | ≤ ±5% |
| 节奏对齐 | 场景切分点对齐 | — | ≥ 0.75 |
| 主观盲测 | 5 人盲测「像不像」MOS | — | ≥ 4.0/5 |

---

## 4. 错误状态表（空/载/错/边）

| 类别 | 场景 | 行为 |
|---|---|---|
| 空 | 无输入 / 空文件 / 无法解析链接 | 明确提示，不进入流水线 |
| 载 | 下载中/分析中/生成中 | 阶段进度展示、可取消、断点恢复（生成侧） |
| 错 | 链接失效/私密/会员/地区限制/反爬 | 分类错误码 + 建议（如「请上传本地文件」） |
| 错 | 下载失败/ASR 失败/素材生成失败/合成失败 | 错误码 + 有界重试 + 失败留痕，不静默降级 |
| 边 | 超长视频（>30min）/超大文件（>500MB）/低分辨率/无声/纯音乐视频 | 提示 + 降级路径（如只出文案级报告） |

---

## 5. 非功能需求

- **性能**：10min 视频分析 ≤ 3–5 分钟（本地抽帧 + 并行 VLM）；生成按素材 provider 异步，可后台运行。
- **成本**：见 §7.3（用户已确认不作硬约束，保留参考）；报告可编辑以减少无效重生成。
- **隐私**：本地优先分析（ASR/抽帧/文本统计尽量本地）；第三方 API 调用前明示。
- **安全**：下载器不内置反爬对抗；限速/限时/限大小；无硬编码密钥；第三方 URL 仅 HTTPS。
- **可观测**：阶段日志、失败留痕、成本统计、provider 调用明细。

---

## 6. 验收标准（AC）

1. 10 条覆盖 3 类视频（剧情短剧 / B-roll / 口播，按优先级分配）样本，报告维度齐全率 ≥ 90%；
2. F1.1 本地文件：5 种格式 + 边界（空/超大/超长/无声）全部走通；
3. F2 报告可编辑：修改任一字段后重新生成生效（含 JSON/Markdown 双视图）；
4. F3 生成链在 mock provider 下全绿；真实 provider 走外部验收（凭据/配额/网络属外部边界）；
5. F4 指标在 P1/P2 达标（§3 表）；
6. 合规：成片 AI 标识存在、授权确认流程可走通、不做清单无逾越；
7. 打包门禁：修改 electron/ 下代码后 QM-1 本地打包通过；不引入新的原生依赖。

---

## 7. 附录

### 7.1 与现有系统映射

| 新组件 | 复用 / 新增 |
|---|---|
| 视频下载器（P3） | 新增 per-platform adapter（8 平台） |
| 流水线编排 | 新增 VideoClonePipeline（阶段状态机参考 StageExecutor 模式；与 S2V 编排完全隔离） |
| ASR/STT | 复用 ModelProviderManager STT adapter；本地 Whisper 可选 |
| 分析报告引擎 | 新增（抽帧 + ffprobe + VLM + 文本/音频分析），输出 scene-context 兼容字段 |
| 文案→场景链路 | 复用 smart-sentence-splitter + scene-context 中间层 |
| 提示词优化 | 复用 prompt-engine 8013（image/video domain） |
| 素材生成 | 复用 ModelProviderManager（图片/TTS/视频 provider） |
| 合成 | 复用 Electron ffmpeg compose（字幕/动效/转场/BGM/水印/分辨率） |
| 相似度自检 | 新增（ffprobe + 直方图 + DTW 对齐 + 盲测脚本） |
| 发布 | 复用 PublisherRouter（15 平台） |

### 7.2 报告 JSON Schema（草案，简版）

```json
{
  "meta": { "source": "local|url", "platform": "douyin|...", "durationSec": 0, "resolution": "1080x1920", "fps": 30 },
  "narrative": { "structure": "hook|buildup|climax|cta", "timeline": [{ "t0": 0, "t1": 3, "label": "hook" }], "plot": "..." },
  "script": { "fullText": "...", "lines": [{ "t0": 0, "t1": 2.4, "text": "..." }], "language": "zh" },
  "scriptStyle": { "person": "second", "tone": "commanding", "sentenceStats": {}, "hookLines": [] },
  "visual": { "palette": "warm", "colorGrade": {}, "shots": [{ "t0": 0, "t1": 2, "type": "close-up", "motion": "push-in" }], "transitions": ["hard-cut"], "subtitleStyle": {} },
  "audio": { "bgm": { "style": "upbeat", "bpm": 120, "segments": [] }, "sfx": [], "voice": { "gender": "female", "speed": 1.05 } },
  "elements": { "characters": [], "props": [], "brand": [], "watermark": false },
  "platformParams": { "aspect": "9:16", "maxDurationSec": 60 },
  "replication": { "level": "L1", "mode": "structure|style|inspiration|full" }
}
```

### 7.3 成本估算（仅参考——成本与耗时已确认不作为约束）

| 环节 | 本地优先 | 云端 |
|---|---|---|
| ASR 转写（10min） | Whisper ≈ 0 | ≈ 0.5–2 元 |
| VLM 抽帧分析（10min 约 60–120 帧） | ≈ 0（本地 VLM） | ≈ 0.5–3 元 |
| 图片生成 | 按 provider | 0.1–0.5 元/张 |
| 视频生成（AI provider） | 按 provider | 10–60 元/条 |
| 合计参考 | **L1 文案级 ≈ 3–10 元/条；L2 画面级 ≈ 20–80 元/条** | |

### 7.4 参考项目调研（2026-08-12）

详见 [RESEARCH-VIDEO-CLONE-REFERENCE-2026-08-12.md](RESEARCH-VIDEO-CLONE-REFERENCE-2026-08-12.md)。要点：

- **没有完整开源的「视频克隆」成品**；最接近的是「对标文案提取→仿写→口播→发布」链（LuoGen-agent 家族），但其核心卖点声音克隆/数字人属本 PRD 不做清单。
- 组件成熟可复用：yt-dlp（下载）、whisperX/FunASR（ASR）、PySceneDetect（镜头检测）、Open-Sora/Wan2.1/HunyuanVideo（视频生成）、social-auto-upload（发布参考）。
- 差异化位置：**7 层 CloneReport 报告 + 可编辑 + 画面风格级复刻（L2）+ 相似度自检（F4）+ 发布闭环**，现有开源均未覆盖。
- 技术方法参考（2026-08-12 用户补充）：V-Express / StableAnimator / StableAvatar / Duix-Avatar 的「参考图/身份保持」技术**可借鉴**，迁移用于「风格化角色一致性（非真实人脸身份）」，详见 [调研文档 §8](RESEARCH-VIDEO-CLONE-REFERENCE-2026-08-12.md#8-参考图身份保持技术借鉴映射用户补充决策-2026-08-12)。

---

## 8. 决策记录（已拍板，2026-08-12）

| # | 问题 | 用户决策 | 对需求的落点 |
|---|---|---|---|
| 1 | 「100% 一样」指哪一层？ | L0 + L1 + L2 三层全部支持；100% 为理想指标，逐层尽量逼近 | 复刻层级 L0-L2 全支持（§0）；F4 相似度自检量化逼近程度 |
| 2 | 目标用户？ | 对标创作者 | §1.1；不做搬运/洗稿定位；差异化生成 + AI 标识保留 |
| 3 | 真人声音/人脸？ | 不克隆声音与人脸；形象风格类似即可 | F3.5/F3.6；F2 人声特征不采集音色身份；深伪红线规避 |
| 4 | 第一优先视频类型？ | 剧情短剧 > B-roll > 口播；录屏教程不做 | §3 类型优先级；§9 不做清单 |
| 5 | 成本与耗时预算？ | 不作为考虑 | §1.3/§5/§7.3 仅保留参考估算 |

---

## 9. 不做清单（Out of Scope）

- 像素级/素材级翻拍、逐帧还原（L3）；
- 去水印、盗版下载、规避反爬/平台原创度检测；
- 真人声音/人脸克隆、换脸（一律不做，仅风格近似——用户已确认不克隆，见 F3.5/F3.6；参考图/一致性保持技术可借鉴用于风格化形象，见调研 §8）；
- 一键搬运、批量矩阵洗稿；
- 自训练/微调专属生成模型（初期不投入）；
- 跨平台多视频批量克隆（初期单条）；
- 录屏教程类视频（首期范围外，第一优先为剧情短剧 / B-roll / 口播）。

---

## 10. PRD 审查自检（Phase 4）

- [x] 目标用户明确（§1.1，已确认：对标创作者）
- [x] 成功标准可量化（§1.3 / §6）
- [x] 异常路径完整（§4 空/载/错/边）
- [x] 不做清单完整（§9）
- [x] 约束条件明确（§1.4）
- [x] 安全/隐私/合规已考虑（§5 / F1.3 / F3.4 / §9）
- [x] **需求已确认（2026-08-12）；下一步进入 OpenSpec（/opsx:propose）与实施计划（/create-plan）**

---

## 11. 详细规格：数据校验（对应 packages/video-clone-engine/src/clone-report.js）

### 11.1 请求级校验（pipeline.validateRequest，阶段执行前）

| 字段 | 规则 | 失败 |
|---|---|---|
| source.type | 必须 ∈ { local, url } | VIDEOCLONE_INVALID_REQUEST |
| source.path | type=local 时必须为非空字符串（绝对路径） | 同上 |
| source.url | type=url 时必须为非空字符串（https） | 同上 |
| options.replicationLevel | 可选 ∈ { L0, L1, L2 } | 同上 |
| options.mode | 可选 ∈ { structure, style, inspiration, full } | 同上 |
| options.videoTypes | 可选数组，元素 ∈ { drama, broll, talking } | 同上 |
| options.rewriteScript | 可选布尔 | 同上 |
| options.failOnLowSimilarity | 可选布尔（true 时相似度 needs_review → VIDEOCLONE_SIMILARITY_LOW） | 同上 |

### 11.2 CloneReport 7 层字段校验（validateCloneReport）

| 层级 | 字段 | 规则 |
|---|---|---|
| meta | source | ∈ { local, url } |
| | platform | null 或 ∈ 8 平台枚举 |
| | durationSec | 非负有限数字 |
| | resolution | null 或 /^d+xd+$/（如 1080x1920） |
| | fps | null 或正数字 |
| narrative | structure | ∈ { hook, buildup, development, climax, cta } 或 unknown |
| | timeline[].t0/t1 | t0≥0、t1>0、t1>t0（不可倒置/零长度）；label 字符串可选 |
| | plot | 字符串 |
| script | fullText | **必填字符串**（无声视频允许空串，走降级路径） |
| | lines[].t0/t1 | 同时间轴约束；text 必填字符串 |
| | language | 字符串（如 zh/en） |
| scriptStyle | person | ∈ { first, second, third, mixed, unknown } |
| | tone | ∈ SCRIPT_TONES 或 unknown |
| | sentenceStats | 对象；hookLines 数组 |
| visual | palette | ∈ { warm, cool, neutral, vivid, muted, mono } 或 unknown |
| | colorGrade | 对象；shots/transitions/subtitleStyle 结构同 schema |
| audio | bgm.bpm | null 或正数字；bgm.segments 数组 |
| | voice.gender | ∈ { female, male, unknown }；voice.speed 正数字 |
| elements | characters/props/brand | 字符串数组；watermark 布尔 |
| platformParams | aspect | ∈ { 9:16, 16:9, 1:1, 4:5, 3:4 } 或 unknown |
| | maxDurationSec | null 或正数字 |
| replication | level | ∈ { L0, L1, L2 }；mode ∈ 复刻模式 |

校验失败返回 { ok:false, errors[] }，每条含字段路径与中文原因；编辑（editReport）同样路径，非法 patch 抛 VIDEOCLONE_REPORT_EDIT_INVALID。

### 11.3 IPC 序列化安全

所有跨进程/跨阶段传递报告必须经 sanitizeReportForIpc 深拷贝（structuredClone/JSON 双保险），杜绝共享引用与 Vue reactive proxy 泄漏（对齐 QM-2 IPC 参数序列化安全）。

---

## 12. 详细规格：流程与功能逻辑（对应 stage-executor.js / pipeline.js）

### 12.1 六阶段输入/输出/失败/重试

| 阶段 | 输入 | 输出（写入 context） | 失败码（示例） | 可重试 |
|---|---|---|---|---|
| ingest | request.source | artifacts.media（本地路径/下载文件）、meta 初值 | VIDEOCLONE_LINK_UNAVAILABLE / FILE_TOO_LARGE / FILE_FORMAT / PROBE_FAILED | 链接类可重试；文件类不可 |
| analyze | artifacts.media | report（CloneReport 7 层）+ 固化 sourceReport | VIDEOCLONE_ASR_FAILED / ANALYZE_FAILED / INVALID_REPORT | ASR/分析可重试 |
| plan | report + options | report（改写/编辑后；复刻模式参数） | VIDEOCLONE_REPORT_EDIT_INVALID / REWRITE_FAILED | 改写可重试 |
| generate | report | artifacts.assets（图片/视频/TTS 素材） | VIDEOCLONE_ASSET_GENERATION_FAILED / PROVIDER_UNAVAILABLE | 可重试 |
| compose | report + assets | artifacts.output（成片路径）+ similarity（F4） | VIDEOCLONE_COMPOSE_FAILED / SIMILARITY_LOW | 合成可重试 |
| publish | output | publishResult | VIDEOCLONE_PUBLISH_FAILED | 可重试 |

### 12.2 编排语义

- **顺序执行**：ingest → analyze → plan → generate → compose → publish；任一阶段失败即停止（fail-closed），不执行后续阶段。
- **有界重试**：retryable 错误最多重试 maxRetries（默认 2），指数退避（200ms→400ms→800ms）；非 retryable 立即失败。
- **checkpoint 断点续跑**：context.progress[stageId]==='complete' 的阶段在重跑时跳过；completed/steps 数组归一化兜底。
- **sourceReport 固化**：analyze 完成后立即深拷贝原片报告；plan 改写后，相似度比较 sourceReport vs report。
- **相似度自检（F4）**：在 **compose 阶段内**执行（publish 之前，可拦截发布）：computeSimilarityReport；score=0.35·结构+0.25·文案+0.25·风格+0.15·时长；证据门控（空数据不计 PASS，置信度<0.5 → insufficient_evidence）；文案 >0.9 触发 verbatimScript 照抄警告（合规提示，不影响通过）；options.failOnLowSimilarity=true 且 verdict∈{needs_review, insufficient_evidence} 时抛 VIDEOCLONE_SIMILARITY_LOW，流水线停在 compose。
- **未接线阶段**：adapter 未注入 → VIDEOCLONE_STAGE_NOT_IMPLEMENTED（fail-closed），不静默跳过。
- **runId**：vc-<时间戳36进制>-<随机6位>，贯穿日志与结果。

## 13. 详细规格：交互逻辑与显示项（桌面 UI，切片 2 落地）

### 13.1 入口

- 「新建创作」→ 选择「视频克隆」流水线（与 Story2Video 平级，独立入口）。
- 首次使用展示授权确认：**「请确认你拥有该视频内容的合法使用权；克隆他人受版权保护内容需获授权」**（确认后记忆，设置可重置）。

### 13.2 输入区

- 两种输入：**链接输入**（8 平台识别：抖音/小红书/快手/B站/视频号/YouTube/TikTok/Ins，粘贴后自动识别平台并显示徽标）与**本地文件**（拖拽或选择，显示文件名/大小/时长/分辨率）。
- 校验即时反馈：链接非法/平台不支持、文件超 500MB/超 30 分钟/格式不支持，就地标红并给出原因（§14 错误码）。
- 选项：复刻层级（L0 信息一致 / L1 结构近似 / L2 风格迁移，默认 L1）、复刻模式（结构/风格/灵感/全量）、视频类型（剧情短剧/B-roll/口播，多选，默认剧情短剧）、是否改写文案（默认开）。

### 13.3 分析进度页

- 阶段卡片流水线视图：下载 → 拆解分析 → 方案确认 → 素材生成 → 合成 → 发布（可选）。
- 每张卡片状态机：等待 → 进行中（含进度/日志摘要）→ 成功 / 失败（显示原因 + 重试按钮，retryable 才可重试）/ 跳过。
- 整体可取消；失败后可断点续跑（checkpoint：已完成阶段直接跳过）。

### 13.4 报告编辑页（核心）

- 7 层分区 Tab：平台参数 / 叙事结构 / 文案 / 文案风格 / 画面 / 听觉 / 元素。
- 字段控件：结构段落时间轴（可增删改起止秒与标签）、文案全文与逐句时间轴（可编辑文字）、风格枚举下拉、BGM 风格/BPM、元素标签编辑、复刻层级/模式。
- 底部：**保存并重新生成**（editReport 校验，非法字段就地提示）、放弃修改。
- 显示「原片分析」与「当前报告」双栏对比（相似度实时预估）。

### 13.5 结果页

- 成片预览（播放器）+ 相似度仪表（F4：综合分 + 结构/文案/风格/时长四项 + 达标徽标 + verbatim 照抄警告）。
- 复刻层级徽标、AI 生成标识（强制）。
- 操作：重新生成、发布到平台（PublisherRouter，可选）、保存到历史。
- 历史记录：runId、源视频、层级/模式、相似度、时间、状态。

### 13.6 显示项清单

| 区域 | 显示项 |
|---|---|
| 输入区 | 平台徽标、文件名/大小/时长/分辨率、层级/模式/类型选择器 |
| 进度页 | 六阶段卡片、阶段状态、重试按钮、取消按钮 |
| 报告页 | 7 层 Tab、时间轴编辑器、双栏对比、保存/放弃 |
| 结果页 | 播放器、相似度仪表、AI 标识、发布按钮、历史入口 |


## 14. 详细规格：提示文字（zh/en）与错误码

> 渲染端按 userMessageKey 本地化（对齐 user-facing-messages 契约）；zh 为主，en 为英文环境文案。全部文案「原因 + 建议」。

| 错误码 | phase | 可重试 | zh 提示 | en 提示 |
|---|---|---|---|---|
| VIDEOCLONE_INVALID_REQUEST | preflight | 否 | 请求参数不合法，请检查输入后重试 | Invalid request, check your input and retry |
| VIDEOCLONE_SOURCE_UNSUPPORTED | ingest | 否 | 暂不支持该来源，请使用支持的平台或本地文件 | Source not supported, use a supported platform or a local file |
| VIDEOCLONE_LINK_UNAVAILABLE | ingest | 是 | 链接无法访问，请确认链接有效后重试 | Link unavailable, verify the link and retry |
| VIDEOCLONE_LINK_PRIVATE | ingest | 否 | 该视频为私密内容，无法获取 | This video is private and cannot be fetched |
| VIDEOCLONE_LINK_MEMBERSHIP | ingest | 否 | 该视频需要会员权限，无法获取 | This video requires membership access |
| VIDEOCLONE_LINK_REGION | ingest | 否 | 该视频受地区限制，无法获取 | This video is region-restricted |
| VIDEOCLONE_LINK_ANTI_BOT | ingest | 是 | 平台拦截了下载，请稍后重试或改用本地文件 | The platform blocked the download, retry later or use a local file |
| VIDEOCLONE_FILE_TOO_LARGE | ingest | 否 | 文件超过 500MB 上限，请压缩后重试 | File exceeds the 500MB limit, compress and retry |
| VIDEOCLONE_FILE_TOO_LONG | ingest | 否 | 视频超过 30 分钟上限，请裁剪后重试 | Video exceeds the 30-minute limit, trim and retry |
| VIDEOCLONE_FILE_FORMAT | ingest | 否 | 不支持的视频格式，请使用 mp4/mov/webm | Unsupported format, use mp4/mov/webm |
| VIDEOCLONE_PROBE_FAILED | ingest | 是 | 视频信息读取失败，请重试 | Failed to read video info, retry |
| VIDEOCLONE_ASR_FAILED | analyze | 是 | 语音识别失败，请重试 | Speech recognition failed, retry |
| VIDEOCLONE_ANALYZE_FAILED | analyze | 是 | 视频拆解分析失败，请重试 | Video analysis failed, retry |
| VIDEOCLONE_INVALID_REPORT | analyze | 否 | 分析结果不合法，请联系支持 | Analysis result invalid, contact support |
| VIDEOCLONE_REPORT_EDIT_INVALID | plan | 否 | 报告修改不合法，请检查字段后重试 | Report edit invalid, check fields and retry |
| VIDEOCLONE_REWRITE_FAILED | plan | 是 | 文案改写失败，请重试 | Script rewrite failed, retry |
| VIDEOCLONE_ASSET_GENERATION_FAILED | generate | 是 | 素材生成失败，请重试 | Asset generation failed, retry |
| VIDEOCLONE_PROVIDER_UNAVAILABLE | generate | 是 | 生成服务暂不可用，请稍后重试 | Generation provider unavailable, retry later |
| VIDEOCLONE_COMPOSE_FAILED | compose | 是 | 视频合成失败，请重试 | Video composition failed, retry |
| VIDEOCLONE_SIMILARITY_LOW | compose | 否 | 成片与原片相似度过低，请调整报告后重新生成 | Similarity too low, adjust the report and regenerate |
| VIDEOCLONE_PUBLISH_FAILED | publish | 是 | 发布失败，请重试 | Publish failed, retry |
| VIDEOCLONE_STAGE_NOT_IMPLEMENTED | preflight | 否 | 该功能暂未开放，请稍后再试 | This feature is not available yet |
| VIDEOCLONE_INTERNAL | preflight | 否 | 操作失败，请稍后重试 | Operation failed, please retry later |

通用提示（非错误）：上传成功 / 分析中（请稍候，通常 3-5 分钟）/ 生成中 / 合成中 / 已完成（AI 生成标识已添加）/ 发布成功 / 已取消。
照抄警告（verbatimScript）：**「文案与原片几乎一致，可能被判搬运；建议改写后再发布」** / "Script is nearly identical to the source; consider rewriting before publishing".

## 15. 测试与门禁

- 单元测试：40 用例全绿（`node --test packages/video-clone-engine/test/clone-report.test.js test/similarity.test.js test/stage-executor.test.js test/pipeline.test.js`，零依赖；Windows npm script 使用显式文件列表避免 glob 差异）。
- 覆盖映射（OpenSpec 场景 → 测试文件）：clone-report.test.js（校验/编辑往返/IPC 脱壳）、similarity.test.js（F4 指标与阈值）、stage-executor.test.js（顺序/重试/checkpoint/fail-closed）、pipeline.test.js（happy/错误/请求校验/未接线/相似度过低）。
- 质量门禁：.quality-gates.md 执行记录；真实下载/ASR/生成/发布属外部边界（切片 2+ 验收）。
