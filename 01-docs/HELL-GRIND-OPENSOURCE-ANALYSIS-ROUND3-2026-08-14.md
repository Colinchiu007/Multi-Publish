# 《Hell Grind》第三轮增量挖掘——"还能优化什么"深度分析（v3.0）

> **版本**: v3.0 ｜ **日期**: 2026-08-14 ｜ **类型**: 技术调研（纯文档，无代码改动）
> **前置**: v1.0 `HELL-GRIND-OPENSOURCE-ANALYSIS-2026-08-13.md`（方法论层，已并入 v2.0）；v2.0 `HELL-GRIND-OPENSOURCE-ANALYSIS-DEEP-2026-08-14.md`（档案语料实证 + P0/P1/P2 落地状态）
> **事实分级**: 【实证】= origin/main 代码/语料原文核验；【推断】= 基于证据的推断；【评审】= Claude 双模型评审结论
> **基线**: prompt-engine `origin/main @ 789714c`（Higgsfield 全部 PR 已合入）+ Multi-Publish 契约层
> **评审**: Claude（SESSION_ID 4f9b534d-3dda-455f-a39f-94ffd2e1d74e）；antigravity 后端不可用（地区限制），降级记录

---

## 零、结论先行（TL;DR）

v2.0 回答"机制怎么抄"，本轮回答"**还有什么没抄**"。基于引擎现状（origin/main 实测）+ 语料实证 + 双模型评审，结论：

1. **最大增量机会是"长片一致性算法内核"**：Higgsfield 七段骨架第一段「角色当前状态 / SCENE 承接上一镜」是"模型无记忆"的手工补偿，当前引擎**完全没吸收**——没有 `prev_final_frame` 输入、没有承接段生成、Story2Video 也没有跨镜状态传递。这是 95 分钟长片不穿帮的底层机制。
2. **refined 输出形态仍是"字段+渲染单串"，不是语料实证的导演分镜单**：语料精修层是 18+ 段块骨架（SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK + CUT 级 Geo/Action/Audio + FAIL CHECK 收尾），引擎输出契约尚未采纳这套骨架。
3. **全量语料只挖了 1.5%**：108 文件夹 / 4 万条 / 4,561 条中文提示词，之前只抓了 15 文件夹 598 条（258 条入库）。中文提示词是零分析状态。
4. **发现一个真实缺陷（P0）**：图片引擎 A 线对齐后，`excluded_characters`/`no_swap_pairs` 已进评分但**未进缓存 key**——请求 A（excluded=[X]）与请求 B（excluded=[]）同 key，B 会串号命中 A 的择优结果（详见 §四.1）。
5. **评审修正 3 个前提**：种子库已带 tier 标签（缺口在 RAG 未按层利用）；failure_patterns 12 条中实际 9 条未自动化；块覆盖度须拆分"生成侧/评测侧"两件事。

### 增量点总览

| 优先级 | 项 | 一句话 |
|---|---|---|
| P0-缺陷 | 图片缓存 key 串号 | excluded/no_swap/context/style/lang 未入 key，择优结果串号 |
| P0-1 | 跨镜状态包 | prev_final_frame 输入 + SCENE 承接/角色状态段 + beats[].geometry（三步走） |
| P0-2 | refined 块骨架 | 生成侧采纳语料实证 18+ 段导演分镜单 + FAIL CHECK 收尾块 |
| P0-3 | 确定性校验自动化 | timeline 结构 + beats×duration 数学校验（零误判） |
| P0-4 | 音频分层 | audio 单值 → audio_layers（环境/音效/对白/音乐） |
| P0-5 | 块覆盖度评测 | 评测侧覆盖度评分（依赖 P0-2） |
| P0-6 | 启发式 gated 扣分 | 9 条未自动化判据：lock-gated、默认 OFF、advisory |
| P1-1 | 全量语料挖掘 | 108 文件夹/4 万条/4561 中文；前置：可达性 + 再分发许可 |
| P1-2 | 种子按层利用 | RAG 按 tier 匹配/排序 + 分层注入预算 |
| P2-1 | 两阶段管线 | batch→refined opt-in（63:1 落地） |
| P2-2 | 评测闭环 | failure_stats → 人工复核队列 → 版本化 knowledge |
| P2-3 | 口径对齐 | engine_meta 暴露 checks/violations，LLM 分 vs 规则分交叉验证 |
| P2-4 | 角色映射行/占位符 | `<<<>>>` 协议兼容扩展 + 三视图资产表预留 |
| 暂缓 | 实体链保真 | 重设计为"结构化 meta 跨镜一致性"，不引 LLM NER |
| 暂缓 | 平台画像下沉引擎 | 随 P1-1 平台画像产出一并处理 |


