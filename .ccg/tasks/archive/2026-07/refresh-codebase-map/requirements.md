# 需求

## 目标

基于当前工作树重新分析 Multi-Publish 仓库，刷新结构化代码库地图。

## 产物

- `.planning/codebase/STACK.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/TESTING.md`
- `.planning/codebase/CONCERNS.md`

## 约束

- 只修改代码库地图和 CCG 任务记录，不修改业务代码。
- 所有结论必须引用当前仓库中的真实路径。
- 文档使用简体中文，文件名、路径、命令和代码标识保持原样。
- 不记录密钥、令牌或其他敏感值。
- 每份地图不少于 20 行，并标记映射日期和当前提交。

## 验收标准

- 7 份地图全部存在且内容非空。
- 技术栈、架构、测试、规范、集成和风险覆盖当前代码状态。
- 密钥模式扫描无命中。
- 双模型分析和双模型审查均完成，Critical 问题为零。
