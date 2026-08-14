## ADDED Requirements

### Requirement: 镜头纪律规则注入

视频优化结果 SHALL 遵守镜头纪律：明确画面角色数（EXACT N 角色声明，N 由输入 context 可推导时必填）；单个镜头至多一个主运镜且默认加 slow；跨镜头可识别角色 SHALL 不超过 3 个，其余背景角色按泛化描述；正向"必须如此"约束与负向"禁止"约束 SHALL 分块表达，不得混写。

#### Scenario: 角色数声明
- **WHEN** 输入 context 提供 character_list 且长度 ≤3
- **THEN** 优化结果以"EXACT N CHARACTERS"开头声明角色数，N 与 character_list 长度一致

#### Scenario: 单镜单运镜
- **WHEN** 优化一个镜头（duration_hint 对应单个连续镜头）
- **THEN** camera 字段为单一运镜，提示词正文不得堆叠多个运镜词，且默认附加 slow/克制修饰

#### Scenario: 三角色上限
- **WHEN** 输入 context 的 character_list 超过 3 个角色
- **THEN** 优化结果仅对前 3 个（或剧情必需）角色做可识别细节描述，其余角色以泛化描述（路人/背景）处理

### Requirement: 正向约束与最终画面结构化字段

视频优化结果 SHALL 在结构化 video 对象中提供 `positive_constraints`（字符串数组，本段"必须如此"硬约束）与 `final_frame`（字符串，镜头终态描述：主体位置/姿势/灯光状态/机位是否静止/禁文字声明）字段；两字段为可选，缺失时以默认值填充不拒绝整条结果，且兼容现有 7 字段（shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint）。

#### Scenario: 新字段随结果返回
- **WHEN** 优化结果含 positive_constraints 与 final_frame
- **THEN** 结构化 video 对象透传两字段，渲染单串 optimized_prompt 包含 STRICT 正向约束块与最终画面块

#### Scenario: 新字段缺失兼容
- **WHEN** 优化结果缺少 positive_constraints 或 final_frame（旧后端 8013 或解析失败）
- **THEN** 校验不拒绝整条结果，缺失字段不设键（undefined），由消费端按可选字段处理（与 design 一致）

#### Scenario: 渲染单串包含终态
- **WHEN** optimized_prompt 渲染完成
- **THEN** 单串末尾包含最终画面块（主体位置/姿势/灯光/机位静止声明/禁文字），不得以开放结尾收束镜头

### Requirement: 负面提示词 plausible-only

视频优化请求的 negative_prompt SHALL 只包含"真实会发生的失败类别"（身份/服装漂移、重复角色、解剖错误、参考背景渗入、位置与光线变化、意外文字/标志/字幕/水印、意外风格），SHALL 禁止堆砌模型不响应的绝对否定词；内置 no-text 负面提示词保持默认合并行为。

#### Scenario: 用户负面词收敛
- **WHEN** 用户传入含无效否定词（如"不要坏"）的 negative_prompt
- **THEN** 优化结果按 plausible 失败类别重写/过滤，仅保留可渲染的失败约束

#### Scenario: 内置负面保持
- **WHEN** 无用户负面词
- **THEN** 内置 no-text 负面提示词（clean frame/no text/no subtitles/no watermarks...）照常合并进请求
