---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: prune-consumed-exempt-records
reason: 本 PR 只做判据自己要求的清理——删除 openspec/records/_exempt/ 下 3 个已消费的豁免文件（其 exempt_for 分支经 git ls-remote 实测均不在远端）。scripts/check-pr-exec-record.js 的 consumedExempts 判据在堆积数达到阈值 3 时输出「请删除对应文件后放行」，实测已报到 3 条；删除是放行动作本身，没有任何行为变更，也没有新的门禁需要自检；为一次清理再写一篇执行记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 删 3 个已消费豁免文件 + 本豁免文件，共 4 个文件；全程按显式路径操作，未动其他会话的在制品。
- 触发本次清理的**实测现场**（不是凭印象）：
  `node scripts/check-pr-exec-record.js --base=HEAD~1 --head=HEAD --mode=advisory` 输出
  `待清理豁免已堆积 3 条（阈值 3）：其分支已不在远端…请删除对应文件后放行`；
  三者的 `exempt_for` 分支各自 `git ls-remote --heads origin <branch>` 均返回 **0 行**，
  同一次取证对 `main` 的正控返回 **1 行**（正控不可省：ls-remote 失败也会表现为空输出）。
- 被删的 3 篇与它们各自回填的那条记录（三行「远程同步」现均为 PASS，已在 origin/main 逐个回读确认）：

  | 被删豁免文件 | 它当时回填的记录 | 记录里对应的那次合并 |
  |---|---|---|
  | `backfill-2793-record.md` | `openspec/records/coverage-gate-electron-prepare.md` | PR #2793 → `8f302912` |
  | `backfill-2797-record.md` | `openspec/records/fix-electron-dist-banner-attribution.md` | PR #2797 → `d7fe9f2c` |
  | `backfill-2800-record.md` | `openspec/records/fix-s2v-auto-start-preflight.md` | PR #2800 → `4647f21b` |

  三篇豁免正文的实质取证（merge SHA 与时间、`ls-remote` 0 行 + 正控、CI 检查分布、关联单关闭时间）
  **本就重复写在上表那三行记录的「远程同步」格子里**，删除不丢证据；git 历史保留原文
  （清理是否发生过可用 `git log --diff-filter=D --name-only -- openspec/records/_exempt/` 回读）。
- 判据一致性：删除后 `consumedExempts` 归零（本篇自己的分支在远端 ⇒ 不计入 consumed），
  下一次回填不必替前人偿账。
- 为什么不在上几发回填 PR 里顺手删：当时那几篇**尚未被消费**（分支还在远端，或就是当次的 headBranch），
  阈值未到就不该动归档；现在三条都已消费，才轮到这一发专门清理。
