# 影视工程（film-engineering）流水线 · 功能代码深度解读与操作手册

> **版本**：1.0（2026-10-09）｜ **取证基线**：`main@8b3d3e91`（fix(desktop): 安全加固——发行公钥钉入编译期常量，#3102）
> **受众**：功能使用者（第一~八章）、二次开发者（第九~十二章）、运维与排障（第十三章）
> **本手册的取证口径**：全部功能点、限制、错误码、路径、常量均以基线代码为准，并逐条标注 `文件:行号`。行号在基线 `8b3d3e91` 上复验。
> **关联文档**：[USER-MANUAL-FILM-ENGINEERING-2026-10-07.md](./USER-MANUAL-FILM-ENGINEERING-2026-10-07.md)（既有用户手册 v1.0，本手册为代码视角的深度补充）、[ARCH-FILM-ENGINEERING-2026-08-14.md](./ARCH-FILM-ENGINEERING-2026-08-14.md)、[PRD-FILM-ENGINEERING-CANVAS-2026-09-24.md](./PRD-FILM-ENGINEERING-CANVAS-2026-09-24.md)、[PRD-FILM-FULL-CORPUS-PRODUCTION-2026-09-23.md](./PRD-FILM-FULL-CORPUS-PRODUCTION-2026-09-23.md)

---

## 目录

- 一、总览：一条流水线的完整地图
- 二、入口与路由：怎么进到这个功能
- 三、数据资产 film-kit：这条流水线的"胶片仓库"
- 四、主进程服务层：FilmEngineeringService 与六大赛道能力
- 五、流水线引擎集成：六个自定义阶段执行器
- 六、IPC 全量通道清单与三层防御
- 七、渲染端三套 composable 与两个视图
- 八、用户操作流程详解（六条路线逐步操作）
- 九、成本确认闸与断点续跑机制精读
- 十、安全合同：这条流水线的九道防线
- 十一、常量与阈值速查表
- 十二、受控媒体根目录布局与产物生命周期
- 十三、故障排查手册（按错误码/症状索引）
- 十四、测试与回归锁地图
- 十五、已知边界与限制清单
- 十六、提示词方法论精读：七大块与十条铁律的工程原理
- 十七、逐模块深读：从一行代码到一次操作
- 十八、完整操作案例：从零到成片的三次实战
- 十九、FAQ（高频疑问直答）
- 二十、给二次开发者的集成备注
- 二十一、六条操作路线的决策树与状态速查
- 二十二、数据一致性设计原则总结（架构视角）
- 二十三、附录：名词对照与源码符号索引

---

## 一、总览：一条流水线的完整地图

### 1.1 影视工程是什么

影视工程是桌面端的一条**专业影视分镜生产线**（流水线 id：`film-engineering`），复刻开源 AI 电影《Hell Grind》的真实工程方法：把"怎么写分镜提示词、怎么锁角色一致性、怎么控制空间与时间"连同 153 个真实分镜数据打包进应用（`apps/desktop/src/locales/zh.js:990`：`'film-engineering': '影视工程：复刻《Hell Grind》——真实分镜提示词库、素材索引与剧本套用（一键复制）'`）。

它不是一条普通的"文案转视频"流水线，而是四层能力堆叠：

1. **数据层**：随包 film-kit 数据资产（场景树 162 / 分镜 153 / 资产索引 332 / 方法论 7 块 10 律 6 术语，见第三章实测统计）
2. **服务层**：`FilmEngineeringService` 聚合服务，提供 kit 加载、分镜查询、一键复制、剧本套用、图片生成、导出六大能力（`apps/desktop/electron/services/film-engineering/film-engineering-service.js:25-201`）
3. **引擎层**：在 PipelineEngine 上注册 6 个自定义阶段执行器（`film_load_template` → `film_adapt_script` → `film_select_shots` → `film_export_prompts` → `film_generate_videos` → `film_render`，`apps/desktop/electron/services/pipeline-engine.js:481-531`）
4. **前端层**：两个视图（画布 FilmCanvasView + 经典 FilmEngineeringView）与三套 composable（useFilmCanvas / useFilmVideoGen / useFilmProduction）

### 1.2 一次完整创作的数据流

```
用户剧本（≤10000 字）
    │ film-engineering:adapt-script（分场 → 模板映射）
    ▼
adaptedShots[]（与 kit 分镜同构：shotId/prompt/model/refTokens）
    │ 画布铺节点 或 经典视图列表
    ▼
selectedShots[]（勾选 ≤10/批 或 ≤1000 全量）
    │ pipelineStartOrchestrated('film-engineering', {initialContext:{selectedShots}})
    ▼
PipelineEngine run（六阶段：load_template → adapt_script → select_shots
                    → export_prompts → generate_videos ⇄ 成本闸 → render）
    │ film_generate_videos：原文直送默认视频 Provider（提交→轮询→下载）
    ▼
os.tmpdir()/film-engineering/<runId>/shot_NNN.mp4
    │ film_render：ffprobe 规格探测 → 一致直拷 / 不一致归一 → concat
    ▼
final.mp4（成片）
```

### 1.3 模块文件全景（本手册代码引用索引）

| 层 | 文件 | 行数 | 职责 |
|---|---|---|---|
| 服务 | `electron/services/film-engineering/film-engineering-service.js` | 207 | 聚合服务（kit 懒加载 + 组合） |
| 服务 | `electron/services/film-engineering/kit-loader.js` | 331 | kit 加载 + 5 组 schema 校验（fail-closed） |
| 服务 | `electron/services/film-engineering/shot-library.js` | 224 | 分镜查询 + 复制文本组装（4 模式） |
| 服务 | `electron/services/film-engineering/script-adapt.js` | 220 | 剧本套用引擎（分场/模板组装/LLM 降级） |
| 服务 | `electron/services/film-engineering/video-gen.js` | 402 | `film_generate_videos` 阶段（提交/轮询/下载） |
| 服务 | `electron/services/film-engineering/film-render.js` | 347 | `film_render` 阶段（ffprobe + concat/归一） |
| 服务 | `electron/services/film-engineering/production-driver.js` | 281 | 全量分批出片驱动（切批/台账/断点续跑） |
| 服务 | `electron/services/film-engineering/production-runner.js` | 50 | 单批执行器（批内并发 2） |
| 服务 | `electron/services/film-engineering/video-reference-inputs.js` | 127 | 画布参考图 → provider 参考参数 |
| 服务 | `electron/services/film-engineering/reference-store.js` | 97 | 参考图落盘（魔数嗅探/服务端命名） |
| 服务 | `electron/services/film-engineering/shot-downloader.js` | 242 | 原片回收下载（SSRF 五重防线） |
| 阶段 | `electron/services/film-engineering/film-engineering-stages.js` | 240 | 前四个阶段执行器注册 |
| IPC | `electron/ipc-handlers/film-engineering.js` | 488 | 16 条 IPC 通道 |
| 引擎 | `electron/services/pipeline-engine.js`（:481-531 段） | 2723 | film-engineering 流水线定义 |
| 容器 | `electron/core/container.setup.js`（:442-456、:101-103） | 478 | DI 注册 |
| 预加载 | `electron/preload/film-engineering.js`（bundle 在 `home-shell-preload.bundle.js:1019-1045`） | — | `window.electronAPI.filmEngineering`（17 个方法） |
| 前端 | `src/composables/useFilmCanvas.js` | 253 | 画布桥接（节点/连线/持久化） |
| 前端 | `src/composables/film-canvas-model.js` | 244 | 画布纯模型（可 node 测试） |
| 前端 | `src/composables/useFilmEngineering.js` | 467 | 经典视图 composable |
| 前端 | `src/composables/useFilmVideoGen.js` | 271 | 分镜视频生成驱动（≤10 镜） |
| 前端 | `src/composables/useFilmProduction.js` | 420 | 全量分批出片驱动（>10 镜） |
| 视图 | `src/views/FilmCanvasView.vue` | 236 | 画布视图（Vue Flow） |
| 视图 | `src/views/FilmEngineeringView.vue` | 779 | 经典视图（三标签页 + 两个面板） |
| 数据 | `electron/film-kit/*`（4 JSON + 1 md + images/） | — | 数据资产（约 2.8MB） |
| 工具 | `scripts/film-engineering/fetch-hell-grind-kit.py` | — | kit 可复现重建（精选/--full 两口径） |

---

## 二、入口与路由：怎么进到这个功能

### 2.1 四个入口

| 入口 | 路由/动作 | 定义位置 |
|---|---|---|
| 创建页流水线选择器 | 选择 `film-engineering` 卡片 → `router.push('/film-engineering')` | `src/views/CreateView.vue:1969-1971`（该处注释明确：独立页路由分支在前，「跳转到专属页面」而非跑 run） |
| 画布主视图 | `/film-engineering` → `FilmCanvasView.vue` | `src/router/index.js:52`；暗路由注册 `src/config/route-registry.js:300-308`（entryFrom `/create`） |
| 经典视图回退 | `/film-engineering/classic` → `FilmEngineeringView.vue`，仅从画布工具栏「回退经典页」进入 | `src/router/index.js:53`；`route-registry.js:309-315` |
| 标签标题 | tab 标题映射 `['/film-engineering', 'tabs.filmEngineering']` | `src/composables/useTabDocumentTitle.js:58` |

注意：`/film-engineering/classic` 是**暗路由**（`route-registry.js:309` 注释），不在主导航出现；`useTabDocumentTitle.test.js:71` 把它列入标题豁免例外。

### 2.2 流水线注册与元信息

`src/domain/pipeline-constants.js:32-34`：

```js
export const FILM_ENGINEERING_PIPELINE_ENTRY = {
  name: 'film-engineering', category: 'generated', stageCount: 4, available: true, estimatedCost: 'low',
}
```

主进程 `pipeline-engine.js:481-531` 的实际 stageDefs 是 **6 阶段**（load_template/adapt_script/select_shots/export_prompts/generate_videos/render）。前端 `stageCount: 4` 展示的是可见阶段数（出片两阶段由生成面板驱动），`estimatedCost: 'low'` 是创建页卡片口径；进入真实视频生成后成本由逐镜/逐批确认闸控制（`estimatedCost: 'high'` 是引擎侧定义，`pipeline-engine.js:485`）。两处口径不同属展示层与引擎层各自定义，见 15.4 节差异清单。

### 2.3 容器装配（主进程启动时发生什么）

`container.setup.js:101-103` 在容器装配期注册三个阶段注册器：

```js
const { registerFilmEngineeringStages } = require('../services/film-engineering/film-engineering-stages');
const { registerFilmVideoStages } = require('../services/film-engineering/video-gen');
const { registerFilmRenderStage } = require('../services/film-engineering/film-render');
```

`container.setup.js:443-456` 注册 `filmEngineeringService`，注入 `logger`、`assetGenerator`（图片生成，勾选出图用）与 `userDataKitDir`（= `app.getPath('userData')/film-kit`，全量 kit 回退链首级）。`llm` 注入为 `null`——即**当前版本剧本套用的 LLM 润色在主进程侧未接通**（阶段执行器里 `adapter.adaptScript` 固定传 `llmEnabled: false`，`film-engineering-stages.js:126`；见 15.2）。

IPC handler 注册在 `ipc-handlers/index.js:44-45`：`require('./film-engineering')(ipcMain, deps)`。

---

## 三、数据资产 film-kit：这条流水线的"胶片仓库"

### 3.1 文件清单与实测规模

随包目录 `apps/desktop/electron/film-kit/`（schema 定义 `SCHEMA.md`，加载校验 `kit-loader.js`）。基线实测：

| 文件 | 必填 | 实测规模 |
|---|---|---|
| `film-manifest.json` | ✅ | 162 个场景节点（161 个 count>0）；`schemaVersion`/`filmMeta`/`scenes` 三键，**无 `allowedHosts`** |
| `shot-library.json` | ✅ | 153 个分镜；字段 `shotId/sceneId/prompt/model/refTokens/resultUrl/thumbnailUrl/width/height`；模型分布 5 种：`seedance_2_0` / `nano_banana_2` / `imagegen_2_0` / `soul_cinematic` / `cinematic_studio_video_3_5` |
| `reference-registry.json` | ✅ | 332 条：character 247 / prop 64 / scene 21 |
| `prompt-doctrine.json` | ✅ | 7 blocks / 10 rules / 6 glossary（中英双语） |
| `prompt-doctrine.zh.md` | 否 | 方法论人类可读版 |
| `images/`（10 张 webp + manifest） | 否 | 4 角色定妆 + 6 场景缩略，512px，单张 <20KB |

体积目标 < 6MB（当前约 2.8MB，`SCHEMA.md:18`）。

### 3.2 filmMeta 与角色

`film-manifest.json` 头部（实测）：

- `title: "Hell Grind"`，`durationSec: 5706`（95 分钟），logline：*"Street kids who gain forbidden powers must stand against an ancient evil that is grinding the city down."*
- 四个主角（`characters`，descriptor 供提示词逐字粘贴）：
  - **ROKO** — "Determined street kid; crystal arm; glowing red fist when charged."
  - **JAXX** — "Reckless, hungry street kid; always half-joking; London street voice."
  - **LULU** — "Clever street kid; technical voice; flat, fast, precise."
  - **REIN** — "Mysterious street kid; calm under pressure; carries the coordinates."
- `source`：`projectUrl`（higgsfield 项目页）、`skillRepo`（OSideMedia/higgsfield-ai-prompt-skill，MIT）、`apiBase`。

### 3.3 提示词方法论（doctrine 内容全文要点）

`prompt-doctrine.json` 实测内容（`node -e` 直读取证）：

**7 大提示词块**（blocks，每条含 label/zh/en）：

