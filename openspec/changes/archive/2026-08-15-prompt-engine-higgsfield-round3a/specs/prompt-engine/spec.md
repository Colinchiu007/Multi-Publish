# Spec: prompt-engine Higgsfield Round3 Batch A

## Requirements

### REQ-1: 图片主缓存 key 全组件化（修复串号）
- 1.1 `prompt_engine/cache.py` `SqlitePromptCache.make_key` 必须纳入：`prompt`、`platform`、`creative_level`、`max_length`、`num_candidates`、`negative_prompt`、`excluded_characters`、`no_swap_pairs`、`context`（JSON 规范化哈希）、`style`（request.style 原始值）、`language`。
- 1.2 key 含版本盐 `IMAGE_FMT_V1`；组件哈希 sha1 前 16 位（对齐视频侧）。
- 1.3 `prompt_engine/optimizer.py` 的 `_cache_key/_cache_get/_cache_set` 调用点必须把新组件从 `request` 传入（缺一即 key 不生效）；`MemoryPromptCache` key 同构。
- 1.4 legacy `_PromptCache`（tuple 键）与 `fuzzy_match_prompt` **不得改动**（兼容保留；其 key 维度缺失为 Non-Goal）。
- 1.5 验收：单元——同参异 excluded/no_swap/context/style/language → key 不同，全同 → 相同；版本盐变更 → 旧 key 失效；**集成——同参异 `excluded_characters` 的两次 `optimize()` 第二次必须 cache miss**；`fuzzy_match_prompt` 既有测试零回归。

### REQ-2: 视频 evaluator 确定性 FAIL CHECK 自动化（与输出契约配套）
- 2.1 **教标记（前置）**：`strategies/base.py`/`generic_video.py` Output Format 增加 refined 多切指令——`shots` 长度 ≥2 时 rendered prompt 必须嵌入 `[SHOT N]`（或 `[HARD CUT]`）切分标记；视频缓存 key 版本盐 `HIGGSFIELD_FMT_V1 → V2`。
- 2.2 `timeline_missing`（-5）：`video.shots` 非空且长度 ≥2 时，正文（标记区剥离后）不含 `[SHOT` 且不含 `[HARD CUT` 触发；否则 N/A。
- 2.3 `timing_break`（-5）：仅 `shots` 长度 ≥2；解析 `beats[].time`（`m:ss-m:ss`/`s.s-s.s` 区间，split `-` 取两端转秒），每 shot beats 区间端点最大值 > `shot.duration + 2s` 触发；解析失败 N/A。
- 2.4 `checks` 暴露 `timeline_hits` 与 `timing_diff`。
- 2.5 与既有 violations 组合共存；总分沿用 `score += sum(violations.values())`。

### REQ-3: 音频分层输出（LLM 产出全链路，向后兼容）
- 3.1 `models.py` `VIDEO_OUTPUT_KEYS` 增加 `audio_layers`；`VideoPromptMeta` 增加 `audio_layers: Optional[dict]`（键 environment/sfx/dialogue/music_off，各层 ≤200 字符），默认 None。
- 3.2 `strategies/base.py` `extract_video_meta` 增加 `_clean_audio_layers`（键白名单/类型/长度清洗，非法 → None）；Output Format 增加可选键说明。
- 3.3 `build_tail`：`audio_layers` 非空时省略 `{audio} only.` 段（避免与 Audio 段语义冲突）；渲染 `Audio: Environmental {env}. SFX: {sfx}. Dialogue: {dialogue}. No music.`（空层省略；music_off=false 省略 "No music"）。
- 3.4 `missing_audio` 判定表：**仅 refined 层**（Audio 段真实渲染进尾行）audio_layers 提供 → `sfx` 或 `dialogue` 至少一层非空即满足（仅 environment 不算）；batch 层无尾行，一律走正文音频词/否定词检查（评审 W1 修订）；未提供 → 现状。
- 3.5 零回归：无 `audio_layers` 时渲染与判分行为与合并前一致。

### REQ-4: 评审修复（2026-08-15 Review Pass 2）
- 4.1 C6 尾行剥离正则必须兼容 Audio 段形态尾行（`Audio: ...`/`No music.` 结尾），refined + audio_layers + 超长输出截断不得产出双尾行。
- 4.2 `make_key` 对非 JSON 序列化 context（datetime 等）不得抛错阻断主流程（`json.dumps(default=str)`）；`set` 集合输入排序归一；空容器与 None 归一。
- 4.3 timeline 判定基于引用协议标记剥离后的正文；`checks.timing_diff` 恒存在（无解析值时 None）。
- 4.4 资源端点 JSON/YAML 读取显式 `encoding="utf-8"`（GBK locale 下 `read_text()` 默认编码抛 UnicodeDecodeError 被吞 → rag_cases 恒 0 基线缺陷）。

## Acceptance Criteria
- [ ] REQ-1.5 全用例通过（含集成级 cache miss + fuzzy 零回归）。
- [ ] REQ-2.5 用例通过；新指令下 refined 多切输出含标记（对照用例不触发）；既有 evaluator 测试零回归。
- [ ] REQ-3.5 用例通过；audio_layers 链路（OUTPUT_KEYS → extract → 渲染 → 判定）端到端断言。
- [ ] prompt-engine 全量 pytest 通过；视频缓存版本盐 bump 后旧缓存失效验证。
