## 1. 条目模型单一实现

- [ ] 1.1 新增 `scripts/changelog-entries.js`：`HEADING_RE`（canonical，逐字取自 growth）、`isEntryHeading`、`splitEntries`、`groupByTitle`、`pickKeeper`、`countByTitle`、`dedupe`；`.gitignore` 补 `!scripts/changelog-entries.js` 反选
- [ ] 1.2 `scripts/check-changelog-growth.js` 改为 require 共享模型，删除本地重复实现；对外导出面保持不变（`FILE/HEADING_RE/collect/compareMultisets/headingsOf/readBlobText/main`）以免动 owner 的断言
- [ ] 1.3 `scripts/check-changelog-duplicate-entries.js` 改为 require 共享模型，条目域由 `# [未发布]` 收敛到 canonical（实测 1,158 → 1,184）
- [ ] 1.4 实跑两把锁的全部既有测试（11 + 14 条）；若因域收敛变红，**按实测改正实现或夹具，禁止改期望值让它过**

## 2. 授权例外（默认关闭）

- [ ] 2.1 定义 `scripts/changelog-dedup-authorization.json` 的字段：`applies_to_base`、`reason`、`owner_pr`、`expected_titles_reduced`、`expected_entries_after`
- [ ] 2.2 growth 内实现例外判据四条件（恰好 1 份 / 保留块逐字节等价 / distinct 标题全包含 / 生效必出声），并在 `main()` 输出里写明「例外由授权触发」
- [ ] 2.3 授权文件必须**相对 base 新增**：base 已含同名文件 ⇒ 例外不生效（防后续 PR 白蹭）
- [ ] 2.4 `applies_to_base` 与本次 merge-base 不等 ⇒ 例外不生效且报红（坐标系错位是本仓反复踩过的形态）
- [ ] 2.5 授权 JSON 不可解析 / 缺字段 / 期望数与实际不符 ⇒ fail-closed rc=1，不得退化成"没授权"而静默通过

## 3. 测试先行（TDD）

- [ ] 3.1 老断言零改动验证：无授权文件时，`真仓库四档…副本删一份=红` 等 11 条必须原样全绿
- [ ] 3.2 新增行为锁：授权 + 三合取成立 ⇒ rc=0
- [ ] 3.3 负控四组各红一条：少一个 distinct 标题 / 保留块被改写过 / 某标题削到 2 份 / `applies_to_base` 不符
- [ ] 3.4 新增「base 已含授权文件 ⇒ 例外不生效」与「授权 JSON 坏 ⇒ rc=1」两条
- [ ] 3.5 共享模型锁：同一份 blob 上两把锁的条目总数必须相等（把 1,158≠1,184 这次分裂钉成回归）
- [ ] 3.6 变异反证（逐条「基线全绿 → 变异 → 指定文件变红 → 逐字节还原」）：摘掉 distinct 包含判据、摘掉逐字节等价判据、把「相对 base 新增」改成「存在即生效」、把出声打印改成静默

## 4. 执行清理与无损对账

- [ ] 4.1 落授权文件，跑 `--dedup --apply`
- [ ] 4.2 独立回读对账（不复用去重脚本自己的结论）：diff 新增行数 == 0；每个保留块逐字节等于 merge-base 同标题的某一块；canonical distinct 标题集合 == base；行数与净删量当场打印
- [ ] 4.3 `--dedup` 再跑一次必须 `removed=0`（幂等）；两把锁对新 merge-base 复跑均 rc=0

## 5. 交付

- [ ] 5.1 写 `openspec/records/changelog-history-dedup.md`（含 QM-5 五步、QM-6 处置、frontmatter 登记 `sync_*`）
- [ ] 5.2 QM-6 双模型外部评审（>200 行 ⇒ 判定器定档 `dual`）；Critical 必修，Warning 逐条处置
- [ ] 5.3 `openspec validate --strict` 通过；`check-docs-sync` / `check-gate-record-debt` / `check-pr-exec-record` / `check-unwired-tests` / `check-step-failfast` / `classify-docs-only` 本地全绿
- [ ] 5.4 PR → CI 全绿 → 按 AGENTS.md 判据自动 squash 合并 → 同一次提交回填远程同步并删 `sync_*`
- [ ] 5.5 在 #3037 记录最终口径（含「17,891 行是窄口径、canonical 口径需重测」的更正），worktree 按 R1–R5 收尾