| key | label | 作用（zh 摘要） |
|---|---|---|
| `scene_context` | SCENE CONTEXT | 以角色计数头开篇（如 `EXACT 3 CHARACTERS — NO DUPLICATES`），后接场景动作与角色行 |
| `geo_spatial_layout` | GEO SPATIAL LAYOUT | 纯场景平面图（地标、左右、相机站位、180° 轴线），**不含角色与动作；每场锁定逐镜粘贴不变** |
| `action_timing` | ACTION TIMING | 0.0-2.0s 逐秒动作；镜头运动写进动作；INNER (unspoken) 内心独白；分阶段眨眼与微表情 |
| `audio` | AUDIO | 台词只存在于 AUDIO 块；音色锁定描述符原样粘贴；写明混音（人声近麦、环境底噪、说话时压低） |
| `character_acting` | CHARACTER ACTING | 情绪状态·此刻所求·隐瞒之物·身体节奏·可见习惯·本镜变化；核心行为段永不改变 |
| `style` | STYLE | 风格前缀逐字粘贴（Photoreal. NON-IP. 16:9. 12s. SFX only. NO CGI. Cinematic.） |
| `positive_constraints` | POSITIVE CONSTRAINTS | 8K 细节、毛孔级皮肤、无抖动闪烁；计数物体以「是什么在画面中」表述；点名失败镜头长什么样 |

**10 条铁律**（rules）：`assets-first`（素材先行）、`describe-everything`（每次全量描述，模型没有记忆）、`one-change-at-a-time`（一次只改一处）、`less-freedom`（少给自由：角落而非房间、锚点而非空地）、`simplify-shot`（镜头不出来就简化镜头，10-15 次迭代上限）、`first-second-wide`（每场第一秒固定广角）、`physics-not-adjectives`（写肌肉不写形容词）、`voice-is-descriptor`（音色是锁定描述符）、`mask-point-changes`（点修改用蒙版，图片绝不全图二过模型）、`dialogue-only-in-audio`（台词只在 AUDIO 块）。

**6 条术语**（glossary）：`seedance_2_0`（视频主力）、`nano_banana_2`（图片）、`soul_cinematic`（电影感图片）、`reference token`（`<<<uuid>>>` 逐字保留）、`character sheet`（角色定妆三视图）、`GEO block`（每场锁定）。

### 3.4 kit-loader 的 fail-closed 校验（5 组校验全过才可用）

`kit-loader.js:20` 定义 4 个必填文件。`loadFilmKit()`（:233-282）流程：读 4 文件（任何缺失/JSON 损坏即失败）→ 5 组校验：

1. `validateManifest`（:36-86）：`schemaVersion === 1`；`filmMeta.title/logline` 非空、`durationSec` 正数、`characters` 非空且每项含非空 `name`；`scenes` 非空、id 唯一、`count>=0`、`level>=0`；树校验（parentId 必须存在、禁自引用环）。
2. `validateShotLibrary`（:92-138）：shotId 唯一非空；`sceneId` 非空；`prompt` 非空且 ≤ `MAX_PROMPT_LENGTH=50000`（:24-25，与 Python 导入器 `FILM_PROMPT_MAX_LEN` 同值单一契约）；`model` 非空；`refTokens` 每项必须为 UUID；扩展字段校验（`durationSec`/`aspectRatio` 需 `"W:H"` 形态/`iterationCount`/`adoptedJobAt`，:124-135）。
3. `validateShotSceneRefs`（:145-156）：任一 `shot.sceneId` 必须在 manifest.scenes 中（孤儿引用 fail-closed）。
4. `validateReferences`（:162-189）：key 必须为 UUID；`kind` ∈ `character|scene|prop|unknown`；`imageUrls` 仅允许 https。
5. `validateDoctrine`（:195-214）：blocks/rules 非空数组且每项含非空 key/label。

**失败语义**：任一校验不通过 → 整体不可用，错误前缀 `FILM_KIT_UNAVAILABLE`（:316），不允许部分降级。加载成功后构建三索引：`shotById`（Map）、`sceneIndex`、`shotSceneIndex`（场景→分镜数组，:258-266）。

### 3.5 两级回退链（userData 全量 → asar 精简包）

`loadFilmKitChain()`（kit-loader.js:291-318）按 dirs 优先级依次尝试：

- 目录不存在 → 记入 `missing`（未导入属正常态，不告警）
- 级内损坏 → 记入 `fallbacks` 并 `log.warn('[FILM_KIT_FALLBACK] …')`（错误可见非静默）
- 全部不可用 → `FILM_KIT_UNAVAILABLE: 所有 kit 级均不可用 — <聚合明细>`

服务层构造（film-engineering-service.js:52-55）：

```js
const dirs = []
if (this.userDataKitDir) dirs.push({ dir: this.userDataKitDir, label: 'userData-full' })
dirs.push({ dir: this.kitDir, label: 'asar-bundled' })
```

**这条回退链有一个重要的下游影响**：`getAllowedHosts()`（film-engineering-service.js:111-114）从 `kit.manifest.allowedHosts` 读取回收下载的白名单域。实测随包精简 kit 的 manifest **不含 `allowedHosts` 键**（返回空数组），而 `shot-downloader.js:55-57` 对空清单 fail-closed 拒绝下载。全量导入器 `fetch-hell-grind-kit.py:386` 才会写入 `manifest["allowedHosts"] = sorted(hosts)`。**结论：原片回收（第 6.6 节路线 F）只在导入 userData 全量 kit 后可用**（详见 13.6）。

### 3.6 数据资产重建（可复现）

```bash
# 精选版（随包，<6MB）
python scripts/film-engineering/fetch-hell-grind-kit.py \
    --source-dir <全量语料目录> --out-dir apps/desktop/electron/film-kit

# 全量版（不进 asar，导入 userData/film-kit）
python scripts/film-engineering/fetch-hell-grind-kit.py \
    --source-dir <全量语料目录> --out-dir <用户数据目录>/film-kit --full --dry-run   # 先对账
```

口径（`fetch-hell-grind-kit.py:30-48`）：每场景取 `created_at` 最大的 completed **视频** job 采纳（图片模型黑名单正则排除 `nano_banana`/`soul_cinematic` 等图片 job，防 3313 个图片 job 污染统计）；`aspectRatio` 归一只接受 `"W:H"`（源语料的 `"auto"` 归一为 null，否则整个全量 kit 被 fail-closed 拒绝）；提示词 `<<<uuid>>>` 与 `params.reference_elements[].id` 匹配；落盘 `.tmp` → rename 原子写。

---

## 四、主进程服务层：FilmEngineeringService 与六大赛道能力

### 4.1 状态查询 getStatus()

`film-engineering-service.js:69-91`。成功返回：

```js
{ available: true, kitSource: 'userData-full' | 'asar-bundled',
  filmMeta, sceneCount, shotCount, referenceCount, error: null }
```

失败**不抛错**，返回 `{ available: false, filmMeta: null, …0 计数, error }`。前端据此渲染空态卡（`FilmEngineeringView.vue:20-29`）。kit 懒加载失败会缓存 `_loadError`（:49-50），后续调用直接重抛，避免反复读盘。

### 4.2 场景树与分镜列表（含分页合同）

`ShotLibrary.listScenes()`（shot-library.js:89-98）：返回 `{id, name, count, parentId, level, shotCount}` 数组，`shotCount` 来自 `shotSceneIndex`（该场景已收录分镜数）。

`listShots(sceneId, opts)`（:107-135）**双语义**：

- **不传 opts**（全量语义，精选模式回归锚）：直接返回数组；但场景分镜数 > `FULL_LOAD_LIMIT=500` 时抛错强制分页；未知 sceneId 一律抛错（不空数组冒充）。
- **传 `{limit, offset}`**（分页语义）：返回 `{shots, total, limit, offset}`；`limit` 缺省 100、上限 200（服务端钳制，超出不报错直接钳到 200）；`offset` 缺省 0；非正整数 limit / 负 offset 抛错。

IPC 层再包一层负载守卫（`ipc-handlers/film-engineering.js:111-128`）：`pageOpts` 必须是纯对象、limit/offset 必须是整数。

`getShot(shotId)`（:138-147）：返回分镜全量字段 + `resolvedRefs`（`refTokens` 逐个经 `resolveRef` 解析，未知 token 返回 `{kind:'unknown'}`，:150-154）。

### 4.3 一键复制：4 种模式的文本组装

`buildCopyText(shotId, mode)`（shot-library.js:157-174）。复制文本由**后端组装**（跨平台一致），前端只写剪贴板：

| mode | 组装逻辑 | 空结果 |
|---|---|---|
| `full` | 原文逐字返回 | — |
| `blocks` | 按五个块标题（`GEO SPATIAL LAYOUT`/`ACTION TIMING`/`AUDIO`/`CHARACTER ACTING`/`POSITIVE CONSTRAINTS`，:16-22）切块，重组为 `[ 标题 ]\n内容` | 无块时返回原文 trim |
| `characters` | 过滤含 `[CHARACTER:` 的行 | 无角色行时返回 `（无角色行）` |
| `geo` | 提取 GEO SPATIAL LAYOUT 块内容 | 无块时返回 `（无 GEO SPATIAL LAYOUT 块）` |

`buildCopyTexts(shotIds, mode)`（:177-190）：1-50 个分镜，合并文本以 `===== [i/N] sceneId · model =====` 分隔。合法 mode 集合 `COPY_MODES`（:24），非法 mode 抛错。

### 4.4 剧本套用引擎 ScriptAdapter（这条流水线的灵魂）

`script-adapt.js`。输入用户剧本 + 角色映射，输出与 kit 分镜同构的 `adaptedShots`（可被勾选生成/导出直接消费）。三步：

**① 分场 splitScript（:22-42）**：按空行（`\n{2,}`）分段；「第X场 / SCENE n / INT. / EXT.」单行标题并入下一段作 title；每段产出 `{index, title, text}`。

**② 模板映射**：第 i 场用 `templates[i % templates.length]`（模板循环，:148-149），默认模板 = kit 全部 153 镜按序循环。

**③ 组装 buildTemplatePrompt（:52-85）**，五段式：

1. 场景标题行：模板首行若是 `INT./EXT.` 场景头则保留，否则用剧情首行
2. 剧情正文：用户段落全文（**剧情内容 100% 来自用户剧本**，:8）
3. 角色行：模板中含 `[CHARACTER: ROKO]` 等行原样保留，并在命中映射时追加 `（你的角色名）`——**是追加括号标注，不是替换**（:60-70）
4. 五个块：`GEO SPATIAL LAYOUT`/`ACTION TIMING`/`AUDIO`/`CHARACTER ACTING`/`POSITIVE CONSTRAINTS` 整块原样复刻（:71-83，按空行切块后逐块过滤拼接）

产出字段（:155-165）：`shotId: 'adapt-001'` 序号化、`sceneId` 由标题归一（`normalizeSceneId`，保留中文/字母数字，截 48 字符）、`model: template.model || 'seedance_2_0'`、`refTokens`（模板的截取前 8 个）、`roleBindings`、`beatIndex`、`sourceTemplateId`。

**边界**：剧本 ≤10000 字（:13）；角色映射 ≤10 键且每值非空（:14, :128-137）；分场失败（无空行分隔）报「剧本无法分场」。

**LLM 润色的降级合同**（:168-191）：`llmEnabled === true` 且注入了 `llm.enhance` 才走润色；仅前 `min(分镜数, 20)` 镜逐个调用；单镜失败 warning 并保留本地模板结果；`enhancedCount === 0` 时整体 `llmEnhanced: false`。**当前版本主进程注入 `llm: null`**（见 2.3），所以 UI 勾选了润色也不会实际调用 LLM——画布视图对此有显式提示（`FilmCanvasView.vue:73-74`：`llmFallback`「LLM 润色本次未生效，分镜按内置规则架构生成」）。

### 4.5 勾选生成图片 generateSelected

`film-engineering-service.js:161-195`：1-20 镜（`MAX_GENERATE_BATCH=20`）逐镜调 `assetGenerator.generateImage(prompt, {style:'cinematic', index, aspect_ratio})`，默认 `16:9`。单镜失败记入 results 不中断（:186-188）；**全部失败**才 `ok:false`（:191-193）；部分失败 `partialFailure: true`。这是"复用通用图片能力"的旁路——主流是出视频。

### 4.6 导出 exportPrompts

`:131-153`：1-50 镜，同时产出 JSON（`JSON.stringify(…, null, 2)`）与 Markdown（`## [i] sceneId · model` + prompt，`---` 分隔）两种格式；`fileName: 'film-engineering-prompts-<YYYY-MM-DD>.<fmt>'`。前端经 `downloadText`（`useFilmEngineering.js:346-361`，Blob + a.download）落为文件。

---

## 五、流水线引擎集成：六个自定义阶段执行器

### 5.1 流水线定义

`pipeline-engine.js:480-531`：

```js
{
  name: 'film-engineering',
  description: '影视工程（Hell Grind 复刻） - 真实分镜提示词库浏览/一键复制/剧本套用/导出',
  category: 'generated',
  stages: ['load_template', 'adapt_script', 'select_shots', 'export_prompts', 'generate_videos', 'render'],
  estimatedCost: 'high',
  stageDefs: [
    { name: 'load_template',   type: 'film_load_template',   checkpointRequired: false },
    { name: 'adapt_script',    type: 'film_adapt_script',    checkpointRequired: false },
    { name: 'select_shots',    type: 'film_select_shots',    checkpointRequired: false },
    { name: 'export_prompts',  type: 'film_export_prompts',  checkpointRequired: false },
    { name: 'generate_videos', type: 'film_generate_videos', checkpointRequired: true, checkpointType: 'cost_confirm' },
    { name: 'render',          type: 'film_render',          checkpointRequired: false },
  ],
}
```

**只有 `generate_videos` 声明 `checkpointRequired: true`**（契约测试 `film-pipeline-contract.test.js:30` 锁定「仅 film_generate_videos 声明 checkpointRequired=true」）。这是整条流水线唯一的计费闸。

### 5.2 前四阶段（film-engineering-stages.js）

四个执行器共享一个 context 解析兼容层 `ctxFlatOrNested`（:42-46）：引擎按 stage 名嵌套写入（`run.context[stageName]=output`）与测试/initialContext 直供的扁平键都能读到。

**film_load_template（:48-86）**三种分支：

