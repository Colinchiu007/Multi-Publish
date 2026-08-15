# subtitle-split-quality Specification

## Purpose
Story2Video 文案生成字幕的坏切修复（2026-08-15 用户反馈：`扶余国`→`扶余/国`、`电视剧`→`电/视剧`、
`复杂`→`复/杂`、`空白一片`→`空/白一片`、`卵生、日影受孕` 7 字孤悬）。调查证实坏切为算法缺陷而非
版本漂移（本地==远程 `6cefc0c`）。本 spec 固化三端（sidecar Python / MP TS 镜像 / MP JS 镜像）
逐字一致的字幕分句 v1.2 语义，并修复 stage-executor 字幕参数透传。

## Requirements

### Requirement: 词边界感知切分（无标点切分不劈词）
无标点硬切（Step 3）与平衡切分（Step 6）的切分锚点 SHALL 优先选择不劈词的位置：好切点
（块首为连词/介词 `good_lead`，或块尾为助词/副词/句内标点 `good_tail`）从后往前找（排除孤悬 ≤3 字短尾），
其次非黏着切点（块首字符不在 `bad_followers`）从前往后找（头块 ≥ min），最后才回退算术切分。
`word_split` 字符集 SHALL 由 `subtitle-rules.json` 规则表单源加载，三端共享，禁止手写硬编码。

#### Scenario: 扶余国不被劈开
- **WHEN** 对 `因此，在韩国的历史教科书里，能看到大量关于扶余国和扶余人的记载。` 以 min=8/max=15 分句
- **THEN** 输出包含块 `能看到大量关于扶余国` 与 `和扶余人的记载`，禁止出现 `扶余`+`国` 拆块

#### Scenario: 电视剧/朱蒙/这位 不被劈开
- **WHEN** 对 `2005年，韩国收视率最高的电视剧《朱蒙》播出，里面讲述的正是这位扶余王子的故事。` 分句
- **THEN** 输出包含 `电视剧《朱蒙》播出` 与 `这位扶余王子的故事`，禁止出现 `电`+`视剧`、`朱`+`蒙` 拆块

#### Scenario: 复杂/空白一片 不被劈开
- **WHEN** 对 `历史上的族群迁徙与政权更迭本就复杂，而民族叙事则倾向于把一切复杂简单化、直线化。` 分句
- **THEN** 输出包含 `把一切复杂简单化、直线化`，禁止出现 `把一切复`+`杂简单化` 拆块；顿号枚举整体保留

#### Scenario: 语义完整短块显式声明
- **WHEN** 词边界保护产生 clean 后 < min 的语义完整短块（如 `和扶余人的记载` 7 字）
- **THEN** 该块 SHALL 保留且必须在共享向量 `short_block_exceptions` 中按 index 显式声明 reason，
  优先不劈词；未声明的 < min 块视为违规

### Requirement: 短块判定使用 clean 后长度（修复机制三）
Step 4 短块合并的「前块 <min」与「短尾」判定 SHALL 使用剥离尾部标点后的长度（`cleanLen`），
避免 Step 5 清理标点后块变短逃过合并；并入条件 SHALL 同时满足合并后 clean 长度 ≤ max_chars，
超限时保持独立短块（由 `short_block_exceptions` 声明）；块尾为句界字符且 clean 后 >3 字的完整句
SHALL 不并入前块。

#### Scenario: 卵生、日影受孕 不再孤悬
- **WHEN** 对 `故事里充满了神话色彩。卵生、日影受孕、鱼鳖搭桥，但剥去这些奇幻的外壳，内核却无比清晰。` 分句
- **THEN** 输出包含 `卵生、日影受孕、鱼鳖搭桥`（clean 后 7 字并入后续块/按枚举整体保留），
  禁止 `卵生、日影受孕、` 独立成 7 字短块

#### Scenario: 完整句不并入前块
- **WHEN** 相邻块中后块以 `。！？…` 结尾且 clean 后 >3 字
- **THEN** 该块保持独立，不并入前块（句界优先）

### Requirement: Step 6 平衡切分越界修复
Step 6 平衡切分的标点锚点 `balanced` SHALL 满足 `0 < balanced < len(b)`；尾字符恰为标点时
`i+1 == len(b)` 的越界结果 SHALL 视为无效并回退字面平衡切点，禁止整块不切或死循环逼近。

#### Scenario: 尾标点不产生越界锚点
- **WHEN** 超长块的尾字符是优先级标点且进入平衡切分分支
- **THEN** 切分点严格落在块内部，切出的头/尾块均非空且尾块 ≥ min 或回退字面平衡

### Requirement: 字幕参数配置透传
`StageExecutor._buildStorySplitterOptions` SHALL 将 UI 层 `subtitle_min_chars`/`subtitle_max_chars`/
`subtitle_timing` 映射为 8002 `config.subtitle.min_chars_per_block`/`max_chars_per_block`/
`time_calculation_method`；这些键 SHALL 不泄漏为请求顶层键。禁止以测试断言固化「丢弃配置」行为。

#### Scenario: 字幕参数到达 8002 config
- **WHEN** split 阶段 options 携带 `subtitle_min_chars: 8, subtitle_max_chars: 15`
- **THEN** 8002 请求 `config.subtitle` 包含 `min_chars_per_block: 8, max_chars_per_block: 15`，
  且顶层不含 `subtitle_min_chars`/`subtitle_max_chars`

#### Scenario: 时间计算方法透传
- **WHEN** options 携带 `subtitle_timing: 'equal'`
- **THEN** 8002 请求 `config.subtitle.time_calculation_method === 'equal'`

### Requirement: 三端逐字一致与共享向量回归
sidecar Python、MP TS 镜像、MP JS 镜像 SHALL 对同一文本同一配置输出逐字一致的字幕块序列；
共享向量 `subtitle_segmentation_vectors.json`（含 5 条用户坏例）三副本同步，`expected_blocks`
为手工真值（禁止把实现输出直接写入向量）。

#### Scenario: Python 向量回归
- **WHEN** 在 smart-sentence-splitter 执行 `pytest tests/unit/test_subtitle_vectors.py`
- **THEN** 全部通过（含 25 条向量的块一致/min_chars 不变量/时间戳连续断言）

#### Scenario: TS 与 JS 镜像回归
- **WHEN** 执行 `pnpm --filter @multi-publish/story2video-engine test` 与
  `apps/desktop` 的 `story2video-segmentation-vectors.test.js` / `story2video-segmentation-parity.test.js`
- **THEN** 全部通过，JS 与 TS 输出一致且命中共享向量

### Requirement: 真实 8002 链路 E2E
`tests/e2e-pipeline-orchestrator.test.js` SHALL 包含通过真实 8002 `/v1/split` 执行的用户 5 段坏例用例，
断言 pipeline split 阶段输出字幕块序列命中 v1.2 目标；E2E 用例 SHALL 在每轮验证后释放并发槽。

#### Scenario: 用户 5 段坏例命中目标
- **WHEN** 8002 服务运行（sidecar 代码 ≥ v0.16.0/词边界修复）且执行该 E2E 用例
- **THEN** 5 段文本的字幕块序列分别命中共享向量 `expected_blocks`，逐字相等
