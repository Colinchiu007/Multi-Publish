# Design: publish-progress-ux

## 1. 总体架构

```
┌─ 主进程 ────────────────────────────────────────────────────────────┐
│ TaskQueue(maxConcurrent=3)                                          │
│   executor(bootstrap.js) ──┐                                        │
│     · phase:'start' 边界    │                                        │
│     · platform→taskId 路由  ▼                                        │
│   rpaViewManager._emitProgress ──► createTaskProgressRouter          │
│   ApiPublisher.onProgress ──────► publish-progress-events.js         │
│   phase4-events(success/failed/     │ mapStageToKey + emit           │
│                 blocked/retry) ─────┘                                │
│        publish:progress {platform,taskId,stage,                      │
│          phase,stageKey,percent,batchId,timestamp,...} ──► renderer  │
│   task:failed ──► history.addRecord(status:'failed')  ← 新增        │
│   window close ──► shouldHideToTray(+hasRunningPublish) ──► 托盘+气泡 │
└──────────────────────────────────────────────────────────────────────┘
┌─ 渲染层 ────────────────────────────────────────────────────────────┐
│ App.vue（全局挂载，与 UpdateNotification 同级）                       │
│   └─ PublishProgressPanel.vue（非模态浮动卡 / 最小化胶囊）            │
│        ▲                                                            │
│   usePublishProgressStore（pinia）                                   │
│     · init(): onProgress/onBatchProgress 全局订阅一次（不随组件死）  │
│     · registerSession(taskIds|batchId) ← usePublishFlow/useBatchPublish│
│     · queue:status 快照领养孤儿任务（渲染层重载恢复）                │
│     · retryFailed → queue:retry IPC                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. 关键决策

### D1：事件富化在主进程发射层做，不在渲染层猜

`publish:progress` 的发射点只有两处（bootstrap executor + phase4-events），在发射层统一富化（`publish-progress-events.js` 单一实现），渲染层零映射逻辑。理由：两引擎阶段串（RPA 按平台 10+ 英文串、API 固定 4 串）只有发射层看得全；映射表放主进程可被单测锁死，渲染层只消费稳定枚举。

**payload 契约（向后兼容加法）**：
```
{ platform, taskId, stage,            // 既有字段，原样保留
  phase: 'start'|'progress'|'success'|'failed'|'retry'|'blocked',   // 新增
  stageKey: 'prepare'|'upload'|'fill'|'submit'|'verify'|'waiting'|'done'|'failed'|'detail',  // 新增
  percent: number|null,               // 新增：0-100，未知 null
  batchId: string|null,               // 新增：批量轨会话归属
  timestamp: number,                  // 新增：Date.now()
  result?, error?, remainingWait?, retriesLeft? }  // 既有/新增透传
