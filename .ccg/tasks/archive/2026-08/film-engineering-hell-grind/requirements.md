# 影视工程（film-engineering）流水线 — 深度实现方案

> 任务：复刻开源 AI 电影《Hell Grind》的完整影视工程（真实素材/提示词/项目文件）到 Multi-Publish 新流水线，
> 支持用户浏览分镜、一键复制、选分镜生成、输入剧本套用工程（剧情不同、方法复刻）。
> 日期：2026-08-14　分支：codex/film-engineering-hell-grind

---

## 1. 背景与目标

### 1.1 上游资源（已核实，2026-08-14 实测）

| 资源 | 地址 | 状态 |
|---|---|---|
| 知乎文章（需求来源） | https://zhuanlan.zhihu.com/p/2070185410609911442 | 需验证码无法抓取；文章指向以下两处开源资源 |
| 官方提示词技能仓库 | https://github.com/OSideMedia/higgsfield-ai-prompt-skill （MIT，332 星） | 已完整克隆到 C:	mp\hell-grind-20260814（研究用，非交付物） |
| 电影项目页（Higgsfield 平台） | https://higgsfield.ai/@higgsfield.studio/projects/hell-grind | 可公开访问；片名 Hell Grind: a 90-minute AI film fully open-sourced、时长 95:06、logline、文件夹树 |
| 项目公开 API | https://fnf-api-gw.higgsfield.ai/fnf/folders/{id}/... | 公开可读无需登录；返回全部素材元数据（含完整真实提示词、参考图、模型类型、结果 URL） |
| 全量语料 | 162 个文件夹（COLD OPEN + Scene 13→73.10B），115,451 个素材项 | 全量元数据下载至 D:\Data\projects\mp-research\hell-grind-full（不入库） |

### 1.2 电影事实（已核实）

- 片名：Hell Grind；时长 95:06；4 主角：ROKO / JAXX / LULU / REIN（街童获超能力对抗远古邪恶）。
- 分镜组织：文件夹即场景/镜头（1. COLD OPEN、Scene 25 Roko vs Robots、Scene 72: Roko vs Dagon、Scene 73.5E 等 162 个）。
- 素材类型：视频 job（seedance_2_0 等）、图片 job（nano_banana_2 / soul_cinematic / image_auto 等）、角色定妆照、场景/道具参考图。
- 提示词语法（真实语料验证）：引用令牌、角色锁定描述符、GEO SPATIAL LAYOUT 块、ACTION TIMING 块、AUDIO 块、CHARACTER ACTING 块、POSITIVE CONSTRAINTS 块。

### 1.3 目标（需求拆解）

1. 源码下载：技能仓库完整克隆；项目全量元数据下载。
2. 尽量完整复刻：分镜结构 + 真实提示词 + 参考素材 + 提示词架构方法论，还原到新流水线。
3. 一键复制：每个分镜的提示词/描述符/参考信息一键复制。
4. 选分镜生成：勾选若干分镜 → 复用应用已有资源生成能力出图/出视频（V1 以图片生成为准，AI 视频依赖已配置 provider）。
5. 剧本套用：输入剧本 → 按 Hell Grind 工程结构套用生成新提示词：剧情不同、方法复刻。

### 1.4 明确边界

- 不下载/不入库 115,451 个素材的媒体文件（数十 GB）；只入库精选参考图 + 精选提示词元数据；全量版本地归档可复现。
- 不做 95 分钟整片自动生成（用户已确认不现实）。
- V2 候选：套用提示词直接驱动 AI 视频 provider 批量生成；自定义角色参考图上传；语料在线增量拉取。

---

## 2. 复刻范围与数据资产设计

### 2.1 入库数据（committed，目标 <=5MB）

```
apps/desktop/electron/film-kit/
├── film-manifest.json      # 电影元数据 + 162 文件夹树（sceneId/名称/计数/层级/来源URL）
├── shot-library.json       # 分镜库：每文件夹代表性真实提示词 + 模型 + 参考 token + 结果URL
├── reference-registry.json # token→参考素材索引（角色/场景/道具 + 图URL + 描述）
├── prompt-doctrine.json    # Hell Grind 提示词架构（块模板 + 五条铁律 + 词汇表）中英双语
├── prompt-doctrine.zh.md   # 人类可读的工程方法论（中文）
├── images/                 # 精选参考图（min 版：4 角色 + 8-12 场景/道具 + 分镜封面若干）
└── SCHEMA.md               # kit 数据 schema 与校验规则
```

### 2.2 不入库但可复现的资产（本地归档）

