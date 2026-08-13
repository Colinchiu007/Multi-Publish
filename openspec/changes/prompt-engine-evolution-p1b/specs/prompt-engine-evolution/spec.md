## ADDED Requirements

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
