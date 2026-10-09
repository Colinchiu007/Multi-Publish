# 影视工程「自动模式」+ 三标签重组 · 方案（PRD 草案 v2）

> **状态**：CCG 决策层评审已修订（第 1 轮 8 条批评全部处置，见 §13 处置表）｜ **基线**：`main@f493e7ec6`｜ **分支**：`film-auto-mode`
> **取证口径**：现状结论均带 `文件:行号`，在基线 `f493e7ec6` 上复验。
> **评审简报**：`openspec/changes/film-auto-mode/review-brief.md`（精简版，用于双家族评审的输入预算）
> **预计改动规模**：预计改动 1800 行，涉及 14 个文件。

---

## 一、目标与范围

### 1.1 一句话目标

把影视工程页从「单视图（画布）」重组为「三标签 Hub（自动 / 画布 / 工程案例）」，并新增**自动模式**：用户只给①剧本 ②人物参考图（可选）③场景参考图（可选）④横竖屏 ⑤大概时长，其余全部由程序完成分镜规划、参考图绑定、批量出片与合成；生成后可对**单个片段**编辑提示词并重生成、重试、重新合成。

### 1.2 硬约束（来自任务书）

| # | 约束 | 落实方式 |
|---|---|---|
| C1 | 自动模式「越简单越好」 | 输入 5 项；其余全自动；**一次聚合确认**（不再逐批） |
| C2 | **必须全部应用影视工程底层基础与逻辑** | 复用 kit 模板块结构、剧本套用引擎、角色槽位、参考令牌、参考图注入、成本闸、分批驱动+台账+续跑、磁盘为真、单镜重试、concat/归一合成（§6 逐项映射） |
| C3 | 生成后可修改调整某个片段 | 片段列表 + 编辑提示词/参考图/时长 → 单镜重生成 → 重新合成（§4.7） |
| C4 | 复用「故事讲述流水线」进度与成品编辑 | 进度直接复用 `StageProgress.vue`（已有跨流水线先例）+「事件优先 + 3s 轮询 + 任务守卫」；编辑区沿用其「分段编辑」交互范式，数据落影视工程自己的契约 |
| C5 | 画布 → 第 2 标签；画布之前页面 → 第 3 标签「工程案例」 | §3.2；工程案例 = 现行 `FilmEngineeringView.vue`（取证：画布 PR #2342 未删任何功能，与画布前基线功能集合相同） |

### 1.3 非目标

不改 kit 与 schema；不改六阶段语义与 checkpoint；不改经典视图两个既有面板与其 IPC；不做视频剪辑；不新增 provider 参考输入能力（仍限 `minimax / agnes-video / agnes-multimodal`，`video-reference-inputs.js:30-34`）。

---

## 二、现状取证（基线 `f493e7ec6`）

### 2.1 路由与视图

| 项 | 位置 | 现状 |
|---|---|---|
| `/film-engineering` | `src/router/index.js:52`、`route-registry.js:300-307` | → `FilmCanvasView.vue`（暗路由，`entryFrom: '/create'`） |
| `/film-engineering/classic` | `src/router/index.js:53`、`route-registry.js:309-315` | → `FilmEngineeringView.vue`（暗路由，仅画布工具栏可达） |
| 入口 | `CreateView.vue:1969-1971` | 选择影视工程卡片 → `router.push('/film-engineering')` |
| 标签标题 | `useTabDocumentTitle.js:58`、例外清单 `:71` | `['/film-engineering', 'tabs.filmEngineering']` |

### 2.2 「画布之前」页面取证结论

- PR #2342（`15ad0e16`）`36 files, +2690/-20`，**零删除**：只新增画布资产 + 改路由。
- `git diff 15ad0e16^ HEAD -- apps/desktop/src/views/FilmEngineeringView.vue` = **4 行**（仅 PR #2628 的 href 守卫）。
- ⇒ 现行 `FilmEngineeringView.vue`（779 行）与画布前基线 `23385cd2` 功能集合相同：3 标签页（`分镜库 :57` / `剧本套用 :134` / `提示词方法论 :184`）+ 配置档案 `:6` + 元信息卡 `:33-52` + 详情抽屉 `:214` + 视频生成面板 `:272-352` + 全量出片面板 `:355-445`。
- ⇒ 工程案例标签直接承载该视图，**无需回退历史 commit**。

### 2.3 自动模式复用的引擎资产

