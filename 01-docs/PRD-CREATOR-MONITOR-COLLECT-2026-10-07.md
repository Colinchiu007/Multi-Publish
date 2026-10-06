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
  collect_state     TEXT NOT NULL DEFAULT 'pending',  -- pending|collecting|collected|failed|skipped
  collected_at      TEXT,
  attempt_count     INTEGER NOT NULL DEFAULT 0,       -- 采集尝试次数（CCG i7）
  last_error        TEXT DEFAULT '',                  -- 最近一次采集失败原因（CCG i7）
  transcript_source TEXT DEFAULT '',         -- subtitle | description
  content_quality  TEXT DEFAULT 'unknown',  -- full | partial | stub | unknown（见 §7.6）
  summary           TEXT DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_discoveries_uniq
  ON creator_discoveries(platform, external_id);
CREATE INDEX IF NOT EXISTS idx_creator_discoveries_list
  ON creator_discoveries(creator_id, collect_state, discovered_at);
```

### 6.1 采集库反向映射（CCG 评审 i1/v2-i2 修订）

**问题**：`viral_library` 现有字段为 `id/title/cover_url/author/url/content/tags/likes/collections/comments/like_collect_ratio/published_at/platform/source/created_at/updated_at`（`store-schema.js:168-185`），**没有 `external_id` 也没有 `creator_id`**。若不补，采集后的内容无法反查来源博主，也无法在采集库层识别"重复采集同一条"。

**迁移机制**：本仓 `store-schema.js` **无 schema version 字段**（全文件无 `schema_version` / `PRAGMA user_version`），其版本化手段是**一组按顺序串行执行的幂等迁移函数**（`base-store.js:86-89` 依次调 `migrateOwnerIsolationSchema` → `migrateModelProvidersSchema` → …）。因此新增迁移须遵循同一模式，不得自造版本号机制：

```js
function migrateCreatorLinkageSchema (db) {
  // 两表都对 (platform, external_id) 有唯一约束，迁移必须原子完成：
  // 中途失败若留下半迁移状态，会造成「discoveries 已建索引但 viral_library 未加列」
  // 的分叉——重采集时因缺列抛错，而 CREATE TABLE IF NOT EXISTS 又不会补列，形成死锁。
  db.run('BEGIN')
  try {
    // SQLite 无 ADD COLUMN IF NOT EXISTS：先查列是否存在，存在则跳过（幂等）
    const cols = db.exec('PRAGMA table_info(viral_library)')[0].map(c => c.name)
    for (const [name, ddl] of [
      ['external_id', "ALTER TABLE viral_library ADD COLUMN external_id TEXT DEFAULT ''"],
      ['creator_id',  "ALTER TABLE viral_library ADD COLUMN creator_id  TEXT DEFAULT ''"],
    ]) {
      if (!cols.includes(name)) db.run(ddl)
    }
    // ⚠ partial 唯一索引不可用普通 UNIQUE：存量行 external_id 全为 ''，
    // 普通唯一索引会在创建瞬间因重复键失败。WHERE 子句把存量行排除在外。
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_viral_library_external
              ON viral_library(platform, external_id) WHERE external_id <> ''`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_viral_library_creator
              ON viral_library(creator_id) WHERE creator_id <> ''`)
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err   // 整次迁移原子失败：启动时报错优于带病运行
  }
}
```

**迁移前冲突预检**（CCG 评审 i1：两表各有唯一约束，若历史数据已存在重复的 `(platform, external_id)`，建索引会失败）：

```sql
-- 正常应返回 0 行；非 0 说明历史数据已被外部写入污染
SELECT platform, external_id, COUNT(*) AS n FROM viral_library
 WHERE external_id <> '' GROUP BY platform, external_id HAVING n > 1;
