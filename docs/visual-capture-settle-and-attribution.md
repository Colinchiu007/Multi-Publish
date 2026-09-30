# 视觉用例的两条截图路径与「确定性渲染收口」

> 适用范围：`apps/desktop/tests/visual-testing/`。本文记录一次真实归因纠正：
> 同一个「视觉差异超过阈值」的报错文案下，藏着两类完全不同的成因。

## 1. 两条截图路径，只有一条做了收口

| 路径 | 入口 | 是否经过 `settleForCapture()` |
| --- | --- | --- |
| 视图快照 | `test-runner.js` → `_navigateToRoute()` → 截图 | ✅（收口原先就写在这个方法体内） |
| 工作流末态 | `workflows/all-workflows.visual.test.js` → `captureWorkflowScreenshot()` → `runner.page.screenshot({ fullPage: true })` | ❌ 本 PR 之前完全绕过 |

`settleForCapture()` 做五件事，缺一件就会拍到中间态：

1. `document.fonts.ready` + 双 `requestAnimationFrame` —— 等字体与稳定帧；
2. 注入 `*,*::before,*::after{transition:0s!important;animation:0s!important;…}` ——
   `reducedMotion` 只是媒体偏好，业务 CSS 不响应它时动画照旧在截图窗口内跑；
3. `window.scrollTo(0, 0)`；
4. `VISUAL_CAPTURE_SETTLE_MS`（默认 300ms）；
5. `waitForLoadState('networkidle')`（5s 上限，持续轮询的视图永不 idle，超时忽略）。

第 2 步的历史事故写在 `test-runner.js` 的注释里：`/create` 在两次运行间
`misMatch` 从 0.026% 摆到 9%。工作流侧因为绕过它，症状变成「末态整页半透明、
下半屏区块尚未出现」。

## 2. 归因方法：把总百分比拆成可加和的两两差链

CI 一次报 10 条工作流红，阈值 1%。**不要**按报错文案归类，要测三个数：

| 记号 | 含义 | 工具 |
| --- | --- | --- |
| `X` | 仓库基线 vs CI 渲染的默认视图 | `pixelmatch(base-screenshots/<b>.png, artifact/screenshots/<v>.png)` |
| `Y` | CI 渲染的默认视图 vs CI 渲染的工作流末态 | `pixelmatch(artifact/screenshots/<v>.png, artifact/screenshots/workflows/<w>--step-1-current.png)` |
| `Z` | 仓库基线 vs CI 渲染的工作流末态（= CI 报的那个数） | 同前 |

`X + Y ≈ Z` 时链条自洽，然后按形状分类：

- **`X` 占满全部差额、`Y ≈ 0`** ⇒ 基线不是 CI 渲染的（QM-4 第 7 条），末态本身是对的。
  处理：重建同源基线，**不要**动阈值。
- **`X ≈ 0`、`Y` 占满差额** ⇒ 基线已同源，末态本身不对。
  处理：查截图路径的收口/等待，**不要**改基线——那会把错误状态钉成契约。

本次实测（run `36490844190`，main `633ee1c2`）：

| 用例 | X | Y | Z | 判定 |
| --- | --- | --- | --- | --- |
| publish-* ×6 | 1.119% | 0 – 0.157% | 1.073 – 1.120% | 基线非同源 |
| cloud-publish-* ×3 | 2.160% | 0.105 – 0.157% | 2.162 – 2.240% | 基线非同源 |
| dashboard-benchmark-title-reset | **0.034%** | **10.842%** | 10.876% | **收口缺失** |

## 3. 一条被推翻的结论：所谓「709 px 噪声地板」

本文档 #2623 那一版写过：`dashboard` / `collection` / `create-pipeline` / `create-history`
四条已同源基线仍稳定差 **709 px / 0.034%**，包围盒固定在顶部标签栏 + 面包屑，因此推断
「该区域有动态元素，正解是给 `pixel-diff` provider 加 mask」。**这个推断是错的，且错得有代表性。**

反证只需一次跨 run 对照（同一页面、三次不同时间的 CI 渲染，`pixelmatch threshold 0.1`）：

| 视图 | run 22:11 ↔ run 00:44 | run 00:44 ↔ run 20:47 | 仓库基线 ↔ 最新 CI 渲染 |
| --- | --- | --- | --- |
| collection | 0 px | 0 px | 32614 px（1.573%） |
| create-pipeline | 0 px | 0 px | 4013 px（0.194%） |
| intelligence | 0 px | 0 px | 4013 px（0.194%） |
| dashboard | 0 px | 0 px | 175 px（0.008%） |