| 资产 | 位置 | 复用点 |
|---|---|---|
| kit 加载 + 五组校验 + 两级回退 | `kit-loader.js:233-318` | 模板来源 |
| 剧本套用引擎（分场/模板循环/五块复刻/角色行标注） | `script-adapt.js:22-192` | 提示词生成 |
| 方法论 7 块 / 10 律 / 6 术语 | `electron/film-kit/prompt-doctrine.json` | 结构来源 |
| 参考图落盘（魔数嗅探/服务端命名/≤10MB） | `reference-store.js:73-95` | 参考图上传 |
| 参考注入（映射表 + 受控根纵深防御 + 首帧语义） | `video-reference-inputs.js:30-120` | 逐镜注入 |
| 单镜生成（原文直送/帧数映射/轮询 10s×10min） | `video-gen.js:151-219` | 逐镜出片 |
| 分批驱动（批 10/台账/磁盘双核/失败隔离/节流 500ms） | `production-driver.js:34-268` | 执行内核 |
| 单镜重试（runId+shotIndex，prompt 服务端取） | `ipc-handlers/film-engineering.js:256-307` | 片段重试（自动模式另走新通道，见 D7） |
| 合成（manifest 校验/直拷/归一/concat） | `film-render.js:109-335` | 成片 |
| 成本闸（未确认零调用） | `video-gen.js:280-307` | 聚合确认 |

### 2.4 story2video 可复用面

**可直接复用**：`views/video-creation/StageProgress.vue`（纯 props，已有跨流水线先例 `views/HotTopics.vue:231-238`；testid 硬编码 `story2video-stage-*`，`:4,22,27,35` 需参数化）；`domain/pipeline-constants.js:18-27`；`views/video-creation/create-view-module-utils.js:29-140,283-304` 纯函数；`api/publisher.js:379-400` + `:183 onPipelineUpdate`。
**不可复用**：`CreateView.vue`（5586 行，进度状态机未抽 composable）；`ResultView.vue`（1857 行，绑定 story2video project 模型）；`story2video:*` project 通道。
**进度纪律**：事件推送优先 + 3000ms 轮询兜底 + runId 守卫（`CreateView.vue:4140-4189`、`:4548-4552`）。

---

## 三、交互设计

### 3.1 页面骨架（三标签 Hub）

```
/film-engineering                         ← FilmEngineeringHubView.vue（新）
├─ 顶部：标题 + 标签条（role="tablist"，键盘可达）
│   ├─ Tab 1「自动」     ← FilmAutoPanel.vue（新）
│   ├─ Tab 2「画布」     ← FilmCanvasView.vue（复用，embedded=true）
│   └─ Tab 3「工程案例」 ← FilmEngineeringView.vue（复用，embedded=true）
```

| ID | 需求 |
|---|---|
| T1 | 三标签常驻、键盘可切换（`role=tab` + `aria-selected`）；视觉/可访问性沿用 `CreateView.vue:23-27,59-64` 的 `.view-tabs`/`.input-tab` 范式 |
| T2 | 标签 ↔ URL `?tab=auto\|canvas\|classic`，默认 `auto`，切换用 `router.replace` |
| T3 | **不做路由重定向**：`/film-engineering/classic` 原样保留为非 redirect 路由（无标签直达页，与 Hub 第 3 标签同源）——理由见 D24：`useTabDocumentTitle.test.js:69` 锁定「非 redirect 路由数 ≥32」，改重定向会削弱该棘轮 |
| T4 | 画布工具栏「经典视图」→「工程案例」；`embedded` 下 `emit('open-classic')` 切标签，独立路由下保持 `router.push('/film-engineering/classic')` |
| T5 | 切换标签不丢状态：`v-show` 常驻 + **懒挂载**（首次进入才挂载） |
| T6 | **不抽取、不改名既有视图文件**：仅新增可选 `embedded` prop（默认 `false` 时渲染逐字不变），避免 `href-scheme-contract.test.js:172` 站点锁与 `FilmCanvasView.actions.test.js:81` 受影响 |

### 3.2 自动模式表单（5 项输入 + 高级折叠项）

