# Design: 统一阶段进度契约

## 架构决策

### 决策 1：stage.progress 字段位置

**选择**：直接写入 `stage.progress`（pipeline-engine.js stage 对象上）
**备选**：仅通过 `context.stage_progress` 传递
**理由**：stage 对象是快照的直接来源（`getRunSnapshot().stages`），写在 stage 上避免 context 键名冲突，且前端可直接读取无需查 context。

### 决策 2：onProgress 通道注入方式

**选择**：`_executeStage` 注入 `onProgress` 回调，通过 `fullStage.onProgress` 传递给执行器
**备选**：修改 `StageExecutor.execute` 签名添加 onProgress 参数
**理由**：注入方式 additive，不改现有执行器签名，向后兼容；执行器内部通过 `stage.onProgress?.({...})` 调用。

### 决策 3：进度数据归一化

**选择**：统一归一化函数 `_normalizeStageProgress(update)` + 各阶段类型-specific 校验
**备选**：各阶段自行校验
**理由**：集中校验避免重复代码，fail-closed 策略（非法值丢弃）统一执行。

### 决策 4：总进度计算

**选择**：阶段数占比 + 当前阶段 percent 加权（平滑前进）
**备选**：保持阶段数占比（当前实现）
**理由**：加权后进度条不再跳跃，用户体验更平滑。

## 风险与回退

| 风险 | 影响 | 回退策略 |
|------|------|----------|
| stage.progress 字段破坏快照序列化 | 高 | 字段为可选，缺失时前端 fallback 到 context |
| onProgress 回调异常导致阶段卡死 | 高 | try-catch 包裹，异常不阻断阶段执行 |
| 旧数据无 stage.progress | 中 | 前端 stageSubProgressPercent 已有 fallback |
| 总进度加权计算偏差 | 低 | 保留阶段数占比作为 fallback |
