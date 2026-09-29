## 1. 先把 Bug 钉成可执行的回归锁（红）

- [x] 1.1 在 `apps/desktop/electron/services/api-usage-governor.test.js` 新增「requests 窗口并发不超支」：`vi.useFakeTimers()` + `Promise.all` 提交 `limit+4` 个请求，`maxConcurrent=4`、`limit=3`；在 task 体内自增一个 `executed` 计数，断言 `executed === limit` 且 `resolve === limit`、`QUOTA_EXCEEDED === 4`
- [x] 1.2 同文件新增「并发结果确定性」：同参数连续跑 8 轮（每轮新建独立 governor 实例），断言 8 轮的 `executed/resolve/rejected` 三个数逐轮相等（当前实现下 `executed` 在 5~6 间漂，必须能抓到）
- [x] 1.3 同文件新增「失败的调用归还额度」：limit=L，放行一次调用但让它抛错，断言后续仍可累计到 L 次**成功**
- [x] 1.4 同文件新增「429 重试不重复占用」：一次 `run()` 先 429 后成功，断言窗口只 +1
- [x] 1.5 同文件新增「窗口换代不污染新窗口」：预留后强制窗口过期重置，再触发归还，断言新窗口计数不为负且不被抹掉
- [x] 1.6 同文件新增「token 类窗口仍走事后记账」：`field: 'total_tokens'` 时准入不预扣，超限仍在事后拒（守住 D6 的另一半，防止把 requests 的处理顺手扩到 token 窗口）
- [x] 1.7 实跑并记录：1.1/1.2/1.4/1.5 必须在改实现**之前**为红，1.3/1.6 可绿；把每条的红/绿与失败消息原文写进 `.quality-gates.md` 执行记录

## 2. 实现准入即占额度

- [x] 2.1 把 `_preflightTokenBudget` 改为原子 `_reserveTokenBudget`：对每个未过期的 `requests` 窗口 `used >= limit` 即抛 `QUOTA_EXCEEDED`，否则 `used += 1` 并返回预留凭据（含 `startedAt` 代次）
- [x] 2.2 预扣点上移到并发槽内、`_executeWithRetry` 之前（D1），确保一次调用只预留一次、重试循环在其之下
- [x] 2.3 `_runWithGovernance` 用 `try/catch` 包住执行：最终抛错时归还预留再原样 rethrow（D2），归还对**任何**最终错误生效，不按错误分类挑选
- [x] 2.4 归还写成恰好一次（D3）：成功不归还、失败归还一次；禁止 `finally` 无条件归还
- [x] 2.5 归还按代次生效（D4）：`win.startedAt` 与预留凭据不一致则跳过
- [x] 2.6 `_recordUsage` 对 `requests` 字段不再 `+1`，但保留窗口滚动重置逻辑；非 `requests` 字段维持 `+= delta`（D5）
- [x] 2.7 `_assertTokenBudget` 显式跳过 `requests` 窗口，并就地注释「保留即重新引入已执行+事后拒」（D6）
- [x] 2.8 重入透传路径确认不预扣、不记账（`_reentrant` 早退分支不动）

## 3. 自检可观测性收口

- [x] 3.1 `rate-limit-self-check.js` 在 catch 里补 `{state:'quota_exceeded', started_at:null}` 时间线条目，使 `completed + quota_exceeded === requestCount` 成立（D7）
- [x] 3.2 `rate-limit-self-check.test.js` 补一条守恒断言，并把既有「5h 额度由真实 governor 预检拒绝」用例改为**并发构造 + 假时钟**，使其不再依赖墙钟（这正是它在 CI 满载下随机红的直接原因）
- [x] 3.3 核对 `_buildAssertions` 的 `quota_at_limit_plus_1` 期望在新口径下含义不变（`n - L`），若时间线新增条目影响其它断言则一并修正

## 4. 验证与反证

- [x] 4.1 跑 `api-usage-governor.test.js` 全量：1.1–1.6 全绿，且既有串行额度用例、两条重入用例、W2/W3 用例全部保持绿
- [x] 4.2 跑 `rate-limit-self-check.test.js` 全量
- [x] 4.3 反证 A：把归还改成 no-op → 1.3 必须红；反证 B：把预扣退回只读预检 → 1.1/1.2 必须红；反证 C：让 `_recordUsage` 对 requests 也 +1 → 必须红（双重计数）；反证 D：删掉代次校验 → 1.5 必须红。四条都要实跑并记录变红的**用例名**
- [x] 4.4 结构锁：断言 `_assertTokenBudget` 不对 `field==='requests'` 生效（防 D6 被回退）
- [x] 4.5 用 `D:/tmp/repro-quota2.js` 同参矩阵（mc=1/2/4，limit=2/3）在实现后再跑一遍，确认 `executed <= limit` 恒成立且零方差；把数字写进执行记录
- [x] 4.6 消费方回归：`model-call-scheduler`、图片轮播/生成链相关 suites 全量；确认没有用例依赖「并发下多跑几次」的旧行为
- [x] 4.7 QM-1 打包验证（改动在 `apps/desktop/electron/`）：`pnpm run build:dir` + asar 清单 + require 链 + 启动 8s 无 stderr

