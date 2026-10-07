# PRD：博主监控与采集（Creator Monitor & Collect）

| 项 | 值 |
|---|---|
| 文档编号 | PRD-CREATOR-MONITOR-COLLECT-2026-10-07 |
| 版本 | v1.0 |
| 日期 | 2026-10-07 |
| 状态 | 待 CCG 外部评审 |
| 特性分支 | `blogger-collection` |
| 关联主文档 | `01-docs/PRD.md` §8.5 博主监控与采集 |
| 目标能力契约 | 新增 `openspec/specs/creator-monitor/spec.md` |

---

## 1. 背景与根因

### 1.1 需求

用户需要对抖音、小红书、知乎、视频号、公众号、X、YouTube 的博主账号做**长期关注**：定期监控，发现新作品后展示，并支持**一键批量采集**（有默认数量与硬上限）；同时也支持**手动采集指定博主的作品**（可设数量）。单条采集需从用户端体验上被明确解决。

### 1.2 现状根因（代码实证，非推测）

本仓**不存在任何「博主/账号」维度概念**，这不是"给已有采集加监控"，而是从零引入一个领域模型：

| 缺口 | 实证 |
|---|---|
| 无博主实体 | 全仓 `author` 仅是一个字符串字段（`store-schema.js:168` `viral_library.author`） |
| 无关注关系表 | 无 `creator*` / `follow*` 表 |
| 无"按账号列作品"能力 | 无任何频道/主页列表采集；`Collection.test.js:686` 明确断言 `space.bilibili.com` 不走该链路 |
| 无周期内容监控 | 既有轮询仅两类且都与内容监控无关：`comment-manager.js:200` 评论轮询、`hot-topics-service.js:44` 仅在 UI 点刷新时拉取 |
| 无持久"已采集"状态 | `已采集` 是运行时用 `collectedUrlSet` 现算的（`Collection.vue:1190`），刷新即丢 |
| 采集落库极弱 | `collected_items` 是 settings 表的**单个 JSON key**（`Collection.vue:2245`）；`viral_library` **无唯一约束**，`source_url` 无索引（`store-schema.js:168-187` 仅 created_at / platform 两个索引） |

### 1.3 平台能力现实（决定 MVP 范围）

`packages/collection-engine/src/platform-adapters/` 的 5 个 adapter **全部是死代码，一行未接入生产链路**：

| Adapter | 状态 |
|---|---|
| `bilibili-adapter.js` | ✅ 唯一真发请求（WBI 签名 + `api.bilibili.com`），但 B 站不在需求清单 |
| `zhihu-adapter.js` | ⚠️ 无浏览器注入时返回空壳 |
| `douyin-adapter.js` | ⚠️ 同上 |
| `xiaohongshu-adapter.js` | ⚠️ 同上 |
| `wechatmp-adapter.js` | ❌ **完全没有 `_doFetch`**，永远抛 `not implemented` |
| 视频号 | ❌ Python 侧显式拒绝：`video_service.py:167` `VIDEOCLONE_CHANNELS_UNSUPPORTED` |
| X | ❌ NOT FOUND（`service.py:331` 列 phase2） |

**结论：7 个平台的"按博主维度列作品"能力实测为 0。**

### 1.4 YouTube 的关键有利条件（已取证，非推测）

外部依赖包 `content-aggregator` 的 `YouTubeCollector`（实现在 `content_aggregator_shared/shared/collectors/youtube_collector.py`，366 行）**已完整实现频道枚举**：

- `youtube_collector.py:156` 调 `https://www.googleapis.com/youtube/v3/channels` 解析频道 ID
- `:195` 调 `https://www.googleapis.com/youtube/v3/playlistItems` 拉上传列表（上传列表 ID 为 `UU...`）
- `:144-180` 支持 `UC...` ID、`@handle`、`/c/name`、`/user/name` 四种输入形式

返回字段（`:252-267`）**恰好覆盖本特性所需**：

```python
{
  "title": str,
  "content": str,        # 字幕优先，无字幕回落描述
  "url": "https://www.youtube.com/watch?v={video_id}",
  "author": channelTitle,
  "published_at": str,
  "summary": str,
  "metadata": {
      "video_id": str,          # ← 天然去重键
      "channel_id": str,        # ← 天然博主 external_id
      "thumbnails": {...},      # ← UI 封面
      "transcript_source": "subtitle" | "description",   # ← 内容质量指示
  }
}
```

`content-aggregator` 已在 `packages/python-backend/pyproject.toml:21` 声明为可选依赖。

**因此 YouTube 不需要从零写频道解析**——这是 MVP 选它的核心理由，也是它区别于其余 6 个平台的决定性优势：只有它能在**不依赖反爬对抗**的前提下证明"关注 → 监控 → 发现 → 采集"这条链路本身成立。

### 1.5 不可回避的风险声明

**抖音、小红书、视频号三个平台，本方案不承诺长期稳定可用。** 其反爬是持续对抗（签名算法、频控、登录态风控持续变化），属长期军备而非一次性投入。本方案能做的是把架构设计成**这类平台失效时不拖垮整体**：能力分层标记 + 熔断降级 + 失败自动暂停 + UI 诚实标注。此风险不可被"规划掉"。