---

## 一、现状盘点（以 origin/main 为准，避免工作区旧分支误导）

> ⚠️ **基线警告**：prompt-engine 主工作区当前在 `codex/video-prompt-lens-discipline`（0e9e282），落后 origin/main 25+ 提交，本地文件**不是**最新实现。以下全部以 `origin/main @ 789714c` 实测为准；任何实现必须先 rebase/新建分支于 origin/main。

| # | 机制（v2.0 声称已落地） | 核验 | 证据（origin/main） |
|---|---|---|---|
| 1 | tier 层级 + 层级长度 | ✅ | `evaluator.py` detect_tier；batch en 100-400 词 / refined 500-5000 词（词数刻度，W4 联动） |
| 2 | violations 扣分 | ✅ 4 类 | excluded_present -10 / swap_source_present -10 / missing_trailer -10 / missing_audio -5；`[ABSENT]`/`<<<>>>` 标记剥离防自罚 |
| 3 | 输出字段 | ✅ | `models.py` VideoPromptMeta：positive_constraints/excluded_characters(≤10)/no_swap_pairs(≤5)/color_ratio(60:30:10)/shots(≤3)/final_frame(≤500)/continuity_token/aspect/audio |
| 4 | appendVideoTrailer 尾行 | ✅ | refined 尾行 NON-IP/画幅/时长/音频；幂等 + 超长保 NON-IP |
| 5 | 导演风格词典 | ✅ 17 位 | `knowledge/director_styles.json` + system prompt `## Director Style Reference` |
| 6 | 角色描述符 | ✅ 8 卡 | `knowledge/character_descriptors.json` + system prompt 注入 |
| 7 | failure_patterns | ✅ 12 条 | `knowledge/failure_patterns.json`（含 FAIL CHECK 判据）；**但 evaluator 只自动化 4/12，9 条未进扣分** |
| 8 | 种子语料 | ✅ 258 条 | `knowledge/seed_higgsfield_prompts.json`（id/title/description/prompt_text） |
| 9 | select_best 择优 | ✅ | evaluator + optimizer 双端；num_candidates 1-5 |
| 10 | 平台参数画像 | ⚠️ 契约层 | Multi-Publish `PLATFORM_VIDEO_PROFILES`（seedance 15s/1080p/21:9/audio）；引擎 models 默认仍硬编码 16:9/SFX |
| 11 | 图片引擎对齐（A 线） | ✅ | `prompt_engine/evaluator.py` evaluate_quality（violations 图片子集：excluded/swap，无 trailer/audio）+ detect_tier + 图片波段；models 已加 excluded/no_swap |
| 12 | 运营后台双路评测（B 线） | ✅ | `ops-center` prompt_eval_service compare_mode(dual)/variants/聚合对比/engine-status |

### 1.1 关键事实：failure_patterns 12 条的真实构成【实证】

| 类型 | 判据 | 是否自动化 |
|---|---|---|
| 输出校验型 | absent_character_appears / character_swap / audio_block_missing / timing_break / timeline_missing | 2/5（absent/swap；audio 有独立规则；timing/timeline **未自动化**） |
| 预防注入型 | face_skin_detail_fail(44%) / gaze_camera_fail(60%) / exposure_break / silhouette_break / warm_light_leak / style_contamination / dead_center_composition | 0/7（全部依赖 lock 上下文，后验检测会误伤） |

→ 实际**未自动化 9 条**（v2.0 口径"4 类已落地"低估了缺口；Claude 评审 C4 修正）。

---

## 二、三个前提修正（Claude 评审 Critical）

