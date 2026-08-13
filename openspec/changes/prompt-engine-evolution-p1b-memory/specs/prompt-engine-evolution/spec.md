## ADDED Requirements

### Requirement: 记忆库模板结构与版本化存储
系统 SHALL 提供 PromptMemory 记忆库，以 `prompt-library/library.json` 索引 + `templates/<id>@<version>.json` 版本化文件持久化模板。模板字段含 id、engine(image|video)、type(composition|style|keyword|metaphor|full)、version、content(结构化)、source(builtin|learnt|manual)、provenance{learnedFrom,acceptedEvents}、stats{uses,acceptRate(滑窗),avgScore,avgCost,lastUsedAt}、state(draft|active|deprecated|disabled)、createdAt/updatedAt/confirmedBy、guard{checksum,validatedAt,gateRules,evaluatorVersion}。learnt fragment 的 content 仅允许 compositionType/action/object/creativeLevel 四类可控参数，越界字段入库即拒绝。加载时校验 dictVersion，不匹配则惰性重算指纹或标 stale 不参与检索。

#### Scenario: learnt fragment 仅四类参数
- **WHEN** 提交的 learnt fragment content 含 color/keywords/metaphor 等越界字段
- **THEN** 入库被拒绝并返回门禁错误码，不产生模板文件

#### Scenario: dictVersion 变更缓存失效
- **WHEN** 记忆库模板指纹的 dictVersion 与当前 DICT_VERSION 不一致
- **THEN** 旧指纹标 stale 不参与检索，或惰性重算后再参与（与 fingerprint 缓存失效语义一致）

### Requirement: 门禁 6 规则
系统 SHALL 在 learnt/manual 模板进入 draft 前执行门禁 6 规则：structure（按 engine/mode 分档字段完整）、compliance（合规词表）、length（按 engine 分档：storyboard 中文 50..2000 字符、英文 prompt 50..200 词）、noSecrets（疑似指令注入模式）、dedup（checksum 去重 + 近重复聚类淘汰）、evaluatorVersion 记录。任一规则失败，模板不得进入 draft。

#### Scenario: 门禁拦截注入模板
- **WHEN** 待入库模板 content 含疑似指令注入模式（如越权指令/分隔符逃逸）
- **THEN** noSecrets 规则失败，模板拒绝进入 draft，返回门禁错误

### Requirement: 模板状态机
系统 SHALL 提供模板状态机：builtin/manual → active → deprecated → disabled；learnt 模板必经 门禁通过 → draft →（人工确认或数据确认）→ active。仅 active 模板参与同类检索与生成引用；deprecated/disabled 即使高分也不得被引用。

#### Scenario: learnt 状态流转与检索边界
- **WHEN** 一个 learnt 模板经 save 入库且过门禁
- **THEN** 状态为 draft，不参与检索；activate 后状态 active，可被 findSimilarTemplates 命中；置 deprecated 后即使高分也不可命中

### Requirement: 滑窗退化回滚与冷却
系统 SHALL 以滑窗指标监控 active 模板：acceptRate 连续 N 期低于阈值或 avgScore 下滑超过阈值时，自动将模板置为 deprecated 并回退上一版本或内置池；回滚后进入冷却期防抖，冷却期内不重复回滚同一模板。回滚判定全部指标化可测。

#### Scenario: 连续下滑触发回滚且冷却
- **WHEN** active 模板 acceptRate 连续 N 期低于阈值
- **THEN** 模板自动置 deprecated 并回退上一版本；冷却期内再次触发不重复回滚

### Requirement: 成本配额
系统 SHALL 按 engine 提供每日成本配额（config evolution.budget 按引擎 dailyBudget）；配额超限时停止自动评分与入库评估；视频引擎默认零自动评分。配额超限不得阻断生成主流程（评估降级跳过，生成继续返回正常结果）。

#### Scenario: 配额超限降级不阻断
- **WHEN** 图片引擎当日配额超限或视频引擎默认零评分
- **THEN** 自动评分/入库评估跳过，生成主流程继续返回正常结果

### Requirement: prompt-library IPC 契约
桌面端 SHALL 提供 `prompt-library:list`（真实只读列表，支持按状态过滤）、`prompt-library:get`（单模板详情）、`prompt-library:save`（learnt 模板入库，过门禁进 draft）、`prompt-library:activate`（draft→active 确认）四个 IPC 通道，沿用 `code+data+message` 返回约定与 `core/error-codes.js` EC 常量；入参必须为纯 JSON；save 入参必须携带 eventId（写入 provenance.learnedFrom）；校验失败返回对应 EC 错误码。

#### Scenario: save 合法入参进入 draft
- **WHEN** 调用 prompt-library:save 且入参合法（engine/type/content/eventId 齐备且过门禁）
- **THEN** 返回 {code:0, data:{id, version, state:'draft'}}，模板已写入记忆库

#### Scenario: save 缺 eventId 拒绝
- **WHEN** 调用 prompt-library:save 未携带 eventId
- **THEN** 返回校验错误码，不写入记忆库

#### Scenario: activate 不存在模板拒绝
- **WHEN** 调用 prompt-library:activate 指向不存在的模板 id
- **THEN** 返回错误码，状态不变
