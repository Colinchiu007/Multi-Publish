# 播客分发走 RSS 协议通道：不新增发布平台登记、不扩 publishMode 三态

「发布到小宇宙」的真实机制是 RSS 收录：小宇宙（及 Apple Podcasts、Spotify）是聚合端，无官方发布 API、站内无音频上传单集入口（取证见 `01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`，2026-10-09）。因此 mulpub 建设的不是"第 16 个发布平台"，而是一条**协议型发布通道**——生成/更新自家 Podcast RSS，首次由用户在聚合端人工提交收录，此后逐期自动同步。本 ADR 固化两个不可逆决策：① 分发端目录不登记为平台（不进 `PLATFORM_LOGIN_URLS`/`PLATFORM_AUTH_HOSTS`/会话 Cookie 标记/凭证采集/`publish-capabilities.json`，15 平台完整性断言不变）；② `config/platforms.yaml` 的 `publishMode` 三态总闸（`api-only|api-then-dom|dom-only`）**不新增 `rss` 第四态**——该闸回答"走 API 轨还是 DOM 轨、失败是否回退"，RSS 对两条轨都不可路由，属另一种通道种类；硬塞第四态会被 `rpa-view-manager.js` 的 `mode != null ? mode !== 'dom-only' : ...` 判定**静默归入 API 轨**（去调不存在的 rss adapter），且该开关面 2026-10-06 刚修过双闸矛盾、属回归高敏区。

## 备选方案

- **`publishMode` 加第四态 `rss`**：把"路由器枚举"扩成"通道枚举"，语义混杂；L73 表达式必须改写、`getMode`/config-loader 枚举校验/api-router 四件套同步改，误路由风险与历史契约破坏面都大。否决。
- **把小宇宙/Apple/Spotify 登记为可登录平台**：登录判定契约面对它们没有任何一个有真实语义（不存在"登录上传"），强行登记会虚假拖入 `publish-capabilities`（15→15+N）、rpa-engine 选择器、api-publish-engine 注册表、ops-center PlatformDef 全部契约面——"字段名相同 ≠ 语义相同"既有判据的同款错误。否决。
- **逆向私有 API / 主播后台 RPA 作为主通道**：写接口未发现且属未授权访问（ToS 与账号风险）；主播后台无单集发布能力、首次投稿入口在 App 内桌面 RPA 不可达。否决（主通道唯一合规形态即 RSS）。

## 后果

- RSS 通道**完全不进平台登记面**：分发端数据落 `packages/shared-utils/src/podcast-endpoints.json`（CJS/ESM 孪生消费），由 `podcast-endpoints.test.js` 的隔离断言钉住（分发端 id 不得出现在任何平台契约表；`PLATFORM_NAMES`/`PLATFORM_PUBLISH_META` 平台数恒为 15）。新增分发端只改目录 JSON，不触碰登录/发布契约面。
- 后续实现刀必须建立**正交通道分叉**：发布任务入口按通道类型分流，`channel: rss` 类平台永不进入 `rpa-view-manager` 的调度集合，并配一条接线守卫断言该不变量；yaml 误配 `publishMode: rss` 时枚举校验 fail-closed 报错。
- 发布进度事件是否新增"feed 更新成功/失败"终态属实现时决策；若接入 `publish:progress` 相位枚举，必须遵守既有三处同步纪律（emitter `PHASE_ENUM` / store `PHASE_ENUM` / `TERMINAL_PHASES`）。
- 用户心智成本：产品叙事仍是"发布到小宇宙"（一次提交收录、此后每期自动到），但界面必须如实声明"首次收录需人工提交、审核 1~7 天、mulpub 无法代提交"（目录字段 `requiresManualFirstSubmit`/`timing` 承载），不得暗示全自动站内发布。