1. context 已有 template（重入/续跑）→ 直通
2. 无 `params.kitDir` 但 context 有 `selectedShots`（出片流：勾选分镜直接生成）→ `{template: null, passthrough: true}`
3. 无 kitDir 但有 `renderManifest`（收口合成流）→ `{template: null, passthrough: true, manifestMode: true}`
4. 都没有 → 报错 `film_load_template 需要 params.kitDir`

有 kitDir 时调 `loadFilmKit({kitDir})`，失败包 `FILM_KIT_UNAVAILABLE` 前缀。

**film_adapt_script（:88-141）**：`params.script` 为 `undefined`（非字符串）→ 直通保留既有 adaptedShots（出片流不做套用）；`script=''` 属作者流空剧本 → 仍走适配器 fail-closed（「剧本不能为空」）。注意阶段内 `new ScriptAdapter({…, llm: null})` 且 `llmEnabled: false`（:119-127）——引擎链路固定不用 LLM。

**film_select_shots（:143-184）**：无 `selectedShotIds` → 直通既有 selectedShots 或 manifest 模式空选择；有 ids 时 ≤50 个，从 template.shots + adaptedShots 合并 Map 逐个取（不存在即报错）。

**film_export_prompts（:186-232）**：空选择 + manifest → 空导出直通；否则产出 JSON/Markdown 双格式。

### 5.3 film_generate_videos（计费核心，video-gen.js:226-388）

**分支 1：manifest 直通闸**（:241-249）。无 selectedShots 但有 `renderManifest` → `{success: true, checkpoint: false, output:{manifestMode:true, entryCount}}`。`checkpoint: false` 显式声明——收口合成 run 的成本闸无意义，引擎据此**不再按 stageDefs 的 checkpointRequired 暂停**（9.3 冒烟回归合同）。

**分支 2：参数校验**（:250-276）。无 selectedShots → 报错要求先执行 film_select_shots；> `MAX_VIDEO_BATCH=10` → 报错；逐镜 prompt 非空校验；`aspect` ∈ `['16x9','9x16','source']`（:40）、`seconds` ∈ `[5,8,10]`（:41，默认 5）；视频 Provider 未配置 → `VIDEO_MODEL_NOT_CONFIGURED` fail-closed（:269-276）。

**Provider 解析**（`resolveFilmVideoProvider`，:106-114）：`aiGenerator._modelProviderManager.getDefault('video')` → 双默认语义（用户默认 > 运营默认 > capability_models.video > models[0]，经 `resolveProviderDefaultModel`）。**kit 的 model 字段仅展示、不参与路由**（:9 合同）。

**分支 3：成本确认闸**（:280-307）。`context.cost_confirmation.confirmed !== true` 时**先行返回等待态**：

```js
{ success: true, output: { awaitingConfirmation: true, costCheck: {
    totalShots, maxBatch: 10, aspect, seconds, providerId, model,
    references: { shotsWithReferences, providerSupportsReference },
    shots: [{index, shotId, title, aspect, seconds}, …] } } }
```

**零 provider 调用**。引擎按 stageDefs 把它转成 checkpoint 暂停；前端确认后 `pipelineConfirmStageGate(runId, {cost_confirmation:{confirmed:true}})` 重入同阶段才真实生成。

**分支 4：真实生成**（:308-383）：

- `runDir = getFilmRunDir(runId)` = `os.tmpdir()/film-engineering/<runId>`（:48-50），mkdir recursive
- 参考图：`normalizeLocalReferences(context.localReferences)` → Map（:278；见 5.5）
- 并发：`mapWithModelBudget`（model-call-scheduler），`videoConcurrency` 可配默认 2；调度器异常降级串行（:341-352）
- 逐镜 `generateShotVideo`（:151-219）：
  1. `buildShotSubmitPayload`（:73-93）：**prompt 逐字符原文直送**（含 `<<<uuid>>>` 令牌，MUST NOT 过 prompt-engine 优化链，:8）；帧数映射 `pickFilmFrameCount`：≤5s→121 帧、≤8s→201、≤10s→241（:53-60），24fps；`numFrames/frameRate` 与 `num_frames/frame_rate` 双写命名兼容（agnes 读驼峰、ltx 读下划线，:71）；画幅映射 16x9→1280×720、9x16→720×1280、source 不下发尺寸（:85-92）
  2. `manager.callAdapter(providerId, 'generateVideo', payload)`；双层失败合同：外层 `code!==0`、内层 `data.code<0` 均记失败（:183-189）
  3. 无 taskId → 失败；轮询 `getVideoStatus`（10s 间隔 / 10min 上限，:44-45），拿到 `videoUrl` 或终态 failed/error/cancelled 退出
  4. 下载 `shot_NNN.mp4` 到 runDir（:210-211）
  5. **单镜失败统一出口**：`noteFail` 先 `log.warn('FilmVideoGen', 'shot N (shotId) failed: <reason>')` 再返回（:154-160），杜绝静默失败；失败不抛出，返回 `{index, shotId, success:false, error}`
- 部分失败以 `partialFailure` 继续；**全部失败**才阶段失败（:366-369）
- 参考图注入失败不阻断，降级纯文本 + `referenceWarnings` 明示（:161-175, :381）

### 5.4 film_render（成片合成，film-render.js:217-335）

**输入两种模式**（:229-259）：

- **manifest 模式**：`context.renderManifest` 非空 → `parseRenderManifest`（:109-162）校验：非空数组 ≤10000 条（:91）；每条 `{shotId, path, sourceKind: 'generated'|'downloaded', orderIndex}`；`orderIndex` 从 0 连续不重复；`path` 绝对路径且 **realpath 规范化后必须位于受控媒体根内**（`..` 遍历、symlink/junction 逃逸拒绝，:138-144）；缺失文件列清单（按 orderIndex）。校验失败 fail-closed 并返回 `missingEntries`/`invalidEntries`。
- **单批模式**（既有路径）：无 manifest → 以 `context.selectedShots` 数量为准，**磁盘扫描** `collectDiskShots(runDir, total)`（:168-177）核对 `shot_000.mp4 … shot_(N-1).mp4`；缺任一镜 → fail-closed 列出缺失序号（:249-257）——「信磁盘不信内存态」（D7 合同，:7-8），单镜重试覆盖磁盘后即视为可用。

**拼接策略**（:261-314）：

1. `probeClip`（:41-62）ffprobe 逐片段探测：codec/width/height/fps/timebase/hasAudio/sampleRate/channels，构成 `specKey`（:74-76）
2. 全部一致 → `concat demuxer -c copy` **零重编码直拷**（:307-308）
3. 不一致 → 逐片段最小归一（`norm_NNN.mp4`）：`scale=<target>:force_original_aspect_ratio=decrease,pad=…:color=black,setsar=1` + `-r 24` + `libx264 veryfast crf 23` + `aac`（:199-202, :283-298）；目标画幅 16x9→1280×720、9x16→720×1280、source→首片段宽高（:29, :276-278）
4. **无转场/调色/字幕/音轨处理**（:12 合同）；产物 `final.mp4` 落 runDir（:270）
5. `ffmpeg`/`ffprobe` 经 `media-tool-paths.js` 查找（打包产物 resourcesPath/media-tools → `ffmpeg-ffprobe-static` → PATH/常见安装目录 → `FFMPEG_PATH`/`FFPROBE_PATH` 环境变量）

输出：`{finalPath, mode: 'copy'|'normalize', clipCount, runDir, source: 'renderManifest'|'selectedShots'}`。

### 5.5 画布参考图注入（video-reference-inputs.js）

画布连线（参考图节点 → 分镜节点）在前端收集为 `localReferences: [{shotId, paths[]}]`，随 initialContext 透传。引擎侧：

- `normalizeLocalReferences(raw)`（:48-61）：非法形状防御跳过（绝不抛异常）——用户可控内容，这是不信任边界的第二道闸
- `supportsVideoReferenceInput(providerId)`（:37-40）：**显式映射表**能力探测（:30-34）：`minimax → firstFrameImage`、`agnes-video/agnes-multimodal → image`；seedance/kling/veo 等 adapter 无参考输入参数，**不得列入**（列入即承诺行为）
- `resolveShotReferenceInput`（:70-120）：路径纵深防御——只接受 `path.resolve` 后位于受控媒体根（`os.tmpdir()/film-engineering`）内的文件；越界只报告 `outside-media-root` 不读取；内容只信魔数嗅探（PNG/JPEG/WEBP，`reference-store.js:24-40`）；读取侧兜底 `MAX_REF_BYTES=10MB`；**一镜多参考 v1 取首个有效参考**（首帧语义）
- 注入失败 → warning 降级纯文本，不阻断出片

上传侧（`film-engineering:upload-reference`，ipc-handlers/film-engineering.js:235-252）：渲染端把图片读成 dataURL 提交，`saveReference`（reference-store.js:73-95）解码 → 魔数嗅探（**不信任客户端 mime**）→ ≤10MB → 服务端生成文件名 `ref-<16hex>.<ext>`（**用户可控内容绝不参与文件名，路径穿越在结构上不可能**，:8-9）→ 落盘 `references/`。

---

## 六、IPC 全量通道清单与三层防御

### 6.1 16 条通道一览

定义 `ipc-handlers/film-engineering.js`；preload 暴露 `electron/preload/film-engineering.js`（bundle `home-shell-preload.bundle.js:1025-1045`，17 个方法含事件订阅）。全部通道经 `withSenderCheck`（sender 规范化目录边界校验）+ 入参运行时校验；公开方法（未登录可用）含 `filmEngineering` 及其 status/listShots/generateSelected 等（`preload.test.js:734-739`）。

| 通道 | 参数 | 返回 `data` | 校验要点 |
|---|---|---|---|
| `status` | — | getStatus() 结果 | kit fail-closed 错误经 `withKit` 转 REQUEST_ERROR |
| `list-scenes` | — | 场景树数组 | — |
| `list-shots` | `sceneId, {limit,offset}?` | 数组或分页封装 | sceneId 非空；分页整数 |
| `get-shot` | `shotId` | 分镜 + resolvedRefs | shotId 非空 |
| `doctrine` | — | blocks/rules/glossary | — |
| `copy-text` | `shotId, mode` | `{text, mode}` | mode trim 后合法（`film-engineering.test.js:142` 实证 trim） |
| `copy-texts` | `shotIds[≤50], mode` | `{text, mode, count}` | 每项非空 |
| `adapt-script` | `{script≤10000, characterMap≤10, llmEnabled?}` | `{adaptedShots, llmEnhanced, warnings}` | 逐键非空（:160-196） |
| `export` | `selectedShots[≤50], format` | `{export:{json,markdown}, fileName}` | 每项 prompt 非空 ≤50000 |
| `generate-selected` | `selectedShots[≤20], opts` | `{results, partialFailure}` | 同上 |
| `upload-reference` | `{dataUrl}` | `{path, fileName, bytes, mime}` | 魔数嗅探在 service |
| `retry-shot` | `{runId, shotIndex, aspect?, seconds?}` | `{index, shotId, success, path?}` | 见 6.2 |
| `download-recycled` | `{taskId, items[≤50]}` | `{results, allOk, destDir}` | orderIndex 0-9999 不重复 |
| `production-plan` | `{shotIds[≤1000]}` | `{shotCount, batchSize:10, batchCount, batches, diskEstimateBytes, wallclockEstimateSeconds, mediaRoot}` | taskId 固定 'plan' 校验 |
| `production-run-batch` | `{taskId, shotIds, batchIndex, aspect?, seconds?}` | `{ok, batchIndex, batchStatus, batchError, failedBatches, renderManifest, manifestError}` | taskId 路径安全；provider 预检 |
| `production-status` | `{taskId, shotIds}` | `{exists, batches, doneCount, totalCount, renderManifest, manifestError}` | 只读零 provider 调用 |
| （事件）`production-update` | push | `{type, batchIndex?, shotIndex?, status?, doneCount, totalCount, ...}` | driver 节流 500ms，负载只带计数不带 shotIds 数组 |

常量：`MAX_SHOTS_ARRAY=50`、`MAX_GENERATE_BATCH=20`、`MAX_RECYCLE_BATCH=50`、`RECYCLE_CONCURRENCY=4`、`MAX_PRODUCTION_SHOTS=1000`（ipc-handlers/film-engineering.js:42-46）；估算口径 `DISK_ESTIMATE_BYTES_PER_SHOT = 8MB`、`WALLCLOCK_SECONDS_PER_SHOT = 300`（:47-49，POC 实测单镜 4.5-8.5MB 取上限、并发 2 单镜均值 ~10min）。

### 6.2 retry-shot 单镜重试通道精读（:256-307）

这是贯穿两条出片路线的关键通道：

1. 校验 `runId` 非空、`shotIndex` 非负整数
2. `pipelineEngine.getRunSnapshot(runId)` 取 run 快照——**不属于任何运行中流水线的 runId 拒绝**（:269-271）。引擎侧 `getRunSnapshot`（pipeline-engine.js:1879）从 `this._runs` 索引（按 runId 与 `'_'+pipelineName` 双键，:922-926、:1558-1559）
3. 从 `snapshot.context.selectedShots[shotIndex]` 取**原文 prompt**——前端只传定位参数（runId/shotIndex/aspect/seconds），**不携带 prompt**（`useFilmVideoGen.js:11` 合同），杜绝前端伪造/篡改提示词
4. aspect/seconds 非法值静默回落默认（16x9/5s，:283-284）
5. Provider 预检 `VIDEO_MODEL_NOT_CONFIGURED`
6. 直接调 `generateShotVideo` 覆盖该镜 `shot_NNN.mp4`——**绝不触碰流水线阶段状态机**（:254-255），原文逐字符提交（重试口径 = 首次口径）
7. 全量出片路线的重试走**确定性派生 runId**：`prod-<taskId>-b<batchIndex>`（`useFilmProduction.js:275`），因为批量出片的 run 不经引擎

### 6.3 production 三通道精读

**production-plan**（:382-396）：`planBatches(shotIds)`（production-driver.js:34-42）切批——保序、batchIndex 从 0 连续、每批 ≤`PRODUCTION_BATCH_SIZE=10`。返回纯估算（磁盘 = 镜数 × 8MB；墙钟 = 镜数 × 300s），零 provider 调用。

