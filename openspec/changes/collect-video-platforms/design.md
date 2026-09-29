# Design: collect-video-platforms

## 上下文

调研报告（`01-docs/RESEARCH-VIDEO-COLLECT-OPEN-SOURCE-2026-09-29.md`）确定各平台通道选型：

| 平台 | 主通道 | 依据 |
|------|--------|------|
| 抖音 | yt-dlp → Playwright 降级（已有） | 实测 Fresh cookies → ANTI_BOT → 降级链路已验证 |
| B站 | yt-dlp（含 b23.tv generic 重定向） | 本机实测元数据+下载全通 |
| 知乎 zvideo | yt-dlp（公开 API 免登录） | 本机实测元数据+下载+提音频全通 |
| 百家号 | **纯 HTTP 解析页面内嵌 JSON（新）** | 实测 `window.jsonData` mthvideo sections 含 mp4 直链，免登录免签名 |
| 小红书 | yt-dlp → **Playwright 降级（新增配置）** | 实测匿名直连 SSR 空；社区验证监听 feed API 是正路 |
| 视频号 | **明确报不支持** | 登录墙+加密流+解密库下架，无公开可行方案 |

## 方案对比

### 决策 1：百家号采集通道放哪里

- 方案 A（选定）：新增 `baijiahao_fetcher.py` 独立模块，`video_service._probe_and_download` 按 platform 分派。纯 HTTP、零新依赖、与 browser_fetcher 平级。
- 方案 B：塞进 `browser_fetcher._BROWSER_FETCH_CONFIGS`。否决——百家号不需要浏览器，配置驱动模型也不适配「解析 HTML 内嵌 JSON」这种自定义逻辑。

### 决策 2：百家号「文章无视频」的处理

- 方案 A（选定）：后端返回专属错误码 `VIDEOCLONE_NO_VIDEO`，前端视频通道错误分支检测到该码 → 提示「已按图文采集」→ 落回既有图文链路（stealth → aggregation → url-collector）。
- 方案 B：后端直接在视频通道里做图文采集。否决——违反单一职责（视频管线不含 trafilatura/stealth），且图文链路在 Node 侧（urlCollectFetch），Python 侧重复实现等于第二份图文采集。
- 方案 C：前端不路由百家号到视频通道（维持纯图文）。否决——目标明确要求百家号视频链接可采集。

### 决策 3：分享文本 URL 提取正则

- 方案 A（选定）：CJK 排除字符类（借鉴 Evil0ctal/Douyin_TikTok_Download_API `src/dtk/urls/patterns.py`，Apache-2.0）：`[^\s<>"'`\\\u2018\u2019\u201c\u201d\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef\u{1f000}-\u{1faff}]+`——汉字/CJK 标点/全角/emoji 天然终止匹配，从机制上解决粘连。
- 方案 B：维持 `\s` 截断 + 更长的尾部标点清理。否决——只治标，「URL+汉字」粘连仍会吞字符（实测复现）。

### 决策 4：知乎/百家号的路径级路由

- 方案 A（选定）：`isVideoPlatformUrl` 分两级——域名级（douyin/xhs/b23.tv/channels 等整站视频域）+ 路径级（`bilibili.com/video/`、`zhihu.com/zvideo/`、`baijiahao.baidu.com/s`）。知乎问题/专栏、B站空间页继续走图文链路，不破坏既有采集。
- 方案 B：域名级全量路由（现有 spec Requirement 文本的字面语义）。否决——知乎专栏/问题链接是常见图文采集目标（页面还有知乎收藏夹功能），全量路由会让它们死于视频通道；现有 spec 的 Requirement 文本与 Scenario「知乎链接走图文链路」自相矛盾，本变更以 Scenario 语义为准并修正 Requirement 文本。

### 决策 5：小红书浏览器通道如何保留 xsec_token

- 方案 A（选定）：配置加 `use_resolved_url` 标志——`fetch_video_via_browser` 对该平台直接导航 `resolve_short_link` 解析后的原始 URL（含 xsec_token 查询参数），不从 video_id 重建页面 URL；响应解析走 `note_card.video.media.stream` 自定义提取（分辨率优先取 master_url）；feed API 未捕获时回退 `page.evaluate` 读水合后的 `__INITIAL_STATE__`。
- 方案 B：从分享 URL 提取 xsec_token 塞进重建的 page_url 模板。否决——模板拼接参数易漏（xsec_source 等伴生参数），直接用原始 URL 最保真。

## 数据流

```
用户粘贴分享文本
  → extractUrlFromShareText（CJK 排除正则提取真实 URL，回填输入框）
  → isVideoPlatformUrl（六平台域名级 + 路径级路由）
  → aggregation:collect-video IPC（600s）
      → detect_platform（六平台白名单，含 baijiahao/mbd）
      → channels → VIDEOCLONE_CHANNELS_UNSUPPORTED（明确报不支持）
      → baijiahao → baijiahao_fetcher（纯 HTTP：jsonData/video 标签 → mp4 直链）
          → 无视频 → VIDEOCLONE_NO_VIDEO → 前端回退图文链路
      → 其余 → yt-dlp 探测/下载
          → ANTI_BOT（Fresh cookies/No video formats found/412）→ browser_fetcher 降级
              → douyin：已有配置
              → xiaohongshu：新增配置（use_resolved_url + feed API 监听 + stream 提取）
      → ffmpeg 提音频 → ASR 转写 → CollectResult(platform=...)
  → 前端卡片显示平台标签（六平台）+ 时长 + 转写文案
```

## 测试策略

- **后端单测**（pytest，mock 网络）：detect_platform 新域名；channels 前置报错；baijiahao 通道（jsonData 解析/video 标签兜底/无视频/haokan 重定向）；classify_download_error 新 ANTI_BOT 条目；xiaohongshu 配置（ID 提取/feed 响应 stream 提取/INITIAL_STATE 回退）。
- **前端单测**（vitest）：extractUrlFromShareText 粘连用例（用户目标原文 + URL+中文无空格 + 百家号分享文本）；isVideoPlatformUrl 六平台矩阵（含知乎问题页负向）；collectUrl 路由断言（B站/知乎 zvideo 走视频通道、知乎问题走图文）；NO_VIDEO 回退图文链路；collectAndRewrite 同口径。
- **真实链路验证**：抖音（用户目标原文链接）、B站、知乎 zvideo、百家号文章（含视频）已在本机实测通过（见调研报告 §6）；小红书需真实新鲜分享链（xsec_token 时效性），实现后以社区一致的字段路径 + mock 测试锁定，冒烟留待用户侧。
