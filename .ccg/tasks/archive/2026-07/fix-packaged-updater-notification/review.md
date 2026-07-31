# 更新配置缺失修复审查

仅当错误明确为 `ENOENT` 且路径包含 `app-update.yml` 时，将其降级为 `not-available`。错误码为 `EACCES` 的同路径测试以及既有签名错误测试确保没有扩大吞错范围。

验证: `auto-updater.test.js` 13/13 通过，受影响文件 ESLint 通过，`node --check` 通过。纯净 `origin/main@362c172` worktree 的 Windows unpacked 打包成功，真实窗口等待自动更新检查后未显示更新错误。
