# Tasks: publish-throughput-optimization

## 1. A2 抖音图文 RPA 去 sleep（TDD 先红后绿）

- [ ] 1.1 `rpa-view-platforms.test.js` 新 describe「douyin 图文事件驱动等待」：图片上传后**不再出现** 4000ms 固定等待（行为锁：mock `_waitForCondition` 记录调用序，断言表单就绪等待是上传后的下一个等待）；tag 注入后等待 chip 出现（`_waitForCondition` 探针含 tag 判据）而非固定 1000ms；封面注入后等待缩略图计数增加；提交兜底为 URL 轮询（500ms×10 次上限）而非单次 sleep(5000)+单次查 URL
- [ ] 1.2 实现改动 `_publish_douyin`：删 `_sleep(4000)`；tag 循环改 `_waitForCondition(chip 出现, 5000, 500)`（超时继续下一个 tag，不失败）；封面 `_sleep(1000+2000)` → `_waitForCondition(img 计数 > 基线, 10000, 500)`（超时走原降级）；提交兜底 `await this._sleep(5000)` → 循环轮询 URL（500ms 间隔 ×10，命中 success 即返回）
- [ ] 1.3 静态反模式锁：`rpa-view-platforms.test.js` 新增结构断言——`_publish_douyin` 函数体内不得出现 `this._sleep(4000)` / `this._sleep(1000)`（tag 循环内）/ `await this._sleep(5000)`（提交兜底段），照 `url-collector-content-ready.test.js` 的「防复发静态不变量」先例

## 2. B 队列通道调度（TDD 先红后绿）

- [ ] 2.1 `packages/shared-utils/src/__tests__/task-queue.test.js`（或现存 task-queue 测试文件）新 describe「通道调度」：同 `(platform, accountId)` 两任务严格串行（第二条在前一条终态后才开始）；同平台不同账号并行（并发槽内同时 running）；不同平台并行；`accountId` 缺席走全局队列语义（与现行为一致）；`maxConcurrent` 上限仍约束总并发；`MP_QUEUE_MAX_CONCURRENT` 覆盖生效 + 非法值回落 3 并 console.warn 出声告警（fake timer 下验证顺序）
- [ ] 2.2 实现 `task-queue.js`：`_channelKey(task)` = `platform + ':' + (task.accountId ?? '')`；`_processNext` 改为「槽位内取首个通道无在跑任务的队头」；`_runningByChannel` Map 记账（`_executeTask` 开始置 1、终态 finally 清 0 后 `_processNext`）；`container.setup.js` 构造参数接 `resolveIntEnv('MP_QUEUE_MAX_CONCURRENT', 3, {min:1, max:10})`（对齐 publish-frequency-policy 的 env 覆盖纪律）
- [ ] 2.3 死锁反证：同通道任务在「publish:blocked 频控等待」期间必须释放通道（否则守卫等待反而堵死后续同账号任务）——行为锁断言 blocked 重排后同通道第二任务可启动（若 #2773 语义为「等待不占槽」则验证其通道记账同步释放）

## 3. C 窗口池（TDD 先红后绿）

- [ ] 3.1 `rpa-view-session.test.js` 新 describe「窗口池」：publish 完成后窗口不 destroy 而是归还池（`windows` 移除、`_pool` 收纳）；第二次同 key publish 复用池内窗口（`_createWindow` 只调一次）；池上限（默认 6，`MP_RPA_POOL_SIZE`）超出时最旧窗口销毁；TTL（默认 10 分钟，`MP_RPA_POOL_TTL_MS`）到期后台清理（fake timers）；失败任务仍 destroy（状态污染兜底）；归池前导航 `about:blank`
- [ ] 3.2 实现：`rpa-view-session.js` 加 `_pool: Map<key, {win, lastUsedAt}>` + `_acquireWindow(key, partition)`（池命中→复用并移出池；未命中→新建）+ `_releaseWindow(key, {healthy})`（healthy→导航 blank 后入池；否则 destroy）+ `_startPoolSweeper()`（TTL 清理，unref 定时器）；`rpa-view-manager.js` publish() finally 改调 `_releaseWindow(key, {healthy: result?.success})`；cookie 三段恢复只在新建时执行（复用路径跳过）
- [ ] 3.3 `AGENTS.md` QM-2 补「RPA 窗口池生命周期」条目（复用语义、TTL、失败销毁兜底、env 覆盖键）

