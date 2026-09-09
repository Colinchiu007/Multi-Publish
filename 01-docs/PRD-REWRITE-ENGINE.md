# 改写引擎（Rewrite Engine）— 产品需求文档

> 立项日期: 2026-09-08 | 状态: Phase 3 桌面端完成（全链路贯通） | 复杂度: L | 风险: 中

## 一、产品概述

改写引擎是一套专业文案改写机制和模型，为内容生产者提供：

1. 爆款级文案生成：通过多套专业改写策略生成有传播力的文案
2. 去 AI 味：通过多层机制规避机器感，增加真人感
3. 自我进化：结合用户个人知识库，越用越懂用户
4. 多模式支持：抄袭规避模仿、扩写爆款、选题创作
5. 运营中心管理：策略可在运营中心配置和迭代

## 二、系统架构

核心模块：桌面端前端(Vue3) + 运营中心前端(Vue3) + 改写引擎服务层 + LLM推理层

数据流：用户输入 -> 模式选择 -> 策略匹配 -> Prompt构建 -> 敏感词检测 -> LLM推理 -> 去AI味后处理 -> 返回结果 -> 用户反馈 -> 更新知识库

## 三、改写策略系统（已实现）

### 3.1 策略数据模型

策略在 `ops-center/backend/models.py` 中定义为 `RewriteStrategy` 模型（表名 `rewrite_strategies`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(100) PK | 策略唯一标识，如 `strategy-viral-storytelling` |
| name | String(200) | 策略名称 |
| description | Text | 策略描述 |
| version | String(20) | 版本号，默认 `1.0.0` |
| category | String(40) | 分类：viral/marketing/platform/style |
| industry | Text(JSON) | 适用行业列表，如 `["ecommerce","education"]` |
| purpose | Text(JSON) | 目的列表，如 `["engagement","conversion"]` |
| tone | Text(JSON) | 语言风格列表，如 `["casual","storytelling"]` |
| platforms | Text(JSON) | 适用平台列表，如 `["douyin","wechat_mp"]` |
| system_prompt | Text | 系统提示词 |
| user_prompt_template | Text | 用户提示词模板，支持 `{content}` `{knowledgeContext}` 占位符 |
| post_process_config | Text(JSON) | 后处理配置，如 `{"removeAITaste":true,"sensitiveCheck":true,"maxLength":2000}` |
| extra_metadata | Text(JSON) | 扩展元数据 |
| enabled | Integer | 0/1 启用状态 |
| sort_order | Integer | 排序权重 |
| deleted_at | String | 软删除时间戳 |
| created_at / updated_at / updated_by | String | 审计字段 |

### 3.2 内置种子策略（5 套）

| 策略 ID | 名称 | 分类 | 适用行业 | 平台 |
|---------|------|------|---------|------|
| strategy-viral-storytelling | 故事化爆款策略 | viral | general/ip-building/lifestyle | 抖音/小红书/公众号 |
| strategy-ecommerce-convert | 电商转化策略 | marketing | ecommerce/retail | 抖音/小红书/公众号 |
| strategy-douyin-viral | 抖音爆款口播策略 | platform | general/entertainment | 抖音 |
| strategy-xiaohongshu-cz | 小红书种草策略 | platform | ecommerce/lifestyle/beauty | 小红书 |
| strategy-knowledge-dry | 干货知识策略 | viral | education/technology/finance | 公众号/B站/知乎 |

### 3.3 运营中心后端 API

**路由前缀**：`/api/v1/rewrite-strategies`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | 登录用户 | 列表所有策略（含软删除过滤） |
| GET | `/runtime` | 无认证 | 运行时下发（仅启用+未删除） |
| POST | `/` | 管理员 | 创建策略 |
| PUT | `/{strategy_id}` | 管理员 | 更新策略 |
| DELETE | `/{strategy_id}` | 管理员 | 软删除策略 |
| POST | `/{strategy_id}/toggle` | 管理员 | 启用/禁用策略 |

**数据校验规则**（`validate_strategy`）：
- id：`^[a-z0-9_-]{1,100}$`，必填
- name：1-200 字符，必填
- description：≤2000 字符
- category：必须是 viral/marketing/platform/style 之一
- industry/purpose/tone/platforms：字符串数组，每项 ≤200 字符，最多 50 项
- systemPrompt：1-5000 字符，必填
- userPromptTemplate：1-10000 字符，必填
- postProcess：JSON 对象
- sort_order：非负整数
- enabled：布尔值/0/1

**种子机制**：`ensure_rewrite_strategies_seeded()` 在 OpsCenter lifespan 启动时执行，对已存在的策略跳过（不覆盖运营修改），仅补齐缺失种子。

