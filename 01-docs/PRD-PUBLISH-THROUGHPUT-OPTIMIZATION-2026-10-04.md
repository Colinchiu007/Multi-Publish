# PRD: 发布吞吐优化（publish-throughput-optimization）

> 状态：实现完成，待 PR/CI
> 日期：2026-10-04
> 关联：PR #2773（publish-frequency-control，频控接线，本 PRD 的前置依赖）、openspec/changes/publish-throughput-optimization
> worktree：D:/Data/projects/mp-worktrees/mp-publish-throughput-optimization（分支 publish-throughput-optimization，基点 fa17fe404）

## 0. 背景与用户场景

用户实测：发布 1 个图文内容到抖音，进度面板显示「排队中」，随后整链发布慢。
代码取证（2026-10-04，main 基线 fa17fe404 之前）确认三层慢因，分别对应 A/B/C/D 四个方案：

1. **A2**：抖音图文 RPA 链里 4 处固定 `sleep()` 共 10~15 秒无判据等待（同族反模式在视频上传段已于 2026-10-01 由 upload-waiter v4 消除，图文段是漏网面）。
2. **B**：TaskQueue 全局 `maxConcurrent: 3`，不区分「平台+账号」——同账号任务可并发开两个浏览器对同一创作者后台操作（风控隐患 + 进度串台），而跨账号任务又吃不满并发（10 目标批次 4 波串行 ≈ 4-6 分钟）。
3. **C**：每个任务冷启动完整浏览器会话（新建隐藏 BrowserWindow + cookies/auth 分区/storage 三段串行恢复 + 冷缓存导航），任务结束即销毁——批量场景每任务固定 3~8 秒结构开销。
4. **D**：抖音图文只有 RPA 浏览器链（API 适配器此前 fail-closed on `taskData.video.path`），而视频链的 imagex 上传器/签名/create v2 通道全部已实现——图文 API 化的边际成本极低，且是单任务 10~20 秒的根本解。

频控缺口（同账号最小发布间隔从未生效）不由本 PRD 承担——PR #2773 已单独闭环，本变更依赖其合并后的 main 作为基线。

## 1. 方案 A2：抖音图文 RPA 链去固定 sleep

### 1.1 现状（改动前，rpa-view-platforms.js `_publish_douyin`）

| 位置 | 原代码 | 等待时长 | 性质 |
|---|---|---|---|
| 图片上传成功后 | `await this._sleep(4000)` | 4s | 纯叠加（下方已有 `_waitForCondition(表单, 30000, 1500)` 就绪轮询） |
| 每个 tag 注入后 | `await this._sleep(1000)` | 1s/tag | 无判据（平台建 chip 是异步的，1s 可能不够也可能浪费） |
| 封面注入前后 | `_sleep(1000)` + `_setFileInput` + `_sleep(2000)` | ~3s | 无判据 |
| 提交兜底 | `await this._sleep(5000)` 后单次查 URL | 5s 固定 | 事件驱动缺位（成功跳转发生在 2s 也要等满 5s） |

### 1.2 改动后（事件驱动等待）

| 场景 | 就绪信号 | 探针实现 | 预算/间隔 | 超时降级 |
|---|---|---|---|---|
| 图片上传后 | 发布表单出现（标题输入/contenteditable/textarea） | `_waitForCondition` 既有探针（不变） | 30s / 1.5s | warn 后继续填字段（原行为） |
| tag 注入后 | 页面出现**含 tag 文本且可见**的元素（`[class*="tag"]` 域内 innerText 匹配 + getClientRects>0） | 新 `_waitForCondition` 探针（executeJavaScript 函数字面量，R75 防护：硬编码字符串） | 5s / 500ms | 静默继续下一个 tag（不失败） |
| 封面注入后 | `[class*="cover"]` 域内 img 计数**超过注入前基线**（头条 `_uploadToutiaoCover` 同款「基线计数」判据，防占位 img 误判） | 注入前 executeJavaScript 读基线数 → `_waitForCondition` 比较递增 | 10s / 500ms | warn（`cover thumbnail not confirmed`）后继续提交 |
| 提交兜底 | URL 含 `success`/`publish/success` | 500ms×10 次轮询循环（替代单次 sleep+单查） | 最长 5s | `publish timeout`（原语义不变） |

### 1.3 收益与语义保持

- 典型单任务节省 10~15s（tag 越多省越多：原 1s/tag 固定 vs 现在 chip 通常 300~800ms 就绪）。
- **不改变任何失败语义**：所有超时路径与原实现一致（继续/告警/超时返回），只是把「盲等」换成「等到信号或超时」。
- 探针遵守 R75（`_waitForCondition` 的 fn 必须是硬编码函数字面量字符串，禁止拼接用户输入——tag 值经 `JSON.stringify` 注入探针内字符串常量）。

