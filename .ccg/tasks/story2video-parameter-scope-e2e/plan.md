# Story2Video 参数边界与真实 E2E 计划

## 已确认范围

- 只改 `story2video-compose` 的 UI、配置合同和运行状态反馈；其他 OpenMontage 流水线保持原样。
- 标准执行链固定为 `split -> domain_enrich -> optimize -> generate_assets -> compose -> publish`。
- 已配置的 provider 不读取、不输出 API Key；真实验证只使用隔离 Electron profile。

## 参数决策

| 决策 | 参数 | 原因 |
| --- | --- | --- |
| 移除 | 通用视觉风格、LLM 温度、预算 | 不进入 Story2Video 专属配置或六阶段执行器。 |
| 移除 | `generateBase`、`generateMerged` | 仅归一化/YAML 透传，compose 白名单无消费者。 |
| 移除 | 平台提示词下拉 | 当前所有值最终都映射为 `generic`，会误导用户。 |
| 移除 | 目标视频时长 | 当前六阶段合成路径不消费该值。 |
| 保留 | 分句、提示词优化、图片/语音 provider、配音、动效、转场、字幕、BGM、水印、输出、发布 | 各项都有 split、optimize、generate_assets、compose 或 publish 的具体消费者。 |
| 保留 | `checkpointPolicy` | 由 `PipelineEngine` 执行控制层消费。 |
| 保留 | 模板 | 模板宏实际下发转场、动效、分辨率、字幕等配置，不能当作孤立生成器参数。 |

## 测试先行场景

1. Story2Video 合同不再输出已移除的无效配置，但普通流水线仍保留通用配置。
2. 已配置图片 provider 会出现在 Story2Video 下拉项；没有 provider 时保留明确的离线选择。
3. `PipelineEngine.getRunSnapshot()` 在运行已归档后返回终态和错误详情。
4. CreateView 轮询遇到失败 code、空 data 或带 error 的终态时，均呈现可行动错误提示并停止轮询。
5. 已配置图片/语音 provider 的最小真实 Story2Video 运行能至少进入六阶段；若外部调用失败，界面显示真实错误且运行历史保留。

## 执行顺序

1. 阅读目标实现和既有聚焦测试，先添加上述测试并验证 RED。
2. 用最小改动收敛 Story2Video 专属 UI/归一化合同，动态提供已启用的图片模型。
3. 修复 PipelineEngine 历史快照与 CreateView 终态失败可见性。
4. 跑聚焦测试、Vue/preload 构建和隔离 Electron 真实流程；成功时用 ffprobe 验证输出，失败时记录可见错误证据。
5. 运行 required 质量门禁、双模型审查（失败则记录精确环境错误），归档 CCG task 并只暂存目标文件提交。

## 外部模型分析状态

- 2026-08-01 并行调用已尝试：antigravity 缺少 `agy`；Claude wrapper 返回 status 1。原始 stderr 保留于 `external-analysis/`，不将失败冒充为审查通过。
