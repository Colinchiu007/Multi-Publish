## ADDED Requirements

### Requirement: 规则数据化与加载语义
场景上下文规则 SHALL 以 JSON 数据文件承载（内置 `story-context-rules.json`），引擎加载优先级为「外部配置覆盖（环境变量 `STORY2VIDEO_CONTEXT_RULES_PATH` 或 `<userData>/config/story-context-rules.json`）→ 内置 JSON → 代码默认」；加载后必须 schema 校验，非法规则 SHALL 回退内置并告警，不得静默使用坏规则，也不得使流水线失败。

#### Scenario: 外部覆盖生效
- **WHEN** 环境变量或 userData 配置目录存在合法规则 JSON（如新增文化关键词）
- **THEN** 引擎使用外部规则（在合法字段上覆盖内置），上下文提取结果反映外部关键词

#### Scenario: 非法规则回退
- **WHEN** 外部规则 JSON 缺必需键/结构非法
- **THEN** 引擎回退内置规则并输出警告，流水线继续运行且行为与内置一致

### Requirement: 打磨修复
场景上下文增强 SHALL 修复体验验收发现的打磨点：历史题材词表覆盖北宋/南宋/汴京/临安等关键词；场景内特有角色（未出现在全文）也能被识别并写入 character；上下文块措辞不得出现「现代中/欧洲中」式生硬拼接。

#### Scenario: 北宋题材识别
- **WHEN** 全文含「北宋汴京的市集」「岳飞在军营」
- **THEN** 全局 genre=历史、dynasty=宋朝，场景上下文块携带宋代背景

#### Scenario: 场景内角色
- **WHEN** 场景文本含「一位将军在擦拭兵器」而全文未出现「将军」
- **THEN** 该场景 character 识别为 将军（descriptor 回退角色名）

#### Scenario: 措辞自然
- **WHEN** 仅命中文化/时代而无具体场景设定（如「欧洲」「现代」）
- **THEN** 上下文块拼接为「欧洲，公主…」式自然读法，不含「欧洲中/现代中」

### Requirement: 运营后台规则管理
ops-center SHALL 提供「场景上下文规则」管理功能（admin）：查看当前规则、校验规则 JSON、保存规则（持久化到数据库，记录版本与更新人）、导出规则 JSON；写操作必须 require_admin，读操作需登录。

#### Scenario: 查看/保存/导出
- **WHEN** 管理员访问场景上下文规则页并保存合法规则
- **THEN** 规则持久化（version 递增、updated_by 记录），可再次读取并导出 JSON

#### Scenario: 非法规则拒绝
- **WHEN** 提交结构非法或缺少必需键的规则 JSON
- **THEN** 校验接口返回逐项错误（path+message），保存被拒绝（400/422），不写入数据库

### Requirement: 测试映射
本能力每个 WHEN/THEN 场景 SHALL 映射到自动化测试：引擎单测（加载/覆盖/回退/打磨回归）与 ops-center pytest（API 鉴权/校验/持久化/导出），前端 build 通过。

#### Scenario: 场景有测试引用
- **WHEN** 实现完成
- **THEN** tasks.md 标注测试文件/用例，归档前可追踪
