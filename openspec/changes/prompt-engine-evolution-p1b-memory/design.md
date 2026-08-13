# Design — P1b 记忆库 + 治理（PromptMemory + Governance）

> 关联：`01-docs/prompt-engine-evolution-design.md` §3.4/§4.3/§4.5；`ARCH-PROMPT-ENGINE-EVOLUTION-FINGERPRINT-2026-08-13.md`（检索模块，本 change 是其消费方）

## 1. 模块结构

```
apps/desktop/electron/services/prompt-evolution/
  fingerprint.js        # 已有：主题指纹 + findSimilarTemplates（检索）
  signal-collector.js   # 已有：P0 采集（generation/feedback 日志 + getStats）
  prompt-memory.js      # 新增：记忆库（库文件 + 版本化模板 + 状态查询/流转入口）
  governance.js         # 新增：门禁 6 规则 + 滑窗回滚 + 配额
  prompt-memory.test.js / governance.test.js   # 新增
```

- `prompt-memory.js` 与 `governance.js` 均零外部依赖、纯同步（回滚监控为同步轮询接口），不引入异步/LLM。
- 检索数据源契约：`prompt-memory.listActive({engine})` 返回 `[{id, fingerprint, stats}]`，直接喂给 `fingerprint.findSimilarTemplates(concept, activeTemplates, {rand})`——记忆库是检索的上游，检索逻辑零改动。

## 2. 数据模型

### 2.1 目录布局（opts.libraryRoot，默认 `userData/prompt-library/`）

```
prompt-library/
  library.json                       # 索引（items 按 id 组织）
  templates/<id>@<version>.json      # 单模板完整记录
```

### 2.2 library.json（索引）

```jsonc
{
  "schemaVersion": 1,
  "dictVersion": "2026-08-13",       // 与 fingerprint.DICT_VERSION 对齐；不匹配→惰性重算/标 stale
  "items": {
    "tpl_<16hex>": {
      "id": "tpl_...",
      "engine": "image" | "video",
      "type": "composition" | "style" | "keyword" | "metaphor" | "full",
      "versions": [1, 2],             // 版本列表（新 save 同一 source+content 语义时升版）
      "latestVersion": 2,
      "state": "draft" | "active" | "deprecated" | "disabled",
      "createdAt": "ISO", "updatedAt": "ISO"
    }
  }
}
```

### 2.3 templates/<id>@<version>.json（完整模板，对齐设计 §3.4）

```jsonc
{
  "id": "tpl_...", "version": 1, "engine": "image", "type": "full",
  "content": {
    // full：storyboard 结构化 {structure, 视觉隐喻, color, constraints, ...}
    // fragment：仅 compositionType/action/object/creativeLevel 四类可控参数
    "compositionType": "前后对比", "action": "放大", "object": "书本",
    "creativeLevel": 7
  },
  "source": "learnt",
  "provenance": { "learnedFrom": "evt_<hex>", "acceptedEvents": [] },
  "stats": { "uses": 0, "acceptRate": 0, "avgScore": null, "avgCost": 0, "lastUsedAt": null },
  "state": "draft",
  "guard": { "checksum": "sha256...", "validatedAt": "ISO", "gateRules": ["structure","compliance","length","noSecrets","dedup"], "evaluatorVersion": null },
  "fingerprint": { "schemaVersion": 1, "dictVersion": "2026-08-13", "domains": [], "compositionIntents": [], "topics": [], "tone": "" },
  "createdAt": "ISO", "updatedAt": "ISO", "confirmedBy": null
}
```

- `stats` 是滑窗聚合结果（非存储原始信号），由注入的 `statsProvider` 实时计算（见 §5），写回 `lastUsedAt` 等低频字段。
- 版本化：同一 `source.provenance.learnedFrom` + 相同 fingerprint 语义下的新 save 走升版（versions.push，latestVersion+1），不覆盖旧版——回滚依赖历史版本。

## 3. PromptMemory API

```js
createPromptMemory({ libraryRoot, config, statsProvider, log })
```

| 方法 | 行为 |
|---|---|
| `load()` | 读 library.json + 全部模板文件到内存索引；校验 dictVersion；损坏文件 fail-close 重建空库并告警 |
| `list({state?, engine?, type?})` | 返回匹配模板摘要（供 `prompt-library:list`） |
| `listActive({engine})` | 返回 `[{id, fingerprint, stats}]`（仅 active），供 fingerprint 检索 |
| `get(id, version?)` | 单模板详情（供 `prompt-library:get`）；不存在返回 null |
| `saveLearnt({engine, type, content, eventId})` | 入库主入口：归一化 → 门禁（governance.runGates）→ 通过则写 draft；返回 `{ok, id, version, state}` 或 `{ok:false, code}` |
| `activate(id, {confirmedBy})` | draft→active（人工/数据确认入口）；非 draft 状态拒绝 |
| `deprecate(id, {reason})` | active→deprecated（治理回滚调用 + 手动） |
| `disable(id)` | deprecated→disabled（手动，终态） |
| `refreshFingerprints()` | dictVersion 变更时惰性重算或标 stale |

- 关键约束：**learnt fragment 四类参数白名单**——`saveLearnt` 里对 fragment 类模板做 content 键校验：仅允许 `compositionType/action/object/creativeLevel`，含 `color/keywords/metaphor/...` 越界键直接拒绝（门禁 structure 前置检查）。
- 写盘原子性：临时文件 + rename（Windows 原子替换语义，参照 QM 铁律），单 writer，写失败不阻断生成主流程。

## 4. Governance API

```js
createGovernance({ config, memory, statsProvider, log })
```

