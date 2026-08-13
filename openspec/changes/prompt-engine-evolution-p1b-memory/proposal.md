## Why

P0 反馈管道（双日志 + 统计）已沉淀 generation/feedback 数据，P1b 主题指纹（fingerprint.js）已能判定「新输入与库中哪个模板/片段同类」；但 learnt 模板仍无落库、门禁与治理通道——经验只停留在日志层，无法在下次生成时被检索复用。记忆库 + 治理层是「采集 → 评估 → 记忆 → 优化 → 治理」闭环中把「高价值片段沉淀为可复用、可回滚资产」的关键一环，也是 P1b 规格明确划定的另一半（指纹规格 §8 声明「PromptMemory 入库/门禁/状态机为 P1b 另一半，不在指纹范围」）。

## What Changes

- **新增 PromptMemory 记忆库 V0**（`services/prompt-evolution/prompt-memory.js`）：
  - `prompt-library/library.json` 索引 + `templates/<id>@<version>.json` 版本化模板文件
  - full + fragment 两级；learnt fragment 仅允许 compositionType/action/object/creativeLevel 四类可控参数（与生成器可控参数一一映射；color/keywords/metaphor 类归 P3）
  - 元数据：`source(builtin|learnt|manual)`、`provenance{learnedFrom,acceptedEvents}`、`stats{uses,acceptRate(滑窗),avgScore,avgCost,lastUsedAt}`、`state(draft|active|deprecated|disabled)`、`guard{checksum,validatedAt,gateRules,evaluatorVersion}`
  - `dictVersion` 变更时惰性重算指纹或标 stale 不参与检索（与 fingerprint M6 对齐）
- **新增 Governance 治理层**（`services/prompt-evolution/governance.js`）：
  - 门禁 6 规则：structure / compliance / length / noSecrets（疑似注入）/ dedup（checksum + 近重复淘汰）/ evaluatorVersion
  - 状态机：builtin/manual → active → deprecated → disabled；learnt：门禁通过 → draft →（人工确认或数据确认）→ active
  - 滑窗退化回滚：acceptRate 连续 N 期 < 阈值或 avgScore 下滑 → 自动 deprecated → 回退上一版本/内置池；冷却期防抖
  - 成本配额：config 按引擎 dailyBudget；视频默认零自动评分
- **IPC 升级**（`ipc-handlers/generation-feedback.js`）：
  - `prompt-library:list`：P0 空骨架升级为真实只读列表（active/draft 分状态）
  - 新增 `prompt-library:get`（单模板详情）、`prompt-library:save`（learnt 模板入库，过门禁进 draft）、`prompt-library:activate`（draft→active 人工/数据确认）
  - 沿用 `code+data+message` + `core/error-codes.js` EC 常量；纯 JSON 入参
- **preload**：`promptLibraryList` 保持，新增 `promptLibraryGet/Save/Activate` 暴露
- **接线**：`core/container.setup.js` 注册 feature flag；config evolution.* 扩展配额/门槛配置
- 前端「存为模板」按钮 UI 归 P2（本 change 仅交付 save IPC 契约与 E2E 可测入口）

## Capabilities

### New Capabilities
- 无（复用既有 `prompt-engine-evolution` 能力，不新建 capability 路径）

### Modified Capabilities
- `prompt-engine-evolution`: 在既有（P0 采集 + P1b 指纹）10 条需求基础上，新增记忆库（模板结构/落库/检索数据源）、门禁 6 规则、状态机与滑窗回滚、成本配额、`prompt-library:*` IPC 契约 5 类需求

## Impact

- 新文件：`apps/desktop/electron/services/prompt-evolution/prompt-memory.js`、`governance.js` + 各自测试
- 修改：`ipc-handlers/generation-feedback.js`（prompt-library:* 真实实现）、`preload/system.js`、`core/container.setup.js`、config 默认值
- 复用：fingerprint.js（检索/评分）、signal-collector.js（stats 数据源）、story2video-engine COMPOSITION_PATTERNS（四类可控参数权威结构）、`core/error-codes.js`
- 不改变：`generateCandidates` 同步签名、内置 COMPOSITION_PATTERNS 池、`generation:feedback` 契约、`PromptBridge` 契约
- 依赖：零新增第三方；测试走 `os.tmpdir()` 隔离
