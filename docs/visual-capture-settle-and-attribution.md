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
（`pixel-diff` provider 至今不支持 mask，也确实不需要——至少不为这组数据需要。）

## 4. 相关门禁现状

- `test:all:visual` 已聚合四套共 **103** 例（views 35 + supplementary-views 19 +
  workflows 31 + supplementary-workflows 18），逐套输出
  `[VISUAL-SUMMARY] suite=… total=… passed=… failed=…`。
- CI 的采集步骤**自 2026-09-29 起是阻断门禁**（`Full visual suites (blocking gate)`）。此前它刻意 `continue-on-error: true`，因为基线尚未全部同源；现在 13 条非同源基线已换成同一次 CI 渲染并自证 0 px，于是摘掉该标志，并与 `.github/scripts/workflow-contract.test.js` 的反向断言**同 PR** 变更（加回 `continue-on-error` 会让那条合同测试变红——已实跑反证）。
  摘掉它必须与同源基线**同 PR**（否则会把「基线还没换」变成阻断红）。
  该约束由 `.github/scripts/workflow-contract.test.js` 断言锁住。
- 基线只能取自 CI artifact `visual-test-reports`（QM-4 第 7 条），禁止提交本地图。
