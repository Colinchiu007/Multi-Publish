# Review: s2v-start-foreground-tracking

## 结论

- Critical: 0
- Warning: 0
- Info: `pnpm run check:ts` 受未修改模块既有类型错误阻塞，本次变更未新增类型错误（未单独验证通过）。

## 审查方式

- 按 CCG 要求尝试双模型并行审查：
  - opencode: `codeagent-wrapper.exe` 启动后进程异常退出（exit 3221226505），无审查输出；
  - Claude: `codeagent-wrapper.exe` exit 1，无审查输出；
  - 已如实降级为主代理手工 diff 审查，不伪造双模型结果。
- 手工审查范围: `git diff HEAD` 全部变更文件，重点核对生命周期竞态、后台任务不被误取消、状态语义、测试覆盖、文档一致性。

## 手工审查发现与处理

1. `interrupted` 状态标签最初随存量 `statusLabel()` 直接硬编码「已中断」，违反 i18n 合同；已改为读取 `create.history.tabs.interrupted`，无 i18n 时英文 fallback，并同步修正 i18n-glossary。
2. CJK 基线因行号位移触发全量假阳性，按脚本已知边界显式 `--update-baseline` 重锚；扫描前后均为 1490 条，无真实新增硬编码用户文案。
3. 启动请求代际（`orchestrationStartRequestId`）、组件存活（`_s2vAlive`）、runId 快照三重竞态守卫互相独立，切 tab、卸载、切换 run 后旧响应均不会挂回。
4. `detachPipelineView()` / `switchView()` 只清理 renderer 跟踪态，不调用 `pipelineCancel`，主进程 run 继续执行并占用并发槽位；测试覆盖该合同。
5. `scene_asset_selection` 保持 paused 人工检查点，不进自动后台，语义与既有合同一致。

## 门禁结果

- Vitest: `CreateView.test.js` + `CreateHistory.test.js` = 242 passed（2 files）
- Vue 生产构建: `pnpm run build:vue` 通过
- locale: `check-locale-sync.js --cjk` PASS（1490/1490）
- 依赖解析: `verify-worktree-deps.js` OK（9 项）
- `git diff --check`: 通过
- Electron 完整打包（QM-1）: 本次仅修改 renderer 视图/样式/locales/文档，未修改 `apps/desktop/electron/` 主进程代码，不触发 QM-1 打包门禁。

## 未解决风险

- `check:ts` 全量类型检查被工作区既有未修改模块错误阻塞，建议后续独立任务清理。
