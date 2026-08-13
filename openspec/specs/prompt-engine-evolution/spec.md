# prompt-engine-evolution Specification

## Purpose
提示词引擎自进化闭环的规格基线：生成反馈采集（GenerationEvent/FeedbackEvent 双日志）支撑经验沉淀与统计，主题指纹（Topic Fingerprint）与同类模板检索支撑候选重排与经验复用，构成「采集→评估→记忆→优化→治理」闭环。
## Requirements
### Requirement: GenerationEvent 主记录 append-only
生成反馈管道 SHALL 以 GenerationEvent 为主记录，写入 `userData/generation-logs/YYYY-MM.jsonl`（append-only，月轮转，30 天清理）。字段含：id、schemaVersion、ts、engine(image|video)、mode(story2video|standalone|storyboard)、context{tenantId,userHash(加盐HMAC),sessionId,appVersion}、input{concept,creativeLevel(1..10),stylePreset,enrichment}、prompt{raw,optimized,optimizedBy,templateVersion,librarySource,experimentId/armId,structured}、provider{name,model,params}、result{status(success|failure|partial),errorCode,outputRefs,durationMs,costEstimate}。写入失败 SHALL catch+warn，不得阻断生成主流程。

#### Scenario: 一次生成产生完整主记录（P1 接线）
- **WHEN** Story2Video 流水线完成一次图片/视频生成且已接入 `recordGeneration` 生产调用点（P1 交付项，本 change 不实现）
- **THEN** 写入一条含 input/prompt/provider/result 的 GenerationEvent 到当月 JSONL，字段通过 schema 校验
- **AND** 本 change（P0）仅交付采集器能力与反馈回填流；`onEvent` 钩子已就绪（`generateImagePromptsSmart` 可选参数），生产调用方接线列入 P1 tasks

#### Scenario: 写失败不阻断主流程
- **WHEN** 日志目录不可写或磁盘满导致追加失败
- **THEN** 采集器捕获并 warn，生成主流程继续返回正常结果

### Requirement: FeedbackEvent 回填流按 eventId join
用户操作反馈 SHALL 独立写入 `feedback-log.jsonl`（append-only），字段含 eventId、ts、type(accepted|regenerated|edited|downloaded|deleted|published)、detail{accepted,regenerated,editedFields,downloaded,publishedTo}。eventId 必填且必须能 join 回主记录；无法 join 的反馈 SHALL 记录为 orphan 并告警，不丢弃。

#### Scenario: 采纳操作回填
- **WHEN** 用户在结果页点击采纳某个候选
- **THEN** 渲染进程经 generation:feedback 上报 {eventId, type:accepted}，写入 feedback-log 且与主记录 join 成功

#### Scenario: 孤立反馈标记
- **WHEN** 上报的 eventId 在 generation-log 中不存在
- **THEN** 反馈仍写入但标记 orphan，采集器输出告警

### Requirement: generation:feedback IPC 契约
桌面端 SHALL 提供 `generation:feedback` IPC（渲染→主进程），沿用 `code+data+message` 返回约定与 `core/error-codes.js` 的 EC 常量；入参必须为纯 JSON；eventId 或 sessionId 至少其一必填；校验失败返回对应 EC 错误码。

#### Scenario: 合法上报返回成功
- **WHEN** 渲染进程调用 generation:feedback 且 eventId 非空、type 合法
- **THEN** 返回 {code:0}，反馈已写入 feedback-log

#### Scenario: sessionId 关联解析
- **WHEN** 调用 generation:feedback 未携带 eventId 但携带 sessionId
- **THEN** 采集器从当月 generation-log 解析最新同 session 生成事件作为 eventId；解析失败时按孤儿反馈写入（标记 orphan，不丢弃）

#### Scenario: eventId 与 sessionId 皆缺拒绝
- **WHEN** 调用 generation:feedback 未携带 eventId 且未携带 sessionId
- **THEN** 返回校验错误码，不写入日志

### Requirement: 采集开关三态
采集能力 SHALL 支持 config 三态：全开（默认）/ 停写（不写新日志，保留已写）/ 停上报（本地照写，不上报）。开关变更即时生效。

#### Scenario: 停写后不再追加
- **WHEN** config 设置 evolution.collection=muted
- **THEN** 采集器不再追加新日志，已写日志保留

