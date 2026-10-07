---
record: blogger-collection
task: 博主监控与采集特性方案设计 + CCG 外部评审 + PRD/openspec 契约补充（尚未实现运行时代码）
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 不存在；且分支落后 origin/main 9 个提交，需先 rebase
sync_backfill_owner: 下一个会话
---

## 本次执行记录：博主监控与采集方案（blogger-collection，2026-10-07）

> 支撑分支 `blogger-collection`｜worktree `D:\Data\projects\mp-worktrees\mp-blogger-collection`｜基线 `origin/main` = 853a4bd2

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | **混合 PR**：PRD 特性文档 + openspec 能力契约 + 主 PRD §8.5 增补 + **一个代码文件** `packages/python-backend/scripts/creator_p0_smoke.py`（P0 冒烟工具）。**特性运行时代码尚未开始**；隔离 worktree `mp-blogger-collection`、裸分支 `blogger-collection`，共享根全程未被写入 |
| 第一性原因（QM-5 ①） | N/A | 新功能设计，非缺陷修复。但取证发现本仓**从无「博主」维度概念**（`author` 仅字符串、无关注表、无按账号列作品、无周期监控），故属引入新领域而非修补既有行为 |
| 逃逸分析（QM-5 ②） | N/A | 同上，无既有缺陷可追溯 |
| 修复 + 回归保护（QM-5 ④） | N/A | 运行时代码未写，无回归测试可加。方案层面已把 CCG 评审发现的 7 类设计缺陷写成 A15~A25 验收项，随实现落地 |
| 防止再次发生（QM-5 ⑤） | PASS | 关键防复发措施已落进 openspec 契约：`openspec/specs/creator-monitor/spec.md` 把「配额约束七路径强制」「按 reason 而非状态码分类」「fencing token 提交」「canonical ID 不得用原始输入」「partial 唯一索引」等写成 SHALL，后续实现按此校验 |
| 行尾与 diff 对账 | PASS | 自有变更（`git diff --numstat origin/main...HEAD`）= `1236/0` + `71/0`；`--ignore-cr-at-eol` 两口径**逐文件相等**，无 CRLF 噪声。`01-docs/PRD.md` 为 `37/1`：新增 36 行为 §8.5 新增小节，删除 1 行为头部「功能文档」索引行被就地改写（登记本特性文档），**删除数有归因、无内容丢失** |
| 接线棘轮 | N/A | 本批次未新增 `*.test.js`（运行时代码未写） |
| QM-1 打包 / QM-4 视觉 | N/A 未触碰 `apps/desktop/electron/` 或 `packages/rpa-engine/`（QM-1 的触发范围），故 QM-1 不适用；新增的 `packages/python-backend/scripts/*.py` 属工具脚本，不进桌面产物，无视觉面变更 |
| QM-6 CCG 双模型外部评审 | **PASS（带降级声明）** | 实际执行 **8 轮**跨家族评审，proposer=`opencode` × critic=`codex`，产物落 `.adversarial/ccg-plan-plan-creator-monitor-review-target/`。累计 **约 78 条意见全部逐条响应并修订**，每一条 Critical/Warning 均在 PRD 与 openspec 契约中落为强制约束。**未形式收敛**，降级声明与未收敛证据见下节 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin blogger-collection` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### QM-6 降级声明（不假装已闭合）

**未形式收敛**：引擎的 rc=0（`minScore ≥ 8.0`）**未取得**。8 轮 Critical 轨迹为 `3 → 2 → 1 → 2`（震荡），维度分在 5~7 间浮动，**从未达到 8.0 阈值**，引擎判定 blocked。两项原因——

1. **后端替换**：官方配对 `opencode × claude` 中 `claude` CLI 本机未安装，直接跑 `sh scripts/plan-review.sh` 得到 rc=2（环境问题）。改用 `ccg-deep-review.js --proposer opencode --critic codex`（引擎原生覆盖参数，`ccg-deep-review.js:519-522`）。`opencode × codex` 仍是跨家族，且与本仓上一份决策层评审（`.adversarial/ccg-plan-frontend-remediation-plan-2026-10-06/`）同款。**修复环境依赖**：`opencode`/`codex` 的 npm `.cmd` shim 无法被 Go wrapper 直接 exec，须把其真实 `.exe` 所在目录注入 PATH。
2. **修订环节输入超限，且修订方本身有害**：`opencode` 作为 proposer 有 7,800 字符单次输入上限，超限即静默拒绝；第 6 轮跑满 3 子轮时出现 Critical 3→2→1→**3** 的震荡并回滚（分数 6→5），根因是 opencode 机械「采纳 N 条」反而引入新 Critical。改为 `--rounds 1` 只取 critic 评审、由人工修订后，Critical 稳定下降。引擎明确指出「给人看的意见对应表」不属于评审对象，应从评审输入中移除——该表已保留在 PRD 与本记录中，不进评审输入。

**评审实际价值（不因未收敛而贬低）**：38 条意见中包含**会导致功能跑不起来或数据损坏的真实缺陷**，例如——

- 配额算术矛盾（200 次/天 vs 1 小时×50 频道=1200 次/天），以及间隔下限 5 分钟时 14,400 units 爆掉探测池
- 错误按 HTTP 状态码分类，而 YouTube 的 `quotaExceeded` 返回 403 → 配额耗尽会被误判成故障并累计到自动暂停
- `viral_library` 存量行 `external_id` 全为空串，普通唯一索引会在迁移瞬间抛错 → **应用起不来**
- `switch default throw` 会因一条脏任务中断调度循环 → 所有自动化停摆（评审推翻了我原本的设计）
- `videoNotFound` 是单资源级错误，原分类会让一条已删视频**永久停用整个博主**
- `claim + lease` 缺 fencing token → 租约过期的旧 worker 可覆盖新持有者（lost update）

### 遗留（不假装已闭合）

- **分支落后 origin/main 9 个提交**，开 PR 前必须 rebase；`01-docs/PRD.md`（本批次已改）与 `.quality-gates.md`、`.adversarial/` 是历史高频冲突点，冲突解法 MUST 为「两侧记录都保留」，不得用后推覆盖
- **CCG 未形式收敛**（见上）。当前 7 条 Warning/Info 多为精修项，结构性错误已全部修订，但**不构成门禁通过**，不得据此宣称「评审通过」
- 运行时代码（新增 8 文件 / 改动 11 文件，约 4,530 行）**尚未开始**，所有验收项 A1~A25 均未验证
- **实现第一步必须先跑 E2E P0 冒烟**（真实 API Key 下验证频道解析/枚举/字幕正文/幂等/入库五项）。本特性最大风险不是逻辑复杂度而是**依赖不可用**——`content-aggregator` 是外部 pip 可选依赖，打包缺失则全部工作归零；已实测该链路在本机可用（导入成功、字幕依赖已安装、端点仅官方 API），但**打包后是否仍可用须由 QM-1 门禁证实**
- 第 8 轮提出的「正文链路不消耗 Data API 配额」已写入 PRD 与契约：字幕与描述均随 `playlistItems` 免费返回，**配额只影响发现不影响正文获取**——实现时 MUST NOT 把两者混在同一套降级叙述里
- `content-aggregator` 是否在打包产物中可用、`youtube-transcript-api` 缺失时的行为，须在实现阶段用 QM-1 打包门禁实测

### 零假设·零臆测（证据等级）

| 结论 | 证据等级 |
|---|---|
| 7 平台「按博主维度列作品」能力实测为 0 | **直接代码证据**：`collection-engine` 5 个 adapter 未接线、4 个 `_doFetch` 空壳/缺失、视频号 `VIDEOCLONE_CHANNELS_UNSUPPORTED` |
| YouTube 非 greenfield（已实现频道枚举） | **直接代码证据**：读取 `content_aggregator_shared/shared/collectors/youtube_collector.py` 366 行实现与返回结构 |
| 关闭应用不补跑 | **直接代码证据**：`automation-task.js:12-15`、`automation-scheduler.js:20-23` |
| 抖音/小红书/视频号长期不可靠 | **工程判断**，非实测——反爬对抗会持续变化，本方案不承诺、也不对其可用性做保证 |
| CCG 评审意见 | **外部模型产出**，已逐条人工复核；其中 7 类经代码复核确认为真实缺陷 |