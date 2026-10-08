# Proposal: podcast-rss-channel（播客 RSS 频道发布——自动覆盖小宇宙收录）

## Why

1. **小宇宙没有官方发布 API，"发布到小宇宙"本质是 RSS 收录**（调研取证：`01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`，2026-10-09）。官网无开放平台入口；主播后台功能面为运营互动、无音频上传单集；教程生态一致指向"托管出 RSS → App 内提交 → 此后聚合端自动抓取"。
2. 用户目标"一键发布覆盖小宇宙"唯一合规、稳定、可自动化的实现路径是**协议分发通道**：生成/维护标准 Podcast RSS（iTunes RSS 2.0），一份 feed 同时分发小宇宙 / Apple Podcasts / Spotify 等全部 RSS 型播客端。
3. 逆向写接口（未发现且属未授权）与主播后台 RPA（无单集发布能力、投稿入口在 App 内）均不可作主通道——见 ADR-0008 否决记录。

## What Changes

### A. 共享引擎（本 PR 已实现）
- `packages/shared-utils/src/podcast-rss.js`：RSS 生成/校验/自检单一真源。纯函数、零出站（`headImpl` 注入）；`buildFeed` 校验不过抛 `PODCAST_FEED_INVALID` 且**不产出文件**（fail-closed）；常量 `TITLE_MAX=255 / SUMMARY_MAX=4000 / SUBTITLE_MAX=120 / DURATION_MAX_SEC=86400 / ITEMS_MAX=1000 / 封面 1400~3000px 正方形`；协议判据复用 `safe-http-url`（https-only）。
- `packages/shared-utils/src/podcast-endpoints.json` + `.js`（CJS）+ `.browser.js`（ESM 孪生）：分发端目录（`xiaoyuzhou`/`apple_podcasts`/`spotify`），承载 `submitChannel/requiresManualFirstSubmit/timing/steps/verifiedAt/evidence` 提交指引；**不进入平台登记契约面**（隔离断言锁定）。
- 测试：`__tests__/podcast-rss.test.js`（25 例）+ `__tests__/podcast-endpoints.test.js`（8 例）。

### B. 文档（本 PR）
- `01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md`：全量数据模型、校验码表、流程、IPC 合同（规划）、交互/显示/提示文字（locales `podcast` 命名空间 zh/en 清单）。
- `docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md`：不新增平台登记、不扩 publishMode 三态。
- 调研报告入库、主 PRD 索引、i18n-glossary、CHANGELOG、质量节拍记录与 ledger 登记。

### C. 主进程与渲染层（本 PR 已落地）
- IPC 8 通道：`podcast:channel:get/save`、`podcast:episode:list/save/remove`、`podcast:feed:build/verify`、`podcast:endpoints:list`（合同见 PRD §8.1），全部**字面量**注册（`electron/tests/ipc-contract.test.js` 从源码正则清点通道名，间接/循环注册会使通道对契约锁隐身）；信封 `{code:0,data}` / `{code,message,issues}`；`unwrapObject` 形态守卫；空 `id` 不下沉服务层；日志禁记用户文本（只记通道名与错误消息）。
- 持久化：`<userData>/podcast/` 下 `channel.json`/`episodes.json`/`feed.xml`（**偏差声明**：原写 `podcast/<channelId>/feed.xml`，P0 是单频道（开放问题 O1 未启动），故目录不带 channelId 一层，多频道时再按 `channelId` 分目录并做迁移）。`feed.xml` 临时文件 + `renameSync` 原子覆盖，Windows 仅 `EPERM/EACCES/EBUSY` 有界退避；损坏 JSON → `PODCAST_STORE_CORRUPT` fail-closed。单集保存按 `id` → `guid` 原地更新；`guid||audioUrl||resolvedAudioUrl` 全链判重由引擎 `EPISODE_DUPLICATE` 在构建期兜底（服务层不抄第二份口径）。
- 页面三区块（频道配置 / 单集列表 / RSS 输出与分发端指引）+ locales `podcast` 命名空间成对落盘；`useEmbeddedViewSuspension` 不适用（无内嵌视图交互）。**偏差声明**：状态承载用 `src/composables/usePodcastChannel.js` 而非 `stores/podcast.js`（单页自持、无跨页共享）。表单↔引擎键名映射唯一实现点 = 模块级 `channelFormToPayload`/`channelPayloadToForm`（`category`+`subCategory` ↔ `categoryId="Top/Sub"`），有承重合同测试。
- `headImpl` 注入点在位但**主进程 `net` 版 HEAD provider 未接**：缺省不注入即跳过网络检查，生产默认零真实出站（日志标 `head=off`）；外链巡检属 F9/P1。

