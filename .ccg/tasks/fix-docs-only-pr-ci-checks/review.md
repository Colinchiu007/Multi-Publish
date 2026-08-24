# 审查报告 — 纯文档 PR 必需 CI 检查修复

## 结论

通过本地审查。未发现 Critical 或 Warning。

## 审查范围

- `.github/workflows/{quality-gate,electron-ci,build,doc-gate}.yml`
- `.github/scripts/workflow-contract.test.js`
- OpenSpec delta、合并检查文档、learnings、changelog 与质量记录

## 核验结果

- 四个 workflow 的 `pull_request` 仍保留 main 目标约束（Doc Gate 保留 `opened/synchronize/reopened` 类型），但不再使用 `paths-ignore`；因此受保护 job 由真实 PR 事件产生。
- `quality-gate`、`electron-ci`、`build` 的 `push main` 忽略清单完全保留；build 的 `tags: [v*]` 也未改动，因此不会让 docs-only 合并后的 main push 或发布 tag 行为漂移。
- 未新增同名空 job、`if: false`、status API 调用或手动 dispatch 依赖；所有 required context 继续由既有完整 workflow 执行。
- `workflow-contract.test.js` 以 YAML 解析断言新合同，并保留对 push 忽略清单、quality-gate matrix、watchdog 和 UI 门禁的原有保护。
- `node --test .github/scripts/workflow-contract.test.js`：14/14 通过；`openspec validate fix-docs-only-pr-ci-checks --strict` 与 `git diff --check` 通过。

## 外部双模型审查降级

- OpenCode wrapper 两次启动均只返回角色加载/范围澄清，没有消费提供的审查任务，未形成审查报告。
- Claude wrapper 两次启动后持续无 stdout，等待后主动终止，未形成审查报告。
- 按机制硬化规则，记录外部审查不可用；本地逐项审阅和远程真实 PR CI 用作补偿验证。远程验证尚待提交推送后执行。

## CI 反馈：Windows Browser E2E 导航恢复复审（2026-08-24）

### QM-5 根因与逃逸分析

- **第一性原因**：`c4fae0902e` 于 2026-07-13 引入 `FunctionalRunner` 时，`goto()` 只执行一次 `page.goto()`；`6d048d01d7` 于 2026-07-19 加入 hash 路由就绪等待和统一串行入口，但仍未定义 Playwright 导航的瞬态错误恢复边界。PR #1146 运行 `32689611032` 的 job `97320821372` 在 `/accounts` 首次暴露 `net::ERR_NO_BUFFER_SPACE`。
- **逃逸链**：单元/合同层没有覆盖瞬态导航错误（测试场景缺失）；E2E 能发现单次失败但旧 docs-only PR 被 `paths-ignore` 跳过，未产生运行证据（流程缺失）；已有 `E2E_CONCURRENCY=1` 只约束 spec 并发，审查未检查单次 `page.goto` 的 Windows 网络资源错误分类（审查盲区）。
- **系统性漏洞**：测试基础设施把“导航失败”全部视作同一种不可恢复错误，缺少可审计的、精确签名的有限恢复合同。
- **修复与回归保护**：`FunctionalRunner.navigate()` 由 `goto` 与 `resetToRoute` 复用；仅 `net::ERR_NO_BUFFER_SPACE` 延迟后重试一次，非匹配和第二次错误原样抛出，成功前不调用 `waitForAppReady`。`functional-runner.test.js` 覆盖 4 个场景，并被 Gate 8 显式置于真实 Browser E2E 前。

### 本地复审结论

未发现 Critical 或 Warning。

- 错误匹配为精确常量子串，不会对 `ERR_CONNECTION_REFUSED`、应用启动、路由断言或超时错误重试。
- 最大尝试次数为 2；最终抛出 Playwright 的最后一次原始错误，不返回伪成功、不改检查结果。
- `waitForAppReady` 和 action 的 `goto` / `resetToRoute` 成功记录均位于共享导航成功之后；reset 的 timeout 传递不变。
- `workflow-contract.test.js` 断言新合同测试在 Gate 8 的真实扫描前运行；本地完整入口已验证 317/317 checks、0 console/page errors。

### 外部双模型审查状态

- 2026-08-24 并行启动 OpenCode 与 Claude reviewer wrapper，均在 4 分钟上限内结束但当前工具会话没有返回可消费的审查 stdout，未形成有效外部报告。
- 按机制硬化降级：保留本地逐项复审、OpenSpec 严格校验、workflow/runner 合同、E2E 等待门禁及完整真实 Browser E2E 作为补偿证据；推送后仍以 GitHub Windows Gate 8 为最终独立验证。
