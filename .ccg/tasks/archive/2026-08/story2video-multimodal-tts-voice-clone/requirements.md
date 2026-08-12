# requirements.md — Story2Video 多模态默认 TTS + 音色克隆自动保存

## 需求（用户原话摘要）
1. 模型设置保存了「多模态模型 Key」且该多模态模型支持 TTS 语音时，图片轮播流水线「语音生成器」应默认选择该多模态模型（当前仅 MiniMax `minimax-multimodal` 满足）。
2. 音色克隆：选择本地文件后自动保存为克隆音色，默认名「音色001（音色XXX）」，用户可自行改名；底部「添加克隆音色」操作框移除。
3. 新分支、不冲突；更新记忆；推送 GitHub 并合并分支；PRD 与相关文档详细补充（数据校验/流程/功能逻辑/交互/显示项/提示文字）；应用质量节拍。

## 范围
- apps/desktop/src/views/CreateView.vue（语音区默认选择、克隆自动保存、重命名、移除添加框）
- apps/desktop/src/api/tts-voice-clone.js、electron/preload/tts-voice-clone.js + index.bundle.js、electron/ipc-handlers/tts-voice-clone.js、electron/services/tts-voice-clone-service.js（新增 rename 通道；multimodal 样本限制对齐）
- 测试：clone service/ipc/preload/api、CreateView.test.js
- 文档：01-docs/PRD.md §7.1.4、01-docs/PRD-video-creation.md、CHANGELOG.md

## 数据校验
- 克隆名：trim 后 1..128 字符、无控制字符；空名/非法 → VOICE_CLONE_INVALID_ARGUMENTS（IPC normalizeRenameArgs / service safeDisplayName 双保险）。
- voiceId：safeIdentifier（[A-Za-z0-9._-]，≤256）；不存在 → VOICE_CLONE_NOT_FOUND。
- 多模态 provider：category=multimodal 且 capabilities 含 tts 才放行（VOICE_CLONE_MODEL_MISMATCH）。
- minimax-multimodal 样本限制与 minimax-tts 一致（1 文件、mp3/m4a/wav、10s–5min、≤20MB）。

## 流程/交互
- 语音生成器默认：configuredProvider(用户显式保存) > multimodal TTS provider > 列表首项 > Edge('')。
- 选文件 → choose-samples 返回 selectionId → 自动 add（默认名音色XXX，consent:true）→ 加入列表并设为当前音色。
- 克隆列表行内「重命名」：Enter/保存确认、取消放弃；rename 仅更新本地 registry 展示名，不调远端。