| 显示项 | 控件 | 校验（前端 + 主进程同判据） | 文案 key |
|---|---|---|---|
| 剧本 | textarea 8 行，`maxlength=10000`，字数计数 | `trim()` 后 1–10000 字 | `filmEngineering.auto.scriptPlaceholder/.scriptCount/.scriptTooLong` |
| 人物参考图 | 多图 ≤8，PNG/JPEG/WEBP，单张 ≤10MB，每张一个「角色名」（≤20 字符） | 类型/大小前端拦截；主进程**魔数嗅探**（`reference-store.js:24-40`）；名字空则按检出顺序自动命名 | `.charRefs/.charRefsHint/.charNamePlaceholder/.charRefsTooMany` |
| 场景参考图 | 多图 ≤8（同上） | 同上；按场景轮转绑定 | `.sceneRefs/.sceneRefsHint` |
| 画面方向 | 单选 16:9 / 9:16 | 枚举 `16x9\|9x16` | `.aspect/.aspect169/.aspect916` |
| 大概时长 | chips 30/60/90/120 + 自定义 | 整数 10–600 | `.duration/.durationCustom/.durationRange` |
| 单镜时长（高级，默认折叠） | 5/8/10 | 枚举 `FILM_DURATIONS` | `.shotSeconds/.advanced` |

实时预估行（零成本）：`预估 N 个分镜 · 实际时长约 X 秒 · 需 M 批 · 磁盘约 Y · 耗时约 Z`（口径复用 `8MB/镜`、`300s/镜`，`ipc-handlers/film-engineering.js:47-49`）。

### 3.3 状态机

```
idle ─填表─▶ ready ─「生成预览」─▶ planning ─▶ planned
planned ─「确认并开始」─▶ running(逐批自动) ─▶ composing ─▶ done ⇄ editing
                                  └─▶ failed（可续跑）      └─▶ cancelled（可续跑）
```

| phase | 显示项 | 操作 |
|---|---|---|
| `idle/ready` | 5 项输入 + 预估行 | 生成预览（校验通过才可点） |
| `planning` | 加载态 | — |
| `planned` | 确认卡：镜数/批数/单镜秒数/画幅/Provider/参考命中统计/警告/磁盘+耗时预估/任务 ID（默认 `auto-<时间戳>`，可改） | 确认并开始 / 返回修改 |
| `running` | `StageProgress`（阶段=批次）+ 总进度 + 当前批/镜 + 已完成镜列表 | 停止（批间生效） |
| `composing` | 合成进度 | — |
| `done` | 成片路径 + `<video>` 预览 + 片段列表 | 打开文件夹/另存为/编辑片段 |
| `failed` | 错误详情 + 已完成镜数 | 续跑 / 返回 |
| `cancelled` | 已停止（产物保留） | 续跑 / 新建 |

---

## 四、功能逻辑（8 个阶段）

### 4.1 A1 文案解析（**只做拆分，单向**）

- 基准：`script-adapt.js:22-42 splitScript` 的分场语义（空行分段；`第X场/SCENE n/INT./EXT.` 标题行并入下一段）。
- 顺序：**先算目标镜数** `N_target = clamp(round(T/s), 1, MAX_AUTO_SHOTS)`（§4.2），再执行 A1。
- A1 职责**只有拆分**：当分场数 `K < N_target` 时，对最长段落按句末标点（`。！？.!?；;`）逐个拆分，直到 `K ≥ N_target` 或无法再拆。**不做合并**（合并统一在 A2，避免双重合并/顺序矛盾）。
- 拆分不丢字：所有子段文本顺序拼接等于原段文本。
- 失败：空剧本 → `AUTO_SCRIPT_EMPTY`；无法切出任何段 → `AUTO_NO_BEATS`。

### 4.2 A2 时长规划（**只做合并与收口**）

```
N_target = clamp(round(T / s), 1, MAX_AUTO_SHOTS)      // T=目标时长, s=单镜秒数
N = min(N_target, K_after_A1)                          // 段落不足则如实缩短，不凭空造镜
若 K_after_A1 > N_target：相邻合并至 N_target（合并=顺序拼接，不丢字）
plannedDurationSec = N × s
```
- 上限 `MAX_AUTO_SHOTS = 120`（= 12 批 × 10 镜）。与输入域一致：`round(600/5)=120`，故 120 是输入域上界（**不再设 200，避免死码与误导口径**）。
- 超限（理论上不可达，仍 fail-closed）：`AUTO_TOO_MANY_SHOTS`。
- 诚实口径：确认卡同时显示「目标时长」与「实际时长 = N × s」。

### 4.3 A3 角色检出与映射（全部应用影视工程角色机制）

