# 产品定价策略 & 用户分级功能设计 v0.1

> OpsCenter 配套文档 | 2026-07-01

---

## 1. 核心模型：两套 AI Key 体系

产品中存在两条完全独立的 AI Key 链路，必须严格区分：

```
┌─────────────────────────────────────────────────────────────────┐
│                         产品 AI 调用架构                          │
│                                                                  │
│   ┌─────────────────────┐          ┌─────────────────────┐      │
│   │   官方内置 Key 池      │          │   用户自有 Key        │      │
│   │  (OpsCenter 管理)     │          │  (会员前台设置)        │      │
│   ├─────────────────────┤          ├─────────────────────┤      │
│   │ 管理者: 平台运营方     │          │ 管理者: 终端用户        │      │
│   │ 费用承担: 平台         │          │ 费用承担: 用户自己       │      │
│   │ 配额控制: 按会员等级    │          │ 配额控制: 无限制         │      │
│   │ Key 轮换: 运营手动     │          │ Key 轮换: 用户自行       │      │
│   │ 故障切换: 支持多Provider│         │ 故障切换: 用户自己配     │      │
│   │ 成本核算: 运营后台      │          │ 成本核算: LLM 厂商账单   │      │
│   │ 安全: Fernet 加密存储   │          │ 安全: 用户端加密存储     │      │
│   └─────────────────────┘          └─────────────────────┘      │
│            │                                  │                  │
│            ▼                                  ▼                  │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              LLM Router (prompt-engine)              │      │
│   │   按用户 Tier + 配额状态 + Key 可用性 智能路由         │      │
│   └─────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

| 维度 | 官方内置 Key | 用户自有 Key |
|------|------------|------------|
| **Key 归属** | 平台（Colinchiu007 团队） | 用户个人 |
| **管理后台** | OpsCenter `/secrets` 页 | 会员前台「我的 API Key」 |
| **费用归属** | 平台运营成本 | 用户自己在 LLM 厂商的账单 |
| **使用限制** | 受会员等级配额限制 | 不受平台配额限制（由 LLM 厂商限制） |
| **优先级** | 默认使用（用户未配自有 Key 时） | 优先使用（用户配了就用用户的） |
| **成本风险** | 平台承担，需监控成本 | 无平台成本风险 |
| **过期为害** | 影响所有用户 | 仅影响单个用户 |
| **隐私** | 平台可视（加密存储） | 平台不可视（用户端管理） |

---

## 2. 会员等级设计

### 2.1 三级体系

| 等级 | 名称 | 定位 | 月费（参考） | 年费（参考） |
|------|------|------|------------|------------|
| **Tier 1** | 免费版 | 体验/轻度使用 | ¥0 | ¥0 |
| **Tier 2** | 标准版 | 个人创作者 | ¥29/月 | ¥199/年 |
| **Tier 3** | 专业版 | 内容团队/重度用户 | ¥79/月 | ¥599/年 |

### 2.2 能力分级矩阵

| 能力 | 免费版 (Tier 1) | 标准版 (Tier 2) | 专业版 (Tier 3) |
|------|:---:|:---:|:---:|
| **视频生成** | 3 次/天 | 30 次/月 | 200 次/月 |
| **图片生成** | 5 次/天 | 100 次/月 | 500 次/月 |
| **提示词优化** | 基础版 | 高级版（含风格分类） | 全功能（含故事板策略） |
| **官方 LLM** | ✅（低优先级，限速） | ✅（标准优先级） | ✅（最高优先级） |
| **自带 Key** | ❌ | ✅ | ✅ |
| **发布平台** | 1 个 | 3 个 | 全部（12 平台） |
| **批量操作** | ❌ | ❌ | ✅ |
| **数据导出** | ❌ | ✅ | ✅ |
| **API 接入** | ❌ | ❌ | ✅ |
| **水印** | 有 | 无 | 无 |
| **技术支持** | 社区 | 邮件 | 专属通道 |

### 2.3 配额体系设计

```
配额维度:
├── 周期配额（按月/天重置）
│   ├── video_generation_count      # 视频生成次数
│   ├── image_generation_count      # 图片生成次数
│   └── prompt_optimize_count       # 提示词优化次数
├── 并发限制
│   ├── max_concurrent_jobs         # 同时进行的任务数
│   └── queue_priority              # 队列优先级（免费版排队靠后）
└── 总量限制
    ├── total_storage_mb            # 存储空间
    └── max_video_duration_seconds  # 单视频最大时长
```

**配额数据结构（已在 orchestrator 实现）：**
```python
# orchestrator 现有模型
class UsageQuota:
    video_generation_count: int = 0
    image_generation_count: int = 0
    prompt_optimize_count: int = 0
    # 周期重置逻辑由 orchestrator 的 usage 服务处理