```

**stageKey 映射规则**（`mapStageToKey`）：前缀判定优先（`✓`→done、`✗`→failed、`⏳`/`⟳`→waiting），其次精确串表（`starting browser...`/`cookies restored`/`using API publish engine...`/`preparing *`→prepare；`uploading *`/`* uploaded`/`waiting upload`→upload；`filling *`/`adding tags...`/`checking agreement`/`saving draft`→fill；`publishing...`/`clicking Create`/`mass sending`/`next step*`→submit；`verifying...`/`waiting for editor`/`draft saved`→verify；`published!`/`Published!`→done；`准备发布...`→prepare），未知串→`detail`（渲染层原样透传展示）。映射表是**封闭清单**，新增阶段串必须同步登记（测试锁全量已知串）。

### D2：并发跨归属修复用 platform→taskId 路由，不改 rpaViewManager API

`rpaViewManager.onProgress` 单槽回调保留（不破坏既有 API），但改为**全局只注册一次**（bootstrap 装配期），回调内经 `createTaskProgressRouter` 维护的 `platform → taskId` 注册表解析归属；executor 开始时登记、finally 注销（仅当仍指向本任务）。同平台并发（同平台不同账号）时 last-write-wins，事件归属近似——**已知限制**，登记进 PRD §13，不为边缘场景引入会话级回调穿透三层调用链。

### D3：渲染层承载面用 pinia store + App 级订阅，不用组件局部 ref

监听器死亡 bug 的根因是「进度状态活在组件生命周期内」。修复原则：**订阅所有权上移到 App 级**（store `init()` 在 PublishProgressPanel setup 时执行一次，面板随 App.vue 常驻不卸载）。页面 composables 只做两件事：IPC 返回后 `registerSession`（登记 taskIds/batchId）；watch store 会话终态驱动页面结果卡。页面不再持有任何 `publish:progress` 订阅。

### D4：面板非模态，显式不接入浮层互斥合同

按 `PRD-OVERLAY-VIEW-SUSPENSION-2026-09-23.md` §6 口径（瞬时/非模态浮层不接入），面板为**非模态常驻浮动卡**（无遮罩、不阻塞交互、无交互闭环冲突），显式归入「不接入」并在该 PRD §5 通查清单补登 + 负向测试锁（断言面板源码不出现 `suspendEmbeddedViewsForOverlay`）。若未来面板增加模态确认（如退出拦截确认框），须按合同接入并登记 owner。

### D5：关窗保护复用流水线托盘先例（方案 A 扩展），不做确认弹窗

`shouldHideToTrayOnClose` 增加 `hasRunningPublish`（`taskQueue.getStatus()` 的 running+queue 计数，try/catch 守卫与流水线同款）；发布运行中点 ✕ → preventDefault + hide + 托盘气泡（Windows `displayBalloon`，非 Windows 静默跳过）。「不要关闭应用」的提示语义相应为：**关窗转后台继续，请勿退出程序**（托盘菜单/气泡承载）；面板最小化胶囊常驻小字提示同口径。选择托盘而非确认弹窗：与流水线行为一致、复用现成基建、误点 ✕ 零损失。

### D6：失败落历史复用 addRecord 既有宽容字段

`history.addRecord({ platform, title, taskId, status:'failed', result:null, error: task.error }, ownerSubject)`——addRecord 透传任意字段（`...safeRecord`），历史页 failed 过滤器即可见。写入失败不阻塞发布主流程（addRecord 内建 try/catch）。

### D7：会话终态通知去重原则

批量完成 toast 已由 useBatchPublish 的 finishBatchProgress 承担；store 在**面板处于最小化**且会话刚终态时补一条汇总 toast（最小化时页面通知可能被忽略）；面板展开时不重复 toast。单篇会话终态：页面结果卡 + 面板状态变化即视觉反馈，不额外 toast（保持通知密度克制）。

## 3. 数据流（单篇发布全链路）

1. 用户点「🚀 一键发布」→ 校验/敏感词/离线门 → `publish:batch` IPC → 主进程同步入队返回 taskIds（毫秒级）。
2. 渲染层 `registerSession({ taskIds, title })` → 面板自动展开（浮卡）。
3. executor 取任务 → `phase:'start'`（stageKey prepare，percent 0）→ RPA/API 阶段事件（phase progress + percent + stageKey）→ 终态（phase success/failed，percent 100）。
4. store 逐事件更新任务状态；会话内全部任务终态 → session.status='done'。
5. 页面结果卡（watch 会话终态）显示成功/失败汇总；面板显示终态 + 「重试失败项」。
6. 用户可随时「最小化」→ 胶囊（首次弹 toast）→ 任意路由可见进展 → 点击恢复展开。
7. 发布运行中点窗口 ✕ → 托盘隐藏 + 气泡；发布全部结束后关窗恢复正常退出语义。

## 4. 测试策略（TDD 先红后绿）

| 层 | 文件 | 锁什么 |
|---|---|---|
| 主进程单元 | `electron/services/publish-stage-map.test.js` | 映射表全量已知串 + 前缀规则 + 未知串→detail |
| 主进程单元 | `electron/services/publish-progress-events.test.js` | emitter payload 形状/守卫（win 销毁跳过、非法 taskId 跳过）+ router 登记/注销/last-write-wins |
| 主进程单元 | `electron/bootstrap/phase4-events.test.js`（扩展） | 四事件富化字段 + task:failed 落历史（反证：摘掉 addRecord 必红） |
| 主进程单元 | `electron/services/window-close-policy.test.js`（扩展） | hasRunningPublish 判据矩阵 |
| 渲染层单元 | `src/stores/publishProgress.test.js` | 会话注册/事件路由/终态/孤儿领养/重试/最小化记忆 |
| 渲染层单元 | `src/components/PublishProgressPanel.test.js` | 展开胶囊两态/最小化首次 toast/常驻提示/重试按钮/非模态负向锁 |
| 渲染层单元 | `src/composables/usePublishFlow.test.js`（改写） | 不再订阅 onProgress（bug 回归锁）+ registerSession + 终态驱动结果卡 |
| 渲染层单元 | `src/composables/useBatchPublish.test.js`（改写） | 同上（批量轨） |
| 视觉 | `tests/visual-testing/` | 既有基线无回归 + 面板状态基线（若框架支持注入态） |
| 打包 | QM-1 | electron-builder --win --dir + asar 清单 + 启动 8 秒 |

## 5. 风险与缓解

- **payload 兼容**：纯加法字段，既有消费者（usePublishFlow 旧路径已删、main.js 风控 toast 只读 platform/stage）不受影响；`--keys` locale 门禁锁新 key 成对。
- **与 #2562 冲突**：本变更不改 Publish.vue 模板（只改 composables），交集极小；合并前 rebase origin/main。
- **store 常驻内存**：会话列表上限 5 条 + 终态保留，超出裁剪最旧已完成会话。
- **同平台并发归属近似**（D2 已知限制）：面板显示层面影响有限（同平台两任务进度互串），PRD §13 登记。