检出顺序（**用户标注优先**）：
1. 用户上传人物图时填写的角色名（最高权重）
2. 剧本显式标记：`【角色：X】`、行首 `X：`
3. 对话动词前名词：`X说/道/喊/问/答/低语`
4. 频次 ≥2 且未命中停用词的 2–3 字中文名 / 大写英文名

映射：按出现频次降序填入槽位 `ROKO → JAXX → LULU → REIN`（不足 4 个只填前 K），交给既有 `buildTemplatePrompt`（`script-adapt.js:52-85`）——角色行**追加「（角色名）」标注**，描述符逐字保留（铁律「音色是锁定描述符」）。**不新写提示词组装逻辑**。

空检出 → 「角色1..N」占位 + warning W4。

### 4.4 A4 参考图绑定

- 人物图：该镜 beat 文本或模板 `[CHARACTER: X]` 行命中角色名 → 注入该角色图（每角色每镜 ≤1 张）。
- 场景图：按场景（`title` 分组）轮转 `sceneRefs[i % len]`，同场景共享（对齐方法论「GEO 块每场锁定」）。
- 单镜注入总数 ≤2；顺序：人物优先、场景补位。
- provider 不在能力表 → 不注入 + W1（与既有降级语义一致，不阻断）。

### 4.5 A5 计划确认卡（一次聚合确认；服务端计划为真源）

- `auto-plan` **纯计算 + 服务端落盘**：写 `%TEMP%/film-engineering/auto/_plans/<planId>.json`（`planId` 服务端生成），返回 `{planId, 预览, warnings, estimates, provider, plannedDurationSec}`；**零 provider 调用**。
- **客户端不得回传 plan 或任何路径**：`auto-start` 只接收 `{planId, taskId, confirmed, overwrite?}`，服务端读自己落盘的计划重建 shots，并**逐项重校验** `refPaths` 位于受控媒体根内（纵深防御不接受第二来源）。
- 计划生命周期：TTL 24 小时或首次成功 start 后标记 consumed；`planId` 不存在/过期 → `AUTO_PLAN_EXPIRED`（用户重新生成预览）。
- 确认卡显示：镜数、批数、单镜秒数、画幅、默认 Provider、参考命中统计、磁盘预估、墙钟预估、目标/实际时长、警告清单、任务 ID。
- 警告：W1 Provider 不支持参考图；W2 镜数 >10 将自动分批；W3 实际≠目标时长；W4 未检出角色；W5 墙钟预估 >2 小时。
- **确认门槛绑定到所有产生 provider 调用的通道（第 2/3 轮评审采纳，C2）**：`editedAt > confirmedAt` 时，`auto-start` 与 `auto-regenerate-shot` **一并在执行前返回「需重新确认」**（前端出「重新确认成本」卡）；未确认前零调用。累计重生成不得绕过门槛。
- **append-only 确认历史（C3）**：`project.json` 增 `confirmations[]`，每条 `{at, payloadHash, shotsFingerprint, planVersion}`；以最新一条为基准，刷新确认只追加不覆盖——供「某次 provider 调用对应哪次确认」的审计回溯。
- **调用计数对账（C7）**：`project.json` 记 `providerCalls` 并与台账逐镜状态对账；确认载荷哈希与当前清单不一致 → 拒绝启动并要求重新确认。
- **taskId 签发与预算口径（C5）**：服务端默认签发 `auto-<yyyyMMddHHmmss>`（允许客户端覆盖但须过路径安全与字符校验）；已存在且无显式 `overwrite` → `AUTO_TASK_EXISTS`；同脚本可并存多个 taskId，**预算按 task 隔离、无全局上限**（口径在确认卡与手册明示）。
- **校验时机（C6）**：全部输入域校验在 `auto-plan` 完成（越界即拒且不落盘）；`auto-start` 只复查归属、taskId 冲突与受控根。
- **驱动器接缝（C8）**：自动模式**不经过 pipeline 引擎、不使用 run 快照**，直接调 `production-driver.runProduction`（注入 `runBatch/probe/emit`）；载体 = `project.json`（内容真源）+ `ledger.json`（执行真源）；`probe` = `shot_NNN.mp4` 存在性。**执行不经引擎，合成经引擎**（合成仍走 manifest 直通 run）。

### 4.6 A6 自动执行（复用分批驱动）

