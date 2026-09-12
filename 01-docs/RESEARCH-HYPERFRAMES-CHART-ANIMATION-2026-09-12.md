# 研究报告与落地计划：基于 HyperFrames 的「图表动画」视频创作流水线

> 状态：**已确认**（2026-09-12 用户确认 Q1-Q5 全部按推荐方案执行：混合路线 / 6 种图表首期 / CreateView 通用编排 / 一并修复 11 处断点 / 首期无 AI 辅助）
> 日期：2026-09-12
> 关联：PRD-CHART-ANIMATION-2026-09-12.md（Phase 0 产出）、PRD-video-creation.md、PRD-remotion.md
> 上游项目：https://github.com/heygen-com/hyperframes（Apache 2.0）

---

## 一、HyperFrames 研究报告

### 1.1 项目定位与许可

HyperFrames（HeyGen 开源，49.1k stars，v0.8.35）的定位一句话：**"Write HTML. Render video. Built for agents."** —— 把 HTML/CSS/GSAP 写成的可 seek 动画确定性渲染成 MP4。

- **许可**：Apache 2.0（LICENSE:178，Copyright 2026 HeyGen, Inc.）。代码可自由复制、修改、再分发（保留版权声明即可），比 Remotion 的 source-available 收费条款干净，对我们移植图表动画代码非常有利。
- **形态**：TypeScript monorepo（bun workspace，Node >= 22）。核心包：engine（puppeteer ^25.8.0 + hono ^4.6.0 + linkedom ^0.18.12）、producer（渲染编排 + wawoff2 字体）、parsers（@babel/parser/acorn/recast）、studio（React 19 + Vite + CodeMirror 的可视化编辑器）。

### 1.2 核心架构

四个关键机制：

1. **Composition = 一个 HTML 文件**。元素用 `data-start` / `data-duration` / `data-track-index` 声明时间轴；`data-start` 支持命名引用语法（`"intro + 0.5"`，见 packages/parsers/src/compositionContract.ts:153-168）。
2. **确定性 seek 协议（精髓）**。页面暴露 `window.__hf = { duration, seek }`，渲染引擎逐帧调 `seek(t)`（packages/engine/src/services/frameCapture.ts:2571-2577），runtime 内部 `seekTimelineAndAdapters` 驱动 GSAP `tl.totalTime(t)`（packages/core/src/runtime/init.ts:3310-3379）。同一输入同一帧，渲染结果确定。
3. **渲染管线 6 阶段**（packages/producer/src/services/renderOrchestrator.ts:11-21）：compile（HTML 内联编译、子 composition 合并、CDN 脚本下载内联、远程媒体本地化、确定性字体注入）→ probe → extract videos → audio → capture（headless Chrome 逐帧截图）→ encode/assemble（FFmpeg）。
4. **参数化机制**。`data-composition-variables` 声明变量 + `data-variable-values` 覆盖，运行时经 `window.__hyperframes.getVariables()` / `window.__hfVariables` 读取——这是它的"数据驱动模板"机制。

### 1.3 图表动画能力盘点（重点）

HyperFrames **不是图表库**。registry 共 408 个 block，图表相关是手写 SVG+GSAP 的 HTML 片段。最有价值的三种模式：

| Block | 动画实现 | 数据输入 | 移植价值 |
|---|---|---|---|
| `bar-chart-race` 条形竞赛 | **closed-form 插值**：每周期 10 个关键帧预烘焙 rank（Bostock 算法），`render(t)` 纯函数驱动条目平滑换位（bar-chart-race.html:340-395） | 宽表字符串（`"名称: v1, v2, …"` 每行一系列）+ composition-variables（bar-chart-race.html:297-332） | ★★★ 数据驱动、算法可 1:1 移植 |
| `data-chart` 柱线组合 | 柱 scaleY 增长 + 折线 `strokeDashoffset` 描线 + 数字 count-up | 内嵌数据 | ★★ 编排手法可借鉴 |
| `mk-line-graph` 折线 | 1-2 序列描线，CSS 变量 `--mk-*` 换肤 | CONFIG 对象 | ★ 我们已有等价物 |

