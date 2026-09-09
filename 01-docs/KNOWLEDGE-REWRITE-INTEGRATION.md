# KNOWLEDGE-REWRITE-INTEGRATION — 知识库×改写引擎集成分析

> 日期：2026-09-09 | 状态：分析完成，待实施 | 关联：PR #1604 (codex/knowledge-base)

## 1. 架构全景

改写引擎有两层知识库系统：

### 1.1 用户偏好知识库（KnowledgeBase v2，已完整接线）
- packages/rewrite-engine/src/knowledge-base.js（796行）
- Ebbinghaus遗忘曲线 + RRF混合搜索 + 知识图谱 + 矛盾检测 + 隐私过滤
- ✅ 正常工作，getContextSummary()始终注入

### 1.2 爆款库+个人知识库（KnowledgeContextBuilder，已编码但未接线）
- packages/rewrite-engine/src/knowledge-context-builder.js（206行）
- 三层融合：用户偏好(始终) → 爆款库Top3(标题模式+钩子+标签) → 个人知识库Top5(按4组类别注入)
- ⚠️ 代码完整但从未被调用 —— 三条断线

## 2. 三条断线诊断

### 断线1：KnowledgeContextBuilder从未被实例化
位置：apps/desktop/electron/services/rewrite-engine.js:71-76
原因：_ensureEngine()构造RewriteEngine时没传knowledgeLibrary参数

### 断线2：_buildPrompt参数签名不匹配
位置：packages/rewrite-engine/src/rewrite-engine-core.js:204 vs :71
原因：签名4参但调用传5参，第5个被JS静默丢弃

### 断线3：前端两个入口都没有传knowledgeOptions
位置：RewriteView.vue:197-208、AiWriterPanel.vue:306-318
原因：userSettings只有platform/tone/purpose，无knowledgeOptions

## 3. 集成方案（4步）

### Step 1: DI层注入KnowledgeContextBuilder
- container.setup.js:204-209 — 工厂链路注入knowledgeLibraryService
- rewrite-engine.js — 新增setKnowledgeLibrary方法+adapter构造+注入

### Step 2: 修复_buildPrompt参数传递
- rewrite-engine-core.js:204 — 统一从userSettings.knowledgeOptions读取

### Step 3: 前端传递knowledgeOptions
- RewriteView.vue + AiWriterPanel.vue — userSettings新增knowledgeOptions字段

### Step 4: 命名对齐
- usePersonalExperience → usePersonalKnowledge（与PRD契约一致）

## 4. 三层融合优先级链
P0策略约束 > P1人设约束 > P2爆款风格 > P3用户偏好 > P4 LLM默认

## 5. 需修改文件（6个）
1. rewrite-engine.js — 新增setKnowledgeLibrary + adapter + 注入（~35行）
2. container.setup.js — 工厂链路注入（~3行）
3. rewrite-engine-core.js — 修复参数传递（~2行）
4. RewriteView.vue — 传递knowledgeOptions（~5行）
5. AiWriterPanel.vue — 传递knowledgeOptions（~5行）
6. phase1-context.test.js — 更新字段断言（~2行）