**软删除**：`delete_rewrite_strategy` 仅设置 `deleted_at` + 禁用，不物理删除。创建时若同名 ID 已软删，则恢复并应用新数据。

### 3.4 运营中心前端

**文件**：`ops-center/frontend/src/views/RewriteStrategies.vue`

**功能**：
- 策略列表表格（ID/名称/分类/行业/平台/内置标记/启用开关/操作）
- 分类过滤（全部/viral/marketing/platform/style）
- 新增/编辑弹窗表单（所有字段可编辑）
- 启用/禁用开关（即时切换）
- 软删除（确认弹窗）
- 表单校验（ID 格式、必填字段）

**菜单注册**：`config/menuItems.js` 中添加 `{ path: '/rewrite-strategies', label: '改写策略管理', icon: Edit }`

**路由**：`/rewrite-strategies` → `RewriteStrategies.vue`（需认证）

### 3.5 改写引擎核心包（已实现）

`packages/rewrite-engine/` 包含 7 个模块，25 个测试全部通过：

| 模块 | 文件 | 功能 |
|------|------|------|
| StrategyManager | `src/strategy-manager.js` | 5 套内置策略 + 远程策略合并 |
| StrategyMatcher | `src/strategy-matcher.js` | 5 维度加权匹配算法（行业30%+目的25%+平台20%+风格15%+历史10%） |
| AITasteRemover | `src/ai-taste-remover.js` | 去 AI 味后处理（短语替换+句式随机化+口语化） |
| KnowledgeBase | `src/knowledge-base.js` | LLM Wiki 理论用户知识库 |
| SensitiveFilter | `src/sensitive-filter.js` | 敏感词检测 |
| RewriteEngine | `src/rewrite-engine-core.js` | 核心编排（校验→匹配→构建→后处理） |

## 三_BACKUP、改写策略系统

策略是独立配置单元，核心字段：id/name/description/category/industry/purpose/tone/platforms/systemPrompt/userPromptTemplate/postProcess

策略分类：viral(爆款)/marketing(营销)/platform(平台适配)/style(风格)

策略匹配算法维度权重：行业30% + 目的25% + 平台20% + 风格15% + 历史评分10%

## 四、用户知识库

参考 LLM Wiki (Karpathy) 和 LLM Wiki V2 理论。知识库本地存储，包含用户偏好、风格指纹、历史成功案例、反馈日志。隐私优先，不上传云端。

## 五、改写模式

模式一(抄袭规避模仿)：结构重组+同义替换+句式变换+案例替换+数据重述+多策略叠加
模式二(扩写爆款)：主题发散+层次深化+钩子设计+长度控制+信息密度
模式三(选题创作)：选题分析->大纲生成->分段创作->整体润色->爆款要素注入

## 六、敏感词与合规

复用运营中心现有敏感词机制+增强前后置检测+Prompt层合规约束+改写日志

## 七、去 AI 味机制

分层：Prompt层(禁止AI套路)+后处理层(替换AI味短语+句式随机化)+知识库层(个性化)

## 八、运营中心管理

新增改写策略模块：CRUD/启用禁用/使用统计/策略下发

## 九、前端交互设计

### 9.1 桌面端改写面板（AiWriterPanel.vue 改写模式）

**入口**：发布页（Publish.vue）的「🤖 AI 辅助写作」按钮 → 面板内第四个 tab「🔄 AI 改写」

**布局**：面板宽度跟随现有 AiWriterPanel 容器（约 360px），内容垂直排列，各表单项间距 8px。

**交互流程**：

```
打开面板 → 选择改写模式 → 设置行业/目的/风格/平台/长度 →
选择策略(自动匹配/手动选择) → 输入或确认文案 →
点击"开始改写" → 等待 LLM 返回 → 展示结果+元数据 →
点击"应用"将结果填入正文编辑器
```

**表单字段**：

| 字段 | 控件类型 | 默认值 | 说明 |
|------|---------|--------|------|
| 改写模式 | 3 个 chip 按钮 | imitate | 抄袭规避模仿 / 扩写爆款 / 选题创作 |
| 行业 | select 下拉 | 通用 | 9 个选项：电商/教育/科技/金融/生活方式/美妆/娱乐/IP打造 |
| 目的 | select 下拉 | 通用 | 6 个选项：提升互动/提升转化/涨粉/建立权威/带货销售 |
| 语言风格 | select 下拉 | 通用 | 7 个选项：口语化/故事化/情感化/说服力/幽默/正式严谨 |
| 目标平台 | select 下拉 | 通用 | 6 个选项：抖音/小红书/公众号/B站/知乎 |
| 长度 | select 下拉 | 中（约1000字） | 短(500)/中(1000)/长(2000) |
| 策略选择 | radio + select | 自动匹配 | 自动匹配（推荐）/ 手动选择（下拉列出所有策略） |
| 输入文案 | textarea | 继承原文内容 | 至少 20 字，最多 6000 字 |