---

## 2. 目标与非目标

### 2.1 目标

| 编号 | 目标 |
|---|---|
| G1 | 建立博主实体、关注关系、发现记录三层数据模型，去重落在 DB 唯一约束层 |
| G2 | 支持长期关注博主，按可配频率定期检查新作品 |
| G3 | 新作品在 UI 上以角标 + 列表高亮呈现，支持**一键批量采集**（默认数量 + 硬上限） |
| G4 | 支持**手动采集**指定博主作品（可设数量），超限必须显式提示 |
| G5 | 单条采集零填参一键入库，已采集项持久标记且不再重复 |
| G6 | 采集内容可**一键送入 AI 写作**（复用既有 pipeline DAG） |
| G7 | 平台能力分层，UI 显式标注官方接口 / 尽力而为 / 暂不支持 |
| G8 | 监控失败可自愈降级：连续失败 3 次自动暂停并提示，提供立即重试 |

### 2.2 非目标（明确排除）

| 编号 | 非目标 | 排除理由 |
|---|---|---|
| N1 | 一键搬运发布原作者作品 | 引入洗稿判定与多平台重复内容限流一整套子问题，会撑爆方案 |
| N2 | 本期实现抖音/小红书/视频号/公众号/X 的采集 | 4/5 平台无官方接口，见 §1.5 风险声明 |
| N3 | 团队共享博主库 / 多用户 | 当前为本地单用户产品，多账号在数据模型预留但 UI 不暴露 |
| N4 | 已有采集内容（`collected_items` / `viral_library`）的历史数据迁移 | 现有数据无 `(platform, external_id)`，无法可靠回填；新表从零开始 |

---

## 3. 术语

| 术语 | 定义 |
|---|---|
| 博主 / Creator | 被长期关注的账号实体，平台侧唯一标识为 `external_id` |
| 关注 / Follow | 用户与博主的关系，含监控配置与运行状态 |
| 发现记录 / Discovery | 监控探测到但**尚未采集**的作品 |
| 采集 / Collect | 将作品正文（字幕或描述）落进采集库的动作 |
| 探测 / Probe | 只取列表元数据、不取正文的轻量检查 |
| 能力等级 / Capability Tier | `official` / `best_effort` / `unsupported` |

---

## 4. 平台能力矩阵

| 平台 | 采集能力等级 | 依据 | 本期状态 |
|---|---|---|---|
| **YouTube** | `official` | Data API v3，依赖包已实现 | ✅ **本期交付** |
| 知乎 | `best_effort` | cookie 鉴权 + 已有 stealth 采集；收藏夹官方 API 已可用 | 后续 |
| X (Twitter) | `best_effort` | API v2 付费档，或登录 cookie | 后续 |
| 抖音 | `best_effort` | 无开放接口，需 cookie + Playwright，**有封号风险** | 后续 |
| 小红书 | `best_effort` | 同上，反爬极强 | 后续 |
| 公众号 | `best_effort` | 素材接口仅限自有号；第三方号需客户端自动化 | 后续 |
| 视频号 | `unsupported` | 无任何 API；Python 侧显式拒绝 | ❌ 不承诺 |

---

## 5. 总体架构与数据流

```
┌──────────────── 渲染层 (Collection.vue 新增第三个 tab) ────────────────┐
│  「博主监控」tab                                                        │
│    ├─ 博主列表（关注状态 / 能力徽章 / 失败标记 / 暂停开关）             │
│    └─ 发现列表（新作品 / 封面 / 发布时间 / 字幕质量 / 单条采集按钮）     │
└───────────────┬────────────────────────────────────────────────────────┘
                │ IPC: creator:list / creator:follow / creator:unfollow
                │       creator:discoveries / creator:collect / creator:collectOne
                │       creator:sendToWriter / creator:checkNow / creator:toggle
┌───────────────▼────────────────────────────────────────────────────────┐
│ 主进程 ipc-handlers/creator.js                                         │
└───────────────┬────────────────────────────────────────────────────────┘
                │
      ┌─────────┴──────────┬──────────────────┬─────────────────────┐
      ▼                    ▼                  ▼                     ▼
 creator-store.js    creator-monitor.js   creator-collector.js   automation-
 (3 张新表 CRUD)     (探测 + 增量对比       (YouTube adapter       scheduler.js
                     + 失败降级状态机)      包装 + 数量上限)       (新增 action
                                                                        type)
                                                                              │
                            ┌─────────────────────────────────────────────────┘
                            ▼
                Python: content_aggregator.YouTubeCollector
                        (channels + playlistItems + transcript)
                            │
                            ├─ 探测：fetch_transcript=False（只取元数据）
                            └─ 采集：fetch_transcript=True（取正文）
                                    │
                                    ▼
                         viral_library（既有采集库，source='creator'）
                                    │
                                    ▼
                    full-auto-pipeline: startRun({urls:[1条], sourceType:'url'})
                            → rewrite → create → publish
```

