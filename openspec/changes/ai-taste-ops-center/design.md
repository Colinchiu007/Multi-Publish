# Design: ai-taste-ops-center

## 1. 数据模型（ops-center `rewrite_ai_taste_entries` 表）

照 `RewriteHardConstraint` 形态（models.py:683-701 先例）：

| 字段 | 类型 | 说明 |
|---|---|---|
| word | String(30) PK | 原词（AI 惯用语；大小写不敏感匹配在引擎侧，存储保留原大小写） |
| replacement | String(50) not null | 替换词（人类表达） |
| severity | String(2) not null | 枚举 S1/S2/S3（与引擎评分权重对齐：S1 +0.1 / S2 +0.05 / S3 +0.02） |
| enabled | Int 默认 1 | 0 = 引擎跳过该词（含禁用内置词替换的语义，Q7） |
| description | String(200) 默认 '' | 条目说明（可选） |
| deleted_at | 软删 | 照先例 |
| created_at / updated_at / updated_by | String ISO | 审计（Q3：无版本化，仅审计字段） |

无 is_default/多版本（Q3 定案：单份可编辑表）。种子 = 引擎内置 128 条 `AI_PHRASE_MAP` 的导出（word/replacement/severity 逐条对齐，enabled 全 1），幂等播种按 word 跳过。

## 2. 校验判据（Q8，service 层 validate）

| 字段 | 规则 | 失败 |
|---|---|---|
| word | 非空、trim、≤30 码点、无换行/控制字符（\x00-\x1f\x7f）、**拒绝纯标点/单字符正则元字符**（`. ^ $ * + ? ( ) [ ] { } | \ /`） | 400 中文错误 |
| replacement | 非空、trim、≤50 码点、无换行/控制字符 | 400 |
| severity | ∈ {S1, S2, S3} | 400 |
| enabled | 0/1 | 400 |
| description | ≤200 | 400 |

批量导入（POST /import）逐条校验，**整批原子**（任一非法整批拒绝，报首个错误）；单批 ≤500 条。

注入安全性依据：引擎 `escapeRegex(word)` 已保证 word 中的正则元字符不逃逸（ai-taste-remover.js:447-455），校验层拒绝的是**语义风险**（word=`.` 使每字符成替换点）而非崩溃风险。

## 3. API（ops-center，prefix `/api/v1/rewrite-ai-taste`，照硬约束 6 端点模式）

| 端点 | 鉴权 | 语义 |
|---|---|---|
| GET `` | get_current_user | 全量列表（未删，severity/enabled 排序：S1→S2→S3→word） |
| POST `` | require_admin | 新增条目（重复 word → 409） |
| PUT `/{word}` | require_admin | 更新（URL 路径转义 word；保留原 word 主键） |
| DELETE `/{word}` | require_admin | 软删 |
| POST `/{word}/toggle` | require_admin | 启停切换（Q7 主操作） |
| POST `/import` | require_admin | 批量导入（原子，≤500 条） |
| GET `/runtime` | 免鉴权 | runtime 下发形态（bootstrap 组装用，返回全量非删条目） |

注意 word 作 URL 段需 encodeURIComponent（含空格/撇号的英文条目）；FastAPI path 参数自动解码。

## 4. runtime 下发（Q9）

`runtime_service.get_runtime_bootstrap`（:342-356）新增字段：

```python
"rewrite_ai_taste_map": await list_runtime_ai_taste_entries(db),  # [{word, replacement, severity, enabled}]，enabled=1 与 0 都下发
```

- 下发**全量非删条目**（含 enabled=0——桌面端要知道哪些内置词被禁用了）；整包 Ed25519 签名自动覆盖（先例 :314-319）。
- 大小估算：128 条 × ~150B ≈ 20KB，payload 无压力。

## 5. 桌面端 manager（`ai-taste-map-manager.js`，照 rewrite-hard-constraint-manager 形态）

```
sanitizeRemoteEntry(e) → null | {word, replacement, severity, enabled}   // 与 ops-center 同判据（双端一致）
applyRemote(list) → boolean changed                                       // 深比较后原子落盘（tmp+rename）
getMap() → Map<string, {replacement, severity}>                           // 仅 enabled=1（引擎替换表）
getDisabled() → string[]                                                  // enabled=0 的 word（引擎禁用表）
getCurrent() → 全量（诊断）
```

持久化 `userData/rewrite-ai-taste-map.json`。ops-center-sync 消费块照 ：508-523 形态（`payload.rewrite_ai_taste_map` → applyRemote → changed 时 `rewriteEngineService.setAiTasteMapManager(...)` 重注入）。

## 6. 引擎侧注入（Q12）

**AITasteRemover**（ai-taste-remover.js）：

```js
constructor(options) {
  // 既有字段不动
  this._phraseMap = options.phraseMap || AI_PHRASE_MAP          // 覆盖层：{word: replacement}
  this._disabledWords = new Set(options.disabledWords || [])    // 禁用表
  this._severityOfWord = options.severityMap || null            // 可选：覆盖 severity 判定（评分用）
}
```

- `_replaceAIPhrases`/`_densityThreshold`/`_severityOf`：先查 disabledWords 跳过；词表遍历改用 `this._phraseMap`（键序确定性排序，保证 detect/process 稳定输出）；缺省路径零变化（现有 11+47 测试零改动照过——TDD 锁）。
- `_scoreFromPatterns` 评分权重不进运营中心（代码常量，severity 只决定词目分级，不暴露权重编辑）。

