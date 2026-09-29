# Decisions: ui-apple-token-retirement（拍板记录）

> 记录日期：2026-09-29 · 依据：`.agent_context/breakdowns/ui-apple-token-retirement.md` §7 七个开放问题
> 结论：D1–D6 **按拆解文档推荐值拍板**；D3 取文档给出的「保留」分支（理由见条内）；D7（优先级）文档未给推荐，本次起草取「本 change 先行」为默认并标注为**代理建议**，可随时改。
> 据此新增 **Task 0（批次 0）** 先行：基线重测 + 回潮止血门禁 + 本文件与三栏清单材料。

## D1 圆角/字号取尺 —— 采纳 `tokens.css` 尺

- **决定**：`--apple-radius-*`（6/10/14/18）与 `--apple-size-*` 侧值全部丢弃，改指权威令牌 `--radius-*`（8/12/16/20）、`--font-size-xs` 12px、`--font-size-xxl` 32px。
- **后果（已接受）**：全站圆角统一 +2px、历史页大标题 28→32；`history-page.css` 与全部 `Ui*` 组件基线需**定向重生成 + 逐张核对**（浅色与暗色各一遍）。
- **被否方案**（保留 apple 数值、只改「谁引用谁」）：会把 Stitch 尺烘进全站权威令牌，并使 `check-font-size-scale` 基线全部重标 —— 用一次大回归换另一次，不采纳。

## D2 缺失语义槽 —— 先补权威槽再迁移

- **决定**：`--font-weight-*` / `--font-family-*` / `--leading-*` / `--duration-*` / `--ease-*` 与通用 `--shadow-sm/md/lg` **先在 `tokens.css` 补齐**（阴影沿用 `rgba(30,27,75,α)` 口径，与既有 `--shadow-float` 一致），再动消费点。
- **理由**：就地字面量制造第三套真相并规避 `check-color-literals` / `check-font-size-scale` 门禁精神；spec「缺失槽位不得就地写字面量」Scenario 已锁该行为。
- **备注**：`--shadow-sm/md/lg` 实测**已存在**于 `tokens.css`（PR #2075 事故反哺时补，暗色块亦有）——Task 2 该条只需核对口径，不必新增。

## D3 `--text` —— 保留，并给暗色正确值

- **决定**：**保留** `--text`；浅色侧 `var(--ink, #1e1b4b)` 维持，暗色侧改为转发权威暗色文字槽，**不得转发背景色**。
- **必须同时修**：`apps/desktop/src/styles/video-creation-tokens.css:204` 现为 `--text: var(--ep-bg, #1a1a1e)` —— **文字色转发到背景色**，正是 2026-09-20 暗色不可读事故根因（深字落深底）。
- **代价**：Task 2 的 **Files 须扩到 `video-creation-tokens.css`**（tasks.md 原只列 `tokens.css`）。
- **留档不采纳分支**：废弃 `--text` 并迁移全部消费点 —— 消费面未清点，风险高于收益。

## D4 `AccountCloudSync*` 57 处回潮 —— 并入批次 3

- **决定**：不单开小 PR，与 `UiButton`/`UiInput`/`UiModal`/`ConfigProfileManager` 88 处在**同一批次**收敛（同批基线重生成，避免两次重生成交错）。
- **必然性**：Task 3 的字面验收是 `src/components` 归零，而这 4 个文件在 `src/features/accounts/components/`；Task 6 的 `src/**` 全域归零**必须覆盖**它们 —— 不并入则 Task 6 必漏。

## D5 门禁前置 —— 同意，批次 0 先上「只降不升」门禁

- **决定**：批次 0 即在 `check-frontend-consistency.js` 增加别名回潮检查项，**基线制**（命中数 > 基线即 CI 失败，输出文件与行号）；批次 6 再升级为「命中数 = 0」钉死。
- **理由**：PR #2461 在 2026-09-20 禁令之后新增 57 处 —— **文档禁令无效已被实证**；门禁若按原计划放 Task 6（最后），中间 6 个批次全程裸奔。

## D6 stitch design-language spec 修订归属 —— 并入本 change Task 7；#2523 先合并

- **决定**：retirement 落地后 stitch spec 的 Token Contract 全表（39 个 `--apple-*`）与 Component Visual Defaults 将描述**已删除**的令牌，两份 spec 互相矛盾（新读者照 stitch spec 写即被本 change 门禁拦）→ 修订**并入本 change Task 7** 收口。
- **排期**：在途 PR **#2523**（mp-stitch-delta-fix）正在改同一文件，**先合 #2523**，再动该文件。

## D7 开工优先级 —— 本 change 先行（批次 0 立即），其余三件排队

- **决定**：`ui-apple-token-retirement` 先开工且**先做批次 0**（≤2h：止血 + 拍板材料齐备）；`rewrite-hard-constraints`（19）/ `pipeline-card-bg-static-bundle`（13）/ `add-account-name-source`（37）依次排队。
- **理由**：回潮已实证而门禁未上，每多等一个批次就多一批待收敛消费点，晚做更贵。
- **口径声明**：拆解文档 §7 问题 7 **未给推荐值**，本条为起草代理建议，用户可改。
