## Why

用户反馈 Story2Video 文案生成的字幕存在多处坏切（"扶余国"→"扶余/国"、"电视剧"→"电/视剧"、"复杂"→"复/杂"、"空白一片"→"空/白一片"）。调查确认（2026-08-15）：

- 运行时（PID 12356，`python -m splitter.api.rest_api` :8002）加载的正是 smart-sentence-splitter **最新** sidecar 代码（本地 HEAD == 远程 origin/main == `6cefc0c`，v0.15.2；关键文件 blob hash 一致；无任何未合入 main 的更新算法分支）。**坏切是算法缺陷，不是版本漂移。**
- 三端实现同构同缺陷：sidecar Python（`src/splitter/scene_subtitle/subtitle_segmenter.py`）、Multi-Publish TS 镜像（`packages/story2video-engine/src/text-segmentation.ts`）、JS 镜像（`apps/desktop/electron/services/story2video-segmentation-engine.js`）对 5 段用户文本输出逐字一致。

根因（逐步插桩证实，三条独立机制）：

1. **机制一（无标点长残块平衡切分劈词）**：Step 6 `_enforce_max` 平衡兜底按算术位置切（`min_pos = len - min_chars`），无词边界感知。如 17 字无标点块 `能看到大量关于扶余国和扶余人的记载` 被切成 `9+8` 劈开 `扶余/国`。
2. **机制二（Step 3 无标点硬切劈词）**：`_length_split` 在 `len >= max_chars` 且无标点时整块硬切，不检查切点是否劈词。如 `...把一切复` + `杂简单化、直线化`（劈 `复/杂`）、`...都空` + `白一片`（劈 `空/白一片`）。
3. **机制三（clean 去尾部标点后短块逃过 mergeShort）**：`_merge_short` 用**含标点长度**判定短块，Step 5 剥掉尾部标点后块变短无法补救。如 `卵生、日影受孕、`（8 字含顿号）clean 后 7 字 < min=8 却未合并。

另有配置透传 bug（真 bug，证据完整）：`apps/desktop/electron/services/stage-executor.js` `_buildStorySplitterOptions` 白名单**不包含** `subtitle_min_chars/subtitle_max_chars/subtitle_timing`，UI 配置修改无法到达 sidecar（`git log -S subtitle_min_chars` 零命中）；且 `stage-executor.test.js:151` 反向固化了丢弃行为。

## What Changes

1. **词边界感知切分（修复机制一/二）**：`_length_split` 硬切与 `_enforce_max` 平衡切分在无标点区间内优先选择不劈词的切点：
   - 规则表单源扩展 `subtitle_rules.json`（新增 `word_split` 配置：`good_lead`/`good_tail`/`bad_followers`，三端共享）；
   - 切点判定：块首为连词/介词（`和与及而但在...`）或块尾为助词/副词/句内标点（`的得是就都...，、`）时视为"好切点"；块首为强黏着后缀（`国剧化片...`）时排除；
   - 优先级：标点切点 → 词边界好切点（从后往前，排除孤悬 ≤3 字短尾）→ 非黏着切点（从前往后）→ 算术回退；
   - 允许语义完整的短块（如 `和扶余人的记载` 7 字、`里面讲述的正是` 7 字），以 `short_block_exceptions` 显式声明，**优先不劈词**。
2. **短块判定改用 clean 后长度（修复机制三）**：`_merge_short` 的"前块 <min"与"尾块短"判定改为剥离尾部标点后的长度，短块并入前块（合并后由 Step 6 平衡）。
3. **Step 6 平衡切分越界修复**：`_find_split_pos_in_range` 返回的切点 `>= len(b)`（如尾字符恰为标点时 `i+1 == len`）视为无效，回退算术切点，避免整块不切/死循环逼近。
4. **配置透传修复**：`_buildStorySplitterOptions` 增加 `subtitle_min_chars/subtitle_max_chars/subtitle_timing` → `config.subtitle.min_chars_per_block/max_chars_per_block/time_calculation_method` 映射；改写 `stage-executor.test.js:151` 的反向断言（QM 禁例：不得用断言固化丢弃行为）。
5. **三端同步**：sidecar Python 与 MP TS/JS 镜像同步修改，逐字一致；共享向量新增 6-10 条用户坏例（5 段原文 + 顿号短块 7 字/引号书名/短句+逗号边界），三副本（sidecar `tests/vectors/`、MP `packages/story2video-engine/tests/fixtures/`）同步，向量为**手工真值**。
6. **E2E**：沿用 `tests/e2e-full-pipeline.test.js` / `e2e-pipeline-orchestrator.test.js` 模式，补真实 8002 链路用例（含用户 5 段原文）。
7. **文档**：sidecar `docs/subtitle-segmentation-spec.md`（语义变化 → v1.2）+ CHANGELOG；MP `01-docs/PRD.md`、`PRD-video-creation.md`、`CHANGELOG.md`、`learnings.md`；openspec spec 同步。

## Capabilities

### New Capabilities
- `subtitle-word-aware-split`: 字幕分句词边界感知（无标点切分不劈常见词，词表规则单源共享）。

### Modified Capabilities
- `subtitle-segmentation-pipeline`（三端）：Step 3/4/6 修复机制一/二/三。
- `story2video-subtitle-config-passthrough`: stage-executor 配置透传补全。

## Impact

- sidecar 仓库：`src/splitter/scene_subtitle/subtitle_segmenter.py`、`subtitle_rules.json`、`docs/subtitle-segmentation-spec.md`、`CHANGELOG.md`、`tests/vectors/subtitle_segmentation_vectors.json`、`tests/unit/test_subtitle_vectors.py`。
- Multi-Publish：`packages/story2video-engine/src/text-segmentation.ts`、`src/subtitle-rules.json`、`tests/fixtures/subtitle_segmentation_vectors.json`、`tests/subtitle-vectors.test.ts`；`apps/desktop/electron/services/story2video-segmentation-engine.js`、`story2video-segmentation.js`、`stage-executor.js`、`stage-executor.test.js`、`story2video-segmentation-parity.test.js`；`tests/e2e-full-pipeline.test.js`、`e2e-pipeline-orchestrator.test.js`。
- 文档：`01-docs/PRD.md`、`PRD-video-creation.md`、`CHANGELOG.md`、`learnings.md`、`openspec/specs/subtitle-split-quality/spec.md`。
- 测试门禁：sidecar `pytest tests/unit/test_subtitle_vectors.py`；MP `pnpm --filter @multi-publish/story2video-engine test`；apps/desktop 相关 test；E2E `test:e2e`；QM-1 打包验证（改动 `apps/desktop/electron`）。