另有 `count-up`、`animated-bar-chart`、`chart-story`、`flowchart`、`conic-progress-ring`、`number-wheel`、地图类（us-map/world-map/spain-map）等组件可后续扩充。

### 1.4 与 Remotion 的关系

HyperFrames 是 Remotion 的**替代品**而非构建于其上（docs/guides/hyperframes-vs-remotion.mdx）。两者都是 headless Chrome + FFmpeg，区别在创作模型：

- Remotion = React 组件 + 帧号函数（`useCurrentFrame`）；
- HyperFrames = HTML + seekable timeline（GSAP）。

动画手法高度同构：Multi-Publish remotion-composer 的 LineChart 用 `strokeDasharray`/`strokeDashoffset` 描线（LineChart.tsx:298-313），与 hyperframes 的 `data-chart`/`mk-line-graph` 是同一手法。官方还提供 remotion-to-hyperframes 迁移指南（约 80% 机械翻译：`useCurrentFrame`/`interpolate` → timeline tween，`Sequence` → clips，帧→秒），证明双向移植可行。

### 1.5 Multi-Publish 现状：两条路径 + 一个已验证 bug

#### 路径 A：remotion-composer（成熟、已打通）

- `packages/remotion-composer/src/components/charts/` 已有 BarChart / LineChart / PieChart / KPIGrid 四种组件（components/charts/index.ts），场景类型 `bar_chart` / `line_chart` / `pie_chart` / `kpi_grid` 已注册（SCENE_TYPES.md:20-23）。
- 渲染链路已通：Python `video_compose.py` → `npx remotion render` → remotion-composer → MP4。
- 缺口：
  - `render-engine.js:101` 强制校验 `props.cuts` 数组（Explainer 专用），新流水线需要独立 Composition 与独立 props 校验；
  - 没有 bar-chart-race 这类高级动画（rank 交换、竞赛模式）。

#### 路径 B：hyperframes 集成（Phase 1 半成品，被 bug 阻塞）

- `packages/python-backend/src/multi_publish/video_creation/providers/video/hyperframes_compose.py` 已封装 `npx hyperframes` CLI（lint/validate/render/doctor/scaffold/add_block）。
- **已实测验证的 bug**：`video_compose.py:255` 与 `:1541` 导入 `multi_publish.video_creation.video.hyperframes_compose`——该模块不存在（真实路径在 `providers/video/` 下）。实测（`PYTHONPATH=src python -c`）：正确路径 import OK，代码里的路径 `ModuleNotFoundError`。异常被 `except Exception: return False` 吞掉，导致：
  - `_hyperframes_available()`（video_compose.py:248-259）恒为 False → `get_info()` 的 `render_engines.hyperframes` 恒为 False；
  - `_render_via_hyperframes()`（video_compose.py:1510-1546）走 "Could not import hyperframes_compose" 分支 → `render_runtime='hyperframes'` 必然失败。
  - **主入口当前根本调不到 hyperframes。**
- `hf_html_gen.py` 的 `cut_to_html` 仅支持 5 种形状：text_card / image-clip / video-clip / composition-clip / placeholder（hf_html_gen.py:36-145），**无图表 cut 类型**。
- 附带发现（**已实测验证，2026-09-12**）：`direct_clip_search.py:196/206/230`、`corpus_builder.py:203/217/243`、`corpus_builder.py:243`、`upscale.py:313`、`face_restore.py:128` 存在同类 legacy 导入模式（`video_creation.video.*`）。实测（`PYTHONPATH=src` 逐模块 import）：`providers.video.stock_sources` / `providers.video._shared` / `providers.video.clip_cache` 全部 OK；`video_creation.video.*` 三条路径全部 `ModuleNotFoundError`。**即 4 个文件共 11 处断点全部真实断裂**——`direct_clip_search`、`corpus_builder`、`upscale`、`face_restore` 的相关功能在运行时同样会静默失败（异常被吞）。同一根因（providers 目录重构后导入未同步）、同一修法（路径加 `providers.`），边际修复成本极低。
- 文档缺口：`hyperframes_compose.py:10-13` 引用的 `skills/core/hyperframes.md` 在仓库中不存在。

