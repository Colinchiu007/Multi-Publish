# Delta Spec: rewrite-ai-taste-customization

## ADDED Requirements

### Requirement: 词库 CRUD 与禁用语义

ops-center SHALL 提供去 AI 味词库条目的 CRUD（word 主键 ≤30 码点、replacement ≤50 码点、severity ∈ {S1,S2,S3}、enabled 0/1、description ≤200），条目 SHALL 携带 enabled 字段且 enabled=0 表示引擎跳过该词的替换（含禁用内置词替换的语义）；word 与 replacement SHALL 拒绝换行与控制字符，word SHALL 拒绝纯标点与单字符正则元字符；软删与重复创建返回 409 的语义 SHALL 与 rewrite-hard-constraints 先例一致。

#### Scenario: 禁用内置词替换

- **WHEN** 管理员把内置词「综上所述」的条目 enabled 置 0
- **THEN** runtime 下发中该词 enabled=0，桌面端 getDisabled 含该词，引擎改写不再把「综上所述」替换为「说到底」

#### Scenario: 非法条目被拒绝

- **WHEN** 创建 word 含换行、或 word 为「.」、或 severity 为「S4」、或 replacement 空白的条目
- **THEN** 返回 400 与中文错误，词库不变

### Requirement: 批量导入原子性

ops-center SHALL 提供 POST /import 批量导入（单批 ≤500 条），整批 SHALL 原子生效——任一条目校验失败则整批拒绝（400 + 首个错误），成功则全部落库。

#### Scenario: 导入批次部分非法

- **WHEN** 导入 100 条合法 + 1 条 word 超长
- **THEN** 整批拒绝，词库不产生任何变更，错误指明超长条目

### Requirement: runtime/bootstrap 下发词库

runtime/bootstrap payload SHALL 新增 `rewrite_ai_taste_map` 字段（全量未删条目，含 enabled=0，字段 word/replacement/severity/enabled），随整包 Ed25519 签名；种子 SHALL 在启动时以引擎内置 128 条词表幂等播种（按 word 跳过已存在）。

#### Scenario: 桌面端离线回退

- **WHEN** 桌面端未收到/清空 rewrite_ai_taste_map（首次安装、未配置运营中心）
- **THEN** 引擎使用内置 AI_PHRASE_MAP 行为逐字节不变

### Requirement: 引擎词表注入（叠加 + 键覆盖 + 禁用）

引擎 AITasteRemover SHALL 接受构造注入（phraseMap 覆盖层 / disabledWords 禁用表 / severityMap），缺省时 SHALL 回退内置常量且行为逐字节不变；生效语义为**叠加 + 键覆盖**——运营中心同键覆盖内置替换，disabledWords 中的词（含内置词）被跳过；词表遍历 SHALL 键序确定性排序。

#### Scenario: 覆盖内置替换方向

- **WHEN** 运营中心把「综上所述」的 replacement 改为「归根结底」并下发
- **THEN** 引擎改写命中「综上所述」时替换为「归根结底」而非内置「说到底」

#### Scenario: 缺省注入零变化

- **WHEN** 未调用 setAiTasteCustomization 或传空对象
- **THEN** detect/process 输出与注入前逐字节相同（现有测试零改动通过）

### Requirement: 策略级强度参数

策略 `postProcess.aiTasteIntensity`（1-3 整数）SHALL 控制去 AI 味强度：1=仅词级替换（跳过 Pass 3 句长节奏与口语化）、2=现状、3=现状+casual 口语化；非法值 SHALL 回落 2；ops-center 策略校验 SHALL 拒绝非 1-3 整数的 aiTasteIntensity。

#### Scenario: 强度 1 跳过句长修复

- **WHEN** 策略 postProcess 为 {"removeAITaste":true,"aiTasteIntensity":1} 且 LLM 输出含 3+ 连近似等长句
- **THEN** 改写结果保留句间「。」不合并（Pass 3 跳过），词级替换照常发生

### Requirement: 管理页与菜单

ops-center 前端 SHALL 提供去 AI 味词库管理页（全量表格 + word/替换词搜索 + severity/状态筛选 + 行内启停 + 新增/编辑对话框 + JSON 导入导出），路由 `/rewrite-ai-taste` SHALL 为 adminOnly 并同步进 menu-visibility 测试清单；word 在编辑态 SHALL 只读（主键不可改）。

#### Scenario: 导入导出往返

- **WHEN** 管理员导出当前词库为 JSON 后清空思路重导（内容不变）
- **THEN** 导入成功且词库条目与导出前一致（word 为幂等键，更新替换方向）
