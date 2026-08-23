# Design — Higgsfield round3b 跨镜状态包（prev_final_frame）

> 本设计按 Claude 双模型评审（2026-08-15）修订：修复数据源不存在、并发模型冲突两个 Critical，重写 continuity_check 中文误报问题，上限 500→1000 防实体丢失。

## 1. 数据流

```
Story2Video 流水线（跨镜注入启用时视频优化阶段串行化）
  scenes[i] 完成优化 → 终态回写 scenes[i].video.final_frame
        │  lastFinalFrame 状态（最近完成视频场景的终态；混合轮播跳过图片场景）
        ▼
video-prompt-engine-contract.js  buildStandaloneVideoOptimizeRequest / buildVideoOptimizeRequest
        │  prev_final_frame: trim ≤1000, 非字符串丢弃, 按句截断
        ▼
prompt-engine (8020)  VideoOptimizeRequest.prev_final_frame (max_length=1000)
        │  _cache_key 纳入组件（盐 V4，与 round3c 同批一次重建）→ 承接指令注入 system prompt
        ▼
evaluator.continuity_check ← prev_final_frame 实体命中（英文 ≥40%+角色必中 / 中文白名单 ≥60% 或整句重合 ≥0.5，advisory -5）
```

## 2. 数据校验（契约层）

| 输入 | 规则 | 结果 |
|---|---|---|
| `options.prev_final_frame` 非字符串 | 丢弃，不传字段 | 请求不带 `prev_final_frame` |
| 字符串 trim 后为空 | 丢弃 | 同上 |
| trim 后 >1000 字符 | 按句截断到 1000（截到最后一个句号/分号边界，保留完整句子防切断实体） | 带截断值（防 422） |
| 合法字符串 | 透传 | 请求带 `prev_final_frame` |

上限说明（评审 Warning-2）：语料 FINAL FRAME 块中位 428 字符、40% 超 500（最长 2140），500 上限在复杂多角色终态会丢实体；同步将 `final_frame` 字段上限从 500 上调至 1000（引擎 `VideoPromptMeta.final_frame` / 契约对应校验），两字段保持同界。

引擎侧 pydantic：`max_length=1000`，超长由 FastAPI 422 拒绝（契约层已先截断，双保险）。

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
- 版本盐 `HIGGSFIELD_FMT_V2 → HIGGSFIELD_FMT_V4`：与 round3c 同批发布，一次失效重建（评审 Info：避免 V2→V3→V4 两次全量缓存重建；若两 change 独立发布，则以各自发布顺序递增）。

### 3.3 承接保真检查（evaluator.continuity_check）
- 输入：`prev_final_frame`（可选）、`context.character_list`（可选，角色白名单）。
- 英文判定（评审 Warning-3 修复）：分词保留 ≥2 字符 token，去除停用词（is/the/a/of/and/在/的/了）**与高频泛词**（camera/frame/light/left/right/screen/shot/background 等场景无关词，防泛词稀释命中率）；命中率 ≥40% 通过；WHEN 角色白名单提供 THEN 所有角色名必须命中（硬判据，任一缺失即 `continuity_break`，防「泛词命中掩盖角色丢失」）。
- 中文判定（评审 Critical-1 修复）：弃 2-gram（重叠 bigram 无法去停用词、模型改写即误报）；改用显式实体白名单——`context.character_list` 角色名 + prev_final_frame 中的位置/姿势关键词（词边界匹配）；白名单命中 ≥60% 通过；WHEN 无白名单 THEN 整句重合度（`difflib.SequenceMatcher` ratio ≥0.5）。
- 通过以上任一适用判据即通过；否则 `violations["continuity_break"] = -5`（advisory，不进硬门槛；与其余 violations 同权相加）。
- 输出 checks：`continuity_hits`、`continuity_total`、`continuity_ratio`、`continuity_method`（`wordlist` / `whitelist` / `ratio`）。
- 无 prev_final_frame 时全部跳过（零回归）。
- 择优稳定性（评审 Info）：多候选择优带 continuity_break 时仍按 evaluate score 排序；测试断言承接正确的候选不被 -5 压到明显错误位（advisory 只影响同分/接近候选排序）。

## 4. 流水线串联（Story2Video）

- **终态回写（评审 Critical-1 修复，前置条件）**：视频优化完成后将 `meta.video.final_frame`（引擎结构化输出）回写到场景对象 `scenes[i].video.final_frame`；读时三级优先序 `scene.video.final_frame` → `scene.endingState`（旧字段兼容）→ `scene.finalFrame`，写时仅写 `video.final_frame`。
- **串行化（评审 Critical-2 修复）**：跨镜注入启用时（视频场景 ≥2）视频优化阶段按场景序号**串行**执行，维护 `lastFinalFrame` 运行时状态（最近完成视频场景的终态）；场景 i 注入 `lastFinalFrame`。WHEN 仅 1 个视频场景 THEN 保持并发（零回归）。
- **混合轮播（评审 Warning-4 修复）**：图片轮播场景无视频终态；`lastFinalFrame` 仅在视频场景完成后更新，天然跳过图片场景；视频场景间即使隔着图片场景也正确串联（取上一视频场景终态）。
- 注入优先序：`lastFinalFrame`（运行时状态）→ `scenes[i-1].video.final_frame`（对象兜底）→ `scenes[i-1].endingState` → `scenes[i-1].finalFrame` → 空（不注入）。
- 首视频场景：不注入（种子）；完成后回写终态供后续场景。
- 场景上下文（scene_context）不承载终态（终态是引擎输出，经场景对象回写）。

## 5. 显示项 / 提示文字（无 UI 变更）

本 change 无用户界面改动。失败提示沿用既有错误文案（视频优化失败提示不涉及终态字段）。流水线日志增加：
`Story2VideoStages video-optimize scene {i} prev_final_frame injected ({len} chars)`（info 级，无敏感内容）。

## 6. 兼容与回归

- `prev_final_frame` 缺省 → 请求不带字段 → system prompt 无承接段 → evaluator 跳过 → 缓存 key 与旧语义等价（盐已变，同批一次重建）。
- 契约层旧调用（不带 options.prev_final_frame）行为不变。
- `final_frame` 上限 500→1000：pydantic 只限上限，旧值/旧缓存低于新上限，读取兼容零回归。
- 测试矩阵：见 spec.md 场景。