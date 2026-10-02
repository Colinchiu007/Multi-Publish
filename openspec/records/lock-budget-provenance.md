---
record: lock-budget-provenance
task: Windows 锁夹具的三段等待预算从"注释里说秒级"升级为可重跑的 CI 分布回归检查（provenance 常量 + 每次 push 的活体台账 + 仓库内复测入口）
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（回填时把上面这行远程同步改成 PASS，并整段删除 sync_status / sync_reason / sync_backfill_owner 三个字段——漏删会报「已回填却仍留登记字段」）
---

## 本次执行记录：锁预算取值来源落成 CI 分布回归检查（lock-budget-provenance，2026-10-02）

> 分支：`lock-budget-provenance`；worktree：`D:/Data/projects/mp-worktrees/mp-lock-budget-provenance`（建时基线 `origin/main` = `ae5134f7`）
> 范围：🔧 测试基建 + 流程层 —— `test-helpers/windows-file-lock.js`（导出 provenance 与握手台账）、`apps/desktop/electron/services/windows-file-lock.test.js`（+3 条断言）、新增 `scripts/lock-timing-audit.js`（复测入口）、`docs/windows-lock-budget-provenance.md`（机制说明，兼作 doc-gate 的文档证据）、`AGENTS.md`（并一条 MUST）、`.gitignore`（放行新脚本）
> 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false**（含 `test-helpers/` 与测试文件）⇒ 完整质量节拍，不走 docs-only 快速通道

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 独立 worktree + 裸分支（`git worktree add` 走 PowerShell 原生 `D:` 路径；正规入口 `start-mp-task.ps1` 本轮被一个他人 worktree 卡住健康检查，未代他人清理，按既有先例改用原生入口并三连实证 `--show-toplevel` / 分支名 / HEAD）。依赖就绪：`pnpm install --frozen-lockfile` + `ensure-electron.js` + `verify-worktree-deps.js`。共享根 `main` 全程 clean、未落盘任何运行时文件 |
| 第一性原因（QM-5 ①） | PASS | 预算值 45000/12000/20000 唯一的"出处"是注释里"PowerShell 冷启动是秒级"这类**未实测断言**；#2489 那次真故障（ready=21090ms）被读成"锁没拿到"，正是因为启动相位与持锁相位共用一个预算、且没人知道该给多大 |
| 逃逸分析（QM-5 ②） | PASS | 单元层当时只锁"分相位报错"，**没有任何东西在看预算取值本身**，也没有东西在看"复测路径还成不成立" ⇒ 注释可被随手改写、常量可被随手收紧，CI 一律无感。活体检查若用 mock 样本还会恒真（同文件「标记不等于效果」那条正是靠假子进程跑） |
| 系统性漏洞（QM-5 ③） | PASS | 属「测试质量不足 + 流程缺失」：环境开销型预算没有分布来源、也没有可重跑的采集入口；采集入口的**坐标本身**（服务端过滤 / 分页 / status 字段 / ANSI / 代理）会漂移而无人检测 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① `LOCK_BUDGET_PROVENANCE`（max=12762 / samples=410 / runs=26 / jobs=41 / ×2 / 2026-10-02，数字由现脚本现场跑出，非记忆）+ 断言 `预算 ≥ max×2` 与样本量下限；② 真握手入进程内台账（`options.spawnImpl` 的假跑**一律不记**）+ 活体断言"本次有样本 / readyMs>0 / 不贴脸逼近预算（<90%）"；③ `scripts/lock-timing-audit.js` 复测入口，rc=3 零样本出声、rc=4 预算过紧。TDD：三条断言先写先红（3 failed / 18 passed）再实现；本轮追加"采集坐标"结构锁时也先观察到 1 failed / 20 passed 再改脚本 |
| 防止再次发生（QM-5 ⑤） | PASS | AGENTS.md「等待预算按相位拆分」那条 MUST 下新增子条（provenance 导出 + 台账 + 复测入口三条，及不对称纪律"重测更低不构成收紧理由"）；结构锁把"复测脚本必须存在且输出字段与 provenance 逐字段对齐"钉成 CI 断言；机制说明落 `docs/windows-lock-budget-provenance.md` |
| 反证（每条都实跑，要求 rc≠0 **且** cause-match） | PASS | 10/10，`restore=IDENTICAL` 10/10：P1 预算收到 <max×2 / P2 样本量降到 10 / P3 runs 降到 1 / P4 复测脚本被摘掉 / P5 台账恒空 / P6 mock 假样本混入台账 / P7 启动相位退化到贴脸（以上 7 条 `rc=1 failed=1 cause_hit=true`）；P8 `--max-ready=999999` ⇒ rc=4 `BUDGET_TOO_TIGHT`；P9 坏 repo 坐标 ⇒ rc=3 `NO_SAMPLES`（**这一条是本轮把它从"抛裸栈 rc=1"并进零样本出口之后才成立的**）；P10 现场复测 `--runs=4 --json` ⇒ rc=0 且字段齐。驱动自身的两个缺陷一并记：① 期望值原先硬编码 `45000/400/26`，改出处常量后 P1–P3 会静默失去读者 ⇒ 改为从 provenance 推导；② 唯一命中判据我写成 `split(命中).length-1 !== 2`，把"唯一"判成"多处"⇒ 三条当场假红（守卫没错，期望式写窄了） |
| 采集坐标漂移（本轮实测抓到的新坑） | PASS（已修） | `--runs=26` 一度"跑得通、零样本"。根因：GitHub 的 workflow run 列表**一旦带服务端 `event` / `status` 查询参数，本仓返回的是被静默截断到 2026-09-15 之前的窗口**（`total_count` 2000+ → 1372），那个窗口里还没有本夹具。修法：过滤移到客户端（`event === 'push' && head_branch === 'main' && status === 'completed'`）+ 翻页（最近 100 条 run 里约 9 条是 main push）。这条之所以值钱：零样本若非 fail-closed，我会拿"脚本报了个 max"当成复测通过 |
| 行尾与 diff 对账 | PASS | `AGENTS.md` 走定点插入脚本：起始态实测 crlf=1012 / bareLF=0 / loneCR=0 / NUL=0，插入后三项**逐项相等**、CRLF 增量恰等于插入行数，两口径 `git diff --numstat` 均为 `3 0`（删除数 0）。`.gitignore` 同样两口径对账。本 PR **不碰** `CHANGELOG.md` / `01-docs/learnings.md`（含 NUL 的 binary blob，置顶即抢行）——代价与理由见"遗留" |
| 接线棘轮 | PASS | 新增断言落在**已被 CI 收集**的 `windows-file-lock.test.js`（vitest workspace `apps/desktop`，`QG Desktop Shards` 跑全量），未新增测试文件 ⇒ `node scripts/check-unwired-tests.js` 无新账；`scripts/lock-timing-audit.js` 不是测试文件但按 `.gitignore:106` 陷阱补了 `!scripts/lock-timing-audit.js`，并用 `git add -n` 证明可入库（`git check-ignore` 对 negation 的退出码不可信，不作为判据） |
| 消费方回归 | PASS | 夹具的四个调用点全跑：`windows-file-lock.test.js` + `credential-store.test.js` + `account-state-restorer.test.js` = **44 passed**（`cd apps/desktop` 口径）；`packages/api-publish-engine/test/api-key-manager-atomic-write.test.js` 单独 `node --test` **1 passed**，现场留痕 `ready=197ms locked=201ms verify=ok`。⚠️ 记一条测量教训：同一批文件改用 `vitest --root apps/desktop`（cwd 落在仓库根）时，那条"每个调用夹具的文件必须引用 `LOCK_CASE_TIMEOUT_MS`"的扫描式守卫会**假红**——它按 cwd 解析路径。判据以 CI 实际采用的 `cd apps/desktop` 跑法为准，跨 cwd 复现差异属该守卫自身的接缝，已写进"遗留" |
| 本地门禁 | PASS | `check-debt-budget`（全指标在基线内）/ `check-unwired-tests`（53 个测试文件全接线）/ `check-step-failfast`（4 个多测试步骤均 fail-fast）/ `check-no-brand-residue`（6588 个 tracked 文件，无品牌残留）/ `check-gate-record-debt` / `.github/scripts/check-max-lines` —— 逐条输出见 PR 说明 |
| QM-1 打包 | ➖ N/A | 未触 `apps/desktop/electron/**` 生产代码与 `packages/rpa-engine/**`；改动是测试夹具 + 测试文件 + 仓库工具脚本 + 文档 |
| QM-4 视觉 | ➖ N/A | 无 UI 面改动；CI `QG Visual` 仍会全量代跑作对照 |
| QM-6 CCG 双模型外部评审 | PENDING（执行中） | 后端 `codex` / 前端 `claude`（真源 `~/.claude/.ccg/config.toml` 的 `[routing.*].primary`）经 `codeagent-wrapper` 并行审查本 diff。上一轮（#2731，2026-10-01）实测两路均不可用（codex 走 CC Switch `/responses` 404、claude 429 rpm 耗尽），当时按"如实记 PENDING + 贴一手错误"处理，不以自审冒充通过；本轮结果与发现项见下方"第二轮"小节，跑通与否都写现场 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin lock-budget-provenance` 返回 0 行证远端分支已删；回填后**整段删除**上方三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- **CHANGELOG 条目本轮暂缺**：该 blob 含 NUL、按字节存，置顶插入等于和所有并发会话抢同一行（同内容只碰 `docs/` 的先例是 0 轮撞车，碰三件套的是 6–8 轮）。理由与本条延期由后续回填型 docs PR 按 main 实际内容统一补；**延期 ≠ 丢弃**，不得因为"CI 太慢"就不写这个代价。
- **扫描式守卫对 cwd 敏感**：`LOCK_CASE_TIMEOUT_MS` 接线守卫按 `process.cwd()` 解析路径，在仓库根 cwd 下会误报"存在未引用的调用点"。本 PR 未顺手改它（改动属独立面），但它是一颗已知的、可复现的假红种子——下次有人换跑法先怀疑这条。
- **活体检查只在 Windows 有意义**：非 win32 走 `SKIPPED` 出声分支（不静默 pass），Linux runner 上这条不产生观测值，预算分布的真源仍是 CI 的 Windows 作业日志。
- `lock-timing-audit.js` 依赖 `gh` 登录态且**只能在 run 结束后**取日志，因此不进 CI；它坏了不会被任何门禁当场抓住，唯一防线是那条"脚本必须存在 + 字段对齐"的结构锁与 P4/P9 两条反证。
