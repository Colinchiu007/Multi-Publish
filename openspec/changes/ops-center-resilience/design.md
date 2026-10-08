# Design: ops-center-resilience — 跨端协议契约（客户端与服务端实现必须逐字对齐）

> 本文件是**契约单一真源**。桌面端（JS）与运营中心（Python）两侧实现都必须以本文为准，
> 任何一方擅自改字段名/语义即视为实现偏离，由 `ops-resilience-contract.test.js` 双端向量测试拦截。

## 0. 契约总览

```
运营中心 (权威)                                    桌面客户端
┌──────────────────────────────┐                 ┌─────────────────────────────┐
│ GET /runtime/bootstrap       │                 │                             │
│  + config_version (单调递增) │ ───────────────▶ │ 验签 → applyRuntime          │
│  + config_hash (内容指纹)    │                 │  → 落 L2 快照                │
│  + 13 个下发数据块           │                 │  → ACK（hash 变化才发）      │
└──────────────────────────────┘                 │                             │
┌──────────────────────────────┐                 │                             │
│ POST /runtime/ack            │ ◀───────────────│ { client_id, config_hash,     │
│  → runtime_client_ack        │                 │   applied_blocks, degraded }  │
├──────────────────────────────┤                 │                             │
│ POST /telemetry/degradation  │ ◀───────────────│ 断连恢复后补报一次             │
│  → client_degradation_events │                 │ { offline_seconds, tier }    │
└──────────────────────────────┘                 └─────────────────────────────┘
```

## 1. 配置版本号（V-1）

### 1.1 两个版本号，缺一不可

| 字段 | 类型 | 算法 | 语义 |
|---|---|---|---|
| `config_version` | int | 单调递增，仅当 `config_hash` 变化时 +1 | 人可读：「42 版」 |
| `config_hash` | str(16 hex) | 13 个数据块 canonical JSON 的 SHA-256 前 16 位 | 机器判定：内容是否真变 |

**为什么都要**：运营想看「42 版」直观；但「点保存但数据没变」会浪费 version 号导致看板虚高。
`config_hash` 识别这种情况——hash 不变则 version 也不变。

### 1.2 hash 计算的**确切**范围

```python
RUNTIME_BLOCKS = [
    "announcements", "update_policy", "content_policy", "feature_flags",
    "platform_defs", "content_templates", "keyword_watchlist",
    "rewrite_strategies", "rewrite_hard_constraints", "rewrite_ai_taste_map",
    "pipelineOptions", "appMenu", "contentCategories",
]

def compute_config_hash(payload: dict) -> str:
    subset = {k: payload.get(k) for k in RUNTIME_BLOCKS}   # 缺失键补 None，不跳过
    digest = hashlib.sha256(canonical_json(subset).encode("utf-8")).hexdigest()
    return digest[:16]
```

**三条不可违背的约束**：

1. **不得包含 `synced_at`** —— 它每次请求都变，纳入则 hash 永远变、ACK 永远发。
2. **不得包含 `config_version` / `config_hash` / `signature`** —— 自指。
3. **缺失键必须补 `None` 而非跳过** —— 否则「删掉一个数据块」与「该键本来不存在」无法区分。

`canonical_json` 复用 `runtime_service.canonical_json`（`sort_keys=True, ensure_ascii=False,
separators=(",",":"), allow_nan=False`），与桌面端 `canonicalJson` 逐字节对齐（该对齐已由
`ops-center-sync.test.js` 固定向量锚定，本 change 新增 hash 的双端向量测试）。

### 1.3 version 的自愈式分配

不引入「配置变更钩子」（那需要改 39 个运营页面的写路径，回归面过大）。改为**读时推导**：

```
get_runtime_bootstrap(db):
    payload = {13 blocks..., "synced_at": now}
    payload["config_hash"] = compute_config_hash(payload)
    payload["config_version"] = await resolve_config_version(db, payload["config_hash"])
    return payload

async def resolve_config_version(db, config_hash):
    latest = 最新一行 runtime_config_versions（按 version DESC 取 1）
    if latest and latest.config_hash == config_hash:
        return latest.version                    # 内容未变 → 版本不动
    # 内容变了 → 尝试占号；并发下唯一约束兜底
    try:
        INSERT (version = (latest.version if latest else 0) + 1, config_hash, changed_at=now)
        return 该 version
    except IntegrityError (uq_config_hash):
        return 重新读取该 hash 已有行的 version
```

