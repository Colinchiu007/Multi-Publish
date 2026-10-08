# 运营中心远程化韧性方案 — 断连降级 / 批量告警 / 配置生效验证

- 文档编号：ARCH-OPS-CENTER-RESILIENCE-2026-10-06
- 日期：2026-10-06
- 类型：架构设计（Phase 1.1 产出）
- 范围：`ops-center/`（FastAPI + SQLite，拟部署阿里云 ECS）与 `apps/desktop/`（Electron 桌面端）之间的**全部**数据通道
- 关联文档：
  - `docs/ops-center-ecs-deployment.md`（ECS 部署现状）
  - `01-docs/BUGFIX-HOT-TOPICS-CACHE-CLEARED-ON-FETCH-FAILURE-2026-09-14.md`（本方案降级语义的**既有范式来源**）
  - `openspec/specs/ops-center/*`（各配置项既有契约）

---

## 0. 结论先行（TL;DR）

| 你的问题 | 结论 |
|---|---|
| 哪些模块连运营中心？ | **主通道 1 条**（`ops-center-sync.js`，承载 14 类下发数据）+ **业务通道 1 条**（`/api/v1/me/*`，独立主机）+ **上报通道 3 条**（纯写，失败无影响）。详见 §2 |
| 断连时会不会影响用户？ | **现状：会**。模型目录/菜单/公告/开关/敏感词/平台元数据全部停在旧值；更严重的是会员权益走 **fail-closed**，失败即降级为 free 并**清空本地快照**（`entitlement-service.js:88`） |
| 降级怎么做？ | 三层数据源 **L1 内存 → L2 本地 SQLite 快照 → L3 打包内置种子数据**。L2/L3 当前**部分缺失**，本方案给出补齐路径（§4） |
| 批量断连怎么让官方知道？ | 客户端**降级也上报**（失败遥测队列）+ 服务端**异常率熔断告警**（§5） |
| 改完设置怎么知道生效了？ | 根因是 bootstrap payload **没有配置版本号**（只有 `synced_at`）。方案：加 `config_version` + 客户端 **ACK 回执** + 运营中心**生效看板**（§6） |

> ⚠️ **一个必须先澄清的事实**：代码中会员 API 指向 `auth.iart.work`（`config/identity-public.json:8`），而运营中心是 `ops.iart.work`（同文件 `:22`）——**这是两台不同主机**。且 `cloud-account-core.js:67` 注释称 `/api/v1/me/*` 由 ops-center 提供，但 ops-center 仓库内**不存在该路由**。
> ✅ **已于 2026-10-08 实测确认**：`auth.iart.work` 存活且 `/api/v1/me` 返回 401（端点真实存在），`ops.iart.work` TLS 握手失败（未部署）——**会员 API 与 ops-center 是两套独立服务，本方案 §2.3/§4.7 的判断成立**。

---

## 0.1 实施状态更新（2026-10-08）

本方案的核心设计**已实施并合入 main**（PR #3126「断网不再让用户受损 —— 三层降级 / 权益宽限期 / 配置生效可验证」，merge SHA `acfea7d3`，OpenSpec change：`openspec/changes/ops-center-resilience/`）。

| 方案条目 | 实施物 | 状态 |
|---|---|---|
| §4.2 L2 快照（存原始 payload） | `apps/desktop/electron/services/ops-runtime-snapshot.js`（key `opsCenterRuntimeSnapshot`，存原始 bootstrap payload，成功同步且验签通过才写） | ✅ 已合入 |
| §4.5 L3 内置种子（剔除敏感词库） | `apps/desktop/resources/ops-seed/runtime-bootstrap.json`（14 字段，`content_policy.word_list` 已剔除、无签名）+ `.github/scripts/check-ops-seed.js` CI 校验 | ✅ 已合入 |
| §4.7 权益宽限期 | `entitlement-service.js`：`ENTITLEMENT_GRACE_SECONDS = 72h`，过期快照在宽限期内以 `source: 'grace'` 授权（写操作 onlineOnly 拒绝），过期后降级 free | ✅ 已合入（72h 与 §4.7 建议一致） |
| §6.2 配置版本号 | 服务端 `config_fingerprint.py`（13 个下发块 canonical JSON SHA-256 前 16 位）+ `resolve_config_version()`（hash 相同不递增版本，fail-closed） | ✅ 已合入 |
| §6.2 ACK 回执 | 客户端 `ops-resilience-reporter.js`（hash 比对、变化才 ACK、24h 心跳、恢复后补报）+ 服务端 `POST /api/v1/runtime/ack` | ✅ 已合入 |
| §5.2 降级遥测 | 客户端降级队列（上限 200 条）+ `POST /api/v1/telemetry/degradation` + `GET /summary` | ✅ 已合入 |
| §6.3 生效看板 / §6.3 审计补全 / A-4 健康看板 / A-5 外部探针 | 服务端已有 `GET /api/v1/runtime/rollout` 聚合端点（total/acked/stale/degraded）；**前端看板页、`config_audit_log` 写入点补全、外部探针、告警接入仍未做** | ⬜ 待后续 change |

