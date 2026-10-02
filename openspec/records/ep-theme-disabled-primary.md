---
record: ep-theme-disabled-primary
task: 主按钮禁用态从「饱和主色」改为中性降格档，并补按主题求解的禁用态合同
date: 2026-10-02
---

## 本次执行记录：主按钮禁用态降格（ep-theme-disabled-primary，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（渲染层 CSS 令牌）。worktree `D:/Data/projects/mp-worktrees/mp-ep-theme-disabled-primary`，裸分支 `ep-theme-disabled-primary`，`git rev-list --left-right --count HEAD...origin/main` = `0	0`；由 `scripts/start-mp-task.ps1` 建立，`verify-worktree-deps` OK |
| 第一性原因（QM-5 ①） | PASS | Element Plus 自带 `.el-button--primary { --el-button-disabled-bg-color: var(--el-color-primary-light-5) }` 声明在**元素作用域**上。本仓桥接层上一轮把 `-light-5` 兜底为 `--color-primary-hover`（饱和主色），于是禁用态与 hover 态同色。真实窗口实测：改前浅色禁用底 `rgb(96,58,249)`（＝同一按钮 hover 实测值），暗色禁用白字对比度 3.63 |
| 逃逸分析（QM-5 ②） | PASS | ① 单元层此前无「按主题分别求解 var() 链」的锁（`sidebar.tokens.test.js` 把 `:root` 与 `[data-theme=dark]` 合并成一张表，对档位错配免疫）；② CI Gate 15c `check-css-var-defined.js` 只拦「全仓从未定义」的引用，且 `--el-*` 前缀白名单，本案两档都有定义 ⇒ 结构性看不见；③ 像素门禁对 hover/disabled 态失明（基线里不渲染禁用主按钮）；④ 代码审查未把「禁用档 = 哪一档颜色」列为检查项 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：`ep-theme.css` 新增 `.el-button--primary` 元素作用域三档（bg→`--color-bg-inset`、border→`--color-border`、text→`--color-text-secondary`）。回归锁：`ep-theme.tokens.test.js` 新增「主按钮禁用态合同」7 例（作用域存在性、两主题可解析、禁用底≠常态且≠hover、两主题禁用文字对比度 ≥3 且解析不了即抛）。本机 `node vitest run src/styles/ep-theme.tokens.test.js src/styles/sidebar.tokens.test.js` = **17 passed** |
| 防止再次发生（QM-5 ⑤） | PASS | 锁本身进 `apps/desktop`（vitest workspace 收集域，CI `desktop-shards` 1/2、2/2 执行）。反证四条已实跑：M1' 禁用底退回 `-light-5` ⇒ 4 条红；M2 禁用文字退回白 ⇒ 5 条红；M3 三档改写到 `:root` ⇒ 7 条红；M4 摘掉上一轮 hover 兜底 ⇒ 2 条红（证明修口径未削弱既有回归锁）。每次变异后均断言文件与备份**逐字节相同**。同场修掉一处口径缺陷：可解析性判据原以 `tokens.css` 表为准，会把「引用本文件 :root 自声明的 EP 变量」误判为不可解析 ⇒ 改为 tokens + 桥接层真实域 |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径完全相同：`ep-theme.css 11/0`、`ep-theme.tokens.test.js 92/2`。`ep-theme.css` 改后 67 CRLF / 0 bareLF / 0 loneCR / 无 NUL（改前基线 56/0/0，纯 CRLF 文件，补丁按字节追加未统一行尾） |
| 接线棘轮 | N/A | 本 PR 只**修改**既有测试文件 `apps/desktop/src/styles/ep-theme.tokens.test.js`（#2627 引入），不新增 `scripts/`、`.github/scripts/` 下的测试文件；`scripts/check-unwired-tests.js` 本机 PASS |
| QM-1 打包 / QM-4 视觉 | 部分 | QM-1 N/A：未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`。QM-4 本机未跑像素门禁（需 dev server 且基线只能取自 CI 渲染）；本改动**会**改变禁用主按钮外观，若某张基线含该形态，由 CI `QG Visual` 判定，届时按同一次 CI 渲染重建基线，不提阈值 |
| QM-6 CCG 双模型外部评审 | **未执行** | 两路后端本机均不可达，已实测归因而非猜：`--backend codex` ⇒ 本地路由代理 `http://127.0.0.1:15721/v1/responses` 连续 5 次 `502 Bad Gateway` 后 `turn.failed`；`--backend claude` ⇒ `ECONNREFUSED`（直连 `claude -p` 复现同一错误）。wrapper 退出即删自己的日志，故判据来自绕过 wrapper 的直连探针。本 PR 不落在 QM-6 触发条件（未触主进程服务/IPC/核心引擎包，无安全/数据校验/状态机/持久化面），改由 QM-2 自审 + 上表实测覆盖：**独立外部评审未做，不得记为通过**。修复路由代理属机器级配置，需单独授权 |
| 远程同步 | PASS | 本机现取证据：`git log origin/main --grep="(#2771)$" --format=%H|%cI` → `d0147ea42e56fa999e275c768c4b52b6a18c0561` / `2026-10-02T11:18:45Z`（squash 落地，主题即本 PR 标题）；`git ls-remote --heads origin ep-theme-disabled-primary` 返回 0 行 ⇒ 远端分支已删；CI 侧 21 条上下文全为终态且 fail=0（看守日志 round=26 `RESULT=ALL_TERMINAL_GREEN pass=21 skip=0`）。三个 `sync_*` 登记字段随本次回填一并删除 |

