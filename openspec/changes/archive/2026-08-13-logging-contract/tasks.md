## 1. 合同文档

- [x] 1.1 `01-docs/LOGGING-CONTRACT.md`：level 枚举/5 组脱敏清单/字段格式/保留策略/强制日志点/禁止项/静默边界/证据索引
- [x] 1.2 `.ccg/spec/observability/index.md`：代理读精简合同（首个 observability spec 条目）

## 2. 契约防漂移测试

- [x] 2.1 shared-utils vitest：3 处 JS 脱敏实现同源断言（5 组模式标记）
- [x] 2.2 常量断言：desktop 500MB/30d/4096、shared-utils 5MB、python 3MB/15d/gz、容器 50m/5，且与 LOGGING-CONTRACT.md 一致

## 3. 验证与交付

- [x] 3.1 shared-utils vitest + 引用方回归通过
- [x] 3.2 `openspec validate logging-contract` 通过
- [x] 3.3 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）
