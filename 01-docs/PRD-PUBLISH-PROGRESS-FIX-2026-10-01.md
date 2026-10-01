# PRD：发布进度重复会话修复与视频上传等待体验优化（publish-progress-fix）

- **日期**：2026-10-01
- **状态**：实施中
- **分支**：`fix-publish-progress-dup-upload`
- **上游 PRD**：`01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md`（§5.2 会话登记 / §6.1 percent 契约）、`01-docs/PRD-PUBLISH-PROGRESS-PANEL-REFINE-2026-09-29.md`（汇总口径）
- **一句话**：修复「发布 1 个视频却显示 2 个任务（成功 1/2）、幽灵任务永远排队」的会话登记竞态 bug；并把「视频上传等待卡死在 30% 长达 15 分钟」改为「真实页面百分比上报 + 按文件大小自适应预算 + 停滞提前放行」，对齐参考产品 4.0 的进度体验理念。

---

## 1. 背景与实证（2026-10-01 用户实发抖音取证）

用户通过「一键发布 · 视频发布」发 1 个视频（02.mp4，909.88 KB）到抖音 1 个账号，右下角发布进度面板出现**两个会话卡、两个任务条**（成功 1/2），且发布过程中进度长时间停在 30%。日志基线：`%APPDATA%` 对应 shared-user-data `logs/app-2026-10-01.log`。

### 1.1 Bug A：重复会话/幽灵排队任务（渲染层竞态）

日志时间线（UTC）：

```
14:32:43.116  PublishIPC publish:batch enter（platforms=[douyin:7827cbf7]）
14:32:43.162  RpaView [douyin] starting browser...   ← 任务已同步启动并 send('publish:progress')
14:32:43.180  PublishIPC publish:batch ok（taskIds=[task_1_…]，耗时 64ms）  ← IPC 响应此后才回到渲染层
```

- `ipc-handlers/publish.js` 的 `publish:batch` 处理器内 `taskQueue.add()` **同步启动**任务执行，首个 `publish:progress` 事件（webContents.send）早于 IPC invoke 响应到达渲染端。
- 渲染端事件先到：`stores/publishProgress.js` `handleProgressEvent` 走 R3 孤儿收纳，`_createSession({title:null})` 建立会话①（标题为空 → 面板显示回退名「发布 · HH:mm」）。
- 随后 `composables/usePublishFlow.js` 拿到 taskIds 调 `registerSession({taskIds, title})`，**无条件新建**会话②（带真实标题「总有些想不到的」，任务 phase='queued'）。
- 同一 taskId 的后续事件全部被 `_findSessionByTaskId` 路由进会话①；会话② 的任务**永远停在 queued**，会话② 永远 running。

**用户可见后果**：
1. 聚合显示「成功 1/2」——用户误以为有第二个发布在排队（本次工单的直接起因）；
2. 幽灵行「排队中」永远不消失；
3. `hasRunning` 恒真 → 面板关闭按钮禁用、自动收敛失效、「取消全部任务」常驻，取消对幽灵任务返回 not-found 计入 fail。

### 1.2 Bug B：上传等待卡 30%（主进程等待策略缺陷）

日志时间线（UTC）：

```
14:32:48.408  [douyin] uploading video...      → percent 20
14:32:48.465  [douyin] waiting upload...       → percent 30（此后 15 分 25 秒无任何进度事件）
14:48:13.488  WARN video upload-complete signal not detected (preview/url), continuing best-effort
14:48:13.497  [douyin] video uploaded          → percent 50
```

- 909KB 视频实际上传秒级完成（14:32:51 页面已在生成首帧封面）。
- `rpa-view-navigation-helpers.js` `_waitForVideoUploadComplete`：无条件先睡 25s，再把一个布尔条件串交给 `_waitForCondition` 黑盒轮询，预算 900000ms（15 分钟）。
- 完成条件 = 「无上传中负向信号 && 有正向信号」。抖音上传完成后页面残留可见 `[class*=progress]` 元素/「转码中」类文本，使负向信号恒真 → 正向信号再强也不判定完成 → 白等满预算。
- 期间唯一上报就是 `waiting upload...` 固定 30%，用户无从分辨「在上传」还是「卡死了」。

### 1.3 参考产品 4.0 逆向对齐结论

来源：`D:\Data\逆向工程_参考产品4.0`（RPA分析报告.md §3.3、可复用代码分析.md）。