- 内核 = `production-driver.runProduction`（`production-driver.js:155-268`），`runOnlyBatch = null` 连续跑完所有批。
- 逐批 `runBatch` = 新 `runAutoBatch`：从 **project.json** 读该镜 prompt/refPaths/seconds → `generateShotVideo`（`video-gen.js:151`）→ `onShotProgress`。
- 台账/续跑/失败隔离/磁盘双核/节流全部沿用；事件名 `film-engineering:auto-update`。
- 停止：批间检查停止标志（当前镜跑完再停）。
- **续跑（D5）**：同 `taskId` + 同 `planId` 再调 `auto-start` → 服务端读 `project.json` 比对镜头指纹（shotId+prompt+seconds+refPaths 的哈希）与落盘计划一致 → 跳过磁盘已齐镜（零 provider 调用）→ **不二次确认成本**（镜头集合与 provider 未变）；指纹不一致 → `AUTO_RESUME_MISMATCH`，要求重新规划（避免"续跑"变成"偷偷换方案"）。

### 4.7 A7/A8 合成与片段编辑

**合成**：全部批 done 且磁盘复核通过 → `renderManifest` → manifest 直通 run（`video-gen.js:241-249` checkpoint:false）→ `film_render`（`film-render.js:217-335`）→ `final.mp4`。

**片段编辑区**（范式对齐 `ResultView.vue:183-402` 的「分段编辑」，数据落影视工程契约）：

| 显示项 | 数据来源 | 操作 | 校验 |
|---|---|---|---|
| 片段列表（序号/状态徽标/提示词摘要/输出路径/时长/画幅） | project.json + 台账 + 磁盘 | — | — |
| 提示词编辑（textarea ≤50000） | `shots[i].prompt` | 保存（`auto-update-shot`） | 非空、≤50000（与 `FILM_PROMPT_MAX_LEN` 同源） |
| 参考图调整（该镜增删参考图） | `shots[i].refPaths` | 保存 | 路径必须位于受控媒体根（逐项校验） |
| 单镜重生成 | — | `auto-regenerate-shot` | 先落盘编辑再生成；覆盖 `shot_NNN.mp4`；prompt 逐字符直送 |
| 失败镜重试 | 台账 error | 同上 | — |
| 重新合成 | — | `auto-compose` | 任一镜磁盘缺失 → 拒绝并列出缺失序号 |
| 片段预览 | `shot_NNN.mp4` 本地 URL | 播放 | — |
| 未保存变更 | `dirty` | 保存后清除 | 视觉 chip（不拦导航） |

**不支持删除片段**（D12）：`film_render` 要求 `orderIndex` 从 0 连续（`film-render.js:148-154`），删除即缺镜 → fail-closed。若需删改，走「编辑提示词/参考图」重新出片。

---

## 五、数据契约

### 5.1 落盘物

| 文件 | 路径 | 生命周期 |
|---|---|---|
| 计划 | `%TEMP%/film-engineering/auto/_plans/<planId>.json` | TTL 24h 或 start 成功后 consumed；损坏 → 视为不存在 |
| 项目 | `%TEMP%/film-engineering/auto/<taskId>/project.json` | 与任务同生命周期；`.tmp`+rename 原子写；损坏 → fail-closed（视为不存在，不静默续跑） |
| 台账 | `%TEMP%/film-engineering/auto/<taskId>/ledger.json` | 由 `production-driver` 管（进度/续跑） |
| 产物 | `%TEMP%/film-engineering/auto/<taskId>/shot_NNN.mp4`、`final.mp4` | 结果真源（磁盘为真） |

职责分离：**project = 内容真源，ledger = 执行真源，磁盘 = 结果真源**。

`project.json` 形状：

```jsonc
{
  "schemaVersion": 1, "taskId": "auto-20261009231500",
  "createdAt": "2026-10-09T23:15:00.000Z",
  "planId": "plan-<16hex>", "planFingerprint": "<sha256>",
  "aspect": "16x9", "seconds": 5, "targetDurationSec": 120, "plannedDurationSec": 120,
  "characterMap": { "ROKO": "小强" },
  "characterRefs": [ { "name": "小强", "path": "<mediaRoot>/references/ref-xxxx.png" } ],
  "sceneRefs": [ "<mediaRoot>/references/ref-yyyy.png" ],
  "shots": [ { "index": 0, "shotId": "auto-000", "beatIndex": 0, "title": "第1场",
    "prompt": "…", "characterNames": ["小强"], "refPaths": ["…"], "seconds": 5,
    "status": "pending", "outputPath": null, "error": null } ],
  "warnings": [ { "code": "W1", "message": "…" } ]
}
```

