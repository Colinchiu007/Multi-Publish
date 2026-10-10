# 影视工程「自动模式」+ 三标签重组 · 设计方案（PRD 草案）

> **状态**：待 CCG 决策层对抗评审 ｜ **基线**：`main@f493e7ec6`（2026-10-09）｜ **分支**：`film-auto-mode`（worktree `mp-film-auto-mode`）
> **取证口径**：本方案所有现状结论均带 `文件:行号`，在基线 `f493e7ec6` 上复验。

---

## 一、目标与范围

### 1.1 一句话目标

把影视工程页从「单视图（画布）」重组为「三标签 Hub（自动 / 画布 / 工程案例）」，并新增**自动模式**：用户只给①剧本 ②人物参考图（可选）③场景参考图（可选）④横竖屏 ⑤大概时长，其余全部由程序完成分镜规划、参考图绑定、批量出片与合成；生成后可对**单个片段**编辑提示词并重生成、重试、重新合成。

### 1.2 硬约束（来自任务书）

| # | 约束 | 落实方式 |
|---|---|---|
| C1 | 自动模式「越简单越好」 | 输入仅 5 项；其余全部自动；确认卡一次（聚合），不再逐批确认 |
| C2 | **必须全部应用影视工程底层基础与逻辑**，不是新写一条平行流水线 | 复用 kit 模板块结构、剧本套用引擎、角色映射、参考令牌、参考图注入、成本闸、分批驱动+台账+断点续跑、磁盘为真、单镜重试、concat/归一合成（§6 逐项映射） |
| C3 | 生成后可修改调整某个片段 | 片段列表 + 编辑提示词/参考图/时长 → 单镜重生成 → 重新合成（§4.7） |
| C4 | 复用「故事讲述流水线」进度流程与成品编辑（可编辑片段） | 进度复用 `StageProgress.vue`（已有跨流水线先例）+「事件推送优先 + 3s 轮询兜底 + runId 守卫」模式；编辑区沿用其「分段编辑」交互范式，数据落在影视工程自己的契约上（§6.3） |
| C5 | 现有画布 → 第 2 标签「画布」；画布之前的页面 → 第 3 标签「工程案例」 | §3.2；工程案例 = 现行 `FilmEngineeringView.vue`（取证：画布 PR #2342 未删除任何三栏功能，classic 页与画布前基线功能集合相同） |

### 1.3 非目标（明确排除）

- 不改 kit 数据资产与 schema（`kit-loader.js` 五组校验不动）
- 不改 `film_load_template / film_adapt_script / film_select_shots / film_export_prompts / film_generate_videos / film_render` 六阶段的既有语义与 checkpoint 契约
- 不改经典视图的两个既有面板（分镜视频生成 ≤10 镜 / 全量分批出片）与其 IPC
- 不做视频剪辑（转场/调色/字幕/音轨）；自动模式成片仍为「按序拼接」
- 不引入新 provider 能力探测：参考图注入仍只支持 `minimax / agnes-video / agnes-multimodal`（`video-reference-inputs.js:30-34`）

---

## 二、现状取证（基线 `f493e7ec6`）

### 2.1 路由与视图

| 项 | 位置 | 现状 |
|---|---|---|
| `/film-engineering` | `src/router/index.js:52`、`src/config/route-registry.js:300-307` | → `FilmCanvasView.vue`（画布，暗路由，`entryFrom: '/create'`） |
| `/film-engineering/classic` | `src/router/index.js:53`、`route-registry.js:309-315` | → `FilmEngineeringView.vue`（三栏经典页，暗路由，仅画布工具栏可达） |
| 入口 | `src/views/CreateView.vue:1969-1971` | 选择 `film-engineering` 卡片 → `router.push('/film-engineering')` |
| 标签标题 | `src/composables/useTabDocumentTitle.js:58` | `['/film-engineering', 'tabs.filmEngineering']`；`:71` 例外清单含 `/film-engineering/classic` |

### 2.2 「画布之前」的页面（= 工程案例内容）取证结论

- PR #2342（`15ad0e16`）**未删除任何文件**（`36 files, +2690/-20`）：只新增画布资产 + 改路由。
- `git diff 15ad0e16^ HEAD -- apps/desktop/src/views/FilmEngineeringView.vue` = **4 行**（仅 PR #2628 的 href 协议守卫）。
- ⇒ 现行 `FilmEngineeringView.vue`（779 行）与「画布前最合适版本 `23385cd2`」功能集合**完全相同**：3 个标签页（分镜库 `:57` / 剧本套用 `:134` / 提示词方法论 `:184`）+ 配置档案 `:6` + 元信息卡 `:33-52` + 详情抽屉 `:214` + 视频生成面板 `:272-352` + 全量出片面板 `:355-445`。
- ⇒ **无需回退历史 commit**；工程案例标签直接承载该视图。