1. **种子已分层，缺口是"未按层利用"**【评审 C2】：258 条种子 `categories` 已带 `tier:refined(106)/batch(100)/variant(29)/asset(23)` + `quality_score`；`build_higgsfield_seeds.py` 用 TIER_FOLDERS + 长度兜底分层。真正缺口：**RAG retriever 只按 platform 过滤，检索结果不按 tier 匹配/排序**，分层注入预算也未实现。
2. **块覆盖度须拆两件事**【评审 C3】：引擎 refined 输出是"结构化字段 + 渲染单串 + 尾行"，**不产出语料块骨架**；且我初拟的块集合（REFERENCES/AUDIO/COMPOSITION…）与语料实证块（SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK）是两套 taxonomy。→ 拆为 P0-2（生成侧采纳骨架，价值最高）+ P0-5（评测侧覆盖度，依赖前者）。
3. **工作区基线错位**【评审 C1】：当前分支无任何 Higgsfield 机制，实现前必须从 origin/main 起新分支（本轮分析已全部以 origin/main 为准，规避此坑）。

---

---

## 三、P0 机制级增量（6 项 + 1 缺陷）

### P0-缺陷：图片缓存 key 串号（必须最先修）【实证】

- **现象**：`prompt_engine/cache_manager.py:100-113` 的 key = `prompt|platform|creative_level|max_length|negative_prompt|num_candidates`，**不含** `excluded_characters`/`no_swap_pairs`/`context`/`style`/`language`，也无版本盐。
- **根因**：A 线对齐后图片 evaluator 的 violations 扣分依赖 excluded/no_swap（择优结果随其变化），但 key 未同步扩展。请求 A（`excluded=["JAX"]`）与请求 B（`excluded=[]`）key 相同 → B 命中 A 的择优结果（串号）。`context` 未入 key 是既有 bug，本次放大。
- **修法**：对齐视频 key（`optimizer.py:126-145`：每组件 sha1 哈希 + ctx_hash + language + 版本盐 `HIGGSFIELD_FMT_V1`）；图片 key 增加 excluded/no_swap 哈希 + context_hash + style + language + 版本盐；bump 版本清旧缓存；补回归测试（同参数异 excluded → 不同 key）。
- **回归保护**：`test_cache_key` 系列：A/B 两组请求断言 key 不同；context 变化断言 key 不同。

### P0-1：跨镜状态包（价值最高）【评审采纳，拆三步】

Higgsfield 七段骨架第一段「角色当前状态」+「SCENE 承接上一镜」是 95 分钟一致性的底层机制——模型无记忆，每条提示词必须重述上一镜终态（伤势/衣物/站位/表情）。

- **Step 1 引擎注入（低成本，立即做）**：`VideoOptimizeRequest` 增加 `prev_final_frame: str`（可选，≤500）；system prompt 增加"承接指令"（若提供 prev_final_frame，输出须先写 SCENE 承接段 + 角色当前状态段，逐字复用终态关键实体）；缓存 key 加该组件。
- **Step 2 契约/流水线串联（跨仓协调）**：Multi-Publish 契约层 video-prompt-engine-contract.js 输入侧加 `prev_final_frame` 透传校验；Story2Video 流水线把上一场景的 `final_frame`（输出）自动注入下一场景请求。
- **Step 3 承接保真检查（先字面后语义）**：evaluator 增加 `continuity_check`——prev_final_frame 中的实体词（角色名/位置/状态词）须在输出中出现（字面级先做，复用 `_contains_word`）；语义级（LLM NER）暂缓（见 P-暂缓）。
- **并入 P2-4**：`beats[].geometry`（站位几何：谁在哪/离多远/朝哪边）随跨镜包一起设计，避免两次契约变更。
- **评审 W1 提醒**：引擎无状态，依赖链为"契约层 + Story2Video（外部仓库）"，三步必须分阶段验收。

### P0-2：refined 生成侧采纳语料块骨架 + FAIL CHECK 收尾块【评审 C3 拆分采纳】

