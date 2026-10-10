# film-auto-mode — 设计决策

> 决策编号用于 tasks/评审引用。基线 `main@f493e7ec6`。

## D1 页面重组：Hub + 内嵌既有视图（不抽取文件）

**决策**：新增 `FilmEngineeringHubView.vue` 承载三标签；画布与工程案例**直接用现有视图组件**，仅新增可选 `embedded` prop（隐藏各自页面级标题/顶部品牌块，默认 `false` 时行为逐字不变）。

**备选与否决**：
- ❌ 抽取 `FilmCanvasPanel.vue` / `FilmClassicPanel.vue`：会移动 `src/views/FilmEngineeringView.vue` 里的 `:href` 站点，触发 `apps/desktop/src/href-scheme-contract.test.js:172` 的「六个已知站点逐个在位」锁；同时 `FilmCanvasView.actions.test.js:81` 直接 mount 该视图，抽取即牵动多套测试。
- ❌ 用嵌套路由（子路由渲染 tab）：与既有暗路由/`route-registry.js` 单层模型冲突，且 `route-registry` 有门禁校验视图存在性。

**代价**：Hub 内两个视图各自保留 `max-width: 1240px; margin: 24px auto` 的内边距，视觉上略缩进。可接受（不引入回归风险）。

## D2 标签切换用 `v-show` + 懒挂载

**决策**：三面板 `v-show` 常驻（首次访问才挂载：`mountedTabs` 集合），切换不重置状态（画布节点、自动模式进度不丢）。

**备选**：`v-if`（切回即销毁 → 画布未持久化的中间态与自动模式运行中视图丢失）；`<KeepAlive>`（对本项目 heavy 视图反而放大内存，且 Hub 不经过 router-view 的 keep-alive 语义）。

## D3 标签 ↔ URL 双向绑定

**决策**：`/film-engineering?tab=auto|canvas|classic`，默认 `auto`；切换用 `router.replace`（不污染历史栈）；`watch(route.query.tab)` 与 `watch(activeTab)` 双向同步。

**理由**：可深链/可刷新保持；与既有 `useTabDocumentTitle` 例外清单兼容（实际路由仍为 `/film-engineering`）。

## D4 `/film-engineering/classic` 改为等价重定向

**决策**：`{ path: '/film-engineering/classic', redirect: to => ({ path: '/film-engineering', query: { tab: 'classic' } }) }`，`route-registry` 同步登记（`internal: true`）。画布工具栏「经典视图」按钮文案改「工程案例」，行为不变（push 该路径 → 重定向 → Hub 切标签）。

**备选**：保留独立视图（可达性割裂未解决，任务书明确要求放进第 3 标签）。

## D5 自动模式以「项目文件」为唯一真源

**决策**：`%TEMP%/film-engineering/auto/<taskId>/project.json`（`.tmp`+rename 原子写），承载 shots（prompt/refPaths/seconds/status/outputPath/error）与参数；台账 `ledger.json` 仍由 `production-driver` 管（进度/续跑），两者职责分离：project = 内容真源，ledger = 执行真源，磁盘 `shot_NNN.mp4` = 结果真源。

**理由**：片段编辑必须能改 prompt 并**在重生成时生效**；引擎 run 快照不会因编辑而回写（`retry-shot` 的 prompt 取自 run 快照，`ipc-handlers/film-engineering.js:272-282`），故自动模式需自己的内容真源。
**备选**：把编辑写回引擎 run context（跨进程改引擎内部状态，越界且脆弱）。

## D6 一次聚合成本确认（默认），保留「停止 + 续跑」

**决策**：`auto-plan` 返回聚合确认卡；`auto-start` 必须 `confirmed === true`，否则 `AUTO_NOT_CONFIRMED` 且**零 provider 调用**。执行阶段连续跑完所有批（`runOnlyBatch = null`），批间可停止。

**备选与否决**：❌ 逐批确认（与「越简单越好」冲突，且自动模式的用户不关心批次）；❌ 无确认直接跑（破坏成本闸零调用契约）。

**缓解**（对应风险 R1）：确认卡明示镜数/批数/实际时长/磁盘预估/墙钟预估；超 2 小时给 W5 警告；`MAX_AUTO_SHOTS=200` 上限；支持停止+续跑。

