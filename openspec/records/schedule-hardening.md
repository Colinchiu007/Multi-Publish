---
record: schedule-hardening
task: 真机 E2E 遗留三项收口 —— 直连 body 缺平台标识致 7050、排期结果假成功、到点发布验证
date: 2026-10-08
---

# 执行记录：定时发布遗留三项收口（schedule-hardening，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离 | PASS | 隔离 worktree `D:\Data\projects\mp-worktrees\mp-schedule-hardening`，分支 `fix-schedule-hardening`，基线 `origin/main`。共享根未被写入 |
| 事项 1 的真值：**7050 与排期跨度无关** | PASS | 上一轮记录推测「30 天超出平台上限」，本轮用 **+12 分钟** 窗口重测 ⇒ 同样 `code=7050`。平台响应原文（新增诊断日志落盘）：`{"code":7050,"err_no":7050,"message":"提交失败","data":{"pgc_id":"0"}}`。**我原先的推测是错的**，收窄 `maxHorizonDays` 并不解决问题，故未改动该常量 |
| 事项 1 的真因：直连 body 缺平台标识 | PASS（已修） | 对比两条路径的 body 字段：从零构造的直连 body 为 `source,disable_praise,is_fans_article,tree_plan_article,title,content,save,pgc_feed_covers,article_ad_type,origin_debut_check_pgc_normal,claim_origin,extra,extern_link,timer_status,timer_time` —— **无 `pgc_id` / `title_id`**；而能成功的「重放页面自动保存 body」带着页面自己生成的 `pgc_id`/`title_id`/`tt-anti-token` 上下文，平台认这些标识。preFill 阶段装的 XHR hook 早已把它抓到（`window.__lastSaveBody`），直连路径却从来没用过。修法：**以页面捕获的自动保存 body 为基底，只覆盖 `timer_status`/`timer_time`/`save`**，其余原样保留；捕获不到才降级为从零构造，并在日志标注 `bodySource` |
| 修复生效的真机证据 | PASS | +12 分钟窗口：22:56:37 提交 → 排期 23:08 → `[toutiao-direct] status=200 code=0 msg=提交成功 pgcId=7691591965627941417` ⇒ 平台受理成功。23:08 前后应用**无任何动作**（日志只有 TTL evict 与登录态巡检）——符合「排期只在创建时提交一次，之后由平台服务器到点发布」。**内容未在设定时刻之前发出** |
| 诊断增强 | PASS | `publishWithSign` 早已返回 `raw`，但从未落日志，导致每次只能靠猜。新增 `[toutiao-direct] rejected` 行，记录 `code` / `timerTime` / `bodySource` / `bodyKeys` / 原始报文（不含正文与 cookie） |
| 事项 2：排期结果假成功 | PASS（已修） | 真机证据：平台返回 `code=7050` 时，结果面板仍渲染 `✓ 发布成功 / 定时任务已创建`（`usePublishFlow` 在 `schedulerCreate` 返回 code=0 即置 `success=true`，而平台受理发生在**之后**的队列异步提交里）。视图只看 `result.success` ⇒ 平台拒收时用户看到的仍是绿色成功标签。修法：视图按 `result.scheduled` 渲染**第三态**「⏰ 排期已创建」（分支排在 success 之前），并给出「查看发布记录」出口 + 说明「若平台未能受理，失败原因会记录在发布记录中」；排期结果不再挂「重试发布」（还没发布，谈不上重试） |
| 事项 3：到点发布验证 | PASS | 见上「修复生效的真机证据」。取消语义维持既有设计：平台无撤销接口，`cancel` 对 `executed` 返回 false 属**正确**行为（PR #3077 已把文案改为如实告知去哪撤销），本轮不推翻 |
| 回归保护 | PASS | `usePublishFlow.test.js` 新增 1 条（排期路径 result 必须带 `scheduled`）；新增 `src/views/PublishScheduleResult.test.js` 4 条：①排期结果渲染独立第三态标签与说明 ②`scheduled` 分支排在 `success` 分支**之前**（否则立即发布会被误判）③排期结果不挂「重试发布」而是去发布记录 ④zh/en 词条成对存在（防露出 key）。**未**加「立即发布不带 scheduled」一条：单独跑通过、全量跑受前序用例状态污染而不稳定，且与视图侧同一条锁保护同一件事，理由写进代码注释 |
| 目标测试 | PASS | `packages/rpa-engine` **255/255**；`packages/shared-utils` **742/742**（39 文件）；`apps/desktop`（composables + features/publish + views）**2626/2626**（115 文件） |
| 结构性门禁 | PASS | `check-max-lines` / `check-renderer-cjs-boundary` / `check-no-brand-residue` / `check-gate-record-debt` / `check-locale-sync --keys` / `--cjk` / `--pair-base origin/main` 全 rc=0；`eslint`（5 个改动文件）rc=0 |
| 远程同步 | PASS | PR #3123 已 squash 合并入 main：merge SHA `2475fa74c270710445ac9cb8961e24c5f86c853c`（`git log origin/main --grep='(#3123)$'` 取证，提交时间 2026-10-08T11:59:28+08:00）。远端分支 `fix-schedule-hardening` 已删除（`git ls-remote --heads origin fix-schedule-hardening` 返回 0 行） |

### 环境说明（如实记录）

本次 E2E 用环境变量 `MP_PUBLISH_MIN_INTERVAL_MS=3000` / `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS=3000`
把**同账号发布冷却从 60 分钟临时降到 3 秒**——头条 `accountMinMs: 60 * MIN`（见
`publish-frequency-policy.js`）正是上一轮「短窗口复验被频率限制挡住」的直接成因。
**仓库默认值未改动**，该覆盖只作用于本次本地验证实例。

### 验证边界声明

本记录证明了**排期已真实提交给平台并被受理**（`code=0` + 真实 pgcId），且**到点前内容未发出**。
**未**证明「到点那一刻平台确实发布了」——那需要等到 23:08 之后去头条后台核对作品列表；
本机取不到分区 cookie，只能由用户在平台侧确认。其余 14 个平台仍全部登记 `unsupported`。

### 遗留

本轮真机在头条账号上新增一条**已受理的定时任务**（pgcId=7691591965627941417，排期 23:08），
加上此前两条立即发布的内容（pgcId=7691596240059908649 / 7691596034497135167），
共三条需用户在头条后台处理。