> 剩余项与 tasks.md §5「不在本 change 范围内的外部清单」一致：A-4/A-5/A-6、V-4/V-5/V-6、D-6/D-7。部署 ECS 前至少需完成 A-5（外部探针）与 §7 检查清单第 1 项（信任锚）。

---

## 1. 质量节拍门禁记录

| 门禁项 | 判定 | 依据 |
|---|---|---|
| 变更类型 | 📝 纯文档（架构方案） | 仅新增 `.md`，无代码变更 |
| 落地通道 | **docs-only 快速通道** | `01-docs/` 命中 `CI_IGNORED_PATHS` 文档白名单 |
| 隔离策略 | 共享主工作区就地编辑 + 分支 PR 落地 | 纯文档不需 worktree（AGENTS.md 分层分支策略） |
| QM-1 打包 | 跳过 | docs-only 豁免 |
| QM-2 代码必检 | 跳过 | docs-only 豁免 |
| QM-4 视觉 | 跳过 | 无 UI 变更 |
| QM-5 Bug 反思 | 不适用 | 本次非 Bug 修复 |
| QM-6 双模型评审 | 跳过 | docs-only 豁免 |
| 保留门禁 | ①变更类型与隔离声明 ②行尾/编码对账 ③品牌残留 ④文档同步 ⑤CHANGELOG ⑥远程同步 | 见文末「执行记录」 |

**本方案是设计文档，不含实现**。实现需按 AGENTS.md 走 `/opsx:propose` 建 OpenSpec change（属 M+ 中高风险任务：跨端协议变更 + 数据库变更）。

---

## 2. 全量连接面清单（事实基线）

### 2.1 三条通道的分野

```
┌─────────────────────────────────────────────────────────────┐
│  通道 A：ops-center 主通道（你的部署对象）                    │
│  Base URL: identity-public.json → opsCenterUrl → OPS_CENTER_URL│
│  生产值:   https://ops.iart.work                              │
│  鉴权:     Logto JWT Bearer  或  X-Catalog-Key               │
│  载体:     apps/desktop/electron/services/ops-center-sync.js  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  通道 B：会员/业务 API（独立主机，非 ops-center）              │
│  Base URL: identity-public.json → businessApiUrl             │
│  生产值:   https://auth.iart.work   ← 与 A 不同主机！         │
│  鉴权:     Bearer + X-Device-Id                              │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  通道 C：纯上报（只写不读，失败无功能影响）                    │
│  usage/ingest · diagnostics/ingest · scheduler/verify         │
│  共同语义: 失败仅 warn，水印不推进，本地队列堆积待下周期重试    │
└─────────────────────────────────────────────────────────────┘
```

**关键判据**：只有通道 A/B 的「读」方向会影响用户功能。通道 C 断连只会丢统计数据，不影响功能——**降级方案主要针对 A/B**。

### 2.2 通道 A：bootstrap 下发的 14 类数据（逐项核实）

服务端 `ops-center/backend/services/runtime_service.py:334` `get_runtime_bootstrap()` 返回：

| # | payload 字段 | 消费方（桌面端） | 断连影响 | 当前 L2 快照 | 当前 L3 种子 |
|---|---|---|---|---|---|
| 1 | `announcements` | `_loadRuntimeState` → 公告组件 | 公告停更 | ✅ `opsCenterRuntime` | ❌ |
| 2 | `update_policy` | `getUpdatePolicy()` → auto-updater | **自动更新策略失效** | ✅ | ❌ |
| 3 | `content_policy` | `getSensitiveFilter()` → 敏感词 | 退回内置词库 | ✅ | ✅ 内置词表 |
| 4 | `feature_flags` | `getFeatureFlag()`（如 `videoCreation.maxOutputResolution`） | 开关回默认 | ✅ | ✅ 缺省=undefined |
| 5 | `platform_defs` | `platformConfig.applyRemote()` → 发布元数据 | 平台字数/封面尺寸回本地 yaml | ❌ **仅内存** | ✅ `config/platforms.yaml` |
| 6 | `content_templates` | `templateManager.applyRemote()` | 官方模板不可用 | ❌ **仅内存** | ❌ |
| 7 | `keyword_watchlist` | `keywordMonitor.applyRemoteWatchlist()` | 关键词监测空 | ❌ **仅内存** | ❌ |
| 8 | `rewrite_strategies` | `rewriteStrategyManager.applyRemote()` | 改写策略回内置 | ❌ **仅内存** | ✅ 引擎内置 |
| 9 | `rewrite_hard_constraints` | `rewriteHardConstraintManager.applyRemote()` | 硬约束回内置 | ❌ **仅内存** | ✅ 引擎内置 |
| 10 | `rewrite_ai_taste_map` | `rewriteAiTasteMapManager.applyRemote()` | 去 AI 味词库回内置 | ❌ **仅内存** | ✅ `shared-utils` |
| 11 | `pipelineOptions` | `getPipelineOptions()` → 视频流水线可见性 | 回默认可见性 | ✅ | ✅ 组件默认 |
| 12 | `appMenu` | `getAppMenu()` → 左侧边栏 | 菜单回本地默认 | ✅ | ✅ `src/config/sidebar-menu.js` |
| 13 | `contentCategories` | `getContentCategories()` → 内容分类 | 分类回内置 10 类 | ✅ | ✅ `content-categories.js:23` |
| 14 | `model-presets/catalog` | `manager.applyCatalog()` → 模型服务商 | **模型目录停更** | ⚠️ 间接 | ✅ `model-provider-seeds.js` |