## D7 新通道 `auto-regenerate-shot`，不动 `retry-shot`

**决策**：自动模式的单镜重生成走新通道（prompt 从 project.json 取，逐字符直送 provider）；`retry-shot` 语义与契约测试**不动**。

**理由**：`retry-shot` 的契约是「prompt 由主进程从 run 快照取，前端不携带」（`useFilmVideoGen.js:11` 注释 + `film-engineering-retry.test.js`），与「用户编辑 prompt 后重生成」语义冲突；扩它会打红既有锁并模糊两条动线的边界。
**原文直送合同的延续**：两条路径都保证 **prompt 逐字符提交、不经 prompt-engine 优化器**（`video-gen.js:8`），差异只在 prompt 的来源（快照 vs 项目文件）。

## D8 角色检出：本地启发式 + 用户标注优先（零 LLM 依赖）

**决策**：检出顺序 ①用户上传时填的角色名（最高权重）②剧本显式标记（`【角色：X】`/行首 `X：`）③对话动词前名词（说/道/喊/问/答/低语）④频次 ≥2 且未命中停用词的 2–3 字中文名或大写英文名。检出为空 → 用「角色1..N」占位 + warning W4。

**映射**：按频次降序填入槽位 `ROKO → JAXX → LULU → REIN`（不足 4 个只填前 K），交给既有 `buildTemplatePrompt`（`script-adapt.js:52-85`）生成角色行标注——**不新写提示词组装逻辑**。
**备选**：LLM 抽取角色（当前主进程 `llm: null`，`container.setup.js:453`；不可依赖，仅作可选增强钩子）。

## D9 参考图绑定策略

**决策**：
- 人物图：某镜的 beat 文本或模板 `[CHARACTER: X]` 行命中角色名 → 注入该角色图（每角色每镜 ≤1 张）
- 场景图：按场景（`title` 分组）轮转 `sceneRefs[i % len]`，同场景所有镜共享同一张（对齐方法论「GEO 块每场锁定」）
- 单镜注入总数 ≤2；顺序：人物优先、场景补位
- provider 不在 `VIDEO_REFERENCE_PARAM_BY_PROVIDER`（`video-reference-inputs.js:30-34`）→ 不注入 + warning W1（与既有降级语义一致）

## D10 上限与校验常量

| 常量 | 值 | 理由 |
|---|---|---|
| `MAX_AUTO_SHOTS` | 200 | = 20 批 × 10 镜（`PRODUCTION_BATCH_SIZE`），`MAX_PRODUCTION_SHOTS=1000` 之下留足安全余量 |
| 剧本长度 | 1–10000 字 | 与 `MAX_SCRIPT_LENGTH`（`script-adapt.js:13`）同源 |
| 目标时长 | 10–600 秒 | 覆盖 2 镜（10s）到 120 镜（600s@5s） |
| 单镜秒数 | 5 / 8 / 10 | `FILM_DURATIONS`（`video-gen.js:41`） |
| 画幅 | 16x9 / 9x16 | `video-reference-inputs`/`video-gen` 支持的画幅子集（不含 `source`，自动模式无需原图跟随） |
| 参考图 | 人物 ≤8、场景 ≤8、单张 ≤10MB | 沿用 `MAX_REF_BYTES`（`reference-store.js:17`）+ 表单可理解上限 |

## D11 片段删除：不支持（Q4 待评审）

**决策**：片段编辑支持「编辑/重生成/重试/重新合成」，**不支持删除**——`film_render` 的 `orderIndex` 要求从 0 连续（`film-render.js:148-154`），删除会造成缺镜 → 合成 fail-closed。若评审要求，改以「标记跳过」（合成时排除并重排 orderIndex）实现，属增量。

## D12 进度 UI 复用 `StageProgress.vue`

**决策**：直接 import；新增 `testidPrefix` prop（默认 `'story2video-stage'`，**默认值不变**以保 `StageProgress.test.js` 与既有视觉基线）；自动模式传 `'film-auto-stage'`。

