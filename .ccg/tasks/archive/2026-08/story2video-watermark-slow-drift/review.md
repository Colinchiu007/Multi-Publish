# Review — story2video-watermark-slow-drift（2026-08-14）

## 审查方式（降级记录）
- Claude 后端：`codeagent-wrapper --lite --backend claude` 启动后 `claude exited with status 1`，无审查输出（既有降级模式，与 2026-08-14 watermark-options / credential-store 记录一致）。
- antigravity：地区不可用（既有模式，未调用）。
- 主代理自审。

## Diff（+5/-3，仅 2 文件）
- `story2video-compose-engine.js`：moving 表达式周期 10s/14s → 100s/140s（速度恰为原 1/10），注释同步。
- `story2video-compose-engine.test.js`：契约断言同步为 100/140，补回归注释。

## 自审结论
- Critical：0
- Warning：0
- Info：0

## 证据
- compose-engine 101 + text-config 73 = 174 用例全绿（vitest）。
- 真实 ffmpeg 12s 冒烟：`color=black 640x360 + drawtext(moving)` 渲染成功（42020 bytes，exit 0）。
- 确定性/不越界契约保持：sin/cos、无 random、表达式无逗号、t=0 居中、幅度 0.9 不变（openspec story2video-watermark Requirement 未锁周期，行为兼容）。
