## Design — prompt-engine-evolution-p1b（主题指纹与同类检索）

> 完整规格：01-docs/ARCH-PROMPT-ENGINE-EVOLUTION-FINGERPRINT-2026-08-13.md（v3，已合入 main，双模型评审通过）

### 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| TS 复用方式 | JS 词表副本 + parity 测试 | Electron 主进程纯 JS 无法 require TS 包（exports["."]=src/index.ts）；segmentation-engine 已有 JS 镜像 + parity 先例 |
| 匹配模式 | 英文词边界（\b）+ 词长≥4（缩写白名单 AI）；中文子串 | C3：防 AI/app/law 子串误判 |
| 输入边界 | ≤2000 截断；不把输入拼进正则 | M8：防注入与性能 |
| 档位 | NONE（intent=0）/ MID（4-7, intent≥1）/ HIGH（≥8, intent≥1+领域护栏） | C2：删 LOW 死档 |
| 权重 | 4/2/2/1，分量上限 min(2,|∩|) | M4：防多领域偏置 |
| tone | 双方≠peaceful 才计分 | M5：默认值不虚增 |
| 探索 ε | active 集内重排；activeCount<10 → 0；rand 注入 | M7 |
| 缓存 | dictVersion 校验，变更惰性重算 | M6 |

### 模块结构

```
apps/desktop/electron/services/prompt-evolution/
├── fingerprint.js          # DOMAIN_DICTIONARY / INTENT_ALIASES / extractTopics / buildFingerprint / score / findSimilarTemplates
├── fingerprint.test.js     # 14 例 + parity 断言
```

### 关键契约

- `buildFingerprint(text) → {schemaVersion, dictVersion, domains[], compositionIntents[], topics[], tone}`
- `score(inputFp, templateFp) → {score, tier}`（tier: NONE|MID|HIGH）
- `findSimilarTemplates(concept, templates, {rand}) → [{templateId, refType(full|fragment|none), score, tier, provenance}]`；NONE 时 templateId=null
- templates 入参为 active 模板列表（含 fingerprint + stats.acceptRate/lastUsedAt），调用方负责过滤 deprecated/disabled（索引在 PromptMemory 另一半实现）
- 复用词表：COMPOSITION_PATTERNS.applyWhen 8 组、SentimentAnalyzer 12 情感词（JS 副本 + parity 锁死）

### 风险与回退

- JS 副本与 TS 源漂移 → parity 测试锁死；TS 改词表时 parity 红提示同步
- 探索随机性 → rand 注入，测试确定性
- 误判参考 → 档位护栏（intent=0 强制 NONE、HIGH 需领域重叠）+ 泛化词弱档化