| 参考产品做法 | 本仓对齐方式 |
|---|---|
| API 分片直传平台 CDN，percent = currentPart/totalParts **真实字节进度** | RPA 为页面注入式上传，取不到字节流 → 退而求其次，**解析平台页面自身的上传百分比**做真实进度上报（映射到上传波段） |
| 状态机边界由接口返回驱动：init(1)→获取参数(3)→上传中(真实%)→上传完成(60)→封面(70/90)→推送(95)→成功/失败(100)，**不猜 DOM** | 保持既有 stage 串/stageKey 状态机不变；把「何时算上传完成」从单一布尔等待升级为**多信号判定**（正向结构信号 + 页面百分比 + 停滞检测），判定由纯函数承载、可单测 |
| 进度节流：大文件 5s 时间门控、小文件 10% 百分比门控（ProgressGate） | 等待循环仅在**页面百分比变化**或每 15s 时上报一次，天然节流，不刷屏 |
| 上传失败重试（最多 3 次） | 不在本次范围（TaskQueue 已有 retry 语义，保持） |

---

## 2. 目标与非目标

### 目标
1. **G-A1**：同一次发布只呈现一个会话：孤儿事件先行建立的会话必须被 `registerSession` 收养合并（标题回填、任务补齐），不得产生幽灵排队任务。
2. **G-B1**：上传等待期间上报**真实页面百分比**（映射到 30~49 波段），用户能看到进度在动。
3. **G-B2**：等待预算按文件大小自适应（小文件 ~90s、大文件上限 900s），小文件不再白等 15 分钟。
4. **G-B3**：停滞检测：页面百分比连续 180s 不变且存在结构性正向信号（编辑器/URL 命中）时提前 best-effort 放行（行为语义与既有「continuing best-effort」一致）。
5. **G-B4**：上传完成判定逻辑抽为纯函数模块，单测锁定。

### 非目标
- 不改 TaskQueue 编排语义（并发/重试/超时不变）。
- 不改面板视觉与汇总口径（panel-refine 已定稿）。
- 不新增用户可见文案 key（stage 串维持 `waiting upload...` 既有映射，percent 数值变化即可表达进度）。
- 不做 API 直传改造（参考产品式分片直传属长期架构演进，另立 change）。

## 3. 功能逻辑

### 3.1 会话登记合并（Fix A，渲染层）

`stores/publishProgress.js` `registerSession({taskIds, batchId, title})`：

```
入参校验（不变）：ids 过滤非空串；无 ids 且无 batchId → return null
① 收养查找：candidates = sessions 中「含任一 id」或「batchId 相同」的会话
② candidates 非空：
   - primary = candidates[0]；其余 candidates 的 tasks/taskOrder 并入 primary 后移除
   - 缺失 id 逐个 _ensureTask(primary, id, '')
   - primary.title 为空且入参 title 非空 → 回填 title
   - batchId 入参有效 → primary.batchId = batchId
   - primary.recovered = false（领养态转正）
③ candidates 为空：按既有逻辑 _createSession 新建
④ 展开 panelVisible=true / panelMinimized=false；_pruneSessions()；返回会话
```

**数据校验**：ids/batchId 的类型过滤保持既有规则；合并不触碰任务相位（终态吸收语义 §4.3 不变——迟到事件不回退）；被移除会话内的任务一律并入 primary，**不允许丢任务**。

### 3.2 上传等待策略（Fix B，主进程）

新模块 `electron/services/upload-wait-strategy.js`（纯函数，零 Electron 依赖）：

| 函数 | 输入 | 输出 | 规则 |
|---|---|---|---|
| `computeBudgetMs(fileBytes)` | 视频字节数（null 兜底） | 等待预算 ms | `clamp(60000 + MB×10000, 90000, 900000)`；fileBytes 非法/null → 900000（旧行为） |
| `decideUploadWait(s)` | `{elapsedMs, budgetMs, pagePercent, positive, minStableElapsedMs, unchangedMs}` | `{action, reportPercent}` | 优先级：positive → done；elapsed≥budget → besteffort；pagePercent≥100 → besteffort；pagePercent 存在且 unchangedMs≥180000 且 positive 结构信号在轮询里持续出现过（由调用方把「曾有正向结构信号」折入 unchanged 判定）→ besteffort；否则 wait。reportPercent = pagePercent!=null ? `min(49, 30+floor(pagePercent*0.19))` : null |

`_waitForVideoUploadComplete(win, platform, timeoutMs, opts)` 重写（`rpa-view-navigation-helpers.js`）：