### 1.6 复用策略结论

| 维度 | 纯 Remotion | 纯 HyperFrames | **混合（推荐）** |
|---|---|---|---|
| 图表组件 | 4 种已有 | 全部从零 | 4 种复用 + race/count-up 移植 |
| 渲染链路 | 已通 | 需先修 bug | 已通（Remotion） |
| hyperframes 精髓 | 丢失 | 保留 | **算法层 100% 保留** |
| 数据输入 | 结构化 chartData | 宽表字符串 | 结构化 JSON + 表格粘贴解析 |
| 工期/风险 | 低 | 高 | 中 |

**推荐混合路线**：渲染引擎走 Remotion（复用已打通链路与 4 种图表组件），把 HyperFrames 的图表动画算法（bar-chart-race 的 closed-form 插值、count-up、柱线组合编排）作为 Apache 2.0 素材移植成 Remotion 组件；同时修复 hyperframes 导入 bug 让路径 B 未来可用。这同时满足"接近百分百模仿"（算法与视觉 1:1 移植）与"与其他流水线共通统一"（复用 Remotion 渲染、主题、流水线注册体系）。

---

## 二、落地计划

### 2.0 隔离与流程合规

- **Worktree 隔离**：`scripts/start-mp-task.ps1 -TaskName chart-animation-pipeline` → `D:/Data/projects/mp-worktrees/mp-chart-animation-pipeline`，分支 `codex/chart-animation-pipeline`。共享根保持 main 不动（当前 behind 6、有他人未跟踪文件，建 worktree 前先 fetch）。
- **流程合规**（M+ 复杂度 / 中风险）：
  - CCG task：`.ccg/tasks/chart-animation-pipeline/task.json`；
  - OpenSpec change：`/opsx:propose` 建 change（机制契约见 openspec/specs/openspec-integration/spec.md）；
  - PRD 先行（Phase 0）；
  - 双模型并行分析（opencode + Claude）+ 完成后双模型审查；
  - QM-1 打包验证（涉及 electron 主进程代码）；
  - CI 绿后合并，归档三同步（OpenSpec archive + CCG task 归档 + 质量节拍复盘）。

### 2.1 触碰文件清单（新增流水线最小改动集）

**必改（注册 + 元数据 + i18n）**

| 文件 | 改动 |
|---|---|
| `apps/desktop/electron/services/pipeline-engine.js` | PIPELINES 数组（:53）加 `chart-animation` 定义（name/description/category/stages/stageDefs/estimatedCost） |
| `apps/desktop/src/i18n/pipeline-labels.js` | PIPELINES 对象（:1）加 name/description/category/stages 键 |
| `apps/desktop/src/locales/zh.js` | `pipelines.names`（:765）加 `'chart-animation': '图表动画'`；descriptions 同步 |
| `apps/desktop/src/locales/en.js` | 同结构加 `'Chart Animation'`（zh/en 必须成对，CI Gate 7 拦截） |

**选改（渲染 + stage + UI）**

| 文件 | 改动 |
|---|---|
| `packages/remotion-composer/src/Root.tsx` | 加 `<Composition id="ChartAnimation">`（:140-362 区域） |
| `apps/desktop/electron/services/composition-manager.js` | 加 Composition 元数据（:13） |
| `apps/desktop/electron/core/container.setup.js` | import 并调用 `registerChartAnimationStages(engine)`（:156-166 区域） |
| 新增 `apps/desktop/electron/services/chart-animation-stages.js` | 自定义 stage 注册（参照 story2video-stages.js 模式） |
| 新增 `packages/remotion-composer/src/components/charts/BarChartRace.tsx` 等 | HyperFrames 算法移植组件 |
| `apps/desktop/src/views/video-creation/PipelineSelector.vue` | STABILITY_MAP（:82-88）加稳定性标记 |

