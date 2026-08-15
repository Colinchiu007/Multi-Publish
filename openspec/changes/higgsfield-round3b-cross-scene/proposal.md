## Why

`01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-ROUND3-2026-08-14.md`（v3.0）P0-1「跨镜状态包」是 95 分钟长片一致性的底层机制：视频生成模型无记忆，每条提示词必须重述上一镜终态（角色伤势/衣物/站位/表情/灯光状态），否则跨镜穿帮。Higgsfield 七段骨架第一段就是「角色当前状态 / SCENE 承接上一镜」。当前引擎完全没有吸收：

- `VideoOptimizeRequest` 无 `prev_final_frame` 输入；system prompt 无承接指令（模型不知道上一镜长什么样）。
- 视频缓存 key 不含该组件（同输入异承接 → 串号命中）。
- evaluator 无承接保真检查（优化结果是否逐字复用上一镜终态实体无从验证）。
- Story2Video 流水线每场景独立优化，无跨镜状态传递（上一场景 `final_frame` 不注入下一场景）。

## What Changes

### 引擎侧（prompt-engine 仓库，PR 独立）
- `video_prompt_engine/models.py`：`VideoOptimizeRequest` 新增 `prev_final_frame: Optional[str] = Field(default=None, max_length=500)`（上一镜终态描述，可选）。
- `video_prompt_engine/optimizer.py`：`_cache_key` 纳入 `prev_final_frame` sha1 组件，版本盐 `HIGGSFIELD_FMT_V2 → V3`（旧形态缓存自然失效）；`build_system_prompt` 调用点透传承接指令。
- system prompt「承接指令」（仅当 `prev_final_frame` 提供时注入）：输出必须先写 SCENE 承接段 + 角色当前状态段，逐字复用终态关键实体，再展开新动作。
- `video_prompt_engine/evaluator.py`：`evaluate()`/`select_best()` 增加 `prev_final_frame` 参数与 `continuity_check`——从上一镜终态提取 ≥2 字符实体词（去停用词），输出正文（引用标记剥离后）须命中 ≥60%，否则 `violations["continuity_break"] = -5`（advisory，不进硬门槛）。
- 测试：请求校验（>500 截断/丢弃）、缓存 key 隔离（异 prev_final_frame → 异 key）、承接指令注入/缺省、continuity_check 正反例、盐 V3 缓存失效。

### 契约/流水线侧（Multi-Publish 仓库，PR 独立）
- `video-prompt-engine-contract.js`：`buildVideoOptimizeRequest` / `buildStandaloneVideoOptimizeRequest` 透传 `options.prev_final_frame`（trim 后 ≤500，非字符串丢弃；不注入则不带该字段）。
- `story2video-stages.js` 视频优化阶段：按场景序号把上一场景的终态描述（`scene.video.final_frame` / `scene.endingState` / `scene.finalFrame` 优先序）注入当前场景请求；首场景不注入。
- 测试：契约透传 + 流水线跨镜注入（含首场景无注入、终态缺失跳过）。

## Capabilities

### New Capabilities
- `prompt-engine`：视频跨镜状态包——`prev_final_frame` 输入 + 承接指令 + 缓存隔离 + 承接保真检查（字面级）。
- `Multi-Publish`：Story2Video 视频提示词阶段跨镜状态自动串联（上一场景终态注入下一场景）。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：prompt-engine `models.py` / `optimizer.py` / `evaluator.py` / `prompt_builder.py` + 测试；Multi-Publish `video-prompt-engine-contract.js` / `story2video-stages.js` + 测试。
- 缓存：视频缓存 key 盐 V3 使旧缓存失效（行为变化：首次请求重生成）。
- 兼容性：`prev_final_frame` 缺省时全部行为与现状一致（零回归目标）。
- 文档：CHANGELOG、learnings、v3.0 报告落地状态、PRD 补充。