- 语料精修层实证骨架（Scene_74/Orphanage/15-16 中位 21-27KB）：SCENE NOTE → SPATIAL LAYOUT → LIGHTING → COLOR → CAMERA → ENVIRONMENT → CONTINUITY → CHARACTERS → SKIN → ACTING → STILLNESS LOCK → 位置锁 → THE VISUAL STATEMENT → CUT 级（Geo/Action/Audio）→ FAIL CHECK → FINAL FRAME。
- **落地**：refined 的 Output Format JSON 增加 `blocks`（或输出模板按骨架组织渲染单串）；FAIL CHECK 收尾块（"若 X 出现 → 判定错误"的 if-then 自审段）加入 refined 模板（与 STRICT/FINAL FRAME/尾行互补）。
- **契约影响**：输出新增字段必须向后兼容（保留旧字段），合约层版本化；缓存 key 版本盐已覆盖格式变化（视频侧 HIGGSFIELD_FMT_V1 → V2）。
- **价值**：让引擎输出的 refined 形态从"字段拼接"升级为"导演分镜单"，是 63:1 精修层的形态本质。

### P0-3：确定性校验自动化（零误判，先做）【评审 I4 补充】

- timeline 结构检查：多切提示词必须含 `[SHOT N]`/`[HARD CUT]` 标记（failure_patterns.timeline_missing 的数学化）。
- beats×duration 校验：beats 时间锚和 vs shot.duration 冲突（timing_break：如 10s 场景塞 6 段超预算）——纯数学、零误判、零成本。
- evaluator 新增 `violations["timeline_missing"]`/`violations["timing_break"]`（-5~-10）。

### P0-4：音频分层【评审采纳】

- 现状：`audio` 字段单值（默认 "SFX"，≤50 字符），appendVideoTrailer 拼 `{audio} only.`；语料 64% 有完整 Audio 块（Environmental SFX only. No music. No subtitles + 对白/风声/脚步声细节）。
- **落地**：新增 `audio_layers: {environment, sfx, dialogue, music_off}`（向后兼容：保留 audio + 新增 audio_layers）；refined 模板输出完整 Audio 段；missing_audio 检查按 layers 细化。

### P0-5：评测侧块覆盖度评分【依赖 P0-2】

- P0-2 落地后，evaluator 增加"语料块覆盖度"检查：SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK/FINAL FRAME 中 refined 输出应覆盖 ≥N 块（阈值先用 258 语料统计定）。
- 与 P0-2 同 change 分阶段验收（3a 先、3b 后）。

### P0-6：启发式 gated 扣分（lock-gated、默认 OFF、advisory）【评审 C4】

- 9 条未自动化判据中，预防注入型 7 条（曝光/剪影/死中心/暖色泄漏/风格污染/皮肤/视线）是**条件规则**：只在声明 lock 时启用（如 `warm_light_leak` 仅当"冷色锁"存在时检测暖色词；`dead_center` 仅当构图声明 rule-of-thirds 时检测 center 词），默认 OFF、advisory 扣分（-5 起，不进硬门槛）。
- 高频失败项（皮肤 44%/视线 60%）优先走**注入**（system prompt 强化）而非后验扣分。
- 阈值须用 258 语料先验（误报率 <5%）后再决定是否硬化。

---

## 四、P1/P2 语料资产与管线评测级增量

### P1-1：全量语料挖掘（最大未开发资产）【评审采纳，前置最多】

- **现状**：已抓 15 文件夹 598 条（D:\Temp\hg-corpus\ 现存），入库 258 条；全量 = 108 文件夹 / 4 万条 / 4,561 条中文提示词。
- **增量**：
  - 中文提示词模板分析（zh 专属块结构、中文禁令表达）→ 中文种子库 + zh 层级长度校准；
  - 更多禁令/FAIL CHECK 判据沉淀（4 万条 vs 598 条的规则库扩充）；
  - 分层模板形态再验证（批量/精修/变体/资产的块分布统计）；
  - 平台画像补全（模型/时长/分辨率/画幅/音频参数分布）。
- **前置（评审强调）**：语料 API 可达性（2026-08-13 曾无鉴权可达，需复验）+ **再分发许可**（4 万条提示词入库须确认许可边界，建议仅提炼规则不整库入库）。
- **落地形态**：抓取脚本 → 统计脚本（块频率/tier 分布/中文占比）→ 增量种子（人工复核后）→ knowledge 资产版本化。

