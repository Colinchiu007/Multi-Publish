
# [未发布] feat(ai-taste): 去 AI 味词库运营中心化——词库管理与强度参数运行时可配（2026-10-04，ai-taste-ops-center）

### 功能（两刀，PR #2877 + #2884）
- **词库管理**：运营中心新增「去AI味词库」管理页（adminOnly，/rewrite-ai-taste）：全量表格 + 搜索/级别/状态筛选 + 行内启停 + 新增编辑（编辑态 word 只读）+ JSON 导入导出（整批原子 ≤500 条）。词库语义为叠加 + 键覆盖：引擎内置 117 条词表是安全底线，运营中心同键覆盖替换方向；停用条目使桌面端跳过该词替换（含禁用内置词）。
- **下发与生效**：bootstrap 新增 `rewrite_ai_taste_map` 字段（含 enabled=0，随整包 Ed25519 签名）；桌面端新增 `rewrite-ai-taste-map-manager`（sanitize 与后端同判据/changed 判定/原子持久化）接入 ops-center-sync 消费块；词库变化重注入引擎（即时生效免重启）；离线回退内置词表（行为与升级前逐字节一致）。
- **强度参数**：策略 postProcess 新增 `aiTasteIntensity`（1-3）：1=仅词级替换、2=现状、3=追加 casual 口语化；非法回 2。引擎 AITasteRemover 改构造注入（phraseMap/disabledWords/severityMap，缺省回常量），词表遍历键序确定性。
- **质量与评审**：TDD 先红后绿（引擎 T1-T8/C1-C5、ops-center S1-S8、桌面 M1-M9、sync Y1-Y4）；全量回归引擎 194/194、pytest 478/478、桌面 81/81、前端 57/57；QM-6 外部评审 2W3I 全部处置（W1 重复词去重/W2 toggle 失败回滚+停用确认/I3 码点计数对齐/I4 空导入前置拦截/I5 导出含 description）。AGENTS.md QM-2 新增「词库双端校验同判据」门禁条目。
- **文档**：01-docs/PRD-REWRITE-AI-TASTE-OPS-CENTER-2026-10-04.md（六维度 + Q1-Q12 决策记录）；PRD-REWRITE-ENGINE.md §十六；openspec change ai-taste-ops-center。
# [未发布] feat(api-publish-engine): 即时发布执行前复校权益/激活态——与定时发布对称的纵深防御（2026-10-04，publish-permission-recheck）

> 用户场景：定时发布路径已有「激活态 + 权益」复校契约，即时/批量发布路径却直接内联 `_consumeEntitlementFeature`，缺少同等的激活态复校与测试覆盖。本次补齐对称性，属**纵深防御**（中央预检本就 fail-closed），不宣称修复活跃安全漏洞。数据校验/流程/功能逻辑/提示文字详见 `01-docs/PRD-API-PUBLISH-ENGINE.md` §7A；OpenSpec 工件见 `openspec/changes/publish-permission-recheck/`。

### 做了什么
- 新增 `_authorizeImmediateEntry(req, amount = 1)`（L536-560），与 `_authorizeScheduledEntry`（L511-534）同构：API Key 分支 → `findBySubject` → `assertBusinessUserActive` → `_assertEntitlementFeature` → `_consumeEntitlementFeature`。
- 路由收口：`POST /api/v1/publish` 替换为 `_authorizeImmediateEntry(req, 1)`；`POST /api/v1/batch-publish` 替换为 `_authorizeImmediateEntry(req, platforms.length)`（消费量按平台数，`Math.max(1, amount)` 兜底）。
- **叠加而非替换**：中央预检（L661-673）行为完全不变，本方法是第二道闸；任一层 fail-closed 均返回既有错误码与文案，**不新增错误码、不改文案、不涉及 locale**。
- 回归锁：`packages/api-publish-engine/test/publish-permission-recheck.test.js` 8 例全绿，含「suspended → 403 + 权益计数 0」「正常态消费恰好 1 次」「脱离中央预检仍 fail-closed」。

### 遗留（不假装闭合）
- 中央预检与本方法存在**重复校验**（同一请求内权益被 `requireFeature` 两次）。当前为有意的纵深防御；若未来要收敛为单点，须先证明两条路径覆盖等价，属独立 change。

# [未发布] feat(observability): 发布链路日志可观测性 + 日志风暴护栏 + 注入消毒（2026-10-03，publish-logging-observability）

> 用户场景：ApiUsageGovernor 的限流/排队/冷却等待与重试风暴此前不可观测、不可审计；`publish.js` 与 `api-usage-governor.js` 均已顶到 500 行债务熔断线。详见 `01-docs/PRD-API-PUBLISH-ENGINE.md` §7B；OpenSpec 工件见 `openspec/changes/publish-logging-observability/`。