### 2.3 自动模式要复用的引擎资产（全部已存在且被测试锁定）

| 资产 | 位置 | 复用点 |
|---|---|---|
| kit 加载 + 五组 schema 校验 + 两级回退链 | `electron/services/film-engineering/kit-loader.js:233-318` | 自动模式的模板来源 |
| 剧本套用引擎（分场 / 模板循环 / 五块复刻 / 角色行追加标注） | `script-adapt.js:22-192` | 自动模式分镜提示词生成 |
| 提示词方法论 7 块 / 10 律 / 6 术语 | `electron/film-kit/prompt-doctrine.json` | 自动模式的提示词结构来源 |
| 参考图落盘（魔数嗅探 / 服务端命名 / ≤10MB） | `reference-store.js:73-95` | 人物/场景参考图上传 |
| 参考图 → provider 参考输入（显式映射表 + 受控根纵深防御 + 首帧语义） | `video-reference-inputs.js:30-120` | 每镜参考注入 |
| 单镜生成（原文直送 / 帧数映射 / 轮询 10s×10min / 下载 shot_NNN.mp4） | `video-gen.js:151-219` | 逐镜出片 |
| 分批驱动（批 10 / 台账 .tmp+rename / 磁盘双核裁决 / 失败隔离 / 事件节流 500ms） | `production-driver.js:34-268` | 自动模式的执行内核 |
| 单镜重试（runId+shotIndex，prompt 服务端取） | `ipc-handlers/film-engineering.js:256-307` | 片段重试（自动模式改为从项目文件取 prompt，见 §5.4） |
| 合成（manifest 校验 / ffprobe 规格一致直拷 / 不一致 scale+pad 归一 / concat） | `film-render.js:109-335` | 自动模式成片 |
| 成本闸（`cost_confirmation.confirmed !== true` → 零 provider 调用） | `video-gen.js:280-307` | 自动模式聚合确认 |

### 2.4 「故事讲述流水线」可复用面（侦察结论）

**可直接复用**
- `src/views/video-creation/StageProgress.vue`：纯 props（`stages / progressPercent / elapsedMs / summary / checkpoint / showTimeGuidance`），**已有跨流水线复用先例** `src/views/HotTopics.vue:231-238`。⚠️ 其 `data-testid` 硬编码 `story2video-stage-*`（`StageProgress.vue:4,22,27,35`），复用前需参数化。
- `src/domain/pipeline-constants.js:18-27`（状态枚举）与 `src/views/video-creation/create-view-module-utils.js:29-140,283-304`（`normalizePipelineStages` / `mergePipelineStages` / `normalizePipelineStatusSnapshot` 纯函数）。
- `src/api/publisher.js:379-400` 的 `pipeline*` IPC 包装 + `:183 onPipelineUpdate`（`pipeline:update`，主进程发送点 `electron/ipc-handlers/pipeline.js:318`）。
- 进度纪律：**事件推送优先 + 3000ms 轮询兜底 + runId 快照守卫**（`CreateView.vue:4140-4189`、`:4548-4552`）。

**不可直接复用**
- `CreateView.vue`（5586 行，进度状态机**未抽 composable**，与配置/BGM/批量强耦合）。
- `ResultView.vue`（1857 行，绑定 `story2video` project/segments/dirty 模型 + `story2video:*` 通道，不能当通用成品编辑页）。
- ⇒ 编辑区**复用交互范式与 `StageProgress`，数据落影视工程自己的契约**（§4.7）。

---

## 三、交互设计

### 3.1 页面骨架（三标签 Hub）

```
/film-engineering                         ← FilmEngineeringHubView.vue（新）
├─ 顶部：标题「影视工程」+ 副标题 + 标签条（role="tablist"）
│   ├─ Tab 1「自动」     ← FilmAutoPanel.vue（新）
│   ├─ Tab 2「画布」     ← FilmCanvasPanel.vue（自 FilmCanvasView.vue 抽取）
│   └─ Tab 3「工程案例」 ← FilmEngineeringView.vue（复用，新增 embedded 模式隐藏自带 h1）
```

