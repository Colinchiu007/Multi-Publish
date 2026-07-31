# 实施计划

## 决策记录

- 任务为 L+、高风险 release-integration：涉及认证、业务数据库、Docker、Nginx 路由和真实用户权益。
- 用户要求暂不调用 antigravity 与 Claude；本任务使用本地独立审计与受控门禁，不把该豁免表述为外部双模型通过。
- `alibabacloud-ecs-code-deploy` 的 AppManager 工作流不适用于已有 Docker Compose 服务，避免覆盖当前 ECS；部署遵循仓库 Runbook 和现有 SSH 通道。

## Phase 1：只读基线

1. 验证 SSH 私钥可用，但不读取或打印其内容。
2. 审计 ECS 根盘、Docker 容器、健康状态、现网 source commit、容器 API 文件哈希、Nginx 路由和公开 endpoint。
3. 将现网 API 的目标文件 SHA-256 与 `main` 比对，并保存旧 image/source/compose 身份作为回滚点。

## Phase 2：受控部署（仅确认存在版本差后）

1. 在独立发布目录准备 `main` 的精确 commit，不覆盖运行中的旧工作目录。
2. 先运行生产配置校验与 migration dry-run；失败即停止。
3. 运行正式 migration；构建并只重建 `publish-api`，不重建 PostgreSQL 或 Logto。
4. 等待容器健康，验证本机与公网 `/health`、`/ready`、introspection 和 `production-smoke.js`。
5. 任一步失败时停止新 API，恢复记录的旧 image/source/Nginx，不删除卷或数据库。

## Phase 3：外部验收分层

1. 记录 deployment 结果后，检查是否能在不改 Required 的前提下自动推进 refresh token 与 A->B 测试。
2. 保留仍需真实账号、云端平台或隔离数据库的场景，并明确前置条件。

## Phase 4：交付

1. 更新部署与验收文档，保留稳定错误码、UTC 时间和版本身份，排除任何 secret。
2. 运行相关合同测试、文档同步和审查；提交、推送、PR checks 与合并后归档任务。
