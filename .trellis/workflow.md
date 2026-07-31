# Trellis 工作流

## 目标

把 Multi-Publish 的日常开发拆成可持续复用的上下文、任务和复盘。

## 默认顺序

1. 先读 `AGENTS.md`
2. 再读 `.quality-rhythm`
3. 再读 `.trellis/spec/` 中与当前层相关的规范
4. 新工作先从 `.trellis/templates/` 复制模板
5. 再把任务落到 `.trellis/tasks/`
6. 工作结束后，把结论写回 `.trellis/workspace/`

## 任务分流

- 小改动可以直接按现有流程处理
- 中等及以上任务，优先先写 PRD / 任务上下文，再开始实施
- 涉及后端、前端、打包、身份、权限、发布或外部服务时，必须把相关 spec 一并带上

## 和现有流程的关系

- Trellis 不替代 `AGENTS.md`
- Trellis 不替代 `.quality-rhythm`
- Trellis 也不替代 `.ccg`
- Trellis 只负责把同一套项目知识结构化、持续化

## 结束标准

当任务实现完成后：

- 记录最终验证结果
- 更新对应 task 的状态
- 把新学到的规则补回 spec 或 workspace
