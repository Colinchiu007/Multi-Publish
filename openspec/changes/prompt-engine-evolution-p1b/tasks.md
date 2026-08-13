# Tasks — prompt-engine-evolution-p1b

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [x] 基线差异审计：规格 v3 已合入 main（ARCH-FINGERPRINT-2026-08-13），本 change 只承载实现；P0 specs 已归档（prompt-engine-evolution）
- [x] OpenSpec change 创建：proposal → design → specs → tasks 并 validate 通过

## 实现（codex/prompt-engine-evolution-p1b 分支）

### 任务 1：fingerprint.js 核心（TDD）
- [x] `fingerprint.js`：DOMAIN_DICTIONARY + INTENT_ALIASES + extractTopics + buildFingerprint + score + findSimilarTemplates（M1 泛化词抑制、C3 词边界 split 实现）✅ 16 测试全绿
- 测试目标：`fingerprint.test.js` 14 例（示例回归/换说法 NONE/intent=0 NONE/档位边界/探索 ε/英文词边界/机器学习→tech/泛化词不 HIGH/多领域偏置/仅 tone/缓存陈旧/索引失效/topics 提取/回退）

### 任务 2：parity 一致性
- [x] parity 测试：applyWhen 8 组 + SentimentAnalyzer 词逐字一致 ✅
- 测试目标：fingerprint.test.js 内 parity 断言

### 任务 3：文档与门禁
- [ ] CHANGELOG、`.quality-gates.md` 自检记录、tasks.md 全部勾选
- [x] 双模型审查（Codex 9 MAJOR 全部修复 + 主代理复核；Claude 后端瞬态不可用按降级）
- [ ] 提交/推送/PR/合并；OpenSpec archive + CCG task 归档三同步
