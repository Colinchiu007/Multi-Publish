# tab-nav-icons-loading 分支审查记录

审查基线：

- HEAD：`9c96435e`（审查期间分支被并行更新，本记录以最新 HEAD 为准）
- 对比基线：`origin/main` = `2a74bb2e`
- 范围：正确性、边界条件、安全、规格合规

## 结论

未发现 Critical / Major 问题，结论为通过（可合并），保留以下 Info 级意见：

1. `webview-manager.test.js` 的结构锁依赖 `indexOf` + 正则切片，格式化敏感。当前实现先定位 `_setupNav`，再断言切片包含 `_maybeScheduleAutoSave` 且不含 `state.loading =`，因此不是恒真锁；但未来仍建议迁到 AST 级检查。该风险已在专项 PRD R-8 登记。
2. 全量 Vitest 存在两个与本分支无关的失败：`feedback.test.js` 的 Windows symlink EPERM，以及 `story2video-manual-assets.test.js` 的 auto 流水线断言。最新 HEAD 的本分支定向测试全部通过。
3. `pnpm run check:ts` 在既有代码上大量失败，未指向本分支新增源码行；不能作为本分支有效通过证据。

## 重点核验

1. 主进程 loading 状态机：通过。`did-start-loading` 置 true，`did-stop-loading` 收口 false，`render-process-gone` 在 true 时兜底收口；`did-finish-load` 不再写 loading。关闭标签前先删除 state，可避免销毁期事件写回。
2. 渲染层口径：通过。`tab-loading` / `tab-finished-loading` 统一走 `_applyLoading`，同时写 `tabs[].loading` 和活动标签 `navigation.loading`；`navigation-changed` 缺席 loading 时保持现状，不凭猜测清零。
3. 过期快照竞态：通过。`_recordTabUpdate` 记录版本化 live update，`_refreshTabs` / `_refreshNavigation` 在请求前捕获版本，响应后用 `_applyNewerTabUpdate` 让更新事件胜出；测试覆盖 stale `getAllTabs` 响应。
4. 结构锁：通过。当前 `indexOf` 从 `_setupNav` 定域后命中正确 `did-finish-load` 处理器，且显式断言锚点存在，不会因取到登录补注入路径而恒真。

## 安全与规格

- 新增图标为静态内联 SVG，无动态 URL、无脚本注入面；Lucide/Feather 许可声明已补齐。
- 无新增 IPC 通道；preload 仅同步注释合同，bundle 与源码一致。
- locale 复用 `common.loading`，zh/en 成对；品牌残留、locale key、`git diff --check` 均通过。

## 验证

- 定向测试：6 个文件、181 个用例全部通过。
- Lint：`pnpm run lint` 通过。
- 全量 Vitest：2 个无关失败，其余通过（结果来自分支更新前的一次运行，仅作基线参考）。
- 打包：`pnpm run build:vue` + `electron-builder --win --dir --publish never` 通过；ASAR 含 `dist/index.html` 和图标几何。
- 启动：8 秒存活、stderr 为空、无 QM-1 点名致命模式、无残留进程。
