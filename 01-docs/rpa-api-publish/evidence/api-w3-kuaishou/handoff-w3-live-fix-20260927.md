# Multi-Publish · W3 快手发布链修复 — 接管摘要与详细计划

> 交接日期：2026-09-27。供另一台电脑上的 agent 接手本任务域。
> 说明：GitHub 仓库已从 `Multi-Publish` 改名为 `mulpub`（origin 与 `gh` 操作按此路径）。

## 0. 目标与当前态势

接手**快手（kuaishou）发布链 W3 活体验收与收口**，以及 openspec change 的归档收尾。
当前推进到：**代码侧能做的都做完，剩余锁死在"用户到场做活体"**。
首要纪律：**别臆测改运行时代码，别在脏共享根动 git。**

## 1. 不可违反的并发会话铁律（最容易踩）

- 共享仓库根 `D:\Data\projects\Multi-Publish` 是 **main-only 协调目录**，长期被多个并发会话共用，此刻（2026-09-27）有 **~61 个其他会话的在途脏文件**（清一色 account/登录态/auth 方向，见 §5）。**绝不能在共享根 `git checkout / stash / reset / commit`**，会互相撕裂。
- 任何提交（哪怕纯文档）一律基于 `origin/main` 新建**隔离 worktree**：`D:\Data\projects\mp-worktrees\mp-<task>`，用 PowerShell 原生 `D:\` 路径（Git Bash 的 `/d/` 会触发 `D:/d/` 混写、使含 `/` 的分支名 ref 静默写失败）。
- 完成后走 `gh pr create` + `gh pr merge --auto --squash`，**长轮询盯 CI**（每 180–240s 一次 `gh pr checks`；`QG Coverage` ~19min、`Desktop Shards` 12–18min 最慢）。`gh` 常报 GraphQL `EOF / forcibly closed`——重试，或降级用 `git ls-tree origin/main -- <文件>` 核验是否已落地。
- **PowerShell 编辑 worktree（workspace 外）文件**：`Write`/`SearchReplace` 工具够不到，改用 `[System.IO.File]::ReadAllText/WriteAllText`（UTF8 无 BOM），**必须传绝对路径**——`cd`/`Set-Location` 不改 .NET `Directory::GetCurrentDirectory()`，用相对路径会误写到进程真实 CWD（常是共享根），污染共享根 tracked 文件。误写后立即 `git checkout HEAD -- <精确文件>` 单文件还原并复验脏数回基线。
- 调用全局 `openspec` CLI 前用 `[System.IO.Directory]::SetCurrentDirectory(<worktree 绝对路径>)` 真正切到 worktree。⚠️ 该操作会锁住 worktree 目录导致 `git worktree remove` 报 `Permission denied`：先把 .NET CWD 拨回中立目录再删；仍删不掉则 git 侧已注销、孤立空壳无害，待句柄释放自清。
- `01-docs/**/*.md` 被 `.gitignore` 全局忽略，归档进该目录的文档要 `git add -f`（`openspec/`、`scripts/`、`docs/`、`.ccg/` 不受影响，正常 add）。
- 远端启用 ruleset：**直推 main 一律被拒**，所有变更（含纯文档）必须走 PR。

## 2. 已完成（本会话链，全部已 MERGED 进 main）

| 项 | 内容 | PR / commit |
|---|---|---|
| **D1** | API-first 从 auth 分区兜底取 cookie | #2444（`de65abdbf0`）|
| **D2 取证纪要** | `01-docs/rpa-api-publish/evidence/api-w3-kuaishou/d2-selector-forensics-20260927.md`（结论：D2 为确凿功能性缺陷，根因需活体判定）| #2469 |
| **活体复测 Runbook** | 同目录 `live-retest-runbook-20260927.md`（7 步清单）| #2480 |
| **归档收口 ×3** | `copy-library-primary-menu`（建 `specs/copy-library`）、`film-gen-shot-error-observability`（更新 `specs/film-engineering`）、`mimo-tts-voice-clone`（`--skip-specs`）| #2478（`fcd29b123f`）|
| **归档收口 ×1** | `activate-viral-library`：新建 `openspec/specs/rewrite-engine/spec.md`(+4)、`desktop`(+6)，修正原 delta 误用 MODIFIED→ADDED 并补 2 条 Scenario | #2484（main HEAD `30655161c5`）|

**account/登录方向（并发会话，非本域）**：#2461/#2466/#2474/#2476/#2481 已密集合并；`#2466 sync-account-display-name-spec` 已于 2026-09-27 03:29 合并（`6593777049`），account-display-name 已同步为主 spec。

