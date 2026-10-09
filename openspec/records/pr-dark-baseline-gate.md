---
record: pr-dark-baseline-gate
task: 让暗色基线在 PR 侧可判（QG Visual 补产暗档渲染）并归零 main 上 8 张暗档漂移
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个动这些文档的会话（PR 号待 `gh pr list --repo Colinchiu007/Multi-Publish --head pr-dark-baseline-gate --json number,state,headRefOid` 回读取入，不得凭印象；合并后按 git log origin/main --grep='(#NNNN)$' --format=%H|%cI 取 merge SHA，回填本行并整段删除 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：暗档在 PR 侧可判 + 8 张暗档漂移归零（pr-dark-baseline-gate，2026-10-09）

- 变更类型与分层：`.github/workflows/**` + `scripts/**` + `apps/**` 基线工件 ⇒ 运行时代码级 ⇒ 隔离 worktree `mp-pr-dark-baseline-gate`（分支 `pr-dark-baseline-gate`）；`classify-docs-only` 必然 `docs-only=false`，走完整质量节拍
- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表
- 授权：改动 CI 门禁覆盖面，用户已于 2026-10-08 人工过目并授权

### QM-5 五步（本 PR 是"门禁缺失"型缺陷的收口，不是改表面）

| 步 | 产出 |
| --- | --- |
| ① 第一性原因 | 2026-09-29 把 Gate 7b 接进 PR 侧时只补跑浅色两套 views（该步骤注释自述的理由只解决了浅色判定域），暗色基线因此永久留在 `--partial` 的 skipped 名单里 |
| ② 逃逸链 | 单元不渲染 CSS → `test:visual:pixel` 只读浅色基线 → Gate 7b 把暗档记 skipped 并**放行** → main 侧 `Full visual suites` 用 6% 全页阈值吃掉局部漂移（实测 0.539% 整个隐没）→ 唯一暴露点是 main push 的 `Baseline freshness gate`，而它**不是必需上下文** |
| ③ 系统性漏洞 | `quality-gate.yml` 的 `visual` job 缺「判定域 == 渲染来源」的接线锁；`scripts/check-baseline-freshness.test.js` 此前**没有任何一条**含 `dark` 的用例（实测 grep 命中 0），所以暗档判定域从未被测过 |
| ④ 修复 + 回归保护 | 接线（Gate 7 + Gate 7b round2 两处跑 `test:visual:pixel:dark`）+ 结构锁（`workflow-contract.test.js` 新增「两处都接 + 退出码逐条打印 + partial 保留」）+ 行为锁（`check-baseline-freshness.test.js` 新增 2 条：暗档有 `<view>-dark-current.png` 时必须判、不得进 skipped；确实无渲染时才允许 skipped） |
| ⑤ 预防措施 | 结构锁接进 CI（`workflow-contract.test.js` 已在 `quality-gate.yml:464` 点名执行，无需新接线）；本记录 + `docs/visual-capture-settle-and-attribution.md` 的归因章节 |

### 8 张暗档漂移的归因（推翻我最初的假设）

最初假设「#3159 漏刷暗档」。**实测否证**：`git show --name-only a43287ac7 -- .../base-screenshots` 的 29 张里这 8 张**全在**。逐张严格逐像素定位 + 颜色对取证显示：渲染侧的新色值**逐字命中该提交自己新增的 CSS 行**（`cloud-publish-dark` 最大一类 `#23232a → #232329` 占 20236 个像素，而 `#232329` 就在新增行里），仓库基线侧是旧值 ⇒ **基线是在那次 CSS 生效之前抓的（陈旧采集）**，不是漏刷。

| 视图（暗档） | 严格相等像素 | bbox |
| --- | --- | --- |
| accounts-list-dark | 42 | (1393,418)->(1399,426) |
| accounts-list-flag-on-dark | 42 | (1393,418)->(1399,426)（与上一张同坐标同面积 ⇒ 同一元素） |
| cloud-publish-dark | 113978 (5.497%) | (232,251)->(1887,852) |
| create-history-dark | 94 | (806,596)->(999,604) |
| create-result-dark | 286 | (1040,321)->(1079,333) |
| publish-form-dark | 26323 (1.269%) | (256,256)->(1652,1079) |
| publish-history-dark | 359 | (600,479)->(624,991) |
| viral-analysis-dark | 1622 (0.078%) | (1368,233)->(1842,245) |