```

### 2.4 当前实现状态

| 模块 | 状态 |
|------|------|
| orchestrator `subscription` 表（tier 字段） | ✅ 已实现 |
| orchestrator `user_usage` 表（配额追踪） | ✅ 已实现 |
| `increment_usage()` 计数器 | ✅ 已实现 |
| `QuotaExceededError` 配额超限异常 | ✅ 已实现 |
| `@requires_feature(tier=N)` 功能开关门禁 | ✅ 已实现 |
| unified-frontend `useOrchestratorMembership` Hook | ✅ 已实现 |
| unified-frontend `MembershipUpgradeDialog` 升级弹窗 | ✅ 已实现 |
| unified-frontend 用户 API Key 配置页 | 部分（Settings/Providers 页） |
| OpsCenter 官方 Key 管理 | 🔨 V0.2 待开发 |
| 支付集成（微信/支付宝） | ❌ 待开发 |
| LLM Router（按 tier + Key 可用性路由） | ❌ 待开发 |

---

## 3. 双 Key 体系详细设计

### 3.1 官方内置 Key 管理（OpsCenter V0.2）

**目标用户**：平台运营者（你自己）

**管理内容**：
- 多家 LLM Provider 的 API Key
- 每个 Key 的可用模型列表
- Key 的优先级和权重（负载均衡/故障切换）
- Key 过期提醒
- 按 Provider 的成本估算

**数据模型**（扩展 OpsCenter）：
```sql
-- 官方 Key 表
CREATE TABLE official_keys (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,        -- openai / doubao / minimax / sensenova / deepseek
    api_key     TEXT NOT NULL,        -- Fernet 加密存储
    base_url    TEXT,
    models      TEXT,                 -- JSON array of model names
    priority    INTEGER DEFAULT 1,    -- 负载均衡权重
    is_active   INTEGER DEFAULT 1,
    tier_access INTEGER DEFAULT 1,    -- 最低可用 Tier（1=免费可用, 2=标准, 3=专业）
    cost_per_1k_tokens REAL,          -- 成本参考
    expires_at  TEXT,                 -- Key 过期日期
    created_at  TEXT,
    updated_at  TEXT
);
```

**Key 选择策略（LLM Router）**：
```python
def select_key(user_tier: int, provider: str, user_own_key: str | None = None):
    # 优先级 1: 用户自有 Key（如果配置了且有效）
    if user_own_key:
        return ("user", user_own_key)

    # 优先级 2: 官方 Key（按 tier 筛选，按 priority 排序）
    official = get_official_keys(
        provider=provider,
        tier_max=user_tier,  # 免费用户只能用 tier_access=1 的 Key
        is_active=True,
    )
    if official:
        return ("official", pick_by_priority(official))

    # 优先级 3: 降级 Provider
    fallback = get_fallback_key(user_tier)
    if fallback:
        return ("official_fallback", fallback)

    raise NoAvailableKeyError()
```

### 3.2 用户自有 Key 配置（会员前台）

**目标用户**：终端用户

**位置**：unified-frontend → 设置 → Providers 页（已有基础）

**功能点**：
- 用户输入自己的 OpenAI / 豆包 / Minimax API Key
- Key 本地掩码显示（`sk-***a1b2`）
- 「测试连接」按钮（验证 Key 可用）
- 使用自有 Key 时，消耗不计入平台配额
- 如果自有 Key 不可用，自动回退到官方 Key（按用户 Tier 限额）

**数据流**：
```
用户输入 Key → 前端 AES 加密 → 存储到 orchestrator user_settings 表
    → prompt-engine 调用时 → orchestrator 解密 Key → 注入 LLM 请求
    → 使用量计入用户 Key 统计（非平台配额）
```

---

## 4. LLM Provider 规划

### 4.1 需要管理的 Provider

| Provider | 用途 | 模型 | 成本（参考） |
|----------|------|------|-------------|
| **OpenAI** | 提示词优化、内容改写 | GPT-4o, GPT-4o-mini | $2.5-15/1M tokens |
| **豆包 (Doubao)** | 提示词优化、中文改写 | doubao-pro-32k | ¥0.8/1M tokens |
| **Minimax** | 中文改写、提示词生成 | abab6.5s | ¥1/1M tokens |
| **Deepseek** | 成本优化、批量处理 | deepseek-chat | ¥1/1M tokens |
| **Sensenova** | 备用、特定风格 | nova-ptc-xl | 待确认 |
| **通义千问** | 中文场景 | qwen-max | ¥20/1M tokens |
| **Kling** | 视频生成 | kling-v1 | 按次计费 |
| **即梦 (Jimeng)** | 图片生成 | jimeng-xl | 按次计费 |

### 4.2 Provider 优先级策略

```
默认路由（按成本从低到高）:
  文本生成: Deepseek → 豆包 → Minimax → OpenAI (GPT-4o-mini)
  图片生成: 即梦 → 通义万相 → DALL·E
  视频生成: Kling → 即梦 → Vidu