## 3. 关键事实速查

- **持久运行 worktree**：`mp-worktrees/mp-app-live2`，端口 vite **5231** / CDP **9279**（端口按 worktree 路径 hash 派生，基线 5174/9222，不同 worktree 不同，见 `apps/desktop/scripts/dev-ports.js`）。
- **共享数据锚点**：仓库根 `shared-user-data/`（`multi-publish.db` 存模型 key、`backend-data/accounts.json` 存 7 平台登录态、`identity-session.json`）。⚠️ 设显式 `ELECTRON_USER_DATA_DIR` 会绕过锚点导致数据分裂。
- **一键启动**：`scripts/sync-app.ps1`（完整）/ `-PrepareOnly`（只同步）/ `-Safe`（fetch+自愈+依赖门禁，无人值守用，绝不重写工作树）。⚠️ **agent 沙箱内禁止整树重写类 git 写**（`checkout -f origin/main`、`reset --hard`），只允许 fetch / `-Safe` 自愈 / 状态查询。
- **探针脚本**（在 gitignored 的 `.agent_context/w3livefix-staging/`，跨机需从 runbook 复现）：`probe-d2-dom.js`（CDP DOM 域绕快手反调试冻结读已解析 DOM，零发布副作用，结束 `authClose`）、`probe-d2-loginstate.js`、`probe-d2-diag.js`、`probe-d2-selector.js`。env：`MP_CDP`（默认 127.0.0.1:9279）/`MP_VITE`（默认 5231）。目标页 `https://cp.kuaishou.com/article/publish/video?tabType=1`。
- **D2 选择器现状**：`packages/rpa-engine/src/platform-selectors.js` kuaishou `publish_btn` 7 候选（`button:has-text("发布")` / `发表` / `span:has-text("发 布")` / `发布` / `立即投稿` / `[class*="submit"]` / `[class*="publish"] button`）——**未经活体正向 DOM 证据前不得改**。
- **登录判据**：手机号 15304851951；真实登录账号名含"**命运石**"。

## 4. 详细计划（按可执行性分层）

### 🟥 A. 锁死在"用户到场"——不能单独做，需用户本人过 jigsaw 滑块登录 + 真实上传发布