### 5.1 关键设计取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 监控调度宿主 | 复用 `automation-scheduler.js`，新增 `action.type='creatorMonitor'` | 复用触发器匹配、持久化（`automation_tasks`）、间隔钳制（5~1440 分钟）；**但 `action.type` 当前被硬编码**，见 §6.4 改造点 |
| 探测与采集是否共用配额 | **否**，双轨配额 | 现有 `default-strategies.json` 抖音/小红书 `dailyBudget:20`，若探测共用，一次轮询即耗尽，功能不可用 |
| 发现记录与采集内容是否同表 | **否**，分表 + `collect_state` 状态位 | 发现是"待办"，采集是"资产"，生命周期不同；同表会让列表查询反复 JOIN |
| 去重落在哪 | **DB 唯一约束** `(platform, external_id)` | 现有 `collectedUrlSet` 是内存态，刷新即丢；去重必须在持久层 |
| 正文提取 | 复用 `services/readable-text.js` | `collection-engine` 已知 bug：用 `body.replace(/<[^>]+>/g,'')` 会**丢换行**（`BUGFIX-COLLECT-NEWLINE-PRESERVE-2026-09-16.md:206`） |

---

## 6. 数据模型

DDL 按 `store-schema.js` 既有模式：追加进 `SCHEMA_SQL` 数组（全部 `IF NOT EXISTS`），索引为独立 `CREATE INDEX IF NOT EXISTS` 字符串。该文件**无 schema version 机制**，采用幂等重放（`base-store.js:85` `_createTables()` + 串行迁移），新增表无需改版本。

```sql
-- ── 博主实体 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_accounts (
  id               TEXT PRIMARY KEY,
  platform         TEXT NOT NULL,
  external_id      TEXT NOT NULL,             -- youtube: channel_id (UC...)
  display_name     TEXT DEFAULT '',
  handle           TEXT DEFAULT '',           -- @handle
  avatar_url       TEXT DEFAULT '',
  platform_url     TEXT DEFAULT '',
  capability_tier  TEXT NOT NULL DEFAULT 'official',
  credential_alias TEXT DEFAULT '',           -- 预留多账号，MVP UI 不暴露
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_uniq
  ON creator_accounts(platform, external_id);

-- ── 关注关系 + 监控配置 + 运行状态 ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_follows (
  id                   TEXT PRIMARY KEY,
  creator_id           TEXT NOT NULL,
  platform             TEXT NOT NULL,
  enabled              INTEGER NOT NULL DEFAULT 1,
  check_interval_min   INTEGER NOT NULL DEFAULT 60,   -- 1~1440
  per_creator_limit    INTEGER,            -- NULL = 用全局；取值 <= 100
  status               TEXT NOT NULL DEFAULT 'active',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_checked_at      TEXT,
  last_success_at      TEXT,
  last_error_code      TEXT,
  last_error_message   TEXT,
  paused_reason        TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_follows_uniq
  ON creator_follows(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_follows_scan
  ON creator_follows(status, enabled);

-- ── 发现的视频（未采集） ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_discoveries (
  id                TEXT PRIMARY KEY,
  creator_id        TEXT NOT NULL,
  platform          TEXT NOT NULL,
  external_id       TEXT NOT NULL,           -- youtube: video_id
  title             TEXT DEFAULT '',
  url               TEXT NOT NULL,
  thumbnail_url     TEXT DEFAULT '',
  published_at      TEXT,
  discovered_at     TEXT NOT NULL,
  collect_state     TEXT NOT NULL DEFAULT 'pending',  -- pending|collected|skipped
  collected_at      TEXT,
  transcript_source TEXT DEFAULT '',         -- subtitle | description
  summary           TEXT DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_discoveries_uniq
  ON creator_discoveries(platform, external_id);
CREATE INDEX IF NOT EXISTS idx_creator_discoveries_list
  ON creator_discoveries(creator_id, collect_state, discovered_at);
```

### 6.1 去重键

`(platform, external_id)` 唯一索引即去重机制。探测到重复项时走 `INSERT OR IGNORE`（或先查后插 + 捕获约束冲突），**幂等**。

YouTube 的 `video_id` 是稳定标识；**不使用 URL 作主键**——URL 形态可能变化，ID 不会。

### 6.2 关注状态机

```
                  ┌──────────────┐
        创建 ───► │   active     │ ◄─── 用户点击「恢复监控」
                  └──────┬───────┘
                         │ 连续失败 = 3
                         ▼
                  ┌──────────────┐
                  │ auto_paused  │ ──► 用户「立即重试」→ 重置计数 → active
                  └──────────────┘
                         ▲
        用户暂停 ──────────┘ (paused_by_user)
```

| 状态 | 含义 | 调度器行为 |
|---|---|---|
| `active` | 正常监控 | 按 `check_interval_min` 调度 |
| `paused_by_user` | 用户手动暂停 | 不调度 |
| `auto_paused` | 连续失败 3 次自动暂停 | 不调度，待用户「立即重试」 |

`consecutive_failures` 成功一次即清零。

### 6.3 发现记录状态机

```
pending ──► collected   （采集成功，collected_at 落时间）
   │
   └────► skipped       （用户主动忽略，或超出上限且用户选择跳过）
```

### 6.4 监控调度改造点（必须改动，非新增）

`automation-scheduler` 的 `action.type` 当前**被硬编码**，新增任务类型需改 3 处：