### P1-2：种子按层利用（前提修正后）【评审 C2】

- 258 条已带 `tier` 标签（refined 106/batch 100/variant 29/asset 23），RAG retriever 只按 platform 过滤。
- **落地**：`rag_retriever.py` 检索结果按当前请求 tier 过滤/排序（batch 请求不注入 refined 长模板）；分层注入预算（batch 语境只注入 batch 种子）；quality_score 参与排序。

### P2-1：两阶段管线（opt-in）【评审采纳】

- 63:1 抽卡→精修的工程化：`pipeline: "two_stage"` 显式开启（默认单次，成本 2-4× 不可默认）；Stage1 batch 粗生成 N 候选（成本模型 batch 3-5）→ evaluator 择优 → Stage2 以择优结果为输入做 refined 精修（仅 1 次）；预算护栏 + N+1 调用计数。
- 复用 `docs/HELLGRIND-NUM-CANDIDATES-COST-MODEL.md` 参数化。

### P2-2：评测闭环（人工复核队列）【评审采纳】

- 运营后台双路评测（B 线已上线）的 failure_stats/低分维度 → **人工复核队列**（禁止自动改 JSON）→ 复核通过后版本化更新 failure_patterns/种子。
- 价值：让真实评测数据回流知识资产，形成"评测→规则→优化→再评测"闭环（Higgsfield 元规则：翻车点反向写成禁令）。

### P2-3：口径对齐（engine_meta 先行）【评审拆分采纳】

- 引擎返回的 `checks`/`violations`/`tier` 写入评测 `engine_meta`（**可立即做，观测性便宜**）；
- 运营后台 LLM 维度分 vs 引擎规则分交叉验证（分析任务，不改变确定性评分契约）。

### P2-4：角色映射行/占位符协议（兼容扩展）【评审 I3/I4】

- 现有 `<<<>>>` 引用协议（`_strip_reference_markers`/`_assertReferenceProtocol`）已存在；`character_map[]` 应作为**兼容扩展**（批量层占位符 ↔ refined 描述符替换），不引入第二套协议。
- 三视图资产表预留：角色卡增加 front/side/¾ 视图几何描述（文字版三视图），为未来图片引用资产 ID 打底。

### 暂缓（明确不本期做）

| 项 | 原因 |
|---|---|
| 实体链保真（LLM NER） | 破坏确定性评分契约；重设计为"结构化 meta 跨镜一致性"（P0-1 Step 3 字面级先行） |
| 平台画像下沉引擎侧 | 小项，随 P1-1 平台画像产出合并处理 |
| 完全合并图片/视频引擎 | 违背 8020/8013 独立部署边界（评审 C 选项被否） |

---

## 五、实现顺序建议（依赖图）

```
P0-缺陷 图片缓存 key（无依赖，独立小 change）
  ↓
P0-3 确定性校验（无依赖，独立）
P0-4 音频分层（无依赖，独立）
P0-1 Step1 引擎注入 prev_final_frame（依赖：models + system prompt + key）
  ↓
P0-1 Step2 契约/Story2Video 串联（依赖 Step1，跨仓）
P0-2 refined 块骨架（依赖：输出契约版本化 + key 版本盐）
  ↓
P0-5 块覆盖度（依赖 P0-2）
P0-1 Step3 承接保真检查（依赖 Step2）
P0-6 启发式 gated（依赖 258 语料阈值统计，可并行 P1-1）
  ↓
P1-1 全量语料挖掘（前置：可达性 + 许可）→ P1-2 种子按层利用
P2-1~P2-4（管线/评测/协议，各自独立）
```

建议按 OpenSpec change 拆 3 个批次：**Batch A**（P0-缺陷 + P0-3 + P0-4，独立小 change）；**Batch B**（P0-1 跨镜状态包，最大价值）；**Batch C**（P0-2/P0-5/P0-6 输出形态升级）。

---

## 六、评审记录与证据索引

