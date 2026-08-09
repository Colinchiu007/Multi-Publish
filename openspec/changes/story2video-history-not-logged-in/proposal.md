## Why

身份服务已启用（`identityAuthEnabled=true`，`IDENTITY_AUTH_REQUIRED=false`，不强制登录）时，未登录用户打开「视频创作 → 历史记录」会稳定弹出「历史记录暂时无法加载，请稍后再试」。根因：`Story2VideoProjectService._ownerSubject()` 对「有身份服务但未登录（provider 返回 null）」fail-closed 抛「无法识别当前用户」，`story2video:list-projects` 返回 code!=0，渲染端 `loadHistory` 的 `!hasProjects` 分支把任何失败都当作「无法加载」。本地视频创作历史（设备本地数据）不应因未登录而不可用。

## What Changes

- **主进程 service 层**：`story2video-project-service.js` 的 `_ownerSubject()` 在身份解析无有效 sub（未登录）时**回退设备级本地命名空间 `__legacy__`**（与「未配置身份服务」的既有行为一致），不再抛「无法识别当前用户」；store 缺失仍 fail-closed。
- **渲染端**：无需改动——主进程修复后 `story2video:list-projects` 返回 code 0，`loadHistory` 不再进入 `!hasProjects` 弹错分支，显示既有空态「暂无创作记录」。
- **测试**：更新 story2video-project-service 既有「未登录拒绝读取」断言（属反向固化错误行为）为「未登录回退本地命名空间可读取」；补渲染端 loadHistory 未登录不弹错用例。
- **文档**：learnings 复盘（fail-closed 误用 + 反向固化测试）、PRD-video-creation 历史记录边界、CHANGELOG、quality-gates。

## Capabilities

### New Capabilities
- `story2video-history-local-mode`: 身份未登录时视频创作本地历史可用（回退设备级命名空间，不弹「无法加载」；登录后按 sub 隔离）。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/story2video-project-service.js`（渲染端 `CreateView.vue` 无改动；`story2video.js` IPC 层无改动）
- 测试：`story2video-project-service.test.js`、`CreateView.test.js`
- 文档：learnings.md、PRD-video-creation.md、CHANGELOG.md、.quality-gates.md
- 交付：codex/ 分支 + PR 合并；应用重启验证