CI 渲染**两两 0 px** ⇒ 该区域根本没有动态元素；漂移全部来自**基线侧被换过**。
具体是 #2685 用本机 `test:visual:update-baseline` 重捕了 17 张基线（提交信息写的是「同源刷新」），
而本机渲染 ≠ CI 渲染。至于当初的 709 px：那只是**当时那张陈旧基线**的漂移量，换图后同一处变成 175 px——
它从来不是"地板"，只是漂移的瞬时值。

**方法论教训**：把一组非零差值解释成「不可消除的噪声」之前，必须先做一次
「同一输入重复两次是否相同」的**可重复性**测量。只测「基线 vs 一次渲染」就断言噪声地板，
等于用单个样本的残差给噪声定性质。

**正解不是 mask，而是让漂移即红**：`scripts/check-baseline-freshness.js` 断言每张被跟踪基线
逐像素等于**同一次 run** 的 CI 渲染，接在 Visual Tests 采集步骤之后以阻断形态运行。
（`pixel-diff` provider 至今不支持 mask。）

**但别把这条否证过度推广成"本仓没有动态元素"。** 本门禁上线后的第一次运行就抓到 `keyword-monitor`
相对**本次 run** 的渲染差 140 px，包围盒固定在 (463,411)→(520,418)，内容是一行
「最后检查: 2026-09-29T21:28:06.674Z  采样: 12 条」——精确到毫秒的实时时间戳，其基线在数学上不可复现。
跨 run 对照（46 个视图 × 两次 CI run）确认**只有这一张**不稳定，其余 45 张逐字节相同。

> **更正（2026-09-30，同一 PR 内第二次自我推翻）**：上面那句「只有这一张不稳定」的**测量域只有浅色**。
> #2709 把暗色套接入像素门禁后，同一视图的 `keyword-monitor-dark.png` 相对 main tip 的 CI 渲染
> 差 **127 px**，包围盒 (463,410)→(528,418)，就是同一行时间戳的暗色反色版本。
> 教训不是"漏了一张图"，而是**结论的适用范围必须和测量域一起写出来**：
> 只测浅色就写"本仓只有这一处动态"，等于把"我没测"写成了"不存在"。

两类问题的处置必须分开：陈旧基线 → 按同一次 run 的 CI 渲染重建；实时值 → **在采集层把时钟钉住**（正解，见 §3.2）。
`KNOWN_DYNAMIC` 的带预算例外只作为"确实钉不住时"的过渡机制保留，现由用例断言清单为空。
提阈值与"无预算的忽略区"都不接受：前者关掉判据，后者把"会变"偷偷变成"变多少都行"。

### 3.1 门禁第一次套到 origin/main 的实测（为什么需要它）

把本 PR 的脚本指向 **origin/main 的基线** × **main tip 自己那次 CI 渲染**（run 36646007705），
当场报出 **8 张违规**，而同一次 run 的 `Full visual suites (blocking gate)` 是 success：

| 基线 | 漂移 | 为什么阈值门禁看不见 |
| --- | --- | --- |
| collection.png | 32614 px / 1.573% | 阻断门禁阈值 6%，新鲜度要求 0 px |
| create-editor / create-history / create-pipeline / intelligence | 各 **4013 px / 0.194%**（同一个数） | 同一条带 y422–878 左侧列：一个共享元素变了 |
| create-result.png | 6175 px / 0.298% | 同上，另加两处小区块 |
| dashboard.png | 175 px / 0.008% | (432,614)→(476,635) 一块 45×22 文本 |
| keyword-monitor-dark.png | 127 px / 0.006% | 真时钟驱动，最终在采集层钉住（见 §3.2），不靠预算 |

「四张不同视图的漂移量**精确相等**」本身就是证据：那不是噪声的形状，是同一个共享 UI 元素
（新平台项进入列表）在四页各渲染一次的结果。6% 阈值对 0.194% 完全失明，
而"必须逐像素等于本次渲染"当场把它抓住——这就是本门禁存在的理由。

（本段写于 2026-09-30 上午，当时把 `keyword-monitor-dark` 登记进了 `KNOWN_DYNAMIC`；
同日下午该例外被整体删除，根因修复见 §3.2 —— 保留这段是为了留下"用预算掩盖根因"这条弯路本身。）

## 3.2 真正的根因：五张视图把墙上时钟画进了像素

门禁在自家 PR 的 run 上判红 5 张，而不是我登记的那 1～2 张。做一次**同 UI 跨 run** 的两两对照（两次 run 只差一个自然日：23:35 与次日 16:13）：

