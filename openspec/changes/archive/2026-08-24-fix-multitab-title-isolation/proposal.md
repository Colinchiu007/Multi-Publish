## Why

桌面端同时打开多个平台标签后，当前标签栏或导航栏可能显示另一个标签的页面标题。这会误导用户当前正在操作的平台，且标题事件与异步刷新交错时可以稳定复现。

## What Changes

- 让 renderer 按 `tabId` 消费页面标题和导航事件。
- 让实时标题事件优先于已经发起的标签列表和导航快照。
- 在标签创建与切换时先同步活动标签，再请求导航状态。
- 添加主进程和 renderer 的多标签、乱序刷新回归保护。

## Capabilities

### New Capabilities

- `desktop-tab-state-isolation`: 保证多标签浏览器状态中的标题、URL 和导航栏状态按 `tabId` 隔离，并拒绝过期异步写回。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`apps/desktop/src/stores/tab.js` 和现有 `WebviewManager` 测试。
- IPC 仍使用既有 `page-manager:tab-title-updated` 与 `page-manager:navigation-changed` 事件，无新增公开 API 或依赖。
