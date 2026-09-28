# desktop Specification

## Purpose
TBD - created by archiving change merge-publish-types. Update Purpose after archive.
## Requirements
### Requirement: 发布类型入口合并

新建发布类型选择弹窗 SHALL 提供且仅提供 2 个类型入口：视频发布（video）与图文文章发布（article）。图文发布（image）、文章发布（article）、公众号（wechat）三个历史入口 SHALL 合并为统一的"图文文章发布"入口。

#### Scenario: 类型选择弹窗展示 2 个入口

- **WHEN** 用户从发布历史页点击"新建发布"
- **THEN** 类型选择弹窗显示 2 张卡片：视频发布、图文文章发布
- **AND** 图文文章发布卡片展示合并后支持平台集合（原图文与文章入口平台列表的并集）

#### Scenario: 合并入口的平台集合

- **WHEN** 渲染图文文章发布卡片的平台图标列表
- **THEN** 平台集合包含原 image 与 article 入口 id 列表的并集（去重）

#### Scenario: 旧类型链接向后兼容

- **WHEN** 用户通过旧链接进入编辑页（`/publish?type=image` 或 `/publish?type=wechat`）
- **THEN** 页面正常渲染图文文章编辑器（activeMode=article）
- **AND** 标题栏类型标签显示"图文文章发布"，不显示空值或原始 query 值

#### Scenario: 视频入口行为不变

- **WHEN** 用户选择视频发布入口
- **THEN** 进入视频编辑器（activeMode=video），行为与合并前完全一致

### Requirement: 模式卡片数据模型与提取

新表 viral_pattern_cards SHALL 与 viral_library 一对一存储结构化模式（hook_type/emotion_curve/narrative_structure/cta_style 枚举、golden_quotes 最多3句、title_formula 占位符公式、schema_version），入库即建 pending 行，存量迁移回填；PatternExtractionService SHALL 以有界并发队列后台提取（attempts 上限 3，失败降级浅层特征），触发时机为启动后延迟 + 入库后 + 每小时巡检。

#### Scenario: 入库自动建卡

- **WHEN** 手动或采集方式添加爆款条目
- **THEN** 自动创建 status=pending 的模式卡片行

#### Scenario: 提取失败降级

- **WHEN** LLM 提取连续失败 3 次
- **THEN** 卡片 status=failed，改写注入回退浅层特征，不阻塞入库与改写

### Requirement: 采集页改写切换 Node 引擎

Collection.vue 的全部改写调用 SHALL 从 aggregation:rewrite（Python）切换为 ai:rewrite（Node 引擎），style/length 做枚举映射；改写面板新增「结合爆款库/结合个人经历」复选框，爆款库默认勾选；HotTopics 创作模式 SHALL 默认开启结合爆款库。

#### Scenario: 采集后改写享受知识注入

- **WHEN** 用户采集内容后点击改写且「结合爆款库」勾选
- **THEN** 改写走 Node 引擎，爆款库检索结果注入 prompt

### Requirement: 改写历史持久化与发布关联

新表 rewrite_history SHALL 持久化每次 ai:rewrite 成功结果（原文摘要/改写内容/knowledge_refs/matched_keywords）；响应新增 rewriteHistoryId；发布入口 SHALL 显式携带 rewriteHistoryId，publish_history 加列存储；写失败仅记日志不阻塞改写。

#### Scenario: 发布关联改写

- **WHEN** 发布携带 rewriteHistoryId 的任务成功
- **THEN** publish_history 记录与 rewrite_history 行关联

### Requirement: 表现数据回采与归因

发布成功 SHALL 登记 tracked_content（有 postId 或内容 URL → pending，否则 untrackable）；PerformanceRecrawlService SHALL 按启动+每日节奏对 7 天内内容按 +1h/+6h/+24h/+72h/+7d 采样回采，指标写入 performance_snapshot（auto/manual 同表）；平台指标解析器 SHALL 为注册表架构（第一批 zhihu/baijiahao/kuaishou/bilibili，未支持平台 unsupported）；pattern_performance SHALL 由快照⋈关联链纯重算四维模式效果。

#### Scenario: 自动回采采样

- **WHEN** 发布后 1 小时应用运行中
- **THEN** 回采服务对该内容执行第一次指标采集并写入快照

#### Scenario: 未支持平台兜底

- **WHEN** 内容发布至未支持自动回采的平台
- **THEN** 状态为 unsupported，UI 提供手动录入入口

### Requirement: 采集时互动指标提取

url-collector 页面解析 SHALL 接入平台指标解析器注册表，采集爆款内容页时提取互动指标并映射至 viral_library 的 likes/collections/comments；未支持平台沿用手动填写。

#### Scenario: 采集修复互动数据

- **WHEN** 采集第一批支持平台的爆款内容并加入爆款库
- **THEN** 该条目的互动数非零（页面可解析时）

### Requirement: 效果洞察与表现 UI

发布历史页 SHALL 展示表现快照最新值并支持刷新与手动录入；效果洞察页（/performance-insights）SHALL 按四维模式 × 平台展示效果排行，sample_count < 3 标注样本不足，支持手动重算归因。