**性质**：内容变了自动升版、内容没变不升版、服务重启不丢版（落库）、并发安全（唯一约束）。
**代价**：每次 bootstrap 多 1 次 SELECT（索引覆盖，成本可忽略）。

### 1.4 签名覆盖范围不变

`config_version` / `config_hash` 在 `sign_runtime_payload` **之前**写入 payload，
因此落在 Ed25519 签名覆盖范围内 —— 客户端可验证「这版号不是我伪造的」。
`synced_at` 同理（既有行为）。

## 2. ACK 回执（V-2 / V-3）

### 2.1 端点

`POST /api/v1/runtime/ack` — 鉴权与 bootstrap 同款（`_require_catalog_key`：Bearer JWT 或 X-Catalog-Key）。

### 2.2 请求体（字段名逐字对齐）

```json
{
  "client_id": "a3f9c2e1-...",         // 必填，1-64 字符
  "client_version": "2.1.0",            // 选填，≤32
  "config_version": 42,                 // 必填，int ≥ 0
  "config_hash": "a3f9c2e1b7d4c2f9",   // 必填，16 hex
  // 键名 = **payload 原键**（与 RUNTIME_BLOCKS 同一套），不是驼峰化后的名字。
  // 这样「哪几块生效了」与 config_hash 的块集合同源，看板上块名可直接与运营中心的配置项对齐。
  "applied_blocks": { "appMenu": 7, "feature_flags": 12, "announcements": 3 },
  "skipped_blocks": ["content_templates"],           // 选填，本轮未应用的块
  "degraded": false,                                 // 必填 bool
  "degradation_tier": null,                          // degraded=true 时必填："L1"|"L2"|"L3"|"default"
  "ack_type": "applied",                             // "applied" | "heartbeat" | "recovered"
  "degraded_since": null                             // degraded=true 时必填 ISO8601
}
```

### 2.3 校验（服务端 MUST 拒绝而非静默丢弃）

| 校验 | 违反时 |
|---|---|
| `client_id` 非空字符串 ≤64 | 400 |
| `config_version` 为 int ≥0 | 400 |
| `config_hash` 匹配 `^[0-9a-f]{16}$` | 400 |
| `ack_type` ∈ 三值白名单 | 400 |
| `degraded=true` 时 `degradation_tier` ∈ 四值白名单 | 400 |
| `applied_blocks` 为 object，值均为非负 int，键数 ≤32 | 400 |
| `skipped_blocks` 为 string 数组，元素 ≤64 字符，个数 ≤32 | 400 |

**理由**：这是唯一能证明「配置真的生效了」的数据源，脏数据进库会污染看板并让运营误判。

### 2.4 ACK 频率控制（避免推送地狱）

| 场景 | 是否 ACK |
|---|---|
| `config_hash` **未变** | **不 ACK** |
| `config_hash` 变化 | 立即 ACK 一次（`ack_type="applied"`）|
| hash 未变但距上次 ACK > 24h | ACK 一次（`ack_type="heartbeat"`）|
| 断连恢复 | 立即 ACK（`ack_type="recovered"` + `degraded=true` + 断连时长）|

**用 hash 而非 version 判断**：否则每次发版所有客户端都上报一次。

### 2.5 落库

`runtime_client_ack`：**按 client_id upsert 保留最新一条**（看板要的是"当前状态"不是流水）。

```
client_id (PK) | config_version | config_hash | client_version
applied_blocks_json | skipped_blocks_json | degraded | degradation_tier
ack_type | degraded_since | first_seen_at | last_ack_at
```

`first_seen_at` 只在首次插入时写入 → 支撑「活跃客户端总数」分母。

### 2.6 生效看板数据源（V-3 的服务端半边）

```python
async def rollout_summary(db, version: int | None = None):
    version = version or 最新 version
    total   = COUNT(runtime_client_ack)                              # 分母 = 见过面的客户端
    acked   = COUNT(WHERE config_version == version)                 # 已确认本版
    stale   = COUNT(WHERE config_version <  version)                 # 仍在旧版
    degraded= COUNT(WHERE degraded == 1)                             # 断连降级中
    # 分块确认率：解析 applied_blocks_json（payload 原键），不靠 SQL LIKE 猜
    per_block = {块名: 计数(client 确认本版且 applied_blocks 含该键)}
```

> **注意口径重叠**：`degraded` 与 `acked` **不是互斥**——一台「已确认最新版但当前断连」的机器
> 两边都会计入。因此看板里 degraded 单独展示，不从 acked 里扣除。