**结果展示**：

- 改写结果以可点击的 result-item 展示，点击「应用」触发 `apply-content` 事件，将结果填入编辑器
- 结果下方显示元数据行：策略名称 · AI味等级（百分比） · 原文 X 字 → 结果 Y 字
- 敏感词警告以 panel-error 显示

**错误处理**：

- 未配置 LLM：显示"需要配置 LLM API Key"
- 登录未完成：弹出登录窗口
- 改写失败：显示错误信息（敏感词/LLM调用失败/网络错误等）
- 策略列表加载失败：静默处理，仍可用自动匹配模式

**i18n 覆盖**：新增 `rewriteEngine.*` 命名空间，zh/en 共 56 个新 key，成对完整。

### 9.2 数据流

```
Vue 组件 (AiWriterPanel.vue)
  ↓ aiRewrite(params) / aiListRewriteStrategies() / aiGetRecommendedStrategies()
  ↓ 前端 API 层 (src/api/publisher.js)
  ↓ invoke("aiRewite") / invoke("aiListRewriteStrategies") ...
  ↓ preload (system.js) → ipcRenderer.invoke('ai:rewrite', ...)
  ↓ IPC Handler (electron/ipc-handlers/ai.js)
  ↓ RewriteEngineService (electron/services/rewrite-engine.js)
  ↓ @multi-publish/rewrite-engine (packages/rewrite-engine/)
  ↓ aiGenerator.generateWithDefault('llm') → LLM Provider
```

## 十、实施计划与进度

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础架构（核心包） | ✅ 完成 |
| Phase 2 | 策略系统（后端 + 运营中心前端） | ✅ 完成 |
| Phase 3 | 改写模式（桌面端 Electron 接入 + 前端面板） | ✅ 完成 |
| Phase 4 | 增强机制（敏感词/去AI味/知识库） | ✅ 完成 |
| Phase 5 | 前端（AiWriterPanel 改写 tab） | ✅ 完成 |
| Phase 6 | 测试与交付（PR/CI/合并） | 🔄 进行中 |

### 11.1 测试覆盖

| 层 | 测试 | 结果 |
|----|------|------|
| rewrite-engine 核心包 | 25/25 | ✅ |
| ops-center 后端 | 320/323（修复后 322/322） | ✅ |
| 桌面端 ai IPC | 10/10 | ✅ |
| 桌面端 rewrite-strategy-manager | 8/8 | ✅ |
| 桌面端 template-manager | 18/18 | ✅ |
| 桌面端 AiWriterPanel | 17/17（含 6 个改写模式用例） | ✅ |

### 11.2 关键文件索引

| 文件 | 用途 |
|------|------|
| `packages/rewrite-engine/src/rewrite-engine-core.js` | 核心引擎（三种模式 `_getModeInstructions` :210-242） |
| `packages/rewrite-engine/src/strategy-manager.js` | 内置策略 + mergeRemote |
| `packages/rewrite-engine/src/strategy-matcher.js` | 5 维度加权匹配 |
| `packages/rewrite-engine/src/ai-taste-remover.js` | 去 AI 味后处理 |
| `packages/rewrite-engine/src/knowledge-base.js` | LLM Wiki 用户知识库 |
| `packages/rewrite-engine/src/sensitive-filter.js` | 敏感词检测 |
| `apps/desktop/electron/services/rewrite-engine.js` | 桥接 service（aiGenerator 网关） |
| `apps/desktop/electron/services/rewrite-strategy-manager.js` | 远程策略持久化 + applyRemote |
| `apps/desktop/electron/ipc-handlers/ai.js` | IPC handler（`ai:rewrite` 等） |
| `apps/desktop/electron/preload/system.js` | preload 暴露（:229-231） |
| `apps/desktop/src/api/publisher.js` | 前端 API（:25-32） |
| `apps/desktop/src/components/AiWriterPanel.vue` | 改写模式 tab（Phase 3 新增） |
| `apps/desktop/src/locales/zh.js` / `en.js` | i18n（`rewriteEngine.*` 命名空间） |
| `ops-center/backend/services/rewrite_strategy_service.py` | 策略 CRUD + 种子 |
| `ops-center/backend/services/runtime_service.py` | bootstrap 并入 rewrite_strategies |
| `ops-center/backend/routers/rewrite_strategies.py` | 策略 API 路由 |
| `ops-center/frontend/src/views/RewriteStrategies.vue` | 运营中心策略管理页 |

