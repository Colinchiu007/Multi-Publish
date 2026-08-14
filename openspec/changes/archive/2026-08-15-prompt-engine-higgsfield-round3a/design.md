## Context

见 proposal.md（Why）与 `01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-ROUND3-2026-08-14.md`（v3.0 报告 §三）。约束与现状（评审 C1/C3/C4 实证修正）：

- **图片缓存（双轨）**：`prompt_engine/cache_manager.py` 有两条缓存——legacy `_PromptCache`（tuple 键，`fuzzy_match_prompt` TF-IDF 相似度依赖**明文 prompt**，L66-90）与主缓存 `SqlitePromptCache`（`prompt_engine/cache.py:86-153`，`make_key` 静态实现本体）+ `MemoryPromptCache`（sha256 串键）；`prompt_engine/optimizer.py:151-157/267-272` 是 `_cache_get/_cache_set` 调用点（当前只传 6 个基础参数）。**只改 cache_manager 不更新调用点，key 修复不生效；改 legacy tuple 键会撞碎 fuzzy 相似度。**
- **视频 evaluator**：`video_prompt_engine/evaluator.py`（201 行）已实现 tier/violations 4 类；`VideoShot`/`VideoBeat`（time 为 `"0:00-0:04"` 区间形态）已存在。**refined 输出契约（`strategies/generic_video.py:108-126` Output Format + `strategies/base.py` Director Workflow）从不要求正文嵌入 `[SHOT N]`/`[HARD CUT]` 标记**（评审 C2）——timeline 判据须与"教 LLM 输出标记"配套，否则自产输出必罚。
- **音频**：`VideoPromptMeta.audio` 单值；`VIDEO_OUTPUT_KEYS`（models.py L66-70）无 `audio_layers`；`extract_video_meta`（strategies/base.py L197-223）只读 `data.get("audio")`；`build_tail`（base.py L267）渲染 `{audio} only.`（评审 C3/W7）——audio_layers **无任何产出链路**，须从 LLM 输出接通。
- **基线警告**：prompt-engine 主工作区分支落后 origin/main 25+ 提交；实施必须在独立 worktree 基于 `origin/main @ 789714c` 新建分支（评审 I2 确认）。

## Goals / Non-Goals

**Goals:**
- 修复图片缓存 key 串号缺陷：约束/context/style/语言全组件入主缓存 key + 版本盐，**并更新 optimizer 调用点**（集成级验证）。
- 视频 evaluator 落地两个确定性 FAIL CHECK（timeline_missing / timing_break），纯结构/数学判定；**timeline 判据与 refined 输出契约教标记配套**（评审 C2 方案 a）。
- 音频分层输出（audio_layers）从 LLM 输出接通全链路（OUTPUT_KEYS → Output Format → extract_video_meta 清洗 → 渲染 → missing_audio 分层判定），向后兼容。
- 全量测试回归 + 集成级缓存验证。

**Non-Goals:**
- 不实现启发式 gated 扣分（warm_leak/dead_center 等，Batch C）。
- 不实现跨镜状态包（prev_final_frame，Batch B）。
- 不改 Multi-Publish 契约层（audio_layers 到上层透传留联调后续；`normalizeVideoMeta` 丢弃未知键行为不变）。
- **不修 legacy `_PromptCache`/fuzzy 路径的 key 维度缺失**（其 tuple 键结构不动，串号风险显式记录，Batch C 决策）；不纳入 `auto_detect_style`/`user_tier`/`user_own_key` 到 key（`auto_detect_style` 对同 prompt 确定性，评审 W5/W6 确认）。
- 不动 `02-source/` 遗留参考树（评审 I3）。

## Decisions

### D1: 图片主缓存 key 全组件化，legacy fuzzy 缓存不动
- 扩展对象 = `SqlitePromptCache`（cache.py make_key）+ `MemoryPromptCache` + `optimizer.py` 两处调用点。
- 新 key 组件：prompt/platform/creative_level/max_length/num_candidates/negative_prompt + **excluded_characters/no_swap_pairs/context/style（request.style 原始值，W6）/language** + 版本盐 `IMAGE_FMT_V1`；每组件 sha1[:16]，对齐视频侧 `optimizer.py:126-145` 模式。
- **legacy `_PromptCache`（tuple 键 + fuzzy_match_prompt）保持原样**——其 key 维度缺失与串号风险显式记录为 Non-Goal（Batch C 决策），避免 `fuzzy_match_prompt` 解包 ValueError 与相似度失效（评审 C4）。
- 内存主缓存 key 从 sha256 串升级为新哈希串（与 SQLite 一致）；legacy 与主缓存共存语义不变。

