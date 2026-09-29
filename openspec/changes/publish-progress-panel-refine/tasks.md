# Tasks: publish-progress-panel-refine

## 1. 取消链路端到端（TDD 先红后绿）

- [x] 1.1 `electron/services/publish-progress-events.test.js` 扩展：`phase:'cancelled'` 原样通过（不被归一为 progress）
- [x] 1.2 `electron/bootstrap/phase4-events.test.js` 扩展：`task:cancelled` → emitter 发 `{ phase:'cancelled', taskId, platform, batchId }`（含反证：摘转发必红）
- [x] 1.3 `publish-progress-events.js`：PHASE_ENUM 加 `cancelled`
- [x] 1.4 `phase4-events.js`：新增 `task:cancelled` 监听转发（stage `⊘ 已取消`）

## 2. 渲染层 store（TDD 先红后绿）

- [x] 2.1 `src/stores/publishProgress.test.js` 扩展：cancelled 相位终态迁移/吸收态/会话 done 判定；aggregate 含 cancelled 计数；`cancelRunning()` 逐任务调 `queue:cancel`、返回 {ok,fail}、防重入、无在途任务 no-op
- [x] 2.2 `publishProgress.js`：PHASE_ENUM/TERMINAL_PHASES 加 cancelled；aggregate 加 cancelled；`cancelRunning()` + `cancelling` 标志；`retryOne(sessionId, taskId)` 单任务重试（retryFailed 复用同一路径）

## 3. 任务行重构（dot-stepper + 网格 + 内联操作）

- [x] 3.1 `PublishProgressTaskRow.vue`：固定网格（平台|状态|步骤/明细/错误|百分比右对齐|操作）；dot-stepper（6 点+连线+当前步词）；success 去 100%；queued 不渲染步骤链；failed 行内联重试/复制按钮（emit 上抛）；cancelled 中性态；当前步脉冲+成功 pop-in（reduced-motion 关闭）
- [x] 3.2 面板测试扩展：dot 数量/当前步词/无 100%/queued 无链/失败行按钮 emit/已取消渲染

## 4. 面板重构（去重 + footer + 自动收敛）

- [x] 4.1 `PublishProgressPanel.vue`：汇总行「成功 N/M · F 失败 · C 已取消」；单会话扁平化（去卡中卡/去会话徽标）；多会话分组卡+点徽标；fallback 标题带时间；footer 警示条+「取消全部任务」两步内联确认；自动收敛（5s/pointerdown 取消/仅全成功）；单任务重试/复制错误接线
- [x] 4.2 `PublishProgressPanel.test.js` 扩展：汇总口径、单/多会话形态、footer 取消两步流（fake timers）、自动收敛触发/取消/失败不收敛、复制错误 toast

## 5. i18n 与文档

- [x] 5.1 `locales/zh.js`+`en.js` 成对：`summarySucceeded`/`summaryCancelled`/`statusCancelled`/`cancelAll`/`cancelConfirm`/`cancelling`/`cancelPartial`/`copyError`/`copied`/`copyFailed`/`retryTask`/`sessionTitleTimeFallback`；删 `summaryDone`/`sessionTitleFallback`
- [x] 5.2 `01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md` 契约修订：§5.1/§5.2/§6.1（phase 枚举+cancelled）/§7/§8.1（自动收敛）/§8.2（显示项）/§8.3（状态表+cancelled 行）/§8.4（文案表）/§12（测试清单）
- [x] 5.3 新建 `01-docs/PRD-PUBLISH-PROGRESS-PANEL-REFINE-2026-09-29.md`（本变更专题 PRD：问题清单/方案/验收）
- [x] 5.4 `AGENTS.md` QM-2「发布进度事件双边界与富化契约」补 `task:cancelled` 终态来源与 cancelled 相位
- [x] 5.5 `CHANGELOG.md` 收口

## 6. 门禁与交付

- [x] 6.1 回归锁全绿：`publish-stage-map.test.js` + `publish-progress-events.test.js` + `phase4-events.test.js` + `src/stores/publishProgress.test.js` + `PublishProgressPanel.test.js` + `usePublishFlow.test.js`（受影响面）
- [x] 6.2 `check-locale-sync.js` 三项 PASS
- [x] 6.3 eslint 改动文件 0 error 0 warning
- [ ] 6.4 视觉：浮窗为 Teleport 动态浮层不在像素基线内，按口径如实登记；/publish 既有视图基线无回归（CI QG Visual 验证）
- [ ] 6.5 `.quality-gates.md` 置顶执行记录（含反证矩阵）——按 2026-09-29 定档由合并后 docs-only PR 回填
- [ ] 6.6 提交推送 + PR + CI 绿