**production-run-batch**（:400-455）：每次只执行一批（D9 逐批确认语义，`runOnlyBatch: batchIndex`）；台账目录 `os.tmpdir()/film-engineering/production/<taskId>/`；事件经 `event.sender.send('film-engineering:production-update', e)` 推送（窗口销毁 try/catch 不影响执行，:426-429）；批后返回当前批状态与**若全部收口则附 renderManifest**。

**production-status**（:458-485）：只读——loadLedger + resolveResumePlan（磁盘 probe）双核返回批/镜状态、doneCount 与收口清单。台账不存在返回 `{exists:false, batches:[], doneCount:0, …}`。

### 6.4 download-recycled 原片回收（:313-379）

- taskId 路径安全校验；items ≤50、orderIndex 0-9999 不重复
- **URL 一律取 kit `shot.resultUrl`（renderer 传入的 url 字段忽略）**（:309-310），allowedHosts 取 kit manifest（见 3.5 的空清单影响）
- 落盘 `production/<taskId>/recycled/shot_<orderIndex>.mp4`，条目 `{shotId, path, sourceKind:'downloaded', orderIndex}` 可直接进 renderManifest
- 单项失败隔离不中断（无 resultUrl 的镜报「该镜无 resultUrl，无法回收下载（需走批量出片重新生成）」，:358）；并发 4

---

## 七、渲染端三套 composable 与两个视图

### 7.1 useFilmEngineering（经典视图 composable，467 行）

状态：`status/scenes/selectedSceneId/shots(分页累计)/shotsTotal/shotsHasMore/shotDetail/doctrine/selectedShotIds/copyMode/adapt{script,characterMap,llmEnabled,loading,adaptedShots,warnings}`。

关键行为：

- `refreshAll()` 并发拉 status + scenes；`selectScene(id)` 首页 100 镜；`loadMoreShots()` 下一页（前端滚动哨兵 IntersectionObserver 自动触发，rootMargin 240px，`FilmEngineeringView.vue:676-687`；无 IO 环境保留手动「加载更多」兜底）
- `selectedShotsPayload()`（useFilmEngineering.js:282-290）：从已加载分镜按勾选序组 `{shotId, sceneId, prompt, model, refTokens}` 并 **`JSON.parse(JSON.stringify())` 脱壳**（Vue 响应式 proxy 直接过 IPC 会报 "An object could not be cloned"，AGENTS.md QM-2 契约）
- 配置档案（ConfigProfileManager）：snapshot `{schemaVersion:1, kind:'film-engineering', filmEngineering:{copyMode, characterMap, llmEnabled}}`（:292-306），`applyConfigProfileSnapshot` 校验 kind/枚举/布尔后还原（:308-322）；CRUD 固定 `pipelineId: 'film-engineering'` 并过滤其他流水线的档案（:214-227 测试锁定）
- 错误提示统一走 `formatUserError` + `notifyWarning/notifySuccess`

### 7.2 useFilmVideoGen（≤10 镜分镜视频生成驱动，271 行）

状态机 `phase: idle → generating → awaiting-confirm → generating → done | failed | cancelled`。

- `start(selectedShots, {aspect, seconds, localReferences})`：>10 镜前端拦截 `tooManyShots`；payload 脱壳后 `pipelineStartOrchestrated('film-engineering', {autoAdvance:true, initialContext:{selectedShots[, localReferences]}, aspect, seconds})`（:158-164）
- 跟踪：`onPipelineUpdate` 推送 + 3s 轮询 `pipelineGetRunContext` 兜底（终态权威源）；push 快照带 `runId` 串扰守卫（:105）
- 消费 context：`context.generate_videos.costCheck/videoResults`；`context.render.finalPath/runDir`
- checkpoint 判定：`runStatus === 'paused' && snapshot.checkpoint.stageName === 'generate_videos'` 且已有 costCheck → `phase='awaiting-confirm'`（:125-127）
- `confirmCost()`：merge `{cost_confirmation:{confirmed:true, confirmedAt}}` 过闸重入（:193-209）；`cancelCost()`：`pipelineCancelRun`——成本闸前已发生的阶段零计费，重发起走新 run（:211-226）
- `retryShot(index)`：`filmEngineeringRetryShot({runId, shotIndex, aspect, seconds})`（:229-243）
- `shotResults` computed（:54-75）：以 costCheck.shots 为骨架，按 index 合并 videoResults 得每镜 `pending|success|failed + path/error`

### 7.3 useFilmProduction（全量分批出片驱动，420 行）

状态机 `idle → plan-ready → batching → manifest-ready → composing → done | failed`。

- `planProduction(ids)`：调 production-plan 得 `{batchCount, batchSize, shotCount, diskEstimateBytes, wallclockEstimateSeconds, mediaRoot}`
- `begin(taskId)`：taskId 正则 `/^[a-zA-Z0-9._-]{1,64}$/`（视图层 `FilmEngineeringView.vue:542`），实例化批视图 + 订阅 `onProductionUpdate` 事件（进度只增量刷新计数、批状态就地 mutate，**不重建 batches 数组——保住用户展开态**，:83-98 渲染纪律）
- `confirmBatch(i)`：productionRunBatch（确认后该批才计费）→ `syncStatus()` 台账+磁盘双核重同步 → `checkConvergence()`（manifest 非空即 `manifest-ready`）；`confirmedBatchIndexes` 累计已确认预算口径（`confirmedShotCount`，:62-65）
- `resume(id, ids)`：只读 production-status 恢复视图（零 provider 调用）；台账不存在报 `noLedger`
- `retryShotInBatch(bi, si)`：`retry-shot` 通道 + 派生 runId `prod-<taskId>-b<bi>`（:270-287）
- `recycleAll()`：全部选中镜按 orderIndex 分片（≤50/片）调 download-recycled（:289-316）
- `composeFinal()`：**manifest 直通 run**——`pipelineStartOrchestrated('film-engineering', {autoAdvance:true, initialContext:{renderManifest}})`（:319-350）；generate_videos 对 manifest 直通闸零调用过闸（5.3 分支 1）→ film_render 拼接；合成 run 无需成本确认（:352 注释）

### 7.4 useFilmCanvas + film-canvas-model（画布）

纯模型层（`film-canvas-model.js`，无 Vue/DOM 依赖可 node 测试）：

- 节点类型 5 种：`scriptInput / characterRef / sceneRef / shot / artifact`（:15-21）
- **边合法性矩阵**（:29-35）：只有 `characterRef → shot` 与 `sceneRef → shot` 允许手连；shot→artifact 为生成结果自动挂载；非法连线返回 i18n key（sameNode/duplicate/unknownType/unsupportedPair）
- `shotsToNodes`（:64-93）：adaptedShots 按 sceneId 聚组、组内每行 4 个网格布局（COL_GAP 360 / ROW_GAP 220 / SCENE_GAP 120）；`mergeNodesKeepPosition`（:99-106）重铺保位置
- `buildLocalReferences`（:136-144）：按连线收集每镜上游参考图路径（character/scene 两路合并）
- `serializeCanvasState/deserializeCanvasState`（:146-206）：schemaVersion=1；`sanitizeNode` 白名单净化（label≤200/path≤1000/mime≤100/shot 对象/sceneId≤200/status≤40），**用户可控内容不进文件名、路径只信服务端返回**（:148）
- `findShotResultIndex`（:218-224）：run 结果里按 shotId 找 index，fail-closed（未命中返回 null，绝不带着臆造 index 调 retry）

桥接层（`useFilmCanvas.js`）：

- `runAdapt()`（:80-110）：校验（≤10000 字）→ `adaptScript` → `appendShotNodes` 铺节点 → persist
- `uploadReference(file, kind)`（:116-159）：前端校验 type ∈ PNG/JPEG/WEBP、≤10MB → 分块 btoa 转 dataURL → IPC → 落成节点
- `persist/restore`（:218-244）：localStorage 持久化（键 `STORAGE_KEY`，注释即真实值 `film-engin…s:v1`——变量名标注省略号，实际值以此导出常量为准）；节点拖拽结束自动 persist（`FilmCanvasView.vue:62` onNodeDragStop）

### 7.5 两个视图的分工

**FilmCanvasView.vue（画布，236 行）**：Vue Flow 底座（Background/Controls/MiniMap）+ 顶栏工具（画幅/时长选择、拆分镜、上传人物/场景参考、生成所选、清空、回退经典页）+ 底部剧本框（3 行 + LLM 勾选）+ 成本确认 el-dialog + 成片完成提示条（打开所在文件夹/另存为走 story2video 的 `story2videoShowInFolder/story2videoSaveAs` IPC，:138-139）。生成按钮无选中时取**全部** shot 节点（:160 `selectedShotIds.length ? selectedShotIds : allShotIds`）。失败镜在节点上就地重试（ShotNode 的 retry 事件 → `onRetryShot` → findShotResultIndex → retryShot，:121-132）。

**FilmEngineeringView.vue（经典视图，779 行）**：配置档案卡 + 头部元信息卡（片名/logline/时长/场景/分镜/资产计数/四主角 tooltip + 来源链接经 `safeHttpUrl` 判据，:41-44）+ 三个标签页（分镜库/剧本套用/提示词方法论）+ 分镜详情抽屉（4 种复制模式、resolvedRefs 图墙、令牌复制、全文展开）+ 生成结果 dialog + **分镜视频生成面板**（idle 发起/awaiting-confirm 成本卡/generating 逐镜进度与失败重试/done 成片三键/cancelled/failed 含 `VIDEO_MODEL_NOT_CONFIGURED` 引导「前往模型设置」）+ **全量分批出片面板**（plan-ready 计划预览含磁盘/耗时/媒体目录/taskId 输入/batching 逐批确认与批次明细展开、失败镜重试、回收按钮/manifest-ready 收口合成/composing/done/failed）。

文案合同：两个视图所有用户可见文字走 `filmEngineering.*` 命名空间 `t(key)`，文件内不写中文字面量（注释除外，`FilmCanvasView.vue:4`）。

---

## 八、用户操作流程详解（六条路线逐步操作）

> 先做一次性准备：① 在**模型设置**配置一个视频 Provider（如 Seedance/Kling/Veo/CogVideo）并设为默认——所有出片路线的前置（`VIDEO_MODEL_NOT_CONFIGURED` 的唯一解法）；② 可选：配置图片生成 Provider（勾选出图用）。

### 8.1 路线 A：浏览与复制提示词（零成本）

1. 创建页选择「影视工程」卡片 → 进入经典视图（或从画布工具栏点「经典视图」）
2. 头部卡确认 kit 可用（片名/95 分钟/162 场景/153 分镜/332 资产；若显示「影视工程资源不可用」见 13.1）
3. 「分镜库」标签：左侧场景树点选场景 → 右侧分镜卡列表（每卡含 model 标签/分辨率/前 8 位 shotId/提示词预览；滚动到底自动加载下一页）
4. 勾选若干镜 → 选择复制内容模式（完整提示词/提示词块/角色行/GEO 布局）→「批量复制」；或单卡「复制完整提示词」
5. 点分镜卡打开详情抽屉：4 种模式复制、引用资产图墙（可复制 `<<<uuid>>>` 令牌）、展开全文
6. 「导出 JSON / 导出 Markdown」把勾选分镜落为 `film-engineering-prompts-<日期>.<fmt>` 文件

### 8.2 路线 B：剧本套用一步到分镜（零成本）

1. 「剧本套用」标签：粘贴剧本（≤10000 字，**按空行分隔场景**——每个空行段=一个分镜；「第X场/SCENE n/INT./EXT.」行会被识别为场景标题）
2. 角色映射：前 4 行预填 ROKO/JAXX/LULU/REIN，右侧填你的角色名（如 `ROKO → 小强`）；可增删映射（≤10 个）。映射后提示词中的角色行会**追加**「（你的角色名）」标注
3. 可勾选「启用 LLM 润色」——注意：当前版本引擎链路未接 LLM（4.4 节），画布视图会明确提示「LLM 润色本次未生效，分镜按内置规则架构生成」
4. 「套用生成」→ 结果卡逐镜展示（#序号/model/来源模板前 8 位/复制单镜按钮）
5. 复制这些提示词到任意外部工具使用，或继续路线 C/D/E 出片

### 8.3 路线 C：画布逐镜出片（推荐创作动线）

1. 创建页进画布 `/film-engineering`
2. 底部剧本框粘贴剧本 → 选画幅（16:9 横屏 / 9:16 竖屏 / 跟随原图）与时长（5/8/10 秒）→「拆分镜」→ 画布自动铺分镜节点（按场景聚组网格）
3. 「上传人物参考 / 上传场景参考」添加参考图节点（PNG/JPEG/WEBP ≤10MB）
4. **从参考节点拖线到分镜节点**（连线即注入；反向或重复连线会被拒绝并提示）
5. 框选要生成的分镜节点（不选则生成全部）→「生成所选」
6. 弹出**成本确认卡**（将为 N 个分镜生成视频，确认后才开始计费）：
   - 「确认成本并生成」→ 逐镜生成（节点状态徽标：待生成→生成中→已完成/失败）
   - 「取消」→ run 终止，零计费
7. 失败的镜点节点上的「重试」按钮就地重试（原文直送，与首次口径一致）
8. 完成后右下角成片提示条：「打开所在文件夹」/「另存为」

画布状态（节点位置/连线/剧本）持久化到 localStorage，重启自动复原。

### 8.4 路线 D：经典视图批量出片（≤10 镜）

1. 「分镜库」标签勾选 ≤10 镜 → 点「生成视频」
2. 发起面板：确认已选数量、画幅、时长 →「发起生成」
3. 成本确认卡：显示「将为 N 个分镜生成视频（画幅 X / 时长 Ys，Provider：Z）。确认后才开始计费生成」+ 逐镜列表 →「确认生成」
4. 生成中：进度条 + 逐镜状态（待生成/成功/失败）；失败镜有「重试」按钮
5. 完成：成片路径 + 「打开所在文件夹」/「另存为」/「再来一批」

### 8.5 路线 E：全量分批出片（>10 镜，含断点续跑）

