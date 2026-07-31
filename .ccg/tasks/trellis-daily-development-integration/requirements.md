# Trellis 日常开发接入

## 目标

把 Trellis 接到 Multi-Publish 的日常开发流程里，但不替换现有的 `AGENTS.md`、`.quality-rhythm` 和 `.ccg` 机制。

## 需求

- 提供 Trellis 的仓库内入口说明
- 提供 `backend`、`frontend`、`guides` 三类 spec 目录
- 提供一个示例 Trellis task，便于后续按同一格式创建真实任务
- 说明 Trellis 与现有质量节拍的关系

## 验收标准

- 仓库内可以直接看到 Trellis 的入口文件
- spec 目录能够被后续任务直接引用
- 说明文档明确指出：Trellis 是辅助层，`AGENTS.md` 和 `.quality-rhythm` 仍然是强约束
- 不修改业务代码和现有质量门禁逻辑