> **L2 缺口（第 5-10 项）**：`applyRuntime()` 对这 6 块走**纯内存 setter**（`ops-center-sync.js:485-550`），**不落盘**。断连或重启后这 6 块直接丢失，退回内置值。这是最需要补齐的缺口。

### 2.3 通道 B：会员/业务 API（**风险最高**）

| 文件 | 端点 | 阻塞性 | 失败行为 | 用户可见影响 |
|---|---|---|---|---|
| `identity/entitlement-service.js:81` | `GET /api/v1/me` | 登录必经 | 抛 `ENTITLEMENT_SYNC_FAILED`；**`:88` 清空本地快照** | 🔴 **fail-closed 最狠**：会员降级 free，付费功能被 `ENTITLEMENT_REQUIRED` 拒 |
| `identity/member-api-service.js` | 8 条白名单 | 同步阻塞 | 抛 `MEMBER_API_REQUEST_FAILED` | 设备管理/消息中心不可用 |
| `cloud-account-sync.js` | `/me/accounts` `/sync` | 用户点按钮 | 降级不抛，`reachable:false` | 账号同步失败（本机数据不动，**设计正确**） |
| `cloud-account-tombstone.js:17` | `POST /me/accounts/tombstones` | best-effort | `recorded:false` | ⚠️ 已删账号**可能下次同步复活** |
| `ipc-handlers/identity.js:48` | `/me/sessions` `/notifications` | 同步阻塞 | 透传上游错误 | 设备列表/消息中心打不开 |

> **`cloud-account-sync.js:286-294` 是本仓最讲究的降级**：读不到云端全集时**拒绝把任何本机账号上行**——因为空墓碑集合会让云端已标删的账号被本机「复活」。这与 §4 的 fail-closed 原则一致，应作为全局范式。

### 2.4 通道 C：纯上报（断连无功能影响）

`usage-reporter.js:183` / `diagnostics-reporter.js:220` / `ipc-handlers/rate-limit.js:64`

共同语义（**已正确实现，无需改动**）：
- 失败仅 `warn` + 返回 `{code:-1}`，不抛
- **水印不推进**（`usage-reporter.js:191` 仅在 `resp.ok` 后 `_saveWatermark`）→ 下周期重试，数据不丢
- 本地 SQLite 队列堆积（`MAX_QUEUE_ROWS=5000`）待恢复后补传

> ⚠️ **但有一个反直觉的缺口**：`rate-limit.js:38` 硬要求 `cfg.apiKeyConfigured`。零配置登录态（方案 C，Bearer）下 `apiKeyConfigured` 为 `false` → **限流自检无法上报**。这大概率是遗漏而非设计（`ops.iart.work` 部署后所有零配置用户都命中）。见 §8 风险 R3。

### 2.5 明确**不连**运营中心的模块（排除项，避免误伤）

| 模块 | 依据 |
|---|---|
| `license-manager.js` / `payment-manager.js` / `redemption-codes.js` | `api/v1\|fetch\|https?://` 零命中，纯本地逻辑 |
| `login-status-monitor.js` / `login-network-diagnostics.js` | 仅处理微信登录 URL，非 ops-center |
| `content-intelligence-sources.js` | 打 reddit.com / hn.algolia.com / api.github.com（外部公开源） |
| `adapters/doubao-tts.js:176` | `/api/v1/tts` 是**字节跳动**的同名路径，与 ops-center 无关 |
| `zhihu-favlist-service.js:18` | `developer.zhihu.com/api/v1` — 知乎官方 |
| `shared-utils/platform-config.js` | 读**本地** `platforms.yaml`；`applyRemote()` 是被 bootstrap 调用的被动 setter |
| `shared-utils/network-egress-guard.js` | 测试用 `net.connect` 守卫，不发业务请求 |
| `scripts/sync-platform-config.js` | 开发期人工脚本，默认打本地 `:8010`，不随应用运行 |

---

## 3. 现状风险评级

| ID | 风险 | 严重度 | 证据 | 现状 |
|---|---|---|---|---|
| **R-A1** | 会员权益 fail-closed，失败即清空快照 | 🔴 P0 | `entitlement-service.js:88` `_clearForGeneration` | 断连 → 付费用户被降级为 free，**直接导致付费功能不可用** |
| **R-A2** | 6 类数据仅内存不落盘 | 🟠 P1 | `ops-center-sync.js:485-550` | 重启即丢，退回内置值 |
| **R-A3** | 无配置版本号，无法判断生效 | 🟠 P1 | `runtime_service.py:357` 只有 `synced_at` | 运营改完不知是否生效（**用户核心痛点**） |
| **R-A4** | 审计日志只覆盖 2 张表 | 🟠 P1 | `config_audit_log` 仅被 `config_service.py`/`snapshot_service.py` 写入 | 39 个运营页面中 37 个的改动**无审计记录** |
| **R-A5** | 零配置用户无法上报限流自检 | 🟡 P2 | `rate-limit.js:38` 硬要求 `apiKeyConfigured` | 限流规则无法校准 |
| **R-A6** | 墓碑丢失导致账号复活 | 🟡 P2 | `cloud-account-tombstone.js:70` `recorded:false` | 断连时删账号，下���同步复活 |
| **R-A7** | 无断连可观测性 | 🟠 P1 | 客户端仅本地 `log.warn` | **批量断连官方零感知**（用户核心痛点） |
| **R-A8** | 打包版无信任锚则全部策略拒绝 | 🔴 P0 | `runtime-trust-anchor.js` / `ops-center-sync.js:97` | `NO_PRODUCTION_TRUST_ANCHOR` → 打包版**必须**配自定义 Ed25519 公钥，否则运行时策略全废 |

