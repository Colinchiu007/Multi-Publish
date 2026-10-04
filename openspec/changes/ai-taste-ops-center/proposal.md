# Proposal: ai-taste-ops-center（去 AI 味运营中心化——词库管理与参数面）

## Why

去 AI 味（`AITasteRemover`）是改写引擎的固定后处理，直接影响全部改写产出的文本风格，但其数据与参数**全部硬编码在引擎包内**（`packages/rewrite-engine/src/ai-taste-remover.js`：128 条 `AI_PHRASE_MAP`、`HUMAN_BASELINE` 密度阈值、`intensity: 2` 固定值）：

1. **调整需发版**：管理员发现某条替换不合语境（或新 AI 套路词出现），只能改代码走发版，周期长；
2. **设置面割裂**：策略级有 `postProcess.removeAITaste` 总开关（可关整个去 AI 味），但强度（intensity）与词表不可配——「能关却不能调」；
3. **相邻机制已有同构先例**：改写硬约束（rewrite-hard-constraints，2026-09-19）已打通「运营中心管理页 → runtime/bootstrap 签名下发 → 桌面端 manager → 引擎注入」全链路（四件套：种子数据/管理页/下发字段/引擎注入），本模块是同一形态在「词表数据」上的复制，无未探明风险。

已定案的设计决策（grilling 会话 Q1-Q12，全部按推荐）：

| # | 决策 |
|---|---|
| Q1 | 扁平单表（word → replacement + severity S1/S2/S3）；开场正则、口语化映射**不进**运营中心 |
| Q2 | **叠加 + 键覆盖**：内置 128 条是安全底线，运营中心同键覆盖 |
| Q3 | 单份可编辑表 + 审计字段（updatedBy/updatedAt）；版本化登记 P2 |
| Q4 | intensity 进策略 `postProcess.aiTasteIntensity`（1-3 整数，缺省回 2，零新表） |
| Q5 | 即时生效（引擎 setter 注入 + remover 每次新建，天然免重启） |
| Q6 | 两刀交付：刀 1 = 引擎注入化 + ops-center 后端；刀 2 = 管理页 UI + 桌面端接线 |
| Q7 | 条目 `enabled` 字段：false 即引擎跳过该词（可禁用内置词替换） |
| Q8 | 校验：word≤30 / replacement≤50 / severity 枚举 / 拒控制字符 / 拒纯标点与单字符正则元字符词目 |
| Q9 | 并入 runtime/bootstrap（`rewrite_ai_taste_map` 字段，白嫖整包 Ed25519 签名） |
| Q10 | 管理页全量表格 + 前端筛选 + JSON 导入导出（不分页） |
| Q11 | 管理页 adminOnly（照硬约束先例） |
| Q12 | 引擎侧构造参数注入（`AITasteRemover({phraseMap, disabledWords})` 缺省回常量）+ `setAiTasteCustomization` setter（照 setHardConstraints 同构） |

## What Changes

### ADDED Capabilities

- `rewrite-ai-taste-customization`：去 AI 味词库与参数的运营中心化契约——词库 CRUD（含禁用/启用语义、校验判据、种子策略）、runtime/bootstrap 下发（`rewrite_ai_taste_map`）、桌面端 manager 接线与引擎注入、策略级 `aiTasteIntensity` 参数、管理页 UI。

### MODIFIED Requirements

- 无（既有 rewrite-hard-constraints / rewrite-strategies 契约不变；bootstrap payload 仅**新增**字段，向后兼容）。

## Impact

- **ops-center 后端**：models.py 新表、新 service/router、main.py 注册、runtime_service 新下发字段、pytest 新测试文件。
- **ops-center 前端**：新 api client / 管理页 / 路由 / 菜单项（adminOnly）/ menu-visibility 测试同步。
- **桌面端**：新 ai-taste-map-manager（sanitize + applyRemote + getMap + userData 原子持久化）、ops-center-sync 消费块、container/phase1/phase5 接线、rewrite-engine 服务注入。
- **引擎包**：AITasteRemover 构造注入（缺省回常量，现有测试零改动）、rewrite-engine-core setter + `_postProcess` 消费 + `aiTasteIntensity` 读取。
- **不涉及**：渲染进程 UI 与 locales（消费链全在主进程/引擎层）；开场正则与口语化映射的管理面（明确排除）。