1. 「分镜库」勾选 >10 镜（≤1000）→ 点「全量出片」
2. **计划预览**：共 N 批（每批 ≤10 镜）、磁盘预估（镜数×8MB）、耗时预估（镜数×5 分钟）、媒体目录、任务 ID 输入框（默认 `default`；只允许字母数字 `._-`，1-64 位——它是台账目录名与断点续跑钥匙）
3. 「发起出片」→ 进入逐批模式：显示剩余批次、累计已确认镜数、总进度条
4. 每批一张确认卡（「确认执行本批」）——**确认一批才算一批的钱**；确认后该批 2 并发生成，逐镜进度实时刷新（可展开「批次明细」看每镜状态）
5. 失败镜：「重试该镜」（走 retry-shot 通道，派生 runId）；失败批不影响后续批（失败隔离）
6. 中断恢复（崩溃/关机/重启后）：同入口输入**同一个任务 ID** →「恢复任务」——只读恢复批/镜进度（不触发生成与计费）；磁盘已齐的镜自动跳过（无论台账标什么）
7. 全部批次完成 → 自动得渲染清单（manifest-ready：「全部批次已收口，渲染清单共 N 条」）→「合成成片」（generate_videos 直通过闸 → ffmpeg 拼接）→ 成片三键
8. 可选「回收全部原片」：下载 kit 分镜原作者的成片到 `production/<taskId>/recycled/`——**注意 13.6 的 allowedHosts 前提**

### 8.6 路线 F：外部工具协作（导出即走）

任何勾选集合都可「导出 JSON/Markdown」，把真实工程提示词带去其他工具；`copy-texts` 的合并文本格式带 `===== [i/N] sceneId · model =====` 分隔头，适合粘贴进文档做逐镜管理。

---

## 九、成本确认闸与断点续跑机制精读

### 9.1 成本闸的三态语义（D2 合同）

1. **闸前**：`cost_confirmation.confirmed !== true` → generate_videos 阶段返回 `awaitingConfirmation + costCheck`，**所有路径同受闸**（零 provider 调用）。引擎转 checkpoint 暂停（stageDefs `checkpointRequired:true, checkpointType:'cost_confirm'`）。
2. **过闸**：`pipelineConfirmStageGate(runId, patch)` merge `{cost_confirmation:{confirmed:true, confirmedAt}}` → 重入同阶段真实生成。
3. **直通**：manifest 模式（收口合成 run）显式 `checkpoint:false`——引擎不再暂停，零计费直通到 render。

成本卡载荷（costCheck）逐镜列出 `{index, shotId, title, aspect, seconds}` + 参考图统计（`shotsWithReferences`、`providerSupportsReference`），用户据此判断再点确认。

### 9.2 断点续跑的唯一裁决：磁盘信物

`production-driver.js` 的重入协议（D6，:86-103）：

```
读台账 ledger.json（.tmp+rename 崩溃安全）
  → resolveResumePlan：逐批 probe(runId, count) 磁盘复核 shot_NNN.mp4
      磁盘齐  → needRun=false（零 provider 调用跳过；台账态归一为 done——
                含"上次崩溃发生在写盘前"的场景，:207-215）
      磁盘缺  → needRun=true 重跑（哪怕台账标 done——"双核"裁决，:85-88）
  → runOnlyBatch 只执行指定批（D9 逐批确认），其余待跑批保持 pending
  → 批后再次磁盘复核（不信 runBatch 自报，:233-248）
  → 全部批 done 且磁盘复核全过 → buildRenderManifest（:116-142）
      任一条件不满足 → ok:false 不产出（防假成片清单）
```

**台账与磁盘的分工**：ledger.json 是状态载体（批次清单 + 每镜 status/error，error 截 500 字符）；磁盘 shot_NNN.mp4 是唯一裁决。台账缺失/损坏/批次结构与本次计划不一致 → 重建（:175-185）。

**renderManifest 契约**（D5）：`[{shotId, path, sourceKind, orderIndex}]`，orderIndex 从 0 连续、≤10000 条（全集 ≈6558 镜口径，:89）、path 经 realpath 必须在受控媒体根内。

### 9.3 事件节流与 IPC 负载守卫

逐镜进度事件在 500ms 窗口内合并为最新计数（`EVENT_MERGE_MS=500`，production-driver.js:30, :193-200）；**事件负载只带计数/索引，不带 shotIds 数组**（:19 IPC 负载守卫）。前端 `applyProductionEvent` 只增量刷新计数与批状态、单调不回退（`useFilmProduction.js:83-98`）。

---

## 十、安全合同：这条流水线的九道防线

1. **IPC sender 校验**：全部通道 `withSenderCheck`（`ipc-handlers/film-engineering.js:26` 引入；sender file URL 经 `fs.realpathSync.native()` 规范化后做目录边界比较，AGENTS.md QM-2「IPC file URL canonical 合同」）；未受信 sender 一律拒绝（`film-engineering.test.js:93` describe 专测）。
2. **kit fail-closed**：schema 任一不过 → 整体 `FILM_KIT_UNAVAILABLE`，无部分降级（3.4）。
3. **参考图三闸**：前端 type/大小校验 → 主进程魔数嗅探（不信任客户端 mime）→ 服务端随机文件名（路径穿越结构性不可能）（4.5/5.5/7.4）。
4. **参考注入纵深防御**：只读受控媒体根内文件，越界只报告不读取；内容再嗅探；10MB 兜底（5.5）。
5. **原文直送**：出片提示词逐字符等于 kit/剧本套用原文，**禁止过 prompt-engine 优化链**（video-gen.js:8 合同；`video-gen.test.js:74` 契约测试在优化器被调用时抛 `CONTRACT VIOLATION`）；重试 prompt 由主进程从 run 快照取，前端不携带（6.2）。
6. **回收下载五重防线**（shot-downloader.js:5-16）：① 仅 https；② 主机名与 kit `allowedHosts` **精确匹配**（禁通配/子域后缀）；③ 内网地址黑名单兜底（IPv4/IPv6/映射地址全判，:36-46——即使塞进 allowedHosts 也拒绝）；④ 每跳（含 3xx 手动跟随每一跳）先 DNS 解析并校验 IP（防 DNS 重绑定，:130-144），≤3 跳；⑤ 单文件 ≤500MB 流式超限即中止；落盘 `.part` → **ffprobe 探测通过才 rename**（杜绝半成品入库，:204-210）；落盘目录必须位于受控媒体根内（:76-84）；仅在显式调用时产生网络请求，零自动预取（:15）。
7. **renderManifest 路径校验**：realpath 规范化 + 受控根内 + `..`/symlink/junction 逃逸拒绝（5.4）。
8. **画布持久化净化**：schemaVersion 白名单 + 字段截断 + 边 id 合成（7.4）。
9. **URL 判据**：视图中的外链（kit projectUrl、参考图 URL）经 `safeHttpUrl`（`shared-utils`，协议前缀白名单）判据后才可点（`FilmEngineeringView.vue:41-44`；不合法降级为纯文本）。

---

## 十一、常量与阈值速查表

| 常量 | 值 | 位置 |
|---|---|---|
| `FILM_PROMPT_MAX_LEN` | 50000 字符（导入器/loader/IPC/前端四处同源，D4） | kit-loader.js:24 |
| `MAX_SCRIPT_LENGTH` | 10000 字 | script-adapt.js:13 |
| `MAX_CHARACTER_MAP_KEYS` | 10 | script-adapt.js:14 |
| `DEFAULT_LLM_BATCH_LIMIT` | 20 镜 | script-adapt.js:15 |
| `MAX_GENERATE_BATCH`（图片） | 20 | film-engineering-service.js:23 |
| `MAX_SHOTS_ARRAY`（复制/导出/选镜） | 50 | ipc-handlers/film-engineering.js:42 |
| `MAX_VIDEO_BATCH`（单批出片） | 10 | video-gen.js:39 |
| `PRODUCTION_BATCH_SIZE`（全量切批） | 10 | production-driver.js:29 |
| `PRODUCTION_BATCH_CONCURRENCY`（批内并发） | 2 | production-runner.js:14 |
| `MAX_PRODUCTION_SHOTS`（全量上限） | 1000 | ipc-handlers/film-engineering.js:46 |
| `FILM_ASPECTS` | 16x9 / 9x16 / source | video-gen.js:40 |
| `FILM_DURATIONS` | 5 / 8 / 10 秒（默认 5） | video-gen.js:41-42 |
| `FILM_FRAME_RATE` | 24fps | video-gen.js:43 |
| 帧数映射 | ≤5s→121 / ≤8s→201 / ≤10s→241 | video-gen.js:53-60 |
| `POLL_INTERVAL_MS`（provider 轮询） | 10s | video-gen.js:44 |
| `POLL_DEADLINE_MS` | 10min | video-gen.js:45 |
| 画幅映射 | 16x9→1280×720 / 9x16→720×1280 | video-gen.js:85-92；film-render.js:29 |
| `FULL_LOAD_LIMIT` / `MAX_PAGE_LIMIT` / `DEFAULT_PAGE_LIMIT` | 500 / 200 / 100 | shot-library.js:29-31 |
| `MAX_RECYCLE_BATCH` / `RECYCLE_CONCURRENCY` | 50 / 4 | ipc-handlers/film-engineering.js:44-45 |
| `MAX_DOWNLOAD_BYTES`（回收单文件） | 500MB | shot-downloader.js:31 |
| `MAX_REDIRECTS`（回收跳数） | 3 | shot-downloader.js:33 |
| `MAX_REF_BYTES`（参考图） | 10MB | reference-store.js:17 |
| `RENDER_MANIFEST_MAX` | 10000 条 | film-render.js:91 |
| `PRODUCTION_BATCH_SIZE` 估算口径 | 8MB/镜、300s/镜 | ipc-handlers/film-engineering.js:47-49 |
| `EVENT_MERGE_MS`（进度节流） | 500ms | production-driver.js:30 |
| 渲染归一参数 | `-r 24` + `libx264 veryfast crf 23` + `aac` | film-render.js:286-292 |

---

## 十二、受控媒体根目录布局与产物生命周期

根 = `os.tmpdir()/film-engineering`（video-gen.js:64-66 / film-render.js:81-83 / reference-store 同值；Windows 为 `%TEMP%`）。**会被系统清理**——重要产物及时「另存为」。

```
%TEMP%/film-engineering/
├─ <runId>/                        （≤10 镜单批 run 与重试落点；runId 由引擎生成）
│   ├─ shot_000.mp4 … shot_(N-1).mp4
│   ├─ norm_000.mp4 …              （仅规格不一致时产生）
│   ├─ concat-list.txt
│   └─ final.mp4                   ← 成片
├─ references/
│   └─ ref-<16hex>.<png|jpg|webp>  （画布参考图落盘）
└─ production/<taskId>/
    ├─ ledger.json                 （台账：.tmp+rename 崩溃安全写）
    ├─ prod-<taskId>-b<batchIndex>/
    │   └─ shot_000.mp4 …          （全量出片批产物；runId 确定性派生）
    └─ recycled/
        └─ shot_<orderIndex>.mp4   （原片回收落点，可直接进 renderManifest）
```

产物生命周期：批产物磁盘复核通过即"永久有效"（收口 manifest 引用其路径）；`final.mp4` 可反复另存；`.part` 临时文件在任何失败路径清理（shot-downloader.js:219-233 finally 兜底）。

设置页「影视工程缓存」清理项（`src/locales/zh.js:291,302`：*「视频合成与影视工程在系统临时目录产生的中间产物，可安全清理以释放磁盘空间」*）对应受控媒体根的定期清理。

---

## 十三、故障排查手册（按错误码/症状索引）

### 13.1 「影视工程资源不可用」（FILM_KIT_UNAVAILABLE）

含义：两级 kit 全部不可用（缺失/损坏/schema 非法）。排障：① 确认安装完整性（asar 内 `electron/film-kit/` 四个必填 JSON）；② 若导入过全量 kit，检查 `<userData>/film-kit/` 是否损坏（删除该目录即可回退 asar 精简包——missing 级不算错误）；③ 状态卡会显示具体聚合错误明细（哪一级、哪条校验）。

### 13.2 VIDEO_MODEL_NOT_CONFIGURED

未配置默认视频 Provider。两个出口：面板内「前往模型设置」按钮（`FilmEngineeringView.vue:348,441`）→ 配置视频 Provider（Seedance/Kling/Veo/CogVideo 等）→ 设为默认 → 重试。这条错误在阶段执行器（video-gen.js:269-276）、retry-shot（:286-291）、production-run-batch（:408-414）三处前置拦截，**都不会产生任何计费调用**。

### 13.3 「film_generate_videos 需要 context.selectedShots」

发起 run 时 initialContext 未带分镜（正常操作不会出现；若出现多为集成/自动化调用姿势错误——manifest 合成 run 走 `initialContext:{renderManifest}`，生成 run 走 `initialContext:{selectedShots}`，两者不可混）。

### 13.4 「缺失镜头产物，无法合成成片（缺失镜序号: …）」

film_render 磁盘复核发现缺 `shot_NNN.mp4`。处置：对缺失序号的镜执行单镜重试补齐（画布节点重试按钮 / 生成面板逐镜重试 / 全量面板「重试该镜」），重试成功覆盖磁盘后重新发起合成（全量路线回到 manifest-ready 点「合成成片」）。

### 13.5 「renderManifest 校验失败：…」

三类子因：orderIndex 不连续/重复；path 越出受控媒体根（链接/遍历逃逸）；文件不存在（按 orderIndex 列缺失清单）。多为产物被系统清理（%TEMP% 清理）所致——批产物丢失只能重跑对应批（同 taskId「恢复任务」会按磁盘复核自动重跑缺失批）。

### 13.6 回收全部失败：「allowedHosts 清单缺失，拒绝下载（fail-closed）」/「主机名不在 allowedHosts 精确清单内」

**随包精简 kit 的 manifest 不含 allowedHosts**（3.5 节实测），因此精简 kit 状态下回收通道必然整体拒绝——这不是 bug，是 fail-closed 设计。要使用回收：用导入器 `--full` 生成全量 kit 到 `<userData>/film-kit/`（其 manifest 携带 allowedHosts，`fetch-hell-grind-kit.py:386`），重启应用后状态卡 kitSource 应显示 `userData-full`。另外：无 `resultUrl` 的分镜单项报「该镜无 resultUrl，无法回收下载（需走批量出片重新生成）」，属单项隔离不中断。