```

冲突非空时**不静默去重**（擅自删行即数据损失）。记录冲突明细并在 UI 提示 `creatorMigrationConflict`：「检测到 {count} 条历史数据冲突，请联系支持」，由人工决定保留哪条。

**为什么必须是 partial index**：`viral_library` 的历史行（以及非博主来源的行）`external_id` 均为默认空串。若建普通 `UNIQUE(platform, external_id)`，迁移执行时会因大量重复键抛错，整个 schema 初始化失败——**这会让应用起不来**。partial index 用 `WHERE external_id <> ''` 把它们排除，保证存量数据零影响。

**跨表约束边界**：两表**不建外键**（`viral_library` 含大量无 `creator_id` 的历史/其他来源行，外键会让迁移失败）。一致性由 store 层保证，映射关系如下：

| 方向 | 关联键 | 用途 |
|---|---|---|
| `viral_library` → `creator_discoveries` | `(platform, external_id)` | 反查该采集内容的来源博主 |
| `viral_library` → `creator_accounts` | `creator_id` | 按博主聚合已采集内容 |
| `creator_discoveries.collect_state` | — | 采集状态的真源在发现表；`viral_library` 是**投影**，允许存在孤儿行 |

**重采集语义**：`viral_library` 已有行时走 `INSERT OR REPLACE`（沿用 `knowledge-library-store.js:82` 既有写法），`created_at` 保留首次采集时间，`updated_at` 刷新。因存在 partial unique 索引，重采集命中的是**有 `external_id` 的博主来源行**；其他行不受影响。

### 6.2 去重键与 canonical ID 规则（CCG 评审 i6 修订）

`(platform, external_id)` 唯一索引即去重机制。探测到重复项时走 `INSERT OR IGNORE`（或先查后插 + 捕获约束冲突），**幂等**。

**为什么不用 URL 作主键**：URL 形态可变（`@handle` ↔ `/c/name` ↔ `UC…` 互为别名），ID 不会。

**canonical ID 规则（必须显式定义，否则同一博主会被拆成多行）**：

| 层 | 规则 |
|---|---|
| 博主 `external_id` | **一律为 YouTube API 返回的 `channelId`（`UC…`）**。用户输入的 `@handle` / 频道 URL / `/c/name` / `/user/name` 都必须先经 `channels.list` 解析为 `channelId` 后才落库。**禁止把用户原始输入直接当 `external_id`**——否则同一博主的 4 种 URL 写法会产生 4 个 `creator_accounts` 行 |
| 作品 `external_id` | **一律为 `videoId`**。不取自 URL 查询串、不取自定义 ID |
| 归一化 | 落库前统一 `trim()` + 大小写保持原样（YouTube ID 大小写敏感，禁止 toLowerCase） |
| 频道更名/ID 变更 | YouTube `channelId` 不可变，更名只影响 `display_name`，不影响去重 |

**解析失败的 fail-closed**：`channels.list` 解析不出 `channelId` 时**拒绝写入**并提示 `creatorErrChannelNotFound`，**绝不退化成用用户输入当 ID 兜底**——那正是同一博主被拆成多行的根源。

### 6.3 关注状态机（CCG 评审 v2-i3 修订：区分「真故障暂停」与「不可自愈暂停」）

```
                    ┌──────────────┐
          创建 ───► │   active     │ ◄──── 用户「恢复监控」/「立即重试」（重置计数）
                    └──┬────────┬──┘
        Tier B 连续失败 3│        │Tier C 不可自愈（keyInvalid/accessNotConfigured）
                       ▼        ▼
              ┌────────────┐  ┌──────────────────┐
              │auto_paused │  │fatal_paused      │ ──► 修复设置后「恢复」→ active
              │(可自愈失败)│  │(需人工改 API Key)│
              └────────────┘  └──────────────────┘
                       ▲
        用户暂停 ─────────┘ (paused_by_user)

  Tier A（配额节流 / 网络瞬时 5xx）：**不离开 active**，不计入连续失败，
  仅按指数退避重试；配额节流时本轮直接跳过，UI 不报警。
```

| 状态 | 含义 | 调度器行为 | 进入条件 |
|---|---|---|---|
| `active` | 正常监控 | 按 `check_interval_min` 调度 | 创建 / 恢复 / 成功一次 |
| `paused_by_user` | 用户手动暂停 | 不调度 | 用户点暂停 |
| `auto_paused` | 可自愈故障累计 3 次 | 不调度，待「立即重试」 | Tier B 连续 3 次 |
| `fatal_paused` | 不可自愈（凭证问题） | 不调度，UI 直达设置页 | Tier C **首次即暂停** |

`consecutive_failures` 成功一次即清零；Tier A **不累加**该计数（见 §8.6）。

**为什么拆出 `fatal_paused`**：API Key 失效时，重试一万次也不会自愈，让用户看「连续失败 3 次」会误导他去点「立即重试」——那是死路。`fatal_paused` 明确指向「去设置里修 Key」这个唯一有效动作。

### 6.4 发现记录状态机（CCG 评审 i7 修订：补齐失败中间态）

**原设计缺陷**：只有 `pending / collected / skipped` 三态。一旦某条视频采集失败（字幕拉取超时、转写为空、API 抖动），它在库里**既不是 pending 也不是 collected**——用户手动重试时无状态可依，UI 也无法展示"上次为什么失败"，等于没有恢复路径。

```
pending ──► collecting ──┬──► collected   （成功；collected_at 落时间）
   ▲                    │
   │                    └──► failed ──┐   attempt_count += 1
   │                                  │   last_error 落原因
   └──── 用户点「重试」 ───────────────┘   （或批量重试把 failed 批量拉回 pending）
   