### D2: timeline/timing 判据与输出契约配套（评审 C2 方案 a + W1/W2/W3 修订）
- **教标记**：`strategies/base.py` Director Workflow / `generic_video.py` Output Format 增加 refined 多切指令——`shots` 长度 ≥2 时 rendered prompt 必须嵌入 `[SHOT N]`（N=1,2,...）切分标记（与 `[HARD CUT]` 语义等价，二选一）；**视频缓存 key 版本盐 `HIGGSFIELD_FMT_V1 → V2`**，旧缓存自然失效（防旧形态输出被罚）。
- `timeline_missing`（-5，对齐 failure_patterns 结构类 severity）：仅当 `video.shots` 非空且长度 ≥2 时，正文（标记区剥离后）不含 `[SHOT` 且不含 `[HARD CUT` 触发；单切/无 shots N/A。
- `timing_break`（-5）：仅当 `shots` 长度 ≥2；解析 `beats[].time` 的 `"m:ss-m:ss"`/`"s.s-s.s"` **区间形态**（split `-` 取两端，m:ss → 秒；评审 W3），每 shot 的 beats 区间端点最大值 > `shot.duration + 2s` 容差触发；解析失败 N/A。
- `checks` 暴露 `timeline_hits`/`timing_diff`。

### D3: audio_layers 从 LLM 输出接通全链路（评审 C3/W7/W8 修订）
- 产出方 = **LLM 输出**：`VIDEO_OUTPUT_KEYS` 增加 `audio_layers`；Output Format 增加可选键（`{"environment": "...", "sfx": "...", "dialogue": "...", "music_off": true}`，各层 ≤200 字符，可省略空层）；`extract_video_meta` 增加 `_clean_audio_layers`（类型/长度/键白名单清洗，非法 → None）。
- **去重（W7）**：`build_tail` 在 `audio_layers` 非空时**省略 `{audio} only.` 段**（Audio 段已含音乐守卫），避免语义冲突；渲染形态 `Audio: Environmental {env}. SFX: {sfx}. Dialogue: {dialogue}. No music.`（空层省略；music_off=false 省略 "No music"）。
- **missing_audio 判定表（W8）**：audio_layers 提供时要求 `sfx` 或 `dialogue` 至少一层非空（仅 environment 不算满足，区分"有环境音但无对白/音效"）；否则走现状（audio 字段/正文音频词/否定词）。
- 契约层 `normalizeVideoMeta` 丢弃 audio_layers 属预期（Non-Goal），上层透传留联调后续。

### D5: 评审修复（2026-08-15 Review Pass 2，Claude 单模型；antigravity 地区不可用降级）
- **C1（必须修）**：`optimizer.py` C6 尾行剥离正则 `\s*Photoreal\.?\s+NON-IP\.?\s+.*?only\.?\s*$` 不匹配 Audio 段尾行——refined + audio_layers + 超长 + LLM 尾行偏差时截断点落在 LLM 尾行中间产出双尾行。修复：正则增加 `Audio:.*`/`No music\.` 分支。
- **W1（应修）**：missing_audio 判定表在 batch 层越权接管正文检查（batch 无尾行，audio_layers 不渲染）→ 判定表限定 refined。
- **W2（应修）**：`make_key` 的 `json.dumps(context)` 对 datetime 等非 JSON 值抛错，`set` 路径异常会吞掉已成功的 LLM 调用 → `default=str` + set 排序归一 + 空容器与 None 归一。
- **Info 已修**：I1（timeline 用剥离后正文）、I2（timing_diff 恒存在）、I9（int music_off）、I10（空层不产出 `Audio: ` 残缺尾行）、I12（教指令分行）。
- **基线修复（评审期发现）**：`rest.py` 资源端点 `read_text()` 无 encoding，GBK locale 下读 UTF-8 `prompts.json` 抛 UnicodeDecodeError 被吞 → `rag_cases` 恒 0（全量 pytest 单跑失败根因，与 round3a 变更无关）。

### D4: 测试分层（评审 W9 补齐）
- 图片缓存：make_key 单测（组件/版本盐）+ **集成级**（同参异 excluded 两次 `optimize()` 第二次 cache miss）+ legacy fuzzy 兼容（`fuzzy_match_prompt` 不回归）。
- 视频 evaluator：timeline 正反例（shots≥2 带标记 ✓/缺标记 ✗/单切 N/A）+ timing 区间格式正反例（`"0:00-0:04"` 形态）+ 与既有 violations 组合；引擎真实渲染形态对照（新指令下 refined 多切输出含标记，不触发扣分）。
- 音频：OUTPUT_KEYS/extract_video_meta 链路 + 渲染单串形态 + build_tail 去重 + missing_audio 判定表（四分支）+ 零回归（无 audio_layers 时行为不变）。