| ID | 需求 | 说明 |
|---|---|---|
| T1 | 三个标签常驻可见，键盘可切换（`role=tab` + `aria-selected`） | 复用 CreateView `.view-tabs` / `.input-tab` 的既有视觉与可访问性范式（`CreateView.vue:23-27,59-64`） |
| T2 | 标签与 URL 双向绑定：`?tab=auto\|canvas\|classic`；默认 `auto` | 可深链、可刷新保持；`router.replace` 不污染历史栈 |
| T3 | `/film-engineering/classic` 重定向到 `?tab=classic` | 向后兼容既有书签/测试例外清单 |
| T4 | 画布工具栏原「经典视图」按钮改为「工程案例」并切标签（不再跳独立路由） | 避免两套入口语义分裂 |
| T5 | 切换标签不丢状态 | 三面板均 `v-show` 常驻（而非 `v-if`），画布节点/自动模式进度不因切换重置 |

### 3.2 自动模式表单（5 项输入 + 1 次确认）

| 显示项 | 控件 | 校验（前端 + 服务端双校验） | 提示文字（locale key） |
|---|---|---|---|
| 剧本 | textarea（8 行，`maxlength=10000`，字数计数） | 非空；`trim()` 后长度 1–10000；超限禁用提交并红字 | `filmEngineering.auto.scriptPlaceholder` / `.scriptCount` / `.scriptTooLong` |
| 人物参考图 | 多图上传（≤8 张，PNG/JPEG/WEBP，单张 ≤10MB）+ 每张一个「角色名」输入（≤20 字符） | 类型/大小前端拦截；**主进程魔数嗅探**（`reference-store.js:24-40`）；名字留空则按剧本角色检出顺序自动命名 | `filmEngineering.auto.charRefs` / `.charRefsHint` / `.charNamePlaceholder` / `.charRefsTooMany` |
| 场景参考图 | 多图上传（≤8 张，同上） | 同上；按场景顺序轮转绑定 | `filmEngineering.auto.sceneRefs` / `.sceneRefsHint` |
| 画面方向 | 单选：横屏 16:9 / 竖屏 9:16 | 枚举 `16x9 \| 9x16` | `filmEngineering.auto.aspect` / `.aspect169` / `.aspect916` |
| 大概时长 | 预设 chips 30/60/90/120 秒 + 自定义数字（10–600） | 整数；10 ≤ T ≤ 600 | `filmEngineering.auto.duration` / `.durationCustom` / `.durationRange` |
| 单镜时长（默认折叠为「高级」） | 5 / 8 / 10 秒 | 枚举 `FILM_DURATIONS` | `filmEngineering.auto.shotSeconds` / `.advanced` |

**实时预估行**（输入变化即算，零成本）：`预估 N 个分镜 · 实际时长约 X 秒 · 需 M 批 · 磁盘约 Y · 耗时约 Z`
（耗时/磁盘口径复用 `production-plan` 的 `8MB/镜`、`300s/镜`，`ipc-handlers/film-engineering.js:47-49`）

### 3.3 自动模式状态机

```
idle ──填表──▶ ready ──「生成预览」──▶ planning ──▶ planned
planned ──「确认并开始」──▶ running(逐批自动) ──▶ composing ──▶ done
                                    │                     │
                                    ├─▶ failed（可续跑）    └─▶ editing（片段编辑中）
planned/running/editing ──「取消」──▶ cancelled
```

| phase | 显示项 | 可执行操作 |
|---|---|---|
| `idle` / `ready` | 5 项输入 + 预估行 | 生成预览（表单校验通过才可点） |
| `planning` | 骨架/加载态 | — |
| `planned` | **计划确认卡**：镜数/批数/单镜秒数/画幅/Provider/参考图命中统计/警告清单/磁盘+耗时预估/任务 ID（默认 `auto-<yyyyMMddHHmmss>`，可改） | 确认并开始 / 返回修改 |
| `running` | `StageProgress`（阶段=批次）+ 总进度 + 当前批/镜 + 已完成镜列表（可展开逐镜状态） | 停止（跑完当前镜后停） |
| `composing` | 合成进度 | — |
| `done` | 成片路径 + `<video>` 预览（复用 `story2videoCreateShareUrl` 本地 URL 解析范式）+ 片段列表（§4.7） | 打开文件夹 / 另存为 / 编辑片段 |
| `failed` | 错误详情 + 已完成镜数 | 续跑（按台账+磁盘双核）/ 返回 |
| `cancelled` | 已停止，已完成镜保留 | 续跑 / 新建 |

---

## 四、功能逻辑（自动模式 8 个阶段）

### 4.1 A1 文案解析（复用 + 扩写）