Tier 差异化:
  免费版: 仅低成本 Provider（Deepseek + 豆包）
  标准版: 中档 Provider（Minimax + 通义）
  专业版: 全部 Provider（含 OpenAI + Kling）
```

---

## 5. 成本估算模型

### 5.1 单次调用成本估算

| 操作 | 模型 | Token 消耗 | 成本 |
|------|------|-----------|------|
| 内容改写（500 字→改写） | deepseek-chat | ~3K tokens | <¥0.005 |
| 提示词优化（1 次） | doubao-pro | ~2K tokens | <¥0.002 |
| 分句（1000 字） | 纯算法，无 LLM | 0 | ¥0 |
| 图片生成（1 张） | 即梦 | 1 次调用 | ~¥0.1 |
| 视频合成 | 纯本地处理 | 0 | ¥0 |

**免费用户每日成本上限**：3 次视频 × (1 改写 + 1 优化 + 5 图 × ¥0.1) ≈ ¥1.6/天 → **¥48/月**（极端情况）

**实际免费用户日活成本预估**：<¥5/天 → **¥150/月**

### 5.2 盈亏平衡参考

假设 100 个日活用户（5% 付费转化率）：

| 来源 | 月收入 | 月成本 |
|------|--------|--------|
| 5 个标准版（¥29 × 5） | ¥145 | — |
| 1 个专业版（¥79 × 1） | ¥79 | — |
| 95 个免费用户 | ¥0 | ~¥4,750 |
| **合计** | **¥224** | **~¥4,750** |

⚠️ 免费用户是纯成本中心。需要：
- 严格控制免费配额（日限额 + 慢速队列）
- 引导免费用户配置自有 Key
- 尽早推动付费转化

---

## 6. 与 OpsCenter PRD 的联动

### OpsCenter V0.2（AI Key 管理）修正后的范围

**只管理平台运营方的官方内置 Key**：
- [ ] 官方 Key 的 CRUD（多 Provider）
- [ ] Key 掩码显示 + 加密存储
- [ ] Key → Tier 访问映射（此 Key 供哪个 Tier 使用）
- [ ] Key 过期提醒
- [ ] 「测试连接」按钮
- [ ] 按 Provider 的成本估算仪表盘
- [ ] Key 故障自动切换配置（哪个是主，哪个是备用）
- [ ] 批量导出为 prompt-engine / orchestrator 所需配置格式

**不包含（这是会员系统前端的范围）**：
- ❌ 用户自有 Key 的 CRUD（已在 unified-frontend Settings/Providers 页）
- ❌ 用户配额管理（已在 orchestrator user_usage 表）
- ❌ 支付集成

### OpsCenter V0.3（平台凭证管理）不受影响

发布平台 cookie/token 管理仍然属于运营后台范围——这些是平台的发布能力，不存在「用户自己的发布凭证」这个概念。

---

## 7. 实施优先级

| 优先级 | 模块 | 依赖 | 负责项目 |
|--------|------|------|---------|
| **P0** | 官方 Key 管理（OpsCenter V0.2） | OpsCenter V0.1 | ops-center |
| **P0** | LLM Router（按 Tier + Key 路由） | 官方 Key 管理 | prompt-engine |
| **P1** | 用户自有 Key 配置完善 | 会员系统已上线 | unified-frontend |
| **P1** | 成本监控仪表盘 | 官方 Key 管理 + 用量统计 | ops-center |
| **P2** | 支付集成（微信/支付宝） | 会员等级体系 | platform-orchestrator |
| **P2** | Key 故障自动切换 | LLM Router | prompt-engine + ops-center |
| **P3** | 用户用量预测 & 成本预警 | 成本监控数据累积 | ops-center |

---

## 8. 风险与假设

| 风险 | 缓解 |
|------|------|
| 免费用户成本失控 | 严格日限额 + 慢速队列 + 鼓励自带 Key |
| 官方 Key 过期未发现 | OpsCenter 过期提醒 + 健康检查 |
| 单个 Provider 宕机 | 多 Provider 故障切换（LLM Router） |
| 用户自有 Key 泄露 | 前端加密传输，后端不存明文 |
| 定价不被市场接受 | 先以邀请制灰度，收集反馈后调整 |