| 视图 | 跨 run | 现场 |
| --- | --- | --- |
| `keyword-monitor` / `-dark` | 漂移 | 一行 `最后检查: <ISO 毫秒戳>`，值随拍摄时刻 |
| `calendar` / `-dark` | 漂移 714 px / 24578 px | 「今天」高亮随日期移动，暗色整片月历反色 |
| `home-baseline` | 漂移 573 px | 按时段切换的问候语：23:35 拍是「晚上好」，16:13 拍是「下午好」 |
| 其余（`collection` / `dashboard` / `intelligence` / `accounts-list` …） | **0 px** | 渲染本身是确定性的 |

结论：**漂移完全来自时钟，不存在"不可消除的噪声"**。也因此，任何"漂移预算"都不可能有正确上界——它取决于两次 run 隔多久；跨日时 `calendar-dark` 一次就要 1.167%，把预算抬到覆盖最坏情形等于对该视图关掉检查。

**正解落在采集层**：`test-runner.js` 的 `_installCaptureClock()` 在**建页之后、任何导航之前**调用 Playwright 的 `page.clock.setFixedTime()`。选它而不是 `clock.install()` 的理由写在宿主 d.ts 原文里：`setFixedTime` "Makes `Date.now` and `new Date()` return fixed fake time at all times, **keeps all the timers running**" —— 只钉日期、计时器照常跑，因此 `settleForCapture()` 的双 rAF 与 `waitForTimeout` 不受影响；`install()` 会连 `setTimeout`/`requestAnimationFrame` 一起接管，不主动推进就永不触发，等于把就绪逻辑整条掐断。

本机 A/B 实测（两次拍摄间隔 2.5 s，跨秒）：

```
keyword-monitor [off] 两次拍摄不同 ❌   页面 Date: …16:41:27.570Z / …16:41:52.876Z
keyword-monitor [on] 两次拍摄逐字节相同 ✅   页面 Date: 2026-01-01T00:00:00.000Z（两次）
home-baseline  / calendar 同：off 必不同、on 逐字节相同
```

三条配套约束：
① `VISUAL_CAPTURE_FIXED_TIME_ISO=off` 可显式关闭（用于复现"未钉住"这一侧），**写了非法值一律抛错**——静默退回未固定会把基线重新变成跨日必漂，而没人会去查门禁为什么红。
② 宿主不提供 `page.clock` 时不抛错但必须 `console.warn` 出声（观察者要报告自己的失明）。
③ `KNOWN_DYNAMIC` 清空后由 `check-baseline-freshness.test.js` 断言「必须为空」；预算机制的用例改用**合成条目**驱动，不再借生产清单取键——否则清单为空时那条测试会静默变成空跑。

反证三条均已实跑：摘掉 `launch()` 里的装时钟调用 → 只红「接线锁」1 条；把 `_installCaptureClock` 改成恒 `null` 的 no-op → 红 3 条（默认钉住 / 非法值抛错 / 宿主失明）；摘掉非法值的 `throw` → 红 1 条。

另记一条探针教训：第一次定位包围盒时我读的是 `pixelmatch` 的 diff 图，得到"每张都差整页"——
因为 pixelmatch 会把**匹配**的像素也暗化写进 diff 图，`>0` 判据恒真。改成直接逐像素比较两张原图
才拿到上表那些有意义的包围盒。**探针测错变量时报错方式是"什么都不奇怪"，而不是"明显不对"。**

## 4. 相关门禁现状

- `test:all:visual` 已聚合四套共 **103** 例（views 35 + supplementary-views 19 +
  workflows 31 + supplementary-workflows 18），逐套输出
  `[VISUAL-SUMMARY] suite=… total=… passed=… failed=…`。
- CI 的采集步骤**自 2026-09-29 起是阻断门禁**（`Full visual suites (blocking gate)`）。此前它刻意 `continue-on-error: true`，因为基线尚未全部同源；现在 13 条非同源基线已换成同一次 CI 渲染并自证 0 px，于是摘掉该标志，并与 `.github/scripts/workflow-contract.test.js` 的反向断言**同 PR** 变更（加回 `continue-on-error` 会让那条合同测试变红——已实跑反证）。
  摘掉它必须与同源基线**同 PR**（否则会把「基线还没换」变成阻断红）。
  该约束由 `.github/scripts/workflow-contract.test.js` 断言锁住。
- 基线只能取自 CI artifact `visual-test-reports`（QM-4 第 7 条），禁止提交本地图。