### 5.2 IPC 通道（7 条 + 1 事件）

| 通道 | 请求 | 响应 `data` | 校验 / 错误码 |
|---|---|---|---|
| `film-engineering:auto-plan` | `{script, characterRefs[{name,path}], sceneRefs[path], aspect, seconds, targetDurationSec}` | `{planId, shots[], characterMap, referencesSummary, warnings, estimates, provider, plannedDurationSec}` | 空/超长/无段/超上限/参数非法/未配 Provider/kit 不可用；**零 provider 调用**；落盘计划 |
| `film-engineering:auto-start` | `{planId, taskId, confirmed, overwrite?}` | `{taskId, resumed?, runState}` | `confirmed !== true` → `AUTO_NOT_CONFIRMED`；planId 无效 → `AUTO_PLAN_EXPIRED`；taskId 非法 → `AUTO_BAD_PARAM`；taskId 已存在且无 `overwrite` → `AUTO_TASK_EXISTS`；续跑指纹不符 → `AUTO_RESUME_MISMATCH`；**服务端重建 shots + 逐项受控根重校验**；零 provider 调用发生在确认校验之前 |
| `film-engineering:auto-status` | `{taskId}` | `{exists, project, batches, doneCount, totalCount, renderManifest, manifestError, finalPath}` | 只读零调用 |
| `film-engineering:auto-update-shot` | `{taskId, shotIndex, patch{prompt?, refPaths?, seconds?}}` | `{ok, shot}` | prompt 非空 ≤50000；refPaths 逐项受控根；seconds 枚举；index 0..N-1；否则 `AUTO_SHOT_INVALID` |
| `film-engineering:auto-regenerate-shot` | `{taskId, shotIndex, aspect?, seconds?}` | `{ok, index, shotId, path}` | 前置落盘编辑；prompt 从 project.json 逐字符直送；失败不抛；Provider 未配 → `VIDEO_MODEL_NOT_CONFIGURED` |
| `film-engineering:auto-compose` | `{taskId}` | `{runId}` | 需 manifest 收口，否则 `AUTO_MANIFEST_INCOMPLETE` + 缺失序号 |
| （事件）`film-engineering:auto-update` | push | `{type, batchIndex?, shotIndex?, status?, doneCount, totalCount}` | 节流 500ms；只带计数 |

公开性：与既有 film-engineering 通道一致，登记进 `license-access-control.js`（`:58-64` 同法）。

### 5.3 与既有通道的关系

- `production-plan / production-run-batch / production-status` **不变**（经典视图「全量出片」仍在用）。
- `retry-shot` **不变**（prompt 取自 run 快照；其契约测试锁定）。自动模式的编辑后重生成走 `auto-regenerate-shot`（prompt 取自 project.json）。
- 两条路径**共同遵守原文直送合同**：prompt 逐字符提交 provider，不经 prompt-engine 优化器（`video-gen.js:8`）；差异仅在 prompt 来源。

---

## 六、复用映射表（证明「全部应用原有基础与逻辑」）

| 影视工程能力 | 自动模式如何应用 | 证据 |
|---|---|---|
| film-kit 153 真实分镜模板 | 逐场循环映射为提示词结构模板 | `script-adapt.js:138-149` |
| 7 大提示词块 | GEO/ACTION/AUDIO/ACTING/CONSTRAINTS 原样复刻 | `script-adapt.js:71-83` |
| 10 条铁律 | 素材先行→先绑参考图；每次全量描述→描述符逐字；少给自由→GEO 锁定 | `prompt-doctrine.json` |
| 角色槽位 | 用户角色 → ROKO/JAXX/LULU/REIN + 角色行标注 | `script-adapt.js:60-70` |
| 参考令牌 `<<<uuid>>>` | 随模板带入 project.json 并逐字保留 | `script-adapt.js:160` |
| 参考图落盘/嗅探/命名 | 同一通道与同一受控根 | `reference-store.js:73-95` |
| 参考图注入 | refPaths → provider 首帧参考（能力表内） | `video-reference-inputs.js:70-120` |
| 成本闸 | 一次聚合确认；确认前零调用 | `video-gen.js:280-307` |
| 分批/台账/续跑/磁盘为真 | 执行内核整条复用（`runOnlyBatch=null`） | `production-driver.js:86-268` |
| 单镜失败隔离 + 原因可观测 | 逐镜状态/error + 片段列表显示 | `production-runner.js:30-44` |
| concat/归一 + manifest 校验 | 成片阶段原样复用 | `film-render.js:109-335` |
| 帧数/画幅映射（121/201/241@24fps；1280×720/720×1280） | 语义同源 | `video-gen.js:53-92` |
| story2video 进度 | import `StageProgress.vue` + 事件/轮询/守卫纪律 | `StageProgress.vue`、`CreateView.vue:4140-4189` |
| story2video 片段编辑范式 | 同构复刻（字段换成 prompt/refPaths/seconds/outputPath） | `ResultView.vue:183-402` |

