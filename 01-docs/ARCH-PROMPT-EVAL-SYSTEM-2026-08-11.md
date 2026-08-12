# ARCH — 提示词优化效果评估系统（PromptEval）技术架构

> 版本：v1（2026-08-11）｜分支：`codex/prompt-image-eval-system`｜配套 PRD：`01-docs/PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md`

---

## 1. 概述

PromptEval 是一套独立的「提示词优化效果评估」能力，运行在 Electron 主进程（Node），通过注入的评估器（默认为视觉多模态 LLM）对生成图片打分与归因分析，产出评估记录、人读报告与提示词优化点清单，为 prompt-engine 的持续迭代提供量化反馈。

设计原则：

- **独立模块**：不侵入 Story2Video 流水线主路径（`story2video-stages.js` 等其他任务脏文件不触碰）；输入 = 生成图片 + 该图对应的原文/上下文/优化后提示词。
- **fail closed**：输入校验、评估器输出校验、持久化任一步失败都显式报错，绝不静默降级。
- **可注入评估器**：核心引擎不直接依赖任何具体模型服务商，通过 evaluator 函数解耦，测试用 mock，生产注入视觉模型。
- **媒体类型抽象**：`mediaType` 贯穿全链路，v1 仅 `image`，`video` 预留。

## 2. 模块结构

```
apps/desktop/electron/services/prompt-eval/
├── index.js               # createPromptEvalService 门面 + 导出
├── dimensions.js          # 维度注册表、权重、分数/等级规则、问题类别、优化点类型（含校验）
├── prompt-builder.js      # 评估提示词构造（图片模式；视频占位）
├── llm.js                 # 评估器调用 + 严格 JSON 解析 + 契约校验（fail closed）
├── engine.js              # 编排：输入校验 → prompt 构造 → LLM → 报告 → 持久化
├── store.js               # 持久化：index.json / records/ / reports/，原子写
├── report.js              # JSON/Markdown 报告生成 + 聚合分析（analyze）
├── evaluator.js           # createModelProviderEvaluator：生产环境视觉模型适配
├── cli.js                 # 命令行批处理入口（node cli.js ...）
└── *.test.js              # 对应单元/契约测试
```

配套接线：

```
apps/desktop/electron/ipc-handlers/prompt-eval.js   # IPC 通道（withSenderCheck）
apps/desktop/electron/preload/prompt-eval.js        # renderer API（createPromptEvalApi）
apps/desktop/electron/preload/access-control.js     # 通道权限（authenticated 默认）
apps/desktop/electron/ipc-handlers/index.js         # 注册
apps/desktop/electron/preload/index.js              # 聚合到 window.electronAPI
apps/desktop/src/views/PromptEvalView.vue           # 评估视图（3 Tab）
apps/desktop/src/router/index.js                    # /prompt-eval 路由
apps/desktop/src/layouts/AppNavbar.vue              # 导航入口
apps/desktop/src/locales/zh.js (en.js)              # i18n 文案 promptEval.*
```

## 3. 数据流

### 3.1 评估请求（IPC / CLI 同构）

```
renderer/CLI
  └─ prompt-eval:run { mediaType, items:[{imagePath,sourceText,context,optimizedPrompt,negativePrompt,imageIndex}], options }
       │
       ▼
ipc-handlers/prompt-eval.js  ── withSenderCheck + 参数浅校验 + canonical 图片路径边界
       │
       ▼
engine.evaluateImages(request, { evaluator, store, log })
       │
       ├─ 1. validateRequest()           → EVAL_* 或通过
       ├─ 2. readImageFiles()            → base64（≤8MB/张），多图排序
       ├─ 3. promptBuilder.build()       → 评估提示词文本
       ├─ 4. evaluator({ prompt, images }) → 原始文本（LLM）
       │      └─ 瞬时错误重试（≤2 次，50/100ms 退避；内容/校验错误不重试）
       ├─ 5. llm.parseAndValidate()      → 结构化结果（fail closed）
       ├─ 6. report.build()              → { record, markdown }
       └─ 7. store.save(record, markdown) → { id, ... } 返回
```

### 3.2 历史与聚合

```
prompt-eval:list   → store.listRecords()       → index.json 合并 records/ 扫描修复
prompt-eval:get    → store.getRecord(id)       → EVAL_RECORD_NOT_FOUND 兜底
prompt-eval:delete → store.deleteRecord(id)    → 原子删除 + 索引更新
prompt-eval:analyze→ report.aggregate(records) → 维度均值/问题分布/优化点汇总
prompt-eval:dimensions → 只读返回维度定义（UI 渲染用）
```

## 4. 核心设计

### 4.1 维度注册表（dimensions.js）

