# film-auto-mode — 任务清单

> 纪律：**先写测试（红）→ 实现（绿）→ 重构**；每个任务完成后回填证据（命令 + 结果）。

## 1. 结构（三标签 Hub）

- [x] 1.1 新增 `views/FilmEngineeringHubView.vue`：三标签（自动/画布/工程案例）、`role="tablist"`、键盘可达、默认 `auto`
- [x] 1.2 URL 双向绑定 `?tab=`（`router.replace`）+ `mountedTabs` 懒挂载
- [x] 1.3 `FilmCanvasView.vue` 加 `embedded` prop（默认 false 行为不变）；工具栏「经典视图」→「工程案例」
- [x] 1.4 `FilmEngineeringView.vue` 加 `embedded` prop（隐藏 h1/subtitle）
- [x] 1.5 路由改造：`/film-engineering` 的 `view` 改为 `FilmEngineeringHubView.vue`（`router/index.js:52` + `route-registry.js:303` 同步）；**`/film-engineering/classic` 路由保持原样**（不引入 redirect，见 design D24）；画布按钮 embedded 下 `emit('open-classic')`
- [x] 1.5b 门禁不变式核验：`useTabDocumentTitle.test.js` 的「非 redirect 路由数 ≥32」与 `href-scheme-contract.test.js` 六站点锁**均无需修改**即通过（若需改即为方案偏离，回退重议）
- [x] 1.6 测试：Hub 标签切换/URL 同步/懒挂载/embedded 默认值；既有画布与工程页测试全跑
- [x] 1.6b embedded 等价性锁：**证据口径收窄**——默认 props 挂载两个既有视图的行为与独立路由一致（`FilmCanvasView.actions.test.js` 8 + `useTabDocumentTitle.test.js` 13 全过；Hub 测试断言 `embedded=true` 传递与 `open-classic` 事件）；未加渲染快照，留待 T5 视觉阶段补
- [x] 1.7 locales zh/en 成对（标签文案 + 面板文案）：`filmEngineering.hub.*` / `filmEngineering.auto.*`；`check-locale-sync --keys` PASS(1500) + `--cjk` PASS

> 实现说明：按 design D1/D24 **未抽取**既有视图为 Panel——Hub 直接以 `embedded=true` 内嵌 `FilmCanvasView.vue` / `FilmEngineeringView.vue`，故 1.1 的产物是 `FilmEngineeringHubView.vue` 容器本身。
> 提交：`c1801ddb5`（方案 + T1 结构 + 测试）。门禁证据：`check-route-registry` PASS（35 路由/登记一致）、Hub 契约测试 9/9、既有 21/21。

## 2. 后端规划层（auto-plan / auto-project）

- [x] 2.1 测试先行：`auto-plan.test.js`（42 条：时长规划矩阵、`MAX_AUTO_SHOTS=120` 上限、K<N 只做句级拆分、K>N 只在时长规划合并、合并不丢字、非法参数）
- [x] 2.2 实现 `auto-plan.js`：`planAutoShots()`（时长规划 + 分场 + 模板映射，复用 `ScriptAdapter.buildTemplatePrompt`/`splitScript`）
- [x] 2.3 测试先行：角色检出（显式标记/对话动词/频次/用户标注优先/空检出占位/停用词不误判）
- [x] 2.4 实现角色检出 + 槽位映射（`ROKO/JAXX/LULU/REIN` 降序填充）
- [x] 2.5 测试先行：参考图绑定（人物命中/场景轮转/≤2 张/provider 不支持→W1/越界路径拒绝）
- [x] 2.6 实现绑定 + 警告清单（W1–W5）
- [x] 2.7 测试先行：`auto-project.js`（14 条：原子写、TTL/consumed/归属、损坏 fail-closed、overwrite 归档、patch 校验、确认历史 append-only、needsReconfirm、计数对账）
- [x] 2.8 实现项目文件读写与校验（含确认历史、providerCalls、归档轮次）
- [x] 2.9 指纹与哈希（D26）：`buildShotFingerprint` / `buildPayloadHash` / `buildPlanId` 参与位单测（含 taskId/参考图指纹/provider 变更即换 key）

## 3. 后端执行层（IPC + runner）

