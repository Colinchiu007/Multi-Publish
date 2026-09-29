## MODIFIED Requirements

### Requirement: 视频链接识别与路由

采集页 SHALL 在用户触发采集时识别 URL 并路由：域名级匹配抖音（douyin.com 及子域、iesdouyin.com、v.douyin.com 短链）、小红书（xiaohongshu.com 及子域、xhslink.com 短链）、B站短链（b23.tv）、视频号（channels.weixin.qq.com）的链接 SHALL 路由到视频采集通道；路径级匹配 B站视频页（bilibili.com 及子域的 `/video/` 路径）、知乎视频页（zhihu.com 及子域的 `/zvideo/` 路径）、百家号文章页（baijiahao.baidu.com 的 `/s` 路径、mbd.baidu.com）的链接 SHALL 路由到视频采集通道；其余链接（含知乎问题/专栏、B站非视频页、微信公众号、普通网页）SHALL 走现有图文采集通道。路由失败时 SHALL 回退到现有图文采集降级链路（aggregation → url-collector），不得静默丢弃。

用户粘贴平台分享混合文本（文案+emoji+短链+引导语）时，前端 SHALL 先提取真实 http(s) 链接再路由；URL 提取正则 SHALL 以 CJK 排除字符类截断（汉字、CJK 标点、全角形式、emoji 天然终止匹配），保证「URL 与中文无空格粘连」时不把中文吞进 URL；提取不到链接时提示「未在输入内容中找到有效链接」且不发起采集。

百家号文章链接经视频通道判定不含视频（VIDEOCLONE_NO_VIDEO）时，前端 SHALL 提示后落回图文采集链路继续采集，不得直接报错中断。

#### Scenario: 抖音视频链接路由
- **WHEN** 用户在 URL 输入框粘贴 https://v.douyin.com/xxxx/ 短链并点击采集
- **THEN** 前端调用视频采集通道（collect-video），不调用图文 collect 通道

#### Scenario: 小红书链接路由
- **WHEN** 用户粘贴 https://www.xiaohongshu.com/explore/xxxx 或 https://xhslink.com/xxxx 链接
- **THEN** 前端调用视频采集通道

#### Scenario: B站视频链接路由
- **WHEN** 用户粘贴 https://www.bilibili.com/video/BVxxxx 或 https://b23.tv/xxxx 链接
- **THEN** 前端调用视频采集通道

#### Scenario: 知乎视频链接路由
- **WHEN** 用户粘贴 https://www.zhihu.com/zvideo/xxxx 链接
- **THEN** 前端调用视频采集通道

#### Scenario: 知乎图文链接不受影响
- **WHEN** 用户粘贴 https://www.zhihu.com/question/xxxx 或 https://zhuanlan.zhihu.com/p/xxxx 链接
- **THEN** 走现有图文采集链路（stealth 通道），行为与变更前一致

#### Scenario: 百家号文章链接路由与回退
- **WHEN** 用户粘贴 https://baijiahao.baidu.com/s?id=xxxx 链接
- **THEN** 前端调用视频采集通道；若该文章不含视频（VIDEOCLONE_NO_VIDEO），提示「已按图文采集」并落回图文采集链路

#### Scenario: 视频号链接明确报错
- **WHEN** 用户粘贴 https://channels.weixin.qq.com/... 链接并采集
- **THEN** 返回明确中文提示「视频号视频需要微信登录态，暂不支持自动采集」，不进入下载管线

#### Scenario: 非目标平台链接不受影响
- **WHEN** 用户粘贴微信公众号/普通网页链接
- **THEN** 走现有图文采集链路，行为与变更前完全一致

#### Scenario: 分享混合文本解析（URL 与中文粘连）
- **WHEN** 用户粘贴「0.02 P@x.FH ... https://v.douyin.com/vknKdeN_naU/ 复制此链接...」或「https://v.douyin.com/abc/复制此链接打开抖音」（URL 后无空格直接跟中文）
- **THEN** 前端提取的 URL 不含任何中文字符，回填输入框后走视频采集通道

#### Scenario: 分享文本无链接
- **WHEN** 用户粘贴不含任何 http(s) 链接的纯文本
- **THEN** 提示「未在输入内容中找到有效链接」，不发起任何采集请求

### Requirement: 视频采集管线

视频采集通道 SHALL 按顺序执行四个阶段：① 元数据探测（yt-dlp --dump-json，获取标题/时长/平台/作者/封面，不下载文件；探测期时长超 10 分钟直接拒绝）；② 视频下载（yt-dlp，上限 500MB / 30 分钟；yt-dlp 被 ANTI_BOT 类错误拦截时自动降级浏览器通道）；③ 音频提取（ffmpeg 转 16kHz 单声道 WAV）；④ ASR 转写（引擎抽象层）。每阶段失败 SHALL 返回该阶段专属错误信息，不得继续后续阶段。

