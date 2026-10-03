---
record: create-view-back-btn-gap
task: 流水线启动页 .back-btn 的 gap 空转修复（箭头拆独立装饰字形，使 inline-flex/gap 真正作用于两个 flex item）
date: 2026-10-03
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（回填时把「远程同步」改成 PASS 并整段删除 sync_status / sync_reason / sync_backfill_owner）
---

## 本次执行记录：流水线启动页返回按钮 gap 空转修复（create-view-back-btn-gap，2026-10-03）

> 分支：`create-view-back-btn-gap`；worktree：`D:/Data/projects/mp-worktrees/mp-create-view-back-btn-gap`（`scripts/start-mp-task.ps1 -TaskName create-view-back-btn-gap -NoShell` 创建，依赖 + `ensure-electron` + `verify-worktree-deps` 由脚本内跑通）；基线 = `ecee7649`（当时的 `origin/main`）
> 范围：🎨 UI/UX 变更（渲染端：`CreateView.vue` 模板一行 + `styles/create-view.css` 全局样式）+ 🧪 回归测试 + 📝 CHANGELOG
> 来源：#2810 的「遗留」条目点名了这处同根因缺陷（当时判定"不在该 PR 范围"），本记录即其落地
> 判定：`classify-docs-only` → **docs-only=false**（含 `apps/desktop/**`）⇒ 完整门禁；变更规模 🌱 微小 ⇒ 轻量模式

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 建 worktree 前实测共享根 `main` clean；建完按实证核对（不信 rc）：`git worktree list` 列出该路径、`rev-parse --abbrev-ref HEAD` = `create-view-back-btn-gap`、`HEAD` = `ecee7649` |
| 第一性原因（QM-5 ①） | PASS | 不是"看着没对齐就调参"。`create-view.css:112` 的 `.back-btn` **已声明** `display:inline-flex; align-items:center; gap:4px`，静态读 CSS 会判"这处早修好了"；真因在 `CreateView.vue:47` 的 `← 返回` 是**单个文本节点** ⇒ flex 容器只产出**一个匿名 flex item** ⇒ `gap` 无第二个作用对象，**从未生效过一秒**。属「声明了正确属性但装配缺一环」，与 #2810 的 `ResultView.vue` 同根因、不同落点 |
| 逃逸分析（QM-5 ②） | PASS | 四层同时漏过：**单元层** —— 该页此前**没有任何测试**覆盖 `.back-btn` 或 `goToHistory`（`grep -rn --include=*.test.js -e back-btn -e goToHistory src/` 实测 0 命中）；**jsdom 层** —— 不应用 CSS，`gap` 生效与否在单测里不可表示；**像素层** —— 全页 6% 阈值对 75×31 按钮结构性失明（#2810 已把这条记为"双向失明"）；**审查层** —— CSS 声明本身无可挑剔，只有把 DOM 结构数一遍才发现 gap 是装饰。**为什么现在才修**：#2810 处理 `ResultView` 时逐条清点了全仓 4 种"返回"变体才暴露它，此前没有任何探测器指向这条 |
| 系统性漏洞（QM-5 ③） | PASS | 具体落点：`apps/desktop/src/views/CreateView.test.js` 对该页返回控件**零覆盖**（测试场景缺失），且本仓**没有**任何机制在看「CSS 声明的 flex 属性是否真有对应数量的子节点」（审查盲区）。分类：测试场景缺失 + 审查盲区 |
| 修复 + 回归保护（QM-5 ④） | PASS | TDD：新增「流水线详情页返回按钮的箭头是独立装饰字形，不进入可访问名」**先红**（`1 failed / 286 passed`，红因经原始输出核对为 `arrow.exists()` 为 false，不是夹具自坏）**后绿**（`287 passed`）。断言取行为面而非源码文本：`aria-hidden` 元素可见文本恰为 `←`，且从 `textContent` 摘掉它后剩余串 `trim()` 恰等于「返回」。该文件无既有 `.back-btn` 覆盖，故本条同时补上"零覆盖"这一格 |
| 防止再次发生（QM-5 ⑤） | PASS | 两条落地：① 该页返回控件从此有行为锁（红→绿实测），改回单文本节点写法立刻变红；② 手法与"CSS 声明的 flex 属性必须核对子节点数量"一并写进本记录与 CHANGELOG 根因段，并在 #2810 遗留条目里留了指向本 PR 的线索（避免下一个人只读 CSS 就判"已修好"） |
| 实现约束：行数预算 | PASS | `CreateView.vue` 改前 5656 行、`maxFileLines` 基线 **5657** ⇒ 只剩 1 行余量，故 `.vue` 侧**原地改单行、零增行**（实测改后仍 5656）。`create-view.css` 493 → 495 仍在 `check-max-lines` 的 500 限内。两条门禁实跑：`check-debt-budget` rc=0（`maxFileLines 5657/5657`、`filesOver500 98`（基线 101））、`check-max-lines` rc=0（`超限文件=98 挂账=98`，账本不涨 ⇒ 无 LEDGER_GREW） |
| 视觉验证（QM-4） | PASS（含失明声明） | 像素用例 `create-story2video-detail`（在 CI 实跑的 `run-pixel-tests.js` `pixelTests` 清单内，非只登记在 `viewTests`）明档 PASSED，目标 URL 指向**本 worktree 自己**的 dev server（`vite --port 5198 --strictPort`，跑完按 CommandLine 精确杀）。**PASSED 不构成改动证据**（6% 全页阈值），真实结论取真浏览器探针：`gap` 计算值 `6px`（已生效）、箭头中心与按钮中心 `309 == 309`、hover 底色 `transparent→#fff` 与边框 `#efefef→rgb(80,72,229)` **分别**变化、按钮 `75×31` 与 #2810 的 ResultView 返回键**尺寸一致**（两页现已同形） |
| 验证接缝的一处自坏（当场纠正） | PASS | 第一版探针直接 `chromium.launch()` 裸跑 dev server，`waitForSelector('.pipeline-card…')` **超时** —— 极易被误读成"本机验不了 / 环境缺失"。真因：流水线列表数据来自 electronAPI，裸 Vite 无该宿主。正解是复用仓内既有接缝（`tests/e2e/helpers/fixture-loader` 的 `buildInitScript()`，先例 `tests/visual-testing/scripts/verify-publish-rail-layout.js` 就是为同类一次性验证这么写的），注入后一次跑通并取到上述数值。**没有把超时登记成"不可验证"，也没有因此改用源码断言凑证据** |
| 行尾与 diff 对账 | PASS | 本 worktree 的 `CHANGELOG.md` 实测为**纯 CRLF**（63793 行全 CRLF、`bareLF=0`、`loneCR=0`、utf8 往返无损）—— 与 #2810 那个 worktree 的 LF 主导态**不同**，故按实测取插入点行尾而非沿用上次结论。前置脚本按「第一行自己的结尾」定行尾（**禁止**探测多数派统一回写），改后 `addedLF == addedCRLF == 21`（20 行块 + 1 空行，算术自洽）、`bareLF` 0→0、`loneCR` 0→0、原内容经 `at.endsWith(beforeText)` 证为字节级后缀。`CreateView.vue` / `create-view.css` / `CreateView.test.js` 改后仍 `bareLF=0 loneCR=0`（Edit 未改写行尾，实测非假设） |
| 本地门禁 | PASS | `check-debt-budget` rc=0、`check-max-lines` rc=0、`check-gate-record-debt` rc=0、`check-no-brand-residue` PASS、`check-docs-sync.sh`（`--base=main --head=HEAD`，实跑非目测）rc=0 |
| QM-1 打包 | ➖ N/A | 未触 `apps/desktop/electron/**`、`packages/rpa-engine/**`、preload 或 IPC，纯渲染端模板 + 全局样式 |
| QM-6 CCG 双模型外部评审 | ➖ N/A（按触发条件判定，非跳过） | 逐条核对 AGENTS.md QM-6 触发条件：非 M+/中高风险（净 +22/−2、无逻辑分支）、不触主进程服务/IPC handler/核心引擎包、不涉及安全/数据校验/状态机/持久化 ⇒ 不强制。风险面唯一的行为改动是 a11y 语义（`aria-hidden`），已由行为锁守住 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填，`git ls-remote --heads origin create-view-back-btn-gap` 返回 0 行证远端分支已删；回填后删除上方三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- **不重建视觉基线**，理由与 #2810 同：`Baseline freshness gate` 在 main 上就是「检查 41 张 / 违规 36 张」，`1242 px`、`1426 px` 在互不相关视图上精确重现，属单一共享元素的仓库级失效，已开 **#2812** 独立追踪。本 PR 会让 `create-story2video-detail` 这一张的漂移量进一步变化（它本来就在 36 张违规清单里，命中值 `1242 px`）。
- 全仓"返回"控件仍有多种写法（`.back-btn` 现已与 `ResultView` 的 `.back-to-list` 同形，但 `ProductionBoard` / `ReplayTimeline` / `ContactSheetView` 的裸 `← …` `router-link` 未收敛，`PromptEvalView` 另有一份 scoped `.back-btn` 且用硬编码 `#1f6feb` 而非 token）。提成 `components/ui` 下的共享返回组件是跨多页重构，另开任务。
- `PromptEvalView.vue:118` 的 `← 返回列表` 是同根因的第三处落点（单文本节点，无 `inline-flex`），其 `PromptEvalView.vue:365` 的 `.back-btn { color: #1f6feb }` 另有一处独立问题：**硬编码色值绕开 design token**（同族规则见 AGENTS.md 设计债）。本 PR 未动这两处。