### Requirement: 基础统计
采集器 SHALL 提供按 engine 聚合的基础统计：acceptRate（采纳数/展示数）、regenerateRate（重新生成数/展示数）、平均耗时（durationMs 均值），供 `prompt-library:list` 之外的只读查询使用。

#### Scenario: 统计聚合
- **WHEN** 存在多 engine 的生成与反馈记录
- **THEN** 统计按 engine 分组返回 acceptRate/regenerateRate/avgDurationMs

### Requirement: 测试隔离与契约
反馈管道测试 SHALL 使用 `os.tmpdir()` 下带 PID/随机标识的独立路径；JSONL 读取须容忍尾部残缺行；不得依赖真实 userData 或仓库内共享路径。

#### Scenario: tmpdir 隔离
- **WHEN** 运行反馈管道测试
- **THEN** 日志路径位于 os.tmpdir() 唯一目录，测试结束清理，不触碰真实 userData

### Requirement: 主题指纹构建
系统 SHALL 从输入主题文本构建 Fingerprint：{schemaVersion, dictVersion, domains[], compositionIntents[], topics[], tone}。domains 来自 DOMAIN_DICTIONARY（6 领域，强词 1 词即中、弱词 ≥2 词）；compositionIntents 来自 applyWhen ∪ INTENT_ALIASES（强档 1 词、弱档 ≥2 词）；topics 来自 extractTopics（≤8 个、≥2 字符、剔除词典词）；tone 复用 SentimentAnalyzer 语义（positive/negative/peaceful）。输入长度 SHALL 截断至 ≤2000 字符。

#### Scenario: 同词面主题指纹
- **WHEN** 输入 "AI 改变教育"
- **THEN** fingerprint.domains 含 tech（AI 强词）与 education（教育强词），compositionIntents 含 前后对比（"改变"强档别名），topics 为空（词典词已剔除），tone=peaceful

#### Scenario: 英文词边界不误判
- **WHEN** 输入含 domain/design/maintain/apple
- **THEN** 不命中 tech（"AI" 仅命中独立 token，"app" 不命中 apple）

### Requirement: 同类模板检索与置信档位
系统 SHALL 提供 findSimilarTemplates(concept, {rand})，按 score = 4×min(2,|intents∩|) + 2×min(2,|domains∩|) + 2×min(2,|topics∩|) + 1×(tone 相同且双方≠peaceful) 计算，置信档位：intent∩=0 → NONE；4≤score<8 且 intent≥1 → MID（fragment）；score≥8 且 intent≥1 → HIGH（full，额外要求 domains∩≥1 或 topics∩≥1）。返回 {templateId, refType, score, tier, provenance}。探索 ε 仅限 active 模板集内重排，activeCount<10 时 ε=0，rand 注入可测。

#### Scenario: 示例回归
- **WHEN** 输入 "AI 改变教育" 且库中模板 {intents:[前后对比], domains:[education,tech], topics:[], tone:positive}
- **THEN** score=8 → HIGH → refType=full（domains∩≥1 满足护栏）

#### Scenario: 无意图强制 NONE
- **WHEN** 输入 "公司融资策略"（intents 无命中）
- **THEN** 返回 NONE，refType=none，templateId=null

### Requirement: 词典与词表单一来源一致性
fingerprint 使用的 applyWhen 意图词与 SentimentAnalyzer 情感词 SHALL 与 story2video-engine TS 权威版保持一致，经 parity 测试锁死；JS 词表副本与 TS 源逐字对齐。

#### Scenario: parity 一致性
- **WHEN** 运行 fingerprint parity 测试
- **THEN** JS 副本的 COMPOSITION_PATTERNS.applyWhen 8 组词与 SentimentAnalyzer 12 情感词与 TS 权威版逐项一致

### Requirement: 测试隔离与确定性
指纹模块测试 SHALL 使用 os.tmpdir() 独立路径（如涉及持久化）；extractTopics 切分/去重/排序 SHALL 确定性；rand 注入保证探索可测；全不命中时回退内置 COMPOSITION_PATTERNS 全集（行为不变）。

#### Scenario: 回退内置
- **WHEN** 输入与库中模板全不匹配
- **THEN** 返回 NONE 且调用方回退内置 8 构图（findSimilarTemplates 自身不改变内置池）

