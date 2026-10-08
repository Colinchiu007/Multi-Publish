# Tasks: ops-center-resilience

> 契约见 `design.md`（跨端协议单一真源）。所有任务按 TDD 执行：先写测试再写实现。

## 0. 契约与骨架

- [x] 0.1 建 change（proposal / design / spec / tasks），锁定跨端字段名与语义
- [ ] 0.2 服务端：`RUNTIME_BLOCKS` 常量 + `compute_config_hash()` + 双端向量测试锚点

## 1. 服务端（ops-center/backend）

- [ ] 1.1 [TDD] `models.py` 新增 `RuntimeConfigVersion` / `RuntimeClientAck` / `ClientDegradationEvent` 三表
- [ ] 1.2 [TDD] `runtime_service.py`：`resolve_config_version()` 自愈式分配（hash 变则升版，唯一约束并发兜底）
- [ ] 1.3 [TDD] `POST /api/v1/runtime/ack`：字段校验（全非法返回 400）+ 按 client_id upsert
- [ ] 1.4 [TDD] `POST /api/v1/telemetry/degradation`：字段校验 + 流水落库
- [ ] 1.5 [TDD] `GET /api/v1/runtime/rollout`：聚合（total/acked/stale/degraded + 分块确认率 + 未确认明细），require_admin
- [ ] 1.6 注册路由到 `main.py`，建表接入 `init_db` 启动路径

## 2. 客户端（apps/desktop/electron/services）

- [ ] 2.1 [TDD] 新增 `ops-runtime-snapshot.js`：L2 完整 payload 存取 + L3 种子加载 + 层级解析
- [ ] 2.2 [TDD] 接线 `ops-center-sync.js`：成功后写 L2、启动时 L2→重放 `applyRuntime`、失败不推进 `syncedAt`
- [ ] 2.3 [TDD] 新增 `ops-resilience-reporter.js`：降级本地队列 + ACK hash 比对 + 恢复后补报
- [ ] 2.4 [TDD] 接线 ACK/降级上报到 `ops-center-sync.js`（`applyRuntime` 末尾计算分块结果）
- [ ] 2.5 [TDD] `entitlement-service.js` 宽限期：仅网络异常进宽限，401/403/结构非法/账号停用保持 fail-closed
- [ ] 2.6 断连失败分类（timeout/dns/network/http_5xx/verify_failed）落到 `failure_kind`

## 3. L3 种子与 CI

- [ ] 3.1 新增 `apps/desktop/resources/ops-seed/runtime-bootstrap.json`（剔除 `content_policy.word_list`）
- [ ] 3.2 新增 `scripts/export-ops-seed.js`（从运营中心导出 + 剔除词库 + 写 `_meta`）
- [ ] 3.3 [TDD] 新增 `.github/scripts/check-ops-seed.js`：7 项校验（7 项中仅过期为警告）
- [ ] 3.4 接入 `quality-gate.yml`

## 4. 门禁与交付

- [ ] 4.1 全量测试通过（pytest + node 单测）
- [ ] 4.2 QM-1 打包证据写入 `openspec/records/ops-center-resilience-impl.md`
- [ ] 4.3 CCG 外部双家族评审（claude + opencode）
- [ ] 4.4 `.quality-gates.md` 记录 + PR + CI + 自动合并 + 远程同步回填
- [ ] 4.5 PRD 与相关文档补充（数据校验 / 流程 / 交互 / 显示项 / 提示文案）

## 5. 明确不在本 change 范围（须在部署清单勾掉）

- [ ] A-4 运营中心「客户端健康」看板前端
- [ ] A-5 外部探针配置（阿里云云监控 / UptimeRobot）——基础设施配置，非代码
- [ ] A-6 告警接入（钉钉 / 企微 Webhook）
- [ ] V-4 配置生效看板前端页
- [ ] V-5 `config_audit_log` 写入点补全（装饰器，39 个运营页面）
- [ ] V-6 未确认客户端明细下钻页
- [ ] D-6 墓碑本地持久化补传 / D-7 零配置态限流自检上报