### 1.4 回归锁（rpa-view-platforms.test.js 新 describe「douyin 图文事件驱动等待」）

7 条测试：
1. **防复发静态锁**：`_publish_douyin` 函数体内不得再出现 4 处固定 sleep 字面量（4000 / tag 1000 / 封面 1000+2000 / 兜底 5000）。
2. tag 探针存在性（`_waitForCondition` + innerText 判据）。
3. 封面基线判据存在性（`querySelectorAll("img").length`）。
4. 提交兜底为轮询循环（for + getURL，无单次 sleep(5000)）。
5. 行为锁：上传成功后无中间固定等待（waits 序列断言）。
6. tag 超时不失败。
7. 封面超时走降级。

变异反证：把封面轮询退回固定 sleep → 静态锁红（已实跑）；还原后 70/70 绿。

## 2. 方案 B：TaskQueue 通道调度

### 2.1 调度语义

- **通道键**：`platform + ':' + (accountId ?? '')`。accountId 缺失归一空串——同平台无账号维度的任务仍同通道串行（共享同一登录面，不并行）。
- **同通道 FIFO 串行**：`_processNext` 扫描队列时跳过「通道已有在跑任务」的队头，继续扫描后续可启动任务（跨通道不互相阻塞）。
- **跨通道并行**：受 `maxConcurrent` 总量约束（默认 3，不变）。
- **记账位置**：`_executeTask` 进入时 `_runningByChannel` +1；**三个释放点**：
  1. try/finally（成功/失败/超时/重试回 pending 路径）；
  2. **publish:blocked 频控推迟分支**（该分支在 try 之前 return，finally 不执行——必须显式释放，否则「等间隔」占死通道，同账号后续任务被堵死，频控从保护变成雪崩。与既有 `this._running.delete(task.id)` 同位同因）；
  3. shutdown/清队路径经 `_markCancelled` 不经过记账（记账只在 `_executeTask` 生命周期内，无泄漏面）。

### 2.2 并发上限环境变量

- `MP_QUEUE_MAX_CONCURRENT`：合法域 [1,10]，默认 3；非法/越界回落默认并 `console.warn` 出声告警（对齐 publish-frequency-policy 的覆盖纪律）。
- 解析函数 `resolveQueueMaxConcurrent()` 导出为 `TaskQueue.resolveQueueMaxConcurrent` 静态方法 + 模块命名导出；`container.setup.js` 构造 TaskQueue 时消费（显式 `options.taskQueue` 仍优先——测试注入逃生口保留）。

### 2.3 与 PR #2773 的交互

- #2773 的 `publishIntervalGuard.check()` 在 `_executeTask` 内执行（进入 running 后）。通道调度不改变其语义；唯一新增约束是「blocked 推迟必须释放通道」——已实现并有行为锁。
- 两者对 task-queue.js 的改动将在 PR 合并顺序上叠加（本 PR rebase #2773 合并后的 main 解决同文件冲突）。

### 2.4 回归锁（task-queue.test.js 新 describe「通道调度」9 条）

同账号串行 / 跨账号并行 / 跨平台并行 / 无账号同平台串行 / 总并发上限 / env 合法覆盖 / env 非法回落+告警 / env 越界回落+告警 / **频控推迟释放通道**（guard 第一查命中、第二查放行的序列 mock）/ 失败重试不占通道。既有 34 条全绿（含 #2773 的守卫集成 7 条）。

## 3. 方案 C：RPA 窗口池

### 3.1 生命周期

```
publish(platform, accountId)
  ├─ _acquireWindow(platform, accountId)
  │    ├─ 池命中 → 复用（reused=true，跳过三段恢复，进度文案「reusing browser session...」）
  │    └─ 未命中 → _createWindow('persist:rpa-<platform>-<accountId|default>') + 三段恢复
  ├─ 执行平台发布链（不变）
  └─ finally _releaseWindow(platform, accountId, win, publishHealthy)
       ├─ healthy=true  → loadURL('about:blank') → 入池（超限挤出最旧）
       └─ healthy=false → 立即 destroy（状态污染兜底）
```

- **池键**：`rpa-<platform>-<accountId|default>`（与 partition 名一致；与 `_windowKey` 的自增 id 命名分离——后者只用于「活动会话」映射，支持同账号并发会话各自 CancelToken）。
- **归池判据**：`publishHealthy = result.success === true`（API 轨不涉及窗口，publishHealthy 初始化 undefined 不影响 API 路径提前 return）。
- **失败销毁**：结果失败 / 执行抛错 / 取消（isCancelled）→ destroy。历史教训：上传页 `input[type=file]` 因残留状态从 DOM 移除（2026-09-30 实测），失败窗口的页面状态不可信。
- **about:blank**：释放页面 JS 状态；登录态在 session 层（持久 partition），不受影响——这正是复用收益来源。
- **复用跳过三段恢复**：`_restoreCookies` / `_restoreAuthPartitionCookies` / `_restoreBrowserStorage` 只在 `reused=false` 时执行。