`GET /api/v1/runtime/rollout`（require_admin）返回上述聚合 + 最近未确认明细（limit ≤200）。

## 3. 断连降级遥测（A-1 / A-2 / A-3）

### 3.1 端点

`POST /api/v1/telemetry/degradation` — 鉴权同上。

### 3.2 请求体

```json
{
  "client_id": "a3f9c2e1-...",      // 必填 ≤64
  "client_version": "2.1.0",        // 选填 ≤32
  "channel": "runtime",             // 必填："runtime" | "entitlement"
  "endpoint": "/api/v1/runtime/bootstrap",  // 选填 ≤200
  "failure_kind": "timeout",        // 必填，白名单见下
  "consecutive_failures": 5,        // 必填 int ≥1
  "degraded_since": "2026-10-07T10:00:00Z",  // 必填 ISO8601
  "recovered_at": "2026-10-07T11:30:00Z",     // 选填（未恢复则省略）
  "offline_seconds": 5400,          // 必填 int ≥0（recovered_at - degraded_since）
  "serving_tier": "L2"              // 必填："L1"|"L2"|"L3"|"default"
}
```

`failure_kind` 白名单：`timeout` | `dns` | `network` | `http_4xx` | `http_5xx` | `verify_failed` | `invalid_payload` | `auth_failed`

### 3.3 落库

`client_degradation_events`（**流水表**，一条断连周期一行，保留 90 天）：

```
id (PK, autoincr) | client_id | client_version | channel | endpoint | failure_kind
consecutive_failures | degraded_since | recovered_at | offline_seconds
serving_tier | received_at
INDEX(client_id, degraded_since) | INDEX(received_at)
```

**为什么是流水表而 ACK 是快照表**：降级事件要回答「上周有多少用户受影响过」，
需要保留历史；ACK 要回答「现在多少用户是最新版」，只需最新态。

### 3.4 关键约束：遥测不能依赖被监控的同一通道

断连期间**不可能**上报（网络不通）。因此：

```
断连发生时 → 只写本地队列（settings 表，不落日志不外发）
恢复时     → 一次性补报本轮全部断连事件（best-effort，失败保留队列下轮再试）
```

**运营中心自身宕机**由**外部探针**发现（阿里云云监控 / UptimeRobot），
**绝不依赖运营中心自己报警** —— 这是本设计最容易踩的坑，已在 §5 单列。

### 3.5 客户端本地队列

复用 `settings` 表（`opsCenterDegradationQueue`），**不新建 SQLite 表**：

- 上限 `MAX_DEGRADATION_QUEUE = 200` 条，超出丢最旧（降级事件有天然时效性）
- 单条序列化上限 8KB（防异常 payload 撑爆 settings）
- 上报成功即出队；失败**保留**（对齐既有「水印仅成功时推进」范式）

## 4. 三层降级数据源（D-1 / D-2 / D-3 / D-4）

### 4.1 层级定义与读取顺序

| 层级 | 载体 | 生命周期 | 何时读 |
|---|---|---|---|
| **L1** | 内存 `this._runtime` + 6 个注入管理器的内存态 | 单次运行 | 总是 |
| **L2** | `settings['opsCenterRuntimeSnapshot']`（**完整原始 payload**）| 永久直到下次成功同步 | 启动时 / L1 缺失时 |
| **L3** | `resources/ops-seed/runtime-bootstrap.json`（随 asar 发布）| 随版本 | L1/L2 均不可用时 |

### 4.2 为什么 L2 存**原始 payload**而非归一化后的 `_runtime`

`applyRuntime` 里 6 个注入管理器（`platform_defs` / `content_templates` / `keyword_watchlist` /
`rewrite_strategies` / `rewrite_hard_constraints` / `rewrite_ai_taste_map`）的**入参就是原始 payload 块**。
存原文 → 启动时把同一个 payload 再喂一次 `applyRuntime`，6 个 setter 全部重放，无需为每个 setter
单独设计持久化格式。这直接消灭「重启丢 6 类数据」的缺口。

### 4.3 落盘时机与语义（沿用既有反退化原则）

| 情形 | 行为 |
|---|---|
| 成功拉到并验签通过 | 写 L2 快照 + 推进 `syncedAt` |
| **连接失败**（超时/DNS/5xx/网络） | **不写 L2**、**不推进 `syncedAt`**、warn 留痕、继续重试 |
| **验签失败 / 结构非法** | **不写 L2**、**不推进 `syncedAt`**、拒绝应用、warn 留痕（契约破坏 fail-closed）|
| **显式空配置**（运营主动清空某项） | 正常应用为空并落盘（空是可信的真实状态）|

