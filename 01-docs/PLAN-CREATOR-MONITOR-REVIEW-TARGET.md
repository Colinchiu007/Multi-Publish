# 评审提案 v2：博主监控与采集（Creator Monitor & Collect）

> CCG 决策层评审目标（受 opencode 7800 字符输入上限约束的精简版）。
> 完整实现规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`（约 900 行）。
> **v1 评审 8 条 + 第 2 轮 3 条 Critical 已全部逐条回应，见 §6。**

## 1. 背景与根因

用户要长期关注抖音/小红书/知乎/视频号/公众号/X/YouTube 博主，定期监控、发现新作品、一键批量采集（默认量 + 硬上限）；也要手动采集指定博主（可设数量）；单条采集体验需明确解决。

**根因（代码实证）**：本仓无任何「博主」维度概念——`author` 只是字符串，无关注表，无"按账号列作品"能力，无周期内容监控；「已采集」是内存 Set 现算（`Collection.vue:1190`），刷新即丢。

**平台现实**：`collection-engine` 5 个 adapter 全是死代码一行未接线，4 个 `_doFetch` 空壳或缺失，视频号 Python 侧显式拒绝。**7 个平台的"按博主列作品"能力实测为 0。**

**Why YouTube 优先**：外部依赖 `content-aggregator` 的 `YouTubeCollector`（`content_aggregator_shared`，366 行）**已实现完整频道枚举**，返回 `metadata.video_id`/`channel_id`/`thumbnails`/`transcript_source`。唯一能在不依赖反爬的前提下证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，本方案不承诺长期稳定可用**——架构只保证它们失效时不拖垮整体。

## 2. 锁定决策（经用户两轮确认）

| # | 决策 |
|---|---|
| D1 | MVP = YouTube |
| D2 | 去向 = 采集库 + 一键送 AI 写作；**排除一键搬运发布** |
| D3 | 监控默认 1 小时可配；探测/采集**配额独立** |
| D4 | 数量双轨：一键 5 / 手动 50 / 全局上限 100；**超限必提示，禁止静默截断** |
| D5 | 单条 = 每行一个零填参按钮；**仅豁免数量上限，不豁免配额** |
| D6 | 去重键 `(platform, external_id)` 落 DB 唯一约束（URL 可变，ID 稳定） |
| D7 | 新建独立 SQLite 表 |
| D8 | 失败分级降级：Tier A 不计入 / Tier B 累计 3 次暂停 / Tier C 立即暂停 |
| D9 | UI 显式标注能力等级 |
| D10 | 凭证单账号起手，字段预留多账号 |
| D11 | 借形不借魂：保留 `base-adapter.js` 护栏契约，重写 `_doFetch`；正文提取改用 `readable-text.js` |

## 3. 数据模型

新建 3 表：`creator_accounts`（`UNIQUE(platform, external_id)`）、`creator_follows`（含监控配置 + 状态机）、`creator_discoveries`（`UNIQUE(platform, external_id)` 保证探测幂等；`collect_state: pending→collected|skipped`；`content_quality: full|partial|stub`）。

**`viral_library` 反向映射**：该表无 `external_id`/`creator_id`，新增幂等迁移 `migrateCreatorLinkageSchema()`（`PRAGMA table_info` 判列→`ALTER TABLE`）。索引**必须是 partial**（`WHERE external_id <> ''`）——存量行该字段全为空串，普通 UNIQUE 会在迁移瞬间因重复键抛错导致**应用起不来**。不建外键（存量行无 `creator_id`）。

## 4. 配额模型（v1 最严重错误已修正）

v1 写「探测预算 200 次/天」，但 1 小时 × 50 频道 = **1,200 次/天**，预算与频率×频道数**互相矛盾，监控跑不满**。现从物理池反推：

- YouTube 物理上限 **10,000 units/day**；`playlistItems.list`=1，`channels.list`=1（仅首次解析），`videos.list`=1，字幕 0 units
- 稳态单次探测 = **1 unit**
- 切分：探测池 **1,500** / 采集池 **6,000** / 安全余量 **2,500**
- 联立约束：`Σ(1440/interval_min) ≤ 1500` 且 博主数 ≤ **50**（50@1h = 1,200 units 贴边可行；第 63 个拒绝并提示）
- 配额不足时**动态降级**：按 `interval_min` 升序保底、其余跳过并在 UI 提示，**绝不静默饿死一部分博主**
- 物理池 ≥ 80% 红色告警

## 5. 失败分级（v1 按状态码分类是错的）

YouTube 的 **`quotaExceeded` 与 `rateLimitExceeded` 都返回 HTTP 403（4xx）**——v1 按状态码会把配额耗尽误判为真故障、累计到 `auto_paused`，与「配额不惩罚」**直接矛盾**。现按 API 响应体 `error.errors[].reason` 分类：

| 级 | 触发 | 计入连续失败 | 策略 |
|---|---|---|---|
| A 节流 | `quotaExceeded`/`rateLimitExceeded`(403) | ❌ | 跳过本轮，无警告 |
| A 瞬时 | 5xx/超时/`ECONNRESET` | ❌ | 指数退避 1→4→16min，最多 3 次 |
| B 真故障 | `channelNotFound` 等 | ✅ | 连续 3 次 → `auto_paused` |
| C 不可自愈 | `keyInvalid`/`accessNotConfigured` | ✅ | **首次即** `fatal_paused`，UI 直达设置页 |

5xx/网络移出「计入」是因为：1 小时间隔下连续 3 次 5xx 需跨 3 小时才暂停，期间白白损失监控，而这类故障几乎都自愈。

## 6. 对 v1 评审 11 条问题的逐条回应

| 评审 | 回应 |
|---|---|
| i1 `viral_library` 无 external_id | **接受**，§3 已加迁移 + 反查映射 + 重采集语义 |
| i2 物理配额未计算 | **接受**，§4 已按 units 全量核算 |
| i3 scheduler 改造无对比/无 default 行为 | **接受**，已补复用 vs 新建 6 维对比（结论：复用）、`switch default` **必须 throw**（fallback 到 pipeline 会静默跑错任务）、R1~R5 回归清单 |
| i4 「200/天」语义模糊、无关注数上限 | **接受**，§4 明确单位=units，并加 `MAX_FOLLOWING=50` |
| i5 API Key 存储未提 | **接受**，已加硬约束表：`safeStorage` 加密、禁明文落 SQLite/日志/崩溃报告、只记 `api_key_present`+指纹 |
| i6 transcript 缺失时质量差 | **接受**，加三级质量分级 `full/partial/stub`，探测阶段即初判落库，`stub` 的「送 AI 写作」降级+二次确认 |
| i7 3 次阈值对 5xx 过敏 | **接受**，见 §5 Tier A/B 拆分 |
| i8 单条与物理配额边界不明 | **接受**，D5 明确单条**仅**豁免数量上限，仍扣采集池 |
| v2-i1 配额算术矛盾 | **接受**，§4 完整重写为物理池反推 |
| v2-i2 迁移幂等性/索引冲突 | **接受**，partial index + `PRAGMA table_info` 幂等 + 不建外键 |
| v2-i3 状态码分类矛盾 | **接受**，见 §5 |

## 7. 风险

1. **反爬**（抖音/小红书/视频号）——本期不实现；接入时熔断 + 自动暂停 + UI 标注
2. **`automation-scheduler` 改造回归**——影响既有 4 类任务，靠 R1~R5 回归测试对冲
3. **打包依赖**——`content-aggregator` 为可选依赖、`youtube-transcript-api` 为软依赖，须在 QM-1 打包门禁实测

## 8. 规模与验收

预计新增 4,530 行 / 改动 9 文件 / 共 19 文件。验收 **25 项**（A1~A25），其中 A15~A25 为评审修订项对应的可验证验收。

## 9. 请重点复核

1. 配额反推模型是否自洽？1,500 探测池 + 50 频道上限是否合理？
2. 失败分级（按 reason 而非状态码）是否覆盖 YouTube 的实际错误形态？
3. partial unique index 是否是存量数据的正确处理方式？
4. `switch default throw` 是否过于严格（会不会让历史脏数据任务全部报错）？
5. 排除「一键搬运发布」是否削弱本特性价值？