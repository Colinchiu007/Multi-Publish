# 需求与证据

## 目标

修复运行 run_1787360004146_izko 中用户选择的“音色001”无法完成 TTS 的问题。重克隆成功后必须沿用初始 TTS 后端：存在 assetGenerator 时调用资产生成器；否则调用 legacy serviceBus.callPythonSkill('generate_tts', ...)。

## 已确认根因

- apps/desktop/electron/services/story2video-stages.js:2923-2947 初次 TTS 在没有 assetGenerator 时走 serviceBus.callPythonSkill。
- 同文件 :2968-2979 的 tryReCloneVoice 回调无条件调用 assetGenerator.generateTTS。legacy 路径中该值为 undefined，重克隆成功后抛 TypeError，被共享 helper 吞掉，最终返回原始音色错误。
- git blame 显示缺陷由 6f2ec3f98（2026-08-18 统一重克隆 helper）引入；d2b1b31dc（2026-08-22）只修复 MiniMax 200 业务错误和默认官方音色静默兜底，未覆盖后端选择。

## 约束

- 保持 fail-closed：重克隆或重试合成失败时透传原始音色错误，不切换官方默认音色。
- 同时修复 generate_assets 和 finalize_assets 的相同回调缺陷。
- 不统一或改写 MiniMax 克隆模型合同，不扩大到多样本策略。

## 验收标准

1. legacy serviceBus 初次 TTS 失败、重克隆成功后，第二次 generate_tts 使用新 voice id 并成功返回资产。
2. assetGenerator 路径的行为保持不变，重试仍调用 generateTTS。
3. finalize_assets legacy 路径同样能完成重克隆重试。
4. 重克隆失败和重试合成失败仍返回失败，不调用默认官方音色。
5. targeted Vitest、相关全量测试及 Electron 打包门禁通过。
6. 通过真实 PipelineEngine + StageExecutor 调度链补 E2E 回归，legacy 路径重克隆后复用 serviceBus.callPythonSkill。

## QM-5 逃逸分析

- 单元层：已有 tryReCloneVoice helper 测试只注入 retryFn，未验证调用方如何选择 TTS 后端。
- 集成层：缺少 generate_assets/finalize_assets 与真实 serviceBus.callPythonSkill 的重克隆场景。
- E2E/视觉层：该问题发生在主进程 provider 调用链，现有视觉测试无法触达。
- 审查层：统一 helper 改造只检查 fail-closed 语义，遗漏了 legacy/assetGenerator 双路径契约。
