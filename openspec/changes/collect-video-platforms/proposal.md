# Proposal: collect-video-platforms（六平台视频链接采集 + 分享文本健壮解析）

## Why

目标要求采集页支持 抖音/小红书/视频号/哔哩哔哩/百家号/知乎 六平台的视频链接，并解析各平台「复制链接」混合文本中的真实 URL。现状侦察（全部带路径，实测证据见 `01-docs/RESEARCH-VIDEO-COLLECT-OPEN-SOURCE-2026-09-29.md`）：

1. **前端路由只覆盖 2/6 平台**：`Collection.vue:1018` 的 `VIDEO_PLATFORM_DOMAINS` 仅含 douyin/xiaohongshu——B站/知乎/视频号/百家号的视频链接全部误走图文采集通道（trafilatura 只能拿到页面文字，拿不到视频口播文案）。现有 spec `aggregation-collect-video` 的「视频链接识别与路由」Requirement 已声明六平台域名 SHALL 路由视频通道，属 spec-实现漂移。
2. **分享文本解析吞中文（bug 级）**：`Collection.vue:859` 的 URL 正则 `https?:\/\/[^\s"'<>）)】\]]+` 只按空白截断——实测 `https://v.douyin.com/abc/复制此链接`（URL 与中文无空格粘连，真实分享文本常见）会把「复制此链接」吞进 URL，后端拿到脏链接。
3. **后端平台白名单缺百家号**：`video_service.py:37` 的 `PLATFORM_DOMAINS` 无 baijiahao/mbd 域名，detect_platform 直接拒绝。
4. **浏览器降级通道只有抖音**：`browser_fetcher.py:25` 的 `_BROWSER_FETCH_CONFIGS` 仅 douyin——小红书 yt-dlp 匿名直连拿不到数据（实测 SSR `noteDetailMap:{}` → "No video formats found"，且该错误不触发降级），小红书视频链接实际不可采集。
5. **视频号无明确报错**：channels.weixin.qq.com 链接通过 detect_platform 后在 yt-dlp 阶段死于泛化错误「视频下载失败」，用户不知道是平台不支持。
6. **百家号无任何通道**：yt-dlp 无 extractor；但调研实测（双重独立验证）文章页 `window.jsonData` 的 mthvideo sections 直含 mp4 地址，纯 HTTP 可采集，无需浏览器。

## What Changes

### MODIFIED Capabilities

- `aggregation-collect-video`：路由域名表扩到六平台（含路径级规则）、分享文本解析改 CJK 排除字符类、新增百家号纯 HTTP 通道与「无视频回退图文」语义、新增小红书浏览器降级配置、新增视频号明确报错、错误分类补 ANTI_BOT 触发条件、平台标签扩六平台。

### 变更明细

**后端（packages/python-backend/src/multi_publish/aggregation/）**
- `video_service.py`：`PLATFORM_DOMAINS` 增 `baijiahao: (baijiahao.baidu.com, mbd.baidu.com)`；不支持平台报错文案补百家号；`collect_video` 对 `channels` 平台前置报 `VIDEOCLONE_CHANNELS_UNSUPPORTED`（视频号需微信登录态）；`_probe_and_download` 对 `baijiahao` 平台改走纯 HTTP 通道（不经 yt-dlp）；`classify_download_error` 补两类 ANTI_BOT 触发（小红书 "No video formats found"、B站 412/-352 风控）。
- 新增 `baijiahao_fetcher.py`：GET 文章页（桌面 UA）→ 解析 `window.jsonData`（正则锚定 `;\s*window\.` 边界）取 `bsData.superlanding[0].itemData.sections[]` 中 `type:"mthvideo"` 项的 `content.https.file`/`content.base.src`（mp4 直链）+ `base.long`（时长）+ 标题；兜底 `<video src>` 正则；无视频抛 `no_video`（前端回退图文采集）；haokan.baidu.com 重定向如实报错。
- `browser_fetcher.py`：`_BROWSER_FETCH_CONFIGS` 增 `xiaohongshu`（`use_resolved_url` 模式：直接导航解析后的分享 URL 以保留 xsec_token；监听 `api/sns/web/v1/feed` 响应；从 `note_card.video.media.stream` 各编码分档按分辨率优先取 `master_url`；API 未捕获时回退读水合后 `window.__INITIAL_STATE__`）。

**前端（apps/desktop/src/）**
- `views/Collection.vue`：
  - `extractUrlFromShareText` 改用 CJK 排除字符类正则（借鉴 Evil0ctal Apache-2.0 方案：汉字/CJK 标点/全角/emoji 天然终止 URL 匹配）+ 尾部标点清理表；`VIDEO_PLATFORM_HOST_PATTERNS` 补 baijiahao.baidu.com/mbd.baidu.com。
  - `isVideoPlatformUrl` 扩六平台：域名级（douyin/iesdouyin/xiaohongshu/xhslink/b23.tv/channels.weixin.qq.com）+ 路径级（bilibili.com `/video/`、zhihu.com `/zvideo/`、baijiahao.baidu.com `/s`、mbd.baidu.com）。
  - 视频通道错误处理新增「无视频回退」：百家号文章无视频（`VIDEOCLONE_NO_VIDEO`）→ 提示后落回图文采集链路（stealth → aggregation → url-collector），不中断。
  - `PLATFORM_KEYS`/`platformLabel` 扩 bilibili/zhihu/channels/baijiahao。
- `locales/zh.js` + `en.js` 成对：新增 4 个平台标签、视频号不支持文案、无视频回退提示；`video_invalid_platform` 文案补六平台。

## Impact

- **运行时代码**：`packages/python-backend/src/multi_publish/aggregation/{video_service.py, browser_fetcher.py, baijiahao_fetcher.py(新)}`、`apps/desktop/src/views/Collection.vue`、`apps/desktop/src/locales/{zh,en}.js`。
- **测试**：`packages/python-backend/tests/{test_baijiahao_fetcher.py(新), test_aggregation_video.py, test_browser_fetcher.py}`、`apps/desktop/src/views/Collection.test.js`。
- **不改**：yt-dlp 管线四阶段语义、ASR 引擎抽象、CollectResult 模型、图文采集链路、知乎收藏夹功能、批量采集。
- **文档**：CHANGELOG、`.quality-gates.md` 执行记录；调研报告 `01-docs/RESEARCH-VIDEO-COLLECT-OPEN-SOURCE-2026-09-29.md` 已落盘（main）。
- **风险**：中——新增两条采集通道（纯 HTTP + 浏览器配置），均有单测锁定；小红书浏览器通道基于社区验证的 API 结构（MediaCrawler/xhs/yt-dlp 三方一致的 `video.media.stream[].master_url` 字段路径），真实分享链冒烟需用户侧配合（xsec_token 时效性）；视频号如实报不支持（调研结论：登录墙+加密流+解密库已下架，无公开可行方案）。

## Out of Scope

- 视频号实际采集（需微信登录态+视频流解密，开源解密库已下架；远期可评估 res-downloader 式本地代理作为独立功能）。
- 好看视频（haokan.baidu.com）专链适配（纯视频百家号链接 302 目标，页面结构未取证）。
- 知乎回答/专栏内嵌视频（lens API 扩展路径，当前目标场景为 zvideo 视频链接，yt-dlp 已覆盖）。
- B站番剧/课程/收藏夹等非 `/video/` 路径。
- 批量采集（URL 列表）的视频通道接入。
- 小红书纯 HTTP 快速通道（xhshow 签名库方案，作为 P2 备选）。