### 13.7 「参考图 provider 不支持参考图输入，本镜已降级为纯文本生成」

providerId 不在参考输入映射表（minimax/agnes-video/agnes-multimodal）内（5.5）。seedance/kling/veo 等 adapter 无参考输入参数——参考图被忽略、纯文本出片，出片本身不受阻断；warning 明示。若确需图生视频，请切换到支持参考输入的 Provider。

### 13.8 「剧本无法分场（请用空行分隔场景）」

splitScript 按空行切段，整段无空行的剧本切不出场。处置：在场景之间插入空行；「第X场 / SCENE n / INT. / EXT.」独立成行会被识别为标题并入下一段。

### 13.9 「LLM 润色本次未生效，分镜按内置规则架构生成」

非错误——当前版本主进程注入 `llm: null`（2.3/4.4），勾选润色不改变产出。分镜仍按内置模板规则完整生成。

### 13.10 生成单镜一直超时

单镜轮询上限 10 分钟（`POLL_DEADLINE_MS`），超时报「视频生成超时或失败」。provider 侧拥堵时多重试；全量路线建议一次只确认一批，观察单批墙钟（预览估算是 5 分钟/镜上限口径）后再继续。

### 13.11 「taskId 必须为非空且路径安全的字符串」/「任务 ID 只允许字母、数字、._-」

taskId 同时是台账目录名（basename 校验）。输入合法 taskId（1-64 位字母数字 `._-`）。

### 13.12 「未找到该任务的出片台账」

resume 的 taskId 无 ledger（目录被清理或从未发起）。确认 taskId；或重新走 plan → begin（磁盘产物若还在，重跑会按磁盘复核跳过已齐部分——台账丢失不丢磁盘成果，:175-185 重建后双核复核）。

### 13.13 FFmpeg/ffprobe 不可用

「FFmpeg 不可用，无法合成成片」/「ffprobe 不可用，无法探测片段规格」。查找顺序（media-tool-paths.js）：打包产物 `resources/media-tools/` → `ffmpeg-ffprobe-static` 依赖 → 常见安装路径（Win：`C:\ffmpeg\bin`、Program Files）→ PATH → `FFMPEG_PATH`/`FFPROBE_PATH` 环境变量。任一环节命中即可。

### 13.14 画布：连线被拒绝 / 参考图上传失败

连线只允许 参考图→分镜（同节点、重复边、未知类型、不支持的方向分别有提示文案，i18n key 见 film-canvas-model.js:42-53）。上传失败先核对：仅 PNG/JPEG/WEBP、≤10MB；服务端还会再嗅探魔数（改扩展名的假图片会被拒）。

---

## 十四、测试与回归锁地图

| 测试文件 | 锁定内容 |
|---|---|
| `ipc-handlers/film-engineering.test.js` | 16 通道契约：sender 校验、入参钳制、fail-closed、recycled/production 三通道行为 |
| `ipc-handlers/film-engineering-retry.test.js` | retry-shot：runId 归属、shotIndex 边界、prompt 原文取自快照 |
| `ipc-handlers/film-engineering.e2e-int.test.js` | 端到端集成：status→分页→plan→逐批→manifest→真实 ffmpeg 合成 final.mp4 |
| `services/film-engineering/film-pipeline-contract.test.js` | 6 阶段注册齐全；仅 generate_videos 有 checkpoint |
| `services/film-engineering/video-gen.test.js` | 提交载荷合同（prompt 逐字直送、双写命名、画幅映射）；优化器调用即 `CONTRACT VIOLATION`；成本闸零调用；参考图注入 |
| `services/film-engineering/film-render.test.js` + `film-render.manifest-int.test.js` | 磁盘信物缺镜 fail-closed；manifest 校验矩阵；真实 ffmpeg 拼接 |
| `services/film-engineering/production-driver.test.js` + `.error-observability.test.js` | 切批/台账/续跑双核/收口判据/失败隔离/事件节流/错误可观测 |
| `services/film-engineering/shot-downloader.test.js` | SSRF 五重防线矩阵（协议/白名单/内网 IP/DNS 重绑定/跳数/超限/半成品清理） |
| `services/film-engineering/video-reference-inputs.test.js` | 映射表保守探测、越界拒绝、魔数嗅探、首帧语义 |
| `services/film-engineering/kit-loader.test.js` | 5 组 schema 校验矩阵 + 两级回退链 |
| `services/film-engineering/script-adapt.test.js` | 分场/模板组装/角色追加标注/LLM 降级 |
| `src/composables/*.test.js`（useFilmCanvas/useFilmVideoGen/useFilmProduction/useFilmEngineering/film-canvas-model） | 前端状态机、负载脱壳、画布模型、分页、档案快照 |
| E2E | `tests/e2e/film-engineering-real.js`（默认进 CI，不计费；含成本闸不变式断言：确认前逐镜成功数必须为 0）；`tests/e2e/film-video-provider-smoke.js`（opt-in 真实计费） |

---

## 十五、已知边界与限制清单

### 15.1 能力边界（设计使然）

- 成片是**顺序拼接**：无转场、调色、字幕、音轨处理（film-render.js:12 合同）
- 剧本套用的 LLM 润色：引擎链路未接（`llm: null`），UI 勾选仅对直接 IPC 调用方（且服务层注入 llm 的场景）有意义
- 参考图注入：仅 minimax / agnes-video / agnes-multimodal 三 provider；一镜多参考 v1 取首个（首帧语义）
- kit model 字段仅展示：实际出片统一走默认视频 Provider，不能按镜指定模型
- 画幅/时长是全局参数：一次 run 内所有镜共享同一 aspect/seconds（重试亦回落本次口径）

### 15.2 规格承诺 / 当前实现差异

| # | 项 | 规格承诺 | 当前实现（基线实测） |
|---|---|---|---|
| 1 | LLM 润色 | adaptScript 支持可选 LLM 润色（script-adapt.js 完整实现） | 服务层能力在，但容器注入 `llm: null`、阶段执行器固定 `llmEnabled:false` → UI 勾选不生效，画布有显式降级提示 |
| 2 | 回收下载 | 「下载 kit 分镜原作者成片」 | 依赖全量 kit 的 allowedHosts；随包精简 kit manifest 无该键 → 整体 fail-closed（13.6） |
| 3 | stageCount | 前端卡片 `stageCount: 4` | 引擎实际 6 阶段（前 4 可见 + 生成/合成由面板驱动） |
| 4 | estimatedCost | 创建页 `low` / 引擎 `high` | 两层各自定义；真实成本由逐镜/逐批确认闸决定 |
| 5 | 画布 STORAGE_KEY | 常量注释写作 `'film-engin…s:v1'`（省略号在源码里） | 真实键以此导出常量为准（读代码时勿按注释猜完整字符串） |

### 15.3 运维注意

- 受控媒体根在 `%TEMP%`，系统清理会丢批产物/成片——重要结果及时另存；丢产物按 13.4/13.5 恢复
- 台账在 `<userData>` 无关的临时根 `production/<taskId>/`——与应用 userData 分离，系统清理同样波及；台账丢了不丢磁盘成果（双核复核）
- 单镜生成耗时受 provider 波动大（估算口径 5min/镜是上限假设）；全量出片建议分多次会话逐批推进（断点续跑天然支持）

### 15.4 版本与基线

本手册基于 `main@8b3d3e91`（2026-10-09 取证）。后续基线推进后，行号引用请按「文件名 + 符号名」重新定位；本手册第十三~十五章的合同性内容（常量值、错误码、fail-closed 语义）均有对应测试锁定，漂移会先红测试再改文档。

---

## 十六、提示词方法论精读：七大块与十条铁律的工程原理

> 本章把 `prompt-doctrine.json` 的抽象条目展开为「为什么这样设计、在产品里对应哪个操作」。方法论原文随包交付于 `apps/desktop/electron/film-kit/prompt-doctrine.zh.md`，应用内「提示词方法论」标签页可直接阅读。

### 16.1 为什么需要块结构：模型没有记忆

AI 视频模型每次调用都是独立的：它不知道上一镜里你的主角穿什么、站在哪、刚才说了什么。传统做法是「写一段氛围描述」，结果是每个镜头都在重新掷骰子。《Hell Grind》的解法是把一个分镜提示词拆成七个各司其职的块，**每一块都在替代一种「本该由连续拍摄天然保证的一致性」**：

- 角色数量由 `SCENE CONTEXT` 的计数头锁定（`EXACT 3 CHARACTERS — NO DUPLICATES`）——治「多画/少画人」；
- 空间关系由 `GEO SPATIAL LAYOUT` 锁定——治「左右互换、越轴」。注意这块是**纯场景平面图**，刻意不含角色与动作，因为角色站位随镜头变化，而地标与轴线是全场恒定的；这就是「每场锁定逐镜粘贴不变」的原因：同一场景的所有分镜共享同一份 GEO 块，模型每次都读到同一张"地图"；
- 事件顺序由 `ACTION TIMING` 的逐秒时间线锁定（0.0-2.0s 分段、镜头运动写进动作、内心独白标 `INNER (unspoken)`、眨眼与微表情分阶段）——治「动作糊成一团」；
- 声音由 `AUDIO` 块独占——治「台词跑到画面文字里、音色漂移」。台词只许出现在这一块，音色是 pre-production 阶段就锁定的描述符（register/tempo/accent/manner），逐次原样粘贴；
- 表演由 `CHARACTER ACTING` 锁定（情绪状态·此刻所求·隐瞒之物·身体节奏·可见习惯·本镜变化）——治「表演平淡、情绪不连贯」；
- 画面风格由 `STYLE` 前缀逐字锁定（`Photoreal. NON-IP. 16:9. 12s. SFX only. NO CGI. Cinematic.`）——治「风格逐镜漂移」；
- 细节下限由 `POSITIVE CONSTRAINTS` 兜底（8K 细节、毛孔级皮肤、无抖动闪烁；计数物体用「是什么在画面中」的表述法；**点名失败镜头长什么样**）——治「细节崩坏」。

在产品里的对应关系：路线 A 的「提示词块」复制模式（shot-library.js `extractBlocks` 按五个标题切块）就是把真实分镜按这套结构切给你看；路线 B 的剧本套用（`buildTemplatePrompt`）把你剧本的剧情文本注入前三段，而 GEO/TIMING/AUDIO/ACTING/CONSTRAINTS 五个块从模板逐字复刻——**你只提供故事，工程结构由模板保证**。

### 16.2 十条铁律的实战含义

| 铁律 | 一句话原理 | 在产品里的落点 |
|---|---|---|
| 素材先行（assets-first） | 角色/场景/道具全部锁定并压力测试之前，不生成任何一个镜头——素材坏了是全场返工，镜头坏了只返工一镜 | 先在画布上传参考图并连线，再出片（8.3 第 3-4 步） |
| 每次全量描述（describe-everything） | 模型没有记忆，描述符逐字粘贴、永不缩写——「同上文」式的省略就是不一致的源头 | 剧本套用产出的角色行就是完整描述符；复制模式 `characters` 让你逐字带走 |
| 一次只改一处（one-change-at-a-time） | 整段重写会丢掉已生效的部分；每次迭代记日志，才能归因「是这次改动让它变好/变坏」 | 失败镜逐镜重试而非整批重跑；全量路线单镜重试通道 |
| 少给自由（less-freedom） | 角落而非房间、锚点而非空地、地图而非猜测、每镜一个动作——自由度越大，模型随机性越大 | GEO 块强制每场给平面图；ACTION TIMING 限制"每镜一个动作" |
| 简化镜头而非删词（simplify-shot） | 镜头出不来时拆成两镜、删一个动作、换角度，10-15 次迭代上限——卡壳的提示词堆字数只会更糟 | 单镜重试就是迭代；连续失败提示换参数（画幅/时长）或改剧本拆镜 |
| 每场第一秒固定广角（first-second-wide） | 第一秒无人声无动作，把站位与光线"拍"进模型——先给模型一张定场照再开始动 | 剧本套用的场景标题行保留 `INT./EXT.` 场景头（script-adapt.js:56-58） |
| 写肌肉不写形容词（physics-not-adjectives） | 「颤抖、下颌咬紧、颧骨绷紧、鼻息」是可渲染的物理指令，「愤怒地」是玄学；静止要写成「绷住的张力」而非「别动」 | 自写剧本时的文风建议；LLM 润色（若启用）也遵循此风 |
| 音色是锁定描述符（voice-is-descriptor） | register/tempo/accent/manner 在 pre-production 锁定，逐次粘贴——声音的一致性和脸一样需要"定妆" | AUDIO 块从模板复刻音色描述；角色映射只追加名字标注不改编描述 |
| 点修改用蒙版（mask-point-changes） | 衣服/伤疤/血迹改动后把结果蒙版合回原图，图片绝不整体二过模型——全图重绘会破坏已锁定的部分 | 对应外部工作流（图片迭代不在本流水线内）；`CHARACTER ACTING` 的「核心行为段永不改变」同理 |
| 台词只在 AUDIO 块（dialogue-only-in-audio） | 台词出现在别的块会被渲染成画面文字；无台词的角色要写明「完全沉默」 | 复制模式 `blocks` 让你检查台词是否只在 AUDIO 里 |

### 16.3 引用令牌（reference token）与资产索引

真实分镜的提示词里嵌着形如 `<<<uuid>>>` 的令牌——它指向 `reference-registry.json` 里的资产条目（332 条：character 247 / prop 64 / scene 21）。令牌的意义是「请把这个角色/道具生成为参考图里的样子」，所以**必须逐字符保留**——这是 glossary 里的显式条款，也是 `film_generate_videos` 原文直送合同存在的原因（video-gen.js:8）：提示词一旦经过改写优化，令牌就可能被拆散或丢失，角色一致性随之崩塌。