### 3.2 参数

| 参数 | 默认 | env 覆盖 | 合法域 |
|---|---|---|---|
| 池上限 | 6 | `MP_RPA_POOL_SIZE` | [1,10]，非法/越界回落默认并 console.warn |
| 空闲 TTL | 10 分钟 | `MP_RPA_POOL_TTL_MS` | 非负整数，非法回落默认（不告警——数值合法域宽） |
| 清理周期 | 60s | 无（内置） | — |

- TTL 清理定时器 `unref()`（不阻止进程退出）；池空时自愈停止。
- `cleanup()`（应用退出路径）同步 `_drainWindowPool()` 销毁全部池内窗口。

### 3.3 内存与安全边界

- 池内窗口 `show:false` + `backgroundThrottling:false`（与现行为一致）；about:blank 页面无第三方 JS。
- 池上限 6 个窗口 ≈ 每窗口 ~50-80MB，最坏 ~480MB——可经 env 降配；池化带来的窗口数**不会超过**原实现批量场景的峰值窗口数（原实现是「同时最多 3 个活动窗口 + 无复用」，池化后活动+池化总数受 maxConcurrent 与池上限双重约束）。
- 凭证不落池：池只存 BrowserWindow 引用；cookie 在 session 层，与原「每任务新建+销毁」的持久化面完全一致，无新增持久化。

### 3.4 回归锁（rpa-view-window-pool.test.js 新文件 11 条）

成功归池（未销毁 + 已导航 about:blank）/ 同键复用（BrowserWindow 只构造一次）/ 不同键不共用 / 失败销毁 / 抛错销毁 / 复用跳过 cookie 恢复（_restoreCookies 只调 1 次）/ 池上限挤出最旧 / env 合法覆盖 / env 非法回落+告警 / cleanup 清池 / TTL 定时器 unref 结构锁。

变异反证：归池判据 `publishHealthy = true`（失败也归池）→「失败销毁」锁红（已实跑）；还原后 11/11 绿。

## 4. 方案 D：抖音图文 API 直连链

### 4.1 链路（DouyinImageChain，与 DouyinVideoChain 同构）

```
0. _assertPreconditions（fail-closed 零请求）：签名材料四类齐备 + clientSign 可签出 + images 非空 + 文件存在
1. getSdkToken：creator HEAD（CSRF 池轮换，idx=1）
2. getAuthKey：creator GET /web/api/media/upload/auth/v5/
3. 逐图 imagex 上传：ApplyImageUpload → 单 POST（CRC32 头）→ CommitImageUpload → Uri
4. buildImagePostData：item.common 同构视频链 + image_ids 承载多图 Uri
5. create_v2 提交（bd-ticket-guard 头组 + msToken + a_bogus 空——与视频链同款）
6. 裁决：x-tt-verify-passport-decision → risk_blocked；status_code===0 && (aweme_id||item_id) → 成功；
   status_code===110 → risk_blocked
```

- **adapter 分流**（douyin.js execute）：`taskData.images` 非空且无 `video.path` → 图文链；有 video → 视频链（不回归）；两者皆缺 → fail-closed（错误信息 `taskData requires images or video.path`）。dryRun 对两种媒体形状都短路。
- **fallback**：API 图文失败由 rpa-view-manager 既有 catch 分支自动回退 RPA 图文链（本变更新增能力但**零新增用户风险面**——最坏情况等同现状）。
- **形状翻译**：桌面端 `buildApiTaskData` 已把 `article.images` 透传为 `taskData.images`（数组项为 path 字符串），图文链的 `img.path || img` 双形态兼容。

### 4.2 取证状态（D4 决策：不把猜测钉成契约）

图文 create_v2 请求体**无真机取证切片**（`01-docs/rpa-api-publish/evidence/yx-douyin-w2-slices.txt` 只覆盖视频链）。逐字段状态：

