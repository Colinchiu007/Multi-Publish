# Proposal: ops-center-resilience — 运营中心远程化韧性落地（断连降级 / 批量告警 / 配置生效验证）

## Why

运营中心即将部署到阿里云 ECS。网络不稳定的现实前提下，桌面端当前存在三个**会直接伤到用户**的问题，
且三者互相独立、根因不同：

| # | 用户可感知的问题 | 当前行为 | 证据 |
|---|---|---|---|
| 1 | 网络抖一下，重启应用后**菜单/平台元数据/模板/关键词/改写配置全部退回代码默认值** | 6 类数据走纯内存 setter，不落盘 | `ops-center-sync.js:485-550` |
| 2 | 网络抖一下，**付费用户被降级为 free**，付费功能直接拒用 | 会员同步失败即清空本地快照 | `entitlement-service.js:88` |
| 3 | 运营改了设置，**完全不知道多少客户端真的生效了**；大面积断连时官方**零感知** | bootstrap 无版本号；客户端从不回执；断连期完全静默 | `runtime_service.py:357` 仅有 `synced_at` |

前两项是「用户受损」，第三项是「运营失明」——运营负责人无法回答「改完到底生效没有」，
这在远程化部署后会被放大到无法接受。

方案设计见 `01-docs/ARCH-OPS-CENTER-RESILIENCE-2026-10-06.md`（PR #2977），本 change 负责**落地实现**。

## What Changes

### A. 三层降级数据源（补 L2/L3 缺口）

- 新增 `ops-runtime-snapshot.js`：L1 内存 → **L2 完整原始 payload 快照** → **L3 打包内置种子**
- L2 存原始 payload 而非归一化摘要 → 启动时可原样重放 6 个内存 setter，一次性消灭「重启丢 6 类数据」
- L3 为随 asar 发布的种子文件（用户设想的「最差情况内置最终版数据」），由 CI schema 校验强制约束

### B. 会员权益宽限期（唯一改动 fail-closed 语义的地方）

- 仅在**网络层异常**时进入宽限：有快照则继续授权，超期 ≤72h 继续授权读功能
- `401/403`、响应结构非法、账号停用**保持原 fail-closed** —— 判据是「没拿到有效响应」而非「请求失败」
- 首次安装无快照仍 fail-closed：无快照无法区分付费用户与未付费用户

### C. 配置生效可验证（让运营不再失明）

- bootstrap 新增 `config_version`（单调递增）+ `config_hash`（内容指纹），落在 Ed25519 签名范围内
- 客户端应用成功后按 **hash 比对**回执 ACK（hash 未变不发，避免推送地狱）
- 服务端按 client_id 留存回执快照 + `GET /api/v1/runtime/rollout` 聚合（生效比例 / 旧版数 / 降级数 / 分块确认率）

### D. 断连降级遥测（让断连可见）

- 客户端断连只写本地队列，**恢复后一次性补报**（断连期间物理上不可能上报）
- 服务端流水表 `client_degradation_events` 支撑影响面统计
- **红线**：运营中心自身宕机的告警必须来自独立外部探针，绝不自监控

## 不做什么

- **不改**「连接失败 fail-open / 契约破坏 fail-closed」这一既有正确语义
- **不改**通道 C（usage / diagnostics / scheduler 上报）——其水印仅成功推进的语义已正确
- **不把管控类配置内置进安装包**（会员权益 / 密钥 / 限流配额 / 封号名单 / 计费规则）——
  过期的封号名单进包 = 客户端变成可篡改的黑名单绕过源
- 本 change 只做服务端 + 客户端**契约与数据通路**；看板前端（V-4）、外部探针（A-5）、
  告警 Webhook（A-6）、审计写入点补全（V-5）、下钻页（V-6）列入范围外并在部署清单勾掉

## Impact

| 面 | 影响 |
|---|---|
| bootstrap 响应 | **新增** `config_version` / `config_hash` 两字段（在签名内）；旧客户端忽略未知字段，向后兼容 |
| 新增端点 | `POST /api/v1/runtime/ack`、`POST /api/v1/telemetry/degradation`、`GET /api/v1/runtime/rollout` |
| 新增表 | `runtime_config_versions`、`runtime_client_ack`、`client_degradation_events` |
| 客户端本地 | 新增 `opsCenterRuntimeSnapshot`、`opsCenterDegradationQueue`、`opsCenterAckState` 三个 settings 键 |
| 安装包 | 新增 `resources/ops-seed/runtime-bootstrap.json`（≤1MB，剔除敏感词库）|
| 破坏性变更 | **无**。所有新字段客户端缺失时均回落既有行为 |

## 验收

见 `specs/ops-center-resilience/spec.md` 的 8 组 Requirement / 26 个 Scenario，
其中关键回归锁为：断网重启后 6 类数据不丢、断网时付费用户不被误伤、
hash 未变时不产生 ACK 流量、非法载荷一律 400、词库进包被 CI 拦截。