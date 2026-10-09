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
- [x] 3.9 事件 `film-engineering:auto-update`（复用 driver 的 `EVENT_MERGE_MS` 节流，负载只带计数）；**缺口**：用户「停止」标志（批间生效）未实现，与 T4 的停止按钮一并落地
- [x] 3.9b 计划归属校验：`planId = 'plan-' + sha256(taskId|scriptHash|refsFingerprint|aspect|seconds|targetDurationSec|providerId).slice(0,16)`、计划内记录 taskId、`AUTO_PLAN_MISMATCH` / `AUTO_PLAN_EXPIRED` / `AUTO_TASK_EXISTS` 负向用例齐备（含计划被消费后二次启动）
- [x] 3.9c 续跑成本再确认：`editedAt`（内容变更时间）+ 最新确认 `at` 的时间戳规则 + 「编辑后续跑必须先重新确认」用例（`needsReconfirm` 三判据单测 + IPC 用例）
- [x] 3.9d 重生成原子覆盖：临时目录生成 → `probeClip`（ffmpeg/ffprobe）校验 → `rename` 覆盖；**校验失败不得破坏既有产物**（用例断言旧文件内容不变）；半写文件不被磁盘复核判为完成由 driver 的 probe 兜底
- [ ] 3.9e 磁盘缺单镜只重生成该镜（不使计划失效，项目文件/计划文件不被改写）用例 — 能力已具备（`regenerateOneShot` 按镜索引），缺一条「缺镜→只重生成该镜→台账/计划不变」的显式用例
- [x] 3.9f 原文直送防回归：`auto-runner` 用例断言生成函数收到的是**项目文件里的 prompt 原值**（`PROMPT-0`）；提示词优化器未被调用由 `video-gen.test.js:74` 的 `CONTRACT VIOLATION` 锁保证（同一 `buildShotSubmitPayload` 提交路径）
- [x] 3.10 preload（6 方法 + 1 订阅）→ **`pnpm run build:preload` 重建 bundle** → `preload.test.js` 计数断言 17→**24** 且新增 6 条 invoke 转发行
- [x] 3.11 `license-access-control.js` 公开清单登记 6 通道（`preload.test.js` 断言 `requiredLevelForChannel('film-engineering:auto-*') === 'public'`）
- [ ] 3.12 集成测试：plan → start（假 provider）→ 台账 → manifest → 真实 ffmpeg 出 `final.mp4`（留待 T7 与 CDP 真机 E2E 一并）

## 4. 前端自动模式

- [ ] 4.1 `useFilmAuto.js`（状态机 idle→planning→planned→running→composing→done/failed/cancelled；事件优先 + 3s 轮询 + taskId 守卫）
- [ ] 4.2 `FilmAutoPanel.vue`：5 项输入 + 校验 + 实时预估行 + 计划确认卡（含警告/预估/任务 ID）
- [ ] 4.3 进度区：`StageProgress`（`testidPrefix='film-auto-stage'`）+ 当前批/镜 + 已完成镜列表
- [ ] 4.4 完成态：`final.mp4` 预览（`story2videoCreateShareUrl` 本地 URL 范式）+ 打开文件夹/另存为（复用既有 `story2videoShowInFolder` / `story2videoSaveAs`）
- [ ] 4.5 前端单测：表单校验矩阵、状态机转移、确认前不发 start、失败态与续跑入口

## 5. 片段编辑

- [ ] 5.1 `FilmAutoSegmentEditor.vue`：列表（序号/状态/提示词摘要/路径/时长）+ 行内编辑
- [ ] 5.2 编辑保存（`auto-update-shot`）+ dirty chip + 保存后清除
- [ ] 5.3 单镜重生成 / 失败重试 / 重新合成 三动作接线
- [ ] 5.4 块结构检查提示（缺 GEO/AUDIO 黄提示不阻断）
- [ ] 5.5 前端单测：编辑-保存-重生成链路、缺失镜时合成按钮禁用 + 缺失序号展示

## 6. 文档

- [ ] 6.0 `openspec validate film-auto-mode --strict` 通过（change 五件套结构合法）
- [ ] 6.1 `01-docs/PRD-FILM-AUTO-MODE-2026-10-09.md` 按评审意见定稿（字段级规格/校验/文案/错误码/交互/显示项）
- [ ] 6.2 用户手册增补：`01-docs/USER-MANUAL-FILM-ENGINEERING-AUTO-2026-10-09.md`（自动模式操作 + 三标签 + 片段编辑 + 排障）
- [ ] 6.3 `CHANGELOG.md` 条目
- [ ] 6.4 `openspec/specs/film-engineering/spec.md` 归档同步（archive 时）

## 7. 验证

- [ ] 7.1 目标测试全绿（electron vitest + src vitest 相关套件）
- [ ] 7.2 全量回归（受影响的 lint/locale 成对/门禁）
- [ ] 7.3 QM-1 打包（`electron-builder --win --dir --publish never`）+ asar 清单校验
- [ ] 7.4 QM-4 视觉（涉及样式则跑基线）
- [ ] 7.5 CDP E2E：真机/打包产物上跑**长文剧本**自动模式全链路（生成预览 → 确认 → 批次进度 → 片段编辑 → 重新合成），产出报告
- [ ] 7.6 CCG 验证层复评（`deep-review.sh`）

## 8. 交付

- [ ] 8.1 `.quality-gates.md` 记录 + `openspec/records/film-auto-mode.md`
- [ ] 8.2 记忆沉淀（内置 `.agent_context/` / 外部 `01-docs/learnings.md` / EverOS）
- [ ] 8.3 推送 → PR → CI 全绿 → 自动合并 → 回填销账