### 做了什么
- 日志契约治理：IPC handler 统一四阶段日志（`enter`/`validation-failed`/`ok`/`error`），含耗时与脱敏关键参数。
- 日志风暴护栏：重试日志受 `retryLogMaxBurst` 硬上限约束，超限改汇总条。
- 日志注入消毒：逐字符 `charCodeAt >= 32` 判定（不用控制字符正则，避免 `no-control-regex`）。
- 债务线压线抽取：新增 `governor-observability.js`/`governor-constants.js`/`log-sampler.js`/`publish-helpers.js`；`api-usage-governor.js` 504→489、`publish.js` 500→469，均严格 `<500`。
- 测试可重复性修复：把 jitter 抽成可注入函数 `governorConstants.jitter`，测试在 require 前替换为 `() => 0`（确定性 + 睡眠归零）。

### 关键教训
- 限流/重试类单测**禁止依赖全局随机源**（jitter），否则 CI 偶发超时（本例 10s shard 超时）。
- `.lines >= 500` 是**硬熔断（含 500）**，大文件要「压线前先抽」，抽取后必须严格 `<500`。

# [未发布] docs(收口): api-publish-engine-w3 波次归档——6.3 活体裁决 not-go 定案，未实现能力不折主规格（w3-closure，2026-10-04）

### 做了什么
- openspec change `api-publish-engine-w3` 经 `validate --strict` 后归档为 `2026-10-04-api-publish-engine-w3`，10 条 Requirement 折入主规格（api-publish-chain / api-publish-kuaishou-chain / api-publish-xiaohongshu-chain / api-publish-signer-page）。
- spec delta 纠偏：小红书「x-s/x-t 签名页求签」「Adapter 双轨翻转」两条**未实现、未验收**的能力从 delta 剔除，主规格只保留「前置取证硬门槛」+「止步裁决记录（2026-09-26）」两条，重启须以新立 change 双前置为条件；快手 R1/R3 补「实况补记」——契约层成立但活体定案 API 轨当前不可用，本要求不构成「快手可经 API 轨发布成功」的证据。
- tasks.md 裁决式登记：3.3/5.1/5.2/6.1/6.2/6.3 以带理由、带日期的 [x]+勾选口径注记收口（不做的事记为裁决而非留白）；6.1 QM-1 经 kuaishou-w3-live-fix 归档 tasks 3.2 三件套证实闭环；6.2 销账列出本波全部 PR（#2377/#2388/#2413/#2424/#2432 及活体修复/收敛/定案链至 #2669）。
- PRD §13.6 新增「活体裁决与定案」节：用户在场 11 轮活体、八层缺陷逐层收敛、`upload/complete` 裸 400 根因定案在传输层（TLS 指纹/HTTP 版本/QUIC，Node axios 无法复刻 Chrome 栈），DOM 轨 11/11 兜底成功；techdoc v2 §2/§4.2/§11 同步终裁口径。

### 遗留（不假装闭合）
- kuaishou `publishMode: api-then-dom` 自 6.3 定案后成为空转开关（每次必败一轮 API 尝试后降级 DOM，与 dom-only 等效但多一次失败）。是否回拨 dom-only 属收口待决项——运行时代码配置变更，须新隔离 worktree 小波 + publish-mode-config 回归，不随本纯文档 PR 处理。
- API 轨后续路径「借浏览器传输」（受信会话内 fetch）未立项。
# [未发布] feat(publish): 发布吞吐优化——去固定等待 + 通道调度 + 窗口池 + 抖音图文 API 链（2026-10-04，publish-throughput-optimization）

> 用户场景：发布 1 个图文到抖音进度面板「排队中」、整链慢。三层慢因取证（文件:行号）与四方案设计、数据校验、取证状态表详见 `01-docs/PRD-PUBLISH-THROUGHPUT-OPTIMIZATION-2026-10-04.md`；OpenSpec 工件见 `openspec/changes/publish-throughput-optimization/`。

### A2：抖音图文 RPA 链 4 处固定 sleep 改事件驱动等待（`rpa-view-platforms.js _publish_douyin`）

- 图片上传后 `_sleep(4000)` 删除——下方表单就绪轮询（`_waitForCondition` 30s/1.5s）本就是就绪判定，固定 sleep 是纯叠加。
- tag 注入后 `_sleep(1000)/tag` → chip 就绪轮询（`[class*="tag"]` 域 innerText 匹配 + 可见性，5s/500ms），超时静默继续下一 tag。
- 封面注入 `_sleep(1000)+_sleep(2000)` → 缩略图 img 计数**基线递增**判据（头条 `_uploadToutiaoCover` 同款），10s/500ms，超时 warn 降级。
- 提交兜底 `_sleep(5000)`+单次查 URL → 500ms×10 URL 轮询（最长仍 5s，成功跳转平均提前 ~2.5s 返回）。
- 回归锁 7 条（`rpa-view-platforms.test.js` 新 describe）：防复发静态锁（4 处 sleep 字面量禁入）+ 探针存在性 + 行为锁 + 超时降级；变异反证实跑（封面轮询退回 sleep → 静态锁红，还原 70/70 绿）。单任务节省 10~15s。

