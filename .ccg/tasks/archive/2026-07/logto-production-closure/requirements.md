# 任务要求

## 目标

将已合入 `main` 的业务 API entitlement 时钟容差修复，以可回滚方式部署到 ECS，并重新取得 migration、`/api/v1/ready`、introspection 与 production smoke 的真实证据。

## 已知边界

- 保持 `IDENTITY_AUTH_REQUIRED=false`；不得因本轮部署提前进入 Required。
- 生产变更前先确认根盘至少保留 5 GiB 且 10% 可用空间、容器健康、当前 source/image 身份和回滚点。
- 不输出或提交 PEM、数据库 URL、M2M secret、Webhook key、entitlement 私钥、Access Token 或 Refresh Token。
- 若远端已经包含目标代码且完整 smoke 通过，只记录新的审计证据，不做无意义重建。
- refresh token 轮换、真正 A->B 主体隔离、主 Hook 更新/暂停与真实乱序、Ky TimeoutError 补偿、恢复演练、并发压力和云端发布撤销分别保持外部验收项，不以本轮 API 部署冒充完成。

## 验收标准

- 远端运行版本与 `main` 的目标 API 文件身份可审计，或明确证明无需部署。
- 如果部署：版本化 migration、容器 health、`/ready` 的 database/schema/oidc/jwks/introspection 与公网 production smoke 均成功。
- 失败时保留旧镜像、旧 source 位置和日志，按 Runbook 回滚，不删除 PostgreSQL 卷或身份数据。
- 所有证据、未完成外部场景和实际部署 commit 记录到部署文档；通过审查、测试、提交与 PR 流程。