pending ──► skipped       （用户主动忽略）
```

| 状态 | 含义 | UI |
|---|---|---|
| `pending` | 未采集 | 「采集」按钮可用 |
| `collecting` | **采集进行中**（进程崩溃/强杀会留在此态） | 显示进度；启动时扫描并复位为 `pending`（带 `attempt_count` 保留） |
| `collected` | 已入库 | 「已采集 · {time}」，按钮置灰 |
| `failed` | 采集失败 | 「重试」按钮 + `last_error` 原因文案；计入 `attempt_count` |
| `skipped` | 用户忽略 | 不再提示 |

**崩溃恢复**：`collecting` 是易失态。应用启动时把滞留的 `collecting` 复位为 `pending`（`attempt_count` 保留并递增），避免"永远转圈"的僵尸记录。

**重复采集走 upsert**：`failed → pending` 重试、`pending/collected` 再次采集，均走 `INSERT OR REPLACE`（见 §6.1 重采集语义），不产生重复行。

### 6.5 监控调度改造点（必须改动，非新增）

`automation-scheduler` 的 `action.type` 当前**被硬编码**，新增任务类型需改 3 处：

| 文件:行 | 现状 | 改造 |
|---|---|---|
| `services/automation-task.js:111` | 校验写死 `type: 'fullAutoPipeline'` | 增加 `creatorMonitor` 为合法值 |
| `services/automation-task.js:164` | 构造写死 `type: 'fullAutoPipeline'` | 允许透传 |
| `services/automation-scheduler.js:277-297` | `_executeWithPolicy` 无 switch，恒调 `this._pipeline.startRun()` | 增加 `switch(task.action.type)` 分发 |
| `core/container.setup.js:206-210` | 执行器装配点 | 注册 creator 探测执行器 |

#### 6.5.1 为何复用而非新建独立调度器（CCG 评审 i3）

| 维度 | 复用 `automation-scheduler` | 新建独立调度器 |
|---|---|---|
| 触发器匹配 | 直接复用（`onAppStart/daily/weekly/interval`） | 需重写，含补触发等边界 |
| 间隔钳制 | 直接复用（5~1440 分钟硬钳制） | 需重写并自证等价 |
| 持久化 | 直接复用（`automation_tasks` 单键） | 新增表 + 新迁移 |
| 任务数上限 | 直接复用（20 个） | 需自定另一套上限 |
| 改动面 | 3 处 + switch，**但影响既有 4 类任务** | 零回归风险，但重复 ~300 行 |

**结论：复用。** 独立调度器虽有零回归优势，但要重复实现一套已验证的触发器与钳制逻辑，长期维护成本更高，且两套调度器并存本身就是新的冲突源。**代价（影响既有 4 类自动化任务）用回归测试对冲，不靠"应该没事"。**

#### 6.5.2 switch 的 default 分支：任务级 fail-closed，不拖垮调度器（CCG 评审 i4 修订）

**原设计错误**：曾直接 `throw`。评审指出这会让**一条脏数据任务炸掉整个 scheduler**——`_executeWithPolicy` 在调度循环里被调用，抛出未捕获异常会导致后续所有任务不再被触发，用户配置的自动化全部静默停摆，且因门禁失败而中断原本可能成功的执行。**这是"为一条坏数据牺牲整个系统"的典型错误设计。**

```js
switch (task.action.type) {
  case 'fullAutoPipeline': return this._executeWithPolicy(task)
  case 'creatorMonitor':    return this._executeCreatorMonitor(task)
  default:
    // 任务级 fail-closed：把这一条挂起并留痕，绝不 fallback 到 pipeline，
    // 也绝不 throw —— throw 会中断调度循环，导致其余任务全部停摆。
    this._markTaskPaused(task.id, 'unknown_type', `未知自动化任务类型: ${task.action.type}`)
    logger.warn({ taskId: task.id, actionType: task.action.type }, '未知任务类型已挂起，未执行')
    return { ok: false, skipped: true, reason: 'unknown_type' }
}
```

**三层防护的取舍**：

| 方案 | 后果 | 取舍 |
|---|---|---|
| `throw` | 一条脏任务 → 调度循环中断 → **所有自动化停摆** | ❌ 爆炸半径过大 |
| fallback 到 pipeline | 静默跑错任务，日志无线索，用户以为"在跑"实则跑错链路 | ❌ 静默失真 |
| **挂起该任务 + 留痕 + 继续** | 该任务不执行并显示明确错误；**其余任务不受影响** | ✅ **采用** |

fail-closed 的正确边界是**对这条任务**，不是对整个系统。挂起后 `automation:list` 该任务显示 `lastStatus='unknown_paused'` + `lastError`，用户可编辑任务类型后恢复。

**迁移期额外保护**：`automation_tasks` 是单个 JSON 键，schema 或类型迁移若误改了 `action.type` 的合法值集合，历史数据可能含未知类型。因此 `automation-task.js` 的校验**不得**在加载阶段就丢弃未知类型任务（会静默删数据），只能在校验时报错并保留原记录。

#### 6.5.3 回归测试覆盖范围（CCG 评审 i3）

改造必须由以下测试覆盖，否则视为未完成：

| 编号 | 回归项 |
|---|---|
| R1 | 既有 `fullAutoPipeline` 任务仍能正常创建、触发、执行（4 类触发器各一条） |
| R2 | 未知 `action.type` 抛错且**不执行**任何 pipeline |
| R3 | `creatorMonitor` 任务不进入 `pipeline.startRun()` |
| R4 | 既有任务的持久化数据（`automation_tasks` 单键）格式不变，可回滚 |
| R5 | 间隔钳制（<5 或 >1440 分钟）对两类任务一致生效 |

### 6.6 应用生命周期（必须写入设计，不可含糊）

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
| `CREATOR_MAX_FOLLOWING` | **50** | 最大关注博主数，与探测池（§7.3）联立求解，见 §7.3.3 |
| `CREATOR_AUTO_PAUSE_THRESHOLD` | **3** | 仅 Tier B 真故障累计到此值才暂停；Tier A 不累加 |

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

### 7.3 预算模型（CCG 评审 i2/i4/v2-i1 修订：从物理池反推，不拍数字）

**原始设计是错的**：曾写「探测预算 200 次/天」，但默认 1 小时 × 50 频道 = **1,200 次探测/天**，预算与频率、频道数三者互相矛盾，监控根本跑不满。下表从 YouTube **物理配额**反推逻辑预算，使三者自洽。

#### 7.3.1 物理池与单位成本

YouTube Data API 物理上限 **10,000 units/day**（项目级，不可协商）。相关调用成本：

| 调用 | units | 单次上限 | 本方案用途 |
|---|---|---|---|
| `playlistItems.list` | 1 | 50 条/页 | 每次探测取该博主的最新作品列表 |
| `channels.list` | 1 | — | **仅首次**解析频道 URL → `channelId`（结果落库，之后不再调） |
| `videos.list` | 1 | **50 个 id/次** | 采集时批量补全时长、观看数等元数据 |
| 字幕（`youtube-transcript-api`） | **0** | — | 非 Data API，不消耗配额 |

**稳态单次探测成本 = 1 unit**（首次新增博主那次 = 2 units）。

#### 7.3.2 采集成本公式与实算

采集时 `videoId` 在**探测阶段就已随 `playlistItems` 拿到**，元数据缺口用 `videos.list` 批量补。因其单次可带 50 个 id，采集成本远低于"每条 1 unit"的直觉：

```
采集成本(units) = ceil(count / 50) × 1     // videos.list，每批至多 50 个 id
```

| 场景 | count | units | 说明 |
|---|---|---|---|
| 一键采集（默认） | 5 | **1** | 1 批 |
| 手动批量（默认） | 50 | **1** | 正好 1 批 |
| 手动批量（上限） | 100 | **2** | 2 批（跨页仅此一处翻页） |

字幕提取消耗 0 units，但**耗时高**（每条视频数秒），故仍走 `BatchRateController` 串行节流。

#### 7.3.3 物理池切分

| 池 | units/天 | 说明 |
|---|---|---|
| 探测池 | **1,500** | `50 频道 × 24 次/天 = 1,200`，留 25% 余量 |
| 采集池 | **6,000** | 每次采集 1 unit（`videos.list`），支持 6,000 条/天，远超实际需求 |
| 安全余量 | **2,500** | 抗重试、抗接口变动、不被任何逻辑消耗 |

#### 7.3.4 求解：预算 × 频率 × 频道数必须自洽

三者**不允许各自拍脑袋**，由下式约束并在 UI 上做实时校验：

```
日探测需求(units) = Σ_每个博主 (1440 / check_interval_min) × 1 unit
约束：日探测需求 ≤ 探测池(1500)  且  博主总数 ≤ MAX_FOLLOWING(50)
```

推论（默认 1 小时间隔下）：

| 关注数 | 日探测需求 | 是否可行 |
|---|---|---|
| 10 | 240 units | ✅ 余量充足 |
| 50 | 1,200 units | ✅ 贴边但不超 |
| 62 | 1,488 units | ⚠️ 已到上限，**UI 拒绝新增第 63 个** |
| 63 | 1,512 units | ❌ 拒绝，并提示「调大检查频率或移除博主」 |

**动态降级求解**（当用户把间隔调得更密导致超预算时）：不静默失败，而是**按 `check_interval_min` 从小到大（检查更频繁的优先）保底，剩余博主本轮跳过**，并在 UI 角标显示「因配额限制，N 个博主本轮未检查」。绝不出现"监控看起来在跑但实际饿死一部分博主"的静默失真。

#### 7.3.5 超限行为与告警

| 情形 | 行为 |
|---|---|
| 探测池耗尽 | 跳过本轮，`status` 不变（**不计入连续失败**），记 `CREATOR_PROBE_QUOTA_EXHAUSTED` |
| 采集池耗尽 | 拒绝执行，`creatorErrQuotaExhausted` |
| 物理池用量 ≥ 80%（8,000 units） | 记 WARN 日志 + UI 配额水位条变琥珀色 |

#### 7.3.6 配额语义澄清（CCG 评审 i4）

「探测配额」的单位是 **API units**，不是"次数"也不是"频道数"。三者换算关系固定为：稳态 1 次探测 = 1 unit = 1 次 `playlistItems.list`。

#### 7.3.7 单条采集的配额边界（CCG 评审 i8）

**单条采集仅豁免「数量上限」，不豁免任何配额**：仍消耗采集池 1 unit（`videos.list`），采集池耗尽时同样拒绝并提示。字幕提取不消耗 Data API 配额。

### 7.4 凭证校验与存储（CCG 评审 i5 修订）

| 平台 | 所需凭证 | 缺失/失效时 |
|---|---|---|
| YouTube | Data API v3 `api_key` | `creatorErrCredentialMissing`：未配置 YouTube API Key，无法检查新作品。请在设置 → 服务配置中填写。 |

**存储要求（安全硬约束）**：

| 要求 | 规则 |
|---|---|
| 加密 | 经 Electron **`safeStorage`** 加密（Linux 需 `safeStorage` 后端可用，否则拒绝保存而非降级明文） |
| 落点 | 密文存 settings（`credential_youtube_api_key_enc`），**密钥本身永不落 SQLite 明文列** |
| 禁止 | 不写日志、不进 `violations.jsonl`、不进 `.adversarial/`、不进崩溃报告、不进任何 Git 跟踪文件 |
| **IPC 边界** | **API Key 永不跨 IPC 传给渲染层**。`creator:*` 与 `settings:*` 通道只暴露 `hasApiKey: boolean` 与 `fingerprint: string`（末 4 位哈希）。主进程内部解密后直接用于 HTTP 请求，不经 `ipcMain.handle` 回传 |
| 内存 | 仅在发起请求时短暂解密，用后即弃，不挂全局变量、不进闭包捕获 |
| `safeStorage` 不可用 | **fail-closed：整个博主监控功能禁用**（非 YouTube 平台的采集不受影响），UI 明确提示「系统密钥库不可用，无法安全保存 API Key」。**绝不允许降级为明文保存** |
| 失效 | API 返回 `keyInvalid` / `accessNotConfigured` → `fatal_paused`（见 §6.3），UI 直达设置页 |

**为什么 Key 不能跨 IPC**：渲染层是 XSS 与恶意扩展的高暴露面，且 Electron preload 会把返回值原样暴露给页面。一旦 Key 进入渲染层，它就会被 DOM、devtools、以及任何注入脚本读到——即使 IPC 通道本身"只允许主进程调用"。

**为什么不用明文存 SQLite**：桌面应用的 SQLite 文件位于用户目录，本机任何脚本或恶意软件可直接读取；API Key 泄露意味着配额被他人盗用甚至账号被关联。`safeStorage` 在 Windows 上走 DPAPI、macOS 走 Keychain、Linux 走 libsecret，是本仓既有的正确选择。

### 7.5 内容安全校验

| 校验项 | 规则 |
|---|---|
| 标题 | 长度 ≤ 200，超长截断并记 `truncated: true` |
| 正文 | 非空；空则该条判失败（沿用 `normalizeViralItem` 的 fail-closed 约定，`knowledge-library-store.js:19`） |
| URL | 必须 http/https；其余协议拒绝 |
| `thumbnail_url` | 仅取 `content-aggregator` 返回的 thumbnails；不发起额外请求 |

### 7.6 内容质量分级（CCG 评审 i6 修订）

`youtube-transcript-api` 是软依赖，缺失时回落到 `description`——而 description 往往只有一两百字，**直接送 AI 写作会产生低质量结果**。因此必须把内容质量作为**一等字段**贯穿全链路，而不是采集后才知道。

| 等级 | 判据（`metadata.transcript_source`） | 正文来源 | 送 AI 写作建议 |
|---|---|---|---|
| `full` | `subtitle` | 完整字幕 | ✅ 推荐，正文质量高 |
| `partial` | `description` 且长度 ≥ 800 字 | 视频描述 | ⚠️ 可用，提示「正文来自视频描述，质量有限」 |
| `stub` | `description` 且长度 < 800 字 | 视频描述 | ⛔ 默认不推荐，UI 明示「仅标题+简介，AI 写作质量可能不佳」 |

**落库**：`creator_discoveries.transcript_source` 存原始值，`content_quality` 存派生等级（`full`/`partial`/`stub`），两者均在**探测阶段**（`fetch_transcript=False` 时只看 `snippet.description` 长度即可初判）写入，不等到采集时才知道。

**UI**：发现列表每行显示质量徽章（见 §9.3）；`stub` 等级的「送入 AI 写作」按钮**降级为次要样式**并带二次确认。

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

### 8.2 监控探测与增量对比（CCG 评审 i2/i7/v2-i1/i3 修订）

```
调度器触发（check_interval_min 到期）
  │
  ├─ 筛选：status='active' AND enabled=1，按 check_interval_min 从小到大排序
  │
  ├─ 扣探测配额（units）：剩余 < 所需 → 按 §7.3.3 动态降级跳过剩余博主，
  │                        status 不变、不计入连续失败，记 CREATOR_PROBE_QUOTA_EXHAUSTED
  │
  ├─ YouTubeCollector(channel_id=…, fetch_transcript=False)
  │    取 playlistItems，pageSize = min(50, 已采集数 + 10)  ← 滚动窗口，省配额
  │    ⚠ 探测阶段 fetch_transcript=False：字幕不消耗 Data API 配额，
  │      但耗时高，不该在每次巡检时拉
  │
  ├─ 逐条 INSERT OR IGNORE creator_discoveries
  │    ├─ 唯一约束冲突 = 已见过 → 跳过（幂等）
  │    └─ 同时写 content_quality（按 description 长度初判，见 §7.6）
  │
  ├─ classifyFailure(httpStatus, body) 分级（见 §8.6）
  │    ├─ Tier A → 不动 consecutive_failures，指数退避；本轮结束
  │    ├─ Tier B → consecutive_failures += 1；≥3 → status='auto_paused'
  │    └─ Tier C → 立即 status='fatal_paused' + paused_reason
  │
  ├─ 成功：consecutive_failures=0, last_success_at=now
  │
  └─ 推送 UI：角标数字更新 + 配额水位条刷新
