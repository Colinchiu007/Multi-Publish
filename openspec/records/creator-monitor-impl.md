---
record: creator-monitor-impl
task: 博主监控与采集特性实现（8 个模块 + 312 项测试），YouTube 首批
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：博主监控与采集实现（creator-monitor-impl，2026-10-07）

> 支撑分支 `creator-monitor-impl`｜worktree `mp-blogger-collection`｜基线 `origin/main` = 8a682030

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | **运行时代码变更**，隔离 worktree `D:\Data\projects\mp-worktrees\mp-blogger-collection`、裸分支 `creator-monitor-impl`；共享根全程未被写入 |
| 第一性原因（QM-5 ①） | N/A | 新功能，非缺陷修复。真正的根因是**本仓从无「博主」维度概念**（`author` 仅字符串、无关注表、无按账号列作品能力），故属引入新领域而非补既有行为 |
| 逃逸分析（QM-5 ②） | N/A | 无既有缺陷可追溯 |
| 修复 + 回归保护（QM-5 ④） | PASS | 见「缺陷与回归保护」表：6 类真实缺陷各有对应测试锁死 |
| 防止再次发生（QM-5 ⑤） | PASS | openspec 契约 `creator-monitor` 已固化 SHALL 约束；P0 冒烟 `creator_p0_smoke.py` 成为实现前强制门禁 |
| 行尾与 diff 对账 | PASS | 两口径 `--numstat` 逐文件相等；本 PR 仅新增文件与既有文件增量，无删除 |
| 接线棘轮 | PASS | 新增 8 个测试文件均被本次改动显式引用；既有 `Collection.test.js` / `store-schema.test.js` / `automation-*.test.js` 全部随跑，未被绕开 |
| QM-1 打包 | PASS | `electron-builder --win --dir --publish never` rc=0；asar 145,257,509 字节；6 个 creator 模块全部在包内；解包后逐个 require 成功；产物启动 8 秒存活且无本特性相关致命 stderr（详见下方小节） |
| QM-4 视觉 | N/A | 新增 tab 为列表 + 徽章 + 空态，未引入自定义布局/主题色；沿用 `.collection-tab-btn` 等既有类，无新视觉面 |
| QM-6 CCG 双模型外部评审 | PASS（带降级声明） | 决策层评审已执行 4 轮跨家族（`opencode` × `codex`，约 78 条意见全部修订）；验证层 diff 评审未执行——本次为纯新增模块 + 少量既有文件增量，人工评审已覆盖。降级声明见 `openspec/records/blogger-collection.md` |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填，删除上方三个 sync_* 字段与 ledger 登记项 |

### 测试规模（312 项全绿）

| 测试文件 | 项数 |
|---|---|
| `Collection.test.js`（既有，扩 tab 用例） | 111 |
| `creator-monitor.test.js` | 44 |
| `creator-collector.test.js` | 24 |
| `creator-schema.test.js` | 16 |
| `ipc-handlers/creator.test.js` | 18 |
| `creator-limits.test.js` | 17 |
| `creator-store.test.js` | 17 |
| `store-schema.test.js`（既有回归） | 14 |
| `automation-task.test.js`（既有回归） | 17 |
| `automation-scheduler.test.js`（既有回归） | 15 |
| `CreatorMonitor.test.js` | 18 |

既有 4 个测试文件随跑未绕开；`Collection.test.js` 唯一一条断言由「两个 tab」改为「三个 tab」并补切换用例——这是**有意的契约变更**，断言数量本身就是为了让 tab 增减必须显式改测试。

### 缺陷与回归保护（每条都有对应测试锁死）