1. `opts.fileBytes` → `computeBudgetMs` 得预算；未传 → 900000。
2. 前 25s 稳定期保留（防 blob 首拍误判的历史纪律），稳定期内照常轮询并上报页面百分比。
3. 每 3s 轮询：页面内执行结构化探针，返回 `{uploading, pagePercent, positive}`：
   - `uploading`：沿用既有负向信号（`上传中…/正在上传/剩余时间：/转码中/上传失败` 文本、可见 `[class*=progress]` 元素、正文百分比 <100）；
   - `pagePercent`：正文 `(\d{1,3})\s*%` 首个命中；
   - `positive`：https video 元素可见 ‖ 编辑器输入存在 ‖ URL 含 `post/video`（与 v3 条件一致）。
   - executeJavaScript 抛错按 `{uploading:false, pagePercent:null, positive:false}` 容错。
4. 每轮喂 `decideUploadWait`：
   - `done` → return true（调用方继续 `video uploaded` 50）；
   - `besteffort` → 保留既有 WARN 文案 `video upload-complete signal not detected (preview/url), continuing best-effort`，return false；
   - `wait` → reportPercent 有值且与上次上报不同（或距上次上报 ≥15s）时 `this._emitProgress(platform, 'waiting upload...', reportPercent)`。
5. 兼容性：第三参 `timeoutMs` 语义保留（显式传入时作为预算上限）；既有调用点不传 opts 行为退化为「预算 900s 的旧循环 + 真实百分比上报」，**无破坏性**。
6. 调用点升级：`rpa-view-platforms.js` `_publish_douyin` 视频路径传 `fileBytes`（`fs.statSync(article.video_path).size`，try/catch → null）；其余平台调用点逐一评估，能低本钱拿到大小的一并传入。

## 4. 交互逻辑与显示项（用户视角）

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 发布 1 个视频到 1 个账号 | 两个会话卡：「发布 · HH:mm（已完成/成功）」+「标题（永远排队中）」；汇总「成功 1/2」 | 单会话卡带标题；单任务行走完 准备→上传→填写→提交→完成；汇总「成功 1/1」 |
| 面板关闭/自动收敛 | hasRunning 恒真，无法关闭 | 任务终态后会话 done，自动收敛/可关闭 |
| 小视频上传等待 | 卡「上传 30%」最长 15 分钟 | 上传 30%→49% 随页面真实百分比推进；一般 ≤90s 进入「视频上传完成 50%」 |
| 大文件（如 B 站 96MB） | 同样最多 15 分钟，但无中间反馈 | 预算仍 900s 上限，但期间持续上报页面百分比 |
| 页面百分比停滞（转码等） | 无感知干等 | 180s 停滞且有结构信号 → best-effort 继续；此后阶段失败仍如实报错 |

**提示文字**：无新增 key；WARN 日志沿用原文案便于日志对账。

## 5. 测试与验收

1. 渲染层回归（`src/stores/publishProgress.test.js`）：
   - 孤儿事件先到 + registerSession 后到 → 1 会话、标题回填、相位保留；
   - 多孤儿会话合并；batchId 收养；重复登记不新建；既有用例全绿。
2. 主进程纯函数（`electron/services/upload-wait-strategy.test.js`）：
   - computeBudgetMs 边界（0/1MB/96MB/null/负数/NaN）；
   - decideUploadWait 全分支（positive/budget 耗尽/percent≥100/停滞放行/wait/reportPercent 映射含 49 封顶）。
3. 既有 `publish-progress-events.test.js`、`PublishProgressPanel.test.js` 等全量回归。
4. 手工验收路径（开发模式）：抖音小视频发布全程观察面板——单会话、单任务、百分比连续推进、终态后可关闭。

## 6. 风险与回滚

- `_waitForVideoUploadComplete` 影响所有 RPA 视频平台：以「默认行为兼容 + 平台逐个传 fileBytes」控制爆炸半径；探针 JS 抛错全容错退化为 wait。
- 会话合并若出现异常双会话，最坏退化回现状（双卡），不丢任务、不崩面板。
- 单 PR 独立分支，revert 即回滚。

## 7. 决策记录

- 未走 openspec change：定性为 BugFix 快捷路径（两处确诊缺陷修复，无新能力面），本文档承担规格职责。
- 不新增 i18n key：percent 数值是进度语义的既有表达通道（TaskRow showPercent），避免文案矩阵膨胀。
