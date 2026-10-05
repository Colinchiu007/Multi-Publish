---
record: dep-audit-opscenter-domain
task: 把 ops-center/frontend 的 npm 锁纳入依赖审计门禁；给 upgrade-tracked 挂账加"可闭合"判据
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话，回填后必须删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取 git log origin/main --grep='(#NNNN)$' 的 merge SHA 与时间）
---

## 本次执行记录：依赖审计门禁补第三扫描域 + 挂账可闭合判据（dep-audit-opscenter-domain，2026-10-05）

> 一次 PR 做两件事是刻意的：两者都落在 `scripts/check-dep-audit.js` 这同一个模块上，拆开会让同一文件连撞两轮 re-sync 与两次 25–30 分钟 CI（上一轮 axios 就是被置顶件的 re-sync 拖了三轮）。两个判据各自有独立用例与独立反证，不存在"混在一起无法二分"。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（CI 门禁 + 数据文件） | worktree `D:/Data/projects/mp-worktrees/mp-dep-audit-opscenter-domain`，裸分支 `dep-audit-opscenter-domain`；`git worktree add` 后三连实证（toplevel / branch / head = base `441936b6d`）。依赖：`pnpm install --frozen-lockfile --ignore-scripts` rc=0（38.4s，全部走本地 store 硬链接），`node scripts/verify-worktree-deps.js` **rc=0 / 消费方解析通过 11 项** |
| 隔离核对时踩到的 rc 陷阱 | 已纠 | 第一次跑 `verify-worktree-deps.js` 我用 `... \| tail -4; echo rc=$?` —— 拿到的是 **tail 的 0**，而真实 rc=**1**（11 条 workspace 链接缺失，因为那时装依赖的指令发给了另一个 worktree）。改成重定向到文件再取 `$?` 才见到真值；真值不是"没问题"时，`tail` 的 rc 会让人直接把它写进记录当证据 |
| 第一性原因（①域缺失） | 实测 | `check-dep-audit.js` 的扫描域写死两个：npm = `pnpm audit --prod`（只覆盖 pnpm workspace，而 `pnpm-workspace.yaml` 只列 `apps/*`+`packages/*`）、pip = `ops-center/backend/requirements.txt`。`ops-center/frontend/package-lock.json` 由 npm 独立管理 ⇒ 两个域都不含它。上一轮 axios 收口时它就是被点名的遗留：既不被扫、也没有 workflow 装它，却以"看起来受门禁保护"的形态存在 |
| 第一性原因（③判据缺失） | 实测 | `evaluate()` 只判三件事（新公告 / 已不再命中 / decision+note+reviewBy 词表与到期），从不判「这笔 upgrade-tracked 的账能不能闭合」。axios 那轮的现场就是：12 条公告登记成 `upgrade-tracked`，而修复版 1.20.0 早在 2026-08-26 就发布了 |
| 逃逸分析（QM-5 ②） | 逐层 | 单元测试层：`check-dep-audit.test.js` 13 例全部注入两域假 runners ⇒ 「第三个域」在测试里**不可表示**，所以补域这件事既没有测试能证明、也没有测试会红。断言层：既有断言只查 `NEW_ADVISORY: npm/...` 前缀，没有一条在查"域集 = 清单集"。审查层：`--prod` 让门禁绿，而"绿"只等于"prod 域干净"——这正是上一轮写进记录的那句「审计绿 ≠ 修完」的第二落点 |
| 修复（①） | 已落地 | `DOMAINS = ['npm','npm-opscenter','pip']`；新 runner = `npm audit --omit=dev --json`，cwd 落在 `ops-center/frontend`；新解析器 `parseNpmAuditV2`（npm v2 形状与 pnpm 的 `advisories` 完全不同：顶层按**包名**聚合、公告在 `via[]`、GHSA 只在 `url` 里、`patched` 要从 range 上界反推）。独立 source 名是必须的：共用 `npm` 会让同一 GHSA 在两个域互相冒充"已登记"，且 `--update` 时后写的覆盖先写的 |
| 修复（③） | 已落地 | 判定 4 `DECISION_CONTRADICTS_PATCHED`：`decision=upgrade-tracked` 必须给 `targetVersion`，且该版本必须**逃出** `patched` 下界（逐段数值比较，不引第三方 semver —— 装它属越界）；`patched` 为空 ⇒ 直接判该 decision 不成立，应改判 `no-fix-available`；`patched` 形状解析不了 ⇒ **fail closed** 而不是放行。同场把 pnpm 的 `<0.0.0`（= 无修复版）归一成空串，否则它会被当成"有修复版可升" |
| 收紧（自造的第二处判据） | 已落地 | 域在 `DOMAINS` 里却取不到 runner ⇒ `DOMAIN_NOT_WIRED` **硬失败**（rc=1）。理由：`SCANNER_UNAVAILABLE` 的宽容保护的是离线/端点抖动（部署事实），而漏接一个域是代码事实；沿用告警口径会得到"覆盖面窄于声明还报绿"。用例显式断言这条**不得**与 `SCANNER_UNAVAILABLE` 混为一谈 |
| 基线迁移 | 24 条，逐条断言 | `scripts/dep-audit-baseline.json`：24 条 `upgrade-tracked` 补 `targetVersion` = patched 下界（`>=X.Y.Z` → `X.Y.Z`，不猜别的版本）；1 条 `no-fix-available`（pip/`PYSEC-2026-1325`）按规则跳过。脚本断言：只新增这一个键、其余键值逐条严格相等、顶层键序不变、round-trip 稳定、条数不变。diff = `24/0`（纯增行，零删除） |
| 真门禁实跑（绿） | ✅ | `node scripts/check-dep-audit.js` ⇒ `命中分布: npm=24 npm-opscenter=0 pip=0 命中=24 挂账=25` + `✅`。`npm-opscenter=0` 不是"没扫"：本机实测 `npm audit --json --omit=dev` 在 ops-center/frontend ⇒ **status=0 / 0 条**，而同一条命令去掉 `--omit=dev` ⇒ **status=1 / 3 包 12 公告**（undici×10 等，全在 vitest→@vitest/mocker→undici 这条 dev 链上）。取 `--omit=dev` 是为了与 pnpm 侧 `--prod` 同语义 |
| 反证 A（域接线） | 已实跑 | 把 `'npm-opscenter'` runner 改名 ⇒ 真门禁 **rc=1** 且输出 `DOMAIN_NOT_WIRED: 这些域在 DOMAINS 里却没有 runner ⇒ npm-opscenter`，同时 `SCANNER_UNAVAILABLE` 出现次数 **0**（两类出口可区分，没被降级成"扫描器抖动"）。变异脚本自带「文本真的变了」断言（bytes 21627→21632、`anchorStillPresent:false`），还原后**逐字节相同**且 `DOMAIN_NOT_WIRED` 仍在 |
| 反证 B（挂账判据） | 已实跑 | 把基线里 `js-yaml / GHSA-2883-xcg3-v3hh` 的 `targetVersion` 从 `4.3.2` 改成 `4.3.1` ⇒ 真门禁 **rc=1**：`❌ DECISION_CONTRADICTS_PATCHED: npm/GHSA-2883-xcg3-v3hh 的目标版本 4.3.1 低于修复下界 4.3.2 —— 升上去仍然命中该公告，这笔账永远闭不了`；基线按字节还原核对 |
| 反证的过程教训（当场踩到） | 已修 | 第一次做反证 A 时内联脚本自身语法报错，**文件根本没被改**，却得到 `no-runner 命中 0 行` —— 那是一次"反证没红"的假结论，真因是注入静默没发生（同族第四坑）。此后变异脚本必须先打印 `mutated:true / bytes 前后 / 锚点是否消失`。另一处自伤：用**收紧之前**的备份去还原变异文件，把已落地的 `DOMAIN_NOT_WIRED` 覆盖没了 —— 还原凭据必须与当前形态同源，已按幂等重放脚本恢复，并删掉重放产生的死代码块（`typeof run` 出现次数从 2 归 1） |
| 行尾与 diff 对账 | ✅（且当场抓到一处自造损坏） | 三个被改文件 doubleCR=0；`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐文件相等：gate `152/8`、test `132/2`、baseline `24/0`。**过程损坏已修**：追加用例时对已是 CRLF 的文本又跑了一遍 `replace(/\n/g,'\r\n')` ⇒ 253 行变成 `\r\r\n`，症状是 `node --test` 栈里报出 594 行而文件只有 379 行（V8 把孤立 `\r` 也算行终止符），已按 `\r\r\n→\r\n` 归一并用两口径对账复验 |
| 单元测试 | ✅ | `node --test scripts/check-dep-audit.test.js` = **21 tests / 21 pass / 0 fail**。新增 8 例：V2 形状解析、`<0.0.0` 归一、`DOMAINS ↔ createDefaultRunners` 一一对应（装配锁）、ops-center 新公告进判定、缺 runner 硬失败、`checkTargetEscapes` 判定表（低于下界/恰好命中/高于/缺字段/通配/patched 空/patched 不可解析）、`evaluate` 接线、入库基线自洽（含「非 upgrade-tracked 不得带 targetVersion」反向断言）。既有用例迁移 3 处 + 改名 1 处（"两个扫描器都不可用"→"全部扫描域都不可用"），迁移理由见上表「收紧」行 |
| 接线棘轮 | ✅ | 本 PR **不新增**测试文件（只扩 `scripts/check-dep-audit.test.js`），而它早已被 `.github/workflows/dep-audit.yml:55` 的 `node --test` 显式点名；`check-unwired-tests.js` 实跑 OK |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、未触 UI 文件；改动面 = 1 个门禁脚本 + 它的用例 + 1 个 JSON 数据文件 |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机 QM-6 通道本会话未验证（`gh` 在 Git Bash 下 rc=0 零输出；CC Switch :15721 存活未测）。**如实写「未执行」，不以自审冒充通过** |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填，`git ls-remote --heads origin dep-audit-opscenter-domain` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 遗留（不假装已闭合）
- **dev 域仍未纳入判定**：ops-center/frontend 去掉 `--omit=dev` 实测有 3 包 / 12 条公告（`undici <7.29.1` ×10、`@vitest/mocker`/`vitest` 的 `GHSA-82fw-gwwq-j7x9`，range `>=2.1.0 <4.1.11`）。本门禁与 pnpm 侧一样只看生产依赖，所以这些**当前不可见**。这是 axios 那轮「nx 自带低危 axios」的同族形态，只是换了域 —— 要不要把 dev 域收进来，需要单独决策（它会把 12 条一次性变成必须登记或修账的欠账）。
- **`undici` / `fast-uri` 的 override 仍是无上界 `>=`**（`pnpm-workspace.yaml:17-18`，任务 #34）：本 PR 没动它，判据面也没管它 —— `check-dep-audit` 看的是公告，不看 override 有没有上界。
- **`upgrade-tracked` 的更强判据没做**：真正能挡住 axios 那种"可修却挂着"的规则是「存在可用修复版 ⇒ 不允许挂账」。它会把当前 24 条一次性判红，等于要求同一 PR 修完 24 个依赖，超出范围。本 PR 落的是它的**必要子集**（账必须写明目标版本且该版本真能逃出区间），更强的那条需要独立排期，并逐条核实"为什么现在不修"的真实阻塞点 —— 我不能替那 24 条编造理由。
- `--update` 仍按"本轮真扫到的域"重建清单：三域下这条风险变大（少一个扫描器就会抹掉那个域的挂账），现由「任一扫描器不可用即拒绝写基线」挡住；写基线的口径改造属独立议题。
