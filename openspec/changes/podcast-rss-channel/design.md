# Design: podcast-rss-channel

## 1. 语境

播客端（小宇宙/Apple Podcasts/Spotify）是 RSS 聚合端：不存在逐期站内发布动作。本通道把"发布单集"重定义为"向自家 feed 追加 `<item>` 并更新文件"，首次收录由用户在聚合端一次性人工提交 RSS 地址完成。前置调研与逐端证据见 `01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`。

## 2. 决策记录（引用，不重议）

- **D1 托管形态分期**：A（用户自带外链）= P0 必答；B（用户自有 OSS/COS 直传，复用 `api-publish-engine/src/oss-uploader.js` 引擎改「用户自配 AK/bucket」形态）= P1 推荐落地；C（mulpub 代托管）= P2，启动前置三条件——能收费（entitlement 配额）/可审核（机审+举报下架）/可退出（churn 后 feed 归属与导出）。理由全文见调研报告 §八。
- **D2 不扩 publishMode 三态**：RSS 是通道种类而非路由策略，第四态 `rss` 会被 `rpa-view-manager.js` 的 `mode != null ? mode !== 'dom-only' : ...` 静默归入 API 轨（类别错误 + 静默断裂）。决策与备选见 `docs/adr/0008`。
- **D3 Apple/Spotify 纳入**：形态是「分发端目录 + 首次提交指引」（`podcast-endpoints.json`），不登记为可登录/可逐期发布平台，不触碰 `PLATFORM_LOGIN_URLS`/`PLATFORM_AUTH_HOSTS`/会话标记/`publish-capabilities.json`/选择器。理由全文见调研报告 §九。

## 3. 分层架构

```
packages/shared-utils/src/podcast-rss.js        —— 引擎单一真源（纯函数：校验/buildFeed/parseFeed/verifyFeed）
packages/shared-utils/src/podcast-endpoints.json —— 分发端目录（含取证日期 verifiedAt 与证据 evidence）
  ├─ podcast-endpoints.js（CJS，主进程）
  └─ podcast-endpoints.browser.js（ESM，渲染端，vite alias 先例）
        ↓（后续实现刀）
apps/desktop/electron/services|ipc-handlers     —— podcast:* IPC、持久化、feed 原子落盘、headImpl 注入（§PRD 8.1/8.2）
apps/desktop/src/views|stores|locales           —— 页面三区块、podcast.js store、podcast 命名空间 zh/en 成对
```

关键不变量：
1. **引擎零出站、零落盘**：网络（headImpl）与文件写入一律消费方注入——保证纯单测可全离线跑（本仓「测试层禁止真实出站」纪律的自然满足）。
2. **fail-closed 生成**：`buildFeed` 校验不过抛 `PODCAST_FEED_INVALID`（附全量 issues），不产出/不覆盖 feed 文件；禁止"看似成功但平台不收录"的产物。保存草稿走非阻断 `{ok,issues}` 口径，两口径不得混用。
3. **协议判据一处实现**：所有 URL 字段经 `safeHttpUrl` + `https:` 二次收紧；渲染端锚点绑定再过 `podcastEndpointHref()`；禁止第二份 `/^https?:/`。
4. **平台契约面隔离**：分发端 id 与 15 平台契约表（登录 URL/平台名/发布能力/会话标记/AUTH_HOSTS）互斥，由 `podcast-endpoints.test.js` 断言锁定且只能收紧。

## 4. 数据流（首次接入 + 逐期）

配频道 → 加单集（外链/直传回填 URL）→ `podcast:feed:build`（校验 fail-closed → 原子覆盖写 `feed.xml`）→ 外链可达性自检（`podcast:feed:verify`）→ 小宇宙 App 内人工提交（指引卡片 + 复制 RSS 地址，审核 1~7 天）→ 聚合端定时抓取 → 此后每期 = 追加 item 并重建 feed（小时级自动出现）。验收主判据 = "RSS 生效"（自家 feed 出现该 guid + enclosure 自检 ok）；聚合端展示为人工核对项，不做自动化断言。

## 5. 双实现漂移处置

`packages/api-publish-engine/src/podcast/feed-schema.js` 为早期草稿（校验码集漂移：缺 `EPISODE_SIZE_REQUIRED`/`CHANNEL_CATEGORY_TOO_DEEP`/`feedType`/`subtitle` 族，多 `CHANNEL_COVER_INVALID`/`CHANNEL_LINK_INVALID`，MIME 派生兜底值不同）。真源唯一 = shared-utils；实现刀启动前二选一（删除草稿 / 改为 require 注入形态并补跨包 parity 锁），不允许两份校验口径长期共存（PRD R3、tasks 3.4）。
