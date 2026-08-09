## ADDED Requirements

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
