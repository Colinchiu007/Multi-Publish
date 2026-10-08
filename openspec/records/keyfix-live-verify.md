---
record: keyfix-live-verify
task: 把 #3083 审核回写修复的真机端到端复验取证入库（含修复前后天然对照组），并纠正一条没量过的归因
date: 2026-10-07
---

## 本次执行记录：真机端到端复验审核回写并入库（keyfix-live-verify，2026-10-07）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 见下表「classify-docs-only」行
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | CHANGELOG 收口 ✅ | 远程同步 PENDING（本条自己的欠账）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型 | PASS | 纯文档（`docs/**` ×2 + `openspec/**` ×2 + 根 `CHANGELOG.md`），零运行时代码 ⇒ docs-only 通道。仍在隔离 worktree `D:/Data/projects/mp-worktrees/mp-keyfix-live-verify`（裸分支 `keyfix-live-verify`，base `636fd48c9`）做，共享根保持 main clean |
| 复验的前置授权 | PASS | 用户 2026-10-07 明确点头「两项都做」＝允许再发一条 B 站公开稿件做端到端复验。上轮授权已消耗这一事实是先查出来、再征求的，没有沿用旧授权（记忆 [[project-mulpub-bilibili-audit-publish-authorization]] 里那句"10-05 只读取证够用没用掉"已过期，本轮消耗） |
| 复验动作 | PASS | 从含修复的树起应用（userData=共享锚点，vite 6511 / CDP 10559），经 CDP 调 `publishBatch` 发一条最短稿件 → `BV1hhH16NEAZ`（任务 `task_1_1791381214184`）。日志时间线：`13:53:35.617Z success` → 5 轮 `poll-progress reason:"in-review-bucket"` → `13:54:38.318Z monitor-result published` → **此后无 `audit-update-skipped`** |
| 真源回读（不看返回值） | PASS | `historyList` 读到该记录 `auditStatus:"published"` / `monitorStatus:"published"` / `platformWorkId:"BV1hhH16NEAZ"` / `auditedAt:"2026-10-07T13:54:38.318Z"` —— 四字段恰为 `AUDIT_PATCH_KEYS` 全集，且 `auditedAt` 与日志时间**逐毫秒一致**（这排除了"字段由别处填上"的解释） |
| 对照组（天然形成，非构造） | PASS | 同账号同链路的修复前记录 `task_1_1791361909906`：日志里 `monitor-result published` 后 **3 ms** 就是 `audit-update-skipped`，四个字段至今全部缺席。唯一变量是运行代码是否含 #3083 |
| 界面层复核 | PASS（DOM 文本，非像素） | `#/publish/history` 的 `document.body.innerText`：徽标候选词表七项里整页只命中 `["已上线"]`，且它出现在新稿行（`… 全部发布成功 \| 已上线 \| API 直连 …`），旧稿行是 `… 全部发布成功 \| API 直连 …` 无徽标位。**没做像素级核对**（小控件徽标对像素门禁本就双向失明），本轮不新增视觉基线 |
| ⛔ 一处归因自纠（写进正文而非只改句子） | 已纠正 | 初稿写「运行分支落后 main 10 个提交，**逐条查过均为无关功能/文档**」—— 实际当时只跑了 ahead/behind 计数，没逐条查过任何东西。正解换成量过的同一性判据：`git rev-parse <tree>:<path>` 比 blob，`publish-history.js` / `publish-monitor.js` / `bilibili-audit-check.js` / `phase4-events.js` 四文件在 `aa196aba0` 与 `origin/main` 上**逐字节相同**。**归因句的通用口径**：「某集合都与本链路无关」要能换成「这几个文件相同」这种可证伪形式，否则不要写 |
| 收尾卫生 | PASS | 停实例后按"本实例独有端口标记"反查：`MINE_FOUND=0`、`PORT 6511/10559 LISTENERS=0`；**未按镜像名 taskkill**（机器上常有别人会话的同一 exe）。日志与真源都在共享锚点下，可事后复核 |
| 行尾与 diff 对账 | PASS | 全部编辑按原行尾补回 `\r`（三份目标文件工作副本都是 CRLF）；CHANGELOG 用「原字节后缀整体保留」拼接，`TAIL_UNTOUCHED=true`；提交后按 strict 与 `--ignore-cr-at-eol` 两口径逐文件对账 |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` ⇒ `PASS（扫描 7240 个 tracked 文件，无品牌残留…）`（**提交后**复跑） |
| CHANGELOG 棘轮 | PASS | `check-changelog-duplicate-entries.js --base=origin/main --head=HEAD` ⇒ `冗余份数 0 -> 0；本 PR 新增副本=0`；`check-changelog-growth.js` ⇒ `PASS：base 351 条（351 种标题）全部在 head 352 条（352 种）里，字节 2096045 -> 2098792` |
| 文档同步 / exec-record / Gate 2c | PASS | 提交后复跑：`check-docs-sync.sh --base=main --head=HEAD` ⇒ `✅ 仅文档/流程变更`；`check-pr-exec-record.js --base=origin/main --mode=enforce` ⇒ `OK: 本 PR 携带执行记录`；`check-gate-record-debt.js` ⇒ 顶部 `OK`（现场见下行） |
| classify-docs-only | PASS | 提交后 `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ `docs-only=true`，files=5 |
| ⛔ 同一条坑第三次踩（如实登记） | 已纠正 | 本记录初版**又没有** `| 远程同步 |` 表格行 —— 只在「保留门禁」bullet 与 frontmatter 里写了 PENDING，Gate 2c 当场报 `❌ 记录文件整块缺 远程同步 行 1 篇：keyfix-live-verify.md`。这条坑今天已经踩过两次（#3089 那批）并写进记忆，仍然复发，原因不是忘而是**我没有从一篇已合规的记录复制表头，而是从零另写了一份**。口径：新建 `openspec/records/*.md` 时**复制 `openspec/records/_TEMPLATE.md` 或最近一篇 PASS 记录整份改**，不要手搓；`ROW_RE = /^\|\s*远程同步\s*\|/` 只认表格行。 |
| Gate 2c 现场 | PASS | 修好表格行后复跑 ⇒ 顶部 `OK: 顶部记录带行，两源所有未收口的 远程同步 行均已登记，清单无陈旧项、记录标题无重复、记录文件登记字段无残留`；计数行（绑 base `636fd48c9` + 本 PR 提交后的工作树）：`远程同步行 251 条 / 执行记录 453 篇（全部 ## 标题 461 个）/ 已登记欠账 8 条 / 记录文件 91 篇`。**绝对数会随 base 漂，可复核的判据是差值与期望形状**：本 PR 对这几项**应当只影响一项** —— 「记录文件」因本篇 +1，其余三项（远程同步行 / 执行记录 / 已登记欠账）不变。我没有另跑一次"去掉本篇"的对照去量 90，所以这里写的是**期望形状**而不是实测差值；下一个读到 91→92 以外变化的会话应当先怀疑并发合并进来了，而不是沿用本行。 |
| 远程同步 | PASS | 已合并：squash 落地 `cc7f0bc8aa89006449a7c47c9f9ecb1e60fc5e64`（committer 2026-10-07T22:33:20+08:00）。取证两源一致：`git log origin/main --grep='(#3100)$' --format=%H|%cI` 唯一命中该 SHA 与时间，`gh pr view 3100 --json mergeCommit` 报同一 oid；`git ls-remote --heads origin keyfix-live-verify` 返回 **0 行**证远端分支已随合并删除。该记录的「远程同步」行原文已把 PR 号写成 #3100（由 `gh pr list --head` 当场回读取入），本批只把状态转 PASS 并补 merge SHA 与分支删除证据。 本 frontmatter 的三个 `sync_*` 登记字段已在本条由 PENDING 转 PASS 的**同一次提交**内整段删除 |
| QM-1 / QM-2 代码必检 / QM-4 / TDD / QM-6 | N/A | docs-only 通道：零运行时文件；复验本身是"跑真机"而不是"改代码"，不需要双模型评审 |

## 明确留在场上的边界（不假装已闭合）

1. **审核时长**：两轮投稿→收敛分别是 44 s / 64 s，两个样本不支持任何上界，也不支持"该账号免审"（本轮前 5 轮确实在 `is_pubing` 桶里拿到 `pending`）。
2. **`-30` / `-1` 仍不写进任何「审核中」映射**：本轮只观测到"最终 published"，「不通过」现场仍缺；`AUDIT_REQUERY_VERIFIED_PLATFORMS` 的四类齐备判据不因本轮改变。
3. **上一轮那篇稿子的标题写着「稍后删除」但按后续指示保留了** —— 已发布内容上的措词与现实不符；改标题要再写一次账号数据，**未擅自处理**，在此登记。
4. 本轮只覆盖那条链路的四个文件与 `ca681b37` 这一个账号；main 上其它提交、其它平台的回写形态不由本轮负责。