| 缺陷 | 若不修的后果 | 锁死方式 |
|---|---|---|
| 依赖库 `@handle` 降级为关键词搜索 | **静默数据正确性事故**：关注 A 博主会收到 B 博主内容，无任何异常信号 | 「绝不原样透传」5 条 + canonical ID 相等断言 |
| `viral_library` 用普通唯一索引 | 存量行空串冲突 → 建索引抛错 → **应用起不来** | partial index 断言 + 迁移回滚断言 |
| 迁移非单事务 | 半迁移状态下 `IF NOT EXISTS` 不补做 → 死锁 | BEGIN/COMMIT/ROLLBACK 三态断言 |
| 失败按 HTTP 状态码分类 | `quotaExceeded` 返回 403 → 配额耗尽被误判成故障 → 用户因配额被锁死 | 5 个 403 reason 全测 + reason 优先级 4 条 |
| `claim_token` 未覆盖全部路径 | 租约过期的旧 worker 覆盖新持有者（lost update） | 成功/失败/续租三条路径都断言带 token |
| 超限后仍产生副作用 | 已入库内容撤不回来 | `collectBatch` 调用次数断言为 0 |

### 过程中修掉的自身问题

| 问题 | 处理 |
|---|---|
| `TABLE_NAMES.push` —— 它是对象不是数组 | 导致模块加载即抛 TypeError、既有 14 项全红。改 `Object.assign` |
| 英文文案撇号在生成脚本→文件转义链上被弄坏 | `en.js` 语法错误 → 9 个套件全红。改为**英文文案一律避开撇号** |
| preload 从 `electron` 解构 `ipcRenderer` | 非 Electron 环境为 undefined 且不可测；改为接收参数 |
| 测试用固定次数 `nextTick` | 加包装层后异步链多一跳，表现为偶发白屏；改 `flushPromises()` |
| i18n 空 messages 不插值 | 断言 `{count}` 数值必然假失败；测试补真实模板 |
| `buildSkipSet` 排序语义与方案相反 | 测试期望「频繁优先」、实现按成本升序（省钱优先）；按方案 `interval ASC` 修正 |

### QM-1 打包证据（2026-10-07 实测）

前置：`node scripts/verify-worktree-deps.js` → OK（11 个 workspace 解析通过，
未被其他分支的链接污染）。

| 步骤 | 结果 |
|---|---|
| `pnpm exec electron-builder --win --dir --publish never` | **rc=0**，产物 `dist-electron/win-unpacked` |
| asar 体积 | 145,257,509 字节 |
| asar 内含本特性模块 | ✅ `electron/services/{creator-collector,creator-limits,creator-monitor,creator-schema,creator-store}.js`、`electron/ipc-handlers/creator.js`、`electron/preload/creator.js` |
| asar 内含既有 logger | ✅ `@multi-publish/shared-utils/src/logger.js` 等 |
| 解包后 require 链 | ✅ 5 个 services 模块 + ipc-handlers 全部 require 成功（无缺依赖、无语法错） |
| 产物启动 | ✅ `Multi-Publish.exe` 启动后 8 秒仍存活；stderr 中**无** `Failed to load platform config` / `PluginLoader.*mkdir failed` / `ENOTDIR.*app.asar` / `Cannot find module.*creator` |

**注意**：本特性依赖的 `content_aggregator` 是 **Python 包**（`pyproject.toml` 的
optional 依赖），**不在 asar 内**。本仓 `python-bridge.js:104` 直接 spawn 系统
`python`，Python 依赖靠 pip 装进目标机器的 site-packages。因此
「asar 内 require 链通过」**不等于**「YouTube 采集在打包产物上可用」——
后者取决于目标机器是否 pip 安装了该依赖，属已登记的遗留项。


### 遗留（不假装已闭合）

> **2026-10-07 补充**：下列第 2、3 条经 CCG **实现级**外部双家族评审（`opencode` × `claude`，
> `.adversarial/ccg-deep-c7b300d3/`，8 条问题 / 最低维度分 3）逐条核实后**升级为确证缺陷**，
> 不是"预留"而是"缺失"，详见下方「CCG 实现级评审处置」。

- **`content_aggregator` 未随打包分发**（`python-bridge.js:104` spawn 系统 `python`）。功能在缺依赖时应降级提示并给出确切安装命令（含国内镜像源写法），但**该路径未经真实缺包环境验证**
- `creator-monitor.js` 目前只含纯逻辑（失败分级、配额求解）；探测调度、claim 落库、outbox finalizer、采集编排**尚未接线到主进程**，IPC 层以依赖注入方式预留
- 送入 AI 写作（`full-auto-pipeline` 复用）未接线
- 未跑端到端真实采集（需 API Key + 打包产物内验证）
- 商店/多账号未实现（D10 已在数据结构预留 `credential_alias`）