**理由**：该组件已是纯 props 且**有跨流水线复用先例**（`views/HotTopics.vue:231-238`）。
**进度纪律**：事件推送优先（`film-engineering:auto-update`）+ 3000ms 轮询兜底（`auto-status`）+ runId/taskId 守卫（照抄 `CreateView.vue:4140-4189`）。

## D13 事件负载与节流

**决策**：`film-engineering:auto-update` 负载沿用 production 事件形状（`{type, batchIndex?, shotIndex?, status?, doneCount, totalCount}`），**只带计数不带 shotIds 数组**，沿用 `EVENT_MERGE_MS=500` 节流（`production-driver.js:30`）。

## D14 文件拆分（超大文件门禁）

**决策**：Hub ≤ 300 行；`FilmAutoPanel.vue`（表单/预估/确认卡/进度）≤ 600 行；`FilmAutoSegmentEditor.vue`（片段列表/编辑/重生成）≤ 500 行；后端 `auto-plan.js` ≤ 400 行、`auto-project.js` ≤ 250 行、auto IPC 单独文件 ≤ 400 行。避免触碰 `max-lines` 挂账清单。

## D15 重生成原子覆盖（第 2 轮评审采纳）

**决策**：`auto-regenerate-shot` 写 `shot_NNN.mp4.part` → ffprobe 校验通过 → `rename` 为 `shot_NNN.mp4`（沿用 `shot-downloader.js:204-210` 的「探测通过才入库」纪律）。**理由**：既有磁盘复核只看文件是否存在（`ipc-handlers/film-engineering.js:52-59` 的 `defaultFilmProbe`），半写文件会被误判为已完成，续跑将跳过一镜残缺产物。

## D16 续跑的成本再确认规则（第 1/2 轮评审采纳）

**决策**：`project.json` 记录 `confirmedAt`；`auto-update-shot` / `auto-regenerate-shot` 写 `editedAt`；续跑（同 taskId + planId）时若 `editedAt > confirmedAt` SHALL 要求重新确认（前端呈现「重新确认成本」卡并重新走 `confirmed=true`），否则跳过确认。**理由**：编辑改变的是"要生成什么"，与「预算口径/镜头集合未变」的前提冲突；把"未变"变成可机械判定的时间戳比较，避免靠语义论证。

## D17 计划归属校验（第 1/2 轮 Critical 采纳）

**决策**：`planId = plan-<sha256(taskId|scriptHash|aspect|seconds|targetDuration) 前 16 hex>`，计划文件内记录 `taskId` 与 `scriptHash`；`auto-start` SHALL 校验 `plan.taskId === 入参 taskId`（不等 → `AUTO_PLAN_MISMATCH`）；`planId` 不存在/过期/已 consumed → `AUTO_PLAN_EXPIRED`。**理由**：单机单用户下跨租户风险有限，但"服务端读自己的计划"这一防线不应依赖调用方自觉；把归属做进 key 与记录，越权组合在结构上不可表达。

## D18 成本门槛绑定到所有产生 provider 调用的通道（第 2/3 轮 Critical 采纳）

**决策**：`editedAt > confirmedAt` 时，**`auto-start` 与 `auto-regenerate-shot` 一并在执行前返回「需重新确认」**；未确认前零 provider 调用。**理由**：只在续跑（`auto-start`）设门槛时，`auto-regenerate-shot` 是独立直发通道——连续重生成可无限次越过确认清单，累计敞口无约束。

## D19 append-only 确认历史（第 2/3 轮 Warning 采纳）

**决策**：`project.json` 增 `confirmations[]`（append-only）：每条记录 `{at, payloadHash, shotsFingerprint, planVersion}`；以最新一条为基准；刷新确认只追加，不覆盖历史。**理由**：清单式确认的可审计性依赖"某次 provider 调用对应哪次确认"可回溯；覆盖式字段会让历史自毁。

**实现补充（落盘字段口径）**：`project.json` **只存 `editedAt`**（最近一次内容变更时间），不另存可被覆盖的 `confirmedAt` 字段——"最近一次确认时间"一律由 `confirmations[confirmations.length-1].at` 派生（`auto-project.js` 的 `latestConfirmation`），避免两份时间戳漂移。`needsReconfirm(project, {payloadHash})` 的三条判据（无确认记录 / 载荷哈希不一致 / `editedAt > 最新确认 at`）即 D16+D25 的机械实现。

