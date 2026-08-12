# prompt-image-eval-system Specification

## Purpose
为「提示词优化引擎」的输出效果建立量化评估闭环：对生成图片（v1）进行多维度打分、问题归因与提示词优化点分析，并通过持久化与聚合分析支撑 prompt-engine 的持续迭代；媒体类型抽象预留视频评估扩展。
## Requirements
### Requirement: 图片评估维度与评分规则
PromptEval v1 SHALL 支持图片评估，使用四个维度（关联度 relevance、内容准确性 content_accuracy、视觉审美质量 aesthetic_quality、跨图上下文一致性 cross_image_consistency），权重 0.30/0.30/0.20/0.20；跨图一致性仅当同一请求图片数 ≥2 时参与，单图时权重归一化为 0.375/0.375/0.25；所有分数 SHALL 为 0-100 整数，总体分为参与维度加权和；等级映射 ≥85 优秀 / ≥70 良好 / ≥50 一般 / <50 差。

#### Scenario: 单图评估
- **WHEN** 请求 items 长度为 1
- **THEN** 评估维度为 3 个（不含跨图一致性），权重 0.375/0.375/0.25，报告 grade 按总体分映射

#### Scenario: 多图评估启用跨图一致性
- **WHEN** 请求 items 长度 ≥2
- **THEN** 评估提示词包含跨图一致性评分标准，LLM 输出必须包含该维度且分数合法，报告含跨图一致性维度

### Requirement: 输入校验 fail closed
评估请求 SHALL 通过完整输入校验：mediaType 仅支持 image（video 返回 EVAL_MEDIA_TYPE_NOT_SUPPORTED）、items 非空、imagePath 存在且为可读文件且单图 ≤8MB 且扩展名在白名单且文件头魔数匹配（EVAL_IMAGE_INVALID）、optimizedPrompt 非空且 ≤5000、sourceText ≤20000 且 context 序列化 ≤20000 且 negativePrompt ≤5000、sourceText/context 至少一个非空、context 为对象或字符串且递归过滤敏感键（任意嵌套命中即拒绝）、图片总数 ≤20、language ∈ {zh,en}；任一失败立即返回对应 EVAL_* 错误，不执行评估。

#### Scenario: 图片缺失
- **WHEN** imagePath 指向不存在或不可读文件
- **THEN** 返回 EVAL_IMAGE_NOT_FOUND / EVAL_IMAGE_UNREADABLE，评估不执行

#### Scenario: 视频暂不支持
- **WHEN** mediaType=video
- **THEN** 返回 EVAL_MEDIA_TYPE_NOT_SUPPORTED 且提示「视频评估暂未实现」

### Requirement: 评估器输出契约校验
评估 LLM 原始输出 SHALL 解析为 JSON 并通过契约校验：overall 为 0-100 数字；dimensions 数量与参与维度一致、id 唯一且在白名单、score 0-100、evidence 非空、issues/suggestions 字符串数组；problems 与 promptOptimizationPoints SHALL 必须存在且为数组（缺失或非数组即整次失败）；problems 项 severity/category/promptPart 均在白名单；promptOptimizationPoints 项 type 在白名单且 suggestion 非空；任何违反 SHALL 使整次评估失败（EVAL_LLM_INVALID_RESPONSE），不得静默降级或截断使用部分结果。

#### Scenario: 非法 JSON 整次失败
- **WHEN** 评估器返回非 JSON 或 JSON 中维度缺失/分数越界/evidence 为空
- **THEN** 评估失败并返回 EVAL_LLM_INVALID_RESPONSE（details 说明违规项）

### Requirement: 评估提示词单源
图片评估提示词 SHALL 由 prompt-builder 单一构造：系统角色 + 任务 + 输入快照（原文/上下文/优化后提示词/负向提示/图片数）+ 分维度评分标准 + 严格 JSON 输出契约；单图/多图分支、context 对象化、超长裁剪（标记 truncated）；视频提示词构造函数 SHALL 抛出 EVAL_MEDIA_TYPE_NOT_SUPPORTED。

#### Scenario: 输入快照裁剪
- **WHEN** 输入文本超长
- **THEN** 提示词内快照裁剪到上限并在报告标记 truncated:true，评估仍可执行

### Requirement: 问题归因与优化点
评估报告 SHALL 包含 problems（严重度 critical/major/minor、问题类别白名单 11 类、归因 promptPart 5 类、修复建议）与 promptOptimizationPoints（类型白名单 7 类：add_specificity/resolve_ambiguity/enforce_style/align_context/add_negative/structure_ordering/consistency_anchor，target 与 suggestion）；两类均可为空数组但不得缺键。

#### Scenario: 归因指向优化后提示词
- **WHEN** 问题源于优化后提示词（如歧义、缺细节、风格弱化）
- **THEN** 对应 problem.promptPart=optimized_prompt 且 promptOptimizationPoints 给出可直接修改提示词的建议文案

### Requirement: 持久化与聚合
评估结果 SHALL 持久化到 userData/prompt-eval/{index.json, records/<id>.json, reports/<id>.md}，写入采用原子替换（Windows 瞬时锁错误有界重试 ≤3 次）；索引缺失或与 records/ 不一致 SHALL 自愈重建；聚合分析 SHALL 输出记录数、平均分、等级分布、维度均值、问题类别分布、归因分布、优化点汇总与推荐动作。

#### Scenario: 索引自愈
- **WHEN** index.json 缺失或落后于 records/ 目录
- **THEN** listRecords 扫描 records/ 重建索引并返回完整记录列表

### Requirement: 使用入口
PromptEval SHALL 提供 CLI 批处理（node cli.js --image/--batch/--evaluator/--out/--json）与桌面 IPC 通道（prompt-eval:run/list/get/delete/analyze/dimensions，均带 sender 校验）；未注入评估器或未配置视觉模型时返回 EVAL_LLM_UNAVAILABLE 可操作错误，不内置假评估器。

#### Scenario: CLI 单图评估
- **WHEN** 执行 CLI 且提供 --image/--source-text/--optimized-prompt 与可加载的 --evaluator 模块
- **THEN** 输出 JSON 报告（--json）或 Markdown 报告，退出码 0；输入非法退出码 2

#### Scenario: 未配置评估模型
- **WHEN** 桌面 IPC 调用 run 且无可用的视觉评估模型
- **THEN** 返回 EVAL_LLM_UNAVAILABLE，UI 显示「未配置支持视觉评估的模型服务商」引导文案

