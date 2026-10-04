---
record: evaluate-deps-inline-electron
task: #33 评估 apps/desktop/vitest.config.js 的 deps.inline:['electron'] 是否仍必要（并纠正 #2797 留下的"摘掉它就能根治 #2794"推测）
date: 2026-10-04
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：deps.inline:['electron'] 评估——不摘，且"摘了能根治"被实测否证（evaluate-deps-inline-electron，2026-10-04）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 结论本身是**评估**，落盘物是文档（`docs/deps-inline-electron-evaluation.md` 新增 + `docs/blanket-fs-mock-ratchet.md` 两处更正 + `scripts/check-blanket-fs-mock.js` 头部**注释**同源更正，零行为改动）。独立 worktree `D:/Data/projects/mp-worktrees/mp-evaluate-deps-inline-electron` + 裸分支 `evaluate-deps-inline-electron`（`start-mp-task.ps1`，起点 `e5a3028a2`，评估期 main 前进后 `git merge --ff-only origin/main` 到 `c471aa51c`，`origin/main..HEAD` 计数 0 表明无分叉）。实验改过的那一行配置**已复原**并被证明与 main 逐字相同：`git diff --exit-code origin/main -- apps/desktop/vitest.config.js` ⇒ `vitest.config.js 与 main 逐字相同`。 |
| 第一性原因（QM-5 ①） | PASS | 引入点不是代码而是**一句没被实测过的推测**：`#2797` 的执行记录把"摘 `deps.inline` 后 banner 根本不会进该 realm 的 logs"当作前提写进「遗留」（`openspec/records/fix-electron-dist-banner-attribution.md`），随后被 `docs/blanket-fs-mock-ratchet.md`（#2864 落地）当事实复述成"摘掉它会让这条链从根上消失"。**没有任何一次 A/B 跑过这句话**。 |
| 逃逸分析（QM-5 ②） | PASS | 单元/集成层：全仓没有一条用例断言"electron 是否在该 realm 执行"，所以配置换了它也不会红；审查层：#2864 的 QM-6 两路评审都聚焦判据本身，没人核 §1 那句因果；文档层：错误推测在两份文档间**互相引用为据**（记录 ⇒ 文档 ⇒ 又回指记录），形成"看起来已被验证"的假象——这正是本仓「别把机制推断冒充实测」点名的形态。 |
| 系统性漏洞定位（QM-5 ③） | PASS | 具体落点：`docs/blanket-fs-mock-ratchet.md` §1 与 §8、`scripts/check-blanket-fs-mock.js` 头部注释三处复述同一句因果，而验证它所需的实验成本是**两分钟**（同一支临时探针跑两种配置、读同一行 `[AB]` 输出）。缺的不是能力，是"结论必须由实测支撑"这条在**跨文档复述**时的执行点。 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①实测：同一支探针（blanket 谎报 `fs` + 不启用 electron mock + `require('electron')`）在 `inline:['electron','axios']` 与 `inline:['axios']` 两种配置下**都打印** `Downloading Electron binary…` 并抛出**逐字相同**的 `Electron failed to install correctly…` ⇒ 真 `index.js` 进不进 realm **不由该开关决定**；②规模判据：桌面全量 `vitest run`（736 文件 / 13492 例）在摘掉 inline 后 = `1 failed / 734 passed / 1 skipped`，与保留时同一格红（既知的 `feedback.test.js` Windows symlink `EPERM`）⇒ 摘它**既不解决问题也不带来收益**；③三条模块身份探针（`vi.doMock` 后的 `app` 可见性 / 未 mock 时 `import('electron')` 的形状 / `__registerMock('electron',…)` 是否命中）两配置**输出逐项相同**；④结论落盘为 `docs/deps-inline-electron-evaluation.md`（含可重跑命令），三处复述该推测的文本改为实测结论并指回本文。 |
| 防止再次发生（QM-5 ⑤） | PASS | ①`docs/blanket-fs-mock-ratchet.md` §1/§8 与门禁头部注释三处同源改写（不留"改配置就有退路"的错觉）；②评估方法写成可重跑三条命令（§2），后人再提"摘 inline 治谎报"两分钟即可否掉；③历史事实快照**不改写**：`#2797` 那条记录保留原文，由新文档指认其因果方向已被否证（记忆纪律：追加最新锚点声明现状，不覆写历史）；④CHANGELOG 收口 + 本条记录。 |
| 反证（评估类交付的对应物） | PASS | 判"探针是否真的在测量"用了两条：**同一探针在两配置同字输出**（若探针恒真，两种配置也应恒真——但它同时能报出现场的 `Downloading Electron binary…`，说明它确实走到了下载分支，不是在打印固定文案）；**探针跑完即删**（`zz-probe-deps-inline.test.js` / `zz-ab-inline.test.js` 不入库），`git status --porcelain` 在删除后为空 ⇒ 不留两条永不自证的"气候探针"在仓库里。另记一次自伤：评估期把 `.bak` 留在工作树里（`?? apps/desktop/vitest.config.js.bak`），收口时连同探针一起清掉，`git diff --exit-code origin/main` 才敢声称复原。 |
| 行尾与 diff 对账 | PASS | 新建两份 md 由 Write 落盘（LF）；`docs/blanket-fs-mock-ratchet.md`、`scripts/check-blanket-fs-mock.js` 为**行内单行 Edit**（两文件工作树实测 LF blob ⇒ 不存在 CRLF 翻转风险）。提交前逐文件对账 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat`，两口径必须逐项相等。 |
| 消费者并集 | PASS | 改的 `scripts/check-blanket-fs-mock.js` **只动头部注释**，行为不变 ⇒ 跑它的全部消费者：`node --test scripts/check-blanket-fs-mock.test.js`（21 例）、`node scripts/check-blanket-fs-mock.js`（真实仓库现场）、`check-unwired-tests`（它点名了这两个文件）、`check-gate-record-debt`（新增记录文件必须带登记字段）、`check-no-brand-residue`（新增文档最容易踩品牌词）、`.github/scripts/check-max-lines.js`（新文件行数）。桌面侧无消费者：`vitest.config.js` 未被本次改动。 |
| 接线棘轮 | PASS | 本 PR 不新增测试文件（两支临时探针刻意不入库），故 `check-unwired-tests` 检查域不变；新增 md 不需接线。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 运行时代码、未触渲染面；`vitest.config.js` 已复原为与 main 逐字相同（有 `git diff --exit-code` 证据）。 |
| QM-6 CCG 双模型外部评审 | 见下方 | 本 PR 无行为改动（文档 + 注释 + 新增文档），按 AGENTS.md「纯文档/流程变更不强制 QM-6，但建议执行」。仍跑了一路**规定通道**（`codeagent-wrapper --backend codex --lite`）专门攻击本文结论，因为它否证的是**别人写进 main 的因果句**，错了会带走一条退路。 |

| 远程同步 | PENDING | 本 PR 自身尚未合并 ⇒ merge SHA / 合并时间 / 远端分支删除状态此刻都不存在（这正是 PENDING 的语义）。合并后由下一个会话按既有口径回填：`git log origin/main --grep='(#PR号)