按 `live-retest-runbook-20260927.md` 7 步跑：
1. 启动最新代码 → 2. 本人过滑块登录（**不可代解**）→ 3. `probe-d2-loginstate.js` 校验真实登录（判据含账号名"命运石"）→ 4. `probe-d2-dom.js` 采集**上传后**编辑页真提交钮 DOM → 5. 决策树：比对 7 候选，定 (A)/(A') 选择器问题 vs (B) 上传守卫问题，**只有拿到正向 DOM 证据才改 `kuaishou-w3-live-fix` 的 2.2/2.3** → 6. 活体发布验收（私密/草稿优先、间隔 ≥18min、触发风控即停**绝不换号**、`result==109`→`login_expired` 不降级）→ 7. 收口回写 tasks。

对应 openspec 未勾项：`kuaishou-w3-live-fix` 2.1b/2.2/2.3/3.5；`api-publish-engine-w3` 3.3/6.3；`api-publish-w1` 7.5；`api-publish-w2` 6.2/6.3。

### 🟨 B. 设计明确"止步"——不要做，做了就是伪造代码

- 小红书链 `api-publish-engine-w3` **5.1/5.2**：x-s/x-t 完全依赖外包签名服务、无本地反推路径（`design.md §6` 决定性止步裁决，本地 `getXiaohongshuSign` 是未验证近似）。保持 Tier-B 待验证，**本波不激活链实现**。

### 🟩 C. 可安全自主推进的收口（无需用户、零运行时代码风险）

1. **第 5 个归档 `viral-rewrite-integration`**：上轮因 origin/main 查不到对应合并提交而保守排除。接手后先 `git log origin/main --oneline --all | Select-String "viral-rewrite|改写硬约束"` 证伪"确已合并"；确已合并才 `openspec archive`（无 delta 用 `--skip-specs`），否则继续排除。
2. **openspec 全量体检**：`openspec validate --all --strict` 现存失败多为既存未归档 change 的 delta 缺陷 + 全仓中文 spec 的 RFC2119 英文 SHALL WARNING（非 error）。可按同样"忠实补 Scenario / MODIFIED→ADDED 归组"手法逐个收口（每个走独立 worktree PR）。

### 🟦 D. 未开工大件——需用户给优先级方向，且开工前必须查并发撞车

| change | 未开 | 风险 |
|---|---|---|
| `ui-apple-token-retirement` | 33 | UI/设计令牌，跨模块 |
| `rewrite-hard-constraints` | 19 | 改写引擎（刚建 `rewrite-engine` spec，注意别重叠）|
| `pipeline-card-bg-static-bundle` | 13 | 流水线卡背景 |
| `add-account-name-source` | 37 | account 方向——`#2466` 已合并该线，但仍需 `gh pr list --state open` 复查有无新的在途 account PR 再动手 |

## 5. 共享根脏文件现状（2026-09-27 分析，给接手 agent 的处置纪律）

- 本地 `main` 落后 `origin/main` **24 个提交**（0 ahead / 24 behind）。
- 61 个脏文件**全部是 account/登录态/auth 方向**：`apps/desktop/electron/**`（32 个，含 `auth-partition.js`D、`account-manager.js`、`login-status-monitor.js`、`qrcode-login.js`、`rpa-view-manager.js`、`credential-saver.js` 等）、`packages/shared-utils/src/login-state.js`(D)、`packages/api-publish-engine`、`openspec/changes/kuaishou-w3-live-fix/*`(D)、`openspec/specs/desktop/login-state-evidence/`(D)、若干 `01-docs` 登录相关 md、`AGENTS.md`/`CHANGELOG.md`/`.quality-gates.md`。
- 交叉验证：远程 `origin/main` 里 `auth-partition.js` 仍在、`kuaishou-w3-live-fix` change 仍在、`fix-login-state-oscillation` 已归档 → 本地这批 D/M 是**另一个正在改 account/login 的并发会话在共享工作区留下的在途半成品**（共享根被它占着改运行时代码 + 本地 main 严重滞后）。
- **处置结论：本会话（W3 发布链/openspec 归档域）没有产出遗落在共享根，不该、也不会代这些文件提交/推送。** 接手 agent 到另一台电脑后，若共享根同样堆着非本任务域（account/login）的在途脏文件，**一律不碰、不 `git add`、不代提交**；那属于对应会话在自己的 worktree 里收尾。
- 追平本地 main 的 24 提交必须在**普通终端**跑 `sync-app.ps1`（非 `-Safe`），agent 沙箱做整树重写会撕裂 worktree。

## 6. 给接手 agent 的"下一个动作"清单

1. `git -C D:\Data\projects\Multi-Publish worktree list` + `git status --short | Measure-Object`：确认共享根状态；留意两个可能删不掉的无害孤立空壳 `mp-worktrees\mp-ks-activate-archive`、`mp-worktrees\mp-ks-runbook-docs`（git 已注销，句柄释放后 `Remove-Item -Recurse -Force` 即可）。
2. 复用 `mp-app-live2` 或 `sync-app.ps1 -Safe` 确认应用在跑 + 登录态（CDP `identityGetState()` / `listAccounts()` 返 7 平台）。**不要重启丢失会话**。
3. 用户不在场 → 优先做 §4C 的自主收口；§4D 大件先只做**技术拆解出方案（不写码）**，等用户挑一个。
4. 用户回来 → 立刻一起跑 §4A 活体 runbook，拿到上传后编辑页真提交钮的 DOM 正向证据，再定 `kuaishou-w3-live-fix` 2.2/2.3 的选择器改动。
