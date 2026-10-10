---
record: podcast-oneclick-publish
task: 按 proposal-v5 落地播客 RSS 频道一键发布的刀 1（多频道数据模型、迁移、按键串行锁、契约与渲染层接线）
date: 2026-10-10
sync_reason: 待 PR 合并后按产物取证（state=MERGED + mergeCommit.oid、远端分支 0 行、git log 恰好 1 行）并就地回填
sync_backfill_owner: podcast-oneclick-publish 分支作者（本会话）
---

## 本次执行记录：播客一键发布 刀1（多频道数据模型与迁移）（podcast-oneclick-publish，2026-10-10）

> 分支：`podcast-oneclick-publish`（隔离 worktree `D:\Data\projects\mp-worktrees\mp-podcast-oneclick-publish`，**非 C 盘**）；共享根 `D:\Data\projects\mulpub` 保持 `main`。
> 范围：🛠 运行时代码变更 ⇒ 完整质量节拍，`classify-docs-only.js` 判 `false`（混合 PR）。
> 上游依据：`01-docs/DESIGN-PODCAST-ONECLICK-PUBLISH-2026-10-10.md`（设计 v1）→ `.adversarial/podcast-oneclick-publish/proposal-v1..v5.md`（5 轮跨家族对抗评审）→ `01-docs/PRD-PODCAST-ONECLICK-PUBLISH-2026-10-10.md` → `openspec/changes/podcast-oneclick-publish/`。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码在独立 worktree + 独立分支，经 PR 落地；`git rev-parse --abbrev-ref HEAD` = `podcast-oneclick-publish`；pre-commit 会话分支守卫 5 项通过 |
| 方案对抗评审（决策层，跨家族） | PASS（未收敛即升级人工，未自盖章） | `adversarial-review-loop` 5 轮：proposer=anthropic(claude)，critic 第 1 轮 opencode(deepseek/hy3)、第 2-4 轮 codex(openai)。产物 `.adversarial/podcast-oneclick-publish/{proposal-v1..v5, critique-v1..v5, rebuttal-v1..v3, ccg-claude-v1.json, evidence-v2-addendum.md, evidence-v3-selfcheck.md, task.json, summary.md}`。**逐轮问题数 9 → 9 → 11 → 9 → (第5轮 critic 进程异常，无产物结论)**；最低维度分曲线 **4 → 6 → 7 → 6 → 未收敛**（阈值 8.0、`maxRounds` 经用户同意 3→5）。**撤回轨迹才是收敛信号**：第 2 轮把第 1 轮 9 条**全部**独立复核后撤回，第 3 轮撤回第 2 轮 8/9，第 4 轮撤回第 3 轮 6/9。共处置 38 条 + 外部 CCG 设计评审 10 条 |
| 评审纠正的原稿方向性错误（不是"评审挑刺"，是原稿错） | 已修 | ① D-8：原稿承诺"自动挤出最老一期"与 `saveEpisode:296` 的 `EPISODES_FULL` 抛错矛盾，且静默下掉**已发布**内容比报错严重 ⇒ 撤销该承诺；② `guid` 不含 channelId 会让"同稿发到第二频道"搅浑第一频道那期 ⇒ guid 作用域含 channelId；③ `saveChannel:247` 整写会抹掉 `feedSync` ⇒ channel.json 拆 `meta`/`feedSync` 两段；④ `saveEpisode` 原本**不做**单集校验（全仓 `validateEpisode` 调用者只有引擎内部）⇒ 预校验改打在**合并结果**上，否则旧脏字段借合并存活；⑤ 同键锁重入（迁移嵌在 index 锁内）自死锁，被自己的用例当场抓到 |
| QM-1 打包 | PASS | `pnpm run build:dir`（vite build + electron-builder --dir）rc=0；产物 `dist-electron/win-unpacked`。asar 清单实测含 `\electron\services\podcast-channel-registry.js` 与 `podcast-channel-locks.js`；asar 明文含 `podcast:channel:list` / `podcast:channel:migrate:resolve`（证明 preload bundle 已随源码重生成，非旧产物）；`asar extract` 后 `require` 三个新模块成功（registry 导出 3 项、locks 导出 7 项、service 为构造函数）。**启动验证（`f0968c13d` 时点）**：`Multi-Publish.exe` 启动 10 秒存活、4 个进程驻留，stdout/stderr 中 `Failed to load platform config` / `ENOTDIR` / `Cannot find module` / `load-failed` / `TypeError` **命中 0 行**。首轮曾因未构建渲染层报 `app.asar/dist/index.html ERR_FILE_NOT_FOUND`（判为 QM-1 不通过），补 `build:vue` 后复验为 0 |
**QM-1 复验（`29a40025f` 之后，改了 preload ⇒ 必须重跑）**：`pnpm run build:dir` rc=0；asar 清单含 `podcast-channel-registry.js`/`podcast-channel-locks.js`；`asar extract` 后读**打包副本**实测：preload bundle 含 `subCode`×3 与 `podcast:channel:list`/`migrate:resolve` 字面量，registry 含 `assertChannelWritable` 且 `withChannelLock` 已消失。**启动烟测本机未能跑**：另一 worktree（`mp-xhs-note-align`）正在运行同一应用并持有 `requestSingleInstanceLock`，主进程拿不到锁即 `app.quit()`（静默零输出）。判据取产物而非猜测：用隔离 `--user-data-dir` 起一次，该目录**保持空**（连基础设施初始化都没到），证明退出发生在锁而不是本次改动；`electron` 计数前后 7=7、未杀任何进程。此项启动存活证据由 CI 的 GUI 烟测承担，此处如实记为缺口，不写成通过。
| TDD / 全量回归 | PASS | 播客全域 `vitest run podcast` **168 passed / 11 files / 0 失败**（QM-6 处置后：registry 15、locks 9、service 22、**write-guard 4 新增**、ipc-handler 13、preload 9、view、composable-ipc 15、单轨制与契约锁、hosting 规则层未受扰）；新增 4 条行为锁各做过「守卫改成 no-op 必须立刻变红」的变异；宽域 `vitest run`（apps/desktop 全域）**789 passed / 1 skipped（790 文件），14503 passed / 3 skipped（14506 用例），0 失败**，日志零 `Unhandled`；旧口径 158/10 files 系本次处置前实测值，保留为演进链而非现状 |（registry 13、locks 9、service 22、ipc-handler 10、preload、view 行为、单轨制与契约锁、hosting 规则层 34 未受扰）；IPC 契约面 `ipc-contract` + `ipc-exposure-contract` + `href-scheme-contract` **42 passed**；宽域回归 `vitest run electron src` 见 `.quality-gates.md` 同记录行 |
| 静态门禁 | PASS | `check-ipc-bridge.js`：447 handlers / 465 preload / 43 有意隐藏 / **0 已知缺口**；`check-locale-sync --cjk`：基线 1489、当前 1270、无新增硬编码；`--pair-base` 成对；`src/i18n/glossary.test.js` 2 例绿 |
| 机制缺陷（本次再次撞到，非本变更引入） | 已登记 | `.adversarial/` **不在共享根写保护放行名单**（`guard-shared-root-writes.ps1:56` 的 `$allowedTop` 无该项），而 `classify-docs-only.js` 又把它当文档白名单 ⇒ 在共享根写的 4 个产物被 watcher 全部移入 `%LOCALAPPDATA%/Mulpub/session-isolation/quarantine/`（可取回、非删除）。本次改在 worktree 内产出。**与 PR #3260 记录中登记的是同一缺陷，第二次复现** ⇒ 建议把 `.adversarial` 加入放行名单（属 `scripts/` 变更，须另立混合 PR，且两处判据必须同 PR 对齐） |
| 实现期评审（验证层，QM-6 双模型） | PASS（后端）/ 部分（前端，如实记录） | 引擎 `ccg-deep-review.js` 按**代码提交** `f0968c13d` 命中判定记录（HEAD 是 docs 提交时 `deep-review.sh` 会报「判定记录: 无」——QM-6 必须排在最后一个**代码**提交之后，或直接带 `--sha`）。后端 claude（anthropic，与出方案方跨家族、属外部复核）出 **8 条**：3 Critical（i1 手工写串行未接线 / i2 `endpoints:list` 生产必失败 / i3 迁移冲突首访即抛，域 `datamigration`）+ 3 Warning（i4 读写未分档 / i5 同步自旋 / i6 落盘层无兜底）+ 2 Info（i7 缺码表文案 / i8 死状态与无人渲染的错误位）。最低维度分 correctness 3。产物 `.adversarial/ccg-deep-9ce8fdbf/{critique-v1.md, adjudication.json, family-snapshot.json}`，处置逐条见 adjudication（i1-i4、i6-i8 upheld 并已修；i5 partially_accepted：预算单点导出并锁上界，异步化按 AGENTS.md Windows 原子替换约束拒绝）。**i3 由外部评审直接命中，未走自扮演豁免。** 前端 opencode 四次均未产出 JSON 产物（内联引号被吞 / `--resume` 参数位错 / 只落占位 `{}` / prose 收尾），但其文字命中「locales 两处死键」——已核实成立并转为被界面消费；该路结构化结论缺失，不冒充双模型全通过。另记一条评审自身的错：`toIpcError:51-54` 早已透传 `err.issues`，故「issues 不透传」这条前提不成立，已按实测纠正而非照抄 |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件一致（bundle 为工具重生成产物）；`git status` 的 `LF will be replaced by CRLF` 警告即本项告警来源，已按告警核对而非忽略 |
| QM-4 视觉 | PENDING | 播客页新增频道目录区块 ⇒ `podcast-channel` 浅/暗两张基线必然漂移，按 QM-4 第 7 条**只能取同一次 CI run 的 `quality-gate-visual-reports` artifact** 重取并逐项归因（禁本机截图、不提 `PIXEL_THRESHOLD`、不加 mask、`KNOWN_DYNAMIC` 保持空）；PR 合并后回填 |
| 远程同步 | PENDING | 待 PR 合并后回填 `PASS` + merge SHA，并在同一次提交删除本行对应的 ledger 登记项与 frontmatter 三字段 |

