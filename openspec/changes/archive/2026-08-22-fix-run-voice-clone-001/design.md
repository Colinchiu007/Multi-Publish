# 设计

## 调用路径

每个 TTS 阶段构造一个带 text 和 voiceId 参数的本地 generateTts 函数：

    generateTts(text, voiceId)
      ├─ 有 assetGenerator  -> assetGenerator.generateTTS(text, options)
      └─ 无 assetGenerator  -> serviceBus.callPythonSkill('generate_tts', payload)

初次生成和 tryReCloneVoice.retryFn 都调用同一个函数，避免两条路径再次分叉。瞬时错误重试仍由现有 withAssetTransientRetry 负责；重克隆失败仍由 tryReCloneVoice 返回 null，上层保留原始错误。

## 范围

- generate_assets 保持 assetGenerator 的 with_timestamps 选项和 legacy payload 现状。
- finalize_assets 保持现有参数与 partialTts 持久化行为。
- 不在 helper 中更新 voice registry；本次只修复本次合成调用使用新 voice id。

## 测试策略

- 在 story2video-stages.test.js 中通过真实注册的 stage executor 注入临时样本目录、clone service、adapter manager 和 serviceBus.callPythonSkill。
- 断言首次请求使用旧 voice id，重克隆后第二次请求使用新 voice id，并最终生成 scene。
- 对 finalize_assets 复用同一夹具，确保其 legacy 分支没有同类回归。
- 保留现有 helper 级 fail-closed 测试，防止修复重新引入默认音色兜底。
