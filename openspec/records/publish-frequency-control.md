---
record: publish-frequency-control
task: 作品发布频率控制机制接线——PublishIntervalGuard 三条断链修复 + 两档间隔策略单一真源 + 记账时机前移
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由下一个会话回填 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话
---

## 本次执行记录：作品发布频率控制机制接线（publish-frequency-control，2026-10-02）

> 分支：`publish-frequency-control`；worktree：`D:/Data/projects/mp-worktrees/mp-publish-frequency-control`（基线 `origin/main` = `e3fe37cf`）
> 范围：📦 新增功能 + 🔐 合规加固（跨模块：`packages/shared-utils` + `apps/desktop/electron`）⇒ 完整质量节拍，不走 docs-only 快速通道
> 判定（提交后实测）：`classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false，files=20**
> 记录门禁：`check-pr-exec-record.js --base=origin/main --head=HEAD` → 「变更文件 20 个（A=9 M=11 D=0）｜新增记录 1 篇」→ **OK**
> 规格：`openspec/changes/publish-frequency-control/`（proposal / design / specs 6 条 Requirement / tasks），`openspec validate publish-frequency-control --strict` → valid

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 独立 worktree + 裸分支 `publish-frequency-control`。⚠️ 正规入口 `start-mp-task.ps1` 被**并发会话**拒绝（`scripts/start-mp-task.ps1:67` 硬编码 `-RequireClean`，共享根当时有另一会话 18:04–18:07 写入的 3 个 `openspec/` 脏文件）；经用户显式授权后改用 PowerShell 原生 `D:\` 路径 `git worktree add`（AGENTS.md 硬纪律 B），**未触碰那 3 个文件、未做任何 rm/prune**。判据按产物不按 rc：`git worktree list` 含该路径、`rev-parse --abbrev-ref HEAD`=`publish-frequency-control`、`status --porcelain` 0 行。`mp-worktree-health.ps1` 独立跑 `ok:true`（writeGuard registered+running，hooks identical）。依赖 `pnpm install --frozen-lockfile` + `ensure-electron.js` + `verify-worktree-deps.js` → OK（消费方解析 11 项全指向本 worktree）。`--no-verify` 未使用 |
| 第一性原因（QM-5 ①） | PASS | 三条独立断链，全部读源码定案而非推测：① `container.setup.js` 注册 `taskQueue` 时只传 `{maxConcurrent:3}`，未注入 `publishIntervalGuard` ⇒ `task-queue.js:25` 守卫恒 null；② `bootstrap.js:77` 调 `createContainer()` 不带参数 ⇒ 逃生口 `options.taskQueue` 也永久 undefined；③ `phase3-services.js` 把守卫读进 `_publishIntervalGuard` 后全文件再无第二次引用。**引入点即"注册与消费分离"那次拆分**，机制两侧都对、装配漏一环 |
| 逃逸分析（QM-5 ②） | PASS | 逃过了什么：`publish-interval-guard.test.js`(11 例) + `task-queue-guard-integration.test.js`(9 例) **全绿**，因为它们都在测试内手工 `new PublishIntervalGuard()` 再注入，从不经过生产装配路径 ⇒ 属 AGENTS.md 五类中的「测试不执行生产装配」+「断言不精确」复合。现场证据：`recordPublish`/`canPublish`/`getRemainingWait` 全仓生产调用点 **0**（只出现在测试）；只读查库 `publish_timeline` 在 `shared-user-data/multi-publish.db` 与 `Multi-Publish-debug-profile/multi-publish.db` **均 0 行**；`publish_history` 亦 0 行 ⇒ 没有任何东西在审计这笔欠账 |
| 系统性漏洞（QM-5 ③） | PASS | 「门禁缺失漏洞」：**没有任何门禁检查"注册了的服务是否真被注入消费者"**。本项目已因此栽过三次同族（CHANGELOG 记载的 C7 DI 容器双实例、本次、以及记忆里"装饰性门禁"前两型）。落点：`apps/desktop/electron/core/container.setup.js` 的注册工厂 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：策略单一真源 `packages/shared-utils/src/publish-frequency-policy.js`（两档 + 15 平台 + 未登记回落最严基线 + 环境变量覆盖 + 非法值回落并出声）；`PublishIntervalGuard` 双档 `check()`（缺席账号仍受平台档约束）；`TaskQueue` 记账**前移到提交之前**；`container.setup.js` 注入守卫且顺序不可被 options 覆盖；删除死变量与其 JSDoc/测试夹具。回归锁：装配锁 3 条（`container.setup.test.js`，含"摘注入即红"与"options 不得覆盖成 undefined"）、策略 11 例、守卫双档 10 例、队列行为锁 3 条（失败仍占窗口 / 重试等满窗口 / 缺席仍受控）。实测：shared-utils `535 passed \| 10 skipped`；desktop 受影响 7 文件 `224 passed` |
| 全量回归与归属判定 | PASS（既有缺陷不认领） | desktop 全量 `8154 passed \| 2 failed`。两条红经**未改动 main 基线对照**逐条复现 ⇒ 既有缺陷：`feedback.test.js`（Windows symlink EPERM，已登记于本机记忆「Known test-suite blind spots」）、`story2video-manual-assets.test.js`「manual 模式在 compose 前插入 finalize_assets 阶段」。二者均不在本 PR diff 涉及的文件集合内（本 PR 未触 story2video / feedback 路径） |
| 反证（防"装饰性锁"） | PASS | 四条变异**逐个实跑**，每条只让预期的那条锁变红，其余不受影响，还原后**逐字节相同**：(a) 摘掉装配注入 ⇒ `装配锁：publishIntervalGuard 必须注入 taskQueue` 红；(b) 记账挪回成功路径之后 ⇒ `任务失败/超时仍占用间隔窗口` 红；(c) `accountId` 缺席跳过全部检查 ⇒ `无 accountId 的任务仍受平台档约束` 红；(d) 守卫 `check()` 改 no-op ⇒ `同平台换号被平台档拦截` 红。cause-match 手法：先 `-t "<用例名>"` 跑基线证明**筛选器命中且绿**（`1 passed`），再跑变异证明**同一条** `1 failed`。两处踩坑已修：① 锚点必须按文件真实行尾归一（本仓 CRLF，用 `'\n'` 手抄会 0 命中并静默跳过）；② 汇总匹配必须先剥 ANSI，否则 `Tests  N failed` 读不到而误判"没红" |
| 既有用例纠偏（非放宽） | PASS | 2 条旧断言把单档模型钉成产品规则，按已确认决策改写而非删除：`不同账号同一平台互不影响`→`同平台不同账号受平台档互相约束（D2 决策）`；`无 accountId 的任务不被拦截（向后兼容）`→`无 accountId 的任务仍受平台档约束（缺席不等于放行）`。**未放宽、未 skip、未记欠账**；改写后的用例更强（后者从 `toContain` 升级为 `toEqual(['weibo'])` 精确执行序 + 阻塞计数 + bucket 归因） |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` **逐文件完全一致**（含 `CHANGELOG.md` 30/0），删除数归因：`CHANGELOG.md` 删除 0 ⇒ 纯前插。`git status` 无 LF→CRLF 告警。`01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md` 经 `git check-ignore --no-index` 确认被忽略 ⇒ 必须 `git add -f`（否则 doc-gate 的载体静默丢失）。`git diff --check` 对 CHANGELOG 每行报 trailing whitespace，经对照上一个已合并提交（`269352b8`）产出**同样告警** ⇒ 是本仓 CRLF blob 既有形态，非本次引入，不作为待修项 |
| 接线棘轮 | PASS | `node scripts/check-unwired-tests.js` → 「检查域内测试文件 53 个，OK: 全部测试均已接线或按欠账登记」。新增 `publish-frequency-policy.test.js` 位于 `packages/`（vitest workspace 收集域，不属棘轮扫描域），且**已看见其被执行**（535 passed 内含该文件 11 例），非仅 `node --check` |
| QM-1 打包 | PASS | `node scripts/verify-worktree-deps.js` → OK（11 项解析指向本 worktree）→ `ensure-electron.js` 就绪 → `pnpm run build:dir` **REAL_RC=0**（日志真实 rc，不取后台通知的 exit）。产物 `dist-electron/win-unpacked/resources/app.asar` 存在，`asar list`（**归一化反斜杠路径**后匹配）含 `publish-frequency-policy.js`、`publish-interval-guard.js`、`task-queue.js`、`electron/core/container.setup.js`。`asar extract` 后 grep **包内字节**确认是新实现（`PLATFORM_BUCKET_ACCOUNT_ID`/`resolveIntervals`/`提交前记账`/`publishIntervalGuard: c.get` 均命中）。require 链用 `D:/tmp/...` 绝对路径跑包内副本（`/d/tmp` 在 node 下会解析成 `D:\d\tmp` 而 ENOENT）：`weibo={600000,60000}`、未知平台回落基线 `{3600000,300000}`、同平台换号 `allowed=false bucket=platform`、`new TaskQueue({publishIntervalGuard:g})._publishIntervalGuard === g`。启动 12s 存活且 **stderr 已捕获**（227 行），关键致命特征（`Failed to load platform config`/`mkdir failed`/`ENOTDIR`/`Cannot find module`/`Uncaught`/`TypeError`/`ReferenceError`）**零命中**。副作用清理：本次 vite 构建把两个未触碰的 `*.bundle.js` 以 LF 重写 ⇒ 内容零差异的 index 幽灵改动（`git diff --numstat` 为空 + "LF will be replaced by CRLF" 告警），按精确文件路径 `git checkout HEAD -- <file>` 归零，未做目录级恢复 |
| QM-4 视觉 | N/A | 未改任何 `.vue`/样式/布局；`blocked` 相位的渲染（时钟图标 + 剩余等待文案）是 `PublishProgressTaskRow.vue` **既有能力**，本次未触碰渲染层 ⇒ 无新增视觉面。像素门禁对本就无改动，不跑 |
| QM-6 CCG 双模型外部评审 | **未执行（工具不可达，非跳过）** | 模型名真源 `~/.claude/.ccg/config.toml`：`[routing.backend].primary = codex`、`[routing.frontend].primary = claude`。3 种调用形态均失败并留现场：① `codeagent-wrapper --backend codex` → rc=1，wrapper 退出即删日志；② 直跑 `codex exec` → `ERROR: unexpected status 502 Bad Gateway, url: http://127.0.0.1:15721/v1/responses`（本机 CC Switch 代理上游不可用，重试 5/5 全失败）；③ `claude -p` → `API Error: Connection refused (ECONNREFUSED)`，摘掉 `HTTPS_PROXY/HTTP_PROXY/ALL_PROXY` 重试 → 空输出。**按纪律记为「缺失」，不以本地自审冒充第二个评审人**；`reviews/` 目录无产物即为证据。待代理恢复后必须补跑，Critical 修复后才能算收口 |
| 依赖与配置 | PASS | 未新增任何依赖、未改 lockfile；仅新增两个自有源文件与两个环境变量读取点 |
| 远程同步 | PENDING | 本 PR（#2773）尚未合并，merge SHA 还不存在。合并后由下一个会话取证回填：`git log origin/main --grep='(#2773)$' --format=%H\|%cI` 取 merge SHA 与时间，`git ls-remote --heads origin publish-frequency-control` 返回 0 行证远端分支已删；回填成 PASS 后**必须整段删除文件头部三个 `sync_*` 字段**（留下即报「已回填却仍留登记字段」） |

### 遗留（不假装已闭合）

- **QM-6 双模型外部评审未执行**（本机 codex 经 :15721 代理 502、claude ECONNREFUSED）。这是 M+ 任务的 MUST 门禁，不是可选项 ⇒ 合并前必须由后续会话或用户在本机代理恢复后补跑，并按结果处置 Critical。
- **未做设备/IP 级全局串行**（用户 D2 未选）：同机多平台并发的出口速率仍不受约束；如后续需要，应另立 change 而非在此补维度。
- **乐观记账的代价已接受但未观测**：失败/超时后同账号需等满窗口才能重发。若运营反馈过重，正解是按平台校准策略表数值，**不得**在调用点各抄一份或回退到"成功才记账"。
- `publish_history` 表**无账号列** ⇒ 无法按账号审计历史发布节奏（本次调查 CDP 观察无法用应用自身数据佐证的原因之一）。属数据模型缺口，另立 change。
- 间隔数值未经真实运营校准，当前是工程保守估计（PRD §4 与代码注释均已标注）。