#### Scenario: 模式效果排行

- **WHEN** 用户打开效果洞察页
- **THEN** 展示钩子/情绪/叙事/CTA 四维效果排行，样本不足的维度标注提示


### Requirement: 账号会话凭证恢复模块边界

主进程中「把已保存凭证注入 Electron session / webContents」与「读取账号 session 分区 Cookie」的实现 SHALL 位于独立模块 `apps/desktop/electron/publishers/account-session-restore.js`，而不是 `account-manager.js`。`account-manager.js` MUST 通过该模块消费这些能力，且 MUST 保持其对外导出名与调用签名不变（IPC 合同面零变化）。

该边界为**单向依赖**：`account-session-restore.js` MUST NOT `require` `account-manager.js`（CJS 循环 require 会返回半初始化导出对象，表现为仅在加载顺序变化时偶发的 `is not a function`）。当被拆出的实现需要 `account-manager` 侧的私有校验（`isSafePathSegment`）时，MUST 由调用处在调用点注入，MUST NOT 由被拆模块自行 require 或复制一份实现。

#### Scenario: 会话恢复逻辑住在独立模块且不成环

- **WHEN** 检索 `apps/desktop/electron/publishers/account-session-restore.js` 的 require 列表
- **THEN** 其中不含 `./account-manager`；`account-manager.js` 中不再定义 `restoreCookies`、`restoreLocalStorage`、`buildLocalStorageRestoreScript`、`_electronSession`、`getAccountPartitionCookies`、`mergeCookies` 这 6 个函数，而是从该模块引入

#### Scenario: 公开面与签名保持

- **WHEN** 既有调用方（`openSavedAccount`、`checkLoginStatus`、IPC `account:*` 链路）以原签名调用 `restoreCookies(session, cookies, baseUrl)`、`restoreLocalStorage(webContents, obj)`、`getAccountPartitionCookies(platform, accountId)`、`mergeCookies(primary, extra)`
- **THEN** 行为与拆分前逐字一致，包括 `getAccountPartitionCookies` 在 `accountId` 非法时 fail-closed 返回空数组、异常时记 warn 并返回空数组，以及 `mergeCookies` 按 `name+domain` 去重且**前一个列表优先**

#### Scenario: 依赖注入不得削弱可测性

- **WHEN** 测试对 `require('../services/logger')` 或被注入的 `isSafePathSegment` 打桩
- **THEN** 打桩必须真实生效（不得因「`require` 期把依赖解构成本地函数绑定」而静默落到真实实现）；把注入改成 no-op 或改错优先级时，相应特征测试 MUST 变红

### Requirement: 纯平移重构必须先有特征测试并有反证

任何以「降低行数债务」为目的的纯代码平移 MUST 先在被移动的实现上建立特征测试（断言其**当前真实行为**，包括失败分支与降级分支），并实测这些测试在**改动前**全绿；改动后同一套测试 MUST 仍全绿。仅凭「移动后原有测试没红」不构成行为不变的证据。

每条新锁 MUST 做一次变异反证（把该行为改成相反实现即变红），否则视为装饰性锁。

#### Scenario: 特征测试先行

- **WHEN** 开始移动代码之前
- **THEN** 已存在覆盖 6 个函数正常/失败/降级分支的测试，且其运行结果为全绿（留痕需含运行输出，不接受「文件已存在」）

#### Scenario: 移动不改变部分失败语义

- **WHEN** `restoreCookies` 注入的 `session.cookies.set` 对部分 Cookie 失败
- **THEN** 失败的每条按 name 记 warn，结束后再记一条 `<失败数>/<总数> cookies failed to restore`，且不抛出、不中断其余 Cookie 的恢复

### Requirement: 会话标记键名必须由自建匿名基线与真实登录视图的差集取证

凡新增或修改 `PLATFORM_SESSION_COOKIE_MARKERS` 中的键，MUST 同时满足三条并有可复跑证据：

1. **该键在真实登录视图分区内存在**（`auth-auth-<平台>-<ts>` 的 `Network/Cookies`，只读查询）；
2. **该键不在自建匿名基线内**——基线 MUST 由与主进程同版本的 Electron、复刻 `configureUserAgentFallback`
   的 UA 净化、在全新隔离分区访问该平台「登录页 + 创作者首页」实测得到；
3. **该键语义上是会话票据或用户身份**，MUST NOT 是设备/埋点/验证码/CSRF/SSO 中间态标识。

取证过程 MUST NOT 读取或输出 Cookie 值（`SELECT` 列表禁止含 `value`/`encrypted_value`），MUST NOT 解密
`credential-store`。测试夹具 MUST 由实测产物程序化生成，MUST NOT 手工抄录。

匿名基线的有效性 MUST 自证：基线内 MUST 出现该平台公认的匿名 Cookie（如知乎 `d_c0`、B 站 `buvid3`、
小红书 `a1`/`webId`、抖音 `ttwid`），否则该次 A−B 差集不得作为声明依据（页面未渲染会造出虚高差集）。

