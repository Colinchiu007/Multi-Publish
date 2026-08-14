# image-prompt-engine Specification Delta

## ADDED Requirements

### Requirement: 正向约束与事实保真 meta 透传

图片优化结果 SHALL 在 `extractOptimizedPrompt` 成功路径透传可选结构化 meta：`positive_constraints`（字符串数组，本图"必须如此"硬约束，数组透传 / 字符串按换行分号拆分 / 上限 10 / 非字符串元素丢弃）；字段缺失时 meta 不含该键，不拒绝整条结果（8013 旧后端零回归）。图片请求 context SHALL 接受白名单键（synopsis/character/setting/character_list），未知键忽略并记录 warning，敏感凭据键（api_key/token/secret/password 等任意层级）命中即拒绝。

#### Scenario: 正向约束透传
- **WHEN** prompt-engine 响应含 positive_constraints（数组或字符串）
- **THEN** extractOptimizedPrompt 收敛后透传至 meta.positive_constraints，字符串按 [\n;]+ 拆分，数组非字符串元素丢弃，上限 10 条

#### Scenario: 缺省零拒绝
- **WHEN** 8013 旧响应无 positive_constraints
- **THEN** meta 不含该键，结果正常通过，与现状行为完全一致

#### Scenario: context 白名单与敏感键
- **WHEN** context 含 character/setting/character_list（白名单内）或 api_key（白名单外敏感键）
- **THEN** 白名单键随请求透传；敏感键命中即拒绝并给出可解释错误，不发送外部服务

### Requirement: 负面提示词 plausible-only

图片优化请求的 negative_prompt SHALL 只保留"真实会发生的失败类别"（身份漂移/服装漂移/重复主体/解剖错误/多余肢体/多余手指/意外文字/水印/风格漂移），SHALL 清理无类别后缀的裸绝对否定词（如"不要坏"）；内置 no-text 负面提示词保持默认合并行为，用户负面词经 plausible-only 过滤后与内置合并。

#### Scenario: 用户负面词收敛
- **WHEN** 用户传入含无效否定词（如"不要坏""never bad"）的 negative_prompt
- **THEN** 请求中的 negative_prompt 过滤为可渲染的失败类别约束，保留有效类别词

#### Scenario: 内置负面保持
- **WHEN** 无用户负面词
- **THEN** 内置 no-text 负面提示词照常合并进请求（行为与现状一致）

### Requirement: 精修层长度层级

图片优化 SHALL 支持创意分层长度语义：creative_level ≥ 7 且未显式传 max_length 时，使用精修层默认（对齐 8013 能力上限 2000）；显式传值仍在 8013 能力范围 [50, 2000] 内收敛；共享内核 `resolveTieredMaxLength` 为图片/视频共用的层级解析函数，能力范围由各领域契约传入。

#### Scenario: 高创意默认精修
- **WHEN** creative_level=8 且未显式传 max_length
- **THEN** 请求 max_length 使用精修层默认并收敛到 8013 能力上限（≤2000）

#### Scenario: 显式传值收敛
- **WHEN** 显式传 max_length=3000（越界）
- **THEN** 收敛到 8013 能力上限 2000，不拒绝请求

### Requirement: 多候选规则评估择优

图片多候选选择 SHALL 支持规则评分择优（kernel `scorePrompt`：长度/六要素/保真/构图四维），替代"最长即最优"；评分含长度分量，tie-break 保留原最长逻辑；未接入择优的既有路径行为不变（零回归）。

#### Scenario: 多候选择优
- **WHEN** 多候选路径（disturb/numCandidates>1）启用择优
- **THEN** 选择规则评分最高候选，同分时选较长者

#### Scenario: 择优关闭零回归
- **WHEN** 调用方不启用择优
- **THEN** 行为与现状一致（候选原样返回，无评分开销）

### Requirement: 技术底座基线注入

图片优化请求 SHALL 支持内置技术底座基线片段（IMAGE_QUALITY_BASELINE：写实摄影/自然光/色彩比例/皮肤细节/物理/禁文字段，源自 Higgsfield 语料实证），默认注入（≤200 字符，受 maxLength 截断保护），可显式关闭（options.quality_baseline=false）实现零回归。

#### Scenario: 默认注入
- **WHEN** 调用方未显式关闭 quality_baseline
- **THEN** 请求附加技术底座基线片段（写实/摄影/灯光/色彩/物理/禁文字）

#### Scenario: 显式关闭
- **WHEN** options.quality_baseline=false
- **THEN** 请求不附加基线片段，与现状行为一致