**Bug 修复（独立提交）**

| 文件 | 改动 |
|---|---|
| `packages/python-backend/src/multi_publish/video_creation/providers/video/video_compose.py` | :255 与 :1541 导入路径改为 `providers.video.hyperframes_compose` |
| 新增回归测试 | 真实 import 断言（非 mock），`_hyperframes_available()` 反映真实可用性 |

### 2.2 Phase 0 — PRD + 规格（0.5 天）

产出 `01-docs/PRD-CHART-ANIMATION-2026-09-12.md`，写到可验收粒度：

- **产品定位与目标用户**：知识类/财经/数据解读短视频创作者；
- **图表类型矩阵**（首期）：bar_chart / line_chart / pie_chart / kpi_grid / bar_chart_race / count_up；
- **数据契约**：JSON Schema（series/periods/valueFormatter/theme），逐字段校验规则、错误码、fail-closed 行为；粘贴表格文本（CSV/TSV）解析规则与容错（引号、千分位、百分号、空行）；
- **交互逻辑**：完整状态机（数据输入→解析校验→字段映射→时间轴配置→预览→渲染→输出→发布）；
- **显示项与提示文字**：zh/en 成对，含校验错误、空态、加载、渲染进度、成功/失败文案（全部进 locales，渲染端禁止中文字面量）；
- **验收标准与测试场景映射**：每条验收标准 → 对应测试用例（单测/契约/视觉）。

### 2.3 Phase 1 — 修 bug + 流水线注册（0.5 天）

1. 修 `video_compose.py:255/:1541` 导入路径；回归测试用真实 import（非 mock）断言 `_hyperframes_available()` 不再恒 False。
2. `pipeline-engine.js` PIPELINES 注册 `chart-animation`（stages：数据输入→场景构建→校验预览→渲染→输出），`container.setup.js` 接线。
3. i18n 成对：`pipeline-labels.js` + `zh.js`（图表动画）+ `en.js`（Chart Animation）+ 其他语言按此名翻译；`PipelineSelector.vue` 稳定性映射。

### 2.4 Phase 2 — 图表场景扩展（核心，1.5 天）

1. 新增 `ChartAnimation` Composition（`Root.tsx` + `composition-manager.js`），独立 props 校验（绕开 Explainer 的 `props.cuts` 强校验）。
2. 移植 HyperFrames 算法为 Remotion 组件：
   - `BarChartRace`：closed-form 插值（每周期 10 关键帧、rank 预烘焙）改写为 `useCurrentFrame` 驱动的纯函数渲染；
   - `CountUp`：数字滚动（easeOutExpo + 千分位格式化）；
   - 柱线组合编排（`data-chart` 模式：scaleY 增长 + strokeDashoffset 描线）。
3. 数据层：结构化 JSON 校验器（fail-closed，错误码化）+ CSV/TSV 粘贴解析器。
4. 复用现有 4 种图表组件与主题系统（THEMES），新组件遵循同一 props 契约。

### 2.5 Phase 3 — 渲染打通 + UI（1 天）

- `chart-animation-stages.js` 自定义 stage（参照 story2video-stages 模式）→ 渲染走 RenderEngine（Remotion CLI）→ 输出 MP4 入项目库。
- CreateView 通用编排接入（不建独立页面，待 Q3 确认）；进度推送走现有 `pipeline:update`（500ms 节流）。
- 预览：低帧率快速预览（Remotion still/低 fps 段渲染）。

### 2.6 Phase 4 — 测试 + 文档 + 交付（1 天）