---

## 七、兼容性影响

| 既有契约 | 影响 | 说明 |
|---|---|---|
| 六阶段语义 / checkpoint | ❌ | 合成段仍走 manifest 直通 run |
| 原文直送 | ❌ | 编辑后 prompt 仍逐字符直送 |
| 成本闸零调用 | ❌（强化） | 新增 `AUTO_NOT_CONFIRMED` + 单测断言 |
| `production-*` / `retry-shot` | ❌ | 不改 |
| kit schema | ❌ | 不新增字段 |
| `/film-engineering/classic` | ⚠️ | 由独立视图改为 Hub 标签（URL 保留为重定向） |
| `href-scheme-contract.test.js:172` 站点 | ⚠️ 不动 | 保持 `FilmEngineeringView.vue` 文件名与 `:href` 站点 |
| `FilmCanvasView.actions.test.js:81` | ⚠️ 需同步 | 工具栏按钮文案/行为变化 |
| `StageProgress.test.js` | ⚠️ 需同步 | 新增 `testidPrefix`，默认值不变 |
| max-lines 挂账 | ⚠️ | Hub ≤300 行；AutoPanel ≤600；SegmentEditor ≤500；后端模块 ≤400 |

---

## 八、测试计划

| 层 | 用例 | 文件 |
|---|---|---|
| 纯函数单测 | 时长规划（T/s→N、120 上限、K<N 只拆、K>N 只并、不丢字、非法参数） | `auto-plan.test.js`（新） |
| 纯函数单测 | 角色检出（用户标注优先/显式标记/对话动词/频次/空检出占位/停用词不误判） | 同上 |
| 纯函数单测 | 参考绑定（命中才注入/场景轮转/≤2 张/provider 不支持→W1/越界拒绝） | 同上 |
| 单测 | 计划与项目文件（原子写、损坏 fail-closed、TTL/consumed、指纹、patch 合并） | `auto-project.test.js`（新） |
| IPC 契约 | 7 通道：sender 校验、入参矩阵、错误码、**确认前 provider 调用 = 0**、`AUTO_TASK_EXISTS`、`AUTO_RESUME_MISMATCH`、`AUTO_PLAN_EXPIRED` | `film-engineering-auto.test.js`（新） |
| IPC 契约 | **原文直送防回归锁**：`auto-regenerate-shot` 与 `auto-start` 路径断言 prompt 逐字符等于项目文件值且优化器未被调用（对照 `video-gen.test.js:74` 的 `CONTRACT VIOLATION` 模式） | 同上 |
| 集成 | plan → start（假 provider）→ 台账 → manifest → 真实 ffmpeg 出 `final.mp4`；含崩溃续跑（跳过已齐镜） | `film-engineering-auto.e2e-int.test.js`（新） |
| 前端单测 | Hub（标签/URL/懒挂载/embedded 默认值）；AutoPanel（校验矩阵/状态机/确认前不发 start）；SegmentEditor（编辑-保存-重生成、缺镜禁用合成） | `FilmEngineeringHubView.test.js`、`src/views/film-auto/*.test.js` |
| 回归 | `StageProgress.test.js`（默认 testid 不变）、`FilmCanvasView.actions.test.js`、`preload.test.js`（方法计数） | 既有 |
| E2E | CDP 真机：长文剧本（≥1500 字）自动模式全链路 + 片段编辑 + 重新合成 | `tests/e2e/film-auto-mode-driver.js`（新） |

---

## 九、文档与记忆计划

openspec 五件套（已完成初稿）+ 本 PRD 定稿 + 用户手册增补 `01-docs/USER-MANUAL-FILM-ENGINEERING-AUTO-2026-10-09.md` + `CHANGELOG.md` + 归档时同步 `openspec/specs/film-engineering/spec.md`；记忆：`.agent_context/`、`01-docs/learnings.md`、EverOS（不可用则如实记录）。