> **R-A8 是部署前必须做的动作**，详见 §7 部署检查清单。

---

## 4. 方案一：三层降级架构

### 4.1 设计原则（继承项目既有范式）

本方案**不发明新语义**，直接复用 `BUGFIX-HOT-TOPICS-CACHE-CLEARED-ON-FETCH-FAILURE-2026-09-14.md` 已确立的原则：

1. **空结果是「缺失信息」而非「真实状态」** — 拉取失败不得用空集合覆盖已有数据
2. **`fetchedAt` / `syncedAt` 不得在零结果时推进** — 否则 TTL 内的「假新鲜」会关闭自动恢复通道
3. **降级必须可见** — 打 `warn` 日志 + 状态位，不静默
4. **契约破坏要 fail-closed，连接失败要 fail-open** — 二者不可混淆（关键区分，见 §4.4）

### 4.2 三层数据源

```
                  ┌─────────────────────────────────────┐
   读取优先级  L1 ─▶│ 内存态（本次会话已应用的运行时策略）    │  最快，但重启即失
                  ├─────────────────────────────────────┤
             L2 ─▶│ 本地 SQLite 快照（settings 表）        │  重启存活
                  │  key = opsCenterRuntime             │  ← 当前仅 7/14 项有
                  │  key = opsCenterRuntimeSnapshot（新） │  ← 建议新增，全量
                  ├─────────────────────────────────────┤
             L3 ─▶│ 打包内置种子（随 asar 发布）           │  最终保底，永不失效
                  │  config/ops-seed/*.json              │  ← 建议新增
                  └─────────────────────────────────────┘
```

### 4.3 各级填充策略

| 级别 | 内容 | 生命周期 | 现状 |
|---|---|---|---|
| **L1** | 启动时从 L2 恢复 + 本次 applyRuntime 的最新值 | 单次运行 | ✅ 已有 |
| **L2** | bootstrap **完整 payload** 原文落盘（不仅 `_runtime` 摘要） | 永久（直到下次成功同步） | ⚠️ 需补齐：新增 `opsCenterRuntimeSnapshot` 存**原始 payload** |
| **L3** | 打包时的「最终版数据」 | 随版本发布 | ⚠️ 需新建：见 §4.5 |

**关键设计**：L2 存**原始 payload** 而非归一化后的 `_runtime`。理由：`applyRuntime` 的 6 个内存 setter（`platform_defs` / `content_templates` / `keyword_watchlist` / `rewrite_*`）的**入参就是原始 payload 块**，存原文即可在启动时原样重放，无需为每个 setter 单独设计持久化格式。

### 4.4 关键区分：连接失败 vs 契约破坏

这是本方案最容易做错的地方，必须明确：

| 情形 | 语义 | 行为 |
|---|---|---|
| **连接失败**（超时/DNS/5xx/网络断开） | 不知道新值 | **fail-open**：用 L1→L2→L3，`syncedAt` **不推进**，继续重试 |
| **契约破坏**（验签失败/结构非法） | 知道但**不可信** | **fail-closed**：拒绝应用任何策略，保留旧值 + 告警 |
| **显式空配置**（运营主动清空某项） | 知道且可信 = 空 | 正常应用为空 |

现有代码**已正确实现**这一区分：`ops-center-sync.js:300` 失败降级 warn（不落盘）、`:603-608` 验签失败抛错拒绝全部应用。方案要**保持**这个语义，只补 L2/L3。

### 4.5 L3 内置种子数据的生成流程（你的「最差情况」需求）

你的设想——「打包发布时把最终版数据作为内置初始数据」——**完全可行且应该做**。具体流程：

```
【生成】（发布流水线，CI 或本地手动）
  1. 从生产 ops-center 拉一次 GET /api/v1/runtime/bootstrap
  2. 落盘为 apps/desktop/resources/ops-seed/runtime-bootstrap.json
  3. 人工 review（运营确认这就是要随版本发布的「最终版」）
  4. 提交该文件（随版本 PR 一起）

【校验】（CI 强制）
  · schema 校验：14 个字段齐全、类型正确
  · 大小上限：与运行时 1MB 限制对齐（ops-center-sync.js:26）
  · 签名：若包含敏感项（content_policy 词库）需评估是否应剔除
  · 时效告警：seed 文件 > 90 天未更新 → CI 警告（避免发版忘更新）

【消费】（运行时）
  L3 仅在 L1/L2 均不可用时读取；一旦成功同步到 L2，L3 自动让位
```