```js
const IMAGE_DIMENSIONS = [
  { id: 'relevance',              label: '提示-输出关联度',     weight: 0.30 },
  { id: 'content_accuracy',       label: '内容准确性',         weight: 0.30 },
  { id: 'aesthetic_quality',      label: '视觉审美质量',       weight: 0.20 },
  { id: 'cross_image_consistency',label: '跨图上下文一致性',   weight: 0.20 }, // ≥2 图才参与
]
```

- `resolveDimensionWeights(imageCount)`：单图时剔除跨图维度并归一化权重（0.375/0.375/0.25）。
- `GRADES`：≥85 优秀 / ≥70 良好 / ≥50 一般 / <50 差。
- `PROBLEM_CATEGORIES` / `PROMPT_PART` / `OPTIMIZATION_POINT_TYPES` / `SEVERITIES` 白名单 + `assertXxxValid` 校验函数。

### 4.2 提示词构造（prompt-builder.js）

- `buildImageEvaluationPrompt({ sourceText, context, optimizedPrompt, negativePrompt, imageCount, language })`
- 输入快照 JSON 序列化（context 对象化、单字段裁剪到 6000 字符防溢出，总提示词长度上限约 21KB，裁剪时标记 `truncated: true` 到报告）。
- 单图/多图分支：多图追加跨图一致性评分标准；JSON 契约中维度白名单随之变化。
- 视频占位：`buildVideoEvaluationPrompt` 抛出 `EVAL_MEDIA_TYPE_NOT_SUPPORTED`。

### 4.3 评估器（evaluator.js）

```js
createModelProviderEvaluator({ manager, log })
// 返回 async ({ prompt, images }) => string
// images: [{ imagePath, base64, mimeType }]
```

- 解析视觉评估模型：优先 `manager.getDefault('llm')` 或支持 vision 的多模态 provider；无 → 抛 `EVAL_LLM_UNAVAILABLE`。
- 消息结构（OpenAI 兼容 content 数组）：`[{ type:'text', text: prompt }, { type:'image_url', image_url:{ url:'data:<mime>;base64,<data>' } }]`。
- `temperature`：来自请求 options.temperature（0-2 收敛，默认 0）；`maxTokens: 4000`。
- 契约：evaluator 返回**原始文本**；通过函数属性 `lastModelId` 回传实际模型 id（写入报告 evaluatorModel）；结构化解析与校验由 `llm.js` 负责（单一职责）。

### 4.4 LLM 输出解析与校验（llm.js）