产品里的对应操作：分镜详情抽屉的「引用资产」区展示每个令牌解析出的条目（名称/kind/图墙），并可以单独复制令牌；`copy-text` 的 `full` 模式复制出的文本天然携带这些令牌，粘到支持该体系的工具里即可复用参考图绑定。

### 16.4 数据是怎么来的：语料到 kit 的对账链

`fetch-hell-grind-kit.py` 从公开 API（无需登录）一次性抓取的 155,123 个 job 语料中重建 kit。几个值得知道的对账口径：

- **视频分镜口径**：图片模型黑名单正则（`nano_banana|imagegen|soul_cinematic|…`，脚本 :30）把 3,313 个图片 job 排除出分镜统计——否则「每场景取最后一个 completed 视频 job」的采纳规则会被图片 job 污染（2026-09-23 的 1.3 对账修正）；
- **画幅归一**：源语料的 `aspectRatio` 有 `"auto"` 等非 `W:H` 形态，一律归一为 null——因为 `kit-loader` 的 schema 只接受 `"W:H"` 或 null，一个脏值会让整个全量 kit 被 fail-closed 拒绝（脚本 :40-48 注释）；
- **四外同源的上限**：`FILM_PROMPT_MAX_LEN=50000` 同时存在于 Python 导入器、kit-loader schema、IPC 导出/生成校验、前端截断四处（脚本 :52 的 D4 注释）——单一契约防止任何一层用不同上限放行脏数据；
- **原子落盘**：全量导入走 `.tmp` → rename，配合 `import-report.json` 对账（uniqueVideoPrompts / adoptedShots / 超限拒绝三项统计）。

---

## 十七、逐模块深读：从一行代码到一次操作

### 17.1 kit-loader：为什么 fail-closed 而不是降级

一个常见的设计疑问：kit 某个 JSON 损坏时，为什么不「跳过坏的那部分，继续用好的」？答案在数据语义上：这四份文件不是独立数据，而是**互相引用的整体**——shot 的 `sceneId` 必须能在 manifest 里找到（`validateShotSceneRefs`），refTokens 必须能解析到 reference-registry（否则详情页图墙大面积 unknown），doctrine 是复制模式 `blocks` 的切分依据。部分降级意味着分镜列表能看但详情页崩、复制出的提示词缺块——**带着暗伤运行比明确失败更危险**。所以 `loadFilmKit` 把五组校验的错误聚合成一条 `FILM_KIT_UNAVAILABLE` 消息（含每级每条校验的具体原因），UI 直接展示给用户（`FilmEngineeringView.vue:23` 的 `status.error`）。

两级回退链同理要读对：userData 全量 kit 损坏 → 回退 asar 精简包是**整级回退**（`loadFilmKitChain` 对每级调用完整的 `loadFilmKit`），不是文件级混合。日志 `[FILM_KIT_FALLBACK]` 保证回退可见。

### 17.2 shot-library：分页合同的设计权衡

`listShots` 的双语义（4.2 节）值得展开。全量语义保留的理由写在注释里：「精选模式回归锚」——早期随包 kit 每场景只有代表性 1-2 镜，全量返回既简单又够用；全量语料导入后单场景可达数百镜，无上限全量返回会撑爆 IPC 负载（每镜提示词可到 39KB，500 镜 ≈ 20MB 单条消息）。所以折中方案是：

- 全量语义**保留**但加 500 镜硬上限（超限抛错强制分页，错误消息里给出场景镜数，提示用 limit/offset）；
- 分页语义服务端钳制 limit ≤ 200——注意是**钳制不是拒绝**（`if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT`，shot-library.js:128），前端请求 500 也不会失败，只是拿到 200；
- 未知 sceneId 抛错而非空数组——「用空数组冒充不存在的场景」会让调用方误判「场景存在但没分镜」，这是 fail-closed 在查询层的体现。

前端消费侧（`useFilmEngineering`）配合滚动哨兵做无限滚动：`shots` 是跨页累计数组、`shotsTotal` 是总数、`shotsHasMore` 控制哨兵挂载——用户视角是「滚到底自动加载」，数据视角是多次 `list-shots(offset=n)`。

### 17.3 script-adapt：模板映射为什么是"循环"而不是"选择"

`templates[i % templates.length]`（:149）意味着第 i 场用第 (i mod 153) 个模板分镜。这个设计的前提是：**模板的价值在结构不在内容**——153 个真实分镜各有微调过的块结构（时长分布、角色数量、音效密度），循环映射让相邻场拿到不同模板，产出自然有多样性；而用户映射的角色行会覆盖到 `[CHARACTER: ROKO]` 这类槽位，角色一致性由映射而非模板保证。代价是模板的 `INT./EXT.` 场景头可能与剧情场景不符——`buildTemplatePrompt` 对此的处理是「模板首行是场景头就保留，否则用剧情首行」(:56-58)，即场景头优先级：剧情 > 模板。

角色映射的「追加括号标注」而非替换（:66）也是个刻意取舍：直接替换描述符会破坏「音色是锁定描述符」铁律（描述符是精确的英文物理描述，不是可翻译的名字）；括号标注让模型同时看到「槽位角色描述 + 你的角色名」，既锁一致性又标记你的角色。UI 的映射表预填 ROKO/JAXX/LULU/REIN 四槽（`FilmEngineeringView.vue:567-572`）就是引导用户把主角对号入座。

### 17.4 video-gen：三层失败合同与「单镜失败不抛出」

`generateShotVideo` 的失败处理是这条流水线最值得学的工程细节：

1. **双层 provider 失败**：`callAdapter` 外层 `code !== 0` 是桥接层失败（网络/协议）；内层 `data.code < 0` 是 adapter 包装的业务失败——两处都要判（video-gen.js:183-189），漏判内层会让「provider 返回明确失败」被当成成功继续轮询；
2. **轮询终态三态退出**：拿到 videoUrl 成功；状态进入 failed/error/cancelled 失败；10 分钟 deadline 失败——没有第四种「永远等下去」的路径；
3. **统一失败出口 `noteFail`**：先 `log.warn`（镜头序号 + shotId + 可辨识原因）再返回 `{success:false, error}`——**失败不抛出**，让批处理循环能继续跑完其他镜（部分失败 partialFailure 语义）；同时 warn 保证可观测（`film-gen-shot-error-observability` 变更的产物：杜绝静默失败）。

并发层 `mapWithModelBudget`（model-call-scheduler）在「requestedConcurrency（stage 可配，默认 2）」与「provider/governor 预算」之间取交集；调度器自身异常时降级串行（:341-352）——**合同不依赖并发度**（结果数组保序），所以降级不影响正确性，只影响墙钟。

### 17.5 film-render：「信磁盘不信内存态」的两处体现

第一处在输入：`computeMissingShotIndices`/`collectDiskShots` 完全无视生成阶段返回的 `videoResults` 内存态（形参保留 `_videoResults` 仅供阅读自明，film-render.js:180-189）。理由写在 D7 注释里：单镜重试直接覆盖磁盘文件，内存态不会随之更新——磁盘才是唯一事实。重试成功后无需刷新任何状态机，重新合成即可拿到补齐的片段。

第二处在回收条目：`downloaded` 片段经 ffprobe 验证后才 rename 入库（shot-downloader.js:204-210），所以 renderManifest 引用的每一个 path 都必然是「探测过的完整文件」——拼接近距离内存态最远。

拼接策略的分支也值得注意：`copy`（零重编码直拷）与 `normalize`（逐片段转码归一）的区别不只是速度——直拷分支**零质量损失**，归一分支有 libx264 crf 23 的一次代际损失。所以「规格一致」的判定要覆盖 codec/分辨率/帧率/时基/音频参数八个维度（`specKey`），宁可误入归一分支也不拼出花屏。

### 17.6 production-driver：台账、磁盘、事件三件套的职责切分

- **台账（ledger.json）**：状态载体。批次清单 + 每镜 status/error（截 500 字符），`.tmp`+rename 崩溃安全。它回答「计划是什么、进度记到哪」；
- **磁盘（shot_NNN.mp4）**：裁决者。`resolveResumePlan` 逐批 probe，磁盘齐跳过（零 provider 调用）、磁盘缺重跑——**台账标 done 但磁盘缺也会重跑**（防「上次崩溃在写盘前」的假 done），pending/failed 但磁盘齐也会跳过（防重复计费）。这叫双核裁决（D6）；
- **事件（production-update）**：只做展示。500ms 窗口合并、只带计数不带 shotIds 数组（IPC 负载守卫）、前端单调不回退——展示层绝不反向影响裁决层。

三件套职责不重叠，是这条流水线能在崩溃/关机/重启后正确续跑的根本。前端 `useFilmProduction.syncStatus()` 每批后调 `production-status` 重新双核同步，也是同一哲学：**前端视图是投影，后端台账+磁盘是事实**。

### 17.7 useFilmVideoGen 与 useFilmProduction：两条驱动线的分野

为什么 ≤10 镜和 >10 镜是两套 composable 而不是一套加参数？因为**成本确认的粒度不同**：

- ≤10 镜走 PipelineEngine run：一次 run = 一次成本闸 = 一张确认卡 = 一段成片。跟踪对象是 run 状态机（push + 3s 轮询），checkpoint 由引擎管理；
- >10 镜走 production 三通道：成本确认粒度是**批**（每批一张卡），跟踪对象是台账+磁盘双核（事件 + syncStatus），合成是独立的 manifest 直通 run（成本闸直通）。

强行统一会让 >10 镜场景要么一次确认全部（违背逐批计费），要么把批确认塞进引擎 checkpoint（引擎的 checkpoint 是阶段级的，不是批次级的）。分两套是粒度对齐的必然。

---

## 十八、完整操作案例：从零到成片的三次实战

### 18.1 案例一：单场景短片（3 镜，画布动线）

背景：一段 30 字的追逐戏，想出 16:9 竖版三镜。

1. 模型设置确认默认视频 Provider 已配置（否则第 6 步会拿到 `VIDEO_MODEL_NOT_CONFIGURED`）；
2. 画布 `/film-engineering` → 剧本框粘贴（空行分三段）→ 画幅选 16:9、时长 5s →「拆分镜」→ 画布出现三个 shot 节点（同场景聚在一行）；
3. 上传主角定妆图为「人物参考」→ 从参考节点拖线到三个 shot 节点（每条线让节点角标显示「已注入 1 张参考」）；
4. 框选三个节点 →「生成所选」→ 成本确认卡显示 3 镜/16x9/5s/Provider → 「确认成本并生成」；
5. 结果：2 镜成功、1 镜报「视频生成超时或失败」→ 点失败节点的「重试」→ 就地重跑该镜（原文直送，参考图仍注入）→ 成功；
6. 全绿后自动进入 render：三个片段规格一致（同一 provider 同参数）→ 直拷拼接 → 成片提示条「打开所在文件夹」。

要点回顾：参考图注入失败不会阻断（若用 seedance 会看到「不支持参考图输入，本镜已降级为纯文本生成」的 warning——此时改用 minimax/agnes 才有首帧参考效果）；确认前取消零计费。

### 18.2 案例二：复刻式批量出片（120 镜，全量动线）

背景：把导入全量 kit 的一个场景（120 镜）按原作画幅整批出片。

1. 前提：全量 kit 已导入 `<userData>/film-kit/`（状态卡 kitSource = `userData-full`，分镜计数 > 153）；
2. 经典视图分镜库勾选该场景全部 120 镜（全选本场 + 加载更多）→「全量出片」；
3. 计划预览：12 批 × 10 镜、磁盘预估 ~0.9GB、耗时预估 ~600 分钟、媒体目录显示、taskId 输 `hellgrind-ep1` →「发起出片」；
4. 逐批确认：批 1 确认 → 2 并发生成约 50 分钟 → 展开批次明细抽查；批 2 失败 3 镜 → 逐镜「重试该镜」→ 全绿；继续批 3-12（每批独立确认，可分几天推进）；
5. 中途断电：重启 → 输入同一 taskId「恢复任务」→ 批 1-5 磁盘齐自动跳过（done），批 6 从断点继续——已花的钱不重花；
6. 12 批全 done → manifest-ready（渲染清单 120 条）→「合成成片」→ 若片段规格一致走直拷 → final.mp4 三键保存；
7. 可选「回收全部原片」：下载原作对应成片对照精修（前提见 13.6）。

### 18.3 案例三：外部工具协作（导出动线)

背景：不打算在本应用出片，只想把方法论带走。

1. 分镜库勾选 10 个代表性分镜 → 复制模式选「提示词块」→「批量复制」→ 粘贴到文档研究结构；
2. 剧本套用标签贴入自己的剧本 + 角色映射 →「套用生成」→ 逐镜「复制该分镜」；
3. 「导出 Markdown」落盘 `film-engineering-prompts-2026-10-09.md`，带 `## [i] sceneId · model` 结构，直接进 Notion/飞书做逐镜管理；
4. 外部工具出片后，若想回本应用合成：把外部片段按 `shot_NNN.mp4` 命名放入对应 runDir（或走回收通道拿原片），单批路线靠磁盘信物复核、全量路线靠 renderManifest 的 `downloaded` 条目均可纳入合成。

---

## 十九、FAQ（高频疑问直答）

**Q1：出片用的是什么模型？kit 里的 model 字段有用吗？**
统一走你在模型设置里配置的**默认视频 Provider**（双默认语义，5.3 节）。kit 的 `model`（seedance_2_0 等）只是原作使用的模型记录，**展示不路由**（video-gen.js:9 合同）。想让某镜用特定模型，请临时切换默认 Provider。

**Q2：确认成本后又不想跑了，钱花了多少？**
「取消」走 `pipelineCancelRun`——成本闸前已发生的阶段零计费；确认后已提交到 provider 的镜会计费，未提交的不产生调用。逐批路线天然把敞口控制在单批 ≤10 镜。

**Q3：为什么一次只能 10 镜？**
`MAX_VIDEO_BATCH=10` 是单批上限（video-gen.js:39），既控制单次确认的成本敞口，也匹配 provider 的轮询/并发承受力（2 并发 × 10 镜 × ~10min/镜 ≈ 50 分钟一批）。超过 10 镜请走「全量出片」，本质还是逐批 10 镜。