| 文件:行 | 现状 | 改造 |
|---|---|---|
| `services/automation-task.js:111` | 校验写死 `type: 'fullAutoPipeline'` | 增加 `creatorMonitor` 为合法值 |
| `services/automation-task.js:164` | 构造写死 `type: 'fullAutoPipeline'` | 允许透传 |
| `services/automation-scheduler.js:277-297` | `_executeWithPolicy` 无 switch，恒调 `this._pipeline.startRun()` | 增加 `switch(task.action.type)` 分发 |
| `core/container.setup.js:206-210` | 执行器装配点 | 注册 creator 探测执行器 |

### 6.5 应用生命周期（必须写入设计，不可含糊）

| 场景 | 行为 | 实证 |
|---|---|---|
| 应用运行中 | 按间隔调度 | — |
| 窗口最小化 | **继续调度** | 任务在主进程，不依赖渲染层（`automation-scheduler.js:3`） |
| 关窗到托盘 | **不保证** | `window-close-policy.js:29-39` 仅当「有运行中流水线/发布」且托盘可用才隐藏到托盘；自动化定时任务本身不在该判据内 |
| 完全退出 | **停止，不补跑** | `automation-task.js:12-15`、`automation-scheduler.js:20-23` 明确不做补触发 |

**产品必须诚实告知用户**：「博主监控需要应用保持运行；关闭应用期间不会检查新作品，重新打开后仅检查增量，不会补齐关闭期间的全部内容。」

---

## 7. 数据校验

### 7.1 IPC 入参校验表

| 通道 | 字段 | 类型 | 校验 | 失败提示键 |
|---|---|---|---|---|
| `creator:follow` | `input` | string | 必填非空；trim 后长度 ≤ 512 | `creatorErrInvalidInput` |
| `creator:follow` | `checkIntervalMin` | int | 可选，默认 60；范围 5~1440 | `creatorErrIntervalRange` |
| `creator:follow` | `perCreatorLimit` | int/null | 可选，默认 null；非 null 时 1~100 | `creatorErrLimitRange` |
| `creator:collect` | `creatorId` | string | 必填；必须存在于 `creator_accounts` | `creatorErrCreatorMissing` |
| `creator:collect` | `count` | int | 必填；1 ≤ count ≤ 实际生效上限 | `creatorErrCountExceedsLimit` |
| `creator:collectOne` | `discoveryId` | string | 必填；必须存在于 `creator_discoveries` 且 `collect_state='pending'` | `creatorErrAlreadyCollected` |
| `creator:toggle` | `followId` | string | 必填；必须存在于 `creator_follows` | `creatorErrFollowMissing` |
| `creator:checkNow` | `followId` | string | 必填；同上 | `creatorErrFollowMissing` |

### 7.2 数量与上限规则（双轨）

| 常量 | 值 | 适用 |
|---|---|---|
| `CREATOR_COLLECT_ONECLICK_DEFAULT` | **5** | 「一键采集新作品」按钮默认数量 |
| `CREATOR_COLLECT_MANUAL_DEFAULT` | **50** | 「手动批量采集」弹窗默认数量 |
| `CREATOR_COLLECT_HARD_LIMIT` | **100** | 全局硬上限，任何路径不可超 |
| `per_creator_limit` | ≤ 100 | 单博主可设更低的个人上限，不可超过全局 |

**生效上限计算**：`effective = per_creator_limit ?? CREATOR_COLLECT_HARD_LIMIT`，再 `min(effective, CREATOR_COLLECT_HARD_LIMIT)`。

**超限语义（硬要求）**：一律 **fail-closed 拒绝**，不做静默截断。

```
发现 12 条新作品，用户点「一键采集」，count 默认 5
→ 实际采集 5 条
→ 提示：已采集最新 5 条，剩余 7 条留待下次
```

| 场景 | 行为 | 提示 |
|---|---|---|
| count > 生效上限 | 拒绝，不执行 | `creatorErrCountExceedsLimit`：本次最多采集 {max} 条，请调整数量 |
| count ≤ 上限但发现数 > count | 执行 count 条，**必须提示剩余** | `creatorTruncated`：共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次 |
| 单条采集 | **不受上限约束** | — |
| 单条重复采集 | 拒绝（`collect_state != 'pending'`） | `creatorErrAlreadyCollected`：该作品已于 {time} 采集 |

### 7.3 预算校验（双轨配额）

| 轨道 | 计量对象 | YouTube 配额/天 | 超限行为 |
|---|---|---|---|
| **探测配额** | `playlistItems` 请求次数 | 200 | 跳过本轮，`status` 不变，记 `CREATOR_PROBE_QUOTA_EXHAUSTED`，UI 角标提示 |
| **采集配额** | 实际取正文的采集动作 | 沿用 `default-strategies.json` 平台策略（YouTube 新增条目，默认 100） | 拒绝执行，`creatorErrQuotaExhausted` |

探测时 `fetch_transcript=False`，避免字幕拉取消耗配额与时间。

### 7.4 凭证校验

| 平台 | 所需凭证 | 缺失时 |
|---|---|---|
| YouTube | Data API v3 `api_key` | `creatorErrCredentialMissing`：未配置 YouTube API Key，无法检查新作品。请在设置 → 服务配置中填写。 |