- 主路径：复用 `script-adapt.js:22-42 splitScript` 的分场语义（空行分段；`第X场/SCENE n/INT./EXT.` 标题行并入下一段）。
- 增强：当分场数 `< 目标镜数` 时，对超长段落按句末标点（`。！？.!?；;`）二次切分；当分场数 `> 目标镜数` 时，按相邻合并到目标数。切分后每段仍带 `title/text`。
- 失败降级：`script` 为空 → `AUTO_SCRIPT_EMPTY`；无法切出任何段 → `AUTO_NO_BEATS`。

### 4.2 A2 时长规划（新增纯函数）

```
输入：targetDurationSec T、shotSeconds s、段落数 K
N_target = clamp(round(T / s), 1, MAX_AUTO_SHOTS=200)
N = N_target
若 K < N：按 A1 句级切分补齐（仍不足则 N = K，并以 warning 提示实际时长会短于目标）
若 K > N：相邻合并至 N
实际时长 = N × s（在确认卡明示，与「大概时长」的差异如实显示）
```
- 上限：`MAX_AUTO_SHOTS = 200`（= 20 批）；超过则报 `AUTO_TOO_MANY_SHOTS` 并在前端禁用。
- 诚实口径：「大概时长」是**目标**，实际由 `N × s` 决定；确认卡同时显示两者。

### 4.3 A3 角色检出与映射（全部应用影视工程角色机制）

- **检出**（本地启发式，零成本，可选 LLM 增强）：
  1. 显式标记：`【角色：X】` / `X：` 行首 / 引号台词前的人名
  2. 对话动词前名词：`X说/道/喊/问/答/低语`
  3. 出现频次 ≥2 且未被停用词命中的 2–3 字中文人名/大写英文名
  4. 与用户上传的人物参考图「角色名」做**并集**（用户标注优先，权重最高）
- **映射**（复用 `script-adapt.js` 的槽位机制）：把用户角色按出现频次降序填入 Hell Grind 槽位 `ROKO → JAXX → LULU → REIN`（不足 4 个只填前 K 个），生成 `characterMap: {ROKO: '小强', ...}`，交给 `buildTemplatePrompt`（`script-adapt.js:52-85`）——角色行**追加「（角色名）」标注**，描述符逐字保留（铁律「音色是锁定描述符」）。
- **参考图绑定**：每个角色的图路径集合 `{roleName → paths[]}`；某镜的 `[CHARACTER: X]` 行命中角色名 → 该镜注入对应图（≤1 张/角色/镜，首帧语义）；未命中任何角色的镜不注入。
- 降级：无人物参考图 → 纯文本出片（与画布现状一致）；检出为空 → 用「角色1/角色2…」占位并 warning。

### 4.4 A4 场景参考图绑定

- 场景图按**场景**（A1 的 `title` 分组）轮转绑定：第 i 个场景 → `sceneRefs[i % len]`；同一场景所有镜共享同一张场景图（与 GEO 块「每场锁定」的方法论一致，`prompt-doctrine.json` blocks.geo_spatial_layout）。
- 注入顺序：人物图优先，场景图补位，单镜总注入 ≤2 张（避免 provider 参数歧义）。

### 4.5 A5 计划确认卡（一次聚合确认，保住成本闸契约）

- 载荷（`auto-plan` 返回）：`{shots[], characterMap, referencesSummary, warnings[], estimates{batchCount, diskEstimateBytes, wallclockEstimateSeconds}, provider{id, model}, aspect, seconds, targetDurationSec, plannedDurationSec}`
- **零 provider 调用**：`auto-plan` 纯计算 + 落盘预览，`auto-start` 必须 `confirmed === true`（与 `video-gen.js:280-307` 同精神，单测断言"确认前 provider 调用数 = 0"）。
- 警告清单（有不阻断）：
  - W1 `provider 不支持参考图输入` → 参考图将被忽略（`video-reference-inputs.js:37-40` 能力表）
  - W2 `镜数 > 10` → 将自动分 N 批顺序执行（无需再逐批确认）
  - W3 `实际时长 ≠ 目标时长` → 显示差异与原因
  - W4 `未检出角色` → 占位命名
  - W5 `耗时预估较长`（> 2 小时）→ 建议缩短时长

### 4.6 A6 自动执行（复用分批驱动，去掉逐批确认）

- 内核 = `production-driver.runProduction`（`production-driver.js:155-268`），`runOnlyBatch = null`（连续跑完所有批），`taskId` 来自确认卡。
- 逐批 `runBatch` = **新** `runAutoBatch`（`production-runner.js` 的兄弟函数）：从项目文件读该镜 prompt/refPaths/seconds → 调 `generateShotVideo`（`video-gen.js:151`）→ `onShotProgress` 上报。
- 台账/续跑/失败隔离/磁盘双核/事件节流**全部沿用**；进度事件名 `film-engineering:auto-update`（负载同 production-update：只带计数）。
- 停止：批间检查 `stop.flag`，停止后已完成镜保留，可从台账续跑。