- [x] 3.1 测试先行：`film-engineering-auto.test.js`（18 条：6 通道 sender 校验 + 入参矩阵 + 错误码 + **确认前 provider 调用 = 0**）
- [x] 3.2 实现 `film-engineering:auto-plan`（零 provider 调用；返回**预览投影**——只有 `promptPreview/promptLength`，完整提示词只留在服务端计划文件里，避免 120×KB 级 IPC 负载）
- [x] 3.3 实现 `film-engineering:auto-start`（落项目文件）。**实现口径调整**：首次/续跑未确认时返回 `{code:0, data:{started:false, needsReconfirm:true, payloadHash}}` 而非错误码 `AUTO_NOT_CONFIRMED`——渲染端要据 `needsReconfirm` 弹确认卡而不是弹错误；错误码仅用于拒绝（`AUTO_PLAN_EXPIRED`/`AUTO_PLAN_MISMATCH`/`AUTO_TASK_EXISTS`/`AUTO_TASK_BUSY`/`AUTO_BAD_PARAM`）
- [x] 3.4 实现 `film-engineering:auto-status`（只读，项目+台账+磁盘+manifest+计数对账）
- [x] 3.5 实现 `runAutoBatch`（`auto-runner.js`：从**项目文件**取 prompt/refPaths/seconds → `generateShotVideo`），复用 `production-driver`（`runOnlyBatch=null`，`runIdFor='auto/<taskId>/b<N>'`）
- [x] 3.6 实现 `film-engineering:auto-update-shot`（prompt ≤50000 非空、refPaths 受控根校验、seconds 枚举、patch 字段白名单、越界拒绝且不改动）
- [x] 3.7 实现 `film-engineering:auto-regenerate-shot`（按「全局镜号→批号/批内号」定位，先编辑落盘再单镜重生成并覆盖 `shot_NNN.mp4`）
- [x] 3.7b 成本门槛绑定所有调用通道：`editedAt > 最新确认` 时 `auto-start` 与 `auto-regenerate-shot` 均先返回「需重新确认」，未确认前零调用（IPC 层已各有一例）
- [x] 3.7c append-only `confirmations[]`（`at` + `payloadHash` + `shotsFingerprint` + `planVersion`）+ 最新一条为基准 + 历史只追加（含第二条追加用例）
- [x] 3.7d `providerCalls` 派发前自增 + `reconcileCounters` 对账（单测）；载荷哈希不一致触发重新确认已有用例。**缺口**：计划哈希被篡改导致「载荷哈希不匹配即拒绝」的独立 IPC 负向用例留待 T7 收口（现由 `needsReconfirm` + 参考图越界拒绝两例间接覆盖）
- [x] 3.7e 校验时机：全部输入域校验在 `auto-plan`（越界即拒不落盘）；`auto-start` 复查归属/taskId/**计划内 refPaths 受控根**（纵深防御，篡改计划即 `AUTO_BAD_PARAM` 拒绝启动，有用例）
- [x] 3.8 实现 `film-engineering:auto-compose`。**实现口径调整（D31）**：服务端做「台账 + 磁盘」双判据的收口清单校验并返回 `renderManifest`，合成 run 仍由渲染端经既有 `pipelineStartOrchestrated` 发起——避免在 IPC 层复制第二套引擎启动路径
- [x] 3.9 事件 `film-engineering:auto-update`（复用 driver 的 `EVENT_MERGE_MS` 节流，负载只带计数）；**停止已实现**（审查倒查驱动）：`production-driver.shouldStop` 批间生效（未开始的批保持 pending ⇒ 停下即可续跑；钩子抛错 fail-open）+ `film-engineering:auto-stop` 通道（只对运行中任务置标志，结束后幂等清理）+ 面板 `fa-stop` 按钮
- [x] 3.13 **续跑语义修正（审查倒查发现的致命缺陷）**：计划在首次启动即被消费（防重放），而原续跑路径仍要求 `readPlan` ⇒ 任何真实中断后都无法续跑。修法：续跑不再依赖计划——同名任务存在即走续跑分支，内容真源为**项目文件**；`planId` 仅新建时需要；不一致且未显式 `overwrite` → `AUTO_PLAN_MISMATCH`
- [x] 3.9b 计划归属校验：`planId = 'plan-' + sha256(taskId|scriptHash|refsFingerprint|aspect|seconds|targetDurationSec|providerId).slice(0,16)`、计划内记录 taskId、`AUTO_PLAN_MISMATCH` / `AUTO_PLAN_EXPIRED` / `AUTO_TASK_EXISTS` 负向用例齐备（含计划被消费后二次启动）
- [x] 3.9c 续跑成本再确认：`editedAt`（内容变更时间）+ 最新确认 `at` 的时间戳规则 + 「编辑后续跑必须先重新确认」用例（`needsReconfirm` 三判据单测 + IPC 用例）
- [x] 3.9d 重生成原子覆盖：临时目录生成 → `probeClip`（ffmpeg/ffprobe）校验 → `rename` 覆盖；**校验失败不得破坏既有产物**（用例断言旧文件内容不变）；半写文件不被磁盘复核判为完成由 driver 的 probe 兜底
- [ ] 3.9e 磁盘缺单镜只重生成该镜（不使计划失效，项目文件/计划文件不被改写）用例 — 能力已具备（`regenerateOneShot` 按镜索引），缺一条「缺镜→只重生成该镜→台账/计划不变」的显式用例
- [x] 3.9f 原文直送防回归：`auto-runner` 用例断言生成函数收到的是**项目文件里的 prompt 原值**（`PROMPT-0`）；提示词优化器未被调用由 `video-gen.test.js:74` 的 `CONTRACT VIOLATION` 锁保证（同一 `buildShotSubmitPayload` 提交路径）
- [x] 3.10 preload（6 方法 + 1 订阅）→ **`pnpm run build:preload` 重建 bundle** → `preload.test.js` 计数断言 17→**24** 且新增 6 条 invoke 转发行
- [x] 3.11 `license-access-control.js` 公开清单登记 6 通道（`preload.test.js` 断言 `requiredLevelForChannel('film-engineering:auto-*') === 'public'`）
- [ ] 3.12 集成测试：plan → start（假 provider）→ 台账 → manifest → 真实 ffmpeg 出 `final.mp4`（留待 T7 与 CDP 真机 E2E 一并）

## 4. 前端自动模式

- [x] 4.1 状态机：`input → preview → running → done`（**实现口径**：状态机落在面板内而非单独 `useFilmAuto.js`——面板是唯一消费者，抽出 composable 只会多一层无收益的间接；事件优先 + 3s 轮询兜底 + taskId 归属（`autoStatus({taskId})`）已具备）
- [x] 4.2 `FilmAutoPanel.vue`：5 项输入 + 校验 + 实时预估行 + 计划确认卡（含警告/预估/批次/Provider/角色映射/逐镜预览）。**实现口径**：任务 ID 在确认卡上**只读展示**（由服务端在 auto-plan 时生成或按传入值派生，并参与 planId 归属哈希）——允许改 ID 会让 planId 与归属失配，需要时可重新规划
- [x] 4.3 进度区：`StageProgress` 复用（**testidPrefix='film-auto'**，产出 `film-auto-stage-list` 等；原计划写 'film-auto-stage' 会拼成 `film-auto-stage-stage-list`，故按组件 `tid(suffix)` 语义取 'film-auto'）+ 已完成/总数 + 逐镜状态表
- [x] 4.4 完成态：`final.mp4` 预览 + 打开文件夹/另存为（复用 `story2videoShowInFolder` / `story2videoSaveAs`）。**实现**：成品路径取自合成 run context 的 `render.finalPath`（`pipelineGetRunContext` 轮询 + `onPipelineUpdate` 推送，推送路径带 **runId 守卫**防陈旧事件覆盖）；本地 URL 由 `file-url.js:toFileUrl` 统一拼装（Windows 三斜杠 / POSIX / UNC 三档，有用例）
- [x] 4.6 收敛语义修正（本轮测试暴露的真 bug）：收口条件由「全部完成」改为「**不再运行 且 每镜都有结论（完成或失败）**」——原写法下部分失败的任务永远停在运行态，片段编辑与收口入口都不可达，「生成后可修改片段」的闭环断掉；现有「部分失败也算收敛」用例锁定
- [x] 4.5 前端单测（14 条）：表单校验、确认前不发 start、**负载只含 {planId,taskId,confirmed,overwrite}**、needsReconfirm 回确认卡、IPC 失败回显、事件推进进度、收口复用既有 pipeline 通道、编辑/重生成负载、参考图上限、卸载取消订阅。**缺口**：续跑入口（同 taskId 再进面板自动恢复进度）无显式用例

## 5. 片段编辑

- [x] 5.1 片段编辑入口 + 编辑区：逐镜列表在面板内（序号/状态/失败原因/操作），点击进入 `FilmAutoSegmentEditor.vue`（提示词/时长/预览/恢复原文）。**实现口径**：列表不重复实现两份，编辑器只做单镜深编辑
- [x] 5.2 编辑保存（`auto-update-shot`）+ `changed` 脏标记 + 「恢复原文」+ 保存后关闭并由 `auto-status` 刷新
- [x] 5.3 三动作接线：单镜重生成（`auto-regenerate-shot`，显式 `confirmed:true`）、失败重试（同通道，按镜号）、重新合成（`auto-compose` → 既有 pipeline 通道）
- [x] 5.4 块结构检查提示（缺 GEO/AUDIO 等块时黄提示、**不阻断保存**）：`auto-prompt-blocks.js` 的 `checkPromptBlocks`（块标题须**独占一行**才算，避免正文偶然提及误判）+ 与后端 `shot-library.js:BLOCK_HEADINGS` 的**源码文本对账锁**防双份清单漂移
- [x] 5.5 前端单测：编辑-保存-重生成链路（面板级）+ `FilmAutoSegmentEditor` 独立用例 9 条（草稿/脏标记/必填与超长拒绝/只提交变化字段/重生成独立事件/块提示/预览 URL/null 片段不崩）+ 缺镜前置拦截 4 条（**改为**「缺镜时禁用收口并直接列出缺失镜号」，比点击后才报错更早、更明确）
- [x] 5.6 **审查倒查驱动的界面闭环**（用户手册核对发现"文案承诺了界面没有的能力"）：停止按钮（`fa-stop`）+ 重新打开自动恢复上次任务（`film-auto:last-task-id` + `auto-status`，未收敛回确认卡）+ 同名任务冲突时的「覆盖」勾选框（`fa-overwrite-box`，勾选后带 `overwrite:true`）+ 确认卡渲染「预计占用磁盘 / 预计耗时」（服务端早已返回 `estimates` 却未展示）+ 停止后回确认卡且勾选保持（载荷未变，可直接继续

## 6. 文档

- [x] 6.0 `openspec validate film-auto-mode --strict` 通过（change 五件套结构合法）—— 实测 `Change 'film-auto-mode' is valid`
- [x] 6.1 `01-docs/PRD-FILM-AUTO-MODE-2026-10-09.md` 按评审意见定稿：升级为 v3，新增 **§14 实现定稿（as-built）**——文件清单（新增 10 / 最小改动 12）、IPC 契约表（6 通道 + 1 事件的入参/返回/错误码全集）、落盘物形状与真源优先级、验证证据表、**8 项落地口径调整**（含实现期新增的 2 条）、显示项与 locale key 对照表、已知缺口 G1–G6、明确不做清单
- [ ] 6.2 用户手册增补：`01-docs/USER-MANUAL-FILM-ENGINEERING-AUTO-2026-10-09.md`（自动模式操作 + 三标签 + 片段编辑 + 排障）——编撰中
- [x] 6.3 `CHANGELOG.md` 条目：背景 / 改动（三标签 + 后端四层 + 前端 + 最小改动清单）/ 三条不变量 / 验证 / 已知缺口
- [ ] 6.4 `openspec/specs/film-engineering/spec.md` 归档同步（archive 时）

## 7. 验证

- [x] 7.1 目标测试全绿：后端定向 26 文件 **740** 用例、auto IPC 20、film-auto 前端 41、Hub 9、StageProgress 前缀 4、story2video 源码锁 5、locales 结构锁 4
- [x] 7.2 全量回归（受影响面）：`check-locale-sync --keys/--cjk`、`check-route-registry`、`check-doc-abs-paths`、`check-no-brand-residue`、`check-gate-record-debt`、`check-pr-exec-record` 全 PASS/OK
- [x] 7.3 QM-1 打包：`electron-builder --win --dir --publish never` **exit 0** + asar 清单校验（4 个后端新文件与两份 preload bundle 在包内）+ 启动冒烟无失败特征
- [x] 7.4 QM-4 视觉：由真机 CDP E2E 在真实 Element Plus 渲染下逐项断言三标签与面板并截图留证（无独立视觉基线需求）
- [x] 7.5 CDP E2E：真机 dev + 独立已登录 profile 跑**30 场长文剧本**全链路 —— Phase 1（零 provider 调用）**22/22**、Phase 2（真实出片）**22/22**；驱动与夹具入库（`apps/desktop/tests/e2e/film-auto-mode-driver.js` + `fixtures/film-auto-long-script.txt`）。**该 E2E 抓到 1 处真缺陷（auto-start 同步等待整轮）并促成修复**；**环境限制**：默认视频模型无可用通道 ⇒ 成功出片路径未验证（G8）
- [ ] 7.6 CCG 验证层复评（`deep-review.sh`）—— 决策层已 4 轮收敛；验证层复评未跑（本变更的三道独立核对已覆盖同类风险面：实现期测试 / 手册履约核对 / 真机 E2E）

## 8. 交付

- [x] 8.1 `.quality-gates.md` 记录 + `openspec/records/film-auto-mode.md`（含 frontmatter 三字段与账本登记，`check-gate-record-debt` → OK）
- [x] 8.2 记忆沉淀：内置 `.agent_context/film-auto-mode.md`（gitignore，本机）/ 外部 `01-docs/learnings.md`（三条经验）/ EverOS（6 条记忆 `add`+`flush`，`flush=extracted`，落盘 `~/.everos/default_app/multi-publish/users/film-auto-mode/` 已复核）
- [ ] 8.3 推送 → PR **#3234** → CI 全绿 → 自动合并 → 回填销账（进行中）
