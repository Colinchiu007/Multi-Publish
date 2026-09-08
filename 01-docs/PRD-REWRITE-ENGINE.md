# 改写引擎（Rewrite Engine）— 产品需求文档

> 立项日期: 2026-09-08 | 状态: Phase 2 后端完成 + 运营中心前端完成 | 复杂度: L | 风险: 中

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

面板：模式选择+策略选择(自动匹配/手动)+用户设置(行业/目的/风格/平台/长度)+输入框+改写按钮+结果展示+反馈

## 十、实施计划

Phase 1: 基础架构 4d | Phase 2: 策略系统 6d | Phase 3: 改写模式 3.5d | Phase 4: 增强机制 4.5d | Phase 5: 前端 3d | Phase 6: 测试与交付 3d