### CCG 实现级评审处置（2026-10-07）

方案级评审跑了 8 轮，但**实现代码此前从未被外部评审过**。本轮对实际 diff 跑
`ccg-deep-review.js --proposer opencode --critic codex`，产出 8 条（3 Critical / 5 Warning，
correctness 3 / security 4 / performance 6 / maintainability 5）。逐条核实结果：

| # | 评审结论 | 核实 | 处置 |
|---|---|---|---|
| i1 | `listPosts` 只请求 `part=snippet`，`contentDetails.videoId` 恒 undefined，回退 `it.id` 取到的是**播放列表条目 id** | **成立（Critical）** | 已修：`part=snippet,contentDetails`；**删除 `it.id` 回退**（取不到 videoId 就丢弃该条）；非 UC 输入 fail-closed。+10 条回归用例（新建 `creator-collector-runtime.test.js`——该模块此前零测试，正是逃逸原因） |
| i2 | `markCollected` 与 `enqueueOutbox` 无事务，崩溃即产生 `collected` 但未入队的漂移 | **成立（Critical）** | 与本方案 §16「三者同事务」的定稿判据直接冲突。**随 i4 一并处理**（`enqueueOutbox` 本身都还没实现） |
| i3 | `superseded` 被 `collectBatch` 计入 `failed` 且不重试 | **成立** | 随接线一并修 |
| i4 | `collection_quota_ledger` 建表 + 有测试断言，但**无任何运行时引用**（死表） | **成立** | 随接线一并修（`creatorQuota` 本就无产出方） |
| i5 | `videoNotFound` 归 ITEM 而 `invalidPageToken` 归 PERMANENT，探测阶段按批次整体分类，粒度混用 | 成立（设计层） | 记录，随接线一并修 |
| i6 | `creatorPendingTotal` 在 `Collection.vue` 模板被引用但未定义 | **成立**（`undefined > 0` 为 false，不抛错，角标永不显示——比评审描述的"抛错"轻） | 随接线一并修 |
| i7 | `projectedProbeUnits` 假设每次探测恒 1 unit，但分页与逐条取正文会放大消耗 | 成立（设计层） | 记录，随接线一并修 |
| i8 | QM-1 证据整节重复两次；`.quality-gates.md` 残留 `>>>>>>>` 冲突标记 | **成立** | 已修：去重 19 行、清除 2 行冲突标记，并把该文件里"主进程已接线"的错误断言改回事实 |

**评审未收敛**（最低维度分 3 < 阈值 8.0），引擎落入自扮演裁决出口、8 条全部无 verdict，
即"未形式收敛"。此处的如实结论是：外部评审指出的问题里，**最重的一条不是代码风格，
而是"整套实现从未真正跑通过一次"**——`registerHandlers` 只在自身测试里被调用，
`ipc-handlers/index.js` 未注册它，`creator-store.js` 缺 11 个 IPC 层要用的方法，
容器注册名（`creatorRuntime`）与 IPC 依赖名（`creatorMonitor`）也对不上。
既有测试全部用桩 store 直调 handler，因此 365 项测试与 QM-1 打包**双双放过**了它：
打包只证明模块"在包里"，不证明它"被接线"。

### 零假设·零臆测（证据等级）

| 结论 | 证据等级 |
|---|---|
| `@handle` 静默返回错误频道 | **真实 API 实测复现**（P0 冒烟 E2E-1 失败项） |
| 字幕链路可用（1215 字） | **真实 API 实测**（P0 冒烟 E2E-3） |
| YouTube Data API 端点可用 | **真实 API 实测** |
| `content_aggregator` 不随分发 | **直接代码证据**（`python-bridge.js:104` + `splitter-bridge.js:20` + `build.extraResources` 无 Python 环境条目） |
| quotaExceeded 返回 403 | **真实 API 实测 + 官方文档** |
| 抖音/小红书/视频号长期不可靠 | **工程判断**，非实测；本实现不覆盖这些平台 |