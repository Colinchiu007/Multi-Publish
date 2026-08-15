# prompt-engine Specification

## Purpose
定义图片/视频提示词契约层的共享内核边界：领域中立逻辑（风格归一、敏感凭据守卫、中立 limits、fail-closed 校验核心）集中单一来源，领域能力边界（平台枚举、请求构造、字段收敛、max_length 范围）归属各自契约，消除「视频借用图片语义」的结构性耦合与 fail-closed 校验重复。
## Requirements
### Requirement: 共享内核模块

系统 SHALL 提供 `prompt-engine-kernel` 模块，集中导出领域中立逻辑：`PROMPT_ENGINE_STYLES`/`PROMPT_ENGINE_STYLE_ALIASES`/`DEFAULT_PROMPT_ENGINE_STYLE`/`normalizePromptEngineStyle`、`SENSITIVE_CONTEXT_KEYS`/`assertNoSensitiveContext`、`PROMPT_ENGINE_LIMITS`（JSDoc 标注 `maxLength` 为图片/8013 兼容语义，视频 SHALL 使用自有能力范围）、`clampNumber`、`extractOptimizedBase`。`extractOptimizedBase` SHALL 与现有两份实现的 fail-closed 语义一致：非对象拒绝 → error 优先 → detail 422 拒绝 → optimized_prompt 缺失/空串拒绝 → maxLength 截断（warn 回调）→ 基础 meta（platform/style/model_used/key_source）。`extractOptimizedBase` SHALL 支持可选 `opts.engineLabel`（领域名，默认空串）：仅用于失败文案 `prompt-engine {engineLabel}优化失败`，默认空串保持图片契约既有文案，视频契约传 `'视频'` 保留既有「prompt-engine 视频优化失败」文案。

#### Scenario: 共享内核导出完整
- **WHEN** 加载 `prompt-engine-kernel`
- **THEN** 上述导出全部存在且类型正确，`PROMPT_ENGINE_LIMITS` 键与既有图片契约一致

#### Scenario: extractOptimizedBase 核心语义
- **WHEN** 传入 error 响应 / detail 422 响应 / 空 prompt / 超长 prompt（含 warn 回调）
- **THEN** 分别返回对应失败结果；超长时 prompt 截断至 maxLength 且 truncated=true、warn 被调用

### Requirement: 图片契约公共 API 零变化

`prompt-engine-contract` SHALL 保持既有 13 项公共导出与行为不变（kernel 导出 ∪ 图片专属：平台枚举/别名/归一、`buildPromptEngineOptimizeRequest`、`extractOptimizedPrompt`）。`extractOptimizedPrompt` SHALL 基于 `extractOptimizedBase`，并在成功时合并 `detected_categories`/`candidates` 到 meta。

#### Scenario: 图片契约行为保持
- **WHEN** 运行既有 `prompt-engine-contract.test.js` 全量
- **THEN** 全部用例通过（零修改）

#### Scenario: 消费方 import 清单不变
- **WHEN** 检查 PromptBridge/story2video-text-config/story2video-stages/stage-executor 的 import 语句
- **THEN** 均仍从 `prompt-engine-contract` 引入，无改动

### Requirement: 视频契约内核依赖与 base 复用

`video-prompt-engine-contract` SHALL 改从 `prompt-engine-kernel` 引入共享项（import 清单不变），并 SHALL 用 `extractOptimizedBase` 替代本地 `_extractVideoBase`；`max_length` SHALL 不得借用 `PROMPT_ENGINE_LIMITS.maxLength` 语义，必须使用 `VIDEO_ENGINE_LIMITS.videoMaxLengthRanges`。

#### Scenario: 视频既有行为保持
- **WHEN** 运行 `video-prompt-engine-contract.test.js` 中既有用例（Higgsfield 新用例除外）
- **THEN** 全部通过（零修改）

<!-- 以下需求来自已归档 change prompt-engine-higgsfield-round3a（2026-08-15，PR #47） -->

### Requirement: 图片主缓存 key 全组件化

图片主缓存 `SqlitePromptCache.make_key` SHALL 纳入 `prompt`/`platform`/`creative_level`/`max_length`/`num_candidates`/`negative_prompt`/`excluded_characters`/`no_swap_pairs`/`context`（JSON sort_keys 规范化）/`style`/`language` 全组件，并带版本盐 `IMAGE_FMT_V1`；`optimizer` 的 `_cache_key/_cache_get/_cache_set` 调用点 SHALL 全链路透传新组件；legacy `_PromptCache`（tuple 键）与 `fuzzy_match_prompt` SHALL 保持零改动。`make_key` SHALL 对非 JSON 序列化 context 不抛错（`json.dumps(default=str)`）、set 输入排序归一、空容器与 None 归一。