**L3 的边界（必须明确写死）**：
- ✅ 承载：菜单、平台元数据、内容分类、默认开关、公告、流水线可见性、模型目录种子
- ❌ **不承载**：会员权益、密钥、限流配额、封号名单、计费规则
  — **理由**：这些是**安全/付费语义**。把过期的封号名单内置进客户端 = 客户端变成可篡改的黑名单绕过源；把过期的权益内置 = 已退订用户仍能用。**L3 只承载「体验类配置」，绝不承载「管控类配置」**。

**替代方案（更轻量）**：若不想维护 seed 文件，可退化为「L3 = 现有代码内置默认值」（第 3/4/8/9/10/11/12/13/14 项**已有**）。差别在于运营改完配置但断连时，用户拿到的是**代码默认值**而非**最近的运营值**。建议仍做 seed 文件，因为你的痛点正是「运营改的东西要能在客户端体现」。

### 4.6 实施清单（L2/L3 补齐）

| # | 任务 | 规模 | 优先级 | 落点 |
|---|---|---|---|---|
| D-1 | 新增 `opsCenterRuntimeSnapshot` 持久化完整 payload | 中 | P0 | `ops-center-sync.js` `_saveRuntimeState()` 旁 |
| D-2 | 启动时按 L1→L2 恢复并**重放 6 个内存 setter** | 中 | P0 | `_loadRuntimeState()` + `applyRuntime` 拆分 |
| D-3 | 新增 `config/ops-seed/runtime-bootstrap.json` 生成脚本 | 小 | P1 | `scripts/export-ops-seed.js`（新） |
| D-4 | seed schema 校验接入 CI | 小 | P1 | `.github/scripts/check-ops-seed.js`（新） |
| D-5 | 会员权益 fail-closed 改为**宽限期 fail-open** | 中 | P0 | `entitlement-service.js`（见 §4.7） |
| D-6 | 墓碑本地持久化，断连恢复后补传 | 小 | P2 | `cloud-account-tombstone.js` |
| D-7 | `rate-limit.js:38` 支持 Bearer 零配置态 | 小 | P2 | `ipc-handlers/rate-limit.js` |

### 4.7 会员权益的宽限期设计（R-A1 专项）

这是**唯一一处需要改动 fail-closed 语义**的地方，因此单独设计：

```
现状：拉取失败 → 清空快照 → 降级 free → 付费功能被拒
风险：网络抖动 = 付费用户被误伤（比服务不可用更伤信任）

建议：引入「权益宽限期」
  ┌─ 成功拉到权益 ──────────────────→ 正常，按 plan 授权
  ├─ 拉取失败 + 本地有快照 + 快照未过期(< 7 天) → 用快照授权（标记 degraded）
  ├─ 拉取失败 + 本地有快照 + 快照已过期(≥ 7 天) ─→ 宽限 72h 继续授权
  │                                            （此时读功能降级，禁新增付费消耗）
  └─ 拉取失败 + 无本地快照（首次安装即断连）  → 降级 free（保持 fail-closed）
```

**为什么首次安装仍 fail-closed**：无快照时无法区分「正版付费用户」与「未付费用户」，fail-open 会让所有人白嫖。而**有快照**时，快照本身就是上次成功认证的证据，信任它合理。

**7 天 + 72h 的依据**：覆盖「周末断连 + 工作日才发现」的最长常见周期；宽限期只禁「新增付费消耗」（写操作）而不禁「读功能」，避免用户完全不可用。

---

## 5. 方案二：批量断连告警机制

### 5.1 核心洞察

现有通道 C（usage/diagnostics 上报）**只在成功时推进水印**——这意味着断连期间客户端**完全静默**。官方想知道「多少用户在用旧数据」，必须让**降级本身成为可上报的事件**。

### 5.2 三层探测（成本递增，覆盖递进）

```
┌─ L1 客户端自探测（零成本，永远可用）
│   客户端统计本机连续失败次数/时长
│   → 达到阈值（连续失败 ≥3 次 或 累计断连 > 30min）触发本地降级事件
│   → 写入本地 SQLite 降级队列（复用 diagnostics_queue 模式）
│
├─ L2 断连期集中补报（网络一恢复就报）
│   网络恢复后**一次性**上报断连期间累计：
│     { client_id, 断连起止时间, 连续失败次数, 影响的 endpoint, 当时用的降级层级 }
│   → 服务端入库，用于「影响面统计」
│
└─ L3 服务端异常率探测（不需要客户端配合，最可靠）
    服务端侧独立监控：
      · 请求量断崖（QPS 骤降 > 80%）
      · 客户端 ACK 心跳缺失率
    → 触发运维告警（邮件/钉钉/企微 Webhook）
```

### 5.3 关键设计：降级遥测不能依赖被监控的同一通道

> 🔴 **这是本方案最容易踩的坑**：如果断连告警也走 `/api/v1/diagnostics/ingest`，那么**运营中心自己挂了的时候，告警也发不出去**。

必须分层：

