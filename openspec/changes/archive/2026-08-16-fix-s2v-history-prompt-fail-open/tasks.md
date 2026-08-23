## 1. 规格与实现

- [x] 1.1 R1：story2video-project-service.js extractOptimizedPrompt error-first fail-closed（image/video 双域）
- [x] 1.2 R2：回归测试——「error + 回显原文」形态（image/video）、「error 无文本」、上下文同源断言（story2video-project-service.test.js）
- [x] 1.3 R4：regenerateScenePrompt 请求补传 buildOptimizeContext(context) + 契约键白名单透传 + max_length 2000 保持

## 2. 验证与交付

- [x] 2.1 vitest：story2video-project-service.test.js + story2video-stages 相关用例全绿
- [x] 2.2 openspec validate + 双模型审查（antigravity/claude 并行；降级则记录）
- [x] 2.3 推送 codex/ 分支 → PR（含 learnings.md 复盘条目）→ CI 全绿 → 合并回 main
- [x] 2.4 运行侧操作说明交付（prompt-engine 切 main + Token 额度恢复 + 重启 8013）
- [x] 2.5 三同步归档（openspec archive + CCG task 归档 + learnings 已入库）
