## 1. 共享内核提取

- [x] 1.1 新增 `apps/desktop/electron/services/prompt-engine-kernel.js`：风格枚举/别名/归一、SENSITIVE_CONTEXT_KEYS/assertNoSensitiveContext、PROMPT_ENGINE_LIMITS（JSDoc 标注 maxLength 归属）、clampNumber、extractOptimizedBase——测试：kernel.test.js 导出完整性 + fail-closed 核心用例
- [x] 1.2 `prompt-engine-contract.js` 改 kernel 引入 + re-export（公共 API 13 项零变化）；`extractOptimizedPrompt` 基于 extractOptimizedBase 合并 detected_categories/candidates——测试：既有 prompt-engine-contract.test.js 全绿（零修改）
- [x] 1.3 `video-prompt-engine-contract.js` 改 kernel 引入（import 清单不变）；`_extractVideoBase` 删除替换为 extractOptimizedBase——测试：既有 video 用例全绿（零修改）

## 2. 回归与质量门禁

- [x] 2.1 图片 + 视频契约测试套件全量通过（行为保持证明）；PromptBridge/story2video/stage-executor 相关测试回归
- [x] 2.2 QM-1/QM-2 打包验证通过（electron-builder + require 链）
- [x] 2.3 CHANGELOG.md、01-docs/learnings.md（共享内核与领域能力边界原则）、`.quality-gates.md` 执行记录

## 3. 协同落地

- [x] 3.1 与 video-prompt-higgsfield-mechanics 同 PR 合并（kernel 先行 commit，行为保持可独立回滚）
- [x] 3.2 openspec apply + 归档双 change；跨仓库联调口径不变（tasks 4.4 由 Higgsfield change 承接）
