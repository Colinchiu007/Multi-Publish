# 审查结论（质量节拍 Bug 5 步 SOP）

- 根因：stage 外层 withModelBudget → governor.run 与 AIGenerator.generate 内层 governor.run 同 key 双包（同一 ApiUsageGovernor 单例）→ 并发 >=2 并发信号量自死锁。真实模块复现（x2/x3 并发 15s HANG；单层对照 4.2s）。
- 逃逸链：单测 governor 为无语义 mock + aiGenerator=null → 双包仅生产接线存在；governor 测试无同 key 嵌套用例；无真实 governor 双端集成测试。
- 系统性漏洞：信号量无重入保护；薄封装不校验底层是否已 governor 化；_pump 排队放行槽位未转移 → active 漂移为负。
- 修复：assetGenerator 路径单层调度收敛 + run() 同 key 重入透传（AsyncLocalStorage）+ _pump 槽位转移。
- 回归保护：api-usage-governor +2、story2video-stages +2 修改 1；真实 governor 3 场景有界完成（负向验证旧代码 10s 超时失败）；聚焦 84 + 关联 175 用例全绿；PR #489 CI 全绿（含 build windows = QM-1 打包）。
- 预防：网关级重入保护机制强制；排队记账归零测试契约；learnings.md 复盘。
