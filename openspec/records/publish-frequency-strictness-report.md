---
record: publish-frequency-strictness-report
task: 发布限制频率机制的严格性与必要性调查（只读）+ 建议解决方案落 01-docs 调查报告
date: 2026-10-10
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填提交改写为 PASS 并删除本行所在的三个 sync_* 字段
sync_backfill_owner: 下一个会话（按 AGENTS.md「合并后收尾清单」第 3 条，回填与 ledger 销账必须在同一次提交内完成）
---

## 本次执行记录：发布限制频率机制严格性与必要性调查报告（publish-frequency-strictness-report，2026-10-10）【docs-only】

> 分支：`publish-frequency-strictness-report`（共享主工作区 `D:\Data\projects\mulpub` 就地编辑，**未进 worktree** —— 纯 `01-docs/` 新增文档 + 流程留痕，按 docs-only 快速通道）
> 范围：📝 纯文档新增一份只读调查报告。**未触碰 `apps/`、`packages/`、`ops-center/`、`config/`、`.github/` 任何运行时路径。**
> 性质：**只读调查的产出物**。报告内所有发现**均未修复**，仅登记为待评审的建议项；是否落地须另立 OpenSpec change（运行时代码改动）。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 变更集全部命中文档白名单（`01-docs/**`、`openspec/**`、根级 `*.md`、`scripts/gate-record-debt-ledger.json`）⇒ docs-only。就地编辑 + 经 PR 落地；**不存在直推 `refs/heads/main` 这条路**（分支保护以 `GH011` 拒绝）。动笔前共享根 `main` 与 `origin/main` 实测同点（`a07a94b8a`，`git rev-list --left-right --count HEAD...origin/main` = `0 0`），已满足「共享根滞后时不得就地编辑 `.quality-gates.md` / `CHANGELOG.md`」的前置条件 |
| 前置守卫（如实记录） | 已跑，判据域说明 | `scripts/pre-code-edit-guard.ps1` 返回 **exit=1**（共享主目录）。该守卫的定义域写在它自己的输出里——「**Runtime code changes** are NOT allowed here」，即它守的是 `apps/`、`packages/`、`ops-center/`、`config/`、`.github/` 等运行时路径；AGENTS.md「分支隔离（分层）」明确纯流程/文档变更**可在共享主工作区就地编辑**。本 PR 只新增 `01-docs/` 文档与流程留痕，不属该守卫的判定域。会话声明用 `scripts/session-guard.ps1 -Branch main` 刷新：既有声明 pid 35900 实测**进程已不存在**（`Get-Process -Id 35900` 空），按脚本自身的过期分支逻辑覆盖为当前 pid，**未使用 `-Force`** |
| 调查方法与口径 | PASS | ①源码静态复盘（策略表 / 守卫 / 队列接线 / 四条发布入口 / 渲染层契约）；②真实数据取证（`shared-user-data/publish-history.jsonl`、SQLite `publish_timeline`、`backend-data/accounts.json`）；③两套时间口径交叉验证；④公开资料直抓（微博开放平台 / 微信开发者文档 / 微信运营规范）。**报告不含任何真机连发实验**，已在 §9 逐条声明 |
| 关键新发现（本次首次落盘） | PASS | ①**失败惩罚已从「理论代价」变为「已观测事实」**：`publish-frequency-control` 记录把乐观记账列为「已接受但未观测」；本次实测 bilibili 连续 3 次失败间隔恰为 **120.0 / 30.0 分钟**、tencent_video 4 次失败同样被 30 分钟钉住。②**零抖动**：`publish-interval-guard.js` 与 `task-queue.js` 内 `Math.random` 命中数 **0**，发布点落在**精确的 30.0 / 60.0 分钟**整数边界（同仓 `batch-rate-controller.js:5-9` 早有「模拟人类不规则操作间隔」的正确写法）。③**平台档实测空转**：`accounts.json` 每平台恰好 1 账号 ⇒ 该档恒被更严的账号档支配，唯一实际作用是惩罚「同平台多账号」。④**口径陷阱**：history 记**终态时间**、`publish_timeline` 记**提交时间**，直接用 history 做间隔标定会系统性失真（报告 §4.6 用一条「看似违规」的 24.63 分钟案例证明） |
| 外部资料（可信度分级） | PASS（带边界声明） | 取得**官方原文**：微博发博 30 次/小时·100 次/天、单 IP 15000 次/小时，以及「非用户主动行为频繁调用（即使未超过频次限制）同样封接口权限」；微信订阅号 1 条/天、服务号 4 条/月、发布接口 100 次/日、群发 60 次/分钟；微信运营规范 3.1 禁止外挂接入。**量级对照结论：10 / 30 / 60 分钟三个量级在公开资料中均无依据**；「3-5 分钟/次」经原文核对系**微博接口轮询建议被误引为发布间隔**。**边界如实记明**：本会话 `web_search` 无 API key，境外域名一律解析到非公网 IP ⇒ **海外平台（YouTube / X / Instagram / TikTok）零引用**；抖音/快手/B站/小红书官方帮助中心是 JS-SPA 抓不到 ⇒ 只能写「未找到公开依据」，不能写「不存在限制」 |
| 判定结论 | PASS | ①「有闸门」必要（接线前 `maxConcurrent=3` 且间隔 0；官方文本支持「降低自动化特征」方向）；②「这个刻度」站不住（零公开依据 + 与平台真实硬限两个方向都不对齐 + 已被实测成为吞吐约束项）；③**维度选错了**——公开资料唯一有依据的维度是**日配额**，而实现只有最小间隔、没有日配额（PRD 把 quota 列为非目标）。报告给出 P0/P1/P2 分级建议与「明确不建议做的」四项 |
| 对既有决策的关系 | PASS | 逐条回应 `publish-frequency-control` 记录 2026-10-08「保持现值」的三条理由：①②**成立**（故本报告**不**建议按那份 n≤4 的表逐平台调数字）；③**成立**（故建议不是「放松」而是**把闸门与刻度解耦** + 修失败语义 + 补维度）。本次新增的、当时没有的信息只有一条：有依据的维度是日配额而非分钟间隔 |
| 行尾与 diff 对账 | PASS | 暂存后 `git diff --cached --numstat` 与 `git diff --cached --ignore-cr-at-eol --numstat` **逐文件完全相同**（5 文件：`.quality-gates.md` 14/0、`01-docs/INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md` 489/0、`CHANGELOG.md` 18/0、`openspec/records/publish-frequency-strictness-report.md` 41/0、`scripts/gate-record-debt-ledger.json` 5/0）——**删除数全为 0** ⇒ 纯新增 + 置顶插入，不存在「逆否证已合并行」。两份新建文档首次落盘为纯 LF，已按本仓工作副本惯例统一为 CRLF 后用字节级统计复核（`loneLF=0`，CRLF=489/41），`LF will be replaced by CRLF` 警告随之消失；两次暂存的两口径 numstat 均保持一致 |
| 接线棘轮（本地红如实记录，非本 PR 引入） | 环境态，CI 不可见 | `node scripts/check-unwired-tests.js` 本地 **rc=1**，但被点名的路径**全部**落在 `.agent_context/worktree-archive-*`（其他会话的 worktree 归档）与 `.tmp-sched-repro`，两者分别被 `.gitignore:279`（`.agent_context/`）与 `.gitignore:272`（`.tmp-*/`）忽略，`git ls-files` 实测 **0 个受跟踪文件** ⇒ 不进入 CI 检出，属本机环境态而非本 PR 结论。本 PR 变更集（`git diff --cached --name-status`）实测 3 M + 2 A，**零 `.js` / 零测试文件 / 零 workflow 文件**，不构成该判据的输入 |
| 其他机械门禁 | PASS | `node .github/scripts/check-max-lines.js` rc=0（**路径必须是 `.github/scripts/`**：在 `scripts/` 下直跑得到的是 `MODULE_NOT_FOUND`，那是命令写错而不是门禁结论）；`node scripts/check-no-brand-residue.js` → PASS（7597 个 tracked 文件） |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` 对本 PR 全部 tracked 文件扫描。报告正文只写内容平台名与来源域名，**不含被禁的参考产品品牌词**（该门禁扫的是 8 字母拉丁词与 3 汉字中文名，与内容平台名无交集） |
| 文档同步（doc-gate） | PASS | `scripts/check-docs-sync.sh` 的判定是先看有无「需同步的代码变更」；本 PR 变更集全部命中 `PRD_PATTERN`（`01-docs/`、`openspec/`、根级 `.md`）⇒ `CODE_CHANGED=false` ⇒ 直接 PASS，不触发「代码变更未同步文档」分支 |
| 执行记录存在性 | PASS | `node scripts/check-pr-exec-record.js --base=origin/main --head-branch=publish-frequency-strictness-report --mode=enforce` ⇒ 新增 `openspec/records/publish-frequency-strictness-report.md`（与分支同名），满足出路① |
| 欠账登记 | PASS | `node scripts/check-gate-record-debt.js` ⇒ 顶部记录带「远程同步」行（PENDING）；该标题已按本 PR **同一次提交**登记进 `scripts/gate-record-debt-ledger.json`；记录文件自身用 frontmatter 的 `sync_reason` + `sync_backfill_owner` 登记（两个字段均非空），回填时连同 ledger 登记项一并删除 |
| 豁免门禁（docs-only 通道，与运行时无关） | N/A | QM-1 打包 / QM-2 代码必检项 / QM-4 视觉 / TDD（无代码）/ QM-6 双模型评审（纯文档不强制；本机未执行，**不以自审冒充通过**） |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin publish-frequency-strictness-report` 返回 0 行证远端分支已删；回填后删除本文件 frontmatter 的三个 `sync_*` 字段与 ledger 登记项（**同一次提交内完成**） |