凭证经 Electron `safeStorage` 加密后落 settings，**不进 Git、不进日志**。日志中只记 `api_key_present: true/false`。

### 7.5 内容安全校验

| 校验项 | 规则 |
|---|---|
| 标题 | 长度 ≤ 200，超长截断并记 `truncated: true` |
| 正文 | 非空；空则该条判失败（沿用 `normalizeViralItem` 的 fail-closed 约定，`knowledge-library-store.js:19`） |
| URL | 必须 http/https；其余协议拒绝 |
| `thumbnail_url` | 仅取 `content-aggregator` 返回的 thumbnails；不发起额外请求 |

---

## 8. 功能逻辑

### 8.1 添加博主

```
用户粘贴输入
  │
  ├─ 归一化：trim → 提取 UC…/@handle//c//user → 得到 rawId
  │    └─ 无法识别 → creatorErrInvalidInput（fail-closed，不猜测）
  │
  ├─ 查重：(platform='youtube', external_id=rawId) 是否已存在
  │    └─ 存在 → 复用 creator_accounts 行，focus 到该博主
  │
  ├─ 解析频道：YouTubeCollector(channels API)
  │    ├─ 成功 → 写 creator_accounts（含 display_name / handle / avatar）
  │    └─ 404   → creatorErrChannelNotFound
  │
  ├─ 建关注：写 creator_follows（status='active', check_interval_min, per_creator_limit）
  │
  └─ 立即首次探测（fetch_transcript=False）
       └─ 有新作品 → 写 creator_discoveries，角标 +1
```

### 8.2 监控探测与增量对比

```
调度器触发（check_interval_min 到期）
  │
  ├─ 筛选：status='active' AND enabled=1
  │
  ├─ 扣探测配额；不足 → 跳过本轮（不置失败）
  │
  ├─ YouTubeCollector(channel_id=…, fetch_transcript=False)
  │    取 playlistItems，limit = 待采集数 + 已采集数（滚动窗口）
  │
  ├─ 逐条 INSERT OR IGNORE creator_discoveries
  │    └─ 唯一约束冲突 = 已见过 → 跳过（幂等）
  │
  ├─ 成功：consecutive_failures=0, last_success_at=now
  │    失败：consecutive_failures += 1
  │           ≥3 → status='auto_paused' + paused_reason
  │
  └─ 推送 UI：角标数字更新
```

**滚动窗口**：探测拉取 `playlistItems` 时 pageSize 取 `min(50, 已采集数 + 10)`，避免每次全量拉取浪费配额。

### 8.3 一键批量采集

```
用户点「一键采集新作品」
  │
  ├─ count = CREATOR_COLLECT_ONECLICK_DEFAULT（5）
  ├─ effective = 生效上限（见 §7.2）
  ├─ count > effective → creatorErrCountExceedsLimit，拒绝
  │
  ├─ 待采集 = SELECT ... WHERE collect_state='pending' ORDER BY published_at DESC LIMIT count
  │
  ├─ BatchRateController 串行节流（base 8000ms + jitter 4000ms，退避 ×2，最多 3 次后熔断）
  │
  ├─ 每条：YouTubeCollector 拉正文（fetch_transcript=True）
  │    ├─ 成功 → INSERT viral_library (source='creator') + discovery.collect_state='collected'
  │    └─ 失败 → 该条 failed，discovery 保持 pending（可重试）
  │
  └─ 结果提示：
     ├─ 全部成功 → creatorBatchSuccess：已采集 {collected} 条内容
     ├─ 部分成功 → creatorBatchPartial：成功 {collected} 条，失败 {failed} 条
     └─ 有剩余   → creatorTruncated：共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次
```

**失败隔离**：单条失败不影响其他条目；失败的发现项保持 `pending`，用户可再次一键采集。

### 8.4 单条采集

```
发现列表每行的「采集」按钮（零填参）
  │
  ├─ discovery.collect_state != 'pending' → 按钮置灰显示「已采集 · {time}」
  │
  └─ pending → 单条采集（不受数量上限约束）
       ├─ 成功 → collect_state='collected' + collected_at
       │        按钮即时切换为「已采集 · {time}」（持久态，刷新不丢）
       ├─ 失败 → creatorCollectFailed：采集失败：{message}
       └─ 成功后提供次级动作：「送入 AI 写作」
```

「送入 AI 写作」走既有 DAG：`full-auto-pipeline.startRun({ urls:[单条URL], sourceType:'url' })`，`collect → rewrite → create` 三段执行，**不执行 publish**（发布由用户显式触发，符合非目标 N1）。

### 8.5 手动批量采集

```
用户点「手动采集」
  │
  ├─ 数量输入框，默认 50，上限 100（即生效上限）
  │    └─ 输入 > 上限 → 输入框即时标红 + creatorErrCountExceedsLimit
  │
  ├─ 若该博主历史发现项不足 count 条：
  │    └─ 提示 creatorDiscoverShortfall：该博主仅发现 {found} 条待采集作品，将全部采集
  │
  └─ 执行（同 §8.3 流程）
```

### 8.6 失败降级与恢复

