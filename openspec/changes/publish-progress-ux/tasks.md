# Tasks: publish-progress-ux

## 1. 主进程事件富化层（TDD 先红后绿）

- [x] 1.1 新增 `electron/services/publish-progress-events.test.js`：emitter payload 形状（phase/stageKey/percent/batchId/timestamp + 既有字段保留）、win 销毁/非法参数守卫、`createTaskProgressRouter` 登记/注销/last-write-wins/未知平台忽略
- [x] 1.2 新增 `electron/services/publish-stage-map.test.js`：全量已知阶段串 → stageKey、前缀规则（✓/✗/⏳/⟳）、未知串 → detail、封闭清单锁（新增串必须登记）
- [x] 1.3 实现 `electron/services/publish-progress-events.js`（mapStageToKey + createPublishProgressEmitter + createTaskProgressRouter）
- [x] 1.4 `bootstrap.js`：executor 发 `phase:'start'`；`rpaViewManager.onProgress` 全局注册一次 + router 接线；删除 executor 内 `emitProgress('✓ 发布成功')`（终态单一来源 phase4-events）；executor 传 onProgress 给 publisher.publish（ApiPublisher 轨）
- [x] 1.5 `publisher-router.js` ApiPublisher：`options.onProgress` 透传 `publishViaApi`（RpaVmPublisher 忽略之，进度走 rpaViewManager 全局链）
- [x] 1.6 `phase4-events.test.js` 扩展：四事件富化字段断言 + task:failed 落历史（含反证：摘 addRecord 必红）
- [x] 1.7 `phase4-events.js`：四事件改走 emitter；task:failed 补 `history.addRecord({ status:'failed', error })`

## 2. 关窗保护（托盘后台继续）

- [x] 2.1 `window-close-policy.test.js` 扩展：`hasRunningPublish` 判据矩阵（pipeline/publish/tray 三变量八组合）
- [x] 2.2 `window-close-policy.js`：`shouldHideToTrayOnClose` 接受 `hasRunningPublish`，`(hasRunningPipeline || hasRunningPublish) && trayAvailable`
- [x] 2.3 `window.js` `shouldHideToTray`：从 `context.taskQueue.getStatus()` 计算 running+queue（try/catch 守卫同流水线）；close 日志区分发布/流水线
- [x] 2.4 `system-tray.js` 新增 `showBalloon(title, content)`（Windows-only + tray 存活守卫）；`window.js` 发布隐藏时调用（「发布仍在后台进行，请勿退出程序」）
- [x] 2.5 `system-tray` 气泡单测（mock Tray 断言 displayBalloon 调用 + 非 win32 跳过）

## 3. 渲染层全局 store

- [x] 3.1 新增 `src/stores/publishProgress.test.js`：会话注册（taskIds/batchId 两轨）、事件路由（按 taskId→batchId→孤儿会话）、phase 状态机迁移、终态判定、会话列表上限裁剪、queue:status 孤儿领养、retryFailed 调 IPC 并替换新 taskId、最小化记忆（localStorage）、首次隐藏 toast 标志
- [x] 3.2 实现 `src/stores/publishProgress.js`（pinia）：init() 全局订阅一次、registerSession、handleProgressEvent、handleBatchEvent、retryFailed、minimize/expand/dismiss、getters（aggregate/hasRunning/failedCount）
- [x] 3.3 回归锁（QM-5 ④）：「IPC 返回后到达的进度事件仍更新 store 状态」——监听器死亡 bug 的防再犯测试

## 4. 全局面板组件

- [x] 4.1 新增 `src/components/PublishProgressPanel.test.js`：展开浮卡/最小化胶囊两态渲染、最小化触发首次 toast（仅一次）、胶囊常驻「请勿关闭应用」提示、会话×任务行渲染（stageKey 标签 + percent + 失败红标 + 错误行）、重试失败项按钮（调 store.retryFailed）、运行中禁用关闭、非模态负向锁（源码无 suspendEmbeddedViewsForOverlay）
- [x] 4.2 实现 `src/components/PublishProgressPanel.vue`：Teleport body、右下 fixed（避让 BackToTop/UpdateNotification 的 z-index/占位口径）、tokens.css 语义 token、状态文字+图标双通道、prefers-reduced-motion
- [x] 4.3 `App.vue` 全局挂载 `<PublishProgressPanel />`（与 PipelineBackgroundToast 同级）+ 面板 setup 内 store.init()

## 5. 页面 composables 改造（修监听器死亡 bug）

- [x] 5.1 `usePublishFlow.test.js` 改写：不再订阅 onProgress（旧「只释放一次」锁替换为新契约锁）+ publishBatch 成功后 registerSession + 会话终态驱动 result 卡（成功/失败汇总）+ 时间线终态条目
- [x] 5.2 `usePublishFlow.js`：删除本地 onProgress 块与 finally off()；registerSession；watch 会话终态 → result.value/时间线
- [x] 5.3 `useBatchPublish.test.js` 改写：删除阶段级本地监听断言 + batchExecute 后 registerSession(batchId) + 既有 batch:progress 页面卡行为不回归
- [x] 5.4 `useBatchPublish.js`：删除阶段级 onProgress 监听（原本就收不到事件）；batchExecute 成功后 registerSession

## 6. i18n 与文档

- [x] 6.1 `locales/zh.js` + `en.js` 成对新增 `publishPage.publishProgressPanel.*` 全量文案（标题/最小化/展开/关闭/提示/首次 toast/阶段标签×9/相位标签×7/汇总模板/重试/恢复会话标题）
- [x] 6.2 新建 `01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md`（专题 PRD：背景根因/目标非目标/流程/功能逻辑/数据模型与校验/IPC 契约/交互逻辑与显示项/提示文字全表/异常态矩阵/验收标准/测试策略/Bug 反思 5 步/已知限制）
- [x] 6.3 `01-docs/PRD.md`：§六新增 6.7 小节 + 文件头功能文档索引 + §19.2 子 PRD 登记
- [x] 6.4 `01-docs/PRD-OVERLAY-VIEW-SUSPENSION-2026-09-23.md` §5 通查清单补登（PublishProgressPanel 非模态不接入 + 理由）
- [x] 6.5 `AGENTS.md` QM-2 新增「发布进度事件双边界与富化契约」条目（QM-5 ⑤ 预防措施）
- [x] 6.6 `CHANGELOG.md` + `01-docs/learnings.md` 置顶条目（含监听器死亡 bug 5 步反哺）

## 7. 门禁与交付

- [x] 7.1 全量相关测试绿（vitest：新增 4 文件 + 扩展 4 文件 + 受影响面）
- [x] 7.2 `check-locale-sync.js --pair-base origin/main` + `--cjk` + `--keys` PASS
- [x] 7.3 eslint 改动文件 0 error 0 warning
- [x] 7.4 视觉回归：既有像素基线无回归；面板状态基线（框架可注入态则新增，否则按口径如实登记）
- [x] 7.5 QM-1 打包验证：`electron-builder --win --dir --publish never` + asar 清单含新模块 + 启动 8 秒 stderr 无新错（打包脏化的 preload bundle 按 R2 精确还原）
- [x] 7.6 `.quality-gates.md` 置顶执行记录（含 QM-5 五步 + 反证矩阵 + 行尾对账）
- [x] 7.7 提交推送 + `gh pr create --auto --squash` + CI 绿 + auto-merge 合并确认
- [x] 7.8 记忆三路写入（内置记忆 / 外部记忆 learnings.jsonl / EverOS）+ 回读确认