### 遗留（不假装已闭合）

- **海外平台零取证**：YouTube / X / Instagram / TikTok 的官方配额与速率限制本次**一个数字都没验证**（`web_search` 无 API key；境外域名解析到非公网 IP）。报告未以它们作为任何建议依据。
- **多个国内官方帮助中心抓不到**（抖音 / 快手 / B站 / 小红书 / 知乎 / 百家号 / 头条为 JS-SPA）。「未找到公开依据」不等于「平台没有限制」，报告已按此措辞写。
- **第三方经验未打开原文**：仅取搜狗微信检索结果页的标题+摘要，未二次核实，无法排除二手转述。
- **无真机连发实验**：所有「会被限流」的因果陈述均非本次验证。
- **`publish-history.jsonl` 与 `publish-frequency-control` 记录里的「100 条」对不上**（本次同路径实测 61 行 / 57 条真实提交 / 跨度 48.87 天）。只记录现象、不做归因（未查证是轮转、迁移还是其他会话操作）；由此得出的方法学结论是「标定数据源与取数脚本必须一并落盘」（报告建议 P2-4）。
- **建议项全部未实施**：P0（记账语义细分、重试放行路径）、P1（平台档默认关、日配额维度、间隔抖动）、P2（数值下调、UI 口径统一、未登记平台出声、校准基础设施、两处小坑）**一条都没落地**。落地须另立 OpenSpec change + 隔离 worktree + 完整质量节拍，并先由运营确认日配额数值。
- **「放松后是否更安全」仍无证据**：本报告是在「不放弃闸门」的前提下主张降低代价，不声称放松是安全的。