### 真机验证（真实 Electron 窗口，非 headless）

被测量是应用自己弹出的消息框【确认】按钮（`.el-message-box__btns .el-button--primary`），即用户报告的那颗：

| 主题 | 可用态底 | 禁用态底 / 描边 / 文字（改前） | 禁用态底 / 描边 / 文字（改后） | 改后对比度 |
|------|----------|--------------------------------|--------------------------------|------------|
| 浅色 | `rgb(80,72,229)` | `rgb(96,58,249)` / 同色 / 白 | `rgb(250,246,248)` / `rgb(239,239,239)` / `rgb(112,112,128)` | 4.54 |
| 暗色 | `rgb(80,72,229)` | `rgb(123,116,255)` / 同色 / 白 | `rgb(30,30,35)` / `rgb(50,50,58)` / `rgb(180,178,198)` | 8.00 |

改前禁用底 `rgb(96,58,249)` 与该按钮 hover 实测值逐字相同 ⇒ 「禁用」在视觉上与「可点/悬停」不可区分。改后 `cursor: not-allowed` 与中性底一致，DOM 探针已复原（`restoredOk=true`），弹窗以 Esc 关闭，未点任何按钮、未写任何用户数据。

**变体未被波及（实测，不是读 CSS 推的）**：同一窗口内合成四种禁用主按钮并读 computed 值——

| 变体 | 禁用底 | 禁用描边 | 禁用文字 |
|------|--------|----------|----------|
| 实心 `--primary` | `rgb(250,246,248)` | `rgb(239,239,239)` | `rgb(112,112,128)` |
| `.is-plain` | `rgb(239,246,251)` | `rgb(239,246,251)` | `rgb(96,58,249)` |
| `.is-text` | `rgba(0,0,0,0)` | `rgb(239,246,251)` | `rgb(96,58,249)` |
| `.is-link` | `rgba(0,0,0,0)` | `rgba(0,0,0,0)` | `rgb(96,58,249)` |

三个变体取的是 EP 自带 `.el-button--primary.is-plain.is-disabled` 那条**直接声明**（底/描边 `--el-color-primary-light-9`→`#eff6fb`、文字 `-light-5`→`#603af9`，同场读到的 token 值已核对），不经我改的 `--el-button-disabled-*` 三档 ⇒ 本次改写只落在实心主按钮，没有制造第二套口径。

### 遗留（不假装已闭合）

- `is-plain` / `is-text` / `is-link` 三种主按钮变体的禁用态仍走 EP 自带规则（文字取 `-light-5`、底取 `-light-9`、描边取 `-light-8`），本 PR **未**改，且已实测确认取值未被我改的三档波及（见上表）。理由：那是另一套语义（淡化底 + 主色字），与本案「饱和底上白字」不是同一缺陷。若后续要统一降格口径，须单独取证再改。
- QM-4 像素基线是否含禁用主按钮，本机不可判；以 CI 为准。
- `--color-text-muted` 对 `--color-bg-inset` 实测 2.65:1，因此禁用文字刻意取 `--color-text-secondary` 而非「更淡的那一档」。任何后来者把禁用文字改成 muted 都会被合同测出的对比度断言拦红。