## 4. D 抖音图文 API 链（TDD 先红后绿）

- [ ] 4.1 `packages/api-publish-engine/test/douyin-image.test.js`：新建——imagex 多图上传（N 张图 → N 个 imagex apply/upload/commit，复用 douyin-video 的 `uploadImagex` 单元语义 mock fetch 验证请求形状）；create 提交体含 `item_type: 150`（或取证切片确认的图文类型值）、`images[]`（每项 `{uri, ...}`）、`enable_commerce` 等字段；dry-run 模式短路返回；缺图 fail-closed 错误码 `data_error`；风控 110/安全验证分流与 douyin-video 同口径
- [ ] 4.2 实现 `publish/platforms/douyin-image.js`：`DouyinImageChain`——从 douyin-video.js 提取/复用（`uploadImagex`、签名、headers、create v2 路径）；`run({images, title, content, tags, cookie, dryRun})`；**每个请求形状必须对照 `01-docs/rpa-api-publish/evidence/yx-douyin-w2-slices.txt` 或新增真机取证切片，无切片依据的字段在代码注释标 UNVERIFIED 并在 PRD 登记**
- [ ] 4.3 接线 `adapters/douyin.js`：`execute` 分流——`taskData.images` 存在 → `DouyinImageChain`；`taskData.video.path` → 既有视频链；两者皆缺 → fail-closed（`douyin: taskData requires images or video.path`）；`supportsApi` 判据对图文路径更新（`rpa-view-manager.test.js` 补图文走 API 的行为锁）
- [ ] 4.4 PRD 登记：图文 create v2 请求体字段清单 + 取证状态（VERIFIED/UNVERIFIED 逐字段）；真机验证步骤（`MP_API_PUBLISH_DRY_RUN` + 实测账号）登记为 PENDING（按 learnings「平台侧无法离线证伪」原则，不阻塞合入）

## 5. 文档与收口

- [ ] 5.1 新建 `01-docs/PRD-PUBLISH-THROUGHPUT-OPTIMIZATION-2026-10-04.md`：三层慢因取证（文件:行号）/ A2 就绪信号表（信号、探针、超时、降级）/ B 通道调度语义（键、串行、并行、env）/ C 池化生命周期图 + TTL 参数表 / D 字段清单与取证状态 / 数据校验（env 合法域、池上限、TTL 下限）/ 用户可见行为变化（无文案变化，进度粒度不变）
- [ ] 5.2 `CHANGELOG.md` 置顶收口（feat(publish): 发布吞吐优化——去固定等待 + 通道调度 + 窗口池 + 抖音图文 API 链）
- [ ] 5.3 `openspec/active-tasks.json` 登记 + 合并后销账
- [ ] 5.4 `.quality-gates.md` 执行记录（含 TDD 反证矩阵：每个行为锁的「摘实现必红」记录）

## 6. 门禁与交付

- [ ] 6.1 回归锁全绿：task-queue 全部测试 + `container.setup.test.js` + `rpa-view-platforms.test.js` + `rpa-view-session.test.js` + `rpa-view-manager.test.js` + api-publish-engine douyin 相关
- [ ] 6.2 eslint 改动文件 0 error 0 warning；`node scripts/verify-worktree-deps.js` 通过
- [ ] 6.3 QM-1 打包验证（electron-builder --win --dir）+ asar require 链 + 启动 8s stderr 检查
- [ ] 6.4 提交推送 + PR + CI 全绿 + auto-merge