### 4.7 A7/A8 合成与片段编辑

**合成**：全部批 done 且磁盘复核通过 → 自动产出 `renderManifest` → manifest 直通 run（`video-gen.js:241-249` checkpoint:false）→ `film_render`（`film-render.js:217-335`）→ `final.mp4`。

**片段编辑区**（交互范式对齐 story2video 的「分段编辑」，`ResultView.vue:183-402`）：

| 显示项 | 数据来源 | 操作 | 校验 |
|---|---|---|---|
| 片段列表（序号 / 状态徽标 / 提示词摘要 / 输出路径 / 时长 / 画幅） | 项目文件 + 台账 + 磁盘 | — | — |
| 提示词编辑（textarea，≤50000 字符） | 项目文件 `shots[i].prompt` | 保存（`auto-update-shot`） | 非空、≤50000（与 `FILM_PROMPT_MAX_LEN` 同源） |
| 参考图调整（增删该镜的参考图，来自已上传集合） | 项目文件 `shots[i].refPaths` | 保存 | 路径必须位于受控媒体根（`reference-store` 同口径） |
| 单镜重生成 | 「重新生成该片段」 | `auto-regenerate-shot` | 已确认过成本 → 单镜直接重生成（单镜成本敞口 1 镜，与 `retry-shot` 同口径）；覆盖磁盘 `shot_NNN.mp4` |
| 失败镜重试 | 失败镜「重试」按钮 | 同上 | — |
| 重新合成 | 「重新合成成片」 | `auto-compose` | 需全部镜磁盘存在，否则列缺失序号 |
| 片段预览 | `shot_NNN.mp4` 本地 URL | 播放 | — |
| 未保存变更提示 | `dirty` 标记 | 保存后清除 | 切标签/离开前提示（beforeunload 不拦，仅视觉 chip） |

**未保存即重生成**：`auto-regenerate-shot` 前置保存（一次 IPC 内先落盘再生成），避免「编辑了没保存就重生成」的静默误解。

---

## 五、数据契约

### 5.1 项目文件（自动模式唯一真源）

路径：`%TEMP%/film-engineering/auto/<taskId>/project.json`（与台账同根，`getFilmMediaRoot()`，`film-render.js:81`）

```jsonc
{
  "schemaVersion": 1,
  "taskId": "auto-20261009231500",
  "createdAt": "2026-10-09T23:15:00.000Z",
  "aspect": "16x9",              // 16x9 | 9x16
  "seconds": 5,                   // 5 | 8 | 10
  "targetDurationSec": 120,
  "plannedDurationSec": 120,
  "characterMap": { "ROKO": "小强" },
  "characterRefs": [ { "name": "小强", "path": "<mediaRoot>/references/ref-xxxx.png" } ],
  "sceneRefs": [ "<mediaRoot>/references/ref-yyyy.png" ],
  "shots": [
    { "index": 0, "shotId": "auto-000", "beatIndex": 0, "title": "第1场", "prompt": "…",
      "characterNames": ["小强"], "refPaths": ["<…>/ref-xxxx.png"], "seconds": 5,
      "status": "pending", "outputPath": null, "error": null }
  ],
  "warnings": [ { "code": "W1", "message": "…" } ]
}
```

写盘纪律：`.tmp` + `rename`（崩溃安全，与 `production-driver.js:65-71` 同法）；损坏/结构非法 → 视为不存在并 fail-closed（不静默续跑）。

### 5.2 新增 IPC 通道（6 条）

