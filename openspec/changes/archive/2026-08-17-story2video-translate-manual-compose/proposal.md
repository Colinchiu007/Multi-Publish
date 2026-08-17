# Proposal: 手动选材模式翻译与视频合成并行

## Why

自动模式已经把可选的提示词翻译延后到视频合成阶段。手动选材模式目前仍在 `optimize` 阶段同步等待翻译，导致候选素材生成、用户选择 checkpoint 都被非关键的显示增强阻塞。候选素材选择只依赖场景 `index`、候选 `candidateId` 和媒体路径，不依赖 `promptTranslation`，因此手动模式也可以安全采用相同的延迟策略。

## What Changes

- 手动模式在 `optimize` 阶段只写 JSON-safe `prompt_translations_pending`，不调用翻译 LLM。
- 候选素材生成、候选面板和 `scene_asset_selection` checkpoint 不等待翻译；缺少翻译时保持 `promptTranslation: null`，不改变候选和选择数据。
- 用户确认素材后，`compose` 阶段通过已有并行任务与视频合成同时执行翻译。
- 翻译结果按稳定场景 `index` 更新最终场景和 compose segments，不重建或覆盖 `candidates`、`selection`、`candidateId`、媒体路径。
- 英文 locale、空 locale、翻译失败和超时继续保持跳过或 fail-open 语义。

## Out of Scope

- 不修改候选素材生成数量、候选选择规则、TTS 生成或视频合成输入。
- 不把翻译结果用于模型输入、素材排序或用户选择决策。
- 不接入其他非 Story2Video 流水线。

## Success Criteria

- 手动非英语模式的 `optimize` 不调用翻译 LLM。
- 候选 checkpoint 在翻译未完成时可正常展示和确认。
- 合成和翻译真实重叠，翻译按 `index` 回填，候选/选择/媒体字段完整保留。
- 翻译失败或超时不阻塞成功成片。
