# plan.md

1. [x] 分析：CreateView 语音区、TTS 克隆服务/IPC/preload/api、多模态能力模型、测试与 PRD 落点
2. [x] 建独立 worktree + 新分支 codex/story2video-multimodal-tts-voice-clone
3. [x] 实现后端：tts-voice-clone-service renameClone + _normalizeRenameRequest + multimodal 样本限制
4. [x] 实现 IPC/preload/api：tts-voice-clone:rename + renameTtsVoiceClone + 重建 index.bundle.js
5. [x] 实现前端：CreateView 多模态默认选择、克隆自动保存(音色XXX)、重命名 UI、移除添加框
6. [x] 测试：新增 rename/auto-save/default 用例并跑通（48+147+81+102=378 例）
7. [x] vite build 通过 + QM-1 electron-builder --dir 通过 + ASAR 含 rename 通道
8. [x] 文档：PRD.md §7.1.4、PRD-video-creation.md、CHANGELOG.md
9. [ ] 审查（双模型/本地）+ 质量节拍自检
10. [ ] 提交、推送、PR、核对远程合并；更新记忆；归档 task
