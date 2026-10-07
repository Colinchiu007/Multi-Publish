---
record: identity-connection-fix
task: 修复企业网络下连接失败的分类、文案归因与诊断可外发
date: 2026-10-07
# ↓ 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
#   留下不删 = 门禁报「已回填却仍留登记字段」。登记随文件走，不存在外部清单要记得同步删条目。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 合并后的收尾会话
---

## 本次执行记录：企业网络连接失败修复（identity-connection-fix，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码：隔离 worktree `/workspace/mp-worktrees/mp-identity-connection-fix` + 裸分支 `identity-connection-fix`（经 `scripts/gwm-task.sh` 创建，创建时该脚本以「主目录 main 存在未提交文件」为由拒绝过一次，属门禁正常生效） |
| 第一性原因（QM-5 ①） | PASS | `auth-diagnostics.js` 的 `isNetworkError` 关键字表只含 DNS/连接/超时，**未覆盖任何 TLS/证书错误码**（8 个）。漏判使 `getAccessToken` 跳过 `offline_authenticated` 离线宽限分支，直接落到 `status:'error'` 兜底——这是行为缺陷而非文案不准。另两处：`useLoginGate` 把 `disabled`/`error` 合并并使用开发者文案「请在主进程配置身份服务」；`ipc-handlers` 的 `safeError()` 只回传 code，cause 链在主进程即中断 |
| 逃逸分析（QM-5 ②） | PASS | 逃逸于「网络类判定」这一层：既有测试只覆盖了 `ECONNREFUSED`，**8 个 TLS 码零覆盖**；`useLoginGate.test.js` 无 `status:'error'` + `error.code` 的用例；诊断通道与 bundle 契约在实现前无人检查 |
| 修复 + 回归保护（QM-5 ④） | PASS | 补 TLS 码 + `classifyNetworkError`/`networkErrorCode`；`useLoginGate` 接入 `resolveIdentityStatusNoteKey`/`resolveIdentityErrorMessageKey`；新增 `identity:diagnostic-report` 通道与 `IdentityDiagnostics.vue`。回归：`auth-diagnostics.test.js` 49 项（含 8 个 TLS 码参数化 + 细分码与 UI 文案键交叉登记）、`IdentityDiagnostics.test.js` 9 项、`useLoginGate.test.js` +4、`MemberCenter.test.js` +2 |
| 防止再次发生（QM-5 ⑤） | PASS | ①「细分码 ↔ 文案键」交叉登记测试——新增码忘加文案会直接红，否则静默回落 `operationFailed`；② TLS 文案安全红线断言（必须含「勿关闭证书校验」告诫 + 「找 IT 加白名单」可执行动作）；③ 脱敏红线 7 类凭证 + 嵌套 cause；④ 诊断信息脱敏**复用 `ipc-handlers/account.js` 既有正则**，避免两套规则漂移 |
| 行尾与 diff 对账 | PASS | 两口径实测一致：标准 `909/32`、`--ignore-cr-at-eol` `909/32`（含本记录文件）。删除 32 行全部来自「被替换的旧实现」（旧 `isNetworkError` 关键字表、`loginGate.disabledMessage` 引用、ProfileMenu 内联错误样式、`disabledMessage` 变量），无行为性删除 |
| 接线棘轮 | PASS | 新增 `src/components/IdentityDiagnostics.test.js` **无需改 workflow**：已核 `apps/desktop/vitest.config.js` 的 `include` 含 `src/**/*.test.{js,ts}` 通配，文件自动纳入；桌面测试由 `QG Desktop Shards` / `QG Coverage` 整目录收集执行（`electron-ci.yml` 注释已注明其桌面 vitest 收敛为仅 main push，PR 上实际执行者是 QG 系列）。该文件本地独立跑 9/9 通过 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面（`packages/python-backend`、`ops-center`）故 QM-1 无打包对象；无 UI 布局/主题改动（新增组件在既有 `.member-center-error-box` 内，样式沿用既有 token），QM-4 视觉回归 N/A |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`（AGENTS.md 允许如实写未执行）。**不以自审冒充通过**；另 `agent-judge` check 在 CI 中已通过 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#3051)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin identity-connection-fix` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### CI 结果（3cacb259）

22/22 check 全绿：`electron-tests`、`gui-test`、`单元测试 + Lint`、`债务熔断检查`、`文档同步检查`、`agent-judge`、`依赖漏洞审计`、`build`、`release`、`QG Visual`、`QG Static`、`QG Unit Tests`、`QG Desktop Shards (1/2)(2/2)`、`QG Coverage`、`QG Browser E2E` 等。

`mergeable: MERGEABLE`，与 main 无冲突文件重叠。

### 过程中的两次门禁回红（均由本次改动引起，已修）

1. **文档同步检查**：改了产品可见行为却未带文档 → 补 `01-docs/BUGFIX-IDENTITY-CONNECTION-FAILURE-CLASSIFICATION-2026-10-07.md`
2. **QG Coverage**（14083 passed | 3 failed）：新增 preload API 后三处契约测试未同步 →
   `preload/identity.test.js` 方法与 channel 清单各 +1、`preload.test.js` 总键数 336→337、
   **重建 `preload/index.bundle.js` 与 `home-shell-preload.bundle.js` 提交物**（各 +1 行即新 API 本身）

### 遗留（不假装已闭合）

- `check-max-lines` 在 sparse checkout 环境报 3 条 `ops-center/*` 的 `STALE_LEDGER_ENTRY`，
  系该目录未被检出所致，与本改动无关（已确认未触碰任何 ops-center 文件）。
- `member-center-main` 仅在「已登录」分支渲染，诊断入口随之不可见；未登录空态不显示诊断区，
  属现有设计约束，非缺陷。已在 `MemberCenter.test.js` 用例注释中固化该前提。