```
D:\Data\projects\mp-research\hell-grind-full├── folder-tree.json    # 全量 162 文件夹树（含 preview_url）
├── items/*.jsonl       # 每文件夹全量素材元数据（id/prompt/params/结果URL/模型/时间）
└── download.py         # 抓取脚本（公开 API，可复现）
```

配套提交 scripts/film-engineering/fetch-hell-grind-kit.py（一键重新拉取/重建 kit）。

### 2.3 代表性分镜选取规则（shot-library.json 生成逻辑）

对每个文件夹：
1. 过滤 status == completed 且 params.prompt 非空的 job；
2. 取 created_at 最大（最终稿）的视频 job（job_set_type 含 seedance/video）优先；无视频取图片 job；
3. 记录：shotId（= job id）、sceneId（文件夹名规范化）、prompt（原文含 token）、model（job_set_type）、aspect（width x height）、resultUrl（仅记录不下载媒体）、refTokens（从 prompt 提取的 uuid token）、inputImages（params.input_images URL 列表）；
4. 全库扫描所有 prompt 的 token → reference-registry；token 解析优先级：job id 精确匹配（Assets 文件夹）> input_images id 匹配。

---

## 3. 架构设计

### 3.1 模块归属（遵循现有模式）

```
apps/desktop/electron/
├── film-kit/                            # 数据资产（见 2.1 节）
├── services/film-engineering/
│   ├── index.js                         # 服务入口：加载 kit + 暴露能力
│   ├── film-kit-loader.js               # kit 加载与 fail-closed 校验（版本/必填字段/uuid/URL）
│   ├── shot-library.js                  # listScenes/listShots/getShot/buildCopyText
│   ├── script-adapt.js                  # 剧本套用引擎（分场→模板映射→提示词组装）
│   └── film-engineering-stages.js       # registerFilmEngineeringStages(pipelineEngine)
├── ipc-handlers/film-engineering.js     # IPC 注册（withSenderCheck）
└── core/container.setup.js              # 注册 stages + IPC（1 处改动）
```

### 3.2 服务能力（主进程 API）

| 方法 | 说明 | 校验 |
|---|---|---|
| listScenes() | 返回 162 文件夹树（含素材数、精选分镜数） | kit 已校验 |
| listShots(sceneId) | 返回该场景分镜摘要列表 | sceneId 必须存在于树 |
| getShot(shotId) | 返回分镜完整数据（prompt 全文/参考图/模型/refTokens 解析结果） | shotId 存在 |
| buildCopyText(shotId, mode) | 组装一键复制文本：full 整段提示词 / blocks 分块+说明 / references 角色描述符+引用语法 | mode 枚举 |
| adaptScript({script, characterMap?, shots?}) | 剧本套用：分场→套模板→输出 adaptedShots | script 非空且不超上限、characterMap 结构校验 |
| exportProject(adaptedShots) | 导出 JSON/Markdown（保存对话框由 renderer 触发） | 数组结构与 prompt 非空 |
| generateSelectedShots({shots, imageProvider...}) | 走 assetGenerator 对选中分镜出图（复用 story2video 资产生成；provider 未配置→明确报错） | provider 配置存在 |

### 3.3 剧本套用引擎（script-adapt.js）核心逻辑

输入：{ script, characterMap?, shotTypeHint? }

1. 分场：复用 packages/story2video-engine/src/text-segmentation.ts 的分句/分场规则（纯 JS 依赖，无新增运行时依赖）；或简单段落+句号切分，输出 scenes[]（每场：序号、原文、字数）。
2. 角色映射：默认从 kit 提取 4 主角描述符作为角色槽位（ROKO/JAXX/LULU/REIN 的 descriptor/voice/acting 三段式）；characterMap 允许用户把剧本角色名映射到槽位；未映射角色自动按出现顺序绑定。
3. 分镜模板映射：从真实语料归纳的 shot 类型模板库：
   - establishing（场景建立 wide：1s 无对白开场规则、GEO SPATIAL LAYOUT）
   - dialogue（对话：ACTION TIMING + AUDIO 对白块 + at-rest mouth 规则 + 罕见人名注音规则）
   - action（动作：动作开篇规则、states-not-transitions、scale anchor）
   - transition（空间转场：门框/光线反差规则）
   - insert（特写/道具：hands busy 规则、micro-life 规则）
   每场剧本文本按语义关键词（对话引号/动作动词/场景名词）自动选模板，生成该场 1-3 个分镜。