```

**滚动窗口的配额意义**：稳态每次探测固定消耗 **1 unit**（`playlistItems.list` 一页），与返回条数无关。`pageSize` 影响的是**首次发现新作品的延迟**而非配额——`pageSize` 过小会导致高频发布博主的作品被挤出窗口。故取 `min(50, 已采集数 + 10)`：50 已是 YouTube 单页上限，再大需翻页（再吃 1 unit）。

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

### 8.6 失败分级与降级（CCG 评审 i7/v2-i3 修订：按 API reason 分类，不按 HTTP 状态码）

**原设计错误**：曾按 HTTP 4xx/5xx 区分「可自愈 / 计入连续失败」。但 YouTube Data API 的 **`quotaExceeded` 与 `rateLimitExceeded` 都返回 403（4xx）**——若按状态码，它们会被判成"真故障"并累计到 `auto_paused`，与「配额耗尽不惩罚连续失败」的设计**直接矛盾**，用户会因配额耗尽被锁进暂停态。

**修订**：分类依据改为 **API 响应体的 `error.errors[].reason`（或 `error.code`）**，HTTP 状态码仅作兜底。

```js
// YouTube Data API 错误体形如：
// { "error": { "code": 403, "message": "...", "errors": [{ "reason": "quotaExceeded", ... }] } }
// ⚠ 实际调用可能拿到：空 body（代理截断）、HTML 错误页、或 errors 数组缺失。
//    因此必须先处理「reason 缺失」，再按状态码兜底，否则会把节流误判成故障。
function classifyFailure (httpStatus, body, transportErr) {
  // 传输层错误优先：根本没拿到 HTTP 响应
  if (transportErr) {
    if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(transportErr.code))
      return { tier: 'transient', reason: transportErr.code }
    return { tier: 'unknown', reason: `transport:${transportErr.code || 'unknown'}` }
  }
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || null

  // Tier A：正常节流 / 瞬时波动 —— 不计入连续失败
  if (['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason)) return { tier: 'throttled', reason }
  if (reason === null && httpStatus === 429) return { tier: 'throttled', reason: 'http_429' }  // 无 reason 的 429 仍是节流
  if (['backendError', 'internalError'].includes(reason)) return { tier: 'transient', reason }
  if (reason === null && httpStatus >= 500) return { tier: 'transient', reason: `http_${httpStatus}` }
  // Tier C：不可自愈 —— 立即暂停
  if (['keyInvalid', 'keyNotValid', 'accessNotConfigured', 'forbidden'].includes(reason)) return { tier: 'fatal', reason }
  if (httpStatus === 401 || httpStatus === 403 && reason === null) return { tier: 'fatal', reason: `http_${httpStatus}` }
  // Tier B：真故障
  if (['channelNotFound', 'playlistNotFound', 'forbidden'].includes(reason)) return { tier: 'permanent', reason }
  // 兜底：reason 缺失且状态码无法归类 → unknown，按 Tier B 计但保留可诊断摘要
  return { tier: 'permanent', reason: reason || `unknown_http_${httpStatus}` }
}
```

**为什么 429 即使没有 reason 也归 Tier A**：429 的语义就是 Too Many Requests，**无论 body 形状如何都是节流**。若因 body 解析失败而落到兜底分支，会把正常的节流计成连续失败并最终暂停——这正是 v1 设计里"配额耗尽被误判成故障"的同类错误，只是换了条路径。

**`unknown` 分支保留诊断摘要**（不保留原文，避免意外带出 Key 或长文本）：

```js
const digest = JSON.stringify(body || {}).slice(0, 200).replace(/[A-Za-z0-9_-]{20,}/g, '<redacted>')
// 落 last_error_message，日志记 rawDigest，便于复现时定位
```

| 等级 | 触发条件 | 计入连续失败 | 重试策略 |
|---|---|---|---|
| **A 正常节流** | `quotaExceeded` / `dailyLimitExceeded` / `rateLimitExceeded`（**HTTP 403**） | ❌ **不计入** | 本轮直接跳过，等下个周期 |
| **A 瞬时波动** | 网络超时 / `ECONNRESET` / 5xx / `backendError` | ❌ **不计入** | 指数退避（1min→4min→16min），最多 3 次 |
| **B 真故障** | `channelNotFound` / `playlistNotFound` / 兜底 4xx | ✅ 计入 | 连续 **3 次** → `auto_paused` |
| **C 不可自愈** | `keyInvalid` / `accessNotConfigured` / `forbidden` | ✅ 计入 | **立即** `auto_paused` |

**为什么把 5xx / 网络抖动移出「计入连续失败」**：默认 1 小时检查一次，连续 3 次瞬时 5xx 需要跨越 3 小时才触发暂停，期间用户白白损失监控；而这类故障几乎都在下一周期自愈。原先的 3 次阈值对瞬时故障**过敏**（CCG 评审 i7）。

**Tier A/B/C 的 UI 表达差异**：

| 等级 | UI 表现 |
|---|---|
| A 节流 | 无警告，仅配额水位条变化（这是正常状态，不是故障） |
| A 瞬时 | 静默重试；连续 3 次仍失败才在列表显示「最近检查不稳定」 |
| B 真故障 | `creatorAutoPaused`：连续失败 {times} 次，已自动暂停。{reason} + 「立即重试」 |
| C 不可自愈 | `creatorFatalPaused`：无法检查新作品：{reason}。请在设置中检查 API Key。+ 直达设置页按钮 |

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
| 内容质量 | `full` 有字幕（绿）/ `partial` 描述可用（蓝）/ `stub` 仅标题简介（琥珀） | 三级，见 §7.6；`stub` 时「送入 AI 写作」降级为次要样式并二次确认 |
| 状态 | 未采集 / 已采集·{time} | 持久态，刷新不丢 |
| 操作 | **采集** / **送入 AI 写作** / 忽略 | 已采集时置灰 |

排序：默认 `published_at DESC`。

**配额水位条**（博主列表顶部常驻）：

| 水位 | 展示 |
|---|---|
| < 60% 探测池 | 细进度条，默认收起 |
| 60% ~ 80% | 展开显示「今日探测配额已用 {used}/{limit} units」 |
| ≥ 80% | 变琥珀色 + `creatorQuotaHigh`：今日 YouTube 配额已用 {percent}%。新作品发现可能延迟。 |
| 物理池 ≥ 80%（8,000 units） | 红色 + `creatorPhysicalQuotaHigh`：接近 YouTube 每日配额上限（10,000 units），部分功能将受限。 |

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
| `creatorQualityFull` | 字幕正文，质量高 | Transcript (high quality) |
| `creatorQualityPartial` | 描述正文，质量有限 | Description (limited) |
| `creatorQualityStub` | 仅标题+简介 | Title only |
| `creatorQuotaHigh` | 今日 YouTube 配额已用 {percent}%。新作品发现可能延迟。 | {percent}% of today's YouTube quota used. New posts may be detected late. |
| `creatorPhysicalQuotaHigh` | 接近 YouTube 每日配额上限（10,000 units），部分功能将受限。 | Approaching YouTube's daily quota (10,000 units). Some features will be limited. |
| `creatorProbeSkipped` | 因配额限制，{count} 个博主本轮未检查 | {count} creators skipped this round due to quota |
| `creatorMaxFollowing` | 最多关注 {max} 个博主。如需增加，请调大检查频率或移除部分博主。 | You can follow up to {max} creators. Increase the check interval or remove some to add more. |
| `creatorFatalPaused` | 无法检查新作品：{reason}。请在设置中检查 API Key。 | Cannot check for new posts: {reason}. Check your API Key in Settings. |
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

**CCG 评审修订项对应的验收（新增，缺一不可）**：

| 编号 | 验收项 | 对应评审 |
|---|---|---|
| A15 | `migrateCreatorLinkageSchema` 在**已有存量数据**的库上执行成功：`viral_library` 存量行 `external_id=''` 不触发唯一索引冲突，应用可正常启动 | i1 / v2-i2 |
| A16 | 采集后可由 `viral_library.(platform, external_id)` 反查到 `creator_discoveries` 与博主；重采集走 `INSERT OR REPLACE` 且保留原 `created_at` | i1 |
| A17 | 50 博主 @ 1 小时间隔时，日探测消耗 ≤ 1,500 units；第 63 个博主被拒绝并提示 `creatorMaxFollowing` | i2 / v2-i1 |
| A18 | 配额不足以覆盖全部博主时，按 `check_interval_min` 升序保底、其余跳过，并在 UI 显示 `creatorProbeSkipped`，**不产生失败状态** | v2-i1 |
| A19 | API 返回 `quotaExceeded`（HTTP 403）时，`consecutive_failures` **不增加**，状态保持 `active` | v2-i3 |
| A20 | API 返回 `keyInvalid` 时**首次即**进入 `fatal_paused`（不等 3 次），UI 显示 `creatorFatalPaused` 并提供直达设置页入口 | v2-i3 |
| A21 | 5xx / 网络超时连续 3 次**不**触发暂停；Tier B 连续 3 次才 `auto_paused` | i7 |
| A22 | 未知 `action.type` 抛错且**不执行** pipeline；既有 4 类自动化任务回归测试全绿（R1~R5） | i3 |
| A23 | API Key 不出现在 settings 明文、任一日志文件、崩溃报告中；grep 验证 `api_key_present` 为唯一落盘形态 | i5 |
| A24 | `stub` 质量等级的作品，「送入 AI 写作」为次要样式且带二次确认；`full` 等级为推荐样式 | i6 |
| A25 | 单条采集在采集池耗尽时被拒绝并提示，**不豁免配额**（仅豁免数量上限） | i8 |

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