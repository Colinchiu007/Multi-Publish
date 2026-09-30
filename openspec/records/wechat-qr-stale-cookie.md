---
record: wechat-qr-stale-cookie
task: 修复失效公众号账号点卡片打开平台页时二维码加载失败——旧身份 Cookie 被免登录机制恢复回登录页会话
date: 2026-09-30
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在（PENDING 的既有语义）
sync_backfill_owner: 下一个会话（回填后删除上方三个 sync_* 字段）
---

## 本次执行记录：公众号二维码加载失败复发——失效账号点卡片走的是免登录会话（wechat-qr-stale-cookie，2026-09-30）

> 分支：`wechat-qr-stale-cookie`；worktree：`D:/Data/projects/mp-worktrees/mp-wechat-qr-stale-cookie`（基线 `origin/main` = `90007639`）
> 范围：🐛 运行时修复 + 回归锁 —— `apps/desktop/src/views/Accounts.vue`、新增 `apps/desktop/src/utils/account-status.js`（+ 同名单测）、`apps/desktop/src/features/accounts/components/AccountManagementCard.vue`、`apps/desktop/src/views/Accounts.test.js`、CHANGELOG
> 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false**（files=3 ⇒ 首轮；第二轮后为 5）⇒ 完整质量节拍，不走 docs-only 快速通道

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 独立 worktree（`scripts/session-init.sh wechat-qr-stale-cookie`）+ 裸分支；共享根未落盘运行时文件；`--no-verify` 未使用 |
| 第一性原因（QM-5 ①） | PASS | 现场日志定案，非推测：`shared-user-data/logs/app-2026-09-30.log` 21:08:55 `Created new tab: btab-1` + `LoginNetDiag [wechat_mp/29760847]` ⇒ 走**账号分区** `persist:account-29760847`（非每次新建的 `auth-*`），同日零 `auth-auth-wechat_mp-*` 分区 ⇒ 不是「去登录」路径；全天 `grep -c "clean login session"` = **0** ⇒ 干净会话分支从未进入，12 个失效凭证 Cookie 被原样恢复；出码侧 `qr response #1 after 3610ms status=200 contentLength=redacted` 后无二次出码/无 4xx/无成功导航 ⇒ 符合 #1888 已定案的「getqrcode 200 空体（真码 ~7.6KB）」静默拒绝 |
| 逃逸分析（QM-5 ②） | PASS | 2026-09-16 那次把 `cleanSession` 挂在 `Accounts.vue` 的 `openLoginPage`，而该函数是**死代码**（eslint 稳定告警 `openLoginPage is defined but never used`，全仓零引用）；真正可达的是卡片点击 → `openCreatorCenter`，而 `PLATFORM_DASHBOARD_URLS.wechat_mp === PLATFORM_LOGIN_URLS.wechat_mp === 'https://mp.weixin.qq.com/'` ⇒ 点卡片即进登录页。测试层：`Accounts.test.js` 此前只在「去登录」链路有覆盖，卡片点击这条可达路径一条都没有 ⇒ 死代码上的修复等价于没修复 |
| 系统性漏洞（QM-5 ③） | PASS | 「入口各自写一份 cleanSession 条件」本身没有门禁：新加入口漏写不红、旧入口变死代码也不红 |
| 修复 + 回归保护（QM-5 ④） | PASS | 判定下沉为 `src/utils/account-status.js` 的 `needsCleanLoginSession(account, confirmedExpiredIds)`；`openCreatorCenter` / `openLoginPage` 两处共用并传 `checkedExpiredIds.value`；active/unverified 仍照常免登录；干净会话置 `unsaved` 后扫码成功自动回写凭证（自愈闭环） |
| 防止再次发生（QM-5 ⑤） | PASS | 两条结构锁：① `src/views` 下凡带 `accountId` 的 `createTab` 调用点必须声明 `cleanSession`（覆盖 Home 批量登录，新入口漏写即红）；② 全仓 `function accountStatusKind` 恰好一份且在 utils 下（防止展示层/行为层口径再次分叉）。变异实测：摘掉 `openCreatorCenter` 的 `cleanSession` 行 ⇒ **4 条红**（3 条行为用例 + 1 条结构锁），还原后全绿 —— 锁的是本次逃逸点本身 |
| 依赖漏洞审计（CI 唯一红灯，已处置） | PASS（登记挂账） | 18:16Z 起该门禁转红：12 条新 axios 公告（修复版 >=1.20.0）。取证属**外部公告库刷新**而非本 PR 引入 —— 同分支 15:51Z 那轮 SUCCESS、同一时刻另一在途 PR（head `bb4d2e4d`）同样命中、本 PR 未改动任何依赖/manifest/lockfile。按该门禁自身口径在 `scripts/dep-audit-baseline.json` 登记 12 条 `decision=upgrade-tracked` 并逐条写 note |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致；`git diff --check` rc=0；新增文件按同目录惯例写 CRLF |
| 接线棘轮 | PASS | 新增 `src/utils/account-status.test.js` 落在 vitest workspace（`apps/`）内，由 `QG Desktop Shards` 收集，无需额外点名；`node scripts/check-unwired-tests.js` → rc=0（检查域 50 个全部接线） |
| QM-1 打包 | ➖ N/A | `git diff --name-only origin/main...HEAD` 无 `apps/desktop/electron/**`、无 `packages/rpa-engine/**` |
| QM-4 视觉 | PASS | 无视觉面改动（未动模板/样式，卡片与账号页渲染路径不变）；CI `QG Visual` SUCCESS；`build` / `gui-test` / `electron-tests` 均 SUCCESS |
| QM-6 CCG 双模型外部评审 | 部分执行（如实登记） | 后端 `codex`（`~/.claude/.ccg/config.toml` `[routing.backend].primary`）跑通，返回 W2/W3/W4 + I1/I2/I3（无 Critical），W2/I1 已修、W4 部分修、W3/I2 登记不修；前端 `claude`（`[routing.frontend].primary`）**三次均以 `claude completed without agent_message output` 告终**（0:59 / 1:05 / 1:07 三次，按 AGENTS.md「最多重试 2 次、3 次全败才跳过」的口径跳过），不以自审冒充通过。副作用：该进程 `pnpm exec vitest` 触发的 `pnpm install` 与本机安装并发，写坏了本 worktree 的 `node_modules`（`vitest` 的 `tinyrainbow` 被降到 1.2.0、`vue/compiler-sfc` 一度解析不到），已由 `pnpm install --frozen-lockfile` 修复中 |
| 远程同步 | PENDING | 合并后按 `git log origin/main --grep='(#2730)$' --format=%H\|%cI` 取 merge SHA 与时间，`git ls-remote --heads origin wechat-qr-stale-cookie` 应返回 0 行；回填后删除上方三个 `sync_*` 字段 |

