# 实施计划

## 决策

本任务按四个互不重叠的文档所有权并行执行。外部 antigravity 与 Claude 分析因私有仓库数据导出策略被拒绝，改用内部隔离代理并由主代理交叉核验。

## Layer 1：并行映射

1. 技术栈与集成
   - 写入 `.planning/codebase/STACK.md`
   - 写入 `.planning/codebase/INTEGRATIONS.md`
2. 架构与结构
   - 写入 `.planning/codebase/ARCHITECTURE.md`
   - 写入 `.planning/codebase/STRUCTURE.md`
3. 规范与测试
   - 写入 `.planning/codebase/CONVENTIONS.md`
   - 写入 `.planning/codebase/TESTING.md`
4. 风险与技术债
   - 写入 `.planning/codebase/CONCERNS.md`

## Layer 2：主代理核验

1. 检查 7 份文档存在且每份超过 20 行。
2. 抽查关键路径、依赖和测试命令是否真实存在。
3. 扫描凭据模式与意外敏感值。
4. 检查 frontmatter 的映射日期和提交 SHA。
5. 对照 `git diff` 确认未修改业务代码。

## 审查与交付

1. 内部审查代理检查地图的一致性、遗漏和错误路径。
2. 主代理修正 Critical/Warning 问题。
3. 更新任务记录、归档 CCG 任务并提交。
