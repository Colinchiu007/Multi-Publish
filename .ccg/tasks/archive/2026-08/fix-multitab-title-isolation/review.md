# 多标签标题隔离修复审查

## 变更概览

- 范围：`apps/desktop/src/stores/tab.js`、标题隔离主进程回归测试、渲染端 tab store 回归测试。
- 复杂度/风险：M / 中。变更位于 Electron renderer 状态同步路径。
- 隔离：仅在 `D:/Data/projects/mp-worktrees/mp-fix-multitab-title-isolation` 与 `codex/fix-multitab-title-isolation` 分支进行；`pre-code-edit-guard.ps1` 已放行。

## QM-5 Bug 复盘

### 第一性原因

`git blame` 显示 `apps/desktop/src/stores/tab.js` 的初版来自 `941b17f15`。主进程 `WebviewManager._setupNav(tabId, view)` 一直按闭包中的 `tabId` 写入状态并广播 `tab-title-updated`；但 renderer 没有订阅这个标题事件，并在创建/切换标签时先发起异步刷新、后同步 `activeTabId`。因此非活动标签标题会陈旧，而飞行中的 `getAllTabs()` / `getActiveTab()` 响应可以在活动标签已经变化后覆盖 renderer 状态，表现为当前界面标题串成快手等其他标签的标题。

### 逃逸链

| 测试层 | 为什么未拦截 |
| --- | --- |
| 单元测试 | 原本没有 renderer `tabStore` 的标题事件、活动标签切换或乱序请求用例。 |
| 集成测试 | 未把主进程 `page-title-updated` 广播与 renderer store 状态关联验证。 |
| E2E | 没有同时加载两个外部发布站点并交错更新标题的场景。 |
| 视觉回归 | 现有页面视觉检查不覆盖外部 WebContentsView 的异步标题时序。 |
| 代码审查 | 只验证了主进程广播，漏看 renderer 没有消费标题事件和异步结果无目标快照守卫。 |

### 系统性漏洞

这是“测试场景缺失 + 异步状态审查盲区”：renderer 将事件流与拉取式刷新视为独立来源，没有定义实时事件优先于已在途快照的状态合同。

### 修复和回归保护

- `tab-title-updated` 与 `navigation-changed` 均按 `tabId` 更新标签；仅活动标签可更新导航栏。
- 标签创建/切换事件先写入 `activeTabId`，刷新导航时校验请求序号、活动标签快照和返回 `tabId`。
- 列表刷新采用请求序号，并用实时事件版本覆盖请求发起后到达的标题/URL，避免旧快照回写。
- 新增 `apps/desktop/src/stores/tab.test.js` 覆盖非活动和活动标题、切换顺序、列表和导航请求乱序及“事件发生在列表刷新期间”。
- 扩展 `apps/desktop/electron/services/webview-manager.test.js`，确认两个 WebContentsView 分别发出的标题事件不会互相污染。

### 预防措施

已将“实时 tab 事件优先于异步刷新快照”的模式补充至前端规范；之后涉及“可变活动目标 + 事件/请求并存”的 renderer 状态变更必须覆盖乱序请求与事件穿插场景。

## 审查结果

- 本地逐行审查：0 Critical，0 Warning。确认关闭标签时清理实时更新缓存，活动标签判断和返回 `tabId` 判断均在写入前执行。
- 外部审查降级：OpenCode wrapper 没有提供有效结果；Claude wrapper 日志显示连续 `401 authentication_failed`，未生成审查报告。
- 已知验证限制：完整桌面 Vitest 套件在此机先前运行时触发 Node/V8 OOM；未将其作为本次修复失败，已使用两层定向回归与 renderer 构建替代验证。
