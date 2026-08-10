## 1. 根因修复与预防

- [x] 1.1 story2video-stages.js：assetGenerator 路径去掉外层 withModelBudget（避免同 key 双包）；legacy 路径保留外层调度
- [x] 1.2 api-usage-governor.js：run() 同 key 重入保护（AsyncLocalStorage 透传，不重复占槽/记账）
- [x] 1.3 api-usage-governor.js：_pump 槽位转移（active+=1），修复排队后 active 漂移为负

## 2. 回归保护测试

- [x] 2.1 api-usage-governor.test.js：同 key 嵌套重入透传不自死锁（真实定时器有界）；同 key 只占一个并发槽 + 不同 key 独立调度；active 归零断言
- [x] 2.2 story2video-stages.test.js：真实 governor 3 场景并发有界完成（旧代码 10s 超时失败，负向验证通过）
- [x] 2.3 story2video-stages.test.js：assetGenerator 路径外层 governorRun 不调用（单层调度契约）
- [x] 2.4 story2video-stages.test.js：legacy python 路径每项仍经 withModelBudget → governor.run（meta 含 type/providerId/model）

## 3. 文档与归档

- [ ] 3.1 01-docs/learnings.md Bug 复盘（根因/逃逸链/系统性漏洞/回归/预防）
- [ ] 3.2 CHANGELOG.md 更新
- [ ] 3.3 openspec validate + PR 合并后归档（三同步）
