# Design: publish-throughput-optimization

## 决策 D1：通道键与兼容语义

通道键 = `platform + ':' + (accountId ?? '')`。`accountId` 缺席（如 `publish:wechat` 单入口固定传 null）时键为 `platform + ':'`，
与「显式空账号」同通道——语义为「该平台无账号维度时仍同平台串行」。这比回退全局队列更安全：同平台无账号维度本身意味着共享同一登录面。
向后兼容验证：现有测试若断言「不同平台可并行」，通道模型不破坏；若断言「同平台多任务可并行」，需逐条核对是否依赖了旧行为（预期只有 `maxConcurrent=3` 总量约束类断言，保留）。

## 决策 D2：通道记账与频控等待的交互

`_runningByChannel` 在 `_executeTask` 同步段（置 running 前）登记、终态 finally 清除。
publish:blocked 频控等待路径（#2773）把任务从 `_running` 移除并回 pending——通道记账必须同点释放，
否则「同账号第二条任务」会被「第一条正在等 5 分钟间隔」堵死，频控从保护变成雪崩。
实现：释放点 = `task.status = 'pending'` 的同一位置（含 `_delayed` 重排回调再入队时）。

## 决策 D3：窗口池只缓存「健康」会话

归还判据 = 本次发布结果 `success === true`。失败任务窗口可能停留在报错弹窗/异常导航态，
复用会污染下一任务（历史教训：上传页 `input[type=file]` 因残留状态从 DOM 移除）。失败 → 立即 destroy（现行为兜底）。
成功归池前导航 `about:blank` 释放页面 JS 状态；partition 持久化层（cookie/localStorage）保留——这正是复用收益来源。

## 决策 D4：D 链路的取证纪律边界

图文 create v2 的请求体字段无法从现有 W2 切片完全推导（切片只覆盖视频链）。
处置：实现层按「douyin-video 同构 + 命名推断」写，字段级 `UNVERIFIED` 注释 + PRD 逐字段表 + 单测只锁「结构与 douyin-video 同构 + dry-run 短路」，
**不锁具体字段值**（避免把猜测钉成契约）。真机验证步骤写进 PRD，按 learnings「平台侧无法离线证伪」原则登记 PENDING，不阻塞合入。
用户侧兜底：API 图文失败自动回退 RPA（现有 fallback 链路，零新增风险面）。

## 方案对比（为何不用别的）

- **B 替代方案：全局 maxConcurrent 提到 6**——吞吐等价提升但同账号并发风险更大（多窗口对同一后台），且进度串台更严重。否。
- **C 替代方案：常驻浏览器复用 Playwright context**——架构重写量级，Electron WebContentsView 池已满足。否。
- **D 替代方案：只做 A+B+C**——排队与冷启动优化后单任务仍 30s+，API 链是 10~20s 的根本解且基建（imagex 上传器）已存在，边际成本低。做。