### D. 正交通道分叉与高敏闸守护（本 PR 已落地）
- 发布任务入口**无需新增分流代码**：分发端 id 在 `config/platforms.yaml`、`publish-capabilities.json`、`platform-definitions.js`、rpa 选择器四处全缺，DOM/API 轨无从选中；`publishMode` 三态值域保持不变；`normalizeMode` 对未知值抛 `unknown publishMode`（既有闭值域实现），本 PR 补上此前缺失的行为锁（含 `decideRoute({mode:'rss'})` 必须抛、`platforms.yaml` 平台键不得含分发端 id）。
- 接线守卫：`podcast-endpoints.test.js` 两把结构锁（不进登录 URL 表/平台名表/发布能力注册表；不进会话标记表/认证主机表）+ `platform-definitions.test.js` 15 平台数不变。
- 双实现收敛（PRD R3）：`packages/api-publish-engine/src/podcast/feed-schema.js` 早期草稿已移出源码树，仓库内零引用，唯一真源 `shared-utils/podcast-rss.js`。

## Impact

- 受影响面（本 PR 实际清单，供评审对齐范围）：`packages/shared-utils/src/podcast-rss.js`、`podcast-endpoints.{json,js,browser.js}` 及其 `__tests__`；`apps/desktop/electron/services/podcast-channel-service.js`、`podcast-hosting-upload.js`（P1 规则层，未接线）、`ipc-handlers/podcast.js`+`index.js`、`preload/podcast.js`+`index.js`+两个 bundle；`apps/desktop/src/views/PodcastChannelView.vue`、`composables/usePodcastChannel.js`+`useTabDocumentTitle.js`、`config/route-registry.js`+两个 sidebar 测试、`router/index.js`、`locales/zh.js`+`en.js`；`packages/api-publish-engine/test/publish-mode-config.test.js`；`.github/scripts/max-lines-baseline.json`（locales 基线随新增键上调，**接受漂移并在此披露**）；文档与门禁记录（`01-docs/PRD.md` 索引、`i18n-glossary.md`、CHANGELOG、`.quality-gates.md`、`scripts/gate-record-debt-ledger.json`）。
- 行为变化：新增「播客 RSS 频道」页面与侧边菜单项；不改动既有 15 平台发布链路，不新增出站请求。
- 破坏性：无。`PLATFORM_NAMES`/`PLATFORM_PUBLISH_META` 保持 15；`publishMode` 值域不动。
- 已收敛风险：PRD R3 双实现漂移（草稿移出源码树）。
- 未闭合项（如实）：QM-4 新视图像素登记与首张 CI 基线必须同次发生，本 PR 未登记；侧边菜单新增条目可能改变含侧栏视图的全页像素，若 `QG Visual` 变红需按同一次 run 的 CI 渲染重建基线（禁提阈值）。

## Out of Scope

- P1 用户自有 OSS/COS 直传（形态 B）：**上传动作与 `resolvedAudioUrl` 回填、AK 进 credential-store、外链巡检不在本 PR**；本 PR 只落规则层 `podcast-hosting-upload.js`（`object_key` 派生 / 公网 URL 拼接 / OSS V1 待签串 / 签名头不含凭证 / MIME 复用共享实现，34 例锁，除自身测试外无消费者）。改造 `oss-uploader.js` 的接线设计另行规格化（PRD §四 F7~F9，tasks §7）。
- P2 mulpub 代托管（形态 C）：三前置条件（能收费/可审核/可退出）闭合前不启动。
- 主播后台 RPA 运营动作（公告/投票/改节目信息）：不进 MVP。
- 收录状态观测（轮询各端公开页判断新单集出现）：涉第三方读取面，另立 change 前先过相关性/合规判据（PRD O2）。
- 多频道（>1 个 podcast channel）：P0 单频道，开放问题 O1。
