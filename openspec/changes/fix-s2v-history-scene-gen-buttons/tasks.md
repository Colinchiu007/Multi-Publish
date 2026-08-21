## 1. 规格与实现

- [x] 1.1 ResultView.vue：生成按钮扩到 image1/image2、video1/video2（场景级动作多入口）
- [x] 1.2 ResultView.vue：hasUsableVideoPrompt 放宽为 videoPrompt || prompt || text，模板 :disabled 与方法入口 guard 同步
- [x] 1.3 ResultView.test.js：更新按钮归属/数量断言，新增空槽按钮、回退可点 + 真实 IPC、busy 传播、slot 限定选择器

## 2. 文档与治理

- [x] 2.1 PRD-video-creation / PRD-S2V-PIPELINE-PAGE-UX / PRD-SCENE-MATERIAL-ENHANCE / CHANGELOG / learnings / .ccg/spec/frontend 同步
- [x] 2.2 openspec validate + 双模型审查（Claude 通过；opencode 后端不可用已记录降级）
- [x] 2.3 定向测试 + 全量 vitest + ESLint + Vue build + CJK/locale + worktree dep 解析通过
- [ ] 2.4 推送 codex 分支 → PR → CI 通过 → 合并回 main
- [ ] 2.5 三同步归档（openspec archive + CCG task 归档 + 记忆更新）