4. 提示词组装：按 Hell Grind 架构生成块序列：
   角色引用块（锁定描述符）→ GEO SPATIAL LAYOUT（模板化锁场景地理）→ ACTION TIMING（0.0-4.0s 时间轴，剧情写成肌肉/行为语言）→ AUDIO（对白逐字+音色锁定+混音说明）→ CHARACTER ACTING（行为段落）→ POSITIVE CONSTRAINTS（必要时）
5. LLM 增强（可选）：若 PromptBridge 可用，对最终 prompt 调 /v1/optimize（domain=video）润色；不可用或超时 → 返回纯模板结果并标记 llmEnhanced: false（fail-open 降级，不阻塞主流程）。
6. 输出：adaptedShots[]，每个与 kit shot 同构（sceneId/shotId=adapt-N/prompt/blocks[]/refTokens/characterMap 应用记录），可直接进复制/导出/生成。

### 3.4 流水线注册（film-engineering pipeline）

PIPELINES 新增（pipeline-engine.js 注册 + registerFilmEngineeringStages 扩展 StageExecutor）：

```js
{
  name: 'film-engineering',
  description: '影视工程 - 复刻《Hell Grind》电影工程：分镜浏览/一键复制/剧本套用',
  category: 'custom',
  stages: ['film_load_template', 'film_adapt_script', 'film_select_shots', 'film_export_prompts'],
  stageDefs: [
    // film_load_template  → 加载 kit，输出 context.film_kit 摘要
    // film_adapt_script   → 剧本套用（checkpointRequired: true，产出 adaptedShots）
    // film_select_shots   → 用户勾选分镜（checkpoint: select_shots，复用场景选择交互模式）
    // film_export_prompts → 导出复制文本包（结果页展示 + 保存 JSON）
  ]
}
```

- 无外部 provider 依赖，任何阶段不隐式发网络请求；LLM 增强仅在显式开启且 PromptBridge 就绪时发生。
- 前端 PipelineSelector 自动出现卡片（labels 走 pipeline-labels.js + locales zh/en 成对）。

### 3.5 IPC 通道

| 通道 | 入参 | 返回 |
|---|---|---|
| film-engineering:list-scenes | — | {code, data:{scenes, filmMeta}} |
| film-engineering:list-shots | {sceneId} | {code, data:{shots}} |
| film-engineering:get-shot | {shotId} | {code, data:{shot}} |
| film-engineering:adapt-script | {script, characterMap?} | {code, data:{adaptedShots, warnings}} |
| film-engineering:generate-selected | {shots:[{prompt,...}], options} | {code, data:{results}}（复用 assetGenerator） |
| film-engineering:export | {adaptedShots, format} | {code, data:{content}}（复制由 renderer clipboard 完成） |

所有 handler：withSenderCheck、参数纯 JSON、fail-closed 返回 {code, message}。

### 3.6 前端（新路由 /film-engineering + 导航入口）

组件：
```
apps/desktop/src/views/film-engineering/
├── FilmEngineeringView.vue   # 主视图（三栏：分镜树 / 详情 / 操作）
├── FilmShotList.vue          # 场景树 + 分镜列表（搜索/过滤/勾选）
├── FilmShotDetail.vue        # 分镜详情（提示词全文/参考图/模型/复制按钮组）
├── FilmScriptAdapt.vue       # 剧本套用面板（输入/角色映射/结果列表）
└── film-engineering.js       # composable：状态 + IPC 调用 + 复制逻辑
```

交互逻辑（详细）：
1. 分镜浏览：进入页面默认加载 kit 场景树（loading 骨架 → 成功树 / 失败空态+重试）。树节点显示 文件夹名 + 素材数；搜索框实时过滤（名称/关键字）。
2. 分镜详情：点击分镜 → 中间栏显示：提示词全文（等宽字体、可折叠）、参考图缩略（点击看大图）、模型标签、来源文件夹、ref 引用解析（悬停显示引用对象）。
3. 一键复制：按钮组：复制完整提示词 / 复制分块说明 / 复制角色描述符 / 复制 GEO 块。点击 → navigator.clipboard.writeText → toast 已复制到剪贴板（含复制源提示）。失败（权限/剪贴板不可用）→ 降级 textarea 手动选择 + 提示。
4. 分镜选择：每分镜卡片勾选框；顶部汇总条 已选 N 个分镜；操作：复制全部提示词（合并粘贴）、生成图片（走 generate-selected；provider 未配置 → 引导到设置页提示文案）、导出 JSON/Markdown。
5. 剧本套用：底部面板：剧本 textarea（字符计数 ≤ MAX，默认 10000）+ 角色映射编辑（默认 4 槽位，可改名/换描述）+ 开始套用按钮。运行中：进度提示 正在将剧本套用到 Hell Grind 工程…；完成：分镜结果列表（每项含 prompt 预览 + 复制 + 加入选择）；空剧本/超长 → 内联错误提示。
6. 显示项/提示文字：全部文案进 locales zh/en 成对（i18n-content-sync 门禁）；产品名词（Hell Grind、影视工程、分镜、剧本套用）进 01-docs/i18n-glossary.md。