| 方法 | 行为 |
|---|---|
| `runGates(template)` | 门禁 6 规则，返回 `{pass, results{rule: ok|fail, detail}, checksum}` |
| `transition(id, to, {reason})` | 状态机校验（见 §4.2）后委托 memory 流转 |
| `checkRollback(now)` | 滑窗回滚扫描（见 §5），返回本次变更列表 |
| `isAutoEvaluationAllowed(engine, today)` | 配额检查（见 §6），超限返回 false |

### 4.1 门禁 6 规则

| 规则 | 判定 |
|---|---|
| structure | 按 engine/mode 分档必填字段完整；fragment 仅四类参数 |
| compliance | content 不含 config 合规词表命中项 |
| length | storyboard 中文 50..2000 字符；英文 prompt 50..200 词（按 engine 分档） |
| noSecrets | 疑似指令注入模式（分隔符逃逸/越权指令，config 正则表，仅匹配不 eval） |
| dedup | content checksum 与库内 active 模板碰撞 → 拒绝或升版合并 |
| evaluatorVersion | 记录本次 gate 的 evaluator 版本（V0 固定 `rule-v0`） |

- checksum = sha256(canonical content JSON)，写入 guard.checksum。
- 全部规则纯函数、可注入配置、无 LLM。

### 4.2 状态机

```
builtin ──load──▶ active ──rollback/manual──▶ deprecated ──manual──▶ disabled
manual ──confirm──▶ active ──▶ deprecated ──▶ disabled
learnt ──gates 通过──▶ draft ──activate(人工/数据确认)──▶ active ──▶ deprecated ──▶ disabled
```

- 合法边：`draft→active`、`active→deprecated`、`deprecated→disabled`；非法边一律拒绝并返回错误码。
- 检索边界由 memory.listActive 保证（仅 active），deprecated 即使高分不命中（沿用指纹 §3.2/状态变更钩子）。

## 5. 滑窗回滚（指标化可测）

- 输入：`statsProvider(templateId)` 返回 `{acceptRateSeries: [r1..rN], avgScoreSeries: [s1..sN], uses, lastUsedAt}`；series 由 signal-collector 按 templateVersion join generation/feedback 计算（跨月保留当月+上月，与 P0 一致）。
- 触发：`acceptRate 连续 N 期（默认 3）< threshold（默认 0.3）` **或** `avgScore 相对峰值下滑 > dropThreshold（默认 20%）`。
- 动作：`transition(templateId,'deprecated',{reason:'sliding-window-rollback'})`；`optimizedBy` 生成侧回退内置池（沿用既有回退路径）。
- 冷却：模板记录 `cooldownUntil`，冷却期（默认 24h）内同一模板不重复回滚；`checkRollback(now)` 幂等、可注入时钟（`opts.now`）供测试。

## 6. 成本配额

- 配置：`evolution.budget = { image: { daily: 2000 }, video: { daily: 0 } }`（视频默认零自动评分）。
- `isAutoEvaluationAllowed(engine, today)`：读 score-log 当日 spend（P1a 写入；V0 无 score-log 时 spend=0，配额只作闸门）；视频 `daily===0` 恒 false。
- 超限语义：评估/入库评估跳过，生成主流程继续（沿用 P0「写失败不阻断」原则），返回降级信号供可观测。

## 7. IPC 与接线

- `ipc-handlers/generation-feedback.js`：`prompt-library:list` 由骨架升级为 `memory.list()`；新增 `prompt-library:get` / `prompt-library:save` / `prompt-library:activate`。沿用 `code+data+message` + `core/error-codes.js`；save 入参 `{engine, type, content, eventId}` 纯 JSON 校验（eventId 必填）。
- `core/error-codes.js`：新增 `EC.TEMPLATE_INVALID`、`EC.TEMPLATE_GATE_FAILED`、`EC.TEMPLATE_NOT_FOUND`、`EC.TEMPLATE_BAD_STATE`。
- `preload/system.js`：保持 `promptLibraryList`，新增 `promptLibraryGet/Save/Activate`；`npm run build:preload` 后同步 `index.bundle.js`（CI 断言 bundle 键数）。
- `core/container.setup.js`：feature flag `evolution.memory.enabled`（默认开）+ promptMemory/governance 单例构造，注入 statsProvider（接 signal-collector.getStats + 按 templateVersion 聚合）。
- 前端「存为模板」按钮 UI 属 P2，本 change 只交付 IPC 契约 + 单元/契约测试。

## 8. 兼容性

- `generateCandidates` 同步签名、`COMPOSITION_PATTERNS` 内置池、`generation:feedback` 契约、`PromptBridge` 契约：零改动。
- `prompt-library:list` P0 返回 `{code:0, data:[]}` → 升级后仍 `{code:0, data:[...]}`，空库兼容。
- fingerprint.js：零改动（本 change 只提供其 `activeTemplates` 数据源）。
- 测试隔离：全部 `os.tmpdir()` 唯一目录；不触碰真实 userData。

## 9. 测试计划（TDD）

| 层 | 用例 |
|---|---|
| prompt-memory 单元 | 四类参数白名单拒绝；dictVersion stale；版本升版不覆盖；写盘原子性；损坏库 fail-close 重建 |
| governance 单元 | 6 规则逐条（注入/长度/合规/结构/dedup）；状态机合法/非法边；滑窗回滚 + 冷却期幂等；配额（视频零、图片超限降级） |
| IPC 契约 | list/get/save/activate 的 code+data+message 与 EC 错误码；save 缺 eventId 拒绝；activate 不存在拒绝 |
| 集成 | memory.listActive → fingerprint.findSimilarTemplates 全链路（active 命中、deprecated 不命中） |
| 兼容 | prompt-library:list 空库返回 `{code:0,data:[]}` 与 P0 结构一致 |
