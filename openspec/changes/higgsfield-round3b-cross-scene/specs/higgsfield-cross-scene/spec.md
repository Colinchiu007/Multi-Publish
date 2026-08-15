# higgsfield-cross-scene Specification

## Purpose
视频提示词跨镜状态包：引擎接收上一镜终态描述（prev_final_frame），输出承接上一镜的导演分镜提示词；流水线自动串联相邻场景终态（含回写与串行化）；缓存与择优按终态隔离。

## Requirements

### REQ-1: 请求字段 prev_final_frame 与 final_frame 上限上调
- 引擎 `VideoOptimizeRequest` 新增可选字段 `prev_final_frame: Optional[str]`，`max_length=1000`。
- `VideoPromptMeta.final_frame` 上限从 500 同步上调至 1000（契约层对应校验同步；两字段同界，防复杂终态丢实体）。
- WHEN 请求提供 `prev_final_frame` THEN 系统提示必须包含承接指令段（SCENE pickup + 角色当前状态 + 逐字复用终态关键实体）。
- WHEN 未提供 THEN 系统提示不含承接段，行为与现状一致。

### REQ-2: 缓存隔离
- `_cache_key` 必须纳入 `prev_final_frame` sha1 组件。
- 版本盐升至 `HIGGSFIELD_FMT_V4`（与 round3c 同批发布，一次失效重建；若独立发布则按发布顺序递增 V3→V4）。
- WHEN 两个请求除 `prev_final_frame` 外完全相同 THEN 缓存 key 必须不同。

### REQ-3: 承接保真检查（实体级，评审修订）
- `evaluate()`/`select_best()` 接受 `prev_final_frame` 与可选角色白名单（`context.character_list`）。
- 英文：提取 ≥2 字符实体 token，去除停用词与高频泛词（camera/frame/light/left/right/screen/shot/background 等），命中率 ≥40% 通过；角色白名单提供时所有角色名必须命中（硬判据）。
- 中文：弃 2-gram；使用显式实体白名单（角色名 + 位置/姿势关键词）命中 ≥60% 通过；无白名单时整句重合度（SequenceMatcher）≥0.5 通过。
- 未通过 → `violations["continuity_break"] = -5`（advisory，不进硬门槛）。
- WHEN 未提供 `prev_final_frame` THEN 跳过检查，`checks.continuity_ratio = None`。
- checks 暴露 `continuity_hits` / `continuity_total` / `continuity_ratio` / `continuity_method`。

### REQ-4: 契约透传（Multi-Publish）
- `buildVideoOptimizeRequest` / `buildStandaloneVideoOptimizeRequest` 支持 `options.prev_final_frame`。
- 数据校验：非字符串 → 丢弃；trim 后空 → 丢弃；>1000 字符 → 按句截断到 1000。
- WHEN 合法 THEN 请求体带 `prev_final_frame` 字段。

### REQ-5: 流水线跨镜串联（Story2Video，评审修订）
- 终态回写：视频优化完成后将 `meta.video.final_frame` 回写 `scenes[i].video.final_frame`（前置条件）。
- 串行化：视频场景 ≥2 时视频优化阶段按场景序号串行执行，维护 `lastFinalFrame` 状态；仅 1 个视频场景时保持并发。
- 注入：场景注入 `lastFinalFrame`（回退 `scenes[i-1].video.final_frame` → `endingState` → `finalFrame`）；图片场景无终态自动跳过（混合轮播取上一视频场景终态）。
- WHEN 首视频场景或终态缺失 THEN 不注入（请求不带该字段）。
- 终态注入打 info 日志（无敏感内容）。