| 通道 | 请求 | 响应 `data` | 校验 / 错误码 |
|---|---|---|---|
| `film-engineering:auto-plan` | `{script, characterRefs[{name,path}], sceneRefs[path], aspect, seconds, targetDurationSec}` | `{shots[], characterMap, referencesSummary, warnings, estimates, provider, plannedDurationSec}` | `AUTO_SCRIPT_EMPTY` / `AUTO_SCRIPT_TOO_LONG` / `AUTO_NO_BEATS` / `AUTO_TOO_MANY_SHOTS` / `AUTO_BAD_PARAM` / `VIDEO_MODEL_NOT_CONFIGURED` / `FILM_KIT_UNAVAILABLE`；零 provider 调用 |
| `film-engineering:auto-start` | `{taskId, plan（或与 auto-plan 同参 + confirmed）, aspect, seconds}` | `{taskId, runState}` | `confirmed !== true` → `AUTO_NOT_CONFIRMED`（零 provider 调用）；`taskId` 路径安全（`path.basename` 同 `ipc-handlers/film-engineering.js:63`） |
| `film-engineering:auto-status` | `{taskId}` | `{exists, project, batches, doneCount, totalCount, renderManifest, manifestError, finalPath}` | 只读零调用 |
| `film-engineering:auto-update-shot` | `{taskId, shotIndex, patch{prompt?, refPaths?, seconds?}}` | `{ok, shot}` | prompt 非空 ≤50000；refPaths 每项位于受控媒体根；shotIndex 0..N-1；`AUTO_SHOT_INVALID` |
| `film-engineering:auto-regenerate-shot` | `{taskId, shotIndex, aspect?, seconds?}` | `{ok, index, shotId, path}` | 前置保存；单镜走 `generateShotVideo`（原文=项目文件 prompt）；失败不抛 |
| `film-engineering:auto-compose` | `{taskId}` | `{runId}` | 需 manifest 收口；否则 `AUTO_MANIFEST_INCOMPLETE` + 缺失序号 |
| （事件）`film-engineering:auto-update` | push | `{type, batchIndex?, shotIndex?, status?, doneCount, totalCount}` | 节流 500ms，只带计数 |

**公开性**：与既有 film-engineering 通道一致，列入 `license-access-control.js` 公开清单（`:58-64` 同法）。

### 5.3 与既有通道的关系

- 既有 `production-plan / production-run-batch / production-status` **保持不变**（经典视图「全量出片」仍在用）。
- 自动模式**不复用** `retry-shot` 的「prompt 取 run 快照」语义，因为自动模式要支持**编辑后重生成**（run 快照不会被编辑回写）。→ 新 `auto-regenerate-shot` 从**项目文件**取 prompt，且仍满足「不经优化器、逐字符提交」的原文直送合同；`retry-shot` 保持原样不动（其契约测试不受影响）。

### 5.4 原文直送合同的延续（不可破）

自动模式的 prompt 生成路径 = kit 模板块（`buildTemplatePrompt`）→ 项目文件 → `generateShotVideo`；**全程不经 prompt-engine 优化链**（`video-gen.js:8` 合同 + `video-gen.test.js:74` 的 `CONTRACT VIOLATION` 锁）。编辑后的 prompt 同样逐字符直送。

---

## 六、复用映射表（证明「全部应用原有基础与逻辑」）

### 6.1 自动模式 → 影视工程既有资产

| 影视工程能力 | 自动模式如何应用 | 证据 |
|---|---|---|
| film-kit 模板（153 真实分镜） | 作为提示词结构的模板源，逐场循环映射 | `script-adapt.js:138-149` |
| 7 大提示词块 | 每镜提示词由模板块复刻（GEO/ACTION/AUDIO/ACTING/CONSTRAINTS 原样保留） | `script-adapt.js:71-83` |
| 10 条铁律 | ①素材先行→先绑参考图再出片；②每次全量描述→描述符逐字保留；③少给自由→GEO 锁定；④第一秒广角→默认模板首行 | `prompt-doctrine.json` rules |
| 角色槽位机制 | 用户角色 → ROKO/JAXX/LULU/REIN 槽位映射 + 角色行标注 | `script-adapt.js:60-70` |
| 参考令牌 `<<<uuid>>>` | 模板 refTokens 随分镜带入项目文件（逐字保留） | `script-adapt.js:160` |
| 参考图落盘/嗅探/命名 | 人物/场景图上传同一通道与同一根 | `reference-store.js:73-95` |
| 参考图注入 | 每镜 refPaths → provider 首帧参考（能力表内 provider） | `video-reference-inputs.js:70-120` |
| 成本闸 | 一次聚合确认；确认前零调用 | `video-gen.js:280-307` |
| 分批驱动 / 台账 / 断点续跑 / 磁盘为真 | 执行内核整条复用（`runOnlyBatch=null`） | `production-driver.js:86-268` |
| 单镜失败隔离 + 原因可观测 | 逐镜 status/error 落台账 + 片段列表显示原因 | `production-runner.js:30-44` |
| concat/归一合成 + manifest 校验 | 成片阶段原样复用 | `film-render.js:109-335` |
| 帧数/画幅映射（121/201/241 帧 @24fps；1280×720 / 720×1280） | 自动模式的 seconds/aspect 语义同源 | `video-gen.js:53-92` |

### 6.2 自动模式 → story2video 进度流程