**overwrite 的轮次字段**：`createProject({overwrite:true})` 返回 `runSeq = 上一轮 + 1` 与 `supersededFrom = 上一轮`，并把上一轮的 `project.json`/`ledger.json` 归档到 `archive/<旧 runSeq>/`（`auto-project.js` 的 `archiveTaskRun`/`listTaskRuns`）——审计链跨 overwrite 仍可回溯（D27）。

## D20 taskId 签发与预算口径（第 2/3 轮 Info 采纳）

**决策**：服务端默认签发 `auto-<yyyyMMddHHmmss>`，允许客户端覆盖但须过路径安全与字符校验；已存在且无显式 `overwrite` → `AUTO_TASK_EXISTS`。**同一剧本允许并存多个 taskId**（各自独立确认），**预算按 task 隔离、无全局上限**——该口径在确认卡与用户手册明示，不用"看起来更安全"的假全局闸掩盖口径不清。

## D21 驱动器接缝（第 2/3 轮 Info 采纳）

**决策**：自动模式**不经过 pipeline 引擎、不使用 run 快照**，直接调 `production-driver.runProduction` 并注入 `runBatch / probe / emit`：数据载体 = `project.json`（内容真源）+ `ledger.json`（执行真源）；`probe` = `shot_NNN.mp4` 存在性（沿用 `ipc-handlers/film-engineering.js:52-59`）。合成阶段仍走既有 manifest 直通 run（复用流水线引擎），两者边界清晰：**执行不经引擎，合成经引擎**。

## D22 校验时机（第 2/3 轮 Info 采纳）

**决策**：全部输入域校验在 `auto-plan` 完成（越界即拒且**不落盘**）；`auto-start` 只复查归属、taskId 冲突与受控根，不重复解释业务域。

## D23 调用计数对账（第 2/3 轮 Info 采纳）

**决策**：`project.json` 记 `providerCalls`，与台账逐镜状态对账；确认载荷哈希与当前清单不一致 → 拒绝启动并要求重新确认。

## D24 标签导航不引入重定向（对第 1 轮 Critical i1 的最终处置）

**决策**：`/film-engineering` 的 `view` 改为 `FilmEngineeringHubView.vue`；**`/film-engineering/classic` 路由原样保留**（仍指向 `FilmEngineeringView.vue`），作为「无标签直达页」与 Hub 第 3 标签共存。

**理由（可验证，不靠推理）**：
1. `route-registry.js:13-14,26` 支持 redirect 条目且有 3 处先例（`:163/:196/:214`）⇒ 技术上可行——**但**
2. `useTabDocumentTitle.test.js:69` 锁定「非 redirect 路由数 ≥ 32」；把 classic 改为 redirect 会把该数降到 31，**削弱既有棘轮**（属"为了改动方便而放宽门禁"的形态，评审敏感）；
3. 保留该路由**零测试 churn**、零门禁放宽，且手册/深链向后兼容（`01-docs/FILM-ENGINEERING-PIPELINE-OPERATIONS-2026-10-09.md` 多处引用该路径）。
4. 画布工具栏按钮在 `embedded` 模式下 `emit('open-classic')`（切标签），独立模式下保持 `router.push('/film-engineering/classic')`。

**取舍**：入口略多于"纯重定向"方案（多一个无标签直达页），换取零门禁放宽与零引用破坏。

## D25 门禁判定的是「镜头集合」而非调用计数器（第 2 轮 Critical i1/i2 的处置）

**决策**：`providerCalls` 是**观测/对账计数器**，**不是授权令牌**；授权判定发生在**派发开始之前**（每次 `auto-start` / `auto-regenerate-shot` 调用一次，检查 `editedAt <= confirmedAt` 与载荷哈希一致），批内并发（`PRODUCTION_BATCH_CONCURRENCY=2`）不放大授权范围——因为授权对象是"这一组镜头与参数"，不是"N 次调用额度"。

