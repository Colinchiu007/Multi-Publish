# 变更：播客 RSS 频道接入一键发布（podcast-oneclick-publish）

## Why

播客 RSS 通道的 P0（`podcast-rss-channel`，PR #3193）已交付"引擎 + 主进程 + 独立页面"，但用户仍要在播客页手工填每一期的标题与 https 音频地址，再手工生成并上传 feed。而本项目的既有能力是"图文/视频一键发布到多平台"，音频侧缺同等入口：内容产出处（成片、文案库、AI 改写、页内写作）与播客频道之间没有通路，用户要跨 4 个页面搬运同一份内容。

架构前提不变（ADR-0008）：小宇宙/Apple/Spotify 没有逐期发布 API，"发布到播客"的真实机制 = 自托管音频 + 生成 Podcast RSS + 首次人工提交 + 此后聚合端定时抓取。因此本变更**不新增发布平台**，而是把"产出一期"做成一条正交的一键动作。

## What Changes

- **多频道**：`<userData>/podcast/channel.json` 单频道 → `index.json`（频道目录 + 全局托管配置 + 迁移状态）+ `channels/<ch_id>/{channel.json,episodes.json,feed.xml}`；`channel.json` 拆 `meta` / `feedSync` 两段，防止改名抹掉发布状态。
- **迁移**：注册期不触盘的前提下由 `ensureMigratedOnce()` 单飞执行；完整性按内容哈希三态判定（等值 / 静默续传 / 真冲突）；冲突与硬失败均有持久化状态与 `podcast:channel:migrate:resolve` 出口；**迁移绝不改写既有 guid**。
- **托管直传接线（P1）**：凭证加密落盘走 `credential-store`（`index.json` 只存 `credentialRef`），`podcast:hosting:get|save|check` + `podcast:feed:publish`；feed 覆盖上传前留本地 `feed.prev.xml` 与 OSS 时间戳副本，并回报 `backupCreated`。
- **一键发布主通道**：`podcast:episode:publishFromSource`（幂等，按含 channelId 的稳定 guid 原地合并）+ 独立进度事件 `podcast:publish:progress`（新事件名，不并入 `stores/publishProgress.js`）。
- **两条产出路径**：成片 → ffmpeg 抽全混音（degraded 静音占位旁白 fail closed）；文案 → 分块云端 TTS 装配（禁止整篇喂，块间显式静音）。
- **共用手柄**：`usePodcastEpisodePublish` + `PodcastPublishAction.vue`，在刀 3 建成、刀 4 复用；入口收在各页既有"发布"动作的次级项，默认态不改像素。
- 新增 `channelId` 必填的 6 条既有通道；`podcast:endpoints:list` 保持频道无关无参。

## Impact

- 受影响面：`apps/desktop/electron/services/`（registry、locks、service、hosting、assembler）、`apps/desktop/electron/ipc-handlers/podcast.js`、`apps/desktop/electron/preload/podcast.js`（含 `index.bundle.js` 与 `home-shell-preload.bundle.js` 两个 bundle 重生成）、`apps/desktop/src/api/podcast-channel.js`、`src/composables/`、`src/views/PodcastChannelView.vue`（+ 其 `.test.js`）、`src/locales/{zh,en}.js`、`packages/shared-utils/src/podcast-rss.js`（`audioMimeFromUrl` 未命中改返回 null）、`01-docs/DESIGN-PODCAST-ONECLICK-PUBLISH-2026-10-10.md`、`01-docs/PRD-PODCAST-ONECLICK-PUBLISH-2026-10-10.md`、`01-docs/i18n-glossary.md`、`openspec/changes/podcast-oneclick-publish/**`、`openspec/records/podcast-oneclick-publish.md`、`.quality-gates.md`、`scripts/gate-record-debt-ledger.json`、`CHANGELOG.md`、`.adversarial/podcast-oneclick-publish/**`（5 轮对抗评审与取证附录，随 PR 入库以保证决策可追溯）。
- **不受影响且不得触碰**（本变更的架构不变量，由既有锁守住）：`config/platforms.yaml`、`publish-capabilities.json`、`platform-definitions.js` 四张表、rpa-engine DOM 选择器、`publishMode` 三态闭集、`publish:batch` / `batch:create` / `taskQueue` / `task-queue-frequency.js`（平台日配额）/ `publish:progress` 相位枚举。判据锁：`packages/shared-utils/src/__tests__/podcast-endpoints.test.js` 的「与平台契约面隔离」describe。
- 破坏性：既有 8 通道中 6 条的入参新增必填 `channelId`；`channel.json` 存储形状变更（含一次性迁移）。仅本机数据，无跨设备协议破坏；云端账号契约不受影响。
- 风险：迁移不可逆（对外 feed URL 承诺）⇒ 用 `ch_*` 不可变 id + 不删 legacy + 冲突不猜来收敛；公网 feed 覆盖写坏即刻影响所有订阅者 ⇒ 备份 + 回滚入口 + `backupCreated` 可见。

## 评审与门禁

设计期经 5 轮跨家族对抗评审（`adversarial-review-loop`，proposer=anthropic / critic=opencode→codex，产物 `.adversarial/podcast-oneclick-publish/`）+ 外部 CCG 双模型设计评审共 38 + 10 条；已锁决策 9 条（D-1…D-9）。实现期每刀最后一个代码提交后另跑 QM-6 双模型外部评审。