| story2video 资产 | 复用方式 |
|---|---|
| `StageProgress.vue` | 直接 import；新增 `testidPrefix` prop 以复用（默认 `story2video-stage`，自动模式传 `film-auto-stage`），**默认值不变**以保既有测试 |
| 事件推送 + 3s 轮询 + runId 守卫 | 照抄纪律（`CreateView.vue:4140-4189,4548-4552`） |
| `pipeline-constants.js` 状态枚举 + 归一化纯函数 | 直接 import |
| `pipelineConfirmStageGate` / `pipelineGetRunContext` / `onPipelineUpdate` | 合成 run 阶段复用（`src/api/publisher.js:379-400,183`） |

### 6.3 自动模式 → story2video 片段编辑范式

| ResultView 交互 | 自动模式落点 |
|---|---|
| 「分段编辑」区块（序号/标题/上移下移删除/缩略图/文本编辑/重新生成/重新合成/未保存 chip） | 同构复刻为「片段编辑」，字段换成影视工程的 `prompt / refPaths / seconds / outputPath`；**不支持删除**（删除会破坏 `orderIndex` 连续合同，`film-render.js:148-154`） |
| `recompose` = 先保存再合成（`ResultView.vue:1700`） | `auto-compose` 前置校验项目文件 dirty 并自动落盘 |
| 逐条重试 `retrySegment` | `auto-regenerate-shot` |

---

## 七、兼容性影响清单

| 既有契约 | 是否受影响 | 说明 |
|---|---|---|
| 六阶段流水线语义 / checkpoint | ❌ 不受影响 | 自动模式的合成段仍走 manifest 直通 run |
| `film_generate_videos` 原文直送 | ❌ | 编辑后 prompt 仍逐字符直送 |
| 成本闸零调用 | ❌（强化） | 新增 `AUTO_NOT_CONFIRMED` 前置拦截 + 单测断言 |
| `production-*` 三通道 | ❌ 不改 | 经典视图面板照旧 |
| `retry-shot` 语义 | ❌ 不改 | 自动模式另走新通道 |
| kit schema | ❌ | 不新增字段 |
| 路由 `/film-engineering/classic` | ⚠️ 行为变化 | 由「独立视图」改为「Hub 的 classic 标签」；URL 保留（重定向） |
| `useTabDocumentTitle.test.js:71` 例外清单 | ⚠️ 需同步 | classic 路径仍存在（重定向），清单可保留 |
| `href-scheme-contract.test.js:172` 清单 | ⚠️ 需同步 | 若 `FilmEngineeringView.vue` 改名/移动需更新；本方案**保持文件名不变**（内嵌模式加 prop），清单不动 |
| 画布工具栏「经典视图」按钮 | ⚠️ 文案/行为变化 | 改为切标签；`FilmCanvasView.actions.test.js` 需同步 |
| 超大文件门禁（max-lines） | ⚠️ 需注意 | `FilmEngineeringView.vue` 779 行不动；新增 Hub/Panel 各自 < 600 行，自动面板拆分为 `FilmAutoPanel.vue` + `FilmAutoSegmentEditor.vue` |

---

## 八、测试计划

| 层 | 用例 | 文件（新/改） |
|---|---|---|
| 单测（纯函数） | 时长规划：T/s→N、K<N 句级补齐、K>N 合并、上限 200、非法参数 | `electron/services/film-engineering/auto-plan.test.js`（新） |
| 单测 | 角色检出：显式标记/对话动词/频次/用户标注优先/空检出占位 | 同上 |
| 单测 | 参考绑定：人物命中→注入、场景轮转、provider 不支持→W1、越界路径拒绝 | 同上 |
| 单测 | 项目文件读写：原子写、损坏 fail-closed、字段校验 | `auto-project.test.js`（新） |
| IPC 契约 | 6 通道：sender 校验、入参矩阵、错误码、**确认前 provider 调用 = 0** | `electron/ipc-handlers/film-engineering-auto.test.js`（新） |
| 集成 | auto-plan → auto-start（假 provider）→ 台账 → manifest → 真实 ffmpeg 合成 final.mp4 | `electron/ipc-handlers/film-engineering-auto.e2e-int.test.js`（新） |
| 前端单测 | Hub 标签切换/URL 同步/默认 auto；AutoPanel 校验与状态机；SegmentEditor 编辑/保存/重生成/重新合成；StageProgress `testidPrefix` 默认值不变 | `src/views/FilmEngineeringHubView.test.js`、`src/views/film-auto/*.test.js`、`src/views/video-creation/StageProgress.test.js`（改） |
| locale 成对 | zh/en 新增键全等 | CI Gate 7 |
| E2E（CDP/真机） | 打包应用 → 自动模式贴长文剧本（≥1500 字）→ 生成预览 → 确认 → 观察批次进度 → 片段编辑一次 → 重新合成 | `tests/e2e/film-auto-mode-real.js`（新，默认不进 CI 计费段；本地实跑取证） |

