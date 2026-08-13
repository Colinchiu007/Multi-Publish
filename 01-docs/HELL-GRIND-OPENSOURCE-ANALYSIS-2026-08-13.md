# Higgsfield《Hell Grind》开源项目深度调研与视频提示词优化引擎强化分析报告

> **版本**: v1.0 ｜ **日期**: 2026-08-13 ｜ **类型**: 技术调研报告（纯文档，无代码改动）
> **任务记录**: `.ccg/tasks/hell-grind-opensource-analysis/task.json`
> **事实分级约定**: 【实证】= 一手 API 抓取/原文摘录（附来源）；【推断】= 基于证据的合理推断（明确标注）；【参考】= 第三方转述
> **数据源**: Higgsfield 官方 API（无鉴权公开接口）、Higgsfield Project Brief 原文、CINEDANCE V4 SKILL 全文（33KB）、GitHub 镜像仓库 `zlbigger/story-video-director`（clone 于 D:\Temp\story-video-director）、Magnific《The Prompting Handbook v1.2》PDF（38 页）

---

## 零、结论先行（TL;DR）

《Hell Grind》不是"4 万条提示词"的堆砌，而是一套**工业化的角色/场景一致性控制系统** + **导演化提示词架构**。其可迁移内核按价值排序：

1. **资产引用协议（Asset Reference Protocol）**：资产 = 文本描述符（descriptor，逐字复用）+ 图片锚（reference），提示词内用 `<<<UUID>>> [tag]` 引用并声明用途（`CHARACTER REF — appearance only` / `SCENE REF — space and texture only`），配"禁止继承"禁令——这是全片一致性的地基。
2. **锁机制族（Locks）**：首帧占位锁、空间站位锁、视线/体向锁、地标邻近锁、光照优先级锁、物理锁、多镜头一致性锁——把"模型无记忆"的缺陷用提示词内的显式约束补位。
3. **时间块与动作节拍（Action Timing）**：`[CUT 1/0-1s]` 式时间码拆段，每 beat 一个动作、一个主运镜——对抗模型"自编节奏"。
4. **禁令当说明书**：把翻车点反向沉淀成 KEY RULES / COMMON FAILURES 表——本仓库已有 `signal-collector.js` 采集管道，可直接承接为"失败模式知识库"。
5. **导演化表演层（ACTING）**：表演 = 压力下的行为（objective/tactics/beats），不是情绪标签——这正是当前 Story2Video 分镜策略缺失的维度。
6. **21 项静默自 QA**：输出前强制自查清单——可映射为 8020 引擎的 evaluator 升级。

**对本项目 8020 引擎的总体判断**：引擎骨架（平台策略注册、结构化输出、双级缓存、多候选评估、自进化管道）已具备 Higgsfield 工作流的 70% 机制层；差距集中在**内容层**——提示词内缺"锁/引用协议/时间块/表演层/自 QA"，这些是可直接以 system prompt 与后处理规则形式补入的，无需架构变更。

---

## 第一部分：文章方法论提炼（三条核心）