**Q4：剧本套用的结果是"我的故事"还是"模板的故事"？**
剧情文本 100% 来自你的剧本（script-adapt.js:8 合同）；模板贡献的是工程结构（块结构/角色行槽位/GEO 等）。可以理解为：模板是「分镜的语法」，你的剧本是「分镜的内容」。

**Q5：参考图一定要上传吗？不上传会怎样？**
不强制。不上传 → `localReferences` 为空 → 纯文本出片，行为与画布功能上线前完全一致。上传且 provider 支持才注入首帧参考；provider 不支持时降级纯文本并明示 warning（13.7）。

**Q6：成片可以直接发平台吗？**
`final.mp4` 是标准 H.264 MP4（直拷或 libx264 均是），可直接用应用的发布功能或手动上传。但注意成片无音轨混合处理——各片段自带什么音轨就是什么（provider 生成 SFX-only 是原作方法论的常态）。

**Q7：重试会改变结果质量吗？**
重试口径与首次完全一致（同 prompt/同参数/同 provider），差异只来自模型本身的随机性——多次重试等于多次抽样，挑磁盘上留下的那次。

**Q8：回收下载的原片是干什么的？**
原作成片是「参考答案」：对照它精修你的提示词，或直接把它作为 renderManifest 的 `downloaded` 条目参与合成。它不参与你的生成（生成永远用你自己的 prompt）。

**Q9：清理系统临时目录会怎样？**
受控媒体根全在 `%TEMP%`（第十二章）：run 产物/批产物/台账/参考图都可能被清。台账丢了可重建（磁盘若还在则续跑照常）；磁盘丢了对应镜重跑。长期项目建议每批完成后「合成成片」并「另存为」到用户目录。

**Q10：为什么我看到两种视图？该用哪个？**
画布（`/film-engineering`）适合创作动线：剧本 → 拆镜 → 连参考 → 出片，一屏完成；经典视图（`/film-engineering/classic`）适合工程动线：分镜库精查、批量勾选、导出、全量出片、回收。两者共享同一套 IPC 与引擎，画布工具栏可互跳。

---

## 二十、给二次开发者的集成备注

### 20.1 从渲染进程外调用本流水线

一切入口都是 IPC。最小集成面（全部脱壳后传参）：

```js
// 查询能力
const st = await window.electronAPI.filmEngineering.status()
// 剧本 → 分镜
const ad = await window.electronAPI.filmEngineering.adaptScript({
  script: '第一场\n他推开门。\n\n第二场\n走廊尽头，灯灭了。', characterMap: { ROKO: '阿强' }, llmEnabled: false })
// 出片（≤10 镜）：走流水线编排通道，initialContext 带分镜
const run = await window.electronAPI.pipelineStartOrchestrated('film-engineering', {
  autoAdvance: true, initialContext: { selectedShots: ad.data.adaptedShots.slice(0, 3) }, aspect: '16x9', seconds: 5 })
// 订阅 + 轮询（合同同 useFilmVideoGen）
const off = window.electronAPI.onPipelineUpdate(snap => { /* paused+checkpoint.generate_videos = 确认卡 */ })
const ctx = await window.electronAPI.pipelineGetRunContext(run.data.runId)
// 确认过闸
await window.electronAPI.pipelineConfirmStageGate(run.data.runId,
  { cost_confirmation: { confirmed: true, confirmedAt: new Date().toISOString() } })
// 单镜重试
await window.electronAPI.filmEngineering.retryShot({ runId: run.data.runId, shotIndex: 1, aspect: '16x9', seconds: 5 })
```

全量出片则用 `filmEngineering.productionPlan / productionRunBatch / productionStatus` 三通道（批次粒度确认，见 6.3），回收用 `downloadRecycled`。

### 20.2 阶段执行器的测试 seam

三个核心执行器都有注入点（生产 StageExecutor 不传）：`generateShotVideo` 的 `sleep`/`download`（video-gen.js:151-153）、film_render 的 `_testProbe`/`_testRunTool`（film-render.js:226-227）、production-driver 的 `runBatch`/`probe`/`now`/`mediaRoot`（production-driver.js:147-161）。新增行为时**沿用 seam 而不是 mock 模块**——契约测试（video-gen.test.js 的 `CONTRACT VIOLATION` 锁）依赖真实依赖路径。

### 20.3 扩展参考输入 provider 的纪律

给新 provider 开参考图输入：**只改 `VIDEO_REFERENCE_PARAM_BY_PROVIDER` 映射表**（video-reference-inputs.js:30-34），且必须先核实该 adapter 的真实参数形状（注释明确「未列入一律保守视为不支持；列入即承诺行为」）。绝不通过扩 `BaseAdapter.KNOWN_METHODS` 或在调用点加特判绕过映射表——映射表是能力声明、降级语义与成本卡统计（`providerSupportsReference`）的唯一依据。

### 20.4 新增 IPC 通道的检查单

1. `withSenderCheck` 必套（sender canonical 合同）；
2. 入参运行时校验（形状 + 长度 + 路径安全），校验失败带 `VALIDATION_ERROR`；
3. kit 依赖的通道包 `withKit`（`FILM_KIT_UNAVAILABLE` 语义透传）；
4. 大数组参数设上限（对照 `MAX_*` 常量表）；
5. preload 的 `film-engineering.js` + `PUBLIC_METHODS`（公开性声明）+ `preload.test.js` 的 17 方法键数断言三处同步；
6. `ipc-handlers/film-engineering.test.js` 补契约用例（正常通道 + 非法入参 + fail-closed 三组）。

### 20.5 修改核心链路的回归清单

- 改 `video-gen.js` / `film-render.js` / `production-driver.js` 任一 → 同跑 `video-gen.test.js` + `film-render.test.js` + `film-render.manifest-int.test.js` + `production-driver.test.js` + `film-video-checkpoint-integration.test.js` + `film-manifest-compose-run.test.js` + `film-pipeline-chaining-integration.test.js` 全量；
- 改 IPC → `film-engineering.test.js` + `film-engineering-retry.test.js`；
- 改 kit schema → `kit-loader.test.js` + 重建脚本对账（`--dry-run`）；
- 改画布模型 → `film-canvas-model.test.js` + `useFilmCanvas.test.js`；
- E2E：`pnpm test:e2e:film-engineering`（默认进 CI、不计费）。

---

## 二十一、六条操作路线的决策树与状态速查

### 21.1 我该走哪条路线（决策树）

```
你要做什么？
├─ 只想研究/借鉴提示词写法
│   ├─ 逐镜翻看 → 路线 A（分镜库 + 详情抽屉 + 方法论标签页）
│   └─ 批量带走 → 路线 A 的导出（JSON/Markdown ≤50 镜）
├─ 有自己的剧本，想拆成专业分镜
│   ├─ 只要提示词文本 → 路线 B（剧本套用标签页，零成本）
│   └─ 要直接出片 → 路线 B 产出 → 复制进画布（路线 C）或勾选出图/出片
├─ 有分镜，要出视频
│   ├─ ≤10 镜、想逐镜盯着 → 路线 C（画布）或路线 D（经典视图面板）
│   ├─ >10 镜 → 路线 E（全量分批：逐批确认 + 断点续跑）
│   └─ 不想花钱、原作有现成片 → 路线 F（回收下载，需全量 kit，见 13.6）
└─ 外部工具出的片想拼成片 → 案例 18.3 的磁盘信物/renderManifest 两条回填路径
```

### 21.2 两条出片路线的状态与界面速查

**分镜视频生成面板（≤10 镜，useFilmVideoGen）**：

| phase | 界面 | 可执行操作 | 去向 |
|---|---|---|---|
| `idle` | 发起表单（数量/画幅/时长） | 发起生成 | `generating` |
| `awaiting-confirm` | 成本确认卡（警告条 + 逐镜列表） | 确认生成 / 取消 | `generating` / `cancelled` |
| `generating` | 进度条 + 逐镜状态 | 失败镜「重试」 | `done` / `failed` / `cancelled` |
| `done` | 成片路径 | 打开文件夹 / 另存为 / 再来一批 | `idle` |
| `cancelled` | 已取消提示 | 再来一批 | `idle` |
| `failed` | 错误详情 | `VIDEO_MODEL_NOT_CONFIGURED` → 前往模型设置；否则再来一批 | `idle` |

**全量分批出片面板（>10 镜，useFilmProduction）**：

| phase | 界面 | 可执行操作 |
|---|---|---|
| `idle` | 计划加载中 / 错误 | 自动 plan |
| `plan-ready` | 批次计划预览（批数/磁盘/耗时/媒体目录/taskId 输入） | 发起出片 / 恢复任务 |
| `batching` | 总进度 + 批卡列表（剩余批次/累计已确认/逐镜明细展开） | 确认执行本批 / 重试该镜 / 回收全部原片 / 批次明细 |
| `manifest-ready` | 收口成功（渲染清单 N 条） | 合成成片 / 回收全部原片 / 再来一批 |
| `composing` | 合成中（进度条） | 等待 |
| `done` | 成片路径 | 打开文件夹 / 另存为 / 再来一批 |
| `failed` | 错误详情 | 同 ≤10 镜面板 |

### 21.3 关键错误在哪个面板出现

| 错误码/消息 | 出现位置 | 一键出路 |
|---|---|---|
| `VIDEO_MODEL_NOT_CONFIGURED` | 生成/出片/重试三面板 failed 态 | 「前往模型设置」按钮 |
| `tooManyShots`（前端） | 发起表单 | 减选到 ≤10 |
| 「该镜无 resultUrl…」 | 回收单项结果 | 该镜走批量出片重新生成 |
| 「allowedHosts 清单缺失」 | 回收整体拒绝 | 导入全量 kit（13.6） |
| 「缺失镜头产物…」 | 合成前磁盘复核 | 重试缺失镜 |
| 「renderManifest 校验失败」 | 收口清单校验 | 按 13.5 恢复产物 |

---

## 二十二、数据一致性设计原则总结（架构视角）

影视工程是本仓里「fail-closed + 磁盘为真 + 粒度对齐」三个工程原则最完整的示范。收尾把这三条原则提炼成可迁移的设计经验：

**原则一：fail-closed 优先于静默降级**。kit 校验（3.4）、回收白名单（13.6）、renderManifest 校验（5.4）、原图路径防御（5.5）全部选择「明确拒绝并给出聚合原因」而非「跳过坏的部分继续跑」。适用判据：当数据的各部分**互相引用**（部分失效 = 其余部分的语义也不可信）时，fail-closed 是唯一诚实的选择。反面参照：参考图注入失败走的是降级而非拒绝——因为参考图是**增强项**，纯文本出片仍是完整可用的行为，此时降级 + warning 明示才是对的。

**原则二：磁盘是唯一事实，内存态只是投影**。单镜重试覆盖磁盘后内存态不更新（17.5）、台账 done 但磁盘缺仍重跑（9.2）、批产物复核不信 runBatch 自报（9.2）、回收条目 ffprobe 验证后才入库（10 防线 6）——四处同构。适用判据：**状态跨越崩溃边界**（进程重启后仍需正确）的数据，必须以文件系统为事实源，内存/台账只是缓存与索引。

**原则三：确认粒度与敞口对齐**。≤10 镜一次确认、>10 镜逐批确认、收口合成直通零确认——三种粒度分别对应用户的实际成本敞口（一次 run ≤10 镜计费 / 一批 ≤10 镜计费 / 零计费直通）。适用判据：**凡是花钱的操作，确认粒度必须等于敞口粒度**——一次确认覆盖无限计费的设计（如「同意后连续跑 100 镜」）在这条流水线里被结构性排除。

三条原则都有对应的测试锁（14 章地图），后来者改动时先读懂锁再动手——这也是本手册反复强调「以测试为合同」的原因。

---

## 二十三、附录：名词对照与源码符号索引

| 用户界面用语 | 源码符号 | 所在文件 |
|---|---|---|
| 影视工程资源不可用 | `FILM_KIT_UNAVAILABLE` | kit-loader.js:316 |
| 提示词块 / 角色行 / GEO 布局 | `COPY_MODES` / `extractBlocks` / `extractCharacterLines` / `extractGeoBlock` | shot-library.js |
| 套用生成 / 拆分镜 | `ScriptAdapter.adaptScript` | script-adapt.js |
| 生成图片 | `FilmEngineeringService.generateSelected` | film-engineering-service.js |
| 生成视频（≤10 镜） | `useFilmVideoGen.start` → `film_generate_videos` | useFilmVideoGen.js / video-gen.js |
| 成本确认 | `costCheck` / `cost_confirmation` checkpoint | video-gen.js:280-307 |
| 重试（该镜） | `film-engineering:retry-shot` | ipc-handlers/film-engineering.js:256 |
| 全量出片 / 批次计划 | `production-plan` / `planBatches` | production-driver.js:34 |
| 确认执行本批 | `production-run-batch` / `runOnlyBatch` | production-driver.js:206 |
| 恢复任务 | `production-status` / `resolveResumePlan` | production-driver.js:91 |
| 渲染清单 | `renderManifest` | film-render.js:109 |
| 合成成片 | `film_render` / `composeFinal` | film-render.js:217 / useFilmProduction.js:319 |
| 回收全部原片 | `download-recycled` / `downloadShot` | shot-downloader.js:100 |
| 人物/场景参考 | `upload-reference` / `saveReference` | reference-store.js:73 |
| 连线即注入 | `buildLocalReferences` / `resolveShotReferenceInput` | film-canvas-model.js:136 / video-reference-inputs.js:70 |
| 受控媒体根 | `getFilmMediaRoot` | film-render.js:81 |
| 引用资产 | `resolvedRefs` / `resolveRef` | shot-library.js:138-154 |
| 提示词方法论 | `doctrine` / `prompt-doctrine.json` | kit 三章 |
| 配置档案 | `ConfigProfileManager` snapshot（kind: film-engineering） | useFilmEngineering.js:292-322 |

---

*手册完。总字数约 2.1 万（中文约 1.8 万字 + 代码/路径/表格），取证基线 `main@8b3d3e91`。发现文档与实现不符时，以测试锁定的合同为准并回改本文档。*
