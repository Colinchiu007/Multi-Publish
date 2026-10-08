# Tasks: spec-mirror-wiring-gate

## 1. 判据先行（TDD）

- [x] 1.1 `scripts/quality-rhythm-spec-mirror.test.js` 加两条自锁：
      ①「本锁必须被点名在至少一个无 job 级 `if:` 的 job 里」②「本锁的依赖面只能是 node 内置模块」
- [x] 1.2 实跑取 RED：接 Gate 2b2 **之前**跑该测试 ⇒ 第①条红（当时只有 `static-gates` 点名它）；
      接进 `changes` job 后 7 条全绿。这条是本 PR 的"修复前现场"，不是回忆。

## 2. 接线

- [x] 2.1 `.github/workflows/quality-gate.yml` 新增 **Gate 2b2 - Spec mirror contract (changes job)**，
      紧跟 Gate 12d，`shell: bash` 单条 `node --test`（块内只有 1 条测试命令，不触发 fail-fast 判据）
- [x] 2.2 核对该 job 不装依赖 ⇒ 锁的依赖面必须是 node 内置（`node:fs`/`node:path`/`node:test`/`node:module`）

## 3. 把"接线住在哪"升格为机械登记表

- [x] 3.1 `scripts/check-unwired-tests.js` 新增 `MUST_LIVE_IN_UNGATED_JOB`（path → 原因 + **销账条件**）
- [x] 3.2 `listJobBlocks(root)`：按 job 解析，**只看缩进层级**判 job 级 `if:`（不看它相对 `steps:` 的位置）；
      一个 job 都没解析出来 / workflows 目录缺失 / 集合为空 ⇒ 一律抛错，禁止把"解析退化"读成"无需核对"
- [x] 3.3 `collectUngatedCheck(files, registry, jobs)`：产出 `TEST_ONLY_IN_SKIPPABLE_JOB`（只住在可跳过 job）
      与 `UNGATED_WIRING_ACK_STALE`（登记项指向不存在的文件）；`where` 必须点名是哪几个 job
- [x] 3.4 `collectCheck` 的登记表参数默认 `{}`（夹具不受影响），`run()` 传真登记表；失败文案给**正解方向**
      （"把点名补进 changes job，而不是把登记删掉"）

## 4. 回归锁（`scripts/check-unwired-tests.test.js` 12 → 20 条）

- [x] 4.1 只住在被 job 级 `if:` 门控的 job ⇒ 红（含 `where` 精确等于 `gate.yml::static-gates(gated)`）
- [x] 4.2 同一条锁接进无 job 级 `if:` 的 job ⇒ 绿（上一条的正控，两条必须成对存在）
- [x] 4.3 step 级 `if:`（6/8 空格）不得被当成 job 级门控 —— 方向是**假红**，假红的结局是逼人清空登记表
- [x] 4.4 job 级 `if:` 写在 `steps:` **之后**仍算整片门控（按缩进判）—— 方向是**假绿**，由反证 W3 逼出来
- [x] 4.5 注释里的点名不构成接线资格
- [x] 4.6 登记项指向不存在的文件 ⇒ 判过时（不许留死登记，也不许靠删文件逃避）
- [x] 4.7 job 解析退化必须抛错
- [x] 4.8 真实仓库棘轮：`jobs >= 20`、`ungated >= 8`（2026-10-08 实测 26 / 14 gated / 12 ungated）、
      登记表 `deepEqual` 恰好等于当前一条、登记原因必须含"销账"、该锁的承载 job 必须是**不被门控的 `changes`**

## 5. 反证（每条实跑，收尾断言逐字节还原）

- [x] 5.1 W1 `collectUngatedCheck` 恒判合规 ⇒ 红 4 条 ⇒ PASS
- [x] 5.2 W2 摘掉 job 级 `if:` 判据 ⇒ 红 2 条 ⇒ PASS
- [x] 5.3 W3 缩进判据放宽到任意层级 ⇒ 红 2 条 ⇒ PASS
      —— **首版 W3 写的是"去掉 `!cur.sawSteps`"，实跑 `NOT_RED`**：那条守卫对 step 级 `if:` 本来就是冗余的
      （`if:` 在 6/8 空格，`^    if:` 不可能命中），所以变异没有实现所称的危害。
      追查后暴露**真洞在反方向**：按位置判会漏掉"`if:` 写在 `steps:` 之后"的 job 级门控（假绿）。
      正解＝删掉 `sawSteps`、只按缩进判，并补 4.4 这条锁 + 把 W3 换成能真正产出所称危害的注入。
- [x] 5.4 W9 退回位置判据 ⇒ 红 1 条（4.4 那条锁）⇒ PASS
- [x] 5.5 W4 job 正文不再剥注释 ⇒ 红 1 条 ⇒ PASS
- [x] 5.6 W5 stale 出口删掉 ⇒ 红 1 条 ⇒ PASS
- [x] 5.7 W6 解析退化改 `return []` ⇒ 红 1 条 ⇒ PASS
- [x] 5.8 W7 登记表清空 ⇒ 红 1 条（真实仓库棘轮）⇒ PASS
- [x] 5.9 W8 从 `changes` job 摘掉 Gate 2b2 点名 ⇒ 红 1 条 ⇒ PASS（这条才是"本锁守的真危害"）
- [x] 5.10 全部变异 `restored_byte_identical=true`，跑完 `git status --porcelain` 只剩本次真实改动文件

## 6. 交付

- [x] 6.1 `node scripts/check-unwired-tests.js` 在真实仓库：`检查域内测试文件 67 个 / OK`
- [ ] 6.2 QM-6 双模型外部评审（混合 PR + 改门禁判据本体），发现逐条处置并落盘原件
- [ ] 6.3 PR → CI 全绿 → 按 AGENTS.md 判据自动 squash 合并 → 同一次提交回填远程同步并删 `sync_*`
- [ ] 6.4 归档本 change；归档产出的主规格 Purpose 由 Gate 12d 看着（不得留 TBD）
