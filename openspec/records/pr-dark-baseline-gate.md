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

### 基线重建（第二刀，待同 head CI 渲染）

按 QM-4 第 7 条，8 张暗档只能取**本 head 的 CI 渲染**。第一刀先落接线与锁，随后 `gh workflow run visual-test.yml --ref pr-dark-baseline-gate` 取同一次 run 的 `*-dark-current.png` 入库，并自证「新基线 vs 同一次 CI 渲染 = 0 px」。

| 门禁 | 结果 |
| --- | --- |
| 远程同步 | PENDING（本条自己的欠账） |