**为什么不用额度计数器**：额度式授权（`consumed < authorizedCalls`）在并发派发下需要"先原子预留再发请求"的临界区，且要求预留不可回滚（第 2 轮 i1/i2 的攻击面）。本方案用"集合 + 时间戳/哈希"判定，天然无该竞态：编辑即失效、确认即重新授权。
**计数写序**：`project.json` 的 `counters.providerCalls` 在**派发前**原子自增（`.tmp`+rename），台账逐镜状态在**批后**写入 ⇒ 崩溃窗口内计数器可能大于台账已完成数；该差值由 `auto-status` 如实暴露（对账口径见 D30），不作静默修正。

## D26 planId 与载荷哈希的构成（第 2 轮 i3/i4 采纳）

**决策**：
- `planId = plan-<sha256(taskId|scriptHash|refsFingerprint|aspect|seconds|targetDuration|providerId) 前16hex>`——**参考图/人物图指纹与 provider 参与 key**，配置不同即 planId 不同。
- `payloadHash = sha256(shots[(shotId,promptHash,seconds,refPaths)] 序列 + aspect + seconds + providerId)`——**分镜身份与顺序纳入哈希**，同脚本换分镜划分即哈希不同。
- `auto-start` SHALL 复核 planId 与 payloadHash 一致才启动。

## D27 overwrite 语义与审计链不断裂（第 2 轮 i5 + 第 3 轮 i3 采纳）

**决策**：`overwrite=true` **只覆盖计划与项目文件**（同 taskId 的新一轮）；旧 `confirmations[]` 与旧 `ledger.json` SHALL 归档为 `<taskId>/archive/<runSeq>/` 并在新段记录 `supersededBy` 指针；新确认段与旧段以 `runSeq` 切分，禁止解引用错配。审计链（哪次调用对应哪次确认）跨 overwrite 仍可追溯。

## D28 全局并发上限：自动模式单飞（第 2 轮 i8 采纳）

**决策**：**同一时刻只允许一个自动模式任务在跑**（模块级 single-flight 注册表）：已有任务处于 `running/composing` 时，新的 `auto-start` 返回 `AUTO_TASK_BUSY` 并在前端提示"已有任务在运行，请等待或停止后重试"。**理由**：与其公布"无全局上限"的口径，不如用一个可解释、可测试的硬约束把总量风险封顶；自动模式本就是重任务（单镜 ~5min），串行不损失实际吞吐。
**`AUTO_PLAN_EXPIRED` 判定**（三条件任一）：① 落盘超过 TTL 24 小时；② 已被同 taskId 的更新计划取代；③ 已被成功 start 消费。

## D29 驱动器接缝的唯一跳过入口（第 2 轮 i6 采纳，附源码取证）

**决策**：`runProduction` 的"跳过已完成"判定**唯一入口是注入的 `probe`**：`resolveResumePlan(ledger, { probe })`（`production-driver.js:91-103`）与 `buildRenderManifest(ledger, { probe })`（`:116-142`）都不读 run 快照、不读流水线引擎状态、不自行探测磁盘。因此"不经 pipeline 引擎"的接缝成立，注入 probe 不会被旁路，也不存在双重判定。
**接缝的回归保护**：新增用例断言 `runProduction` 在只注入 probe 的情况下完成续跑（并断言 `runBatch` 未被对已齐镜调用）。

## D30 产物与计数的对账口径（第 3 轮 i1/i2 采纳）

**决策**：
- **产物轻量校验**：续跑将跳过的镜，除存在性外增加"大小 > 0"校验；并对最多 3 镜抽样 `ffprobe`（沿用 `film-render.js:41-62` 的 `probeClip`），失败即视为缺失并重生成（防止外部替换/半写文件被静默采信）。
- **in-flight 收敛**：被杀进程留下的 `running` 镜，续跑经 `probe` 判定——磁盘缺失 → 重跑；磁盘完整 → 归一为 `done`（`production-driver.js:207-215` 既有语义），无需人工干预。
- **对账暴露**：`auto-status` 返回 `counters.providerCalls`、台账逐镜状态汇总与差值 `mismatch`（崩溃窗口的正常产物），**如实显示不修正**。


