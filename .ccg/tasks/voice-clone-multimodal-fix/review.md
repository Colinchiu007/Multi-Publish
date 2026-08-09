# Review — voice-clone-multimodal-fix

## 根因
用户选「MiniMax（多模态）」添加克隆音频报「所选语音模型与克隆配置不一致」。
上一轮（PR #455）只改了 tts-voice-service.js（音色目录）的 _hasMatchingProvider，
漏改 tts-voice-clone-service.js（克隆链路）同名字段：仍 `category !== "tts"` → multimodal 被拒 → VOICE_CLONE_MODEL_MISMATCH。

## 修复
tts-voice-clone-service._hasMatchingProvider 与 tts-voice-service 同合同：
category=multimodal 且 capabilities 含 tts 放行；模型匹配含 capability_models.tts；未声明 tts 仍 fail-closed。

## 自查（六项）
- 异常处理：try-catch fail-closed 保留。
- 权限边界：无。
- 事务一致性：无。
- 边界值：multimodal 声明/未声明 tts、models 空、capability_models.tts 匹配、非 tts 类别拒绝。
- 风格：与 tts-voice-service 同合同。
- 硬编码：无。

## 测试
tts-voice-clone-service + tts-voice-service + tts-voice-catalog：56 passed（新增 multimodal 克隆成功 + 未声明 tts 拒绝 2 用例）。
