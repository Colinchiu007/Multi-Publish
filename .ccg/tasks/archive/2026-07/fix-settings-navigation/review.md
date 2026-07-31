# 设置入口修复审查

## 范围

- `apps/desktop/src/layouts/AppNavbar.vue`
- `apps/desktop/src/layouts/AppNavbar.test.js`

## 结论

未发现 Critical、Warning 或需阻断合入的问题。

## 审查要点

1. `AppNavbar` 仍以既有的 `openSettings` 事件与 `App.vue` 对接，未改变设置弹窗的数据、IPC 或持久化路径。
2. 移除了只含一个项目的二级菜单、菜单状态和文档级外部点击监听；不再存在“首次点击不执行设置动作”的分支。
3. 组件测试已覆盖设置入口单击发出事件，既有升级和发布导航用例继续通过。
4. 打包应用的真实 Chromium renderer 已验证一次点击后的弹窗标题和默认模型设置标签。

## 验证证据

- RED: 修复前新增用例失败，`navbar.emitted('openSettings')` 为 `undefined`。
- GREEN: `npm test -- --run src/layouts/AppNavbar.test.js`，3/3 通过。
- 静态检查: `npx eslint src/layouts/AppNavbar.vue src/layouts/AppNavbar.test.js --no-ignore`，通过。
- 打包: `npm run build:dir`，生成 `dist-electron/win-unpacked/Multi-Publish.exe`。
- 真实桌面窗口: 通过 CDP 点击 `.nav-settings-trigger`，得到 `title=设置`、`activeTab=模型设置`。

## 外部审查状态

按 CCG 流程并行调用 Antigravity 与 Claude 审查后，本机分别报告 `agy command not found in PATH` 和 `claude exited with status 1`，没有产生可采信的模型审查结果。错误输出保存在本任务目录的 `*-analysis.txt`；本次结论来自上述本地审查与实测，外部双模型审查仍需在后端恢复后补做。
