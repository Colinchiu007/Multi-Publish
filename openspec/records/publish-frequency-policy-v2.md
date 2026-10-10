---
record: publish-frequency-policy-v2
task: 实现《发布限制频率机制是否过严》调查报告的全部 P0/P1/P2 建议（publish-frequency-policy-v2）
date: 2026-10-10
sync_reason: 待 PR 合并后按三条产物取证（state=MERGED + mergeCommit.oid、远端分支 0 行、git log 恰好 1 行）并就地回填
sync_backfill_owner: publish-frequency-policy-v2 分支作者（本会话）
---

## 本次执行记录：发布频率策略 v2（publish-frequency-policy-v2，2026-10-10）

> 分支：`publish-frequency-policy-v2`（隔离 worktree `D:\Data\projects\mp-worktrees\mp-publish-frequency-policy-v2`，**非 C 盘**，满足「以独立分支/worktree 隔离本次修复，在非 C 盘上进行」）
> 范围：🛠 运行时变更。`packages/shared-utils/`（策略 / 守卫 / 队列）+ `apps/desktop/electron/`（存储 / 装配 / IPC / 发布器 / preload）+ `apps/desktop/src/`（进度投影 / 组件 / locale）+ `config/` + `scripts/`（校准脚本）
> 上游依据：`01-docs/INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md`（PR #3253，已合并）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码变更 → 独立 worktree + 独立分支，经 PR 落地。`git rev-parse --abbrev-ref HEAD` = `publish-frequency-policy-v2`；worktree 路径实测 `D:\Data\projects\mp-worktrees\...`（非 C 盘） |
| 方案对抗评审（决策层，跨家族） | PASS | `sh scripts/plan-review.sh` 三轮：runA `blocked`（8 条 / 2 Critical / minScore 6）、runB `cleared`（首轮 8 条 1 C → 收敛轮 8 条 **0 C**，minScore 6，`stoppedBy: converged`）、runC `cleared`（**首轮即 0 Critical**，5 条，minScore 6）。问题数趋势 8(2C) → 8(1C) → 8(0C) → **5(0C)**。逐条回应见 `.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v1..v4.md`，三次运行汇总见同目录 `summary.md`。**两轮各抓出一条真 Critical**：① `markSubmitted` 定在「首次写之前」⇒ 请求未送达也算已提交 ⇒ P0-1 对最常见场景失效；② `notSubmitted` 由执行器自标，而执行器正是「免等重试」的获益方 ⇒ 可伪造绕过 + 重试风暴。两条均已按评审方向改成更强约束（阶段判据双标记 + 佐证位一致判据 + 防风上限 + 成功路径自证 I4 + 失败路径矛盾检测自动降级） |
| 实现（TDD） | PASS | 阶段 A（策略/守卫/队列 v2 + 传输层打点）、B（日配额落库 + 装配 + 投影/文案）、B2（登录态族细粒度打标）、C（紧急放行后端 + IPC + 设置页 UI）、D（命名澄清 + 校准脚本）全部完成。测试：`packages/shared-utils` 全量 **800 passed / 10 skipped（39 文件）**；桌面受影响面 **153 passed（7 文件）**含 container.setup 11 / store-owner-isolation 21 / store-schema 14 / phase4-events 30 / phase1-context 13 / publishProgress 35 / PublishProgressPanel 29；IPC `publish.test.js` **49**（含 12 条新用例）；紧急放行服务 **15**；`publish-not-submitted` **27**；`publisher-router` **68**（含 3 条接线锁）；设置页组件 **10** + SettingsDialog **6** |
| 关键设计决策（与报告的显式偏离） | PASS（已声明） | 报告 P1-1 建议「跨账号平台档**默认关**」，本期改为**默认开 2 分钟**。理由：①两轮评审各自独立指出「默认关会削弱同平台多账号矩阵的共档保护」；②成本有界（1 账号/平台时该档完全惰性）；③它保留本项目**唯一一条设备/IP 邻域**保护（设备级串行明确不做）；④相对 v1 已把代价降到 40–67%。代价（同平台多账号第二个账号需等约 2 分钟）与适用建议已写进 PRD §5.1 |
| 装配锁（防「实现了但没接线」） | PASS | 新增 3 条并打在**真实装配路径**上：dailyStore 三方法已注入 / 抖动与退避已注入 / **行为锁**（打桩 store 方法证明「guard → 适配器 → store」链路接通，且配额未满时不得报 daily）。另把策略覆盖从**构造期快照**改为**每次 check 现取**——快照会让设置页改动只能靠重启生效而 UI 无任何提示（静默不生效） |
| 机制缺陷（本次发现，非本变更引入） | 已登记 | ①**`.adversarial` 不在共享根写保护放行名单**（`guard-shared-root-writes.ps1:56` 只有 `docs/01-docs/scripts/openspec/.ccg/.agent_context/.hermes`），而 `classify-docs-only.js:54` 又把它当文档白名单 ⇒ 对抗评审产物**写一次被隔离一次**（runA 的 11 个文件全被移入 `%LOCALAPPDATA%\Mulpub\session-isolation\quarantine\`，已全部救回并改在 worktree 内执行）。建议把 `.adversarial` 加入放行名单（属 `scripts/` 变更，另立）②**`.ccg/reviews/<sha>.json` 会被后续 pre-commit 覆盖**：记录以「提交时的 HEAD（即父提交）」为键，故 HEAD 自身永远没有记录（`deep-review.sh` 首跑即报「无 —— 提交时没跑判定器」）；runB/runC 的机器可读裁决也因同键覆盖被冲成 `pending`（**critique 内容本身已随 33 个 `.adversarial` 文件入库，可查证**）。③**CCG 安全扫描器版本漂移**：仓库自带 `.ccg/skills` 副本**排除测试文件**，而门禁实际调用的是 home 副本 `~/.claude/skills/ccg`（无此排除）⇒ 把测试夹具里既有的 `document.body.innerHTML = ''` 判成 **2 项 XSS 高危**（非本变更引入，仅因文件进入变更集被扫到）。已按扫描器自己的建议改为 `document.body.textContent = ''`（清理语义等价），复扫 `0/0/0/0 ✓`。④**既有编码损坏**：`publisher-router.js:585` 的 RPA 失败兜底文案原为 `'RPA 鍙戝竷澶辫触'`（「RPA 发布失败」的 GBK 误读），已修并钉进测试；**同文件头部注释仍有多处同类损坏**（`鈥?` / `鍚庣` / `鏂囦欢浣嶇疆`），属独立的编码治理问题，另立 |
| 校准取数（P2-4 实测） | PASS（暴露两条待跟进事实） | `node scripts/calibrate-publish-frequency.js` → rc=0，数据源 `shared-user-data/publish-history.jsonl`，**66 行 / 8 平台 / 0 解析失败**。暴露：①该数据源的行**没有 accountId 字段** ⇒ 分组全部坍缩到 `platform:*`，报告里按账号的分析**无法从该源复现**，权威判据需要 `publish_timeline`（含时间戳）；②baijiahao 出现 **4 处 1–5ms** 的相邻间隔，在**旧档位（60 分钟）下也属越限** ⇒ 这些提交当时并未被守卫拦住，值得单独归因（同批并发 / 缺 accountId 导致分组坍缩 / 重复行）。两条均写入脚本提交信息，未在本变更内自行归因 |
| 行尾与 diff 对账 | PENDING | 提交前按 `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件比对（见 PR 正文取证） |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` → PASS（扫描 7645 个 tracked 文件，无品牌残留） |
| 前端一致性 | PASS | `node .github/scripts/check-frontend-consistency.js` → PASS（`windowConfirm` 0 / `rendererIpcDirect` **0** / `appleAlias` 0，均等于基线 0；新组件经 `@/api/publisher` 访问 IPC，未直连 `window.electronAPI`） |
| locale 成对（i18n-content-sync） | PASS | `node .github/scripts/check-locale-sync.js --pair-base origin/main` → PASS。新增用户可见文案全部落在 locale（`src/locales/publish-page/{zh,en}.js`、`src/locales/settings/{zh,en}.js`），zh/en 成对；渲染端非 locales 文件无新增中文字面量 |
| 接线棘轮 | PASS | `node scripts/check-unwired-tests.js` → `检查域内测试文件 71 个 / OK: 全部测试均已接线或按欠账登记`（rc=0）。本次新增 4 个测试文件均落在被 workflow 自动收集的目录，无需登记 |
| 变异反证（M1–M14） | **PENDING（未执行，不冒充）** | 清单见 `openspec/changes/publish-frequency-policy-v2/tasks.md` §6 的 M1–M14。**本记录不主张已完成**：每条须先跑基线证明绿、再定向变异证明**恰好那一条**红。未跑完之前不勾选、不以「测试全绿」冒充变异已反证 |
| QM-1 打包 | **PENDING（未执行，不冒充）** | 改了 `apps/desktop/electron/` 下代码 ⇒ 属必需项。须 `pnpm exec electron-builder --win --x64` + asar 清单含新文件 + 启动 8s stderr 无致命（含 `Failed to load platform config` / `PluginLoader.*mkdir failed` / `ENOTDIR.*app.asar`） |
| QM-6 双模型评审（验证层） | **PENDING（见备注）** | 提交门禁判定：变更 >200 行 ⇒ **DUAL 必需**。首次直接跑 `deep-review.sh` 返回「无判定记录」——**这是机制设计使然**（记录以提交时的 HEAD＝父提交为键，HEAD 自身永远没有记录），不是漏跑。正解是再提交一次让记录落在 HEAD 上，再用 `--force` 审全分支 diff（`deepProposal` 的 base 候选首选 `origin/main` ⇒ 审的是 `origin/main...<sha>` 全量实现 diff）。执行结果与逐条处置见 PR 正文 |
| 远程同步 | PENDING | 开 PR 时写 `PENDING` 并**同一次提交**在 `scripts/gate-record-debt-ledger.json` 登记；合并后在同一次提交内改写为 `PASS` + merge SHA 并删除登记项 |

### 遗留（不假装已闭合）

- **变异反证 M1–M14 未执行**：这是本次交付前最大的未闭合项。未执行就不勾选。
- **QM-1 打包未执行**：改了主进程代码，属必需项，未跑前不主张可交付。
- **QM-6 验证层评审**：因机制原因首跑未落地，需在后续提交后用 `--force` 补跑；结论与逐条处置尚未产生。
- **日配额数值 3 / 5 / 20 是工程保守起点，非运营确认值**：公开资料只支持「日配额是有依据的维度」，不支持具体数字。设置页已显式标注「待运营确认」，env 与设置页双覆盖。
- **`publish-history.jsonl` 无 accountId 字段** ⇒ 报告里按账号的分析无法从该源复现（见上表校准取数行）。
- **baijiahao 4 处 1–5ms 相邻间隔未归因**：在旧档位下也属越限，说明当时未被守卫拦住；未在本变更内自行归因。
- **`publish:wechat` 的任务级 `accountId` 缺口未修**：`apps/desktop/electron/ipc-handlers/publish.js` 的 `publish:wechat` 不带 `accountId`，而渲染层 `src/api/publisher.js:8` 的 `publishWechat` 零生产调用方 ⇒ 本期按报告建议**留作另立变更**，未顺手改（改动面大于收益）。
- **`publisher-router.js` 头部注释仍有多处编码损坏**：与本次修掉的 `585` 行同源，属独立治理项。
- **同平台多账号的平台档代价已量化但未做真机验证**：机制与单测齐备，无真机并发发布实验。