---

## 十、风险与缓解

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 长任务墙钟（**120 镜 × 5min ≈ 10h**，12 批） | 高 | 确认卡明示耗时/磁盘；W5（>2h）警告；可停止 + 续跑；默认时长档位（≤120s ⇒ ≤24 镜）落在一小时内 |
| R2 | 角色检出误判 | 中 | **用户标注优先**；出片前可在表单改名后**重新规划**；出片后可按镜调整参考图（`auto-update-shot` 的 refPaths）；不确定时宁可不注入 |
| R3 | 编辑后提示词与模板块结构脱节 | 中 | 编辑器显示块结构检查（缺 GEO/AUDIO 黄提示，不阻断） |
| R4 | Hub 首屏性能 | 中 | `v-show` + 懒挂载（首次进入才 mount） |
| R5 | 客户端伪造 plan 绕过受控根 | **高（已修）** | D3：`auto-start` 只收 planId，服务端重建 shots 并逐项重校验 |
| R6 | taskId 冲突覆盖数据 | **高（已修）** | D4：`AUTO_TASK_EXISTS` + 显式 `overwrite` |
| R7 | 续跑被误用为"换方案" | 中（已修） | D5：镜头指纹校验，不一致拒绝 |
| R8 | CDP E2E 需真实计费 provider | 环境 | 先假 provider 验证全链路；真实计费段 opt-in 并如实标注 |

---

## 十一、任务拆解

见 `openspec/changes/film-auto-mode/tasks.md`（8 组 40 项，TDD 顺序）。

---

## 十二、待决问题（请评审重点回应）

1. **Q1**：一次聚合确认（最大 120 镜）敞口是否可接受？是否需要「超过 N 镜强制分段确认」？
2. **Q2**：片段编辑允许改 prompt 是否破坏原文直送信任模型？（本方案论证：直送合同针对优化器改写，不针对用户显式编辑；两条路径共用同一提交函数）
3. **Q3**：`MAX_AUTO_SHOTS = 120` 与输入域对齐是否恰当？（缓解：W5 + 停止续跑）
4. **Q4**：续跑不二次确认成本是否可接受？（论证：镜头集合/Provider/参数未变，指纹校验防换方案）

---

## 十三、第 1 轮 CCG 批评处置表（8 条）

| # | 严重度 | 批评 | 处置 |
|---|---|---|---|
| i1 | **Critical** | `auto-start` 接受客户端 plan，refPaths 未重校验 → 绕过受控根纵深防御 | **已修**：`auto-start` 只收 `{planId, taskId, confirmed, overwrite?}`；服务端读自己落盘的计划重建 shots 并逐项重校验（§4.5 / §5.2 / D3 / R5）；补回归用例 |
| i2 | Warning | A1/A2 各含一次同规则合并 → 双重合并/顺序矛盾 | **已修**：A1 只拆（K<N），A2 只并（K>N），顺序固定为先算 N_target（§4.1/§4.2） |
| i3 | Warning | 输入域最大 120 镜，`MAX_AUTO_SHOTS=200` 成死码 | **已修**：上限改 120，R1/W5 口径同步（§4.2 / R1 / D10） |
| i4 | Warning | failed/cancelled「续跑」无通道与语义 | **已修**：续跑 = 同 taskId+planId 再调 `auto-start`；指纹一致则跳过磁盘已齐镜、不二次确认；不一致 → `AUTO_RESUME_MISMATCH`（§4.6 / §5.2 / D5 / Q4） |
| i5 | Warning | taskId 未查重，可覆盖既有项目与产物 | **已修**：`AUTO_TASK_EXISTS` + 显式 `overwrite`（§5.2 / D4 / R6） |
| i6 | Warning | R2 声称「UI 可改角色名/删除」但无数据路径 | **已修**：声明与契约对齐——出片前改名走表单 + 重新规划；出片后按镜调整参考图（`auto-update-shot`）；不再声称全局角色删除入口（R2） |
| i7 | Info | 测试计划未锁「auto 路径 prompt 逐字符直送」 | **已修**：§8 增补防回归锁（对照 `video-gen.test.js:74` 模式） |
| i8 | Info | 「落盘预览」路径/生命周期/start 读盘与否未定义 | **已修**：§5.1 落盘物表（计划 TTL/consumed/指纹）；§4.5 明确 start 读服务端计划且不重算 |
