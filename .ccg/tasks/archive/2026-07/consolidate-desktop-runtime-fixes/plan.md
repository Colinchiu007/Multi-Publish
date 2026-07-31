# 提交与整合计划

1. 只提交桌面启动兼容、窗口可见性、Remotion 运行时闭包及其测试和锁文件。
2. 排除其他会话的 `packages/ai-writer/src/cli.js`、`packages/api-publish-engine/bin/publish-api` 与生成的 preload bundle。
3. 复跑启动、窗口、Remotion staging 和渲染引擎定点测试；打包后的真实窗口已验证。
4. 在全新的集成 worktree 中合并已提交分支，不在脏的 Trellis worktree 上合并。
5. 推送前检查提交范围、merge-base 和远端 `main` 快进条件。
