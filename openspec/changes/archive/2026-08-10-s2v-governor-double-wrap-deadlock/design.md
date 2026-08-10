# 设计：调度网关同 key 双包自死锁修复

## 根因

`ApiUsageGovernor` 的并发信号量无重入/所有权保护：外层 `run()` 先占槽（active 达 maxConcurrent），内层同 key `run()` 排队等槽，而槽只能由「完成的外层」释放 → 互相等待，永不释放。引入点：`87796b5f`（AIGenerator 内层 governor 网关）后，`0532ac3d`（2026-08-10）又在 story2video generate_assets 加外层 withModelBudget，同 key 双包。

## 方案

1. **调用点收敛（主修）**：assetGenerator 路径已由 AIGenerator.generate 内部 governor 调度 → 阶段外层去掉 withModelBudget；legacy python 路径（不经 AIGenerator）保留外层调度，限流不丢。
2. **网关重入保护（预防，根治此类问题）**：`run()` 入口用 AsyncLocalStorage 记录当前调用链持有的 key 集合；同 key 内层 `run()` 直接 `return task()` 透传（外层已负责槽位/节奏/冷却/重试/记账）。
3. **记账修正**：`_pump` 放行排队 waiter 时做槽位转移 `active += 1`（释放方 finally 已 `active -= 1`），修复排队后 active 漂移为负、并发闸门偶尔放行超额的记账缺陷。

## 为什么不用其他方案

- **移除 AIGenerator 内层 governor**：会破坏其他 AIGenerator 调用方（LLM/STT/视频等）的限流保护，且回归面大。
- **仅靠调用点注释约定**：无法覆盖未来其他「已 governor 化调用上再叠一层」的路径；网关级重入保护才是根治。
