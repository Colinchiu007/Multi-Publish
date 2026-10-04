# Tasks: publish-throughput-optimization

## 1. A2 抖音图文 RPA 去 sleep（TDD 先红后绿）

- [x] 1.1 `rpa-view-platforms.test.js` 新 describe「douyin 图文事件驱动等待」：行为锁 + 静态锁 7 条（先红后绿）
- [x] 1.2 实现 `_publish_douyin`：删 `_sleep(4000)`；tag 改 chip 就绪轮询（5000/500，超时继续）；封面改缩略图基线轮询（10000/500，超时 warn 降级）；提交兜底改 500ms×10 URL 轮询
- [x] 1.3 静态反模式锁：4 处固定 sleep 字面量禁入 `_publish_douyin`（照 url-collector-content-ready 先例）
- [x] 1.4 变异反证：封面轮询退回固定 sleep → 静态锁红（实跑）；还原 70/70 绿

## 2. B 队列通道调度（TDD 先红后绿）

- [x] 2.1 task-queue.test.js 新 describe「通道调度」9 条（先红后绿）
- [x] 2.2 实现：`_channelKey` + `_runningByChannel` 记账 + `_processNext` 通道扫描；`resolveQueueMaxConcurrent()` 导出 + container.setup.js 接 env
- [x] 2.3 频控推迟释放通道行为锁（blocked 分支显式释放，D2 决策落地）
- [x] 2.4 既有 34 条全绿（含 #2773 守卫集成 7 条）

## 3. C 窗口池（TDD 先红后绿）

- [x] 3.1 rpa-view-window-pool.test.js 新文件 11 条（先红后绿）
- [x] 3.2 实现：session mixin 增 `_poolKey/_acquireWindow/_releaseWindow/_drainWindowPool` + 池 sweeper；manager publish() 改 acquire/release + 复用跳过三段恢复 + cleanup 清池
- [x] 3.3 `AGENTS.md` QM-2 补「RPA 窗口池生命周期」+「TaskQueue 通道调度」两条合同
- [x] 3.4 变异反证：归池判据改恒 true →「失败销毁」红（实跑）；还原 11/11 绿

## 4. D 抖音图文 API 链（TDD 先红后绿）

- [x] 4.1 douyin-image-chain.test.js 12 条（fake-http 本机服务器，零外发；先红后绿）
- [x] 4.2 实现 `publish/platforms/douyin-image.js`：DouyinImageChain 六步链；UNVERIFIED 字段注释 + PRD §4.2 逐字段表
- [x] 4.3 adapter 分流接线（images→图文链 / video→视频链 / 双缺 fail-closed / dryRun 短路）
- [x] 4.4 run-tests.js VITEST_FILES 登记；全量 run-tests exit 0；真机验证步骤登记 PRD（PENDING 不阻塞）

## 5. 文档与收口

- [x] 5.1 `01-docs/PRD-PUBLISH-THROUGHPUT-OPTIMIZATION-2026-10-04.md`（三层慢因取证/就绪信号表/调度语义/池生命周期/字段取证状态/数据校验/性能预算）
- [x] 5.2 `CHANGELOG.md` 置顶收口
- [x] 5.3 KNOWN_STAGE_MAP 登记 `reusing browser session...`（封闭清单契约）
- [ ] 5.4 `openspec/active-tasks.json` 登记 + 合并后销账（合并后回填）
- [ ] 5.5 `.quality-gates.md` 执行记录（合并后 docs-only PR 回填，按 2026-09-29 定档先例）

## 6. 门禁与交付

- [x] 6.1 回归锁全绿：task-queue 34+9、container.setup、rpa-view-platforms 70、rpa-view-session、rpa-view-manager、rpa-view-window-pool 11、api-publish-engine 全量 exit 0、publish-stage-map/progress-events 71
- [x] 6.2 eslint 改动文件 0 error（4 warnings 为 main 预存同量级）；verify-worktree-deps 通过
- [ ] 6.3 QM-1 打包验证（electron-builder --win --dir）+ asar require 链 + 启动 8s stderr 检查
- [ ] 6.4 提交推送 + PR + CI 全绿 + auto-merge