- **Claude 评审**（SESSION_ID 4f9b534d-3dda-455f-a39f-94ffd2e1d74e）：3 Critical（C1 基线错位 / C2 种子已分层 / C3 块覆盖度拆分 / C4 判据分类）+ Warnings（跨镜依赖链/音频兼容/占位符协议）+ Info（beats×duration 校验、FAIL CHECK 收尾块、STILLNESS 锁、三视图预留）；修订后优先级见 §零。
- **antigravity**：后端不可用（地区限制），降级为单模型评审 + 主代理复核（与既往 review.md 降级记录一致）。
- **证据**：引擎代码 `git show origin/main:video_prompt_engine/{evaluator,models,optimizer}.py`、`prompt_engine/{cache_manager,evaluator,models}.py`；语料 `D:\Temp\hg-corpus\*.json`；契约 `apps/desktop/electron/services/{video-prompt-engine-contract,prompt-engine-contract,prompt-engine-kernel,story-context-engine}.js`；评测 `ops-center/backend/services/prompt_eval_service.py`。
- **重要提醒**：prompt-engine 主工作区当前分支落后 origin/main 25+ 提交，任何实现前必须 rebase/新建分支。

---

*报告完。本报告所有【实证】条目均可在 origin/main 或 D:\Temp\hg-corpus\ 复核；【评审】为 Claude 结论。建议：P0-缺陷（图片缓存 key）可作为独立 S/M change 立即实施，其余按 §五 批次推进。*

---

## 七、落地状态（Batch A / round3a 已实施，2026-08-15）

本报告 §五 的 **Batch A**（P0-缺陷 图片缓存 key + P0-3 确定性校验 + P0-4 音频分层）已作为 OpenSpec change `prompt-engine-higgsfield-round3a` 实施完毕并合并（PR #47，commit `ea35c78` feat + `e1f1788` fix，CI 全绿）：

- **P0-缺陷（图片缓存 key 串号）**：`prompt_engine/cache.py make_key` 纳入 excluded/no_swap/context/style/language 组件 + 版本盐 `IMAGE_FMT_V1`；`cache_manager.py`/`optimizer.py` 调用点全量透传；legacy fuzzy 零回归。
- **P0-3（确定性校验自动化）**：`video_prompt_engine/evaluator.py` 新增 `timeline_missing`（shots≥2 缺 `[SHOT`/`[HARD CUT` 标记，-5）与 `timing_break`（beats 端点超 duration+2s，-5）纯结构/数学校验；refined 模板教 `[SHOT N]` 标记；视频缓存盐 `HIGGSFIELD_FMT_V1 → V2`。
- **P0-4（音频分层）**：`models.py` 新增 `audio_layers {environment, sfx, dialogue, music_off}`；`_clean_audio_layers` 键白名单/截断 200/`music_off` 归一；尾行以 `Audio: ... SFX: ... Dialogue: ... No music.` 四段替换 `{audio} only.`；missing_audio 判定表按层细化（仅 refined 尾行生效）。
- **顺带基线修复**：`rest.py` 资源端点显式 utf-8 读取（Windows GBK locale 下 prompts.json 读取抛 UnicodeDecodeError 被吞导致 `rag_cases` 恒 0 的既有缺陷）。
- **测试**：新增 3 个测试文件 + 评审回归；全量 pytest 736 passed / 0 failed / 3 skipped（5 个 `test_web_e2e.py` Playwright 无服务端的环境性 error 与本变更无关）。
- **评审**：Claude 双模型 1 Critical（尾行剥离正则兼容 Audio 段）+ 2 Warning（batch 判定表限定 refined / make_key 非序列化防炸+归一）全修复；13 Info 中 6 项已修，其余（I3/I4/I5/I8/I11/I13）归 Batch B/C。

Batch B（P0-1 跨镜状态包 `prev_final_frame`，最大价值）与 Batch C（P0-2/P0-5/P0-6 输出形态升级）按 §五 依赖图继续推进。

---

## 八、落地状态（Batch B/C / round3b + round3c 已实施，2026-08-15）

§五 的 **Batch B（P0-1 跨镜状态包）** 与 **Batch C（P0-2/P0-5/P0-6 refined 块骨架/覆盖度/gated 扣分）** 已作为两个 OpenSpec change 实施完毕：`higgsfield-round3b-cross-scene`、`higgsfield-round3c-refined-output`（prompt-engine 独立视频引擎 + Multi-Publish 契约/Story2Video 双侧交付）。