> 「连接失败 fail-open / 契约破坏 fail-closed」这条区分是本设计的核心，
> 既有 `_fetchRuntime` 已正确实现（验签失败抛错），本 change **只补 L2/L3，不改这个语义**。

### 4.4 L3 seed 文件契约

路径：`apps/desktop/resources/ops-seed/runtime-bootstrap.json`

```json
{
  "_meta": {
    "config_version": 42,
    "config_hash": "a3f9c2e1b7d4c2f9",
    "exported_at": "2026-10-08T10:00:00Z",
    "source": "https://ops.iart.work/api/v1/runtime/bootstrap"
  },
  "announcements": [...], "update_policy": {...}, ...
}
```

**CI 校验（`.github/scripts/check-ops-seed.js`）MUST 检查**：

| # | 检查 | 违反 |
|---|---|---|
| 1 | 13 个数据块键齐全 | 失败 |
| 2 | 每块类型与运行时一致（数组/对象） | 失败 |
| 3 | 文件 ≤ 1MB（对齐 `MAX_CATALOG_BYTES`）| 失败 |
| 4 | UTF-8 无 BOM、无 U+FFFD | 失败 |
| 5 | `_meta.config_hash` 与实算一致 | 失败 |
| 6 | **`content_policy.word_list` 必须已剔除**（只留 `enabled` 开关）| 失败 |
| 7 | `_meta.exported_at` 距今 > 90 天 | **警告**（不阻塞）|

**第 6 条是安全硬约束**：词库进包 = 可被逆向提取。把过期的封禁词库打进客户端等于公开词库。

### 4.5 L3 的边界（必须写死）

- ✅ **承载**：菜单、平台元数据、内容分类、默认开关、公告、流水线可见性、模板、关键词、改写配置
- ❌ **不承载**：会员权益、密钥、限流配额、封号名单、计费规则

理由：后者是**管控语义**。把过期封号名单内置进客户端 = 客户端变成可篡改的黑名单绕过源。

## 5. 告警分层：绝不自监控

| 场景 | 探测方式 | 依赖运营中心存活？ |
|---|---|---|
| 个别客户端断连 | 客户端本地队列 → 恢复后补报 | 否（恢复后才报，但能统计）|
| **大面积断连** | 外部探针打 `/health`（UptimeRobot / 阿里云云监控）| **否** |
| ECS 宕机/磁盘满/证书过期 | 阿里云云监控 + 外部探针 | 否 |
| 配置改了但没人确认 | 看板「未确认明细」下钻（需 V-4 UI）| 是（但这是运营侧自查，非告警）|

> **红线**：任何「运营中心挂了 → 告警」的设计都不成立。外部探针是**唯一**正确解法，
> 属基础设施配置（A-5），不在本 change 代码范围，但必须在部署清单里勾掉。

## 6. 会员权益宽限期（D-5）

### 6.1 决策矩阵

| 本地快照 | token 有效期 | 行为 | `source` |
|---|---|---|---|
| 无 | — | **fail-closed**：降级 free | `null` |
| 有 | 未过期 | 用快照授权 | `grace` |
| 有 | 已过期 ≤72h | 宽限授权，**禁新增付费消耗**（写操作）| `grace` |
| 有 | 已过期 >72h | 降级 free（fail-closed）| `null` |

**首次安装仍 fail-closed**：无快照时无法区分「正版付费用户」与「未付费用户」，
fail-open 会让所有人白嫖。**有**快照时快照本身就是上次成功认证的证据，信任它合理。

### 6.2 为什么不简单地把「失败就不清空」

`_clearForGeneration` 存在的理由是对的：响应结构非法 / 账号被停用（`status !== 'active'`）
时必须清权。仅把「连接失败」这一条从清空改为宽限，**其余三条失败路径保持 fail-closed**。

判据必须是**「没拿到有效响应」而非「请求失败」**：
- `fetch` 抛异常（网络层）→ 宽限期
- `!response.ok` → **不宽限**（服务端明确拒绝了，可能就是封号/停用）
- `response.json()` 抛异常 → **不宽限**（拿到了但结构不对，属契约破坏）

### 6.3 72h 的依据

覆盖「周五晚断连 → 周一才发现」的最长常见周期。宽限期**只禁写不禁读**：
读功能（看历史、看已生成内容）完全不受影响，避免用户完全不可用。