- 清洗：剥除 ```json 代码块、首尾空白、非 JSON 前缀。
- `JSON.parse` 失败 → `EVAL_LLM_INVALID_RESPONSE`。
- 结构校验：7.3 契约逐项（维度 id/分数/evidence、problems、optimizationPoints 白名单）。
- 校验失败同样抛 `EVAL_LLM_INVALID_RESPONSE`（带 details 说明哪一项非法）。
- 通过后：总体分范围校验 + 与加权分偏差 >10 记录 `overallMismatch`。

### 4.5 持久化（store.js）

- 根目录：`path.join(userData, 'prompt-eval')`（`userData` 由调用方注入，测试注入 `os.tmpdir()` 唯一目录）。
- 原子写：`writeFileAtomic(file, data)` —— 临时文件 `file + '.tmp-' + pid` → `rename`；Windows 瞬时锁错误（EPERM/EACCES/EBUSY）退避重试 ≤3 次；其余错误原样抛出。
- `listRecords()`：读取 index.json；若索引与 records/ 不一致，扫描 records/ 重建索引（自愈）。
- `deleteRecord(id)`：删 records/ 与 reports/ 文件，再更新索引；文件不存在 → `EVAL_RECORD_NOT_FOUND`。

### 4.6 报告（report.js）

- `buildRecord(input, parsed, meta)`：生成 `{ id, mediaType, evaluatedAt, inputSnapshot, overallScore, grade, dimensions, problems, promptOptimizationPoints, overallMismatch, evaluatorModel }`。
- `toMarkdown(record)`：中文 Markdown 报告（总分/维度/问题/优化点/输入快照）。
- `aggregate(records)`：见 PRD 8.3。

### 4.7 IPC（ipc-handlers/prompt-eval.js）

- 所有通道包 `withSenderCheck`；`prompt-eval:run` 额外做图片路径 canonical 校验（复用 `story2video-paths` 的 realpath 语义，拒绝不存在/越界路径）。
- 依赖注入：`deps.promptEvalService`（未注入 → 注册时抛错，避免静默缺失）。

## 5. 安全设计

| 威胁 | 缓解 |
|------|------|
| 上下文注入敏感凭据 | 复用 `assertNoSensitiveContext` 白名单键拒绝；IPC 层二次校验 |
| 路径越界/符号链接逃逸 | `prompt-eval:run` 对 imagePath 做 `path.resolve` + 存在性/文件/大小校验；引擎层扩展名白名单 + 文件头魔数校验（EVAL_IMAGE_INVALID），拒绝伪图片与任意文件外带 |
| 记录 ID 路径穿越 | `store.getRecord/deleteRecord` 对 id 做 `^[A-Za-z0-9._-]{1,100}$` 白名单，非法抛 EVAL_RECORD_NOT_FOUND |
| 敏感上下文递归过滤 | `normalizeContextSnapshot` 对 context 做**递归**敏感键过滤（任意嵌套深度），命中即拒绝 |
| 评估提示词注入 | 输入快照 JSON 序列化 + 逐项输出（多图保留每项上下文）；单字段裁剪 6000 字符；业务文本原文嵌入属功能语义（评估即分析文本），长度上限兜底 |
| LLM 输出不可信 | 7.3 契约 fail closed：problems/promptOptimizationPoints 必须为数组（缺失/非数组失败），维度/分数/evidence 白名单校验；绝不 eval 或执行 |
| 本地数据完整性 | 原子写 + 索引自愈；删除失败显式报 EVAL_STORE_WRITE_FAILED；写入失败清理临时文件 |
| IPC 暴露面 | 默认 authenticated 级别；run 入参拷贝后再归一化（不污染调用方对象） |

## 6. 测试策略

| 层 | 文件 | 覆盖 |
|----|------|------|
| 维度 | dimensions.test.js | 权重归一化（单图/多图）、等级边界（84/85、69/70、49/50）、白名单校验 |
| 提示词构造 | prompt-builder.test.js | 单图/多图分支、上下文对象化、裁剪标记、视频拒绝 |
| LLM 解析 | llm.test.js | 合法 JSON、代码块包裹、非法 JSON、缺维度、分数越界、白名单外值、空 evidence → 全部 fail closed |
| 引擎 | engine.test.js | 输入校验矩阵（每个 EVAL_*）、mock evaluator 成功/失败、重试语义、单图/多图、store 写入 |
| 存储 | store.test.js | 唯一临时目录、原子写、索引自愈、删除、Windows 锁错误有界重试（注入 fs mock） |
| 报告 | report.test.js | 记录结构、Markdown 生成、聚合统计 |
| IPC | prompt-eval.test.js | 通道注册、参数校验、sender 校验、记录 CRUD |
| 前端 | PromptEvalView 相关 composable 测试 | IPC 非空数据 → 响应式状态转发（不 mock 空数组） |

运行：`cd apps/desktop && npx vitest run services/prompt-eval ipc-handlers/prompt-eval.test.js preload/prompt-eval.test.js`

## 7. 生产接线（main.js）

```js
const { createPromptEvalService } = require('./services/prompt-eval')
const promptEvalService = createPromptEvalService({
  userDataDir: app.getPath('userData'),
  evaluator: createModelProviderEvaluator({ manager: modelProviderManager, log }),
  log,
})
// ipc-handlers/index.js: require('./prompt-eval')(ipcMain, { ...deps, promptEvalService })
```

## 8. 兼容性与外部边界

- 不修改 prompt-engine（8013）契约；消费其输出（optimized_prompt）作为评估输入。
- 不修改 Story2Video 流水线；图片/提示词由用户或批处理脚本从既有产物导入。
- 视觉评估模型可用性属于外部验收边界（真实图片 + 真实模型由人工验收），单元/集成测试使用 mock evaluator。

## 9. 目录/文件影响清单

新增文件（无修改既有运行时文件）：

- apps/desktop/electron/services/prompt-eval/*.js（含测试）
- apps/desktop/electron/ipc-handlers/prompt-eval.js（+ test）
- apps/desktop/electron/preload/prompt-eval.js（+ test）
- apps/desktop/src/views/PromptEvalView.vue
- 01-docs/PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md / ARCH-PROMPT-EVAL-SYSTEM-2026-08-11.md
- openspec/changes/prompt-image-eval-system/*

修改文件（仅文档/接线点）：

- apps/desktop/electron/ipc-handlers/index.js（注册一行）
- apps/desktop/electron/preload/index.js（聚合一行）
- apps/desktop/electron/preload/access-control.js（通道白名单）
- apps/desktop/src/router/index.js（路由一行）
- apps/desktop/src/layouts/AppNavbar.vue（导航入口）
- apps/desktop/src/locales/zh.js（i18n）
- 01-docs/PRD.md、CHANGELOG.md、.quality-gates.md

> ⚠️ 不触碰 `apps/desktop/electron/services/story2video-stages.js`（该文件当前含其他在途任务的未提交改动，本分支不得纳入）。
