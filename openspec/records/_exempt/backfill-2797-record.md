---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2797-record
reason: 本 PR 只做一项收尾——把 #2797 的执行记录 openspec/records/fix-electron-dist-banner-attribution.md 的「远程同步」行由 PENDING 回填为 PASS，并删除该文件 frontmatter 的三个 sync_* 登记项（销账动作本身）。没有行为变更，也没有新的门禁需要自检；为一次销账再写一篇执行记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 1 个记录文件的**行内改写 + 删三行登记项** + 本豁免文件，共 2 个文件。
- 回填证据一律可离线重跑，非凭记忆：
  - merge SHA 与时间取 `git log origin/main --grep='(#2797)$' --format=%H|%cI` → `d7fe9f2c8c9594dd2abc0a6e039f1cb6a4135e30 | 2026-10-02T22:44:03Z`；
  - 远端分支删除取 `git ls-remote --heads origin fix-electron-dist-banner-attribution` → **0 行**（同一次取证对 `main` 的正控返回 1 行 ⇒ "0 行"是分支确已删除，不是命令失败被当成空集）；
  - PR 侧 CI 取合并当刻 `gh pr view 2797 --json statusCheckRollup` → **20 SUCCESS / 1 SKIPPED / 0 红**；
  - 关联单 #2794 的自动关闭取 `state=CLOSED stateReason=COMPLETED closedAt=2026-10-02T22:44:05Z`（与合并同一秒）。
- **本 PR 真正的增量是把 #2794 的验收判据跑完了**：合并后 main push run `37074056115`（`completed/success`）里四个跑桌面测试的作业逐个下日志、剥 ANSI、按 `##[group]` 边界归因，
  `Downloading Electron binary` 命中数为 `QG Coverage 0 / QG Unit Tests 0 / Shards 1/2 0 / Shards 2/2 0`，测试步骤段内合计 **0 条**（修复前每作业 1 条、覆盖作业合并前 2 条）。
  探针自证写在被回填的那一行的同一格子里（每个作业都报出 `groups=19/35/19/19` 与 7.1–7.7MB 日志字节数），
  因为"0 命中"最容易的假绿来源就是日志根本没取到 —— `gh api` 取作业日志**必须带 `--allow-escape-sequences`**，
  否则 gh 对含 ANSI 的响应会拒答并落 0 字节，而 rc 仍然是 0。
- 行尾纪律：该记录文件在检出后是**全 CRLF**（61 个 CR，LF-only 0）。回填按 Buffer 精确子串替换，
  脚本对每个编辑点断言"CRLF 守恒或整行删除"、对文件级断言 CR 总增量恰为 **-3**（只等于删掉的三个 CRLF 整行）
  且**改写后 LF-only 行仍为 0**；两口径对账 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 同为 `1 4`。
- 销账耦合本次由门禁自己把过一遍关：删掉三个登记项却还没改状态行的中间态，`check-gate-record-debt` 当场报
  `❌ 未登记的欠账 1 条 …（缺登记字段）` rc=1；改完 PASS 后回到 rc=0。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数（当前被消费的另有 1 篇 `backfill-2793-record`，
  合计 2 篇，未达阈值 3），累计到阈值时由下一个会话删除本文件放行。