> 文章：《Higgsfield 开源 95 分钟 AI 长片《Hell Grind》：4 万条提示词全公开，抄下来就能用》
> 路径：`E:\Data\03-obsidian-all\10.projects\生图提示词优化引擎\` 对应 .md

### 1.1 十二行技术底座（全片共用拍摄规范）

【实证】文章称全片每一段提示词都携带一份"12 行技术底座"——涵盖 Style、光照、色彩、皮肤质感、物理、表演、构图、连贯性、帧率、音频等拍摄规范，作为全片统一的"拍摄语言"。

**机制价值**：模型对提示词是"按行解析"的，每次生成都附上同一套规范 = 让每个镜头都诞生在同一个"摄影棚"里。实测样本证实（见 2.3.5）：`hg-full-prompt.txt` 中 Style 块为 `8K IMAX. Photorealistic — no 3D render...`、Cinematography 块锁定摄影师风格（Emmanuel Lubezki handheld）、Sky 块强制"ALWAYS A RAGING STORM"——这就是技术底座的活样本。

**对引擎的启示**：8020 的 `build_system_prompt`（`video_prompt_engine/strategies/generic_video.py:60-100`）已有"六要素输出结构 + Fact-Fidelity + 镜头枚举"，但**没有"全片级风格常量注入"机制**。应增加"制作规范块（Production Constants）"：同一项目内所有镜头共享的风格/光照/皮肤/物理/表演规范，作为 engine-level 配置注入。

### 1.2 七段式镜头骨架

【实证】文章归纳单镜头提示词骨架：**角色状态 → 承接（前情）→ 意图 → 站位 → 对白 → 动作节拍 → 禁令**，中位数长度 16,501 字符（约 16KB/镜，远超常规 500 字提示词）。

**机制价值**：
- 骨架是"导演视角"而非"素材描述视角"——先立状态与意图（why），再写站位与动作（how）；
- 禁令收尾（not allowed），把失败约束放在提示词末尾（模型对末尾约束的遵循度通常最高）；
- 长度阈值说明：专业视频提示词是"长且具体"的，当前 `generic_video.py` 的 150-300 词要求方向一致，但缺骨架顺序约束。

**对引擎的启示**：8020 的六要素顺序（Subject→Action→Environment→Color→Lighting→Style/Shot/Camera）是"素材要素"顺序；应升级为"叙事要素"顺序（状态→承接→意图→站位→对白→节拍→禁令），或至少提供两种骨架模式（要素模式/导演模式）。

### 1.3 三视图资产表 + 资产 ID 引用

【实证】文章强调：每个重要角色先做三视图资产表（脸特写 + 全身正面 + 全身背面），生成时用资产 ID 引用锁外观，避免"每段提示词重新描述导致的漂移"。

**对引擎的启示**：本项目引擎目前是"单提示词进出"（text in → text out），没有资产库概念。Higgsfield 的"描述符逐字复用 + UUID 引用"提示了一个低成本实现：**把角色描述符作为可复用片段注入 context**（`video_prompt_engine/prompt_builder.py` 已有 `context.character / character_list` 注入通道），后续升级为资产 ID 引用语法（见第五部分 B-2）。

### 1.4 禁令当说明书

【实证】文章与 Project Brief 均强调：所有翻车点（脸漂移、构图继承、背景泄漏、文字幻觉）都反向沉淀为**显式禁令**写入后续提示词。CINEDANCE 的 `Anti-drift locks`、`Negative constraints`、`Context isolation rules` 即此方法论的系统化产物。

**对引擎的启示**：8020 已有内置 `no-text` 负面提示词（`video-prompt-engine-contract.js` 中 BUILT_IN_VIDEO_NO_TEXT_NEGATIVE），但这是"平台级默认"，缺**"失败模式反馈闭环"**——本项目 `prompt-evolution/signal-collector.js` 已采集 FeedbackEvent（accepted/regenerated/edited/deleted/published），可扩展为：高频率 regenerated/edited 的失败模式 → 自动沉淀为平台级/项目级禁令（见第五部分 B-6）。

---

## 第二部分：Higgsfield 开源项目深度复盘（一手调研）

> 调研方式：直接调用 Higgsfield 公开 API（无鉴权）+ 抓取项目页全部可见内容 + Project Brief 原文 + CINEDANCE SKILL 全文 + GitHub 镜像仓库全部文档 + Magnific PDF。中间文件缓存于 `D:\Temp\`（hg-api.json / hg-children.json / hg-brief.log / hg-cinedance.md / hg-full-prompt.txt / hg-s27-full.txt / hg-prompt-guide.txt / story-video-director/）。

### 2.1 项目事实与数据（API 实证）

【实证】通过 `fnf-api-gw.higgsfield.ai` 公开接口抓取（2026-08-13）：

| 维度 | 数据 | 来源 |
|---|---|---|
| 项目标题 | HELL GRIND — 95 分钟 AI 长片 | `project-publications/b9d83e92-2bc2-49de-8ef2-1b8d6ae259fe` |
| 资产总数 | **115,451 个资产** | 根目录 children API 汇总 |
| 文件夹规模 | 100+ 个文件夹；最大如 "Regenerations" 14,593、"Assets" 8,986、"1. COLD OPEN" 1,746 | `folders/3caa2f3a-.../children?size=100&sort_by=name` |
| 团队/成本/周期 | 15 人、预算 <$500K、资产备好后 14 天生成、2026 戛纳 Marché du Film 放映 | Project Brief 原文（hg-brief.log） |
| 模型组合（采样 500 job） | seedance_2_0 **88.4%**（视频+语音）、soul_cinematic **5.8%**（角色/地点资产表）、nano_banana_2 **3.0%**（图像编辑）、imagegen_2_0 / gpt_image_2 少量（道具/文字/反向角度） | hg-api.json job 采样统计 |

**关键洞察 1（模型分工）**：【实证】视频生成高度集中于 Seedance 2.0 单模型；Soul Cinema 只用于"资产表生成"（人脸与场景底板），Nano Banana / GPT Image 只用于"改图"。**生成与编辑是两条分开的流水线**——这印证了 LIRA SKILL 的模型路由原则（见 2.5.2）。

**关键洞察 2（资产量级）**：【推断】115K 资产包含大量中间产物与 Regenerations（重生成），真正锁定的资产是少量"表"（character sheet / location sheet / prop sheet）。文章与 Brief 反复强调"资产表是唯一锚点"，提示词内引用的是表的 UUID 而非单张生成图——**资产库是"表库"不是"图库"**。

**关键洞察 3（成本结构）**：【推断】<$500K / 95 分钟 ≈ 每成片分钟 <$5.3K；14 天生成期 + 抽卡比 64:1（见 2.6）说明成本主要消耗在"抽卡重试"——这与本项目 evaluator/缓存机制的目标完全一致（省一次无效生成 = 省一份钱）。

### 2.2 资产一致性系统（Project Brief 实证）

Brief 是整套方法论的"母本"，核心规则如下（hg-brief.log）：

| 规则 | 原文要点 | 机制价值 |
|---|---|---|
| **资产 = 文本 + 图片** | descriptor（逐字进每段提示词）+ reference（模型锚点） | 文本锁语义、图片锁外观，双通道防漂移 |
| **三视图角色表** | 脸特写 + 正面全身 + 背面全身 | 多视角信息互补，模型有"完整身体模型"可用 |
| **无头技巧**（重大发现） | 正面全身图**砍掉头**："wide shots 上模型总从小的全身图取脸（小且糊）——去掉头后模型只有特写一个取脸来源" | 对抗模型"就近取脸"倾向的工程化 hack |
| **资产表"无聊"原则** | 中性灰背景、平光、真毛孔、无修图；电影感不活在资产表里 | 电影感（颗粒/镜头）一旦烤进资产表，角色会把那种 look 带进所有场景、且不再响应新光 |
| **3/4 视角大肖像** | 模型理解最好的表 = 3/4 视角大肖像（脸微转非正对） | 提高取脸成功率 |
| **状态独立拆分** | 服装/疤痕/血 = 在**原表**上做局部点改（Nano Banana / Seedream 4.5），蒙版只替换改动部分 | "一张图绝不经模型两遍全图"——每多一遍全图 pass 就毁纹理（脸变对称塑料感） |
| **10 次压力测试** | 每资产锁库前：不同姿势/不同光下生成 10 次，10/10 可识别；且要与**其他资产同框**、在真实场景光下测 | 单资产稳定 ≠ 同框稳定；把测试环境逼近生产 |
| **眼神检查** | 深色眼睛也要瞳孔内有一小点反光（catch-light），否则"模型没法用死脸演" | 资产 QA 的微观指标 |

**对引擎的直接启示**：
- 8020 的 `context.character`（`prompt_builder.py:37-44`）目前只传角色名——可扩展为"角色描述符 + 禁止继承声明"结构（见 B-2）；
- "无聊资产表"原则 → 资产表生成提示词应明确禁止风格词（本项目 Story2Video 若做角色卡，应把风格词从角色卡剥离）；
- 状态独立拆分 → 反过来说明：**提示词引擎对"角色状态"应输出"基础状态 + 状态增量"结构**，而非每次整段重写（与 continuity_token 语义呼应）。

### 2.3 真实提示词结构拆解（实证样本）

从公开 API 抓取到两段完整提示词：动作场景 7,218 字符（`D:\Temp\hg-full-prompt.txt`）、对话场景 32,170 字符（`D:\Temp\hg-s27-full.txt`）。拆解其结构：

#### 2.3.1 角色数锁定头（hg-full-prompt.txt:1）

```text
EXACT 2 CHARACTERS — distant silhouettes
```

第一行就锁定"画面内恰有 N 个角色"——直接对抗模型"多加人/分身"倾向。8020 的 `generic_video.py` 输出结构无此字段，可在 system prompt 增加 `EXACT N CHARACTERS` 指令（见 A-1）。

#### 2.3.2 资产引用协议（hg-full-prompt.txt:3-9）

```text
<<<160c936b-2ca7-4fb6-876b-c3b91b7a87d3>>> [img_soroh] — Tall lean demon figure with PURPLE-VIOLET skin...
CHARACTER REF — appearance only.
_DEMON [img_guardian_demon] — Massive armored demon warrior... CHARACTER REF — appearance only.
[img_hell_front] — Full hellscape location... SCENE REF — space and texture only.
```

引用协议三要素：
1. `<<<UUID>>>` 资产唯一标识（机器可读、跨镜头稳定）；
2. `[tag]` 人类可读标签（同资产不同场景的实例名）；
3. **用途声明**（`CHARACTER REF — appearance only` / `SCENE REF — space and texture only`）——明确"这图是干嘛的"，防止模型把角色图当场景、把场景图当前帧。

#### 2.3.3 禁止继承禁令（hg-full-prompt.txt:9-11）

```text
Do NOT use this image as a starting frame. Do NOT inherit its composition, framing, camera angle,
color grade, exposure, lens, grain, or any aesthetic property — generate every frame from scratch
using only the spatial layout and texture cues from this ref.
```

场景引用必须显式声明"只取空间与纹理，不继承构图/调色/镜头"。这与 story-video-director 的"故事板不是成片风格"原则同构——**引用默认会泄漏，必须逐条禁止**。

#### 2.3.4 STRICT 硬约束块（hg-full-prompt.txt:13-14）

```text
STRICT: Camera moves through the body field, figures stay distant silhouettes, never approach close.
Action plays out only at the end of the shot. Bodies on the ground are all different from each other.
```

把"本条生成不可违背"的约束集中成块，优先级最高。8020 的 negative_prompt 是"避免元素"语义，STRICT 块是"必须如此"语义——两种约束应分开表达（见 A-2）。

#### 2.3.5 技术底座实样（hg-full-prompt.txt:23-30）

```text
Style: 8K IMAX. Photorealistic — no 3D render, no game engine, no game-cutscene aesthetic.
Cinematography: Emmanuel Lubezki — handheld throughout, fluid organic micro-movement, breathing camera...
Sky: ALWAYS A RAGING STORM — heavy black-purple cloud layer churning overhead in every shot...
```

证实 1.1 的"12 行技术底座"：风格/摄影/环境常量逐段携带，且用 ALL CAPS 强调不变量。

#### 2.3.6 场景锁定引用（hg-s27-full.txt:18-20）

```text
<<<5a8634f7-517d-4392-8ec1-bec4d807ea14>>> [image_jax_27 - copy this exact appearance for character,
identity, costume - the locked reference for SC.27 (BASE BRIEFING) Jax]:
```

"copy this exact appearance" + "the locked reference for SC.27"——同一角色在不同场景 = 不同"锁定引用"（同资产不同实例），且声明锁定的是哪一场。

#### 2.3.7 前史禁令（hg-s27-full.txt:34-36）

```text
NO crystal sword in this scene (this is BEFORE the prophecy). NO crystal armor. NO red capillary glow.
He is fully human, no powers visible. NO injuries.
```

**场景时间轴禁令**：明确"本场之前的道具/状态不得出现"——对抗模型把"后续剧情道具"泄漏进当前场景（模型对整个故事的视觉记忆）。

#### 2.3.8 对话场景的扩展结构（hg-s27-full.txt 32KB）

【实证】对话场景提示词显著更长（32KB vs 动作 7KB），包含：完整角色描述符逐字复用、`_27` 场景几何锁定、`[CUT 1/0-1s]` 时间块、对白节奏标注。说明**对话场景是最难的一致性问题**（表演 + 口型 + 站位 + 对白语义），其模板对 Story2Video 对话类分镜价值最高。

### 2.4 CINEDANCE V4 导演系统（33KB 全文分析）

`D:\Temp\hg-cinedance.md`（GitHub 镜像 `zlbigger/story-video-director/reference-materials/CINEDANCE HIGGSFIELD SKILL.md`，与 API 侧抓取的 `hg-cinedance.md` 同源）。这是 Brief 公式的"可执行化"，43 个章节归为 12 大模块：

| 模块 | 核心机制 | 与 8020 对照 |
|---|---|---|
| **SCENE CONTEXT** | 场景上下文块（时间/地点/情绪/任务） | 8020 `context` 白名单（synopsis/character/setting/character_list/full_text）已有雏形，缺 scene_type/narrative_intent 键 |
| **ACTIVE REFERENCES** | 只列本段"活跃引用"（其余全部隐藏） | **缺**——8020 无引用协议概念 |
| **LOCATION MAP** | 场景地图：关键物体/出入口/地标相对方位 | **缺**——空间几何维度完全空白 |
| **FIRST FRAME AND SPATIAL BLOCKING** | 首帧占位锁：首帧里谁在哪、朝向哪、占画幅多少 | **缺**——引擎纯文本，无首帧概念 |
| **SPATIAL BLOCKING / GAZE LINE / LANDMARK PROXIMITY** | 站位锁 + 视线/体向锁 + 地标邻近锁 | **缺**——三把锁都无对应物 |
| **OPTICS AND LENS CONTROL** | 视角语言库（47°/84°/107°/29°/18°/8° 六档）+ 镜头决策树 + 内容-FOV 对齐 | **缺**——8020 camera 枚举是 pan/tilt/dolly 等运动枚举，无焦段/视角维度 |
| **CAMERA AND COMPOSITION** | 手持规则、每镜一主运镜 | 部分——generic_video 有 camera 枚举，缺"每镜一主运镜"硬约束 |
| **ACTION TIMING** | 动作时间块 `[CUT 1/0-1s]` 按秒拆解 | 部分——有 duration_hint，但无多 beat 结构 |
| **PHYSICS LOCK** | 物理锁：重量/惯性/接触反应 | **缺** |
| **LIGHTING PRIORITY LOCK** | 光照优先级锁：光序 = 主光→环境光→背光，全场不变 | **缺**——lighting 仅作为六要素之一自由书写 |
| **DIALOGUE RULES** | 对白节奏、每 beat 一句、语言锁定 | **缺**——8020 对白无专项规则 |
| **CONTEXT ISOLATION RULES** | 上下文隔离：每段 prompt 只携带本段所需引用，清除陈旧标签；引用"过期即删" | **缺**——但本项目 `signal-collector` 的反馈流可为"过期检测"提供数据 |
| **POSITIVE CONSTRAINTS / NEGATIVE CONSTRAINTS** | 正向约束（必须）+ 负向约束（禁止）分块 | 部分——negative_prompt 已有，正向约束块缺失 |
| **SILENT SELF-QA (21 项)** | 输出前 21 项静默自查（角色数/引用全部点名/首帧占位/光序/物理/对白节奏/禁令完整…） | **缺**——8020 evaluator 是"生成后多候选评分"，非"输出前规则自查" |

**4-D 方法论**：Deconstruct（清陈旧标签，只留本段要素）→ Diagnose（19 项风险清单：角色漂移/空间崩溃/光序断/物理假/对白抢节奏…）→ Develop（16 步组装：上下文→引用→首帧→站位→光→物理→节拍→对白→禁令）→ Deliver（成块输出）。这套"风险清单驱动"流程可整体移植为引擎的**输出前校验规则集**（见 A-7）。

### 2.5 配套资产：ACTING / LIRA / prompt-guide / story-video-director

#### 2.5.1 ACTING SKILL（25KB，表演层，`D:\Temp\story-video-director\reference-materials\ACTING SKILL.md`）

核心公理：**表演 = 压力下的行为，不是情绪展示**（"acting is BEHAVIOR under pressure, not a display of emotion"）。

五支柱：
- **Objective**：本场此刻想要什么（对特定的人，动词化："make him confess"）——禁止写状态（"be angry"）
- **Obstacle & stakes**：什么挡着 + 失败代价（"如果不得到会怎样"必须吓到角色）
- **Tactics**：实现目标的动作动词（施压/讨好/羞辱/拖延…）；战术失败就换
- **Beats**：最小行动单元，2-4 次/场，每次变化必须**可见**（停顿/姿势变/语速变/视线移）
- **Subtext**：潜台词不说破，靠"非问题的问题/重复提问/话题突转/过短回答"泄漏

配套清单（21 项表演自检）：反应先于台词结束、话前微停顿（thought before word）、评估时刻（消化信息的时间）、每个人都有 business、距离变化有动机、tic 有触发条件、面具要有裂缝（"However, when X..."）、眼神生命（saccades/blink/catchlights）、强者静弱者动、全员反应错峰等。

【推断】这是现有引擎**完全没有的维度**：8020 的 action 描述是"动作要素"，story2video 的 14 个动作隐喻（storyboard-prompt.ts）是"视觉隐喻"，都缺"角色想要什么"的意图层。CINEDANCE 的七段骨架中的"意图"段即由 ACTING 方法论填充。

#### 2.5.2 LIRA SKILL（30KB，图片提示词优化，`...\reference-materials\LIRA SKILL.md`）

4-D 方法论（Deconstruct/Diagnose/Develop/Deliver）+ 模型路由原则：
- 角色表 → Soul 2.0；地点 → Soul Cinema；道具 → NBP/GPT Image 2；**编辑 → NBP 优先**（minimal CHANGE + exhaustive PRESERVE EXACTLY，一次只改一处，锁脸/服装/道具/机位/阴影/调色）
- 纹理糊 → Seedream 4.5 texture pass（唯一职责）；微编辑 NBP 拿不下 → GPT Image 2 最后手段（"全局脏、局部强"）
- 反向角度改景 → GPT Image 2 默认；NBP 必须逐物写明镜像摆放
- 词汇纪律：禁词（ultra sharp/hyper detailed/crisp/8K clarity/HDR）召唤 slop；有效词栈（shadowplay + cinematic + fine film grain / muted palette + faded blacks + negative space）
- 光圈焦段是弱杠杆（"gear numbers are weak levers"——模型几乎不区分 35mm/50mm），必须配可见效果词

【实证】此文档与 Higgsfield 官方 workflow 高度一致（Soul/NBP/Seedream 分工即 Brief 所用），可信度极高。【推断】LIRA 的"编辑 = 最小 CHANGE + 穷举 PRESERVE"可移植为视频提示词的**场景续接模式**：当 context 提供上一镜头/上一帧时，引擎应输出"保持 X 不变，只改 Y"结构。

#### 2.5.3 Magnific《The Prompting Handbook v1.2》（38 页 PDF，`D:\Temp\hg-prompt-guide.txt`）

行业级提示词手册，2026-07 发布。高价值章节：

- **模型对比表**（P20）：Seedance 2.5（默认，50 refs/30s/原生音频）、Kling 3.0 Omni（性能克隆/物理/商品文字）、Happy Horse（预算档）、Gemini Omni Flash（对话式导演）——【推断】可校准 8020 平台策略的"平台能力画像"
- **PROMPT STRUCTURE·VIDEO**（P23）：Shot（画幅/景别）→ Camera move（每镜一个）→ Subject → Action（每镜一个动作）→ Setting → Lighting → Style → Audio（SFX/无音乐/无字幕）——与 generic_video 六要素高度同构，但多了 Shot 前置与 Audio 收尾
- **Engine rules / five seams**（P30）：动作是意图+命名动作、非生物力学（"spinning back kick connects" 而非 "forearm rotates 45°"）；情绪是物理不是标签（"jaw clenches, nostrils flare" 而非 "looks angry"）；只有可见可闻的能渲染；出画即消失；**跨切最多追 3 个角色**；镜子构图（模型会发明错误的镜像房间）；切后重建场景（重述站位与朝向 + 180° 线）；自由文字不可靠（设文字安全区，后期加字）
- **Twelve camera moves**（P32）：push-in/pull-back/pan/tilt/tracking/arc/crane/zoom/dolly zoom/whip pan/handheld/static+angles + 铁律"每镜一个运镜 + 几乎都加 slow"
- **The audition（试镜）**（P35）：角色表锁脸，试镜锁表演——短自拍式视频参考（一个潜台词台词 + 三品质声音配方 + 微观表演 + 不解决结局），两三个配方挑一个，赢家作为后续所有场景的表演参考。**【推断】这是资产系统的第三层：身份层（sheet）+ 表演层（audition clip）——视频参考像图片参考一样"骑着走"**
- **Cheat sheet**（P36-37）：film-look 行（soft cinematic lens...no oversharpening）、皮肤真实块（pores/fine hairs/veining/not retouched plastic）、禁词表、Always·video 链（30s 内接片/三角色上限/一镜一传送门/逐镜复述商品描述/每切后重述站位）

#### 2.5.4 story-video-director（导演型 Skill 仓库，全量 clone 于 `D:\Temp\story-video-director`）

非 Higgsfield 官方，但为该团队的"可执行化"再创作（MIT 授权，reference-materials 除外），工作流与 CINEDANCE 同源。**可复用组件**：

| 组件 | 位置 | 价值 |
|---|---|---|
| SKILL.md 主流程 | `story-video-director/SKILL.md` | 11 步工作流 + 19 条 Hard invariants（15s 上限/引用必带 job 与禁令/不虚构产物/不泄露密钥） |
| 四视图角色身份图规范 | `references/character-identity-sheets.md` | 正/侧/背/特写四视图 + ImageGen 模板 + 引用排除规则（"只提取角色设定，不继承影棚背景/分栏/接缝/重复人物/中性站姿"） |
| Seedance 引用预算规则 | `references/seedance-reference-rules.md` | 2.0：9 图/3 视频/3 音频/总 12；上传顺序固定（分镜→角色→生物→场景→关键帧→风格→视频→音频）；超预算删除顺序（风格→冗余角度→冗余动作→次要道具，**永不删唯一身份锚**）；"N 张图定义同一物"折叠句 |
| 中文视听提示词模板 | `references/chinese-video-prompt-template.md` | 完整模板：settings 块（时长/画幅/帧率/模型/参考数）+ 引用素材块 + 时间块（0-3s/3-7s/7-10s）+ 声音语法（`(音乐)`/`<音效>`/`{对白}`/`【字幕】`）+ 最终画面块 + 负面提示词；**总长 <5000 字符否则拆段** |
| 表演时间纪律 | `references/directing-and-runtime.md` | 中文语速 4-4.5 字/秒（从容），5 字/秒仅限刻意快语；时长预算表（视觉单点 8-15s/短广告 12-15s/小故事 45-75s/民间故事 70-120s/多反转对话 90-180s） |
| 交付契约 | `references/delivery-contract.md` | 项目目录结构 + manifest JSON schema（reference_limits/clips/depends_on）+ api-jobs.json + 22 项质量清单 |
| 确定性校验器 | `scripts/validate_project.py`（11KB） | 可执行的项目校验器：引用存在性/预算上限/提示词含全部 @filename/时长一致性 |
| MiniMax-H3 执行器 | `scripts/metaso_h3_video.py`（12.6KB） | 安全提交（仅环境变量密钥/顺序提交防失控/轮询/FFmpeg 统一规格合并/失败处理） |
| Seedance 2.5 Storyboard Director | `reference-materials/视频提示词建议.md`（30KB） | 2.0→2.5 差异表（30s 单次/50 refs/时间戳级编辑/clay previz）、10 问 intake、**WEAK vs STRONG 对照表**、**COMMON FAILURES AND FIXES 表（22 行失败→修复映射）**、编辑命令模板、STATUS BLOCK 流程状态块 |

### 2.6 苏米客第三方拆解（参考）

`D:\Temp\hg-xmsumi.html`（xmsumi.com/detail/3974）：
- **角度描述法**：用"角度 + 景别"描述镜头（与 CINEDANCE 视角语言库一致）
- **动作按秒拆**：每镜头动作按秒切分（与 ACTION TIMING 一致）
- **场景地图**：先画场景空间关系再写镜头（与 LOCATION MAP 一致）
- **抽卡比 64:1**：前 25 分钟 1.6 万片段 → 253 可用片段 ≈ 63:1 的淘汰率——"AI 长片是抽卡工业化"，引擎的 evaluator 多候选机制正是抽卡自动化的第一步

### 2.7 失败模式知识库（COMMON FAILURES 表，最高复用价值）

`视频提示词建议.md` 的 22 行失败映射表（P23-25 区域）——【实证】这是"禁令当说明书"的成体系产物，**可直接转化为引擎规则**：

| 症状 | 根因 | 修复（=规则） |
|---|---|---|
| 角色脸中途漂移 | 主体参考过多/肖像冲突 | 砍到 ≤8 图主体、删冲突肖像、重述身份锚行 |
| 镜头乱飘 | 无每节拍机位指令 | 每个时间戳内命名一个运镜 |
| 片段"游荡"不收敛 | 无结束状态 | 加显式 Last Frame 块 |
| 讲错语言 | 未命名语言 | `Dialogue language: [X]` |
| 三盏灯变一盏 | 多角度参考未折叠 | "N 张图共同定义同一物"折叠句 |
| 参考背景渗入 | 无排除行 | `Do not use the background from this image.` |
| 视频无视分镜 | 无面板→时间戳映射 | 加 `Panels P01-P02 are 0-5s…` 映射行 |
| 成片灰草图感 | 分镜铅笔风被当风格 | `Do not render in pencil, ink, or monochrome` |
| 同角色两个版本 | 正文用槽位号不用名字 | 角色命名 + 首现时重述一个可见身份标记 |
| 设定图灰底/分栏入画 | 无排除声明 | `Do not take the gray backdrop, the panel layout…` |
| 乱码屏显文字 | 模型幻觉字体 | Last Frame 禁文字，后期加字 |
| 风格压过角色 | 风格参考与主体参考竞争 | 先删风格参考 |
| 事件太多 | beat 数过高 | 更少 beat/一个主运镜/更少背景演员 |

---

## 第三部分：项目现状盘点（视频提示词优化引擎全家桶）

### 3.1 独立视频引擎 8020（prompt-engine 仓库 `video_prompt_engine/`）

| 层 | 现状 | 证据（file:line） |
|---|---|---|
| 编排器 | 缓存→策略→system prompt→context→RAG few-shot→LLM→结构化后处理；JSON 解析失败重试 ≤max_retries，耗尽回退原文并标记 | `optimizer.py:1-20, 173-196` |
| 双级缓存 | 内存 + SQLite，key=platform\|prompt\|creative_level\|max_length\|language\|num_candidates\|negative_prompt\|context_hash | `optimizer.py:66-80`；`cache_manager.py` |
| 输入分类 | 题材（history/scifi/ad/drama/nature/portrait/cinematic）+ 镜头意图（dynamic/static/wide/closeup）关键词检测 → 注入 system prompt + 维度建议 | `classifier.py:8-63` |
| 关键词词典 | 7 维度（镜头/运镜/光影/色彩/风格/场景/动作）中英双语命中提示 | `knowledge/keywords_video.json`（156KB） |
| 平台策略 | 6 平台注册表：generic_video / seedance / veo / kling / hailuo / doubao；每平台 build_system_prompt + post_process | `strategies/base.py:9-62`；`strategies/*.py` |
| 结构化输出 | 7 字段 JSON：prompt/shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint；枚举受限（shot 6 种/camera 11 种/transition 5 种） | `strategies/generic_video.py:71-82` |
| Fact-Fidelity | system prompt 强制"不改主体身份/时代/事件事实"，context 注入保真上下文 | `strategies/generic_video.py:35-39`；`prompt_builder.py:33-57` |
| 种子库 | 140 条视频种子（RAG few-shot 检索） | `knowledge/seed_video_prompts.json`（193KB） |
| 多候选评估 | num_candidates>1 时 evaluator 评分择优，最优在前 | `optimizer.py:185-200`；`evaluator.py` |
| 反馈闭环 | feedback API + 缓存统计 | `feedback.py`；`api/rest.py` |
| 批量 | 有界并发 8，结果顺序与请求一致 | `optimizer.py:223-228` |

### 3.2 契约层（Multi-Publish 侧）

| 能力 | 现状 | 证据（file:line） |
|---|---|---|
| 平台枚举 | 13 平台 + 历史别名归一（sora-v2→sora 等），未知回退 generic_video | `video-prompt-engine-contract.js:25-48, 62-70` |
| 结构化字段 | shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint 收敛与 fail-closed 校验 | `video-prompt-engine-contract.js`（`normalizeVideoMeta`，L375） |
| 内置负面 | 平台级 no-text 负面提示词合并（内置 + 用户） | `video-prompt-engine-contract.js`（BUILT_IN_VIDEO_NO_TEXT_NEGATIVE） |
| 语言路由 | 国产模型→zh、国外模型→en；通用网关按 model 名关键词兜底 | `video-prompt-engine-contract.js:135-170` |
| context 白名单 | synopsis/character/setting/character_list/full_text + 长度上限 | `video-prompt-engine-contract.js:55-60` |
| 双后端 | 8020 优先（VIDEO_PROMPT_PORT），失败回退 8013 domain=video，共用输出校验 | `video-prompt-engine-contract.js:9-17` |

### 3.3 Story2Video 分镜与上下文引擎

| 能力 | 现状 | 证据 |
|---|---|---|
| 分镜视觉隐喻库 | 8 构图 / 14 动作 / 23 物体隐喻（xiaohei 抽象→视觉隐喻） | `packages/story2video-engine/src/storyboard-prompt.ts` |
| 规则驱动上下文 | 朝代/文化/角色/道具提取 + 负面锚点 | `apps/desktop/electron/services/story-context-engine.js` |
| 历史叙事提示词 | 朝代/人物/事件三要素模板 | `packages/story2video-engine/src/history-prompt.ts` |
| 模板库 | 7 套模板 | `packages/story2video-engine/src/template-library.ts` |
| 事实保真上下文 | context 注入（synopsis/character_list/full_text） | `prompt_builder.py:33-57` |

### 3.4 自进化闭环

| 能力 | 现状 | 证据 |
|---|---|---|
| 事件管道 | GenerationEvent（append-only generation-log.jsonl）+ FeedbackEvent（feedback-log.jsonl，按 eventId join） | `prompt-evolution/schema.js:7-19` |
| 枚举 | engine=image/video；mode=story2video/standalone/storyboard；optimizedBy 5 值；feedbackType 6 值；librarySource=builtin/learnt/full/fragment | `prompt-evolution/schema.js:10-14` |
| 采集 | signal-collector JSONL 日志采集 | `prompt-evolution/signal-collector.js` |
| 设计基线 | v2 五层闭环（生成→反馈→学习→入库→复用） | `01-docs/prompt-engine-evolution-design.md` |

---

## 第四部分：差距矩阵（CINEDANCE × 8020 逐项对照）

> 差距等级：**0**=已有等价物 ｜ **1**=有雏形需强化 ｜ **2**=缺失但低成本补 ｜ **3**=缺失且需架构扩展

| # | 能力维度 | Higgsfield/CINEDANCE 做法 | 8020/Story2Video 现状 | 差距 | 优先级 |
|---|---|---|---|---|---|
| G1 | 资产引用协议（UUID+用途声明+禁令） | `<<<UUID>>> [tag]` + `CHARACTER REF — appearance only` + "不继承"禁令 | 无引用概念；context.character 仅传名字 | **3** | P0 |
| G2 | 角色描述符逐字复用 | descriptor 逐字进每段提示词 | context.character 只传 name（`prompt_builder.py:37-44`） | **2** | P0 |
| G3 | 首帧占位锁 | 首帧谁在哪/朝向/占幅 | 纯文本引擎，无首帧概念（Story2Video 有 first_frame 图生视频） | **3** | P1 |
| G4 | 空间站位锁（LOCATION MAP） | 场景地图 + 站位/视线/地标邻近锁 | 无空间几何维度 | **2** | P1 |
| G5 | 时间块（ACTION TIMING） | `[CUT 1/0-1s]` 每 beat 一动作一运镜 | duration_hint 单值；无 beat 结构 | **2** | P0 |
| G6 | 物理锁 | 重量/惯性/接触反应 | 无 | **2** | P1 |
| G7 | 光照优先级锁 | 光序=主光→环境光→背光，全场不变 | lighting 自由书写 | **2** | P1 |
| G8 | 对白节奏规则 | 每 beat 一句、语言锁定、语速 4-4.5 字/秒 | 无专项规则 | **1** | P1 |
| G9 | 表演层（ACTING） | objective/tactics/beats/subtext，行为非情绪 | storyboard-prompt 是视觉隐喻库，无意图层 | **3** | P1 |
| G10 | 上下文隔离（清陈旧标签） | 每段只带本段活跃引用，过期即删 | context 白名单有键但无"隔离/过期"语义 | **1** | P0 |
| G11 | 21 项静默自 QA | 输出前规则自查 | evaluator 是生成后评分 | **2** | P0 |
| G12 | 禁令沉淀闭环 | 翻车点→KEY RULES | signal-collector 有反馈流，无失败模式→禁令转化 | **2** | P1 |
| G13 | 视角语言库 | 47°/84°/107°/29°/18°/8° 六档 | camera 枚举无焦段维度 | **1** | P2 |
| G14 | 引用预算管理 | 上传顺序/上限非目标/超预算删除顺序 | 无 | **2** | P1 |
| G15 | 声音一体化语法 | `(音乐)`/`<音效>`/`{对白}`/`【字幕】` | 无（audio 无专项输出） | **2** | P1 |
| G16 | 最终画面块 | 每段必须显式终态（位置/姿势/光/是否静止/禁文字） | 无强制 | **2** | P0 |
| G17 | 负面提示词"plausible only" | 只放真实会发生的失败 | 内置 no-text + 用户自定义，无 plausibility 规则 | **1** | P1 |
| G18 | 角色数锁定 | `EXACT N CHARACTERS` | 无 | **2** | P0 |
| G19 | 前史禁令 | `NO xxx (this is BEFORE…)` | 无（context 有 synopsis 但无"时间轴禁令"生成） | **2** | P1 |
| G20 | 跨镜折叠句 | "N 张图定义同一物" | 无 | **2** | P2 |
| G21 | 模型路由/平台画像 | Seedance=视频、Soul=资产、NBP=编辑、GPT=文字/反向 | 6 平台策略已有，缺"编辑/资产/文字"路由 | **1** | P2 |
| G22 | 试镜（audition）参考 | 表演视频参考随片携带 | 无 | **3** | P3 |
| G23 | 语速预算/时长公式 | 4-4.5 字/秒 + 场景时长表 | 无 | **1** | P2 |
| G24 | 确定性项目校验器 | validate_project.py | 无（契约层有 fail-closed 输出校验，非项目级） | **1** | P2 |

**总体判断**：24 项差距中，**P0 级 6 项全部是"提示词内容层"规则**（引用协议/描述符复用/时间块/上下文隔离/自 QA/角色数锁定），实现方式 = system prompt 模板 + 后处理校验，不触碰引擎架构；P1 级 11 项中 8 项同样是规则层。真正的架构级扩展（G1 资产引用、G3 首帧、G9 表演层、G22 试镜）集中在"素材/参考输入"维度，适合作为 Phase 3+ 的输入侧升级。

---

## 第五部分：可复用分级清单（直接抄 / 需适配 / 仅借鉴）

### A 级：直接复用（改文案即用，落点在 8020 system prompt 与契约层）

| # | 复用项 | 来源 | 8020 落点 | 改动量 | 优先级 |
|---|---|---|---|---|---|
| A-1 | **EXACT N CHARACTERS 角色数锁定** | hg-full-prompt.txt:1 | generic_video/seedance 等策略 build_system_prompt 增加"角色数声明"指令（可从 context.character_list 推导 N） | 小 | P0 |
| A-2 | **STRICT 硬约束块** | hg-full-prompt.txt:13-14 | 输出结构增加 positive_constraints 字段（与 negative_prompt 分列）；system prompt 要求"必须如此"与"禁止如此"分块 | 小 | P0 |
| A-3 | **最终画面块（Last Frame）** | chinese-video-prompt-template.md:44-46 | 输出结构强制 `final_frame` 字段（位置/姿势/灯光/机位是否静止/禁文字） | 小 | P0 |
| A-4 | **时间块语法（beat-by-beat）** | hg-s27-full.txt / 视频提示词建议.md:38-42 | duration_hint 扩展为 `beats: [{start, end, action, camera, audio}]` 数组（兼容旧字段） | 中 | P0 |
| A-5 | **负面提示词 plausible-only 规则** | chinese-video-prompt-template.md:63-70 | system prompt 增加"负面只列真实会发生的失败类别"（身份漂移/重复角色/解剖/背景渗入/光变/文字/风格） | 小 | P1 |
| A-6 | **引用用途声明模板** | hg-full-prompt.txt:3-9 / seedance-reference-rules.md | 当 context 提供引用时，system prompt 要求输出 `[tag] — 用途声明 + 禁止继承行`（现无引用输入，先固化模板） | 小 | P1 |
| A-7 | **21 项自 QA 规则集** | hg-cinedance.md Silent self-QA | evaluator.py 增加规则化自查函数（角色数/引用点名/光序/物理/语速/禁令完整性），评分加权 | 中 | P0 |
| A-8 | **每镜一主运镜 + slow 原则** | prompt-guide P32 | system prompt 硬约束："一个镜头一个运镜；默认加 slow" | 小 | P1 |
| A-9 | **语速纪律与时长预算表** | directing-and-runtime.md:23-35 | context 注入对白时长预算（4-4.5 字/秒），duration_hint 与对白长度互检 | 小 | P2 |
| A-10 | **三角色上限** | prompt-guide P31 | system prompt："跨切最多 3 个可识别角色，其余泛化" | 小 | P1 |
| A-11 | **禁词表与有效词栈** | prompt-guide P36-37 / LIRA | keywords_video.json 增加"禁词/有效词栈"条目（ultra sharp/hyper detailed/crisp 禁用；shadowplay+cinematic+grain 有效） | 中 | P2 |
| A-12 | **声音语法** | chinese-video-prompt-template.md:48-52 | 输出结构增加 audio 字段（`(音乐)`/`<音效>`/`{对白}`/`【字幕】` 语法 + 语言锁定） | 中 | P1 |

### B 级：需适配集成（涉及契约/输入侧/数据管道改造）

| # | 复用项 | 来源 | 适配方案 | 依赖 | 优先级 |
|---|---|---|---|---|---|
| B-1 | **资产引用协议（UUID+用途声明）** | hg-full-prompt.txt:3-9 | 契约新增 `references: [{id, tag, role, usage, exclusions}]` 结构字段；8020 输出时把 context 提供的资产映射为引用块；Story2Video 角色设定 → 资产 ID 注册表 | 输入侧需要资产源 | P0 |
| B-2 | **角色描述符逐字复用** | Project Brief（资产=文本+图） | context.character 从"只传 name"升级为"完整描述符 + 禁止继承声明"；story-context-engine.js 已有角色提取，需增加"描述符固化"（首建后逐字复用） | 输入侧 | P0 |
| B-3 | **上下文隔离（活跃引用管理）** | hg-cinedance.md Context isolation | context 增加 `active_references` 白名单语义：每段只注入本段引用，其余隐藏；过期引用由 signal-collector 反馈流标记 | 数据管道 | P0 |
| B-4 | **前史禁令生成** | hg-s27-full.txt:34-36 | context 增加 `timeline` 键（本场在故事时间轴的位置）；system prompt 要求输出"本场之前/之后不得出现的道具与状态" | 输入侧 | P1 |
| B-5 | **失败模式→禁令闭环** | 视频提示词建议.md COMMON FAILURES | signal-collector 的 FeedbackEvent 增加 `failure_pattern` 维度；高频率 regenerated/edited 模式 → 自动生成/建议禁令条目 → 进 keywords_video.json 或平台级 negative | 数据管道 | P1 |
| B-6 | **首帧占位锁** | hg-cinedance.md First-frame occupancy lock | Story2Video 侧（已有 first_frame 图生视频）：分镜阶段输出"首帧占位描述"（谁/在哪/朝向/占幅）；8020 输出 `first_frame_description` 字段供下游 | 输入侧 | P1 |
| B-7 | **表演层（ACTING 五支柱）** | ACTING SKILL.md | storyboard-prompt.ts 升级：每个分镜增加 objective/tactics/beats/subtext 字段（意图层）；8020 的七段骨架"意图"段由 context 提供 | 分镜引擎 | P1 |
| B-8 | **引用预算管理** | seedance-reference-rules.md | 契约新增 `reference_limits`（平台能力表：seedance 9/3/3/12）；输出校验引用数超限 fail-closed；上传顺序常量 | 契约层 | P1 |
| B-9 | **折叠句生成** | seedance-reference-rules.md:47-49 | 当多引用指向同一物时自动追加"N 张图共同定义同一物；成片中始终只有一物" | 输入侧 | P2 |
| B-10 | **模型路由/平台画像表** | prompt-guide P20 / LIRA model routing | 平台策略增加"能力画像"元数据（是否原生音频/参考预算/编辑能力）；videogen 选平台建议引擎 | 平台层 | P2 |
| B-11 | **audition 表演参考** | prompt-guide P35 | 远期：Story2Video 增加"表演试镜"阶段（2-3 个语音配方出片挑选，胜者作为视频参考随场景携带） | 视频管道 | P3 |

### C 级：仅借鉴（机制启发，不直接移植）

| # | 借鉴点 | 来源 | 对项目的启示 |
|---|---|---|---|
| C-1 | 无头三视图技巧 | hg-brief.log | 本项目做角色卡生成时：避免"小全身图成为取脸来源"——多视图资产可故意弱化次要视图的面部信息 |
| C-2 | 局部蒙版改状态（图不过两遍模型） | hg-brief.log | 角色状态变更走"点改"而非整图重生成；提示词引擎侧对应"基础状态 + 状态增量"输出结构 |
| C-3 | 10 次压力测试 | hg-brief.log | 素材 QA 流程：同框测试 + 真实场景光测试；可写入 story2video 素材生成验收清单 |
| C-4 | 64:1 抽卡比管理 | 苏米客 | 引擎的 evaluator/缓存本质是"自动化抽卡"；成本护栏应显式建模（每成片分钟预算） |
| C-5 | 模型分工流水线 | hg-api.json 统计 | 生成/编辑/资产分模型路由；8020 平台策略可输出"建议工具链"（如：此场景建议 Seedance + NBP 编辑） |
| C-6 | 15 人制片流程 | hg-brief.log | 分块责任制：每提示词工程师负责自己的场景块；可借鉴为模板库/策略库的"责任域"划分 |
| C-7 | Seedance 2.5 时间戳级编辑 | 视频提示词建议.md | 编辑类提示词模板：`0-5s 保持/5-10s 替换/10-15s 保持`；8020 的 rewrite 接口可增加"时间戳编辑"模式 |

---

## 第六部分：落地路径（分阶段，可回滚）

> 原则：全部改动先在 8020 引擎（prompt-engine 仓库）与契约层做，Multi-Publish 侧只动 `video-prompt-engine-contract.js` 与 Story2Video 分镜；每阶段有独立验收标准。若涉及 M+ 代码改动，按 OpenSpec 机制先 `/opsx:propose` 建 change（本报告为纯文档，不触发）。

### Phase 1（P0 规则注入，0.5-1 周）——"提示词内容层"升级

**改动**：
1. 六平台策略 system prompt 增加：A-1 角色数锁定、A-2 STRICT 正向约束块、A-3 最终画面块、A-8 每镜一运镜 + slow、A-10 三角色上限（`strategies/generic_video.py` 等 6 文件）
2. 输出 JSON 增加 `positive_constraints`、`final_frame` 字段（保持旧字段兼容，`strategies/base.py:extract_video_meta` 扩展）
3. A-5 负面提示词 plausible-only 分类规则（system prompt 文案）
4. 契约层 `video-prompt-engine-contract.js` 结构化字段同步扩展 + fail-closed 校验

**验收**：构造 10 条覆盖动作/对话/广告/历史题材的回归用例，断言输出含角色数声明、最终画面块、STRICT 块；旧字段（shot/camera/…）零回归；`video-prompt-engine-contract.test.js` 全绿。

### Phase 2（P0 时间块与自 QA，1 周）——"节奏与质量门禁"升级

**改动**：
1. A-4 `beats[]` 数组结构（start/end/action/camera/audio），duration_hint 兼容保留；对白场景强制多 beat
2. A-7 21 项自 QA 落地为 `evaluator.py` 规则自查函数（rule_score 加权进 select_best）
3. A-12 声音语法 `audio` 字段（`(音乐)`/`<音效>`/`{对白}`/`【字幕】` + 语言锁定）

**验收**：对话类 prompt 输出含 ≥2 beats；自 QA 规则覆盖 ≥15/21 项；多候选评分中"规则违规"项显著降低分。

### Phase 3（P0 引用协议 + P1 上下文隔离，1-2 周）——"一致性地基"升级

**改动**：
1. B-1 契约新增 `references[]` 结构字段（id/tag/role/usage/exclusions）+ 引用用途声明模板（A-6）
2. B-2 context.character 描述符化：story-context-engine.js 输出完整描述符 + 禁止继承声明
3. B-3 context 增加 `active_references` 活跃引用白名单（隔离语义）
4. B-4 前史禁令：context 增加 `timeline` 键，system prompt 输出"本场不得出现"块

**验收**：端到端用例——Story2Video 生成 3 镜头，第二镜头输出含"引用声明 + 禁止继承 + 前史禁令"；无引用输入时零回归。

### Phase 4（P1 剩余项 + 反馈闭环，1-2 周）——"自进化"升级

**改动**：
1. B-5 signal-collector 增加 `failure_pattern` 采集；高频失败模式 → 禁令条目建议（人工确认入库）
2. G6 物理锁 / G7 光照优先级锁 规则注入（system prompt 段落）
3. B-7 表演层：storyboard-prompt.ts 增加 objective/tactics/beats 意图字段（先支持"意图行"输出，不强制）
4. B-8 引用预算：平台能力表 + 超限 fail-closed

**验收**：采集到 1 个真实失败模式并生成禁令建议；物理/光照规则在回归用例中可断言；分镜输出含意图行。

### Phase 5（P2/P3 远期，按需）——"输入侧"架构扩展

1. B-6 首帧占位锁（Story2Video 已有 first_frame 管道，输出 first_frame_description）
2. G13 视角语言库（焦段 6 档枚举进 shot/camera 枚举）
3. B-10 平台能力画像（模型路由建议）
4. B-11 audition 试镜流程（视频参考资产化）
5. C-2 状态增量结构（基础状态 + 状态增量，替代整段重写）

---

## 第七部分：数据源附录

### 一手 API（2026-08-13 抓取，无鉴权公开接口）

| 内容 | URL |
|---|---|
| 项目发布详情 | `https://fnf-api-gw.higgsfield.ai/fnf/project-publications/b9d83e92-2bc2-49de-8ef2-1b8d6ae259fe` |
| 根目录文件夹 | `https://fnf-api-gw.higgsfield.ai/fnf/folders/3caa2f3a-52b5-4293-9237-0c8f76c7158a/children?size=100&sort_by=name` |
| 文件夹 items（含完整 prompt） | `https://fnf-api-gw.higgsfield.ai/fnf/folders/{folderId}/items/v2?size=50` |
| 项目页 | `https://higgsfield.ai/@higgsfield.studio/projects/hell-grind` |

### 本地缓存（D:\Temp\）

| 文件 | 内容 |
|---|---|
| `hg-api.json` / `hg-children.json` / `hg-assets.json` / `hg-items.json` / `hg-s27.json` | API 原始响应 |
| `hg-brief.log` | Project Brief 原文（一致性五件套） |
| `hg-cinedance.md` | CINEDANCE V4 SKILL 全文 33KB |
| `hg-full-prompt.txt` | 动作场景完整提示词 7,218 字符 |
| `hg-s27-full.txt` | 对话场景完整提示词 32,170 字符 |
| `hg-prompt-guide.txt` | Magnific Handbook PDF 提取文本（38 页） |
| `hg-xmsumi.html` | 苏米客拆解文 |
| `story-video-director/` | GitHub 镜像仓库全量 clone |

### GitHub 镜像仓库

| 内容 | 位置 |
|---|---|
| 仓库 | `https://github.com/zlbigger/story-video-director`（MIT，reference-materials 除外） |
| 导演技能 | `story-video-director/SKILL.md` |
| 四视图身份图 | `story-video-director/references/character-identity-sheets.md` |
| Seedance 引用规则 | `story-video-director/references/seedance-reference-rules.md` |
| 中文视听模板 | `story-video-director/references/chinese-video-prompt-template.md` |
| 时长/节拍/表演纪律 | `story-video-director/references/directing-and-runtime.md` |
| 交付契约 | `story-video-director/references/delivery-contract.md` |
| 校验器/执行器 | `story-video-director/scripts/validate_project.py` / `metaso_h3_video.py` |
| ACTING SKILL | `reference-materials/ACTING SKILL.md`（25KB） |
| LIRA SKILL | `reference-materials/LIRA SKILL.md`（30KB） |
| CINEDANCE SKILL | `reference-materials/CINEDANCE HIGGSFIELD SKILL.md`（33KB） |
| Seedance 2.5 Storyboard Director | `reference-materials/视频提示词建议.md`（30KB） |
| Magnific Handbook PDF | `reference-materials/prompt-guide-v1-2.pdf`（38 页，2.3MB） |

### 第三方

| 内容 | URL |
|---|---|
| 苏米客拆解 | `xmsumi.com/detail/3974` |

---

## 八、附录：文章与一手事实的对账

| 文章说法 | 一手核实 | 结论 |
|---|---|---|
| "4 万条提示词全公开" | 公开 API 可遍历全部 115,451 资产/100+ 文件夹，每文件夹 items/v2 返回含完整 `params.prompt` | 属实且超量（4 万是已整理子集，公开数据含更多中间产物） |
| "12 行技术底座" | hg-full-prompt.txt 实样含 Style/Cinematography/Sky 等常量块 | 属实，命名"12 行"为文章概括 |
| "三视图资产表" | Brief 原文：脸特写 + 正面全身（无头）+ 背面全身 | 属实，且"无头"是文章未展开的细节 |
| "中位数 16,501 字符" | hg-s27-full.txt 32KB（对话）、hg-full-prompt.txt 7.2KB（动作） | 量级合理（文章统计口径为全片含长对话场景） |
| "95 分钟 / 15 人 / <$500K / 14 天" | Brief 原文一致 | 属实 |
| "戛纳 2026" | Brief 原文：2026 Marché du Film | 属实 |

---

*报告完。本报告所有【实证】条目均可通过附录数据源复核；【推断】条目已明确标注。建议下一步：按 Phase 1 落地前，用双模型（antigravity + Claude）对本报告做一次交叉评审。*