**RewriteEngine**（rewrite-engine-core.js，照 setHardConstraints :63-65 同构）：

```js
setAiTasteCustomization({ phraseMap, disabledWords, intensity })  // 全缺省安全（{}→行为不变）
getAiTasteCustomization()
```

`_postProcess`（:484-514）消费：

```js
const intensity = this._aiTasteCustomization?.intensity
    ?? (wordCountRange 派生) ?? 2   // 强度优先级见 §7
const remover = new AITasteRemover({
  enabled: postProcess.removeAITaste !== false,
  intensity,
  tone: strategy.tone?.[0] || 'casual',
  phraseMap: this._aiTasteCustomization?.phraseMap,       // undefined → 回常量
  disabledWords: this._aiTasteCustomization?.disabledWords,
  severityMap: this._aiTasteCustomization?.severityMap,
})
```

## 7. 强度语义（Q4）

策略 `postProcess.aiTasteIntensity`（1-3 整数）读取优先级：

1. 策略 `postProcess.aiTasteIntensity`（合法 1-3 整数）；
2. 缺省/非法 → 2（现状不变）。

- `intensity=1`：跳过 Pass 3（句长节奏修复）与口语化——只做词级替换（最轻）；
- `intensity=2`：现状（Pass 1-3，无口语化）；
- `intensity=3`：现状 + casual 口语化（COLLOQUIAL_MAP 启用）。

校验：ops-center validate 拒绝非 1-3 整数；引擎侧二次防御（非法值回 2）。

## 8. 桌面端接线（照探子 checklist 12-18）

- `rewrite-engine.js`：`setAiTasteMapManager(m)`（存引用，`_engine=null` 强制重建——引擎构造时经 `setAiTasteCustomization` 一次性注入，与硬约束 ：73-76 同款；因 remover 每次 new，重建后自然生效）；`_ensureEngine` 构建时 `engine.setAiTasteCustomization({ phraseMap: m.getMap()（plain object）, disabledWords: m.getDisabled(), severityMap: m.getSeverityMap() })`。
- container.setup.js / phase1-context.js / phase5-ipc.js：照硬约束 :238-249 / :226-232 / :183-214 形态接线。
- **intensity 下发**：不需要——它藏在策略 postProcess JSON 里，随既有 `rewrite_strategies` 通道下发，引擎 `_postProcess` 直接从策略读。

## 9. 管理页（Q10，`RewriteAiTaste.vue`，照 RewriteHardConstraints.vue + RewriteStrategies.vue 混合形态）

- 顶部工具行：搜索框（word/替换词模糊）、severity 筛选（全部/S1/S2/S3）、状态筛选（全部/启用/停用）、「新增」「导入」「导出」按钮；
- 表格列：word / replacement / severity tag（S1 红 S2 橙 S3 灰）/ 状态 switch（行内 toggle）/ updatedBy / updatedAt / 操作（编辑/删除）；
- 编辑对话框：word（编辑态只读——主键不可改，改词=删旧增新）、replacement、severity 下拉、description；实时校验提示与后端同判据；
- 导入：el-upload JSON 文件 → 前端预览条数 → POST /import 原子导入 → 失败展示首个错误；
- 导出：前端下载当前全量为 JSON（`ai-taste-map-export-<date>.json`）；
- 菜单：`{ path: '/rewrite-ai-taste', label: '去AI味词库', icon MagicStick, adminOnly: true }`；menu-visibility.test.js 路径清单同步。

## 10. 测试矩阵

| 层 | 文件 | 覆盖 |
|---|---|---|
| 引擎单元 | packages/rewrite-engine/tests/ai-taste-remover.test.js 新 describe | 注入 phraseMap 覆盖内置键 / disabledWords 跳过（内置词与自定义词）/ 缺省回常量（逐字节不变锁）/ severityMap 评分 / intensity 1 跳 Pass 3、3 启用口语化 |
| 引擎编排 | tests/rewrite-engine-core.test.js 新 describe | setAiTasteCustomization 全缺省行为不变 / 策略 postProcess.aiTasteIntensity 消费与非法回退 / 自定义词在 rewrite() 端到端生效 |
| ops-center 后端 | tests/test_rewrite_ai_taste_api.py 新建 | 种子 128 条幂等 / CRUD / 重复 409 / toggle / 校验拒绝表（Q8 判据逐条）/ import 原子性 / runtime 字段形态与 enabled=0 保留 / 鉴权矩阵 |
| 桌面 manager | services/ai-taste-map-manager.test.js 新建 | sanitize 拒绝判据（与后端同表）/ applyRemote changed 判定 / 持久化往返 / getMap 排除 disabled / getDisabled / 空态 |
| 桌面 sync | services/ops-center-sync.test.js 增例 | payload.rewrite_ai_taste_map 消费 / 缺字段跳过 / changed 重注入（补硬约束先例缺的同类用例） |
| 前端 | menu-visibility.test.js 同步 | adminOnly 路径清单含 /rewrite-ai-taste |

## 11. 非目标

- 开场正则（FORBIDDEN_OPENING_PATTERNS）与口语化映射（COLLOQUIAL_MAP）的运营中心化——明确排除（Q1）；
- 词表版本化/回滚 UI（Q3 登记 P2）；
- `_scoreFromPatterns` 权重可配（不暴露）；
- 渲染进程任何 UI 与 locales 变更（改写页无新开关——终端用户面不变，Q 决策）；
- 词表内容的多语言（当前引擎只处理中英文混合场景，词表条目由管理员自管）。
