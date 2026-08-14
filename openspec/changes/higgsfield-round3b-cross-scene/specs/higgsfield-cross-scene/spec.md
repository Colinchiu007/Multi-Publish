# higgsfield-cross-scene Specification

## Purpose
视频提示词跨镜状态包：引擎接收上一镜终态描述（prev_final_frame），输出承接上一镜的导演分镜提示词；流水线自动串联相邻场景终态；缓存与择优按终态隔离。

## Requirements

### REQ-1: 请求字段 prev_final_frame
- 引擎 `VideoOptimizeRequest` 新增可选字段 `prev_final_frame: Optional[str]`，`max_length=500`。
- WHEN 请求提供 `prev_final_frame` THEN 系统提示必须包含承接指令段（SCENE pickup + 角色当前状态 + 逐字复用终态关键实体）。
- WHEN 未提供 THEN 系统提示不含承接段，行为与现状一致。

### REQ-2: 缓存隔离
- `_cache_key` 必须纳入 `prev_final_frame` sha1 组件。
- 版本盐从 `HIGGSFIELD_FMT_V2` 升至 `HIGGSFIELD_FMT_V3`。
- WHEN 两个请求除 `prev_final_frame` 外完全相同 THEN 缓存 key 必须不同。

### REQ-3: 承接保真检查（字面级）
- `evaluate()`/`select_best()` 接受 `prev_final_frame`。
- WHEN `prev_final_frame` 提供 THEN 提取 ≥2 字符实体 token（去停用词），输出正文（引用标记剥离后）命中率 ≥60% 为通过；否则 `violations["continuity_break"] = -5`（advisory，不进硬门槛）。
- WHEN 未提供 THEN 跳过检查，`checks.continuity_ratio = None`。

### REQ-4: 契约透传（Multi-Publish）
- `buildVideoOptimizeRequest` / `buildStandaloneVideoOptimizeRequest` 支持 `options.prev_final_frame`。
- 数据校验：非字符串 → 丢弃；trim 后空 → 丢弃；>500 字符 → 截断到 500。
- WHEN 合法 THEN 请求体带 `prev_final_frame` 字段。

### REQ-5: 流水线跨镜串联（Story2Video）
- 视频优化阶段按场景序号注入：`i>0` 时取上一场景终态（优先序 `scene.video.final_frame` → `scene.endingState` → `scene.finalFrame`）注入 `options.prev_final_frame`。
- WHEN 首场景或终态缺失 THEN 不注入（请求不带该字段）。
- 终态注入打 info 日志（无敏感内容）。
