# Proposal: 接线**资格**必须被机械登记与核对（spec-mirror-wiring-gate）

## Why

本仓已有一条纪律：「任何路径要加进 `CI_IGNORED_PATHS`，它的校验必须先接线到**不被 docs-only 短路**的 job」
（`openspec/specs/ci-path-gating/spec.md`，先例 #2718/#2745/#3000）。但这条纪律**只写在文档里**，
没有任何判据在核对"接线住在哪个 job"——既有的 `scripts/check-unwired-tests.js` 只对整份 workflow 的
**可执行正文**做 `includes`，因此"接在 `static-gates`（整片被 `if: needs.changes.outputs.docs-only != 'true'`
门控）"与"接在 `changes`"在它眼里是同一件事。

这个缺口不是理论风险，是**本轮实测发生的事故**：归档 PR #3114 改动 `openspec/specs/**`（白名单内），
它把 vendored 契约镜像锁 `scripts/quality-rhythm-spec-mirror.test.js` 判红了，而 PR 侧现场是
`QG Changes=pass` / `QG Static=skipping` —— 那条锁**在纯文档 PR 上一次都没跑**，漂移于是合法地合进 main，
由 main push 才红（run 37716816985，step `Gate 2b`，`not ok 2 - 镜像不得自行发明或漏掉 Requirement`），
并当场卡住当时所有 open PR 的 `QG Static`。

不加会怎样：同一条纪律继续靠"记得"执行。而"记得"在本仓已经被证伪过一次——正是我自己没记得，
才让 #3114 带着红合并。下一次漂移不需要新原因，只需要又一个会话没读到这段文档。

## What Changes

- `scripts/quality-rhythm-spec-mirror.test.js`：新增**自接线结构锁**（本锁必须被点名在至少一个
  无 job 级 `if:` 的 job 里）与**依赖面锁**（`requires` 只能是 node 内置模块 —— `changes` job 不装依赖）。
  5 条 → **7 条**。
- `.github/workflows/quality-gate.yml`：新增 **Gate 2b2 - Spec mirror contract (changes job)**，
  紧跟 Gate 12d（同属"不被 docs-only 短路"的执行面）。
- `scripts/check-unwired-tests.js`：把"接线住在哪"升格为**机械登记表** `MUST_LIVE_IN_UNGATED_JOB`
  （path → 原因 + 销账条件，只能缩小），新增 `listJobBlocks()` 按 job 解析 `if:` 归属、
  `collectUngatedCheck()` 产出 `TEST_ONLY_IN_SKIPPABLE_JOB` / `UNGATED_WIRING_ACK_STALE` 两类红。
  12 条测试 → **20 条**（含 6 条夹具锁 + 1 条真实仓库棘轮 + 1 条解析退化锁）。

**刻意不做**：不引入"从测试源码正则提取路径字面量、与白名单求交"的自动判据。实测理由：同一轮做两遍清点，
第一遍按字面量得 6 条可疑，逐条核到"是否真的用 `fs` 读到了仓库内那个文件"后只剩 1 条 —— 其余 5 条全是
夹具里编出来的假路径。启发式硬红会一次引入 5 个假阳，那种门禁的结局是逼人把登记表清空，比没有更糟。
所以口径是：**新增登记由人做，登记的正确性由本判据锁**。

## Impact

- 分层：改动 `.github/workflows/` 与 `scripts/` 判据本体 ⇒ **混合 PR**，走完整质量节拍（非 docs-only）。
- 受影响的既有契约：`ci-path-gating` 的"进白名单前提锁"从**文档纪律**变成**可执行判据**（本 change 的 spec delta）。
- 回滚面：两个文件（`quality-gate.yml` 的 Gate 2b2 整块 + `check-unwired-tests.js` 的登记表与新函数）
  单独 revert 即可，无数据迁移、无运行时代码改动。
- 范围收口：登记表**只**登记已实测命中白名单输入的那 1 条锁；其余"看起来同类"的候选逐个核过后不登记，
  避免把假阳写进棘轮。