#### Scenario: 标记必须既在登录视图独有、又不被匿名基线命中

- **GIVEN** 某平台的一次真实登录视图 Cookie 名集合 A 与自建匿名基线名集合 B
- **WHEN** 断言该平台的标记表
- **THEN** 每个声明的键 MUST ∈A 且 MUST ∉B
- **AND** A−B 的差集 MUST 被逐字钉住，使平台改埋点时立即变红

#### Scenario: 匿名基线不得判为已登录，登录视图必须判为已登录

- **GIVEN** 实测得到的匿名 Cookie 集合与登录视图 Cookie 集合
- **WHEN** 调用 `hasPlatformSessionCookie(platform, cookies)`
- **THEN** 匿名集合 MUST 返回 `false`
- **AND** 登录视图集合 MUST 返回 `true`
- **AND** 任一侧出现「标记存在但值为空白/缺席」时 MUST 返回 `false`

#### Scenario: 基线未真正渲染时不得作为声明依据

- **GIVEN** 一次匿名探测返回 0 条该平台域内 Cookie，或缺少该平台公认的匿名 Cookie
- **WHEN** 有人据此计算 A−B 并提议新标记
- **THEN** 该提议 MUST 被拒绝，MUST 重新取得基线后再取证

### Requirement: 形态正向契约必须随标记集泛化并携带负控

`SESSION_MARKER_SHAPE` 类形态规则是标记的**必要条件而非充分条件**。泛化该规则时 MUST 同步新增：

- 一组**形态可拒**的负控断言，样本 MUST 取自实测匿名名单而非既有黑名单自身；
- 一组**墓碑断言**，列出「形态上像票据但实测匿名也会种」的键，并声明其 MUST NOT 出现在任何平台标记表中。

#### Scenario: 泛化不得放行设备标识

- **WHEN** 用泛化后的形态规则测试 `uuid` `guid` `buvid3` `ttwid` `s_v_web_id` 等设备/埋点名
- **THEN** 全部 MUST 不匹配

#### Scenario: 形态放过的键由实测墓碑拦住

- **WHEN** 某键形态上匹配规则（如 `csrf_session_id`）但匿名基线证明其未登录即存在
- **THEN** 该键 MUST NOT 进入任何平台标记表，并由墓碑断言锁定

### Requirement: 收紧登录门禁必须同时提供可归因现场

凡让某平台从「未声明标记（门禁恒过）」变为「声明标记（门禁实际将拦）」，同一变更 MUST 让**拒绝路径**留下
Cookie **名字**现场：名字投影 MUST 收敛到 shared-utils 的单一实现（`sessionCookieNames`），
禁止在 `auth-view-manager` / `qrcode-login` / `credential-saver` / `account-manager` 各写一份。
日志 MUST NOT 含 Cookie 值。

#### Scenario: 已声明标记被拒时留下名字现场

- **GIVEN** 某平台已声明标记，且一次采集的 Cookie 未命中任何标记
- **WHEN** 该采集被拒绝
- **THEN** MUST 输出一条含 `names=` 的日志，且名字来自共用的名字投影
- **AND** 日志 MUST NOT 含任何 Cookie 值

#### Scenario: 名字投影不出值、不炸、有上界

- **WHEN** 以空值、`null`、非数组、或 60 条 Cookie 调用 `sessionCookieNames`
- **THEN** MUST 分别返回 `[]` / `[]` / `[]` / 长度 40
- **AND** 输出 MUST NOT 含任何值内容

### Requirement: 裸域名成功模式的会话标记缺口清单只能缩小

`PLATFORM_SESSION_COOKIE_MARKERS` 的待取证清单（由 `platform-definitions.test.js` 的裸域名/标记缺口棘轮锁
按形态自动计算）MUST 只能缩小，新增即红。本变更将其从
`['bilibili','douyin','facebook','instagram','xiaohongshu','youtube','zhihu']`
缩小为 `['facebook','instagram','youtube','zhihu']`。

其中 **zhihu MUST 保持不声明 Cookie 标记**：实测其登录视图内 `.zhihu.com` 域不含任何会话 Cookie，
A−B 唯一独有项为验证码票据；给它声明 Cookie 标记会把每次真实登录判成失败。该「刻意不声明」MUST 由断言锁定，
以免被后人当作遗漏而随手补上。

#### Scenario: 三个平台的裸域名成功模式被会话标记封住

- **GIVEN** 未登录访问 `https://creator.douyin.com/`（实测停在原 URL 且不跳登录路径）
- **WHEN** 判定登录完成或采集凭证
- **THEN** douyin / bilibili / xiaohongshu MUST 因未命中非空标记而判为未登录

#### Scenario: 知乎不得因补账而被声明 Cookie 标记

- **WHEN** 有人为知乎声明 `PLATFORM_SESSION_COOKIE_MARKERS`
- **THEN** 棘轮锁与「知乎刻意不声明」断言 MUST 变红，并要求改用 localStorage 侧取证
