# PRD：发布进度面板视觉/UE 精化（publish-progress-panel-refine）

- **日期**：2026-09-29
- **状态**：已实施（PR #2658，squash `e2c860eefab3e33d1ffbe6dd1a3d9ee9887706d8`，2026-09-29T13:07:40Z；openspec change：`openspec/changes/publish-progress-panel-refine/`）
- **母契约**：`01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md`（本变更为其精化，契约表已在母 PRD 同步修订）
- **一句话**：浮窗「信息散乱、不够精致专业」→ dot-stepper 降噪 + 去重 + 网格对齐 + 取消入口端到端 + 失败恢复闭环 + 完成自动收敛。

---

## 1. 问题清单（真机截图 + 代码实证）

| # | 问题 | 实证 | 层 |
|---|------|------|----|
| P1 | 同一事实四重表达：成功任务同时呈现「✓成功」文字、步骤链末端「完成」高亮、「100%」、会话角标「已完成」 | PublishProgressTaskRow.vue 旧模板 + PublishProgressPanel.vue 旧会话徽标 | 视觉 |
| P2 | 6 词文字步骤链是最大噪声源：N 任务 × 6 词，扫读无法定位当前步 | 旧 `ppp__steps` 整链渲染 | 视觉 |
| P3 | 任务行 flex-wrap 无网格对齐：步骤链/百分比随平台名与状态文字长度跳动 | 旧 `.ppp__task { flex-wrap: wrap }` | 视觉 |
| P4 | 信息层级倒挂：「请勿关闭应用」（唯一操作约束）xs/muted 脚注；「发布任务」fallback 占位标题加粗当组标题，多会话无法区分 | 旧 `ppp__hint` / `sessionTitleFallback` | 视觉/UE |
| P5 | 汇总口径含混：「已完成 2/4」把 failed 计入 done，与「N 个失败」并置需做减法 | 旧 `aggregate` done 含 failed | UE |
| P6 | 取消入口不在浮窗内：用户盯着浮窗想中止时，取消按钮只在页面级（Publish.vue） | Publish.vue cancelTasks | UE |
| P7 | 取消链路断在主进程：TaskQueue 发 `task:cancelled` 无人转发，页面级取消后浮窗永远「进行中」 | task-queue.js:199 发事件 / phase4-events.js 无监听 | 功能 |
| P8 | 失败恢复断在「只能看」：错误截断 120 字仅 title 悬浮；无单任务重试、无复制错误 | 旧 TaskRow | UE |
| P9 | 完成态不自收敛：全部完成后浮窗常驻展开需手动收纳 | 旧 §8.1 状态机 | UE |
| P10 | 状态色四色齐发：success/failed/warning/primary 饱和色文字+色块底同时出现 | 旧 `ppp__status--*` / `ppp__badge--done` | 视觉 |

## 2. 方案（对照 SaaS 惯例）

- **dot-stepper**（CI pipeline 惯例：GitHub Actions/Vercel 部署步骤）：过去步实心灰、当前步主色+脉冲、未来步空心；仅当前步一个词由状态列承载（状态列=最具体状态：运行行显示阶段词而非「进行中」）。
- **去重**：success 行去 100%；单会话去卡中卡/去会话徽标（与头部徽标重复）；汇总「成功 N/M」直给（failed/cancelled 单列）。
- **网格对齐**：平台/状态/操作固定槽 + 中部 flex + 百分比/操作右对齐。
- **footer 警示条 + 取消**（Vercel/GitHub 取消部署先例）：warning-soft 底警示条承载勿关提示；「取消全部任务」两步内联确认（GitHub 危险按钮先例）——**不用模态确认弹窗**：浮窗按 PRD-OVERLAY-VIEW-SUSPENSION §6 显式不接入浮层互斥合同，模态弹窗接入即触发互斥合同，两步内联零合同成本。
- **cancelled 相位端到端**：phase4-events 转发 `task:cancelled` → `phase:'cancelled'` 终态（中性「已取消」，非失败红态）；store `cancelRunning()` 只发请求不自标记（事件单一来源）。
- **失败恢复闭环**：失败行内联「重试此任务」（单任务级）+「复制错误信息」（完整文本入剪贴板，toast 反馈不静默）；会话级「重试失败项（N）」批量入口保留。
- **自动收敛**：全部成功 + 面板展开 + 5 秒无指针操作 → 自动最小化（不弹首次隐藏 toast）；交互/新会话取消收敛；失败/取消在场不收敛（不遮蔽恢复入口）；手动展开完成态不触发。
- **动效**：当前步 240ms 脉冲、成功图标 pop-in；全部 `prefers-reduced-motion` 关闭。
- **组件拆分（逐文件行数门禁，实施期补做）**：本变更把 Panel 推到 688 行 ≥ 500 触发 CI「新代码不得引入超大文件」硬红 → 拆出 `PublishProgressFooter.vue`(150) / `PublishProgressSession.vue`(152) / `composables/usePublishProgressAutoCollapse.js`(74)；Panel 降至 398 行、TaskRow 347 行。职责边界：TaskRow 纯展示（props 单向 + emit 上抛），Footer/Session 为 Panel 的子容器，自动收敛计时器归 composable（store 保持纯状态）。