| 场景 | 告警通道 | 说明 |
|---|---|---|
| 运营中心存活、个别客户端断连 | `/api/v1/telemetry/degradation`（主通道，恢复后补报） | L2 |
| **运营中心自身不可用** | 外部监控（阿里云云监控 / UptimeRobot / 独立轻量探针） | **绝不能依赖运营中心自己** |
| ECS 宕机 / 磁盘满 / 证书过期 | 阿里云云监控 + 外部探针 | 基础设施层 |

**L3 服务端侧的具体熔断规则建议**：

| 指标 | 阈值 | 动作 |
|---|---|---|
| bootstrap 请求 QPS 环比 | 骤降 > 80% 且持续 5min | 🔴 P0 告警 |
| 客户端心跳缺失率 | > 30%（对比历史基线） | 🟠 P1 告警 |
| 降级事件上报量 | 突增 > 3σ | 🟠 P1 告警（说明大面积用户降级） |
| 单客户端连续降级时长 | > 24h | 🟡 P2 记录（可考虑强提醒用户） |

> 心跳缺失率需要 §6 的 ACK 机制作为数据源——两个方案是**互相支撑**的。

### 5.4 实施清单

| # | 任务 | 规模 | 优先级 |
|---|---|---|---|
| A-1 | 新增本地降级队列（复用 `diagnostics_queue` 模式） | 中 | P0 |
| A-2 | 新增 `POST /api/v1/telemetry/degradation` + 入库表 | 中 | P0 |
| A-3 | 断连恢复后集中补报（含降级层级字段） | 小 | P0 |
| A-4 | 运营中心前端新增「客户端健康」看板 | 中 | P1 |
| A-5 | 外部探针（**独立于运营中心**）配置 | 小 | P0 |
| A-6 | 告警接入（钉钉/企微 Webhook） | 小 | P1 |

---

## 6. 方案三：配置生效验证机制

> 这是你三个问题里**最难但价值最高**的一个。先说清根因。

### 6.1 根因诊断

「改完设置不知道有没有生效」由**三个叠加缺口**造成：

| # | 缺口 | 证据 |
|---|---|---|
| **G1** | **bootstrap payload 没有配置版本号** | `runtime_service.py:343-358` 只有 `synced_at`（时间戳），**无法标识「这是第几版配置」** |
| **G2** | **审计日志只覆盖 2 张表** | `config_audit_log` 仅被 `config_service.py` / `snapshot_service.py` 写入；39 个运营页面中 `announcements` / `feature_flags` / `platform_defs` / `app_menu_items` 等**全部无审计** |
| **G3** | **客户端从不回执** | `applyRuntime` 成功后只调 `setOnRuntimeUpdated` 广播渲染端（`ops-center-sync.js:555`），**不回传服务端** |

**结果**：运营改了 → 数据库变了 → 但**没有任何一条链路能证明**「多少客户端已经吃到了这一版」。

### 6.2 方案：版本号 + 双向确认

```
┌──────────────┐                                    ┌──────────────┐
│  运营中心      │  ①改配置 → config_version: 42      │  桌面客户端    │
│  (权威)       │ ────────bootstrap(带 version=42)──▶ │              │
│              │                                    │  ②验签       │
│  生效看板      │ ◀──── ③ACK(version=42, 应用结果)──── │  ③应用      │
│  "42 版已     │                                    │  ④上报 ACK   │
│   被 87% 客户 │                                    │              │
│   端确认生效"  │                                    │              │
└──────────────┘                                    └──────────────┘
```

**第 ① 步 — 加版本号（修 G1）**

```python
# runtime_service.py
async def get_runtime_bootstrap(db):
    payload = { ...14 个数据块... }
    # 新增：配置指纹 —— 由全部下发数据的规范化哈希派生
    payload["config_version"] = compute_config_version(payload)
    payload["synced_at"] = _now()
    return payload
```

**两种版本号取法**（建议同时用）：

| 类型 | 算法 | 用途 |
|---|---|---|
| **单调递增 `config_revision`** | 服务端每次配置变更 `+1`（落 `config_items` 或新表） | 人可读：「42 版」 |
| **内容哈希 `config_hash`** | 对 14 个数据块 canonical JSON 取 SHA-256 前 16 位 | 机器判定：内容是否真变 |

> 为什么两个都要：运营想看「42 版」（直观），但**「改了但内容其实没变」**（如点了个保存没动数据）会浪费 revision 号，导致看板虚高。`config_hash` 能识别这种情况。

**第 ② 步 — 客户端计算生效确认（修 G3）**

```javascript
// ops-center-sync.js applyRuntime 末尾
const applied = {
  config_version: payload.config_version,
  config_hash:    payload.config_hash,
  // 分块应用结果——哪几块真的应用成功
  applied_blocks: {
    announcements:      n_announcements,
    platform_defs:      n_platforms,
    content_templates:  n_templates,
    keyword_watchlist:  n_keywords,
    rewrite_strategies: n_strategies,
    feature_flags:      Object.keys(flags).length,
    // ...
  },
  // 哪些块本轮未应用（依赖注入缺失/空配置）
  skipped_blocks: [...],
  client_version: app.getVersion(),
  degraded: false,
}
this._degradationReporter?.reportApplied(applied)
```

**第 ③ 步 — 服务端聚合成生效看板**

