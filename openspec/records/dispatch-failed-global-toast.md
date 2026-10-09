---
sync_reason: 远程同步 PENDING——PR 开启中；合并后状态列改写 PASS + merge SHA，并同一次提交删除 gate-record-debt-ledger.json 登记项（回填与销账必须同一次发生）
sync_backfill_owner: agent（PR 合并后回填）
---

# 定时派发失败的全局提示（dispatch-toast-global-listener，2026-10-09）

## 任务与产品决策

用户提出：「结果面板的失败详情展示」要不要做，需要定优先级。取证结论与产品取舍：

**不做「结果面板展示平台拒收详情」**。结果卡是当次操作的同步快照——用户看到
「⏰ 排期已创建」时平台还没来得及拒收；拒收真正发生（分钟级）后用户早就不盯着那张卡。
往结果卡里塞「之后的失败」= 让 UI 展示它不知道的事，与已修掉的「假成功」（把受理中
渲染成已成功）是同一种语义错位、只是反方向。结果卡的职责到「查看发布记录」跳转为止。

**改为补真正缺口：失败通知的全局性**。失败信息有三条既有通路，覆盖是补丁式的：

| 失败类型 | 现有通路 | 缺口 |
|---------|---------|------|
| 提交前同步失败（时间非法/平台不支持） | 当场 toast + 结果卡红标（usePublishFlow.js:491-496） | 无 |
| 平台异步拒收（如头条 code=7050，创建成功后队列提交阶段） | 主进程 `scheduler:dispatch-failed` 广播（scheduler.js:23-31，PRD 遗留表 #4 当时的修复） | **渲染端只有发布日历页在监听**（Calendar.vue:341）——用户排完期去别的页面就收不到任何提示 |
| 失败详情存档 | 发布历史永久留痕 | 被动，需用户主动查 |

hint 文案「失败原因会记录在发布记录中」本质是在承认「我们不会主动告诉你」。

## 改动清单

1. **App.vue（壳层）**：onMounted 订阅 `api.onSchedulerDispatchFailed`，任何页面收到
   拒收信号 → `notifyError('appShell.scheduleDispatchFailed', { platform, reason })`；
   onBeforeUnmount 解绑。preload 未暴露该能力（老版本兼容）时静默跳过，不影响挂载。
   主进程与 preload **零改动**（广播本来就发给主窗口全部 webContents）。
2. **zh/en 词条成对**：新增顶层命名空间 `appShell.scheduleDispatchFailed`。
   与 `calendarPage.scheduleDispatchFailed` 职责不同：那条在日历页内弹并刷新日历
   （含「请重新排期」操作指引）；这条是全局兜底，不提重排（用户可能不在排期语境，
   只告知事实 + 指向发布记录）。
3. **日历页零改动**：既有监听保留（页面内刷新联动是它独有的价值）。用户停留在
   日历页时会收到**两条不同文案的 toast 并存**（App 级兜底 + 日历级含「请重新排期」
   指引）——这是已接受的取舍，不是缺陷：useNotify 未开启 ElMessage grouping
   （EP 2.x 默认 false，已核验），且两条文案刻意不同，本就不存在「同文案合并」。
   评审核验后修正了初稿「ElMessage 同文案合并去重」的失实表述。
   单实例前提（claude MAJOR-3 核验结论）：主进程广播只发 `getAllWindows()[0]`
   主窗口（scheduler.js:16/27），home-shell 是独立 WebContentsView 收不到广播；
   主窗口内 App 由 main.js createApp 单例挂载，无重复订阅路径。
4. **测试**：`src/App.dispatch-failed.test.js` 新建（TDD 先红 6/6 → 后绿 6/6）：
   - 行为 4：挂载即订阅 / 收到信号弹错误 toast（断言 key 与 platform/reason 参数）/
     卸载解绑（**真断言**：stop 被调用 1 次 + 卸载后手动触发广播 notifyError 不再被调
     ——初稿此用例是空断言假绿，两家族评审共同抓出后重写）/ preload 缺能力时静默兼容。
     App 级挂载需装配 i18n 插件（App.vue 用 `useI18n()` 组合式 API）与 vue-router mock
     （`afterEach` 必须返回解绑函数——`useSpaNavHistory.attach()` 会保存其返回值调用）。
   - 结构 2：App.vue 必须引用 `onSchedulerDispatchFailed`（防监听漂回页面级）；
     zh/en `appShell` 词条**块内归属**断言（抽取 appShell 块内容再断言 key 与
     `{platform}`/`{reason}` 占位符都在块内——初稿两个独立断言防不了「appShell 空对象」
     假绿，两家族共同抓出后收紧）。
   - useNotify 契约核验（opencode MAJOR-4）：`notifyError(messageKey, {fallback, params})`
     首参为 i18n key、fallback 仅在 key 未命中且 level=error 时兜底（useNotify.js:38-44）、
     params 经 notifyCore.resolveNotifyText 真插值——App.vue 调用形态与契约一致。
5. **PRD 遗留表 #4** 补全局化收尾说明（含双 toast 并存取舍）。

## 不做什么

- 不改结果面板（理由见上，产品决策）；
- 不改主进程广播与 preload（能力已存在）；
- 不动日历页既有监听与测试（36/36 全绿，行为未变）。

## 远程同步

| 远程同步 | PENDING |
|--------|---------|
| 回填约定 | 合并后本行状态列改写 `PASS` + merge SHA，并同一次提交删除 `scripts/gate-record-debt-ledger.json` 登记项（回填与销账必须同一次发生） |

## 验证

- 新测试 6/6（先红后绿）；Calendar.test.js 36/36（既有监听行为未变）；
- eslint 0 error（1 warning 为 main 既有代码 286 行 catch(e)，本次 diff 未触及）；
- 全量回归与门禁见 .quality-gates.md 本条执行记录。
