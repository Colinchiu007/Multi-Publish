# 历史记录永久加载热修复审查

## 范围

- Story2Video 历史项目的受控媒体路径判断。
- “视频创作 → 历史记录”和“创作历史”两个入口的 IPC 超时、部分成功、错误重试与并发请求竞态。
- 模型服务商 GUI E2E fixture 与实际 `is_configured` 合同一致性。
- 临时 Electron 构建目录的 Git 忽略规则。

## 审查结果

### Critical

无。内部复审确认此前发现的 junction 路径绕过和旧响应覆盖新请求两个问题均已关闭。

### Warning

无阻塞项。

- `npm run check:ts` 仍因仓库既有 TypeScript 诊断失败；本次修改文件没有新增诊断。
- `npm run lint` 仍因仓库既有 15 个 error 失败；本次修改只命中 `CreateHistory.vue` 中既有的 unused catch 参数 warning，没有新增 error。
- `electron-builder` 的默认输出目录被一个较早的可见应用实例锁定；没有绕过安全删除。改用新的 `dist-electron-history-final` 输出目录完成等价打包验证，并新增 `dist-electron-*/` 忽略规则，防止该类临时产物污染 Git 状态。

### External models

项目规范要求的双模型审查已并行尝试，但本机能力不可用：

- antigravity：`agy command not found in PATH`。
- Claude wrapper：`claude exited with status 1`。

因此没有把外部模型审查标记为通过；结论以本地代码审查、回归和打包窗口证据为准。

## 验证

- `npx vitest run src/views/CreateView.test.js src/views/CreateHistory.test.js electron/services/story2video-project-service.test.js --reporter=verbose`：3 files、93 tests passed。
- `npm run build:vue`：通过，Vite 编译 1825 modules。
- `npm run test:e2e`：270/270 checks passed，0 console errors，0 page errors。
- `node ../../node_modules/electron-builder/cli.js --win --x64 --config.directories.output=dist-electron-history-final`：通过。
- ASAR 清单包含 logger；解包后 `@multi-publish/rpa-engine` 的真实 `require` 成功。
- 隔离 user-data 包启动 8 秒存活，stderr 仅为 DevTools 调试端点，无 `Failed to load platform config`、`PluginLoader.*mkdir failed` 或 `ENOTDIR.*app.asar`。
- 最终包以正常用户配置启动，并通过 CDP 确认 URL 指向 `dist-electron-history-final/win-unpacked/resources/app.asar/dist/index.html`；在 `/create` 点击“历史记录”后 loading 已结算。
- `git diff --check`：通过。

## Bug reflection 闭环

根因、5 Whys、逃逸链、RED→GREEN 和 R89 预防合同已记录在 `01-docs/learnings.md`。新增回归覆盖：悬挂 IPC、部分成功、并发旧响应、目录外路径和目录内 junction 路径。
