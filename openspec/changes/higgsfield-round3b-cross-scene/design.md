# Design — Higgsfield round3b 跨镜状态包（prev_final_frame）

## 1. 数据流

```
Story2Video 流水线
  scenes[i-1] 终态描述 (final_frame / endingState / finalFrame)
        │  (视频优化阶段, 按场景序号 i>0 注入)
        ▼
video-prompt-engine-contract.js  buildStandaloneVideoOptimizeRequest / buildVideoOptimizeRequest
        │  prev_final_frame: trim ≤500, 非字符串丢弃
        ▼
prompt-engine (8020)  VideoOptimizeRequest.prev_final_frame
        │  _cache_key 纳入组件 (盐 V3)  →  承接指令注入 system prompt
        ▼
evaluator.continuity_check  ←  prev_final_frame 实体命中率 ≥60% (advisory -5)
```

## 2. 数据校验（契约层）

| 输入 | 规则 | 结果 |
|---|---|---|
| `options.prev_final_frame` 非字符串 | 丢弃，不传字段 | 请求不带 `prev_final_frame` |
| 字符串 trim 后为空 | 丢弃 | 同上 |
| trim 后 >500 字符 | 截断到 500 | 带截断值（防 422） |
| 合法字符串 | 透传 | 请求带 `prev_final_frame` |

引擎侧 pydantic：`max_length=500`，超长由 FastAPI 422 拒绝（契约层已先截断，双保险）。

## 3. 功能逻辑（引擎）

### 3.1 承接指令（system prompt 注入段，仅 prev_final_frame 提供时）
新增指令段（refined 与 batch 均注入；batch 简短版）：

```
## SCENE Continuity (MANDATORY when prev_final_frame is provided)
The video model has NO memory across shots. The previous shot ends in:
{prev_final_frame}
Your rendered prompt MUST:
1. OPEN with a "SCENE pickup" paragraph restating the previous shot's end state —
   character position, pose, injuries, clothing, expression, lighting state —
   reusing the key entities from prev_final_frame VERBATIM where possible.
2. THEN continue with the new action/motion for this shot.
3. NEVER contradict or silently reset the previous end state.
```

### 3.2 缓存 key（optimizer._cache_key）
- 新增组件 `_h(request.prev_final_frame or "")`（sha1 前 16 位）。
- 版本盐 `HIGGSFIELD_FMT_V2 → HIGGSFIELD_FMT_V3`：格式语义变化（承接段影响输出），旧缓存失效。

### 3.3 承接保真检查（evaluator.continuity_check）
- 输入：`prev_final_frame`（可选）。
- 实体提取：分词后保留 ≥2 字符 token（英文按空白分词、中文按 2-gram 粗提取），去除停用词（is/the/a/of/and/在/的/了 等）。
- 命中判定：token 在输出正文（`_strip_reference_markers` 剥离后）出现即命中；命中率 = 命中数 / 实体总数。
- 阈值：≥0.6 通过；否则 `violations["continuity_break"] = -5`（advisory，不进硬门槛；与其余 violations 同权相加）。
- 输出 checks：`continuity_hits`（命中 token 数）、`continuity_total`、`continuity_ratio`。
- 无 prev_final_frame 时全部跳过（零回归）。

## 4. 流水线串联（Story2Video）

- 视频优化阶段（`story2video-stages.js`）逐场景优化时：
  - `i > 0`：取上一场景终态描述。优先序：`scenes[i-1].video?.final_frame`（引擎结构化输出）→ `scenes[i-1].endingState`（旧字段兼容）→ `scenes[i-1].finalFrame` → 空。
  - 注入 `requestOptionsForScene.prev_final_frame = <终态描述>`。
  - 首场景（i=0）或终态缺失：不注入（请求不带该字段）。
- 场景上下文（scene_context）不承载终态（终态是引擎输出，回写场景对象后由阶段串联读取）。

## 5. 显示项 / 提示文字（无 UI 变更）

本 change 无用户界面改动。失败提示沿用既有错误文案（视频优化失败提示不涉及终态字段）。流水线日志增加：
`Story2VideoStages video-optimize scene {i} prev_final_frame injected ({len} chars)`（info 级，无敏感内容）。

## 6. 兼容与回归

- `prev_final_frame` 缺省 → 请求不带字段 → system prompt 无承接段 → evaluator 跳过 → 缓存 key 与 V2 语义等价（盐已变，缓存重建一次）。
- 契约层旧调用（不带 options.prev_final_frame）行为不变。
- 测试矩阵：见 spec.md 场景。
