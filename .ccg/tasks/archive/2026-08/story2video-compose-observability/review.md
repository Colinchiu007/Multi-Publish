# Story2Video 合成链路可观测性审查

## 结论

- 主代理审查：0 Critical，0 未关闭 Warning。
- 双模型独立审查已按要求重试：Antigravity 因地区资格不可用；Claude wrapper 退出码 1 且未产生有效报告。按机制硬化规则降级为主代理审查，未伪造外部结论。
- 重点复核了 composeId 关联、FFmpeg 终态与 heartbeat timer 清理、输出缺失、分块生命周期、绝对路径脱敏以及 compose/renderSegment 上层错误返回。

## 审查项

1. **生命周期**：`compose_started` 在预检前生成；阶段、FFmpeg 和最终终态均携带 composeId；成功/失败/超时/空输出分别记录。
2. **心跳**：FFmpeg 长阶段每 10 秒记录 INFO 输出字节数；30 秒无增长升级 WARN；成功和失败路径均清理 interval。
3. **安全**：日志和上层错误使用 `safeFfmpegDiagnostic`；Windows/Unix 绝对路径（含空格）替换为 `<path>`，仅保留截断摘要和 basename。
4. **分块**：chunk start/success/fail/heartbeat 含 level、index、总量、输入量、耗时和输出字节数；保留既有兼容文本日志。
5. **回归**：定向测试覆盖成功/预检失败/超时/空输出/输出增长心跳/分块生命周期，以及 narration、segment 错误返回的 Windows/Unix 路径脱敏。

## Fresh 证据

- `node --check apps/desktop/electron/services/story2video-compose-engine.js`：PASS。
- 定向 Vitest：`133/133` PASS。
- `pnpm exec openspec validate story2video-compose-observability --strict`：PASS。
- `git diff --check`：PASS。
- Windows QM-1：`pnpm exec electron-builder --win --x64 --publish never --config.directories.output=E:/Multi-Publish-builds/story2video-compose-observability-qm1-20260815`：PASS。D 盘原输出因可用空间仅约 0.48 GB、NSIS 最终写入失败，改定向 E 盘后完整 NSIS 安装包和 blockmap 均生成。
- 随包验证：`app.asar` 包含 compose engine；`ELECTRON_RUN_AS_NODE=1` 分别加载随包 compose engine 与 `@multi-publish/rpa-engine` 均 PASS；打包程序用 D 盘隔离 profile 隐藏启动 8 秒存活，stderr 0 bytes，无配置/PluginLoader/ASAR 路径错误。

## 遗留边界

- 首版不解析 FFmpeg `-progress pipe`，因此日志能判断子进程运行和输出是否增长，但不提供帧级 ETA。
- 真实长视频生产耗时与硬件编码收益仍需独立性能测试；本 change 不改变 FFmpeg 参数、并发、转场或实际耗时。