（等 codex 那一路的 findings 文件落盘后填写；未落盘则如实记为"评审未产出"，不得以自审冒充。）

### 遗留（不假装已闭合）

- **`axios` 那一半没评估**：本次只判 `electron`。若要一起做，探针形状相同；但 `axios` 的 mock 面（渲染层 `vi.mock` vs 服务层注入）与 electron 不同形，不能套用本文结论。
- **这行当初为什么加**未查清（提交信息没写原因）。本文只证明"现在摘它无收益且会掩盖既有核对结论"，不证明"它从来没有作用"。
- **探针不入库 ⇒ 本文的两条实测无法在 CI 里复跑**。这是有意的：它们测的是配置差异而非产品行为。要复跑请照 §2 的三条命令，两分钟一次。
 --format=%H|%cI` 取 merge SHA 与时间、`git ls-remote --heads origin evaluate-deps-inline-electron` 返回 0 行证远端分支已删（同一条命令要带必然存在的分支当正控）；回填时**同一次**删除本记录 frontmatter 的三个 `sync_*` 字段（门禁要求两件事同次发生）。

### QM-6 发现项与逐条处置

（等 codex 那一路的 findings 文件落盘后填写；未落盘则如实记为"评审未产出"，不得以自审冒充。）

### 遗留（不假装已闭合）

- **`axios` 那一半没评估**：本次只判 `electron`。若要一起做，探针形状相同；但 `axios` 的 mock 面（渲染层 `vi.mock` vs 服务层注入）与 electron 不同形，不能套用本文结论。
- **这行当初为什么加**未查清（提交信息没写原因）。本文只证明"现在摘它无收益且会掩盖既有核对结论"，不证明"它从来没有作用"。
- **探针不入库 ⇒ 本文的两条实测无法在 CI 里复跑**。这是有意的：它们测的是配置差异而非产品行为。要复跑请照 §2 的三条命令，两分钟一次。
