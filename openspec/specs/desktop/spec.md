# desktop Specification

## Purpose
TBD - created by archiving change merge-publish-types. Update Purpose after archive.
## Requirements
### Requirement: 发布类型入口合并

新建发布类型选择弹窗 SHALL 提供且仅提供 2 个类型入口：视频发布（video）与图文文章发布（article）。图文发布（image）、文章发布（article）、公众号（wechat）三个历史入口 SHALL 合并为统一的"图文文章发布"入口。

#### Scenario: 类型选择弹窗展示 2 个入口

- **WHEN** 用户从发布历史页点击"新建发布"
- **THEN** 类型选择弹窗显示 2 张卡片：视频发布、图文文章发布
- **AND** 图文文章发布卡片展示合并后支持平台集合（原图文与文章入口平台列表的并集）

#### Scenario: 合并入口的平台集合

- **WHEN** 渲染图文文章发布卡片的平台图标列表
- **THEN** 平台集合包含原 image 与 article 入口 id 列表的并集（去重）

#### Scenario: 旧类型链接向后兼容

- **WHEN** 用户通过旧链接进入编辑页（`/publish?type=image` 或 `/publish?type=wechat`）
- **THEN** 页面正常渲染图文文章编辑器（activeMode=article）
- **AND** 标题栏类型标签显示"图文文章发布"，不显示空值或原始 query 值

#### Scenario: 视频入口行为不变

- **WHEN** 用户选择视频发布入口
- **THEN** 进入视频编辑器（activeMode=video），行为与合并前完全一致

### Requirement: 模式卡片数据模型与提取

新表 viral_pattern_cards SHALL 与 viral_library 一对一存储结构化模式（hook_type/emotion_curve/narrative_structure/cta_style 枚举、golden_quotes 最多3句、title_formula 占位符公式、schema_version），入库即建 pending 行，存量迁移回填；PatternExtractionService SHALL 以有界并发队列后台提取（attempts 上限 3，失败降级浅层特征），触发时机为启动后延迟 + 入库后 + 每小时巡检。

#### Scenario: 入库自动建卡

- **WHEN** 手动或采集方式添加爆款条目
- **THEN** 自动创建 status=pending 的模式卡片行

#### Scenario: 提取失败降级

- **WHEN** LLM 提取连续失败 3 次
- **THEN** 卡片 status=failed，改写注入回退浅层特征，不阻塞入库与改写

### Requirement: 采集页改写切换 Node 引擎

Collection.vue 的全部改写调用 SHALL 从 aggregation:rewrite（Python）切换为 ai:rewrite（Node 引擎），style/length 做枚举映射；改写面板新增「结合爆款库/结合个人经历」复选框，爆款库默认勾选；HotTopics 创作模式 SHALL 默认开启结合爆款库。

#### Scenario: 采集后改写享受知识注入

- **WHEN** 用户采集内容后点击改写且「结合爆款库」勾选
- **THEN** 改写走 Node 引擎，爆款库检索结果注入 prompt

### Requirement: 改写历史持久化与发布关联

新表 rewrite_history SHALL 持久化每次 ai:rewrite 成功结果（原文摘要/改写内容/knowledge_refs/matched_keywords）；响应新增 rewriteHistoryId；发布入口 SHALL 显式携带 rewriteHistoryId，publish_history 加列存储；写失败仅记日志不阻塞改写。

#### Scenario: 发布关联改写

- **WHEN** 发布携带 rewriteHistoryId 的任务成功
- **THEN** publish_history 记录与 rewrite_history 行关联

### Requirement: 表现数据回采与归因

发布成功 SHALL 登记 tracked_content（有 postId 或内容 URL → pending，否则 untrackable）；PerformanceRecrawlService SHALL 按启动+每日节奏对 7 天内内容按 +1h/+6h/+24h/+72h/+7d 采样回采，指标写入 performance_snapshot（auto/manual 同表）；平台指标解析器 SHALL 为注册表架构（第一批 zhihu/baijiahao/kuaishou/bilibili，未支持平台 unsupported）；pattern_performance SHALL 由快照⋈关联链纯重算四维模式效果。

#### Scenario: 自动回采采样

- **WHEN** 发布后 1 小时应用运行中
- **THEN** 回采服务对该内容执行第一次指标采集并写入快照

#### Scenario: 未支持平台兜底

- **WHEN** 内容发布至未支持自动回采的平台
- **THEN** 状态为 unsupported，UI 提供手动录入入口

### Requirement: 采集时互动指标提取

url-collector 页面解析 SHALL 接入平台指标解析器注册表，采集爆款内容页时提取互动指标并映射至 viral_library 的 likes/collections/comments；未支持平台沿用手动填写。

#### Scenario: 采集修复互动数据

- **WHEN** 采集第一批支持平台的爆款内容并加入爆款库
- **THEN** 该条目的互动数非零（页面可解析时）

### Requirement: 效果洞察与表现 UI

发布历史页 SHALL 展示表现快照最新值并支持刷新与手动录入；效果洞察页（/performance-insights）SHALL 按四维模式 × 平台展示效果排行，sample_count < 3 标注样本不足，支持手动重算归因。

#### Scenario: 模式效果排行

- **WHEN** 用户打开效果洞察页
- **THEN** 展示钩子/情绪/叙事/CTA 四维效果排行，样本不足的维度标注提示