口径注意：**严格相等与 CI 报的数字不可互校**（CI 报 cloud-publish 11176 px / 0.539%，严格相等是 113978 px / 5.497%），引用必须注明用哪个度量。

### 反证（四条变异各自实测变红，跑完逐字节还原并自证）

| 变异 | 结果 |
| --- | --- |
| N1 摘掉 Gate 7 的暗档采集 | `fail=1` 命中「Gate 7 必须跑暗档像素套」 |
| N2 只摘 round2 的暗档采集 | `fail=1` 命中 round2 分支 |
| N3 退出码行去掉 `dark=` | `fail=1` 命中「退出码必须逐条打印」 |
| N4 把 `findRender` 的 pixel-gate 回落档改名 | `fail=2`（新增两条暗档行为锁同时红，证明它们真在读该档） |
| 还原自证 | 四个文件 `byte_identical=true`；还原后 `contract fail=0 / freshness fail=0` |

### 本地门禁

`workflow-contract.test.js` 34/0（含新增锁）· `check-baseline-freshness.test.js` 36/0（含新增 2 条）· 其余见下表

### 第二刀：基线重建（**19 张**，不是最初的 8 张）

复查 main 实况时漂移已扩散：`a43287ac7` 那次红 8 张，之后 **P4C 第二批 `2b2db5c1a`** 与 **P4D 第三批 `15fd49c0d`** 两拨暗色可读性改动继续合并，main push 的 Visual Tests **连续三次红**（`15fd49c0d` 07:24 / `8b3d3e91f` 09:42 / `07550cf37` 14:08，均为 `基线新鲜度：检查 41 张 / 违规 19 张`，19 张**全部** `来源=pixel-gate`）。另有 `aecb75ab3`（#3202 三列表渲染截断 + 加载更多）改了 `Accounts.vue`/`HotTopics.vue` 的内容，把 `accounts-list-dark` 推到 44603 px（2.151%）。连我 #3113 重建的 `collection-dark.png` 也再次漂了——**这条正是"没有 PR 侧判定，修好的基线也会在下一次暗色改动后静默失效"的实证**。

重建来源与自证（QM-4 第 7 条同源要求）：

| 步骤 | 证据 |
| --- | --- |
| 取渲染 | `gh workflow run visual-test.yml --ref pr-dark-baseline-gate` → run `37945181027`（head `c67576658`，即本 PR 重建前的 head），产物 `visual-test-reports` 含 19 张 `*-dark-current.png` |
| 该 run 自身的"重建前"判定 | `基线新鲜度：检查 41 张 / 违规 19 张` —— 与本 head 的漂移清单逐张一致，证明漂移不来自我的改动 |
| 重建 | 19 张逐字节写回（`replaced=19 already_same=0 missing_baseline=0`），逐张写入后回读并断言与渲染**逐像素相等** |
| 自证 | 用**同一份产物**跑 `node scripts/check-baseline-freshness.js --renders=<artifact screenshots> --baselines=<worktree base>` ⇒ `检查 41 张 / 违规 0 张 / 本次跳过 0 张` |
| 未新建基线 | `missing_baseline=0`：本 PR 不新增任何基线，只刷新既有 19 张 |

**reuse 前提的口径修正（不得沿用 #3113 那条粗判据）**：#3113 里我写的"复用别的 run 产物要证 `git diff --name-only <run-head>..<我的 head>` 命中 `apps/` 为 0"在**本 PR 上不可满足也无需满足**——基线 PNG 本身就在 `apps/` 下且正是本次要改的对象。正确的判据是**「渲染输入不变」**：本 PR 对 `apps/desktop/src/**` 零改动，改的只有基线工件与 workflow。而且本 PR 没有"复用"：产物取自**我自己的 head** 的 dispatch run，因此自证链是闭环的（同 sha 渲染 vs 同 sha 基线）。

### 门禁②的端到端证据（本 PR 就是第一次）

合并后 `QG Visual` 的 Gate 7 会跑暗档像素套、Gate 7b 因此在**判定域内**看到 19 张暗档。判据不写在本 PR 里靠断言，而是看本 PR 自己那次 `QG Visual` 的现场：`[GATE-7] suite exits: pixel=… views=… views-supplement=… dark=…` 一行出现，且 Gate 7b 的 skipped 名单不再包含暗档。

| 门禁 | 结果 |
| --- | --- |
| 远程同步 | PENDING（本条自己的欠账） |
