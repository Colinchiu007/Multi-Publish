# Tasks: collect-video-platforms

## 1. 后端：百家号纯 HTTP 通道（TDD 先红后绿）

- [x] 1.1 新增 `packages/python-backend/tests/test_baijiahao_fetcher.py`：jsonData mthvideo 解析（标题/https 直链/时长 "01:40"→100s）、`<video src>` 兜底、纯文字文章 → no_video 错误、haokan.baidu.com 重定向 → 专属错误、请求异常分类
- [x] 1.2 实现 `packages/python-backend/src/multi_publish/aggregation/baijiahao_fetcher.py`（fetch_baijiahao_video + BaijiahaoFetchError）
- [x] 1.3 `test_aggregation_video.py` 扩展：detect_platform 认 baijiahao.baidu.com/mbd.baidu.com；collect_video 对百家号 URL 走 baijiahao 通道（mock fetcher，断言不经 yt-dlp）；无视频 → VIDEOCLONE_NO_VIDEO
- [x] 1.4 `video_service.py`：PLATFORM_DOMAINS 增百家号；`_probe_and_download` 分派 baijiahao 通道；不支持平台文案补百家号

## 2. 后端：视频号明确报错 + 错误分类补齐

- [x] 2.1 `test_aggregation_video.py` 扩展：channels.weixin.qq.com 链接 → VIDEOCLONE_CHANNELS_UNSUPPORTED（明确中文提示，不进 yt-dlp）；classify_download_error 认 "No video formats found"（小红书）与 412/-352（B站）为 ANTI_BOT
- [x] 2.2 `video_service.py`：collect_video 前置 channels 检查；classify_download_error 补条目

## 3. 后端：小红书浏览器降级配置

- [x] 3.1 `test_browser_fetcher.py` 扩展：xiaohongshu 配置存在性锁（use_resolved_url + api_pattern + id_patterns）；feed 响应 stream 提取（多编码分档按分辨率优先取 master_url + 时长 ms→s）；INITIAL_STATE 回退提取；无视频流 → fetch_failed
- [x] 3.2 `browser_fetcher.py`：`_BROWSER_FETCH_CONFIGS` 增 xiaohongshu；`fetch_video_via_browser` 支持 use_resolved_url 导航；响应解析分派（douyin 路径式 / xiaohongshu stream 式）；页面回退读 `__INITIAL_STATE__`

## 4. 前端：分享文本解析 + 六平台路由（TDD 先红后绿）

- [x] 4.1 `Collection.test.js` 扩展：extractUrlFromShareText——URL+中文无空格粘连不吞中文、用户目标原文（抖音）、百家号分享文本、多链接优先视频平台、尾部标点清理
- [x] 4.2 `Collection.vue`：SHARE_TEXT_URL_RE 改 CJK 排除字符类（u flag）+ 尾部清理表；VIDEO_PLATFORM_HOST_PATTERNS 补百家号域名
- [x] 4.3 `Collection.test.js` 扩展：isVideoPlatformUrl 六平台矩阵（bilibili.com/video/ ✅、b23.tv ✅、zhihu.com/zvideo/ ✅、zhihu.com/question/ ❌、baijiahao.baidu.com/s ✅、channels.weixin.qq.com ✅、example.com ❌）
- [x] 4.4 `Collection.vue`：isVideoPlatformUrl 域名级 + 路径级两级路由
- [x] 4.5 `Collection.test.js` 扩展：collectUrl——B站/zvideo/百家号链接走 aggregationCollectVideo；知乎问题链接不走视频通道（回归保护）；百家号 NO_VIDEO → 回退 stealth 图文链路（不中断）；视频号链接 → 显示不支持错误
- [x] 4.6 `Collection.vue`：视频通道错误分支增 NO_VIDEO 回退逻辑（collectUrl + collectAndRewrite 两处）

## 5. 前端：平台标签与 i18n

- [x] 5.1 `zh.js` + `en.js` 成对：platformBilibili/platformZhihu/platformChannels/platformBaijiahao、video_channels_unsupported/video_no_video/fallbackToArticle；video_invalid_platform 文案补六平台
- [x] 5.2 `Collection.vue`：PLATFORM_KEYS/platformLabel 扩六平台
- [x] 5.3 locale 同步门禁：`node .github/scripts/check-locale-sync.js --pair-base origin/main`（PASS）+ `--cjk`（PASS）

## 6. 验证与收口

- [x] 6.1 后端全量：`python -m pytest tests/test_baijiahao_fetcher.py tests/test_browser_fetcher.py tests/test_aggregation_video.py -q` → 75 通过；9 失败与未改动 main 完全一致（本机缺 faster_whisper/huggingface_hub 可选依赖的预存环境问题，CI 有依赖覆盖）
- [x] 6.2 前端相关：`pnpm exec vitest run src/views/Collection.test.js src/utils/collect-error.test.js` → 151 全绿；`Collection.viral-contract.test.js` 3 绿
- [x] 6.3 真实链路冒烟（worktree 代码直跑，5/5 PASS）：百家号纯 HTTP 全链路（解析+下载 6.0MB mp4+时长 100s）、视频号明确报错、B站/知乎 yt-dlp 探测、抖音 Fresh cookies→ANTI_BOT 分类；前端新正则对用户目标原文/粘连/小红书/B站/百家号分享文本全部正确提取
- [ ] 6.4 CHANGELOG 收口 + `.quality-gates.md` 执行记录（**合并后回填单篇做**——代码 PR 不带置顶文档改动，避免 DIRTY CI 乒乓，先例见 CHANGELOG「topdoc-backfill-2589」条目）
- [ ] 6.5 提交（worktree 分支 collect-video-platforms）→ push → PR → CI 绿 → 合并

## 遗留说明

- **小红书真实分享链冒烟**：xsec_token 具时效性，本机无新鲜分享链；实现按 MediaCrawler/xhs/yt-dlp 三方一致的 `video.media.stream[].master_url` 字段路径锁定（mock 测试 6 例），真实链冒烟待用户侧配合（粘贴新鲜分享文本触发一次即可验证）。
- **视频号**：调研结论为不可行（登录墙+视频流加密+解密开源库已下架），本变更如实报「需要微信登录态，暂不支持」；远期可评估 res-downloader 式本地代理作为独立功能。
- **好看视频（haokan.baidu.com）**：纯视频百家号链接的 302 落地页，页面结构未取证，如实报专属错误提示更换链接。