## 十二、改写引擎 v2 升级（2026-09-09）

### 12.1 升级概述

本次升级对改写引擎的 5 个核心模块进行了全面重构：

| 模块 | v1 → v2 | 主要变更 |
|------|---------|---------|
| ai-taste-remover.js | 191行→879行 | 3-pass引擎+S1/S2/S3分级+句长方差+反注入护栏+人类基线保护 |
| knowledge-base.js | 276行→795行 | Ebbinghaus遗忘曲线+RRF混合搜索+知识图谱+矛盾检测+隐私过滤 |
| sensitive-filter.js | 76行→533行 | DFA自动机+6层词库分层+变体归一化+白名单+热更新 |
| strategy-manager.js | 156行→350行 | few-shot/CoT+导出导入+自定义策略+部分更新+metadata扩展 |
| rewrite-quality-evaluator.js | NEW(425行) | SimHash 64位指纹+海明距离判重+三维评分 |

### 12.2 去AI味引擎 v2

**3-pass处理流水线：** Pass1杀AI词汇(117条映射S1/S2/S3分级) → Pass2破AI结构(22种模式) → Pass3加人类质感(句长变化+口语化)。反注入护栏：改写后detect计数>原文时自动回滚。人类基线保护：人工高频用词(此外/然而/首先)密度≥3才替换。

### 12.3 用户知识库 v2

Ebbinghaus遗忘曲线 + RRF混合搜索 + 知识图谱(8种关系DFS) + 矛盾检测(bigram Jaccard>0.7) + 隐私过滤(12条正则) + 生命周期管理 + 质量评分。

### 12.4 敏感词过滤器 v2

DFA自动机O(n)+最长匹配、6层词库分层、变体归一化(全角→半角/繁→简/特殊字符→标准/重复字符去重)、词级+上下文白名单、增量热更新。

### 12.5 策略管理器 v2

新增数据结构：fewShot/chainOfThought/genre/metadata。新增方法：exportStrategy/importStrategy/addCustom/update/remove/toggle。

### 12.6 改写质量评估器

SimHash 64位指纹+海明距离判重(<3近似重复/>6充分改写)。三维评分：充分度/语义保持度/原创性。综合pass/warn/fail判定+改进建议。

### 12.7 集成变更

- rewrite-engine-core.js新增qualityEvaluator参数
- index.js新增导出RewriteQualityEvaluator/SimHash/computeSimHash/hammingDistance
- rewrite返回结果新增quality字段

### 12.8 深度分析文档

| 文档 | 内容 |
|------|------|
| DEEP-ANALYSIS-AI-TASTE.md | 4个去AI味开源项目深析+v1引擎14维差距+P0-P5方案 |
| DEEP-ANALYSIS-KNOWLEDGE-BASE.md | mem0/letta/LLM-Wiki-V2三源码深析+Node移植方案 |
| DEEP-ANALYSIS-SENSITIVE-DEDUP.md | houbb/sensitive-word+SimHash源码深析 |

### 12.9 测试结果

| 测试文件 | 数量 | 结果 |
|---------|------|------|
| ai-taste-remover.test.js | 6 | PASS |
| knowledge-base.test.js | 6 | PASS |
| strategy-manager.test.js | 7 | PASS |
| strategy-matcher.test.js | 6 | PASS |
| **总计** | **25** | **全部通过** |

## 十三、内容质量评估机制（Python 端 v1，2026-09-08）

> 本文档补充章节：改写产出的内容质量自动化评估机制。完整说明见
> [DOC-CONTENT-QUALITY-EVAL-MECHANISM.md](./DOC-CONTENT-QUALITY-EVAL-MECHANISM.md)，
> 架构设计见 [ARCH-CONTENT-QUALITY-EVAL-2026-09-08.md](./ARCH-CONTENT-QUALITY-EVAL-2026-09-08.md)，
> 运营中心 PRD 见 ops-center/docs/PRD.md §12A.24。

### 13.1 目标与原则

改写引擎产出内容后，需要一个量化、自动化、可迭代的质量评估机制，解决：

1. 无量化标准：改写质量依赖人工主观判断，无法规模化
2. 无持续优化抓手：不知道具体哪个维度弱，改什么、改多少
3. AI 味不可见：改写内容是否像机器写的，没有量化指标
4. 合规风险盲区：敏感内容是否被改写消除，没有自动化检测
5. 克隆效果不可测：克隆模式下与原文的差异性，没有量化度量