### Batch B — 跨镜承接状态包（长片一致性算法内核）

- **边界**：`prev_final_frame` 与计划 `final_frame` 统一 **1000 字符** 上限；桌面契约侧超长按句截断（句末回溯，无句末硬截断），非字符串/空丢弃。
- **缓存**：`HIGGSFIELD_FMT_V4` 版本盐（承接段 + 块骨架改变输出形态，旧缓存一次失效）；key 纳入 `prev_final_frame` 哈希，同参数异承接不再串号。
- **承接注入**：仅当存在 `prev_final_frame` 时注入 `## SCENE Continuity` 段；`<prev_final_frame>` 为事实引用并显式声明非指令（防注入）。
- **连续性评分（advisory -5）**：英文实体命中率 ≥40% + 角色白名单硬判据；中文白名单 ≥60% 或整句重合 ≥0.5；无承接零回归。
- **Story2Video 串联**：视频提示词优化按场景顺序串行（媒体生成保持并发）；计划终态回写 `scene.video.final_frame`；断点续跑从 checkpoint 终态三级回退恢复链；缺终态显式 `degraded` 断链记录（`mode: planned_final_frame` + `status/reason`），不虚构连续性。
- **引擎选择**：8020 独立引擎优先，失败回退 8013 `domain=video`，结果保留 `engine_source` provenance。

### Batch C — refined 导演分镜块骨架 + 覆盖度 + 启发式 gated

- **语料资产**：`scripts/analyze_hg_corpus.py`（只读分析：599 条语料分族统计 director 135 / inline 464 + 12 块频率 + lock 词否定率）→ `video_prompt_engine/knowledge/refined_blocks.json`（version 2：12 块顺序、块标题正则、`coverage.min_ratio=0.8`、7 条规则定义与默认启用 3 条）。
- **块契约**：`VideoPromptMeta.blocks` 12 键白名单（SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK/FINAL FRAME），值仅非空字符串、≤4000；缺失块用 legacy 字段回退，无有效块走旧渲染器。
- **渲染与尾行**：块按规范顺序渲染（行首 `块名:` + 文本）；FAIL CHECK 仅模型指令，意外输出剥离；尾行归一只认含画幅/时长的完整 trailer 尾段（块内 `Photoreal NON-IP aesthetic` 字面量不误删）。
- **覆盖度评分**：分母 = 非空 blocks 数，分子 = 渲染串命中块标记数；<0.8 记 `block_coverage = -5`（advisory，不拒绝候选）。
- **gated 规则**：7 条（warm_light_leak/dead_center/exposure_break/silhouette_break/style_contamination/skin_guard/eye_line），默认启用 `dead_center/exposure_break/eye_line`；lock 与 forbidden 均需「活跃且非否定」才触发——`not overexposed`/`no waxy skin` 不判罚；`style_contamination` 不用 `photoreal` 触发词。
- **缓存**：B/C 合并输出形态统一在 V4 盐下分区，与 Batch A 的 V2 语义隔离。

### 验证记录

- prompt-engine：全量 `pytest tests/ -q --ignore=tests/test_web_e2e.py` 通过（810 passed / 3 skipped；5 个 web E2E 需本地 server，与基线一致）；新增 `test_cross_scene.py` / `test_refined_blocks.py` / `test_analyze_hg_corpus.py`。
- Multi-Publish 契约：`video-prompt-engine-contract.test.js`（99）+ `story2video-stages.test.js`（101）+ `story2video-manual-assets.test.js`（21）= **221 passed**；`openspec validate` B/C/hardening 三 change strict 均 valid。
- 硬化：`openspec-sync-check` 修复 2 个历史三同步断裂（p2-home-i18n 关联 `desktop-ui-i18n-p2`、prompt-eval-ops-workbench 关联同名 change——终态 status/currentPhase 归一 + `supersededBy`/`remoteStatus` 证据补齐），脚本 +16 回归测试、JSON 检查 `ok: true`。

*本轮全部实现可在对应 PR 合并后的 origin/main 复核。*
