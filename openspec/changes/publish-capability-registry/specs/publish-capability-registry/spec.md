# publish-capability-registry (delta: publish-capability-registry)

## ADDED Requirements

### Requirement: 发布能力注册表单一真源

平台发布能力元数据（titleMode、内容限制、平台特有字段定义、通用字段支持矩阵）SHALL 由 `packages/shared-utils` 的 `publish-capabilities.js`（CJS）与 `publish-capabilities.browser.js`（ESM）单一持有；两版本导出 MUST 同名同构（导出完整性测试锁定）。渲染层 `publish-contract.js` 的平台内容限制 MUST 从注册表派生，MUST NOT 再维护独立限制常量表。注册表 MUST 覆盖全部 15 个支持平台，MUST 全量收录已知发布能力（含 UI 未暴露项，以 `uiExposed: false` 标记）。

#### Scenario: 15 平台元数据全覆盖
- **WHEN** 查询任一支持平台（wechat_mp/zhihu/weibo/douyin/xiaohongshu/tencent_video/kuaishou/toutiao/bilibili/baijiahao/youtube/tiktok/twitter/instagram/facebook）的发布元数据
- **THEN** 返回该平台的 titleMode（`title` 或 `caption`）与内容限制（titleMax/titleMaxBytes/contentMax），无平台回落到未定义默认值

#### Scenario: 双版本导出同步
- **WHEN** 对比 CJS 与 ESM 两个版本的导出名集合
- **THEN** 完全一致；任一侧新增导出未同步另一侧时导出完整性测试变红

### Requirement: 通用内容 3+ 平台阈值分类

注册表 SHALL 按**语义能力**（semantic 键）跨平台聚合计数并计算分类：`≥3` 平台共有 → 通用（common）；`=2` → 半共有（semi-common）；`=1` → 独有（unique）。分类 MUST 为计算属性（新增平台/字段时阈值自动生效），MUST NOT 手写标签。字段名不同但语义相同的能力（如 YouTube `privacy` 与 TikTok `privacyLevel` 同属 `visibility`）MUST 归入同一 semantic 计数。

#### Scenario: 合集语义 3 平台 → 通用
- **WHEN** 计算 `collection` 语义（bilibili collectionId / youtube playlistId / baijiahao collection）的支持计数
- **THEN** count=3，分类为 common

#### Scenario: 可见性语义 2 平台 → 半共有
- **WHEN** 计算 `visibility` 语义（youtube privacy / tiktok privacyLevel）的支持计数
- **THEN** count=2，分类为 semiCommon

#### Scenario: 摘要语义 1 平台 → 独有
- **WHEN** 计算 `digest` 语义（仅 wechat_mp）的支持计数
- **THEN** count=1，分类为 unique

### Requirement: 无标题平台标题插入描述首行

注册表 SHALL 声明无标题平台清单（titleMode=`caption`）：tencent_video、kuaishou、weibo、twitter、instagram、tiktok（共 6 个）。对这些平台，发布链路 MUST 把发布页填写的标题文本作为正文/描述的**首行**插入（`[title, content].filter(Boolean).join('\n')`），合并结果超过平台 contentMax 时按 contentMax 截断且标题优先存活。有标题项的平台（titleMode=`title`）MUST NOT 做此合并。

#### Scenario: 视频号 API 链标题不再丢弃
- **WHEN** 视频号发布任务同时携带 title 与 content
- **THEN** post_create 请求体的 description 以标题为首行、正文随后；仅携带 title 时 description 即标题

#### Scenario: 有标题平台不合并
- **WHEN** bilibili/youtube 等有标题平台发布任务同时携带 title 与 content
- **THEN** title 与 content 分别进入平台各自的标题/描述字段，互不合并

#### Scenario: DOM RPA 无标题平台显式跳过标题框解析
- **WHEN** DOM RPA 对注册表无标题平台发布且携带标题
- **THEN** 不再尝试解析 title_input 选择器（省去首次候选 10s 超时），标题经编辑器合并路径写入描述

### Requirement: 跨包无标题契约锁

`packages/api-publish-engine` 的测试 MUST require 注册表源文件（测试依赖，不构成运行时依赖）并断言：注册表无标题清单内的每个具备引擎发布路径的平台，其链/适配器实际执行标题合并；清单外平台不合并。从清单移除任一平台或移除任一链的合并逻辑时，契约测试 MUST 变红。

#### Scenario: 清单与引擎行为一致
- **WHEN** 运行 no-title 契约测试
- **THEN** kuaishou（既有合并）、tencent_video/twitter/weibo/tiktok（修复后合并）全部通过；有标题平台（如 bilibili）的链不合并标题

#### Scenario: 反证——清单缩水即红
- **WHEN** 从注册表无标题清单移除 tencent_video（模拟清单漂移）
- **THEN** 契约测试失败（引擎仍合并但清单不认，或反之）

### Requirement: 发布页通用/差异化 UI 数据驱动

发布页（视频与图文两个分支）SHALL 以注册表为数据源渲染：通用字段区标注各字段支持平台数；差异化内容区（PlatformOverridePanel）按已选平台渲染注册表声明的平台特有字段（text/textarea/select/checkbox/tags/collection 类型），MUST NOT 再按平台 id 硬编码 v-if 分支。选中无标题平台时，标题输入区 MUST 显示「标题将作为描述首行」提示及涉及平台名。新增用户可见文案 MUST 写入 locales（zh/en 成对）。

#### Scenario: 差异化面板数据驱动
- **WHEN** 已选平台包含 zhihu/bilibili/youtube 并展开差异化面板
- **THEN** 各平台字段（知乎创作声明、B站分区、YouTube 可见性等）由注册表字段定义渲染；组件源码中不存在 `platform.id === 'zhihu'` 式硬编码分支

#### Scenario: 无标题平台标题提示
- **WHEN** 已选平台包含视频号（或其余 5 个无标题平台之一）
- **THEN** 标题输入区显示合并行为提示；仅选有标题平台时不显示

#### Scenario: 通用字段支持度标注
- **WHEN** 渲染通用字段区
- **THEN** 各字段显示「N/15 平台支持」徽标；无标题平台对 title 字段计入「合并入描述」口径
