## Why

前两轮修复（未登录回退本地命名空间 + 友好错误处理）在 service/渲染层完成，但真实 Electron 端到端仍弹「历史记录暂时无法加载」：IPC 访问控制层（license-access-control）把 `story2video:list-projects` / `pipeline:history` 按 `authenticated` 收紧，身份启用但未登录时返回 `code:-3「当前许可证无权访问」`，渲染端拿不到数据。视频创作的本地历史是设备只读数据，不应因未登录被访问控制层整体挡住。

## What Changes

- `license-access-control.js` 的 `PUBLIC_CHANNELS` 加入 `story2video:list-projects`、`pipeline:history`（只读历史通道，未登录可用；数据按 owner 隔离在 service 层）。
- `story2video:get-project` 同属只读本地项目通道一并放行（返回面 ⊂ list-projects，零暴露增量）；`story2video:delete-project` 等写/敏感通道保持 `authenticated` 收紧。
- 测试：license-access-control 新增「只读历史通道未登录放行 + 写通道仍拒」用例。

## Capabilities

### New Capabilities
- `story2video-history-public-read`: 本地只读历史通道对未登录开放（访问控制层）。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：`apps/desktop/electron/ipc-handlers/license-access-control.js`（+2 通道）
- 测试：`license-access-control.test.js`
- 文档：learnings（真实根因复盘）、CHANGELOG、quality-gates