| 错误码 | 含义 | 是否计入连续失败 | 处理 |
|---|---|---|---|
| `CREATOR_NET_TIMEOUT` | 网络超时 | ✅ | 重试，连续 3 次 → `auto_paused` |
| `CREATOR_RATE_LIMITED` | 触发 YouTube 配额/频控 | ❌ **不计入** | 跳过本轮，等待下个周期 |
| `CREATOR_CREDENTIAL_MISSING` | 未配 API Key | ✅ | 立即 `auto_paused`，UI 明确指向设置页 |
| `CREATOR_CHANNEL_NOT_FOUND` | 频道不存在/已注销 | ✅ | 立即 `auto_paused`，提示「该频道可能已注销或链接有误」 |
| `CREATOR_COLLECT_FAILED` | 单条采集失败 | ❌ | 该条保持 `pending`，不影响监控 |

`CREATOR_RATE_LIMITED` 不计入连续失败是刻意设计：**配额耗尽不是故障，是正常节流**，不应把用户锁进暂停态。

---

## 9. 交互逻辑与显示项

### 9.1 入口

`Collection.vue` 新增第三个 tab，接入成本：**改 `TAB_KEYS`（`:2283`）一行 + 一个 `v-else-if` 区块**，**不动路由**（新 tab 属采集页子视图，非一级菜单）。

### 9.2 博主列表显示项

| 列 | 内容 | 空值显示 |
|---|---|---|
| 头像 | `avatar_url` | 首字母占位块 |
| 名称 | `display_name` | `external_id` |
| Handle | `@handle` | 隐藏该行 |
| 平台徽章 | 「YouTube」+ 能力徽章（见 §9.4） | — |
| 新作品数 | `pending` 计数 | 不显示该列 |
| 监控状态 | 正常 / 已暂停 / **连续失败 N 次** / 凭证缺失 | — |
| 最近检查 | `last_success_at` 相对时间 | 从未成功 → 「尚未检查」 |
| 操作 | 立即检查 / 暂停·恢复 / 取消关注 / 设置 | — |

### 9.3 发现列表显示项

| 列 | 内容 | 说明 |
|---|---|---|
| 封面 | `thumbnail_url` | 16:9，`thumbnails` 取 medium/hq |
| 标题 | `title` | 单行省略 |
| 发布时间 | `published_at` 相对时间 | — |
| 发现时间 | `discovered_at` | — |
| 内容质量 | 「有字幕」/「仅描述」徽章 | 由 `transcript_source` 驱动 |
| 状态 | 未采集 / 已采集·{time} | — |
| 操作 | **采集** / **送入 AI 写作** / 忽略 | 已采集时置灰 |

排序：默认 `published_at DESC`。

### 9.4 能力徽章

| 等级 | 文案 | 视觉 |
|---|---|---|
| `official` | 官方接口 | 绿色徽章 |
| `best_effort` | 尽力而为（可能不稳定） | 琥珀色徽章 |
| `unsupported` | 暂不支持 | 灰色徽章 + 禁用添加 |

### 9.5 空态与首次体验

- 未添加任何博主：`creatorEmptyTitle` / `creatorEmptyDesc`，附一行输入框直接引导
- 已添加但无新作品：`creatorNoNewWorks`：暂无新作品。系统会每 {interval} 自动检查一次。
- 探测定时器未运行（如应用刚启动未到周期）：`creatorNextCheck`：下次自动检查：{time}

---

## 10. 提示文字（中英对照）

新增 locale key 统一 `creator*` 前缀，挂 `collection` 命名空间（`zh.js:2614-2871`），**en.js 必须成对提交**（CI Gate 7 `check-locale-sync.js` 拦截）。

