# 设计

- 启动器只允许 kebab-case 任务名，调用既有 session-init.sh 创建 D 盘 worktree。
- 健康检查只读扫描主 worktree、marker、hooks 哈希和 linked worktree 路径，报告写入 LOCALAPPDATA。
- 计划任务按当前用户注册，默认每 5 分钟运行，失败通过退出码和 JSON 暴露，不自动覆盖用户文件。
- 自检使用临时报告路径并验证当前主目录合同与计划任务卸载幂等性。
