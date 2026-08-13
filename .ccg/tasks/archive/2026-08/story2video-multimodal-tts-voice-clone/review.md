# review.md — 审查记录（2026-08-12）

## 审查方式
- 子代理（explorer 批量）后端 403 不可用 → 降级为主代理直接分析。
- CCG 双模型审查：Claude（codeagent-wrapper，约 8 分钟，产出完整报告）；antigravity 后端启动后无输出（降级记录，仅单模型报告可用）。

## Claude 审查结论
- Critical：无。
- Warning（已修复）：
  1. 重命名失效克隆丢失 `invalid` 标记 → 坏音色短暂可被选中。修复：rename 成功后保留旧条目 invalid；新增回归测试。
  2. 显式选择「自动 Edge TTS」（voiceProvider=''）在 loadS2VProviders 重入时被多模态默认覆盖。修复：新增 s2vVoiceProviderExplicitEdge 标记（下拉显式选择/快照恢复置位，重置选项清零），多模态默认仅在非显式 Edge 时生效；新增回归测试。
- Info（已处理）：
  - nextS2VVoiceCloneName 超长数字名精度：改用 BigInt 解析/比较。
  - 多模态默认未校验 capability_models.tts：find 增加 tts 默认模型存在性校验（fail-closed）。
  - 自动保存失败后保留失效 selection 快照误导：失败时清除 selection 并提示重新选择。
  - 行内重命名缺 Escape 取消：新增 @keyup.esc。

## 本地自检
- 测试：electron 服务/IPC/preload + src/api 48 例；CreateView 149 例；TTS 相关 81 例；story2video 相关 102 例（合计 380 例）全绿。
- vite build 通过；eslint 0 error（1 个既有 warning，非本次改动）。
- QM-1：electron-builder --win --dir exit 0；ASAR 内含 tts-voice-clone:rename（preload bundle/ipc/service 三处验证）。
- 证据边界：worktree node_modules 为 junction（@multi-publish/* 指向主工作区 packages），本次改动仅 apps/desktop 与 docs，不涉及 packages；打包证据仅覆盖本分支 apps/desktop 源码 + origin/main packages。