## 5. 评审与文档

- [x] 5.1 QM-6 双模型外部评审（模型名从 `~/.claude/.ccg/config.toml` 的 `[routing]` 读，不照抄 AGENTS.md），Critical 修完、Warning 逐条处置
- [x] 5.2 `01-docs/learnings.md` 记录逃逸链：既有额度测试为何全是串行、`completed` 与 `quota_exceeded` 同时偏高为何不可归因、以及「把 flaky 测试改成假时钟」如何险些把 Bug 钉成契约
- [x] 5.3 `CHANGELOG.md` 与 `.quality-gates.md` 执行记录（含复现矩阵数字、四条反证的变红用例名）
- [x] 5.4 已同步并归档：`npx openspec archive governor-quota-reserve --yes` ⇒ `story2video/model-call-scheduler` 与 `ops-center/rate-limit-verifier` 各 `~1 modified`（`Totals: +0 ~2 -0`），主 spec 现含「准入即占额度」「requests 窗口并发不超支」「失败的调用归还额度」「窗口换代不得污染新窗口」「5h 额度预检在并发下同样成立」；change 落 `archive/2026-09-29-governor-quota-reserve`。跑 CLI 前先 grep 确认主 spec 确实未同步（新短语 0 命中），避免对手工已同步的规格再跑一遍。PR #2566 描述已声明「并发维度不由运营后台的 Python 模拟器覆盖」（它是单线程顺序模型，本就满足新语义），实测在 body 第 81/83 行

## 6. 交付

- [x] 6.1 已交付：PR #2566（分支 `governor-quota-reserve`，worktree `mp-governor-quota-reserve`）。提交前 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐项一致，并逐字节扫描孤立 CR —— 本轮实测过一次 `\r\r\n` 把 governor 翻成 `i/-text`，numstat 报 462/462 而真实内容改动只有 7/51：**两口径对账对孤立 CR 失明**，必须补字节扫描
- [x] 6.2 auto-merge（SQUASH）挂着跑完；置顶文档冲突共 **9 轮**（最后一次 `CHANGELOG.md` / `.quality-gates.md` / `01-docs/learnings.md` 三份同轮相撞），每轮用 `resolve-merge-v8.mjs` 解：全文包含以 `origin/main` 为基准，HEAD 侧只强制「自己的新增行」（上游有权改写它继承来的行，否则会把别人的合法改写误报成丢失），并验 tail 为 HEAD 或 main 的内容域后缀 + 上游块首行恰好出现一次 + markers=0。放行判据由**独立校验器**（与解析器不同代码路径）对两条父提交各跑全文非空行多重集包含，各 0 丢失
- [x] 6.3 已回读证据，**置顶文档的回填已移出收口 PR**（改由后续 docs PR 落地）：回读结果为 `mergedAt=2026-09-28T16:36:48Z`、`mergeCommit=0f5c8ea2208ea52ee4e551627b3b93bc7e580c33`（`gh pr view` 与 `git log origin/main` 尾锚 `(#2566)` 两路同 SHA 与时间）、`git ls-remote --heads origin governor-quota-reserve` 返回 0 行证远端分支已删；main 上该 merge 实含 14 个文件。**为什么把 `.quality-gates.md` 的回填行挪走**：本收口 PR 第 4 轮合并 main 时三份置顶文档全冲突，每解一轮要重烧约 20 分钟全量 CI；而 #2589 同一轮已按同一策略把置顶改动移出代码 PR。挪走后的好处是"回填时 PR 已合并 ⇒ `远程同步` 行可直写 PASS"，不需要 PENDING、也不需要往 `gate-record-debt-ledger.json` 加一条留给下一个会话销的欠账。**留给后续 docs PR 的清单**：① 给 governor-quota-reserve 那条执行记录补 `| 远程同步 | PASS |…|` 行（该记录此前整条缺失这一行）；② `CHANGELOG.md` 的收口条目；③ 与 #2589 的回填同批做，避免再撞一轮。

## 7. 门禁驱动的新增工作（CI 首轮红之后补记，非原计划）

- [x] 7.1 取 CI job 日志定位真因：聚合债务指标在 CI 也 PASS，红在同一步后续的 `check-max-lines.js`（`NEW_OVER_LIMIT: api-usage-governor.js 508 行`）。本机只跑了 `check-debt-budget.js` 就宣布"债务 PASS"是漏检——同一 step 串多条命令时必须逐条自跑
- [x] 7.2 按门禁指示拆分：`token-budget-windows.js`（准入/归还/超额错误），governor 留薄委托；承载原因的注释随代码搬走
- [x] 7.3 结构锁跨两文件重布线（7 个锚点），并新增「governor 侧只准薄委托」断言
- [x] 7.4 拆分后重跑反证 F（把**模块**里的准入退回单遍）：恰好红 2 条，还原 md5 一致
- [x] 7.5 行数与债务双门禁转绿（462 < 500；超限文件 98 = 挂账 98）
- [x] 7.6 QM-1 重打包：必须验证**新文件进了 asar**（`files` glob 覆盖正是这条门禁的存在理由），并复跑 require 链与 8s 启动
