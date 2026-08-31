## 1. 基线与流程门禁

- [x] 1.1 固定 `origin/main@2e1b84fcf42245842ae09554a054a8d5f4b66b07`、创建隔离 worktree，并验证 pre-code-edit guard、write guard 与分支状态
- [x] 1.2 建立 CCG task、OpenSpec proposal/design/tasks，并记录分析范围、非目标、证据边界和“规划不构成实施授权”
- [x] 1.3 读取 AGENTS、CCG spec、OpenSpec 基线、根级项目配置及主要架构/部署文档

## 2. 当前架构取证

- [x] 2.1 盘点 Electron renderer/preload/main 启动、路由、DI、IPC 和持久化链路，记录 `file:line` 证据
- [x] 2.2 盘点账号/发布/RPA/API publish 包的责任、扩展点、数据所有权和跨包依赖
- [x] 2.3 盘点 Story2Video、媒体、模型供应商、Python sidecar 与 Remotion/FFmpeg 管线
- [x] 2.4 盘点 ops-center、身份/API 服务、数据库、Compose/ECS 和外部服务边界
- [x] 2.5 盘点测试、CI、打包、日志/追踪、配置和会话隔离等工程治理机制

## 3. 量化与交叉分析

- [x] 3.1 生成代码体量、热点文件、模块依赖、重复模式、测试分布和复杂度代理指标
- [x] 3.2 调用 opencode analyzer/architect 对当前基线做独立诊断并保存原始输出
- [x] 3.3 调用 Claude analyzer/architect 对当前基线做独立诊断并保存原始输出
- [x] 3.4 合并去重双方发现，逐项抽查高优先级结论的代码证据并标注分歧

## 4. 重构方案与验证

- [x] 4.1 编写现状架构、主要数据流、模块责任和问题分级章节
- [x] 4.2 设计目标架构、依赖规则、契约治理、数据/安全/可观测性和测试策略
- [x] 4.3 将建议拆为可独立批准的迁移波次，定义前置条件、验收指标、回滚和退出条件
- [x] 4.4 调用 opencode reviewer 与 Claude reviewer 并行审查报告，将结果写入 `review.md`
- [x] 4.5 修订 Critical/Warning，运行链接/格式/OpenSpec/CCG 一致性检查并记录证据

## 5. 交付闭环

- [x] 5.1 完成最终 Markdown 报告、决策日志和证据索引
- [x] 5.2 更新 CCG task 终态、归档 OpenSpec change 与 CCG task，并运行三同步检查
- [x] 5.3 stage 命名路径、审查最终 diff、提交并记录远端状态；不实施任何重构建议