百家号平台 SHALL 不经 yt-dlp，直接走纯 HTTP 通道：GET 文章页（桌面 UA）→ 解析页面内嵌 `window.jsonData` 的 mthvideo sections 取 mp4 直链（兜底 `<video>` 标签正则）→ 下载。文章不含视频时 SHALL 返回 VIDEOCLONE_NO_VIDEO；链接重定向到好看视频（haokan.baidu.com）时 SHALL 返回专属中文提示。

视频号（channels.weixin.qq.com）链接 SHALL 在进入下载管线前返回 VIDEOCLONE_CHANNELS_UNSUPPORTED 与明确中文提示（需微信登录态，暂不支持自动采集）。

浏览器降级通道（browser_fetcher）SHALL：解析短链 302 Location → Playwright 桌面 Chrome 访问视频页 → 监听平台 detail API 响应提取播放地址 → 带 Referer 下载。降级仅对 ANTI_BOT 类错误触发（Fresh cookies/风控/验证码/小红书 "No video formats found"/B站 412 风控）；私密/会员/地区限制/已删除类错误不降级。浏览器通道也失败时 SHALL 返回「该链接需要平台登录态，自动采集暂不可用」。

小红书浏览器降级 SHALL 直接导航短链解析后的原始 URL（保留 xsec_token 查询参数，不从视频 ID 重建页面地址），监听 `api/sns/web/v1/feed` 响应并从 `note_card.video.media.stream` 各编码分档按分辨率优先提取 master_url；API 响应未捕获时 SHALL 回退读取页面水合后的 `window.__INITIAL_STATE__` 提取同一字段路径。

#### Scenario: 全链路成功
- **WHEN** 输入可公开访问的抖音视频链接且各阶段成功
- **THEN** 返回 CollectResult，media_type=video，content 为转写文案全文，transcript 字段同 content，duration 为视频秒数，metadata 含 platform/asr_engine/segments

#### Scenario: 百家号含视频文章采集
- **WHEN** 输入含内嵌视频的百家号文章链接（如 baijiahao.baidu.com/s?id=xxx）
- **THEN** 经纯 HTTP 通道解析 jsonData/video 标签取 mp4 直链下载，返回 CollectResult 且 metadata.platform=baijiahao、fetch_channel=baijiahao-http

#### Scenario: 百家号纯文字文章
- **WHEN** 输入不含视频的百家号文章链接
- **THEN** 返回 VIDEOCLONE_NO_VIDEO，前端提示后落回图文采集链路

#### Scenario: 元数据探测失败
- **WHEN** yt-dlp --dump-json 因反爬/链接失效返回错误
- **THEN** 返回错误码 VIDEOCLONE_LINK_ANTI_BOT 或 VIDEOCLONE_LINK_UNAVAILABLE 对应的中文提示，不执行下载

#### Scenario: 小红书匿名直连失败自动降级
- **WHEN** yt-dlp 对小红书链接报 "No video formats found"（匿名直连拿不到笔记数据）
- **THEN** 错误归类为 ANTI_BOT，自动降级浏览器通道（导航原始分享 URL 监听 feed API）

#### Scenario: 视频超限
- **WHEN** 探测到的视频时长 > 30 分钟或下载文件 > 500MB
- **THEN** 返回 VIDEOCLONE_FILE_TOO_LARGE 语义的中文提示（含实际时长/大小），不执行音频提取

#### Scenario: 视频无音轨
- **WHEN** 下载的视频经检测无音频流
- **THEN** 返回错误码 -8 与提示「该视频无音轨，无法进行语音转写」

#### Scenario: 临时文件清理
- **WHEN** 管线完成（无论成功或失败）
- **THEN** 下载的视频与提取的音频临时文件 SHALL 被清理，不在用户磁盘残留

### Requirement: 采集页视频结果显示

采集结果卡片 SHALL 按 media_type 区分显示：article 显示 📄 徽标与字数；video 显示 🎬 徽标、时长（mm:ss 格式）与来源平台标签。平台标签 SHALL 覆盖六平台：抖音、小红书、哔哩哔哩、知乎、视频号、百家号。视频采集详情区 SHALL 显示完整转写文案并标注「🎬 视频口播文案」。转写进行中 SHALL 显示分阶段进度提示（探测元数据 → 下载视频 → 提取音频 → 语音转写）。

#### Scenario: 视频卡片渲染
- **WHEN** 采集列表中存在 media_type=video 的条目
- **THEN** 卡片显示 🎬 徽标、时长（如 3:25）与平台标签（六平台之一），内容预览为转写文案前 120 字

#### Scenario: 分阶段进度显示
- **WHEN** 视频采集任务处于下载或转写阶段
- **THEN** 采集按钮区显示当前阶段中文提示（如「⬇️ 正在下载视频...」「🎙️ 正在语音转写...」），采集按钮保持禁用

#### Scenario: 错误提示
- **WHEN** 视频采集失败（反爬/超限/无音轨/引擎不可用/平台不支持）
- **THEN** 错误区显示对应中文提示，可重试错误（网络类）显示重试按钮