**设计原则**：纯启发式 NLP 评分（仅依赖 Python 标准库 re/math/collections），
不调用外部 LLM，保证评估本身零成本、零延迟、可离线运行，可在 CI 与本地复现。

### 13.2 15 维度与权重

每个维度 0-100 分，加权综合为总分 0-100 分：

| 维度 ID | 中文名 | 权重 | 核心算法 |
|---------|--------|------|---------|
| viral_potential | 爆款潜力 | 12% | 标题长度/问叹号、前500字数据引用、热点词、内容长度、开头悬念 |
| logic | 逻辑性 | 10% | 句子/段落数、因果词、转折词、平均句长 |
| engagement | 趣味性 | 8% | 案例标记、人称对话感、长短句节奏、互动问句 |
| human_likeness | 去AI味 | 10% | AI模板词扣分、口语化加分、个性化标点、人称交互 |
| compliance | 违规风险 | 10% | 8 类敏感词正则检测扣分 |
| readability | 易读性 | 10% | 平均句长、常用字覆盖率、段落长度 |
| clone_divergence | 克隆差异度 | 6% | 与原文字符集 Jaccard、长度比 |
| information_density | 信息密度 | 6% | 数据/术语密度、虚词占比 |
| emotional_resonance | 情感共鸣 | 6% | 正/负面情感词统计 |
| structure | 结构完整性 | 6% | 开头/结尾/过渡/分点列表 |
| originality | 原创性 | 4% | 个人观点标记、新概念词、陈词滥调扣分 |
| platform_fitness | 平台适配 | 4% | 平台关键词命中、平台风格特化 |
| keyword_density | 关键词密度 | 3% | bigram 频率与分布 |
| call_to_action | CTA | 3% | CTA 句式统计 |
| brand_consistency | 品牌一致性 | 2% | 正式/口语语气一致性 |

### 13.3 评分等级与质量标准

| 综合分 | 等级 | 说明 |
|--------|------|------|
| >=90 | A+ | 优秀，适合直接发布 |
| 80-89 | A | 良好 |
| 70-79 | B | 一般，基本达标 |
| 60-69 | C | 较差 |
| <60 | D | 差，建议重新改写 |

**质量标准**（P0）：

- 达标线：最近 100 篇改写结果平均分 >=70（B 级）
- 优秀线：最近 100 篇平均分 >=80（A 级）
- 单篇及格线：单篇综合分 >=60
- 持续优化触发：平均值低于 70 时，分析短板维度（如去AI味、逻辑性、趣味性），
  针对性优化改写引擎提示词与策略，迭代直到达标

### 13.4 数据流与集成点

改写请求 → AggregationService.rewrite()（packages/python-backend/.../aggregation/service.py）
→ RewriteProcessor（content-aggregator-shared shared/rewriters/rewriter.py）
→ 改写结果 → ContentQualityEvaluator.evaluate(rewritten, original, platform)
→ QualityReport（15 维度 + 总分 + 等级 + 建议）
→ RewriteResult.quality_report 返回给调用方
→ 运营中心 POST /api/v1/quality-eval/evaluate 落库 quality_eval_records
→ 运营中心 GET /api/v1/quality-eval/stats 统计最近 100 篇平均值

**降级策略**：评估异常仅记录 warning 日志，不影响改写主流程返回。

### 13.5 运营中心功能

**前端页面**：ops-center/frontend/src/views/ContentQualityEval.vue

| 功能 | 说明 |
|------|------|
| 单篇评估 | 输入正文（可选原文/标题/平台），点击评估，展示 15 维度评分雷达与总分、等级、建议 |
| 最近 100 篇统计 | 展示最近测试的 100 篇改写结果的平均分、等级分布、短板维度排行 |
| 记录查询 | 分页查看历史评估记录与明细 |

**后端 API**（路由前缀 /api/v1/quality-eval，需管理员认证）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /evaluate | 单篇评估并落库 |
| GET | /records?limit=N | 最近 N 条评估记录 |
| GET | /stats?limit=100 | 最近 N 篇平均分/等级分布统计 |

**数据存储**：SQLite 表 quality_eval_records，字段包含 content/original_content/title/platform/style、
overall_score/grade 及各维度分数字段、created_at。

### 13.6 校验与测试

- 单篇内容 <20 字：返回 400「内容过短」
- 未登录：返回 401
- 无 LLM API Key：改写接口返回 400 友好中文提示（评估接口本身不依赖 LLM，可独立使用）
- 回归测试：ops-center/backend/tests/test_quality_eval_api.py（导入路径修复、评估/统计/记录全链路、短内容 400、未认证 401）