### 第二轮：QM-6 后端模型发现项逐条处置

- **W2（Warning，已修）**：判定补第二路输入 `confirmedExpiredIds`。单条 `checkLogin` 只写 `checkedExpiredIds`、不回写 `account.status`，`batchCheck` 仅在返回带 `loginStatus` 时改写 ⇒ 「刚点完验证就点卡片」仍会带旧凭证进登录页，事故原地复发。
- **I1（Info，已修）**：`accountStatusKind` 下沉为共享实现。卡片展示层原本 `trim().toLowerCase()`、行为层严格 `=== 'expired'` ⇒ 「卡片显示已失效」与「点卡片仍按已登录恢复旧凭证」可同时成立。
- **W4（Warning，部分修）**：结构锁升级为跨文件（覆盖 Home 批量登录）。Home 那处仍保留 `cleanSession: true` 字面量，见「遗留」。
- **W3 / I2（登记不修）**：库里脏 `expired` 会让仍有效账号被强制重登 —— 属 fail-open 方向的 UX 回归（凭证不丢、扫码即自愈）；反向（失效凭证被恢复）是硬失败且无自愈路径，故维持现方向。I2 要求补输入矩阵，已由 `src/utils/account-status.test.js` 覆盖（三态/错误态/大小写空白/历史脏值/字段缺失/已确认失效集合/集合缺失不抛）。
- **I3（已修）**：本文件即执行记录；任务归档按 `.ccg` 既有目录处理。

### 遗留（不假装已闭合）

- Home 批量登录仍是 `cleanSession: true` 字面量副本（其目标集合本身全是失效账号，语义正确）；跨文件结构锁只保证「声明了」，不保证「都走同一判定」。是否把该入口也接到 `needsCleanLoginSession` 属独立改动。
- 库里脏 `expired`（W3）会让仍有效账号被强制重登一次，同账号其它已打开标签共享分区会被一并清登；不引入批量检测活体证据作判据，维持 fail-open 方向的取舍。
- `openLoginPage` 仍无任何调用点（死代码），本次未删除，仅与新入口共用判定。