```sql
-- 新表：config_rollout
-- 记录每次配置变更 + 其 ACK 分布
CREATE TABLE config_rollout (
  config_version  INTEGER PRIMARY KEY,
  config_hash     TEXT NOT NULL,
  changed_by      TEXT NOT NULL,
  changed_at      TEXT NOT NULL,
  blocks_changed  TEXT,      -- JSON: 本次改了哪几块
  -- 聚合字段（定时任务刷新）
  ack_total       INTEGER DEFAULT 0,   -- 已确认客户端数
  ack_24h         INTEGER DEFAULT 0,   -- 24h 内活跃且已确认
  clients_stale   INTEGER DEFAULT 0,   -- 仍在用旧版
  clients_degraded INTEGER DEFAULT 0  -- 降级中（断连）
);
```

**运营负责人在看板看到的是**：

```
配置版本 42  ·  内容哈希 a3f9c2e1  ·  2026-10-06 14:30  ·  张三修改
─────────────────────────────────────────────────────────
本版改动: appMenu(3项) / featureFlags(1项)

生效进度  ████████████████░░░░  82%
  已确认生效   1,842 / 2,245 台（最近 24h）
  仍在用旧版     287 台  ⚠️
  降级中        116 台  🔴 ← 这批是断连用户

分块确认率:
  appMenu          97%  ✅
  featureFlags     94%  ✅
  contentTemplates 71%  ⚠️  ← 有问题？
  keywordWatchlist 68%  ⚠️  ← 有问题？

未确认明细（可展开）:
  client-a3f9  v2.1.0  断连 6h    最后 ACK v41
  client-b7e2  v2.1.0  正常      最后 ACK v41  ← 未重试？
  ...
```

**这直接回答你的问题**：「改了之后真实生效了吗」→ 不再靠猜，看板直接给出**生效比例 + 未确认原因**（断连 / 版本太老 / 某块应用失败）。

### 6.3 修 G2：补全审计日志

`config_audit_log` 现有字段（`models.py`）已经很完整：`config_id / old_value / new_value / changed_by / changed_at / change_type / source_ip`。

**最小改动方案**：不改表结构，只补**写入点**。提供一个通用装饰器/依赖：

```python
# ops-center/backend/services/audit.py（新）
@audit_config(config_key="appMenu", extractor=lambda body: body["items"])
async def update_app_menu(...): ...
```

覆盖 39 个页面中**会下发到客户端的**那些（`config_audit_log` 已有 `config_items` 键，直接复用，不需改 schema）。

### 6.4 ACK 频率控制（避免变成推送地狱）

| 场景 | ACK 策略 |
|---|---|
| `config_hash` **未变** | **不 ACK**（省流量，绝大多数情况） |
| `config_hash` 变化 | 立即 ACK（一次） |
| 无变化但距上次 ACK > 24h | 每日心跳 ACK 一次（用于算「活跃确认数」） |
| 断连恢复 | 恢复后立即 ACK（带 `degraded: true` + 断连时长） |

> 关键：**用 hash 而非 revision 判断是否需要 ACK**。否则每次发布无关配置，所有客户端都会上报一次，几千台 × 每次发布 = 无谓流量。

### 6.5 实施清单

| # | 任务 | 规模 | 优先级 |
|---|---|---|---|
| V-1 | 服务端加 `config_revision` + `config_hash` | 中 | P0 |
| V-2 | 客户端计算并上报 ACK（含分块结果） | 中 | P0 |
| V-3 | 新表 `config_rollout` + 定时聚合任务 | 中 | P0 |
| V-4 | 运营中心「配置生效看板」前端页 | 中 | P1 |
| V-5 | 补全 `config_audit_log` 写入点（装饰器） | 中 | P1 |
| V-6 | 未确认客户端明细下钻页 | 中 | P2 |

---

## 7. 部署前必做检查清单（ECS）

| # | 检查项 | 依据 | 状态 |
|---|---|---|---|
| 1 | **配置自定义 Ed25519 信任锚** | `runtime-trust-anchor.js`：打包版无自定义锚 → `NO_PRODUCTION_TRUST_ANCHOR` → **运行时策略全部拒绝** | ⬜ |
| 2 | 确认 `ops.iart.work` 域名与证书 | `docs/ops-center-ecs-deployment.md` | ⬜ |
| 3 | 确认 `/api/v1/me/*` 归属主机（`auth.iart.work` vs ops-center） | §0 警告、风险 R1 | ⬜ |
| 4 | 生成并提交 L3 seed 文件 | D-3 | ⬜ |
| 5 | 外部探针配置（**独立于运营中心**） | A-5 | ⬜ |
| 6 | nginx 限流与超时配置 | `ops-center/deploy/nginx-ops.conf` | ⬜ |
| 7 | SQLite 备份策略（配置表是权威源） | `models.py` 37 张表 | ⬜ |
| 8 | `OPS_CENTER_URL` 注入 identity-public.json | `ops-center-sync.js:587` | ⬜ |

---

## 8. 风险与未知

