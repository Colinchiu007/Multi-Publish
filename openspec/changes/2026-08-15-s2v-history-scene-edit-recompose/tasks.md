# Tasks — s2v-history-scene-edit-recompose

1. 服务层：`updateSegments` 白名单扩展 + `_persistComposeArtifacts` videoPrompt + 三个 regenerate 服务函数（含测试）。
2. IPC：三通道注册 + license 映射 + 校验（含测试）。
3. preload：publish.js 新方法 + build:preload 重新生成 index.bundle.js（含测试）。
4. api/publisher.js 转发。
5. ResultView：字幕区/语音区/优化词区 UI + 方法 + saveSegments 扩展（含测试）。
6. CreateViewHistory：completed 编辑入口按钮文案 + 场景列表 + 提示文字（含测试）。
7. 流水线 videoPrompt 注入（story2video-stages.js）+ 测试。
8. locales zh/en 成对 + notifications 键。
9. 文档：PRD-video-creation.md 3.1.29 章节 + 迭代记录、CHANGELOG.md、learnings（如需）。
10. 质量门禁：测试套件 + Vite build + check-locale-sync + electron 打包冒烟（可选）+ 双模型审查。
11. 交付：commit → push → PR → 合并 → 归档 task + 记忆更新。
