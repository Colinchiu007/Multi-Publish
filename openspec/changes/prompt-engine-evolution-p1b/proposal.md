## Why

P0 反馈管道已上线（PR #722），生成/反馈数据开始沉淀；但没有「同类检索」能力，记忆库无法把历史高分模板关联到新输入主题——「经验沉淀」缺了「经验复用」的入口。P1b 指纹模块让系统回答「新输入主题与库中哪个模板/片段是同类」。

## What Changes

- **新增桌面端主题指纹模块** `apps/desktop/electron/services/prompt-evolution/fingerprint.js`：
  - `DOMAIN_DICTIONARY`（6 领域强/弱词）+ `INTENT_ALIASES`（8 构图意图别名，强/弱档）+ `extractTopics`（轻量分词，零依赖）+ `buildFingerprint`（domains/intents/topics/tone）+ `score`（4/2/2/1 加权，分量上限）+ `findSimilarTemplates`（置信档位 NONE/MID/HIGH + 探索 ε + 命中溯源）。
  - 匹配规则：英文词边界（`\b`）+ 词长≥4（缩写白名单 AI）；中文子串；输入 ≤2000 截断；不把输入拼进正则。
  - 复用 COMPOSITION_PATTERNS.applyWhen 与 SentimentAnalyzer 语义，经 JS 词表副本 + parity 测试锁死（Electron 主进程纯 JS 无法 require TS 包）。
- **不改变**：generateCandidates 同步签名、内置池、PromptBridge 契约。
- **边界**：V0 只做「同词面」同类；语义相似（数据安全↔隐私保护）为 P3 embedding 待办；PromptMemory 入库/门禁/状态机为 P1b 另一半（后续 change 承载）。

## Capabilities

### New Capabilities
- `prompt-engine-evolution`: 新增「主题指纹与同类模板检索」需求（指纹结构、评分/档位、词典匹配、探索 ε、溯源契约、测试隔离）。

### Modified Capabilities
- （无。既有 `image-prompt-engine` 覆盖优化路径，`prompt-engine-evolution` 为 P0 归档 specs，本 change 在其下 ADDED 需求。）

## Impact

- 新增：`fingerprint.js` + `fingerprint.test.js`（14 例，含 parity 断言与 TS 权威版对齐）。
- 复用语义（JS 副本 + parity）：`storyboard-prompt.ts` COMPOSITION_PATTERNS.applyWhen 8 组、`history-prompt.ts` SentimentAnalyzer 12 情感词。
- 文档：01-docs/ARCH-PROMPT-ENGINE-EVOLUTION-FINGERPRINT-2026-08-13.md（v3 规格，已合入 main，作为 design 依据）、CHANGELOG、quality-gates。
- 交付：codex/ 分支 + PR；双模型审查；桌面 Vitest 测试。
