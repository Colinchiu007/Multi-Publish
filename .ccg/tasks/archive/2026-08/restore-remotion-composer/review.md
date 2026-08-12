# Review — restore-remotion-composer

## 根因
packages/remotion-composer 整目录在磁盘上缺失（48 个跟踪文件全部为未暂存删除，HEAD 仍跟踪）。
render-engine getStatus 检查 packages/remotion-composer/package.json 与 @remotion/cli 解析，
目录缺失 → composerExists=false → CreateView 显示「缺少 remotion-composer」。

## 修复
1. git restore packages/remotion-composer（恢复至 HEAD，48 文件）
2. npm install --no-audit --no-fund：重建 workspace 链接 openmontage-remotion-composer → packages/remotion-composer，
   并补装 hoisted 的 @remotion/cli/remotion 等 127 个包

## 验证
- vitest render-engine.test.js + stage-remotion-runtime.test.js：11/11 通过
- 运行中应用 CDP render:status → ready:true, composerExists:true, nodeModulesExist:true
- package-lock.json 未改动

## 风险提示
磁盘上丢失 git 跟踪源码目录的原因未确认（疑与 node_modules「神秘删除」同源的清理行为）；
若再次出现，先查 git status 确认删除范围，git restore 后必须 npm install 重建链接。