## 3. 边界（不做什么）

- 不改 TaskQueue 编排语义（并发/重试/超时/失败不中断整批）。
- 不改 `queue:cancel`/`queue:retry` IPC 形状；不改 stageKey 封闭清单（KNOWN_STAGE_MAP）。
- 不给浮窗加遮罩/模态（非模态负向锁保持）。
- 渲染层不新增第二份阶段映射（阶段词渲染走既有 stageKey→locale 表）。

## 4. 验收标准

1. 运行任务行：6 圆点 dot-stepper（当前主色+脉冲）+ 仅当前步一个词 + 百分比右对齐；无整链 6 词。
2. queued 任务行：仅「排队中」，无步骤链；success 行无「100%」。
3. 汇总行：「成功 2/4 · 1 个失败 · 1 个已取消」（4 任务 2 成功 1 失败 1 取消）。
4. 单会话：任务行平铺（无卡中卡/无会话徽标）；多会话：分组卡+标题+点徽标；无标题会话标题「发布 · HH:MM」。
5. 运行中 footer：警示条勿关提示 + 「取消全部任务」；两步确认（首次点击→「确认取消？」4 秒窗口→再点执行）；取消后任务转「已取消」中性态（经事件收敛）。
6. 页面级取消（Publish.vue 取消任务）后，浮窗任务同样转「已取消」（P7 修复）。
7. 失败行：「重试此任务」单任务重发并以新 taskId 跟踪；「复制错误信息」完整文本入剪贴板 + toast。
8. 全部成功 + 5 秒无操作 → 自动最小化为胶囊（无 toast）；面板交互/失败在场/取消在场/手动展开 → 不收敛。
9. zh/en 双语完整；`check-locale-sync` 三项 PASS。
10. 回归锁全绿（§5 测试清单）；QM-1 打包 + 启动 8 秒验证。

## 5. 测试策略（回归锁）

| 文件 | 关键断言 |
|---|---|
| `electron/services/publish-progress-events.test.js` | cancelled 相位原样透传（不被归一 progress） |
| `electron/bootstrap/phase4-events.test.js` | task:cancelled → phase=cancelled 转发；不落历史 |
| `electron/bootstrap.test.js` | taskQueue.on 注册 5 事件（含 task:cancelled） |
| `src/stores/publishProgress.test.js` | cancelled 终态/吸收态/aggregate.cancelled；cancelRunning（逐任务 IPC/防重入/no-op/事件收敛不自标记）；retryOne 单任务重试 |
| `src/components/PublishProgressPanel.test.js` | §4 全部验收项的渲染/交互断言（含 fake timers 自动收敛） |

**反证矩阵（变异测试，每条实跑后还原）**：① 摘 phase4-events 的 task:cancelled 转发 → phase4/bootstrap 测试红；② PHASE_ENUM 不加 cancelled（主进程或渲染层任一处）→ cancelled 被归一 progress 的测试红；③ TERMINAL_PHASES 不加 cancelled → 会话不 done/吸收态测试红；④ 自动收敛资格门摘 `failed===0` → 失败不收敛测试红；⑤ 两步确认摘首击分支 → cancelRunning 未调用断言红。

## 6. 已知限制

- 同平台并发归属近似（母 PRD §14.1 不变）。
- 剪贴板 API 在非安全上下文不可用 → 如实「复制失败」toast（Electron 渲染层为安全上下文，正常可用）。
- 自动收敛计时器归组件所有：面板卸载即清（store 不持计时器，保持纯状态）。
- 本文件首次提交时曾被 `.gitignore` 的 `/01-docs/*.md` + `/01-docs/**/*.md` 规则**静默忽略**（`git add -A` 不报错、文件未入库），而母 PRD/CHANGELOG/门禁记录已引用它 → 悬空引用；由补录 PR 以 `git add -f` 入库（见 `.quality-gates.md` 同条目备注）。新建 `01-docs/*.md` 必须显式 `git add -f`。