| 字段 | 值/形状 | 状态 | 依据 |
|---|---|---|---|
| item.common.item_title / content_desc | 同视频链 | VERIFIED* | 同一 creator API 面，视频 create_v2 接受该形状（*「同一 API 面」置信，非图文端点直证） |
| item.common.text_extra | 内联话题位置段（findInlineTopicPositions 单一实现） | VERIFIED* | 同上 |
| item.common.image_ids | `string[]`（imagex Uri 列表） | **UNVERIFIED** | 字段名按 video_id 同构推断；实际可能是 image_uri/cover_uri 等 |
| item.common.media_type | 4（沿用视频链值） | **UNVERIFIED** | 图文实际枚举值需真机确认（可能 2/3/其他） |
| item.cover.poster | 首图 Uri | **UNVERIFIED** | 推断 |
| item.common.visibility_type | 0（私密/草稿）/102（公开） | VERIFIED* | 视频链实测语义 |
| is_aigc | taskData.aiGenerated | 同构 | — |

**单测纪律**：12 条测试只锁「与视频链同构 + 请求序列 + dry-run + fail-closed 边界 + 风控口径」，**不断言 image_ids/media_type 的具体业务值**——防止把推断钉成契约，真机修正时只改实现不改测试。

**真机验证步骤（PENDING，不阻塞合入）**：
1. 准备实测抖音账号（creator.douyin.com 登录态）。
2. `MP_API_PUBLISH_DRY_RUN=1` 冒烟（确认链路零外发短路）。
3. 实发 1 条单图图文 → 检查 creator 后台作品是否出现、字段是否被服务端接受；若 create 返回参数错误（status_code 非 0/110），按响应 message 修正 image_ids/media_type 字段名/枚举，同步本表状态 UNVERIFIED→VERIFIED。
4. 实发多图（3 张）→ 确认顺序与封面。
5. 验证通过后在 CHANGELOG 补记取证完成时间与账号环境。

### 4.3 回归锁（douyin-image-chain.test.js 新文件 12 条 + run-tests.js 注册）

无 cookie / 缺 images / 文件不存在 / 签名材料缺失（omitCrypt）四条 fail-closed 零请求锁；全链成功（2 图逐个 apply/POST/commit + create 体结构 + ticket-guard 头组 + 进度回调）；风控裁决（verify header / 110）同口径；imagex 无节点中断不提交；adapter 四条分流锁（图文走图文链/视频不回归/双缺 fail-closed/dryRun 短路）。`node scripts/run-tests.js` 全量 exit 0。

## 5. 数据校验汇总

| 校验点 | 规则 | 失败行为 |
|---|---|---|
| MP_QUEUE_MAX_CONCURRENT | 整数 [1,10] | 回落 3 + console.warn |
| MP_RPA_POOL_SIZE | 整数 [1,10] | 回落 6 + console.warn |
| MP_RPA_POOL_TTL_MS | 非负整数 | 回落 10min（静默） |
| 图文链 images | 非空数组且每项文件存在 | data_error / io_error（零请求） |
| 图文链签名材料 | 四类齐备 + clientSign 可签出 | data_error（零请求，与视频链同判据） |
| adapter 媒体形状 | images 或 video.path 至少一项 | data_error（`taskData requires images or video.path`） |
| 封面/tag 探针 | fn 为硬编码函数字面量字符串（R75） | `_waitForCondition` 返回 false 走降级 |

## 6. 用户可见行为变化

- **无新增文案、无 locale 变化**；进度面板阶段粒度不变。
- 进度阶段串新增一个英文技术串 `reusing browser session...`（池复用任务，publish-progress-events 的 KNOWN_STAGE_MAP 需登记——见 §8 遗留）。
- 批量发布吞吐提升（10 目标批次预期 4-6 分钟 → 2-3 分钟，叠加 D 方案 API 链后进一步降低）。
- 同账号任务不再并发开窗（对平台更「像人」，风控面收敛）。

## 7. 性能预算（目标 vs 度量方式）

| 指标 | 现状 | 目标 | 度量 |
|---|---|---|---|
| 单条抖音图文 RPA 全链 | 40~90s | ≤30s（A2 生效后） | 日志 `publish start`→`publish done` 时差 |
| 单条抖音图文 API 链 | （不存在） | ≤20s | 同上（D 真机验证时采集） |
| 10 目标批次总时长 | 4-6 分钟 | ≤3 分钟 | 队列首尾任务时间差 |
| 复用热窗口冷启动 | 3~8s | ≈0s | `_createWindow` 调用次数（池命中为 0） |

## 8. 遗留与不做

- `reusing browser session...` 阶段串需登记 publish-stage-map 的 KNOWN_STAGE_MAP（封闭清单契约）——**待办：本 PR 收尾前补**。
- 进度路由 platform 单键 → (platform,accountId) 升级：C 的同账号串行已消除串台根源，升级单独立项。
- 其他平台图文 API 链：只做抖音（用户场景 + 取证范围）。
- D 链路真机验证：PENDING（§4.2 步骤），按 learnings「平台侧无法离线证伪」原则不阻塞合入。