---

## 九、文档与记忆计划

- `openspec/changes/film-auto-mode/`：proposal / design / tasks / specs（`film-engineering` 增量 + `desktop-ui-consistency` 增量）
- `01-docs/PRD-FILM-AUTO-MODE-2026-10-09.md`：本方案转正式 PRD（含全部校验/文案/交互/显示项/错误码）
- `01-docs/USER-MANUAL-FILM-ENGINEERING-AUTO-2026-10-09.md`：操作手册增补（自动模式 + 三标签）
- `CHANGELOG.md`：新功能条目
- 记忆：`.agent_context/`（内置）、`01-docs/learnings.md`（外部）、EverOS（若本机可用则写入；不可用则如实记录）

---

## 十、风险与缓解

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 自动模式镜数多 → 墙钟长（200 镜 × 5min ≈ 16h） | 高 | 确认卡明示耗时预估；W5 警告；支持停止+续跑；建议 ≤60 镜（默认时长档位 ≤120s/5s=24 镜） |
| R2 | 角色检出启发式误判（把非人名当角色） | 中 | 用户标注优先；UI 可改角色名/删除；不确定时不注入参考图（宁缺勿错） |
| R3 | 编辑 prompt 后与模板块结构脱节（用户删掉 GEO 块） | 中 | 保存时**不强制**结构校验，但在编辑器显示「块结构检查」提示（缺 GEO/AUDIO 时黄色提示，不阻断） |
| R4 | 三标签 Hub 内嵌两个重视图 → 首屏性能/内存 | 中 | `v-show` 常驻但**懒挂载**：非默认标签首次进入才挂载（`mountedTabs` 集合） |
| R5 | 画布抽取成 Panel 后既有测试/行为回归 | 中 | 保持 `FilmCanvasView.vue` 为薄包装（同 testid）；画布测试全跑 |
| R6 | 自动模式与经典「全量出片」语义重叠造成困惑 | 低 | 面板内文案明确：自动=一键全自动；全量出片=逐批确认（保留给需精细控成本的用户） |
| R7 | `StageProgress` 复用引入 testid 冲突 | 低 | `testidPrefix` prop，默认值不变 |
| R8 | CDP E2E 需真实计费 provider | 高（环境） | 先用假/本地 provider 验证全链路；真实计费段 opt-in，并在报告中如实标注是否实跑 |

---

## 十一、任务拆解（实施顺序）

1. **T1 结构**：Hub 视图 + 路由/注册/重定向 + 画布 Panel 抽取 + 工程案例内嵌（embedded）+ 标签持久化 + 测试同步
2. **T2 后端规划**：`auto-plan.js`（时长规划/角色检出/参考绑定）+ `auto-project.js`（项目文件）+ 单测
3. **T3 后端执行**：`runAutoBatch` + 6 条 IPC + 事件 + 公开性登记 + IPC 契约/集成测试
4. **T4 前端自动模式**：`FilmAutoPanel.vue`（表单/预估/确认卡/进度）+ `useFilmAuto.js` 状态机 + `StageProgress` 复用 + locale
5. **T5 片段编辑**：`FilmAutoSegmentEditor.vue`（列表/编辑/重生成/重新合成/预览）+ 测试
6. **T6 文档**：openspec 五件套 + PRD + 手册增补 + CHANGELOG
7. **T7 验证**：全量单测 + 打包 QM-1 + CDP E2E 长文剧本 + 视觉回归（如涉及样式）
8. **T8 交付**：PR + CI + 自动合并 + 回填 + 记忆沉淀

---

## 十二、待决问题（请评审重点回应）

1. **Q1**：自动模式是否应保留「每批确认」选项（默认关）？本方案选择「一次聚合确认」，可能被质疑成本敞口放大（对比：经典全量出片逐批确认）。
2. **Q2**：片段编辑允许改 prompt，是否破坏「原文直送不经优化器」的信任模型？本方案论证为「不破坏」（直送合同针对优化器改写，不针对用户显式编辑）。
3. **Q3**：`AUTO_TOO_MANY_SHOTS = 200` 的上限是否合适（20 批 × 10 镜）？墙钟/磁盘风险如何量化？
4. **Q4**：删除片段被排除（orderIndex 连续合同）。用户若确实要删，是否应支持「标记跳过」（manifest 跳过该镜）？
5. **Q5**：`/film-engineering/classic` 改为重定向会不会破坏既有深链/文档引用（手册 §13 有多处引用）？
