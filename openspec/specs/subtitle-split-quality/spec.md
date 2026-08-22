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

### Requirement: 顿号枚举吞并谓语守卫（v1.2.1）
顿号枚举保护 SHALL 在枚举单元扫到片段尾仍无终止、且枚举单元内不含更多顿号项时判定为
「枚举项 + 谓语」被 max_chars 截断的过度吞并，回退顿号锚点（不依赖谓词引导词表）；
`predicate_starters` SHALL 包含高频动词首字 `混`。禁止产出 15+3 式劈词孤尾。

#### Scenario: 声音枚举吞谓语不劈词
- **WHEN** 对 `枪声、爆炸声、呐喊声混成一锅滚烫的粥。` 分句
- **THEN** 输出为 `枪声、爆炸声、呐喊声` + `混成一锅滚烫的粥`（10+8），
  禁止出现 `枪声、爆炸声、呐喊声混成一锅滚` + `烫的粥`（劈词孤尾）

#### Scenario: 未知谓语动词回退锚点
- **WHEN** 谓词引导词表之外的动词开头（如 `此起彼伏`）触发枚举扫描
- **THEN** 枚举保护回退顿号锚点，禁止吞并谓语整段到块尾；短头块并入超限时保持独立

### Requirement: 三端逐字一致与共享向量回归
sidecar Python、MP TS 镜像、MP JS 镜像 SHALL 对同一文本同一配置输出逐字一致的字幕块序列；
共享向量 `subtitle_segmentation_vectors.json`（含 6 条用户坏例）三副本同步，`expected_blocks`
为手工真值（禁止把实现输出直接写入向量）。

#### Scenario: Python 向量回归
- **WHEN** 在 smart-sentence-splitter 执行 `pytest tests/unit/test_subtitle_vectors.py`
- **THEN** 全部通过（含 26 条向量的块一致/min_chars 不变量/时间戳连续断言）

#### Scenario: TS 与 JS 镜像回归
- **WHEN** 执行 `pnpm --filter @multi-publish/story2video-engine test` 与
  `apps/desktop` 的 `story2video-segmentation-vectors.test.js` / `story2video-segmentation-parity.test.js`
- **THEN** 全部通过，JS 与 TS 输出一致且命中共享向量

### Requirement: 真实 8002 链路 E2E
`tests/e2e-pipeline-orchestrator.test.js` SHALL 包含通过真实 8002 `/v1/split` 执行的用户 6 段坏例用例，
断言 pipeline split 阶段输出字幕块序列命中 v1.2 目标；E2E 用例 SHALL 在每轮验证后释放并发槽。

#### Scenario: 用户 6 段坏例命中目标
- **WHEN** 8002 服务运行（sidecar 代码 ≥ v0.16.0/词边界修复 + v1.2.1 枚举守卫）且执行该 E2E 用例
- **THEN** 6 段文本的字幕块序列分别命中共享向量 `expected_blocks`，逐字相等

### Requirement: 本地字幕切分保护短语边界

本地字幕切分器 SHALL 将共享规则表中的 no_cut_bigrams 项视为不可切开的短语；该字段中的项目可以是任意长度，而不只限于两个字符。字幕切点不得落在任一匹配短语的内部。

#### Scenario: 用户样例的受保护短语不被拆开
- **WHEN** 本地切分器处理包含“蒙古”“江南”“包税人”“大汗”的用户样例文案
- **THEN** 任意相邻字幕块边界都不得落在这四个短语内部，且字幕块拼接后保留原文中的全部非块尾标点字符

#### Scenario: 受保护短语长度超过最长字幕块
- **WHEN** 配置的 max_chars_per_block 小于某个共享保护短语的长度
- **THEN** 该短语 SHALL 仍作为完整字幕块输出，不得为满足长度上限而在短语内部切分
#### Scenario: 三端共享规则保持一致
- **WHEN** TypeScript、Electron JS 镜像和 smart-sentence-splitter Python 端加载同一规则表
- **THEN** 三端 SHALL 对同一输入使用相同的短语边界保护语义

### Requirement: 在线字幕结果必须通过内容与边界质量门

在线字幕结果 SHALL 只有在按原文顺序连续覆盖场景文本，且所有相邻字幕块边界均不落在共享保护短语内部时，才可标记为 smart-sentence-splitter 并直接采用。

#### Scenario: 在线结果包含坏词边界
- **WHEN** 在线结果的字幕块覆盖率足够但在“江|南”或其他受保护短语内部切分
- **THEN** 该场景 SHALL 回退到本地字幕切分，subtitleSource SHALL 为 local-typescript，并记录可追溯的回退原因

#### Scenario: 在线结果内容错序或重复
- **WHEN** 在线字幕拼接长度达到覆盖率阈值但不能按顺序连续匹配场景原文
- **THEN** 该场景 SHALL 回退到本地字幕切分，不得以 smart-sentence-splitter 标记不连续结果

#### Scenario: 在线结果合法
- **WHEN** 在线字幕按顺序完整覆盖场景文本且所有边界安全
- **THEN** 系统 SHALL 原样采用在线字幕，并保持 subtitleSource 为 smart-sentence-splitter

### Requirement: 场景文本与现有来源合同保持兼容

字幕质量修复 SHALL 只替换不合格场景的 subtitleBlocks，不得修改服务返回的场景 text；现有 subtitleSource 枚举值 SHALL 保持兼容。

#### Scenario: 单场景回退不改变场景文本
- **WHEN** 某个在线场景因字幕质量门失败而回退
- **THEN** 场景 text SHALL 与服务结果中的规范化文本一致，且其他合格场景仍可继续使用在线字幕
