# P0 Logto 用户系统实施计划

> **日期**：2026-07-20
> **分支**：`codex/logto-user-system`
> **架构**：[ARCH-F14-logto-user-system.md](./ARCH-F14-logto-user-system.md)
> **约束**：所有开发任务执行 RED → GREEN → REFACTOR；每项不超过 4 小时

## 1. 里程碑

| ID | 任务 | 预计 | 依赖 | 交付/验收 |
|----|------|------|------|-----------|
| D-01 | 更新 PRD、集成架构与云端发布身份边界 | 1.5h | 无 | 文档评审通过、无共享 JWT 新方案 |
| D-02 | F14 详细架构、数据模型、威胁模型 | 2h | D-01 | 架构验收门禁明确 |
| D-03 | 测试计划、环境变量、Logto 部署样例 | 1.5h | D-02 | 配置无密钥、检查脚本可运行 |
| B-01 | 业务用户/entitlement 纯函数与模型测试 | 2h | D-02 | 正常、过期、错 sub/device/signature |
| B-02 | Node JWT/JWKS verifier 与 middleware | 3.5h | B-01 | 401/403、key rotation、scope 测试 |
| B-03 | Python JWT/JWKS verifier 与 FastAPI 依赖 | 3.5h | B-01 | 与 Node 错误语义一致 |
| B-04 | 用户/订阅/entitlement 数据迁移 | 3h | B-01 | 幂等迁移、唯一约束和回滚说明 |
| E-01 | safeStorage Token Storage 测试与实现 | 2.5h | D-03 | 无明文降级、损坏恢复、原子写 |
| E-02 | Loopback Callback Server 测试与实现 | 3h | E-01 | Host/路径/state/超时/并发/关闭 |
| E-03 | Logto Adapter 与 AuthService 状态机 | 4h | E-01,E-02 | 登录、刷新单飞、恢复、退出 |
| E-03B | Electron 独立认证窗口 | 3h | E-02,E-03 | 隔离 Session、导航白名单、关闭取消、外部回退 |
| E-04 | Identity IPC/preload | 2.5h | E-03 | sender 校验、纯 JSON、双 sandbox |
| E-05 | CloudPublisher Bearer Token 接入 | 2.5h | E-03,B-02 | 一次刷新重放、移除 user_id |
| U-01 | Pinia identity store/composable/API | 3h | E-04 | 启动恢复、状态更新、错误映射 |
| U-02 | 登录/账号菜单和云端发布门禁 | 3.5h | U-01 | 所有页面状态、键盘与视觉验证 |
| L-01 | license → entitlement 兼容层 | 4h | B-01,E-03 | 本地 license 不能提权、离线宽限 |
| O-01 | Logto Docker 部署与初始化说明 | 2h | D-03 | PostgreSQL healthcheck、无默认密钥 |
| O-02 | Webhook 验签与 lazy upsert 接口 | 3.5h | B-02,B-04 | HMAC、幂等、失败重试测试 |
| Q-01 | 受影响模块单元/集成/覆盖/故障测试 | 3h | 全部 | 门禁命令通过 |
| Q-02 | Electron 打包、启动、preload、视觉验证 | 4h | E/U/L | QM-1/QM-4 通过 |
| Q-03 | 安全/代码审查、修复与提交 | 3h | Q-01,Q-02 | 无 CRITICAL，相关文件已提交 |

## 2. 执行顺序

```text
D-01 → D-02 → D-03
          ├─ B-01 → B-02/B-03/B-04 → O-02
          └─ E-01 → E-02 → E-03 → E-03B → E-04/E-05 → U-01 → U-02
                               └───────────────→ L-01
O-01 可在 B/E 任务期间独立完成
全部完成 → Q-01 → Q-02 → Q-03
```

## 3. 每模块 TDD 场景门禁

开始写测试前至少列出 5 个场景：正常路径、空/非法输入、权限失败、第三方失败、并发/幂等。测试必须因缺少行为而失败，不能因路径或语法错误失败；最小实现通过后再重构。

主要文件：

```text
apps/desktop/electron/services/identity/*
apps/desktop/electron/ipc-handlers/identity.js
apps/desktop/electron/preload/identity.js
apps/desktop/src/api/identity.js
apps/desktop/src/stores/identity.js
apps/desktop/src/composables/useIdentity.js
packages/api-publish-engine/src/auth/*
packages/python-backend/src/multi_publish/auth/*
migrations/*logto*
deploy/logto/*
```

## 4. Checkpoint

| Checkpoint | 通过条件 | 2026-07-20 状态 |
|------------|----------|-----------------|
| C0 文档 | PRD/架构/测试计划齐全，任务提交 diff 无空白错误 | PASS；全工作区另有 2 处非本任务 EOF 空白告警，不纳入本次提交 |
| C1 身份核心 | Token Storage、Callback、AuthService 测试通过 | PASS；2026-07-21 最终复验 Desktop 覆盖率全量 5007 tests |
| C2 API 安全 | Node/Python JWT 契约和租户隔离测试通过 | PASS；Node API 61 组，Python 2503 passed/1 skipped |
| C3 UI/兼容 | 登录状态、云端门禁、entitlement 兼容通过 | PASS；身份 mock E2E 两个 viewport，像素视觉 16/16 |
| C4 本地交付 | 全量受影响测试、视觉、打包、安全审查通过 | PASS；QM-1、ASAR require、8 秒启动，无 CRITICAL/MAJOR |
| C5 生产验收 | 真实 Logto、真实 PostgreSQL、真实云端链路 | PENDING；需要租户凭据和集成环境 |

完整命令、退出码、警告和未验证边界见 [TEST-PLAN-LOGTO.md](./TEST-PLAN-LOGTO.md#7-本地执行记录2026-07-20)。

## 5. 发布与回滚

先部署 Logto/业务 API，再发布带登录功能的桌面端。灰度时 `IDENTITY_AUTH_ENABLED=true`、`IDENTITY_AUTH_REQUIRED=false`；指标稳定后开启 required。回滚时先关闭 required，再回退客户端。迁移字段只前向保留，不回滚删除；旧 API Key 仅能在受限内部网络临时恢复并立即安排撤销。