### 3.7 数据校验合同（kit 与 IPC）

- film-manifest.json：schemaVersion=1、filmMeta{title,durationSec,logline,characters[4]}、scenes[] 每项 {id,name,count,parentId,level}；校验：id 唯一、name 非空、count>=0、树无环。
- shot-library.json：{shotId,sceneId,prompt,model,refTokens[],resultUrl?,width?,height?}；校验：prompt 非空字符串且 <=20000 字符；shotId 唯一；refTokens 必须为 uuid 格式。
- reference-registry.json：{token:{kind,name?,folder?,imageUrls[],descriptor?}}；校验：token 为合法 uuid；imageUrls 仅 https。
- IPC 入参：script 非空字符串 <=10000；characterMap 对象 <=10 键、值非空字符串；shots 数组 <=50 项且每项 prompt 非空 <=20000。
- 加载失败策略：kit 任一文件缺失/JSON 损坏/schema 非法 → 服务启动报错并让相关 IPC 返回 FILM_KIT_UNAVAILABLE，前端显示空态，不允许静默降级为部分数据（fail-closed）。

---

## 4. 阶段划分

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 数据 | 全量语料下载完成 → 生成 4 个 kit JSON + 精选图下载 | film-kit/ |
| P1 引擎 | kit-loader / shot-library / script-adapt + 单测 | services + tests |
| P2 流水线 | PIPELINES 注册 + stages + container.setup + IPC | 可跑 pipeline |
| P3 前端 | FilmEngineeringView 三栏 UI + 复制/选择/套用交互 + locales | 页面可用 |
| P4 文档 | OpenSpec proposal/design/specs/tasks + PRD 3.1.23 + ARCH 文档 + learnings | 文档 |
| P5 交付 | 测试全绿 → 双模型审查 → commit/push/PR/CI → merge → 三同步归档 → 记忆更新 | 交付闭环 |

## 5. 测试计划

- film-kit-loader.test.js：正常加载 / 缺文件 / 坏 JSON / schema 非法 / token 格式错（fail-closed）
- shot-library.test.js：listScenes/listShots/getShot / 非法 id / buildCopyText 三种模式
- script-adapt.test.js：分场正确性 / 模板映射（4 类 shot）/ 角色映射绑定 / 超长剧本拒绝 / LLM 不可用降级标记
- film-engineering-stages.test.js：4 阶段执行链 / checkpoint / 上下文传递
- film-engineering-ipc.test.js：参数校验 / sender check / FILM_KIT_UNAVAILABLE
- film-engineering-adapt-contract.test.js：adaptedShots 与 kit shot 同构（可被 generate-selected 消费）
- 前端：film-engineering composable 测试 + 组件契约测试
- 回归：pipeline-engine 既有测试不破坏；CI Gate 7（locale 成对）通过

## 6. 文档计划

- 01-docs/PRD-video-creation.md：新增 3.1.23 影视工程（film-engineering）流水线（功能逻辑、数据校验、交互逻辑、显示项、提示文字全量详写）
- 01-docs/ARCH-FILM-ENGINEERING-2026-08-14.md：架构设计（本方案精化版）
- 01-docs/learnings.md：复盘（语料下载 API、kit 设计取舍、fail-closed 决策）
- apps/desktop/src/locales/{zh,en}.js：成对新增
- openspec/specs/film-engineering/spec.md：规格真相源

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 全量语料下载慢/API 限流 | 后台重试+退避；kit 只依赖精选子集；脚本可断点续跑 |
| 平台素材 URL 失效（CDN 过期） | kit 记录 URL + 本地已下载图片双轨；失效显示占位与来源链接 |
| 提示词 token 无法解析 | reference-registry 记 unknown；复制文本保留原文 token 不变 |
| 剧本套用质量（模板化太机械） | 模板从真实语料归纳 + 可选 LLM 润色 + 用户可编辑结果 |
| 版权/分发边界 | 只入库公开 API 可见的元数据与精选小图；电影视频本体不下载不入库；文档标注来源与 MIT/社区许可 |