#### Scenario: 异组件缓存不串号
- **WHEN** 同 prompt 下改变 `excluded_characters`/`no_swap_pairs`/`context`/`style`/`language` 任一组件调用 `make_key`
- **THEN** 两次 key 不同；全组件相同时 key 相同；第二次 `optimize()` 为 cache miss

#### Scenario: legacy fuzzy 零回归
- **WHEN** 运行既有 `fuzzy_match_prompt` 与 `_PromptCache` 兼容测试
- **THEN** 全部通过且行为不变

### Requirement: 视频 evaluator 确定性 FAIL CHECK

视频 evaluator SHALL 提供两个确定性 FAIL CHECK（纯结构/数学判定，无 LLM）：`timeline_missing`（-5）——`shots` 非空且长度 ≥2 时，正文（引用协议标记区剥离后）不含 `[SHOT` 且不含 `[HARD CUT` 触发；`timing_break`（-5）——`shots` 长度 ≥2 时，解析 `beats[].time`（`m:ss-m:ss`/`s.s-s.s` 区间）端点最大值超过 `shot.duration + 2s` 触发。`checks` SHALL 暴露 `timeline_hits` 与 `timing_diff`（无解析值时 None 恒存在）。refined Output Format SHALL 要求多切（shots≥2）输出嵌入 `[SHOT N]`/`[HARD CUT]` 教标记，视频缓存版本盐 SHALL bump 为 `HIGGSFIELD_FMT_V2` 使旧形态缓存失效。

#### Scenario: 多切缺标记自罚
- **WHEN** `shots` 长度 ≥2 且正文缺 `[SHOT`/`[HARD CUT`（引用块内标记不计数）
- **THEN** `violations.timeline_missing == -5` 且 `checks.timeline_hits == false`

#### Scenario: beats 越界扣分
- **WHEN** `beats[].time` 端点（秒）超过 `shot.duration + 2` 
- **THEN** `violations.timing_break == -5` 且 `checks.timing_diff` 为正数；不可解析区间不触发且 `timing_diff == null`

### Requirement: 音频分层输出

`VIDEO_OUTPUT_KEYS` 与 `VideoPromptMeta` SHALL 增加 `audio_layers`（键 environment/sfx/dialogue 各 ≤200 字符 + music_off 布尔，默认 None）；`extract_video_meta` SHALL 经 `_clean_audio_layers` 键白名单/类型/长度清洗（非法 → None）；`build_tail` SHALL 在 `audio_layers` 非空时以 `Audio: Environmental {env}. SFX: {sfx}. Dialogue: {dialogue}. No music.` 段替换 `{audio} only.`（空层省略、music_off=false 省略）。`missing_audio` 判定表 SHALL 仅 refined 层生效：`sfx` 或 `dialogue` 至少一层非空即满足（仅 environment 不算）；batch 层 SHALL 保持正文音频词/否定词检查。C6 尾行剥离 SHALL 兼容 Audio 段形态（防双尾行）。

#### Scenario: 音频分层端到端
- **WHEN** LLM 输出含 `audio_layers` 且 refined 层
- **THEN** 渲染尾行为 Audio 段、`missing_audio` 不触发；无 `audio_layers` 时旧尾行与旧判分逐字节不变

#### Scenario: batch 判定表不越权
- **WHEN** batch 层 `audio_layers` 提供 `sfx` 但正文无音频词（含否定词）
- **THEN** `missing_audio == -5` 仍触发（正文检查不被 audio_layers 接管）

### Requirement: 资源端点 UTF-8 读取

`/v1/resources` 的 JSON/YAML 资源读取 SHALL 显式 `encoding="utf-8"`；GBK locale（Windows 默认 cp936）下不得因 `read_text()` 默认编码抛 UnicodeDecodeError 被吞导致 `rag_cases` 恒 0。

#### Scenario: GBK locale 计数正确
- **WHEN** Windows GBK locale 下请求 `/v1/resources`
- **THEN** `rag_cases >= 500`（prompts_db 918 + seed 18）

