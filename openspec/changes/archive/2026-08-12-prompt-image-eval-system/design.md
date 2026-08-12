# Design — prompt-image-eval-system

> 配套 PRD：`01-docs/PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md`；架构：`01-docs/ARCH-PROMPT-EVAL-SYSTEM-2026-08-11.md`

## 方案选型

| 方案 | 结论 | 理由 |
|------|------|------|
| 在 python-backend 实现评估服务 | 否决 | 评估逻辑与桌面端持久化/UI 耦合低，且视觉模型调用已在桌面 ModelProviderManager 有完整适配；独立 Node 模块最轻 |
| 侵入 Story2Video 流水线自动评估 | 否决（v1） | 生成流程已有较多在途改动（scene-context 等），自动挂钩引入不确定性与额度成本；v1 独立入口，v2 再议 |
| 独立 Node 模块 + 注入评估器 | 采纳 | 核心引擎不依赖具体服务商，mock 可测，生产注入视觉模型，fail closed 天然成立 |
| 评估器直连 provider API | 否决 | 必须复用 ModelProviderManager（凭据加密/能力解析/限额），通过 callAdapter('chatCompletion') 传递 OpenAI 兼容 content 数组 |

## 关键设计决策

1. **维度权重归一化**：跨图维度仅≥2 图参与；单图权重 0.375/0.375/0.25（在 dimensions.js 用 `resolveDimensionWeights(imageCount)` 单一实现，测试覆盖边界）。
2. **评估提示词单源**：评估提示词全文只写在 `prompt-builder.js`（模板字符串），PRD 文档同步维护；输入快照 JSON 序列化，超长裁剪并标记。
3. **LLM 输出契约校验独立**：`evaluator.js` 只负责取回原始文本；`llm.js` 负责解析+白名单校验（fail closed），职责分离可测。
4. **持久化原子写**：tmp+rename，Windows 瞬时锁错误有界重试（≤3 次）；索引自愈（扫描 records/ 重建）。
5. **IPC 路径边界**：`prompt-eval:run` 对 imagePath 做 realpath + 存在性 + 非目录校验；上下文敏感键复用 `assertNoSensitiveContext` 语义。
6. **视频扩展**：mediaType 贯穿；`video` 显式拒绝（EVAL_MEDIA_TYPE_NOT_SUPPORTED）；维度注册表预留 temporal_consistency/motion_accuracy/audio_visual_sync/video_aesthetic_quality 文档级占位。