## 提交构成（origin/main..HEAD）

| SHA | 内容 |
| --- | --- |
| `f0968c13d` | 刀 1 全部代码与文档：`podcast-channel-registry.js` / `podcast-channel-locks.js`（+ 13/9 例）、`podcast-channel-service.js`（`channelDir`、`meta`/`feedSync` 两段、合并结果预校验）、`ipc-handlers/podcast.js`（6 条必填 channelId + 5 条频道目录通道 + `endpoints:list` 保持无参）、`preload/podcast.js` 与两个 bundle、渲染层桥与 composable（集中注入 channelId）、播客页频道区块、zh/en 成对 20 键、PRD/DESIGN/openspec change 与 `.adversarial` 五轮产物 |
| `29a40025f` | QM-6 双模型评审（验证层）处置：`channelBusyGate` 取代零消费者的 `withChannelLock`、`endpoints:list` 去频道依赖、迁移冲突首访可读、读写分档 `assertChannelWritable`、`writeHosting` 落盘清洗、`subCode` 打通到文案 + 9 条成对文案、重命名入口落地、删 `_indexCache`；新增 `podcast-channel-write-guard.test.js` 与 4 条行为锁；PRD/DESIGN §10/openspec spec+tasks/CHANGELOG/`.quality-gates` 同步 |