- **单测**：数据校验器（合法/非法/边界）、CSV 解析（脏数据）、BarChartRace 插值算法（rank 交换正确性、首末帧状态）、stages 执行器。
- **契约测试**：`electron/tests/pipeline-chart-animation-contract.test.js`（注册完整性、i18n 成对、props 校验）。
- **视觉**：图表关键帧截图基线（`--single` 模式）。
- **QM-1**：`pnpm exec electron-builder --win --x64` 打包验证（改了 electron 主进程代码）。
- **双模型审查**（opencode + Claude 并行）→ PR → CI 绿 → 合并 → 归档三同步。
- **记忆更新**：hyperframes 架构要点、导入 bug 根因、混合路线决策依据。

**总计约 4.5 天**，里程碑可按 Phase 切分交付。

### 2.7 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| Remotion Composition props 校验与 Explainer 耦合（render-engine.js:101） | 中 | 新增独立 Composition 分支 + 独立校验器 |
| bar-chart-race 算法移植帧对帧偏差 | 中 | 单测锁定关键帧状态（首帧/末帧/rank 交换点） |
| i18n 成对遗漏（CI Gate 7） | 低 | zh/en 同时改 + 本地跑 check-locale-sync.js |
| legacy 导入路径同类 bug（4 个文件 11 处，已实测全部断裂） | 低 | 本次一并修复（同根因同修法），回归测试覆盖真实 import |
| 共享根 behind 6 + 他人未跟踪文件 | 低 | 先 fetch，worktree 从 origin/main 建，不碰共享根 |

---

## 三、决策问题（待用户确认）

❓ **Q1 - 渲染路线**：混合路线（Remotion 渲染 + HyperFrames 算法移植）是否接受？还是坚持纯 HyperFrames（需先修 bug + 从零建 HTML 图表生成层，工期约翻倍）？
➡️ 推荐：混合路线。

❓ **Q2 - 首期图表范围**：Phase 2 清单（4 种复用 + bar_chart_race + count_up）是否合适？还是需要增删（如 flowchart、地图）？
➡️ 推荐：按清单，地图/flowchart 留二期。

❓ **Q3 - UI 形态**：接入 CreateView 通用编排（与其他流水线统一、无独立页面），还是建独立 `/chart-animation` 页面（自由度高但重复造轮子）？
➡️ 推荐：通用编排接入。

❓ **Q4 - bug 修复范围**：只修 `video_compose.py` 两处 hyperframes 导入，还是顺带审计修复同类 legacy 路径（direct_clip_search/corpus_builder/upscale/face_restore）？
➡️ 推荐（已按实测证据更新）：本次一并修复全部 11 处——已实测确认 4 个文件 11 处断点全部真实断裂，同一根因（providers 目录重构后导入未同步）、同一修法（路径加 `providers.`）、边际成本极低，且 `direct_clip_search`/`corpus_builder` 属视频素材检索链路，与本流水线数据输入体验相关。

❓ **Q5 - 数据输入方式**：首期支持"结构化 JSON + 粘贴表格文本"两种，是否需要 AI 辅助（自然语言→图表数据）？
➡️ 推荐：首期不做 AI 辅助，保持确定性。

---

## 附：调研方法与证据边界

- 调研方式：两个并行子代理（外部项目调研 + 本地流水线架构调研），主代理交叉验证关键结论。
- 已实测验证：hyperframes 导入路径 bug（`PYTHONPATH=src python -c` 实测，providers 路径 OK / legacy 路径 ModuleNotFoundError）。
- 已实测验证（2026-09-12 补充）：4 个同类 legacy 导入文件共 11 处断点全部真实断裂（providers 路径 OK / legacy 路径 ModuleNotFoundError，逐模块 import 实测）。
+- 未验证（标注为推断）：hyperframes registry 图表 block 的完整数据契约（建议按需深读 bar-chart-race.html 与对应 mdx）。
- 本文档为 docs-only 变更，按项目分层分支策略在 main 直接提交。