| ID | 风险 | 影响 | 建议动作 |
|---|---|---|---|
| **R1** | ~~`/api/v1/me/*` 生产归属未定~~ | ✅ **已实测关闭（2026-10-08）**：`curl https://auth.iart.work/api/v1/me` 返回 401（端点真实存在、主机存活），`https://ops.iart.work` TLS 握手失败（未部署）。**确认会员 API 由独立主机 `auth.iart.work` 承载，与 ops-center 无关**。§2.3/§4.7 的方案对象不变 | 已实测，无需动作 |
| **R2** | ~~`ops.iart.work` 是否已部署~~ | ⚠️ **实测（2026-10-08）确认仍未部署**：TLS 握手失败（HTTP 000）。注意本机 DNS 被代理 Fake-IP 网段（198.18.x）接管，两域名解析到保留地址，**从开发机无法验证公网真实状态**；部署时需在服务器侧用 `curl https://ops.iart.work/health` 复测。部署前通道 A 全部读类功能维持降级态，符合预期 | ECS 部署时一并验证 |
| **R3** | 零配置登录态下 `rate-limit.js:38` 硬要求 `apiKeyConfigured` → 限流自检无法上报 | 限流规则无法校准 | D-7 修复 |
| **R4** | L3 seed 含 `content_policy` 敏感词库 | 词库进包 = 可被逆向 | seed 生成时**剔除** `content_policy.word_list`，只保留 `enabled` 开关 |
| **R5** | ACK 上报会新增客户端→服务端流量 | 当前 bootstrap 是拉取，加 ACK 后变成双向 | ACK 用 hash 比对，变化才发（§6.4），量级可控 |
| **R6** | 本方案未做真实网络故障注入验证 | 降级逻辑的时序正确性未经实测 | 实施后按 §9 验收场景逐项验证 |

---

## 9. 验收标准（实施后逐项验证）

| # | 场景 | 期望结果 |
|---|---|---|
| 1 | 断网后启动应用 | 菜单/公告/分类/平台元数据/模型目录**全部可用**（L2 或 L3 兜底），无报错弹窗 |
| 2 | 断网状态下发布内容 | 发布流程完整可用（限流用 L2 配额） |
| 3 | 断网时会员用户登录 | 宽限期内**保持付费权益**，功能可用 |
| 4 | 首次安装即断网 + 付费用户 | 降级 free（fail-closed，符合设计） |
| 5 | 断网 → 恢复 | 自动同步，**`syncedAt` 前进**，ACK 上报，运营看板可见 |
| 6 | 运营改菜单 → 24h | 看板显示生效比例；未确认列表可下钻到具体客户端 |
| 7 | 打包版未配信任锚 | 明确报错提示「需配置自定义 Ed25519 公钥」，而非静默失败 |
| 8 | 运营中心宕机 | 外部探针告警触发（**不依赖运营中心自身**） |
| 9 | 1000 台客户端同时断连 | 恢复后降级事件集中上报，看板「降级中」计数正确 |
| 10 | seed 文件超 90 天未更新 | CI 告警 |

---

## 10. 建议实施顺序

```
第一优先（部署前必须）
  ├─ 部署检查清单 #1 信任锚          ← 否则打包版策略全废
  ├─ 风险 R1 归属核实                 ← 决定会员通道方案
  └─ 部署检查清单 #5 外部探针

第二优先（P0 韧性）
  ├─ D-5 会员宽限期                  ← 修最痛的 fail-closed
  ├─ D-1/D-2 L2 全量快照 + 重放      ← 补 6 类数据缺口
  ├─ A-1~A-3 降级遥测                ← 让断连可见
  └─ V-1/V-2/V-3 版本号 + ACK        ← 让生效可见

第三优先（P1 完善）
  ├─ D-3/D-4 L3 seed + CI 校验
  ├─ A-4/A-6 健康看板 + 告警接入
  ├─ V-4/V-5 生效看板 UI + 审计补全
  └─ D-6/D-7 边缘修复
```

---

## 附录 A：本文档的证据索引

| 结论 | 证据位置 |
|---|---|
| bootstrap 返回 14 类数据 | `ops-center/backend/services/runtime_service.py:343-358` |
| payload 无版本号 | 同上（仅 `synced_at`） |
| 6 类数据仅内存不落盘 | `apps/desktop/electron/services/ops-center-sync.js:485-550` |
| L2 已有 7 类持久化 | `ops-center-sync.js:330-332` `_saveRuntimeState()` |
| 会员 fail-closed 清空快照 | `apps/desktop/electron/services/identity/entitlement-service.js:85-88` |
| 上报水印仅成功时推进 | `apps/desktop/electron/services/usage-reporter.js:191` |
| 审计日志仅覆盖 2 张表 | `ops-center/backend/services/config_service.py`、`snapshot_service.py` |
| 37 张数据表 | `ops-center/backend/models.py` |
| 39 个运营页面 | `ops-center/frontend/src/views/*.vue` |
| 降级保留范式来源 | `01-docs/BUGFIX-HOT-TOPICS-CACHE-CLEARED-ON-FETCH-FAILURE-2026-09-14.md` |
| 打包版信任锚强制 | `apps/desktop/electron/services/runtime-trust-anchor.js` |

---

> **本文档为设计产出，不含任何代码变更。** 实现需按 AGENTS.md 流程：M+ 中高风险任务 → `/opsx:propose` 建 OpenSpec change → 隔离 worktree 开发 → PR 评审合并。