| key | zh.js | en.js |
|---|---|---|
| `creatorTab` | 博主监控 | Creator Monitor |
| `creatorAddPlaceholder` | 粘贴 YouTube 频道链接、@handle 或频道 ID | Paste a YouTube channel URL, @handle, or channel ID |
| `creatorAddSubmit` | 关注 | Follow |
| `creatorCapOfficial` | 官方接口 | Official API |
| `creatorCapBestEffort` | 尽力而为（可能不稳定） | Best effort (may be unstable) |
| `creatorCapUnsupported` | 暂不支持 | Not supported |
| `creatorPendingBadge` | {count} 条新作品 | {count} new |
| `creatorCollectNew` | 一键采集新作品 | Collect new posts |
| `creatorCollectOne` | 采集 | Collect |
| `creatorCollectedAt` | 已采集 · {time} | Collected · {time} |
| `creatorSendToWriter` | 送入 AI 写作 | Send to AI Writer |
| `creatorTranscriptSubtitle` | 有字幕 | Transcript |
| `creatorTranscriptDescription` | 仅描述 | Description only |
| `creatorPause` | 暂停监控 | Pause |
| `creatorResume` | 恢复监控 | Resume |
| `creatorRetryNow` | 立即重试 | Retry now |
| `creatorEmptyTitle` | 还没有关注的博主 | No creators followed yet |
| `creatorEmptyDesc` | 添加 YouTube 博主后，系统会定期检查新作品并在这里提示。 | Follow a YouTube creator and new posts will appear here. |
| `creatorNoNewWorks` | 暂无新作品。系统会每 {interval} 自动检查一次。 | No new posts. Checking every {interval}. |
| `creatorNextCheck` | 下次自动检查：{time} | Next automatic check: {time} |
| `creatorBatchSuccess` | 已采集 {collected} 条内容 | Collected {collected} posts |
| `creatorBatchPartial` | 成功 {collected} 条，失败 {failed} 条 | {collected} succeeded, {failed} failed |
| `creatorTruncated` | 共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次 | Found {found}; collected the latest {collected}, {remain} left for next time |
| `creatorDiscoverShortfall` | 该博主仅发现 {found} 条待采集作品，将全部采集 | Only {found} posts available for this creator; all will be collected |
| `creatorAutoPaused` | 连续失败 {times} 次，已自动暂停。{reason} | Paused after {times} consecutive failures. {reason} |
| `creatorErrInvalidInput` | 无法识别该频道。请粘贴 YouTube 频道链接、@handle 或以 UC 开头的频道 ID。 | Cannot identify this channel. Paste a channel URL, @handle, or a UC-prefixed channel ID. |
| `creatorErrChannelNotFound` | 找不到该频道，可能已注销或链接有误。 | Channel not found. It may be deactivated or the link is incorrect. |
| `creatorErrCredentialMissing` | 未配置 YouTube API Key，无法检查新作品。请在设置中填写。 | YouTube API Key is not configured. Add it in Settings to check for new posts. |
| `creatorErrQuotaExhausted` | YouTube 今日探测额度已用完（{used}/{limit}）。将在额度重置后继续。 | Today's YouTube probe quota is exhausted ({used}/{limit}). Monitoring resumes after reset. |
| `creatorErrCountExceedsLimit` | 本次最多采集 {max} 条，请调整数量。 | You can collect at most {max} posts per run. |
| `creatorErrAlreadyCollected` | 该作品已于 {time} 采集。 | Already collected on {time}. |
| `creatorErrCollectFailed` | 采集失败：{message} | Collection failed: {message} |
| `creatorErrAppClosedNotice` | 博主监控需要应用保持运行。关闭应用期间不会检查新作品，重新打开后仅检查增量。 | Creator monitoring requires the app to stay running. New posts are not checked while closed. |

占位符风格沿用既有约定（`{count}` / `{message}`，参见 `zh.js:2784`）。

---

## 11. IPC 通道契约

| 通道 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `creator:list` | — | `{ creators[], totalPending }` | 博主列表 + 总角标数 |
| `creator:follow` | `{ input, checkIntervalMin?, perCreatorLimit? }` | `{ creator }` | 添加/复用关注 |
| `creator:unfollow` | `{ followId }` | `{ ok }` | 取消关注（二次确认） |
| `creator:toggle` | `{ followId, enabled }` | `{ follow }` | 暂停/恢复 |
| `creator:checkNow` | `{ followId }` | `{ found, created }` | 立即探测 |
| `creator:discoveries` | `{ creatorId?, state?, limit?, offset? }` | `{ items[], total }` | 发现列表，分页 |
| `creator:collect` | `{ creatorId, count }` | `{ collected, failed, remain }` | 批量采集 |
| `creator:collectOne` | `{ discoveryId }` | `{ item }` | 单条采集 |
| `creator:skipOne` | `{ discoveryId }` | `{ ok }` | 忽略 |
| `creator:sendToWriter` | `{ discoveryId }` | `{ runId }` | 送入 AI 写作 |

所有通道在 `ipc-handlers/license-access-control.js` 登记为 **public**（与既有采集通道一致，未登录可用）。

---

## 12. 日志字段

统一 `logger` 前缀 `[CreatorMonitor]`，**禁止**打印 API Key、字幕全文、凭证密文。

| 字段 | 说明 |
|---|---|
| `platform` / `external_id` | 博主标识 |
| `checkIntervalMin` | 本次间隔 |
| `probeQuotaUsed` / `probeQuotaLimit` | 配额水位 |
| `found` / `inserted` / `duplicate` | 探测结果三元组 |
| `collectRequested` / `collectApplied` | 请求数量 vs 实际执行（暴露截断） |
| `consecutiveFailures` / `status` | 降级状态 |
| `apiKeyPresent` | 仅布尔，**不打印值** |

---

## 13. 验收标准