### B：TaskQueue 按 (platform, accountId) 通道调度（`shared-utils/task-queue.js`）

- 通道键 `platform + ':' + (accountId ?? '')`：同通道 FIFO 串行（防同账号并发开窗触发平台风控/双窗竞争），跨通道并行吃满 `maxConcurrent`；`accountId` 缺失归一空串（同平台仍串行——共享登录面）。
- `MP_QUEUE_MAX_CONCURRENT` 覆盖并发上限（[1,10]，默认 3；非法/越界回落+console.warn 出声，对齐 publish-frequency-policy 纪律）；解析函数导出为 `TaskQueue.resolveQueueMaxConcurrent` 静态方法，`container.setup.js` 消费（显式 options.taskQueue 逃生口保留）。
- **频控推迟必须释放通道**：`publish:blocked` 分支在 try/finally 之前 return，通道记账在该分支显式释放（与既有 `_running.delete` 同位同因），否则「等 5 分钟间隔」会占死同通道，频控从保护变雪崩。
- 回归锁 9 条（task-queue.test.js 新 describe）：同账号串行/跨账号并行/无账号同平台串行/总并发上限/env 三态/频控释放通道/重试不占通道；既有 34 条含 #2773 守卫集成 7 条全绿。

### C：RPA 窗口池化复用（`rpa-view-session.js` + `rpa-view-manager.js`）

- 发布成功窗口导航 `about:blank` 后入池（不销毁），失败/抛错/取消立即销毁（状态污染兜底——上传页 `input[type=file]` 残留态历史教训）；同键（平台+账号）复用池内窗口并**跳过三段登录态恢复**（cookie/auth 分区/storage，partition 层本就持久）。
- 池上限 6（`MP_RPA_POOL_SIZE` [1,10] 覆盖，非法回落+告警）；空闲 TTL 10 分钟（`MP_RPA_POOL_TTL_MS`），60s 周期后台清理且 `unref()` 不阻退出；`cleanup()` 清池。
- 池键与 `_windowKey` 自增 id 语义分离：池按逻辑会话复用，活动映射保留自增命名（同账号并发会话 CancelToken 独立）。
- 回归锁 11 条（新文件 `rpa-view-window-pool.test.js`）：归池/复用/不共用/失败销毁/抛错销毁/复用跳过恢复/上限挤出/env 三态/cleanup 清池/unref 结构锁；变异反证实跑（归池判据改恒 true →「失败销毁」红，还原 11/11 绿）。每任务省 3~8s 冷启动。

### D：抖音图文 API 直连链（`api-publish-engine` 新链 DouyinImageChain）

- 六步链与视频链同构（csrf → auth/v5 → 逐图 imagex apply/POST/commit → create_v2 → 裁决），adapter 按 `taskData.images` / `video.path` 分流；双缺 fail-closed（`taskData requires images or video.path`）；API 失败自动回退 RPA 图文链（零新增用户风险面）。
- **取证纪律（design.md D4）**：图文 create 体字段无真机取证切片（W2 切片只覆盖视频链），`image_ids`/`media_type` 等按同构推断书写、代码注释标 UNVERIFIED、PRD §4.2 逐字段登记；单测 12 条只锁同构+序列+fail-closed+风控口径，**不断言未取证字段业务值**。真机验证步骤 PENDING（PRD §4.2），按「平台侧无法离线证伪」原则不阻塞合入。
- `scripts/run-tests.js` VITEST_FILES 登记 `douyin-image-chain.test.js`；全量 `node scripts/run-tests.js` exit 0。

### 配套

- `publish-progress-events.js` KNOWN_STAGE_MAP 登记 `reusing browser session...`（C 方案池复用进度串，封闭清单契约）。
- `container.setup.js` taskQueue 构造接入 env 解析；`shared-utils/index.d.ts` 补 TaskQueue 构造参数 `publishIntervalGuard` 与静态方法声明。

### 预期收益（度量方式见 PRD §7）

| 指标 | 现状 | 目标 |
|---|---|---|
| 单条抖音图文 RPA 全链 | 40~90s | ≤30s |
| 单条抖音图文 API 链 | 不存在 | ≤20s（真机验证后） |
| 10 目标批次 | 4-6 分钟 | ≤3 分钟 |





