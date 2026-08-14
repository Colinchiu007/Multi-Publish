# image-prompt-engine Specification

## Purpose
TBD - created by archiving change image-prompts-via-prompt-engine. Update Purpose after archive.
## Requirements
### Requirement: 图片提示词统一经 prompt-engine 优化
所有图片提示词优化路径（Story2Video optimize 阶段、通用 OPTIMIZE/OPTIMIZE_BATCH 阶段）SHALL 统一调用 prompt-engine 服务（POST /v1/optimize 或 /v1/optimize/batch），执行风格检测、改写与输出校验；不得绕过 prompt-engine 直接调用默认 LLM 作为图片提示词优化路径。

#### Scenario: Story2Video optimize 走 prompt-engine
- **WHEN** Story2Video 流水线执行 optimize 阶段且场景数组非空
- **THEN** 每个场景的提示词经 PromptBridge（8013）提交给 prompt-engine 优化，结果写回 context.optimize 供 generate_assets 消费
- **THEN** 相关测试断言请求命中 prompt-engine 契约而非默认 LLM（story2video-stages.test.js）

#### Scenario: 通用 OPTIMIZE_BATCH 走 prompt-engine
- **WHEN** 通用 StageExecutor 执行 OPTIMIZE_BATCH 阶段
- **THEN** 批量请求经 PromptBridge.optimizeBatch 提交，结果数量与输入一致且逐项通过校验

### Requirement: 风格检测
style 未显式指定时，图片提示词优化请求 SHALL 设置 `auto_detect_style: true`，由 prompt-engine 检测风格；请求 style 采用 prompt-engine StyleType 枚举（realistic/cartoon/anime/oil_painting/watercolor/pixel/cyberpunk/fantasy/photography/3d_render/minimalist/abstract/portrait/landscape），平台采用 PlatformType 枚举（midjourney/stable_diffusion/dalle/tongyi/yizhang/jimeng/generic）。

#### Scenario: 未指定风格时自动检测
- **WHEN** 配置未指定 style（或 autoDetectStyle=true 且 style 为空）
- **THEN** 请求携带 auto_detect_style=true，style 不传，响应中的 detected_categories 作为风格检测结果保留

#### Scenario: 风格别名归一
- **WHEN** 输入使用非规范别名（cinematic、3d-render、dall-e、stable-diffusion）
- **THEN** 归一为契约枚举（photography、3d_render、dalle、stable_diffusion）后再提交，非法值回退默认（realistic/generic）

### Requirement: 输出校验 fail closed
prompt-engine 返回的优化结果 SHALL 经过输出校验：optimized_prompt 为非空字符串且长度不超过 max_length；error 非空视为失败；批量结果数量必须与输入一致；任一项无效立即失败，不进入 generate_assets，不静默降级。

#### Scenario: 空/超长结果失败
- **WHEN** 某场景 optimized_prompt 为空字符串或超过 max_length
- **THEN** optimize 阶段失败并输出含场景序号的可解释错误

#### Scenario: 服务错误失败
- **WHEN** prompt-engine 返回 error 非空（配额/服务不可用/非法响应）或网络错误
- **THEN** 阶段失败，错误信息保留服务原因；不静默回退到默认 LLM

#### Scenario: 批量数量不匹配失败
- **WHEN** optimize/batch 返回结果数量与输入场景数不一致
- **THEN** 阶段失败并报告 expected/got 数量

### Requirement: 配置契约边界
Story2Video optimize 配置 SHALL 对齐 prompt-engine 参数边界并做输入校验：platform 7 枚举、style 14 枚举、creativeLevel 1-10（默认 5）、maxLength 50-2000（默认 300）、numCandidates 1-5（默认 1）、negativePrompt ≤500、autoDetectStyle boolean（默认 true）、context 对象或字符串；越界输入拒绝或按边界收敛，旧字段（style/creativeLevel/negativePrompt）保持兼容。

#### Scenario: 配置范围校验
- **WHEN** 用户传入越界 creativeLevel/maxLength/numCandidates 或非法 platform/style
- **THEN** 配置归一化拒绝越界值（或收敛到边界）并给出可解释错误，stageOptions.optimize 输出对齐契约

#### Scenario: 旧字段兼容
- **WHEN** 仅提供旧字段 style/creativeLevel/negativePrompt
- **THEN** 归一化结果仍生成合法 prompt-engine 请求（autoDetectStyle=true、numCandidates=1、maxLength 默认）

### Requirement: 服务不可用明确失败
prompt-engine（8013）未运行时，optimize 阶段 SHALL 返回明确错误（如「prompt-engine 未运行，无法优化图片提示词」），不得静默回退到默认 LLM，也不得把原 prompt 当作优化结果继续流水线。

#### Scenario: 8013 未运行
- **WHEN** PromptBridge 健康检查失败或 /v1/optimize 连接失败
- **THEN** optimize 阶段失败并给出可操作错误（检查 prompt-engine 是否启动/配置 PROMPT_DIR）

### Requirement: 语义保留
改为 prompt-engine 后 SHALL 保留既有执行语义：有界并发（默认 3）、瞬态错误有界重试（限流更长退避）、断点续传（optimize_resume）、进度上报（optimize_progress）。

#### Scenario: 断点续传与进度
- **WHEN** optimize 阶段在部分场景完成后失败并重启
- **THEN** 已完成场景结果复用，进度显示已完成/总数；全量成功时清除 resume 状态

### Requirement: 场景-测试映射
本能力每个 WHEN/THEN 场景 SHALL 在实现中映射到对应测试（单元/集成），标注于 change tasks.md；不依赖真实 8013 服务，使用 mock PromptBridge 或本地 HTTP stub 覆盖契约。

#### Scenario: 契约测试不依赖真实服务
- **WHEN** 运行 optimize 相关测试
- **THEN** 通过 mock/本地 stub 验证请求体（platform/style/auto_detect_style/num_candidates 等）与响应校验（空/超长/error/数量不匹配），真实 8013 与 LLM key 只作为外部验收边界

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