| 编号 | 验收项 |
|---|---|
| A1 | 可添加 YouTube 博主，4 种输入形式（频道 URL / @handle / `/c/name` / `/user/name` / `UC...`）均正确解析 |
| A2 | 同一 `(platform, external_id)` 重复添加时复用既有记录，不产生重复行 |
| A3 | 探测幂等：同一 video 连续探测 N 次，`creator_discoveries` 行数不变 |
| A4 | 一键采集默认数量为 5；手动批量默认 50；两者上限均为 100 |
| A5 | `count > 生效上限` 被拒绝并提示，**不发生任何采集副作用** |
| A6 | 发现数 > count 时提示剩余条数，剩余项保持 `pending` |
| A7 | 单条采集零填参成功；重复点击返回 `creatorErrAlreadyCollected` 且**按钮状态持久**（刷新页面后仍显示「已采集 · 时间」） |
| A8 | 单条采集不受数量上限约束 |
| A9 | 探测与采集配额独立：探测耗尽不影响采集额度，反之亦然 |
| A10 | 连续失败 3 次 → `status='auto_paused'` + UI 明确原因 + 「立即重试」可用 |
| A11 | `CREATOR_RATE_LIMITED` **不**累计连续失败计数 |
| A12 | 能力徽章正确显示 `official`；平台选择器中 `best_effort` / `unsupported` 正确置灰 |
| A13 | 「送入 AI 写作」进入 `collect→rewrite→create` 三段且**不触发 publish** |
| A14 | 应用完全退出后重启，仅检查增量，**不补跑**关闭期间内容；UI 有 `creatorErrAppClosedNotice` 说明 |

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **抖音/小红书/视频号反爬** | 长期不可用 | 本期不实现；架构留 `capability_tier`；接入时熔断 + 自动暂停 + UI 标注「尽力而为」 |
| YouTube API 配额耗尽 | 监控中断 | 双轨配额（探测 200 / 采集 100）；`CREATOR_RATE_LIMITED` 不惩罚连续失败；UI 显示配额水位 |
| API Key 缺失/失效 | 全盘不可用 | 立即 `auto_paused` + 明确指向设置页 |
| `automation-scheduler` 改造引入回归 | 影响既有 4 类自动化任务 | 改动限定在 3 处 + switch 分发；`creatorMonitor` 与 `fullAutoPipeline` 分支互不干扰；补单测 |
| 发现表无限增长 | 存储膨胀 | MVP 不自动清理，但 `collect_state='collected'` 可按 `collected_at` 归档；后续版本加保留策略 |
| 字幕拉取慢导致超时 | 批量采集卡住 | `BatchRateController` 已有退避 ×2、最多 3 次后熔断 |
| 并发采集同一博主 | 重复写入 | 唯一约束 + 单条状态机；批量入口对同一 follow 加互斥锁 |

---

## 15. 预计规模与待改文件清单（CCG 决策层门禁输入）

**预计新增 4,530 行 / 改动 9 个文件 / 本次共涉及 19 个文件。**

### 15.1 新增文件（8 个，约 3,180 行）

| 路径 | 预计行数 | 职责 |
|---|---|---|
| `apps/desktop/electron/services/creator-store.js` | 420 | 3 张表 CRUD、归一化 fail-closed |
| `apps/desktop/electron/services/creator-monitor.js` | 350 | 探测调度、增量对比、失败降级状态机 |
| `apps/desktop/electron/services/creator-collector.js` | 260 | YouTube adapter 包装、双轨配额、数量上限执行 |
| `apps/desktop/electron/ipc-handlers/creator.js` | 180 | IPC 通道与入参校验 |
| `apps/desktop/src/features/collection/CreatorMonitor.vue` | 460 | 新 tab 渲染层 |
| `apps/desktop/electron/tests/creator-store.test.js` | 380 | store 单测 |
| `apps/desktop/electron/tests/creator-monitor.test.js` | 420 | 探测/降级单测 |
| `apps/desktop/electron/tests/creator-collector.test.js` | 350 | 数量上限/配额单测 |

### 15.2 改动文件（11 个，约 1,350 行）

| 路径 | 预计改动 | 内容 |
|---|---|---|
| `apps/desktop/electron/services/store-schema.js` | +75 | 追加 3 表 + 5 索引 |
| `apps/desktop/electron/preload/publish.js` | +25 | 暴露 creator IPC |
| `apps/desktop/electron/services/automation-task.js` | +20 | 允许 `creatorMonitor` |
| `apps/desktop/electron/services/automation-scheduler.js` | +40 | `switch(task.action.type)` 分发 |
| `apps/desktop/electron/core/container.setup.js` | +15 | 注册探测执行器 |
| `apps/desktop/electron/services/url-collector.js` | +3 | `_platformFromHostname` 加 youtube |
| `packages/collection-engine/src/default-strategies.json` | +12 | YouTube 采集策略与配额 |
| `apps/desktop/src/views/Collection.vue` | +40 | `TAB_KEYS` + `v-else-if` |
| `apps/desktop/src/locales/zh.js` | +34 | `creator*` 中文文案 |
| `apps/desktop/src/locales/en.js` | +34 | `creator*` 英文文案（成对） |
| `openspec/specs/creator-monitor/spec.md` | +650 | 能力契约 Requirement/Scenario |

### 15.3 文档文件

| 路径 | 内容 |
|---|---|
| `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md` | 本文档 |
| `01-docs/PRD.md` | §8 新增 8.5 小节 + 头部「功能文档」索引登记 |
| `openspec/records/blogger-collection.md` | 执行记录（门禁证据） |
| `.quality-gates.md` | 质量节拍记录 |

---

## 16. 待核实项

| 项 | 状态 |
|---|---|
| `content-aggregator` 的 `YouTubeCollector` 是否已在打包产物中可用 | ⚠️ 需在实现阶段实测打包后 require 链（QM-1 打包门禁） |
| `default-strategies.json` 中 YouTube 策略键的完整字段结构 | ⚠️ 需在实现时读取确认 |
| `content-aggregator` 是否需要额外 pip 依赖才能用字幕 | ⚠️ `youtube-transcript-api` 为软依赖，缺失时回落描述（已有降级路径） |