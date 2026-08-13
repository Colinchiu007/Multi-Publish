# ARCH — 提示词引擎自进化：主题指纹与同类模板检索（P1b 规格 v3）

> 版本：v3（2026-08-13）｜状态：定稿（经 Claude + Codex 双模型评审修订，CRITICAL×3 + MAJOR×8 全部消化）
> 分支：`codex/docs-prompt-engine-evolution-fingerprint`｜关联：`01-docs/prompt-engine-evolution-design.md`（总设计 v2）
> 范围：P1b「主题指纹 + 同类检索」半区；PromptMemory 入库/门禁/状态机为 P1b 另一半，不在本文档范围

---

## 0. 评审修订记录

- C1 订正判定示例（补 alias + tone 语义）并加「示例回归测试」
- C2 重写置信档位：删 LOW 死档，intent=0 强制 NONE
- C3 英文词边界匹配 + 缩写白名单，补误判测试
- M1-M8 全部纳入（见各章节标注）

## 1. 目标

让记忆库回答「新输入主题与库中哪个模板/片段是同类」——纯本地、确定性、可测试，不依赖 embedding（P3 才上）。

## 2. 主题指纹结构（Fingerprint）

```jsonc
{
  "schemaVersion": 1,
  "dictVersion": "2026-08-13",              // 词典/算法版本，变更时缓存失效重算（M6）
  "domains": ["education", "tech"],          // 领域分类，多标签
  "compositionIntents": ["前后对比"],         // 构图意图
  "topics": ["AI", "教育"],                   // 内容标签（≤8 个）
  "tone": "positive"                         // 情感基调
}
```

来源映射：
- domains ← DOMAIN_DICTIONARY（强/弱词规则，见 §4）
- compositionIntents ← applyWhen ∪ INTENT_ALIASES（见 §5）
- topics ← extractTopics（见 §6）
- tone ← SentimentAnalyzer.analyze()（history-prompt.ts，现成）

## 3. 同类判定算法（findSimilarTemplates）

### 3.1 评分

```
score =
  + 4 × min(2, |intents 交集|)   // 构图意图核心资产，上限 2 防多意图偏置（M4）
  + 2 × min(2, |domains 交集|)   // 领域内容场景，上限 2（M4）
  + 2 × min(2, |topics 交集|)    // 精确词确认（上限 2，避免与 intent 等值高估）
  + 1 × (tone 相同且双方 ≠ peaceful)  // 情感色彩微调；默认值不虚增（M5）
```

### 3.2 置信档位（重写，删 LOW 死档，C2）

```
intent ∩ = 0                  → NONE → 回退内置 8 构图（领域/主题相似不触发构图参考）
4 ≤ score < 8（intent ≥ 1）    → MID → 只参考 fragment（composition/action/object）
score ≥ 8（intent ≥ 1）        → HIGH → 参考整条模板（full）
```

- **HIGH 护栏（M2）**：HIGH 还要求 `domains ∩ ≥ 1` 或 `topics ∩ ≥ 1`（纯 intent 重叠不触发整条参考）
- **多 HIGH tie-break**：score → acceptRate → lastUsedAt
- **探索（M7）**：`findSimilarTemplates(concept, { rand })`；探索仅限 active 模板集内重排；`activeCount < 10` 时 ε=0（库未成熟不随机探索）；探索结果同样写 provenance.learnedFrom；rand 注入保证可测
- **命中即写溯源**：GenerationEvent 写入 `optimizedBy=learnt-template`、`librarySource=learnt|full|fragment`、`templateVersion`
- **full 引用仅限 active 且过门禁 6 规则的 learnt 模板；deprecated 即使高分不得引用**

### 3.3 判定示例（订正，C1）

- 库中 T：{intents:[前后对比], domains:[education,tech], topics:[], tone:positive}
- 输入 "AI 改变教育" → 前后对比 alias 含"改变"（§5 修订）→ intents:[前后对比]；domains:[tech,education]；topics:[AI,教育]→剔除词典词后 []；tone:peaceful（无情感信号词）
- score = 4 + 2×2 + 0 + 0(peaceful 不计) = **8 → HIGH**（domains∩≥1 满足护栏）
- 示例回归测试：上述 fixture 断言 score=8 → HIGH（C1 防回归）

- 输入 "公司融资策略" → intents 无命中 → **NONE** → 回退内置（无构图意图线索不乱参考）

## 4. 领域词典（6 领域，强/弱词）＋匹配模式（C3）

```js
const DOMAIN_DICTIONARY = {
  education: { strong: ["教育","学校","课程","考试","education","study"],
               weak: ["老师","学生","学习","培训","课堂","teacher","student","learning"] },
  health:    { strong: ["医疗","医院","疾病","health","medical"],
               weak: ["健康","医生","患者","治疗","药物","clinic","doctor","patient"] },
  finance:   { strong: ["金融","投资","股票","finance","invest"],
               weak: ["理财","银行","保险","财富","基金","money","bank","stock"] },
  tech:      { strong: ["AI","人工智能","软件","算法","tech","software"],
               weak: ["科技","互联网","数据","编程","app","digital","code"] },
  business:  { strong: ["创业","融资","公司","business","startup"],
               weak: ["商业","市场","营销","品牌","管理","销售","market","brand"] },
  society:   { strong: ["政策","法律","社会","policy","law"],
               weak: ["公益","民生","城市","治理","乡村","society","public"] },
}
```

**匹配规则（C3，全词典统一匹配器）**：
- 英文词：**词边界匹配**（`\b` token 边界），大小写不敏感（`AI` 仅命中独立 token `ai/AI`，不命中 explain/detail/train）；英文词长 ≥4（缩写白名单：AI 等）
- 中文词：字符子串匹配，仅限 CJK 上下文
- 强词★：单独 1 词命中即算该领域；弱词：需命中 2 词才算
- **输入长度上限 ≤2000 字符**（超长截断，M8）；匹配器只做预编译 token 查找，**不 eval、不把用户输入拼进正则**（M8）
- 回归测试：「domain/design/maintain 不得命中 tech」「apple/happy 不得命中 app」「机器学习/深度学习 → tech 而非 education」

## 5. 构图意图别名表（INTENT_ALIASES，挂靠不改内置池）

```js
const INTENT_ALIASES = {
  "前后对比": { strong: ["改变","变化","转变","演变","迭代","取代","新老","transition"],
                weak: ["提升","优化","新旧","before","after","upgrade"] },  // 弱档需 ≥2 词命中（M1）
  "流程展示": { strong: ["步骤","阶段","链路","流水线","工作流","roadmap","process"],
                weak: ["流程","管道","规划"] },
  "概念隐喻": { strong: ["本质","原理","抽象","类比","象征","意味着","metaphor","symbol"],
                weak: ["解释","定义","概念"] },
  "角色状态": { strong: ["情绪","心态","感受","emotion","mood"],
                weak: ["体验","用户","人物"] },   // 体验/用户降为弱档（M1）
  // ...其余 4 组同构（系统局部/方法分层/地图路径/迷你漫画）
}
```

- 强档 1 词即中；弱档需 ≥2 词命中才计 intent（M1）
- **跨 intent 撞词审计（M3）**：同一词命中多组 intent 时，按「词在别名表中出现次数最少的那组」归属（稀有词优先）；实现时输出撞词表供人工复核
- **泛化词不产生 HIGH 回归测试（M1）**：「性能优化/SEO 优化/职业规划/用户增长」不得触发 HIGH

## 6. 内容标签提取（extractTopics，轻量规则）

- 输入 ≤2000 字符（M8）；空/全停用词/纯标点 → `topics=[]` 且不影响其余分量
- 中文：按标点/停用词（的/了/与/和/在/是）切分 → 2-6 字片段
- 英文：小写 → 词边界分词 → 去掉停用词（the/a/and/of/how/why）
- 保留 ≤8 个、长度 ≥2 的片段；确定性（固定切分/去重/排序）
- **剔除范围 = 强词 + 弱词全部词典词**（对称性）
- 零外部依赖（正则 + 停用词表）

## 7. 数据模型与检索索引

```jsonc
{
  "fingerprint": { "schemaVersion": 1, "dictVersion": "2026-08-13", "domains": [], "compositionIntents": [], "topics": [], "tone": "" },
  "stats": { ..., "acceptRate": 0.83 }
}
```

- 索引：library.json 内存索引（domain → active templateIds、intent → active templateIds），**仅索引 active 模板**
- 复杂度表述：`O(粗筛) + O(候选打分)`，不称 O(1)
- **状态变更钩子**：模板 active→deprecated/disabled 时重建索引；测试含「deprecated 后不再可命中」
- **缓存失效（M6）**：加载 library.json 时校验 dictVersion；不匹配则惰性重算指纹或标 stale 不参与检索
- 评分函数抽象为 `score(input, template) → {score, tier}` 可替换接口：V0.5 共现 / P3 embedding 均为新 scorer 实现

## 8. 落点与边界

- 新文件：`apps/desktop/electron/services/prompt-evolution/fingerprint.js`（buildFingerprint / findSimilarTemplates / extractTopics / DOMAIN_DICTIONARY / INTENT_ALIASES / score）+ 测试
- 复用：COMPOSITION_PATTERNS.applyWhen、SentimentAnalyzer（story2video-engine）；**集成检查点：确认 desktop 依赖闭包含 story2video-engine（QM 铁律）**
- 返回契约：`{templateId, refType(full|fragment|none), score, tier, provenance}`；NONE 时 templateId=null
- 不改变：generateCandidates 同步签名、内置池、PromptBridge 契约
- 边界：V0 只做「同词面」同类；语义相似（数据安全↔隐私保护）标注 P3 embedding 待办；测试 #2 标注「V0 临时预期，V0.5 共现上线时同步改写」

## 9. 测试用例（TDD，14 例）

| # | 用例 | 断言 |
|---|---|---|
| 1 | 示例回归（C1） | "AI 改变教育" vs education 模板 → score=8 → HIGH → full |
| 2 | 换说法不换意思（V0 临时） | "数据安全" vs "隐私保护" → NONE |
| 3 | intent=0 强制 NONE（C2） | 多领域无意图输入 → NONE（不回退 fragment） |
| 4 | 档位边界 | 恰 4 分 → MID；恰 8 分 → HIGH |
| 5 | 探索 ε（M7） | rand 注入；activeCount<10 → ε=0；探索仅在 active 集 |
| 6 | 英文词边界（C3） | domain/design/maintain 不得命中 tech；apple 不得命中 app |
| 7 | 机器学习→tech | 复合词不被 education 的"学习"拉偏 |
| 8 | 泛化词不产生 HIGH（M1） | 性能优化/SEO 优化/职业规划/用户增长 → 不触发 HIGH |
| 9 | 多领域偏置（M4） | 单领域模板 vs 多领域模板同分时无系统性偏置 |
| 10 | 仅 tone 命中（M5） | tone 相同但 peaceful → 不计分 → NONE |
| 11 | 缓存陈旧（M6） | dictVersion 变更后旧缓存指纹重算 |
| 12 | 索引失效（M4） | deprecated 模板不再可命中 |
| 13 | topics 提取 | 中英混合/空/全停用词/超长 → 确定性、≤8、领域词剔除 |
| 14 | 回退 | 全不命中 → 内置 COMPOSITION_PATTERNS 全集（行为不变） |
