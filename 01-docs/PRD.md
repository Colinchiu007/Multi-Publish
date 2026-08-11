# PROJECT-003：多平台一键发布 — PRD

> **立项日期**: 2026-06-03
> **最后更新**: 2026-07-28
> **当前版本**: v2.3.53 (2026-07-28) | **上一版本**: v2.3.42 (2026-07-09)
> **产品定位**: 为内容生产者提供"采集 → 改写 → 发布"全流程闭环的一键发布桌面工具
> **目标用户**: 自媒体运营者、MCN 机构、企业内容团队
> **技术架构**: Electron 33 + Vue 3 + Python FastAPI + RpaViewManager RPA（Monorepo）
> **需求确认**: ✅ CEO 已签字（见 [REQUIREMENTS-SIGNOFF.md](./REQUIREMENTS-SIGNOFF.md)）
> **市场调研**: [MARKET-RESEARCH.md](./MARKET-RESEARCH.md) | **设计评审**: [DESIGN-REVIEW.md](./DESIGN-REVIEW.md)

---

## 一、产品概述

### 1.1 核心价值

内容生产者每天需要在多个平台发布相同或相似的内容。手动操作耗时、易出错、格式不统一。PROJECT-003 提供：

1. **统一入口**：一个桌面应用管理所有平台的发布
2. **自动适配**：通过 RPA 自动化填表发布，适配各平台 UI
3. **异步队列**：后台批量发布，实时追踪状态
4. **Cookie 管理**：安全存储各平台登录凭证
5. **定时发布**：设定时间自动发布
6. **平台分类**：短视频/图文/混合三类，发布策略自动适配
7. **单 RPA 引擎**：RpaViewManager（Electron 原生 executeJavaScript）统一引擎

### 1.2 产品边界

| 范围 | 说明 |
|------|------|
||| ✅ 微信公众号 | RPA 发布，支持草稿编辑 → 群发 |
||| ✅ 知乎 | RPA 文章发布 + 话题标签 |
||| ✅ 微博 | RPA 图文发布 |
||| ✅ 抖音 | RPA 图文/视频发布 |
||| ✅ 小红书 | RPA 标题+正文+标签 |
||| ✅ 视频号 | RPA 视频/图文发布 |
||| ✅ 快手 | RPA 视频/图文发布 |
||| ✅ 今日头条 | RPA 图文/视频发布 |
||| ✅ YouTube | RPA 视频发布 |
||| ✅ TikTok | RPA 视频发布 |
||| ✅ Twitter/X | RPA 图文发布 |
||| ✅ B站 | API+RPA 双模式，专栏/视频发布 |
||| ✅ Instagram | RPA 图片/视频/Reels 发布 |
||| ✅ Facebook | RPA 图文/视频/链接发布 |
||| ✅ 包含 | AI 视频/图像/音频创作（OpenMontage 集成）、Pipeline 管线编排、Remotion 渲染 |
||| ✅ 不包含 | 掘金、CSDN（由 PROJECT-002 负责）、内容聚合改写（由 PROJECT-001 负责） |
---

## 二、平台策略

### 2.1 平台支持矩阵

| 平台 | 优先级 | 技术路线 | 状态 |
|------|--------|----------|------|
| **微信公众号** | P0 | RPA | ✅ v1.0.0 |
| **抖音** | P0 | API + RPA 双模式（API 优先，RPA 降级） | ✅ v1.2.0 |
| **知乎** | P1 | RPA | ✅ v1.0.0 |
| **微博** | P2 | RPA | ✅ v1.0.0 |
| **B站** | P1 | RPA + API | ✅ v2.0.0 |
| **小红书** | P1 | RPA | ✅ v2.0.0 |
| **抖音** | P2 | RPA | ✅ v1.0.0 |
| **小红书** | P4 | RPA | ✅ v1.0.0 |
| **视频号** | P1 | RPA | ✅ v1.0.2 |
| **快手** | P1 | RPA | ✅ v1.0.2 |
| **今日头条** | P1 | RPA | ✅ v1.0.3 |
| **YouTube** | P1 | RPA | ✅ v1.0.3 |
| **TikTok** | P1 | RPA | ✅ v1.0.3 |
| **Twitter/X** | P2 | RPA | ✅ v1.3.0 |
| **B站** | P1 | API+RPA 双模式 | ✅ v1.0.13 |
| **Instagram** | P2 | RPA | ✅ v1.3.0 |
| **Facebook** | P2 | RPA | ✅ v1.3.0 |
| **百家号** | P1 | RPA | ✅ v1.1.0 |

### 2.2 技术路线

所有平台支持 **RpaViewManager**（Electron 原生 executeJavaScript）模拟浏览器操作，通过 Cookie 保持登录状态。
所有平台统一使用 **RpaViewManager**（隐藏 BrowserWindow + executeJavaScript），无需独立浏览器进程。
Electron 主进程直接管理 RPA 引擎和任务队列，Python 后端仅供 API 模式使用。

**统一发布路由：**
1. **RpaViewManager executeJavaScript RPA** — 所有平台（隐藏 BrowserWindow + CDP 文件上传）
2. **Python 后端 API** — 预留，B 站 API 模式

**三种认证模式：**
1. **内嵌 WebContentsView 登录** — 弹出式内嵌浏览器（AuthViewManager）
2. **隐藏 BrowserWindow 静默验证** — 后台恢复 Cookie 检测登录态（loginSilent）
3. **扫码登录** — 二维码自动检测（QrCodeLogin）

### 2.3 用户认证与账号管理 (User Auth & Account Management)

用户认证系统管理所有平台的登录凭证，支持 Cookie/Token/OAuth 三种认证模式。

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| Platform Binding | Cookie/Token/OAuth account binding | P0 | Done |
| Secure Storage | AES-256-GCM encrypted store | P0 | Done |
| OAuth 2.0 | YouTube/TikTok OAuth flow | P2 | Done |
| QR Login | Auto-detect + scan to login | P2 | Done |
| Multi-account | Multiple accounts per platform | P1 | Done |
| Expiry Monitor | Auto-detect cookie expiration | P1 | Done |
| Re-login | One-click re-login flow | P1 | Done |

---

## 三、功能需求

### 3.1 核心功能

#### F1：平台账号管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 添加平台 | 选择平台类型，打开浏览器窗口完成登录 | ✅ |
| Cookie 加密 | 所有 Cookie AES-256-GCM 加密存储 | ✅ |
| 登录状态检测 | 每 30 分钟定期检测 Cookie 是否过期（login-status-monitor，v2.3.43），支持一键重新登录 | ✅ v2.3.43 |
| 多账号支持 | **同平台管理多个账号**，侧栏下拉切换，发布时选账号 | ✅ |
| 默认账号 | 每个平台可设默认账号，发布时自动使用 | ✅ |
| 扫码登录 | 微信生态平台二维码自动检测+扫码登录（img/canvas 策略） | ✅ |
| OAuth 2.0 认证 | YouTube/TikTok/微博/抖音 API Token 授权 | ✅ |
| 内嵌浏览器登录 | WebContentsView 内嵌登录，无需弹出独立窗口 | ✅ |

#### F2：内容发布

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 单篇发布 | 手动输入标题 + 内容 → 选择平台 + 账号 → 发布 | ✅ |
| 批量发布 | 选择多平台 → 一次点击全部发布 | ✅ |
| **多账号同时发** | **同平台选多个账号，一次发到所有账号** | ✅ |
| 定时发布 | 设置发布时间 → 后台定时任务执行（持久化，重启恢复） | ✅ |
| 富文本编辑器 | Quill 编辑器，支持格式、图片、排版 | ✅ |
| 批量编辑模式 | 多篇文章同时编辑，每篇独立选平台+定时 | ✅ |
| 批量复制 | 复制已有文章作为模板 | ✅ |

#### F3：发布任务管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 任务队列 | 并发3任务执行 + 自动重试（可配置） | ✅ |
| 任务中断恢复 | 进程崩溃后恢复未完成队列（JSON 持久化） | ✅ |
| 任务取消 | 取消等待中或执行中的任务 | ✅ |
| 实时进度 | IPC 推送发布进度（当前阶段/结果/错误） | ✅ |
| 结果通知 | 成功/失败通知 + 托盘闪烁告警 | ✅ |
| 重试机制 | 失败自动重试，通知重试进度 | ✅ |

#### F4：分屏监控

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 多分屏布局 | 2/3/4/6 分屏实时监控多平台 | ✅ |
| 独立 Session | 每个 tab 独立 Cookie/Session 隔离 | ✅ |
| 实时回调 | HTTP POST 回调服务器（可配置端口，默认 :16521），59s 心跳（低于 60s 避免负载均衡断开） | ✅ |
| 评论/数据监控 | 回调记录自动写入 SQLite，前端实时展示 | ✅ |

#### F5：内容采集

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 剪贴板导入 | 从剪贴板粘贴内容，自动提取标题+正文 | ✅ |
| URL 内容采集 | 输入链接自动提取 og:title/description/image | ✅ |
| 浏览器渲染采集 | HTTP 采集（P2-E 已移除 Playwright 降级） | ✅ |
| 草稿箱 | 保存/编辑/删除草稿，一键跳转到发布页 | ✅ |

#### F6：发布历史与统计

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 历史记录 | SQLite 持久化发布历史 | ✅ |
| 统计看板 | 总发布数、各平台分布、成功率、趋势图 | ✅ |
| 历史筛选 | 按平台/时间/状态筛选 | ✅ |
| 发布后监控 | 发布完成后自动轮询平台审核状态 | ✅ |

#### F6：视频创作（v2.0.0 — OpenMontage 集成）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| AI 视频生成 | 15+ 提供商：Hunyuan/Kling/Runway/VEO/WAN/CogVideo/MiniMax/Grok/HeyGen 等 | ✅ Phase 1-3 |
| AI 图像生成 | 14 提供商：Flux/DALL-E/Grok/Imagen/Recraft/Pixabay/Pexels/本地扩散 | ✅ Phase 1-3 |
| 语音合成 TTS | 5 提供商：ElevenLabs/OpenAI/豆包/Google/Piper（原 PRD 称 7 个，实际实现 5 个） | ✅ Phase 1-3（5/7） |
| 音乐生成 | 5 种：Suno/Pixabay/Freesound/音乐库/生成器 | ✅ Phase 1-3 |
| 视频分析 | 场景检测/人脸跟踪/帧采样/转写/视频理解 | ✅ Phase 4 |
| 绿幕合成/增强 | 绿幕处理/字幕生成/屏幕录制/人脸修复 | ✅ Phase 5 |
| Pipeline 编排 | 13 种视频制作管线（解释/电影/口播/数字人等） | ✅ Phase 6+7 |
| Remotion 渲染 | 13 种 Composition，Electron 后端渲染 | ✅ v1.0.0 |
| 图片提示词统一优化 | 所有图片提示词统一经 prompt-engine（8013）完成风格检测 → 改写 → 输出校验；Story2Video optimize 阶段不再直连默认 LLM（详见 PRD-video-creation §3.1.2.1） | ✅ 2026-08-09 |
| 视频创作历史本地模式 | 未登录可查看本机创作历史（本地只读 IPC 通道放行 + owner 隔离回退 __legacy__ + 本地模式提示条 + 失败原因可操作建议；详见 PRD-video-creation §3.1.4.1） | ✅ 2026-08-09 |
| Agnes 视频生成适配 | agnes-video-v2.0：提交 POST /v1/videos；状态查询 GET /agnesapi（域名根，非 /v1/agnesapi，2026-08-10 修复）；callAdapter 以 { videoId, taskId } 对象调用 getVideoStatus；流水线 merge 兼容 generate/merge/animate 上下文键（PR #476） | ✅ 2026-08-10 |
| videogen 生成选项生效 | animation/character-animation/avatar-spokesperson/hybrid 的生成参数（numFrames/frameRate/width/height + storyboard duration）经 stageOptions 真实作用于最终合成视频；2026-08-10 修复参数契约（num_frames 下划线丢失→双写）+ duration→帧数映射（PR 待合） | ✅ 2026-08-10 |

#### F7：数据存储（SQLite）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 账号存储 | accounts 表（含多账号、默认标记） | ✅ |
| 发布历史 | publish_history 表 | ✅ |
| 定时任务 | scheduled_tasks 表 | ✅ |
| 回调日志 | callback_logs 表 | ✅ |
| 批量任务 | batch_jobs 表 | ✅ |
| 设置存储 | settings 键值表（含队列状态持久化） | ✅ |

#### F11：内容智能（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 热点趋势 | 实时热点话题追踪与推荐 | ✅ |
| 标题助手 | AI 生成/优化标题 | ✅ |
| 标签推荐 | 智能标签生成 | ✅ |
| 爆款分析 | 分析平台爆款内容特征 | ✅ v2.3.43（orchestrator + 本地 fallback） |
| AI Writer | AI 辅助写作面板 | ✅ |
| 关键词监控 | 监控关键词在各平台的表现 | ✅ |

#### F12：多平台实时监控（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 多分屏布局 | 2/3/4/6 分屏实时监控 | ✅ |
| 独立 Session | 每个 tab 独立 Cookie/Session | ✅ |
| 实时回调 | HTTP POST 回调，59s 心跳 | ✅ |

#### F13：评论管理（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 评论聚合 | 多平台评论统一管理 | ✅ v2.3.43（webview + IPC comment:list） |
| 评论回复 | 在应用内直接回复 | ✅ v2.3.43（IPC comment:reply + 后台轮询 comment:start-polling） |

#### F14：云端发布（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 远程发布 API | HTTP API 触发发布 | ✅ |
| 任务队列 | 异步发布队列 | ✅ |

#### F15：Pro 版本（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 许可证管理 | 离线验证 + 限时试用 | ✅ |
| 功能门禁 | Pro 功能按 license 解锁 | ✅ |
| 支付集成 | 支付宝/微信支付（当前为模拟模式，真实 SDK 预留接口） | ✅ 模拟模式 |

#### F16：插件系统（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 插件 manifest | 声明式配置 | ✅ |
| 动态加载 | 运行时热加载 | ✅ |
| 生命周期钩子 | beforePublish/afterPublish + onLoad/onEnable/onDisable/onUnload | ✅ v2.3.43 |

#### F17：日历与计划（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 发布日历 | 日历视图展示计划 | ✅ |
| 内容收藏 | 草稿/模板管理 | ✅ |
| 定时调度 | setTimeout 单次定时 + 持久化队列（非 cron，重启恢复） | ✅ setTimeout 模式 |

#### F8：系统功能

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 系统托盘 | 最小化到托盘，后台运行，托盘菜单 | ✅ |
| 全局快捷键 | 6组快捷键：发布/监控/看板/采集/首页/退出 | ✅ |
| 自动更新 | 启动检测 GitHub Release，后台下载静默安装 | ✅ |
| 首次运行引导 | 自动检测 Python 依赖 | ✅ |
| 数据迁移 | JSONL → SQLite 迁移（migrateFromJsonl，v2.3.43 实现） | ✅ v2.3.43 |
| 静默登录验证 | 隐藏 BrowserWindow 后台验证 Cookie 有效性（loginSilent） | ✅ |

#### F9：平台分类（v1.2.0, v2.3.43 完整实现）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 平台分类枚举 | `PlatformCategory`：VIDEO / IMAGE_TEXT / MIXED（v2.3.43） | ✅ v2.3.43 |
| 分类映射 | 15 平台自动归类到三类（抖音/快手/视频号/B站/YouTube/TikTok=VIDEO） | ✅ v2.3.43 |
| API 透传 | `/api/platforms` + `platform:definitions` IPC 返回 content_categories 字段 | ✅ v2.3.43 |
| 前端显示 | platform store 暴露 getContentCategory / getPlatformsByContentCategory | ✅ v2.3.43 |

#### F10：Electron 原生 RPA 引擎（v1.2.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| RpaViewManager | 隐藏 BrowserWindow + executeJavaScript RPA 引擎（P2-E 统一引擎） | ✅ |
| CDP 文件上传 | `DOM.setFileInputFiles` 绕过浏览器安全限制上传文件 | ✅ |
| DOM 操作工具集 | `_waitForElement` / `_fillInput` / `_click` / `_waitForCondition` | ✅ |
| 网络响应监控 | webRequest.onCompleted 网络响应监听 | ✅ |
| Playwright → RpaViewManager 全量迁移 | 15 平台从 Playwright 统一迁移到 RpaViewManager | ✅ |
| 每账号 Session 隔离 | `session.fromPartition()` 独立 Cookie 分区 | ✅ |
| 进度事件上报 | IPC rpa:progress → 前端实时展示 | ✅ |
| CDP/JS 双文件上传 | 大文件走 CDP，CDP 失败回退 JS File API / DataTransfer（v2.3.43） | ✅ v2.3.43 |


#### F1a：内容编辑字段规范

| 字段 | 最大长度 / 格式 | 说明 |
|------|---------------|------|
| **标题** | 各平台上限不同（微信 64、抖音 55、B站 80、微博 140） | 发布时按平台自动截断，超出字符弹窗警告 |
| **正文/HTML** | 30,000 字符 | HTML 白名单：p/br/strong/em/a/img/ul/ol/li/blockquote/h2-h4；自动过滤 script/style/iframe |
| **标签** | 每平台 2-10 个，每标签 ≤30 字符 | 自动去重、按平台上限截断，无合法标签时生成默认标签 |
| **封面图** | JPEG/PNG，≤5MB，1920×1080 以内 | sharp 中心裁剪 + 质量 85% 压缩；视频号/快手需 1:1 自动补边 |
| **视频** | MP4/H.264，≤4GB（平台差异：B站 8GB，抖音 2GB） | 超过平台上限时弹窗提示，不自动压缩 |
| **多图上传** | 每篇 ≤9 张，格式同封面图 | 按平台顺序上传，失败时跳过不阻塞发布 |

**平台标题上限配置（config/platforms.yaml）：**
`yaml
platforms:
  wechat_mp: { title_max: 64, body_max: 30000, tags_max: 8, tag_length: 30, image_max: 9, video_max_mb: 1024 }
  douyin:    { title_max: 55, body_max: 2000,  tags_max: 10, tag_length: 30, image_max: 35, video_max_mb: 2048 }
  bilibili:  { title_max: 80, body_max: 20000, tags_max: 10, tag_length: 30, video_max_mb: 8192 }
  # ... 其他平台
`

**发布前校验流程：**
1. 读取目标平台配置 platforms.yaml 获取字段上限
2. 对标题/正文/标签逐项校验，超限自动截断并记录日志
3. 封面图自动压缩（sharp），视频仅检查大小不自动转换
4. 校验失败项汇总弹窗，用户确认后继续或取消

### 3.2 非功能需求

|| 需求 | 指标 | 状态 |
||------|------|------|
| 并发发布 | 3 任务并发执行（maxConcurrent=3），每 RPA Tab ~80MB 内存，3 并发 + 主进程 < 500MB | ✅ |
| 离线运行 | 安装包自带 Chromium，无需联网；自动更新网络失败静默 | ✅ |
| 任务持久化 | SQLite 持久化队列状态，崩溃自动恢复 | ✅ |
|| 数据加密 | Cookie AES-256-GCM 加密存储 | ✅ |
|| 存储引擎 | SQLite（better-sqlite3） | ✅ |
|| 跨平台 | Windows + Linux（macOS 待支持） | ✅ |
|| 代码规范 | ESLint v9 flat config + Prettier，0 errors / 0 warnings | ✅ Phase C3 |
|| 自动构建 | GitHub Actions 双平台 CI + 自动 Release | ✅ |
|| 自动更新 | electron-updater，从 GitHub Release 拉取 | ✅ |

#### 错误分类

| 分类 | 编码 | 处理策略 |
|------|------|---------|
| 认证过期 | AUTH_EXPIRED | 检测到过期 -> 弹窗重新登录 |
| 网络超时 | NETWORK_TIMEOUT | 重试 3 次(指数退避) -> 最终报错 |
| 平台拒绝 | PLATFORM_REJECT | 不重试，记录原因到 task |
| RPA 失败 | RPA_FAILED | 截图保存 -> 降级 -> 人工接管 |
| 校验失败 | VALIDATION_FAILED | 弹窗提示具体原因 |

#### 审计日志

每次发布操作记录到 SQLite audit_log 表：

| 字段 | 说明 |
|------|------|
| id(UUID), timestamp, user | 操作标识 |
| platform, account_id, action | 发布/重试/取消/删除 |
| content_hash(SHA-256), result | 成功/失败/部分 |
| error_code, duration_ms, metadata(JSON) | 错误分类/耗时/上下文 |

保留策略：本地 90 天，超期自动归档。

### 3.3 并发与资源约束 (Concurrency & Resource Constraints)

系统资源约束定义了并发发布的最大容量，确保在有限硬件资源下稳定运行。

| Resource | Limit | Notes |
|----------|-------|-------|
| Concurrent RPA tabs | Max 6 | 2/3/4/6 layout, ~400MB RAM per tab |
| Concurrent tasks | Max 3 per run | TaskQueue maxConcurrent=3 |
| Publish interval | 5 min min | Configurable per platform |
| Batch queue | No hard limit | Memory-bound, ~1MB per task |
| Electron main mem | ~200MB idle | Chromium + 25 services |
| WebSocket port | 16521 | Single instance, fallback on conflict |
| API timeout | Default 120s | Video platforms 300s |

#### Rate Limiting（频率限制）
- Per-platform: max 10 publishes/minute
- Accounts: max 3 logins/minute per platform
- API calls: respect upstream rate limits (TikHub, etc.)
- Queue: tasks wait if limit exceeded

---

## 四、技术架构

### 4.1 架构图

```
┌──────────────────────────────────────────────────┐
│              apps/desktop/electron/               │
│              Electron Shell + Vue 3 UI            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐
│  │ 发布界面   │  │ 账号管理  │  │ 统计看板  │  │ 采集/监控  │
│  └─────┬────┘  └────┬─────┘  └─────┬────┘  └──────┬────┘
│        │            │              │              │
│  ┌─────┴────────────┴──────────────┴─────┐
│  │        IPC Bridge (preload.js)        │
│  └────────────────┬──────────────────────┘
│                   │
│  ┌────────────────┼──────────────────────┐
│  │    Task Queue  │   Scheduler          │
│  │  (并发3,持久化)  │  (定时/恢复)          │
│  │  @shared-utils                        │
│  └────────────────┴──────────────────────┘
│                   │
│  ┌────────────────┴──────────────────────┐
│  │     Publisher Registry                 │
│  │   13 platforms (+B站)                  │
│  │   + API+RPA 双模式                     │
│  │   + OAuth 2.0 (YT/TT)                 │
│  └────────────────┴──────────────────────┘
│                   │
│  ┌────────────────┴──────────────────────┐
│  │     RPA Engine（统一引擎）               │
│  │                                       │
│  │  ┌─────────────────────────────┐      │
│  │  │  RpaViewManager (Electron)  │      │
│  │  │  15 platforms + B站         │      │
│  │  │  隐藏 BrowserWindow         │      │
│  │  │  + executeJavaScript        │      │
│  │  │  + CDP 文件上传              │      │
│  │  └─────────────────────────────┘      │
│  │                                       │
│  │  + WebviewManager（分屏）             │
│  │  + QrCodeLogin（扫码登录）            │
│  │  + CallbackServer（回调 :16521，config.yaml 可配）      │
│  └───────────────────────────────────────┘
│
│  ┌──────────────────────────────────────┐
│  │  SQLite (better-sqlite3)             │
│  │  ├─ accounts（含多账号）               │
│  │  ├─ publish_history                  │
│  │  ├─ scheduled_tasks                  │
│  │  ├─ batch_jobs                       │
│  │  ├─ callback_logs                    │
│  │  └─ settings（队列持久化）              │
│  └──────────────────────────────────────┘
│
│  ┌──────────────────────────────────────┐
│  │  System / UX                         │
│  │  ├─ SystemTray（托盘）                │
│  │  ├─ HotKeys（6组快捷键）               │
│  │  ├─ AutoUpdater                      │
│  │  └─ UrlCollector（URL采集）            │
│  └──────────────────────────────────────┘
└──────────────────────────────────────────────────┘
```

### 4.2 Monorepo 目录结构

```
multi-publish/
├── apps/desktop/                # Electron 桌面应用
│   ├── electron/                # Electron 主进程 + IPC
│   │   ├── main.js              # 入口：窗口管理、IPC 注册
│   │   ├── preload.js           # 预加载脚本（contextBridge）
│   │   ├── store.js             # SQLite 统一存储（better-sqlite3）
│   │   ├── webview-manager.js   # 分屏监控（P0）
│   │   ├── auth-view-manager.js # 内嵌浏览器登录（WebContentsView）
│   │   ├── rpa-view-manager.js  # executeJavaScript RPA 引擎（v1.2.0）
│   │   ├── callback-server.js   # 实时回调（P1）
│   │   ├── qrcode-login.js      # 扫码登录（P2）
│   │   ├── oauth-manager.js     # OAuth 2.0 认证
│   │   ├── batch-manager.js     # 批量发布管理器
│   │   ├── url-collector.js     # URL 内容采集
│   │   ├── hotkeys.js           # 全局快捷键
│   │   ├── system-tray.js       # 系统托盘
│   │   ├── python-bridge.js     # Python 后端子进程管理
│   │   ├── task-queue.js → packages/shared-utils
│   │   ├── scheduler.js         # 定时发布
│   │   ├── publish-history.js   # 发布记录
│   │   ├── publish-monitor.js   # 发布后状态监控
│   │   ├── account-state-restorer.js  # 账号状态恢复
│   │   ├── credential-store.js  # 凭证加密存储
│   │   ├── video-uploader.js    # 视频分片上传
│   │   ├── content-aggregator-bridge.js  # 001 集成
│   │   ├── api-platform-adapter.js  # API 模式适配器
│   │   ├── auto-updater.js      # electron-updater
│   │   └── first-run.js         # 首次运行引导
│   ├── src/                     # Vue 3 前端
│   │   ├── views/               # 页面：Home/Dashboard/Publish/Accounts/Collection/Monitor/FirstRun
│   │   ├── components/          # 组件：ArticleEditor
│   │   ├── api/                 # API 封装（publisher.js）
│   │   ├── router/              # Vue Router
│   │   ├── styles/              # Cohere 风格 CSS
│   │   └── App.vue
├── packages/
│   ├── rpa-engine/              # RPA 引擎（独立 npm 包）
│   │   ├── src/playwright-manager.js  # （已移除，P2-E）
│   │   ├── src/cookie-store.js        # Cookie 存储
│   │   ├── src/publishers/            # 平台注册（P2-E 简化）
│   │   │   └── registry.js            # 平台注册 stub（已迁移到 RpaViewManager）
│   │   └── package.json
│   ├── shared-utils/          # 共享工具库
│   │   ├── src/task-queue.js    # 任务队列（并发3+持久化）
│   │   ├── src/aggregator-bridge.js  # 001 集成
│   │   ├── src/format-adapter.js     # 格式适配器
│   │   ├── src/cover-processor.js    # 封面处理
│   │   └── package.json
│   │   ├── src/aggregator-bridge.js  # PROJECT-001 集成
│   │   └── package.json
│   └── python-backend/        # Python 后端（FastAPI）
│       ├── src/server.py        # FastAPI 入口
│       ├── src/multi_publish/   # 核心模块
│       │   ├── core/            # PublisherManager / QueryWorker / TaskScheduler
│       │   └── publishers/      # Python 发布器（插件化）
│       │       ├── platform_registry.py  # 动态注册表（JSON 驱动发现）
│       │       ├── platforms.json        # 外部配置，新增平台只需加一行
│       │       ├── base.py              # BasePublisher + async_retry
│       │       ├── douyin.py            # 抖音（API+RPA 双模式）
│       │       └── wechat_mp.py         # 微信公众号（RPA）
│       └── pyproject.toml
├── package.json               # 根 workspaces 配置
└── .github/workflows/build.yml # CI/CD
```

### 4.3 发布器接口规范

```javascript
// 发布结果接口
// interface PublishResult { success, error, partialResult, platformData, durationMs }
class BaseRpaPublisher {
  constructor() { /* 加载 Cookie, 初始化浏览器 Context */ }
  async publishArticle({ title, content, coverUrl }) {
    /* 登录态检查 → 导航到创作页 → 填写内容 → 发布 → 返回结果 */
  }
  async checkLoginStatus() { /* 打开平台检查 Cookie 是否有效 */ }
  async cleanup() { /* 关闭浏览器 Context */ }
  onProgress(callback) { /* 注册进度回调 */ }
}
// 所有平台发布器继承 BaseRpaPublisher，差异化部分覆盖
```

### 4.4 内容字段规范 (Content Field Specification)

各平台对发布内容有不同字段限制。发布器在发送前自动按目标平台规则校验并截断/转换内容。

| Field | Max Length | Format | Per-Platform Notes |
|-------|-----------|--------|-------------------|
| Title | 64 chars | Plain text, no HTML | WeChat(64), Weibo(140), Bilibili(80) |
| Content | 10000 chars | Markdown or HTML | WeChat public(20000), Weibo(10000) |
| Tags | 10 per article | Comma-separated | Douyin(10), Weibo(2), Bilibili(12) |
| Cover | 10MB max | JPG/PNG/WebP 16:9 | Douyin(9:16), WeChat(16:9) |
| Video | 500MB max | MP4/H.264 | Douyin(15min), Bilibili(4h) |

#### Content Format Rules（内容格式规则）
- HTML allowed tags: p, br, strong, em, a, img, blockquote
- Script/iframe/object tags stripped before publish
- External images auto-download and re-upload to platform CDN
- Markdown converted to per-platform format via format-adapter

---

## 五、首次使用流程

首次启动时，系统自动执行以下步骤：

### 5.1 环境检测
- [自动] 检测 Python 3.12+ → 安装 pip 依赖
- [自动] 检测 Remotion 渲染引擎 → 安装缺失的 node_modules 依赖

### 5.2 平台账号登录
通过内嵌浏览器（WebContentsView）登录各发布平台，支持扫码登录（微信生态），Cookie 自动 AES-256-GCM 加密保存。

### 5.3 模型服务商配置（必选）
在「模型服务商设置」页配置 AI 模型的 API Key。支持 7 类模型：

| 类别 | 用途 | 预设服务商 |
|------|------|----------|
| 推理模型 (LLM) | AI 写稿、标题生成、内容智能 | Anthropic / OpenAI / Gemini / OpenRouter / Ollama / 豆包 / DeepSeek |
| TTS 语音 | 视频配音、语音合成 | ElevenLabs / OpenAI TTS / 豆包 TTS / Google TTS / Piper |
| 语音识别 | 字幕生成、语音转文字 | OpenAI Whisper / Google STT / 豆包语音识别 / 百度语音识别 / 本地 Whisper |
| 图片生成 | 封面图、配图、AI 图像 | Flux / DALL-E / Recraft / Imagen / Grok Image / Pixabay / Pexels / 本地扩散 / ComfyUI |
| 视频模型 | AI 视频生成 | 混元 / CogVideo / Grok Video / HeyGen / Kling / Runway / Veo / Wan / MiniMax / LTX / Seedance / Higgsfield |
| 多模态模型 | 一个 API Key 覆盖文字推理/TTS/生图/视频等多个能力 | MiniMax（能力：文字推理 / TTS语音 / 生图 / 生成视频） |

每个类别可添加多个服务商，并选择一个设为默认。

### 5.4 模型类别与功能关联

| 功能模块 | 依赖模型类别 | 说明 |
|----------|------------|------|
| AI 写稿 | 推理模型 | 视频脚本、文章改写、标题生成 |
| 标题助手 | 推理模型 | AI 生成/优化标题 |
| 内容智能 | 推理模型 | 内容分析、关键词提取、摘要生成 |
| 视频配音 | TTS 语音 | 文本转语音、多语言配音 |
| 字幕生成 | 语音识别 | 音频/视频转文字、字幕文件生成 |
| 封面生成 | 图片生成 | AI 生成封面图、配图 |
| 视频生成 | 视频模型 | 文本/图片生成视频片段 |

### 5.5 开始使用
完成引导后进入首页，即可使用发布、视频创作、内容智能等全部功能。

> 详细流程见：**第 7-11 节**（视频创作 / 内容采集 / 内容智能 / 发布日历 / 云端发布）

## 六、发布流程

### 6.1 单平台发布

1. 在富文本编辑器撰写文章（标题 + 正文 + 封面图）
2. 选择目标平台
3. 点击发布 → 任务加入队列 → RpaViewManager 自动化执行 → 结果通知

### 6.2 多平台批量发布

1. 撰写一篇文章
2. 勾选多个平台（如微信+知乎+微博）
3. 点击发布 → 每个平台依次执行 → 实时进度推送

### 6.3 定时发布

**约束：** 最大提前 30 天，同平台间隔 >= 5 分钟，使用本地时区，断网标记 missed。

1. 撰写文章 + 选择平台
2. 勾选「定时发布」→ 设置时间
3. 到点时自动执行，支持 App 关闭后重启恢复
4. 任务持久化在 `tasks/scheduled-tasks.jsonl`

### 6.4 多平台批量发布（v1.1.0）

1. 撰写一篇文章
2. 勾选 2-10 个平台
3. 点击发布 → 每个平台依次执行（队列顺序） → 失败自动重试 2 次 → 全部完成
4. 发布失败平台不影响其他平台继续执行

---

### 6.5 发布回滚与降级策略

#### 回滚策略

| 场景 | 处理方式 | 数据安全 |
|------|---------|---------|
| **RPA 发布失败**（表单提交时报错） | 标记发布任务为 ailed，保留预填草稿截图，返回错误信息 | 内容保留在草稿箱，不自动重试 |
| **半成功状态**（标题已填但图片未传） | 检测 DOM 中的已填字段，匹配 last_successful_step → 从断点恢复 | SQLite 记录每步状态 {step, status, snapshot} |
| **API 发布失败**（B站 API 400） | 捕获 HTTP 状态码 + 错误体 → 自动切换 RPA 降级 | 降级标记记录在 task 中 |
| **平台拒绝**（审核不通过） | 读取审核状态 → denied，原内容保留可编辑重新发布 | 原文不删除，随 task 存档 |
| **用户取消发布** | 中断当前步骤 → 已提交部分不做回滚（平台侧无撤回 API） | 仅停止当前操作，后续步骤取消 |

#### 降级策略

1. **API → RPA 降级**：抖音/B站 优先走 API，API 连续失败 3 次后自动切换 RPA 模式
2. **RPA → 人工降级**：RPA 连续失败 2 次（相同平台）→ 弹窗提示手动发布，提供预填草稿截图
3. **跨平台降级**：批量发布中某个平台失败 → 标记失败，不影响其他平台继续发布

#### 状态机（发布任务）

`
pending → publishing → { success | failed | partial | denied | cancelled }
                              ↓
                        (partial 可恢复)
`

## 七、视频创作流程

### 7.1 图片轮播（原 Story2Video 文案成片）

```
进入「视频创作」→ 选择「图片轮播」
    │
    ├─ 输入完整视频文案
    │   └─ 可选：点击「AI 写稿」自动生成脚本
    ├─ 8002 smart-sentence-splitter 生成场景边界
    │   └─ 仅服务不可用时使用本地 TypeScript 场景降级
    ├─ 每个场景在本地二次切分为字幕页
    ├─ 逐场景生成图片、TTS，并由 prompt-engine 优化图片提示词
    ├─ 选择图片风格、提示词风格、语音模型与音色
    ├─ 点击「启动流水线」
    │   ├─ Electron StageExecutor 编排六阶段流水线
    │   ├─ ffmpeg 合成，ffprobe 真实 TTS 时长驱动字幕时间轴
    │   ├─ 以阶段清单显示文案拆分、内容增强、提示词、素材、合成、发布状态
    │   └─ 渲染完成 → 预览/保存；发布阶段未启用时明确显示跳过
    └─ 仅对明确的图片 Content Policy 拒绝按场景安全化重试（最多 5 次总尝试）；耗尽后进入“需要处理”，用户取消旧运行、修改文案后重新启动
```

#### 7.1.1 场景、字幕与 TTS 同步合同

| 合同 | 要求 |
|------|------|
| 场景层 | 8002 返回的 `scenes` 是图片、视频提示词和逐场景 TTS 的唯一边界，Multi-Publish 不得再次改写 |
| 降级 | 只允许连接拒绝、超时、连接重置或服务未运行等不可用错误降级；业务错误和缺少 `scenes` 的非法响应必须失败 |
| 字幕层 | 本地 TypeScript 在每个场景内部独立二次分页，目标每页 8-15 字，字幕不得跨场景，拼接后必须保持场景原文 |
| 时间轴 | ffprobe 的逐场景真实音频时长是权威值；字幕区间连续、互不重叠，首屏从 0 开始，末屏精确结束 |
| 场景时长与动效 | 场景成片时长跟随 ffprobe 真实旁白音频（`-shortest`），不强制截断旁白；`defaultSceneDuration`（内部默认 6 秒，UI 不暴露）仅作音频时长不可探测时的回退。图片动效按“有效时长 = audioDuration || reportedDuration || defaultSceneDuration”归一化（zoompan `d=总帧数` + 进度 `min(1, on/T)`），短场景不切走、长场景不定格 |
| 来源追踪 | 持久化 `sceneSource`、`subtitleSource`、`degraded`、`fallbackReason`、`subtitleBlocks`、`subtitleTimeline` |

Story2Video 的句长、时长、语速、场景字数、句界和单句溢出参数必须映射到 8002 `SplitRequest.config.sentence_tokenizer/scene`，字幕参数只在本地消费。
8002 的兼容字段 `min_words/max_words` 在中文场景算法中按字数/字符数计量。当前 TTS Provider 没有统一的
词级时间戳，因此字幕同步是“真实总时长 + 文本/标点权重”的分页近似同步，不宣称逐词精准对齐。

#### 7.1.2 文案边界与用户提示合同

| 合同 | 要求 |
|------|------|
| 文案输入 | Story2Video 只接受文案输入；按 Unicode code point 计数，最多 6,000 个中文、英文或 emoji 字符；不以场景数量限制用户输入 |
| 前后端一致性 | Renderer 在调用 IPC 前拦截超限文案，主进程 normalizer 以同一 6,000 字符规则再次校验；后端直接调用不得绕过该限制 |
| 反馈呈现 | Story2Video 的编排错误、文件校验错误与结果页错误统一使用应用内模态框；页面不重复渲染同一错误，也不得直接显示服务端技术错误 |
| 本地化 | 消息以稳定的消息键和参数存储，默认中文；当前提供中文和英文目录，未知技术错误必须回退到友好的本地化通用说明 |

#### 7.1.3 图片轮播自动执行与表单边界

`story2video-compose` 是历史、IPC、项目清单和执行器使用的稳定机器 ID，**不得改名**；仅产品显示层使用 locale
资源，默认中文显示“图片轮播”，英文显示“Image Carousel”。所有阶段、类别、状态和操作文字必须使用同一套 locale
key，未知内部 ID 只能回退为原始 ID。

| 范围 | 产品合同 |
|------|----------|
| 六阶段 | 文案拆分 → 内容增强 → 画面提示词优化 → 生成图片与旁白 → 合成轮播视频 → 发布（未启用时明确为 `skipped`）。用户确认后固定 `autoAdvance=true` 与 `checkpointPolicy='none'`，不提供人工 checkpoint、继续或推进操作。 |
| 运行反馈 | 图片轮播只使用条目式阶段清单显示 `pending/running/completed/skipped/failed/needs_user_input` 与可读摘要；不渲染 S2V 百分比进度作为反馈。取消入口保留。 |
| 进度区固定（2026-08-09） | 流水线运行/结束期间，**进度头部固定**：进度条 + 百分比 + 已用时（+ 完成摘要）使用 `position: sticky; top: 0` 固定在主内容区（`.cohere-main`）顶部，不随页面滚动离开视口；背景使用主题 `--bg`（明暗主题一致），贴顶时底部圆角 + 轻阴影与阶段明细分隔。阶段明细列表（stage-item）仍随内容正常滚动，避免整块进度区（阶段较多时）遮挡下方输入/配置区。 |
| 内容政策耗尽 | `needs_user_input` 不是可推进的通用 checkpoint。用户必须先取消旧运行，再以修改后的文案创建新运行；不得在原 run 上继续、恢复或用占位图伪造成功。 |
| 受控默认 | 分句语言默认“自动识别”；音调、并发数和创意强度不在图片轮播表单展示，只能使用版本化、可审计、可回滚的受控默认值。 |
| 两类风格 | 图片风格决定图片供应商输出的视觉审美；提示词风格决定优化器如何组织、表达画面提示词。两项必须同时保留，不能因枚举相似而合并。 |

#### 7.1.4 TTS 音色、个人克隆与隐私边界

创作端按“已启用 provider → model → 音色目录”选择，不接受任意手填音色 ID。优先调用具备能力且已认证的
provider adapter `listVoices`，把规范化的内置音色/目录和当前选择缓存到**当前用户**的 SQLite 设置；默认选择的
作用域是“用户 + provider + model”，新建运行可恢复该默认，但历史项目始终使用自己的版本化运行快照。目录必须显示
`ready`、`cached`、`refreshing`、`stale`、`unavailable` 或 `unsupported` 状态；显式刷新或缓存失效才重新请求 provider，
刷新失败只能明确回退到最后一次兼容的缓存或内置目录，不能伪造可用音色。

- **ElevenLabs 用户克隆**：仅在该 provider/model 的能力数据与 adapter 合同均已验证时，用户可新增、删除和设为默认。
  只有用户明确授权且远端 `cloneVoice` 成功后，可信主进程才可将已完成格式、大小、时长和完整性校验的样本 `Buffer` 写入
  owner-scoped 私有 `userData/voice-clone-samples/<owner-hash>/<storage-id>`；授权缺失、远端失败、取消或校验失败均不得创建长期样本目录。
  SQLite registry 仅保存 clone 的最小元数据、用户归属与默认选择，以及受限 `sampleStorage.relativeDir`、`sampleCount`；`relativeDir`
  只能指向该 owner 的受控相对目录，严禁记录原始源路径、源文件名、音频字节、data URL 或绝对路径。删除时先删除远端音色，成功后标记
  `remote_deleted` 并清理本地样本；若本地清理失败，必须保留 `remote_deleted` 以便重试，重试不得再次删除远端音色。
  文件格式、大小、时长和模型限制必须来自该 provider/model 的版本化 capability 数据，不能写成跨供应商的固定规则。
- **音色目录错误分类合同（2026-08-09）**：目录获取失败必须按原因分类而非一律「暂时失败」——配置类（未配置/无效 API Key、认证失败
  `401/unauthorized`、服务商/适配器缺失、适配器初始化失败）返回 `VOICE_CATALOG_CONFIG_UNAVAILABLE`，前端文案
  「当前语音服务商配置不可用，请在模型设置中检查并配置后重试。」且**不显示**「刷新音色列表」按钮（重试无效）；
  adapter 方法不支持返回 `VOICE_CATALOG_UNSUPPORTED`（「暂不支持音色列表与克隆功能」）；网络/超时/未知返回
  `VOICE_CATALOG_UNAVAILABLE`（「请稍后重试」），提供「刷新音色列表」按钮以 `refresh: true` 重拉。失败响应携带
  **脱敏** `detail`（≤200 字符；Bearer/token/api key/secret/sk- 模式只回显分类短语 `upstream-auth-error`，先脱敏后截断），
  目录失败路径与 IPC catch 必须记录日志（provider/model/脱敏原因，不记录密钥）；select/clear 失败路径同样经友好映射，
  **不得**向用户直显技术错误码。
- **多模态模型承担 TTS 能力（2026-08-09）**：当「语音生成器」选择 `minimax-multimodal` 时，「provider → model → 音色目录」链路按 `capability_models.tts`（`speech-2.8-turbo`）走音色目录白名单与克隆合同（详见 7.4.1.1）；前端语音模型下拉只展示 TTS 能力模型，系统音色列表、默认音色、克隆与本地管理能力与 `minimax-tts` 完全一致；未声明 tts 能力的多模态 provider 目录请求 fail-closed 返回 `VOICE_MODEL_MISMATCH`。
- **Doubao 个人槽位**：当前配置与 TTS adapter 的已注册/已验证调用合同不证明已经把用户个人槽位同步到本地，也不允许本地创建或伪造槽位。
  UI 必须提示用户先在供应商官方控制台创建/管理音色，再点击“刷新音色目录”并仅在有官方 API 证据及已验证的
  `listVoices` adapter 后选择；证据缺失时显示 `unsupported`/`unavailable`，不显示假列表。
- **多模态模型克隆（2026-08-09，与 7.4.1.1 同合同）**：当语音生成器选择多模态模型（如 `minimax-multimodal`）时，克隆链路的 provider 能力校验与音色目录一致——`category=multimodal` 且 capabilities **包含 tts** 才放行，模型匹配同时认 `models` 与 `capability_models.tts`；未声明 tts 能力的多模态模型返回 `VOICE_CLONE_MODEL_MISMATCH`（文案「所选语音模型与克隆配置不一致，请检查模型设置」），不调用 adapter、不落样本、不写 registry。删除本地克隆音色为纯本地管理（MiniMax 无远端删除端点），与 provider 类别无关。
- **音色克隆区域交互合同**：
  - 入口按钮文案固定为「选择本地音频文件」（已选样本后为「重新选择音频文件」）；上传要求提示由主进程返回的
    `getRequirements` 数据驱动渲染（格式 mp3/m4a/wav、时长 10s–5min、大小 ≤20MB），提示必须显示真实数值，不得把
    函数/方法引用渲染为文本（回归：模板中调用 `s2vVoiceCloneHint()`）。
  - **授权勾选已移除（2026-08-07 需求调整）**：不再要求用户勾选「我确认已取得样本上传、使用和克隆的权利，并已作出明确同意。」；选择样本 + 填写克隆音色名称即可添加。IPC/服务层 `consent` 内部契约保持不变（renderer 恒传 `true`，fail-closed 防御不变），仅移除前端勾选 UI 与关联状态/校验；添加按钮可用条件 = 已选样本 + 名称非空 + 非加载中。
  - 克隆链路全部错误码必须映射为友好本地化文案：`VOICE_CLONE_SAMPLE_INVALID / SAMPLE_DURATION_INVALID /
    SAMPLE_EXTENSION_UNSUPPORTED / SAMPLE_TOO_LARGE / TOTAL_SIZE_EXCEEDED / TOTAL_DURATION_EXCEEDED /
    PROVIDER_UNAVAILABLE / UNAVAILABLE / UNSUPPORTED / DIALOG_UNAVAILABLE / DUPLICATE_ID / MODEL_MISMATCH /
    NOT_FOUND / REGISTRY_INVALID / ROLLBACK_REQUIRED / SELECTION_UNAVAILABLE / STORE_UNAVAILABLE /
    STORAGE_UNAVAILABLE / INVALID_ARGUMENTS`；未知错误回退通用文案，**不得**显示“无法加载音色列表”这类误导性提示。

#### 7.1.5 图片内容政策恢复与审计边界

只允许结构化 `CONTENT_POLICY` 或 provider 明确的安全拒绝信号进入重写循环；认证、限流、网络、超时、配置和
未知 4xx/5xx 必须原样失败，**不得**改写重试。每个场景最多 5 次总图片尝试，重写仅安全化可疑描述而不扩大主题。审计只保存
场景序号、尝试次数、provider/model、提示词版本哈希和非敏感安全摘要，严禁保存原始 prompt、密钥或完整 provider 错误体。
第 5 次拒绝后显示友好的“可能存在内容风险，请修改文案后重新启动”说明，并遵循 7.1.3 的取消旧 run 与新建 run 合同。

**空响应重试合同（2026-08-07 修订）**：部分供应商（如 MiniMax Image）在内容安全拒绝或瞬时故障时返回 HTTP 200 但无图片
（`image_urls` 为空）。此类「空结果」此前在重试循环外才被发现，一次性报「did not return a supported image binary」导致整段失败。
现修订为：adapter 对空 `image_urls` 必须显式抛 `ProviderError`（状态信息含内容安全信号 → `CONTENT_POLICY`，否则 `PROVIDER_ERROR`），
asset-generator 在重试循环**内**校验图片结果（无 buffer 且无 URL 即视为空结果）：前 2 次同提示词重试（瞬时故障），第 3 次起切内容安全改写，
第 5 次仍空 → `needs_user_input`（`reason=empty_result`），提示「图片生成多次未返回结果（可能是内容安全策略或服务波动），请修改文案后重试或稍后再试」。
空结果重试与 7.1.7 的限流/瞬时重试解耦，不进入 governor 层之外的额外限流退避。
**emptyResult 标记（2026-08-09 Bug 反哺）**：无明确内容安全信号的空图（如 `status_msg="success"` 但无图）必须由 adapter 在 `ProviderError` 上设置 `emptyResult=true`——上层 `runContentPolicyImageRetry` 以 `error.emptyResult === true` 识别空结果并进入「同提示词重试→改写→`needs_user_input(empty_result)`」路径。缺失该标记（历史真实根因：27 场景任务 Image #2 空图 → 26/27 成功仍整线 failed）会被误判为普通 `PROVIDER_ERROR` 立即失败；含内容安全信号的 `CONTENT_POLICY` 分支不设标记（走 5 次安全改写路径）。回归：adapter 空图标记/不标记 2 例 + image-retry `empty_result` 分支 + 全链路 85 用例。

#### 7.1.6 运营配置与交付边界

独立运营后台位于 `D:\Data\projects\ops-center`。截至 2026-08-03，尚未确认 Multi-Publish 与其已有可用的运行时配置分发、
鉴权或回滚合同；本任务不接入 OpsCenter，不能把本地受控默认值、本文需求或测试计划描述为已联通、已发布或已交付。
后续必须在独立任务中定义配置版本、授权、分发、回滚和端到端验收。本文图片轮播需求是目标合同，不代替真实 provider、
Electron 打包、工作树、PR 或发布状态证据。

#### 7.1.7 生成限流与瞬时错误重试合同

实测根因（2026-08-06 复现）：约 1,400+ 字的长文案经拆分会产生 20+ 场景；「画面提示词优化」按并发 3 批量调用默认 LLM，
会触发 MiniMax 免费额度限流（429 / "You've reached the API rate limit for free users"），单场景失败导致整条流水线失败，
前端此前只显示通用文案「当前操作未能完成，请稍后再试。」。

| 合同 | 要求 |
|------|------|
| 错误分类 | 限流（`RATE_LIMITED` / HTTP 429 / 文案含 rate limit、限流、额度）；瞬时（超时、网络断开、`TIMEOUT`、`NETWORK_ERROR`）；其余一律非瞬时。 |
| 重试边界 | 限流使用更长退避（2500ms×attempt，最多 4 次，总等待约 15s）；超时/网络使用 800ms×attempt，最多 3 次；非瞬时错误不重试、立即失败。适用于「提示词优化」逐场景调用与「生成图片与旁白」的图片/TTS 调用。 |
| 与内容政策解耦 | 限流/瞬时错误只做带退避的原样重试，**绝不**进入 7.1.5 的提示词安全化改写循环；`CONTENT_POLICY` 拒绝仍按 5 次改写后 `needs_user_input` 处理。 |
| 结果形状 | 图片/TTS 的瞬时失败以 `{ code: -1, message }` 返回时同样参与重试；重试耗尽后按原样失败，不得降级为占位图或静音（除非显式 opt-in）。 |
| 用户提示 | 限流失败必须映射为稳定的 `story2video.rate_limited` 本地化消息（默认中文），提示「生成受频率或额度限制，请稍等片刻后重试；若持续出现，请检查对应模型账号的套餐额度」，并从错误文本提取场景号（如「第 22 个场景」）展示；不得再显示通用「当前操作未能完成」。 |
| 空响应重试（2026-08-07 修订） | 供应商返回 200 但内容缺失（`Missing audio data in response` / 生图空 `image_urls` / `returned no ... result` / `empty response`）归为 `transient`，governor 短退避重试（TRANSIENT_RETRIES=2）；TTS 空音频不再导致 generate_assets 整段失败。 |
| 断点提示文案（2026-08-07 修订） | resumeHint 中文改为「可从上一步失败的阶段继续生成；遇到暂时的服务繁忙或网络波动时，会自动等待片刻后重试。」（去掉用户不理解的「瞬时错误/冷却」术语），英文同步。 |
| 数据约束 | 重试总时长有界（限流 ≈15s、瞬时 ≈4.8s），不允许无限重试或长阻塞；错误文案只展示场景号与友好原因，不展示 provider 原始错误体/request id。 |

#### 7.1.8 API 并发控制、排队与断点恢复合同

多数模型 API 有每分钟调用频率限制；coding plan / token plan 用户还有每 5 小时与每周的 token 额度。
主进程新增统一网关 `ApiUsageGovernor`，挂在 provider 调用唯一出口 `AIGenerator.generate()`（覆盖
文字推理 llm / TTS / 生图 image / 生视频 video / audio），所有流水线与功能共享同一套限流策略。

| 合同 | 要求 |
|------|------|
| 并发控制 | 每 provider（type:provider[:model]）独立并发信号量：llm/tts/image/audio 默认 2，video 默认 1；超并发请求进入有界队列（默认最多等待 30s），不得无界堆积。 |
| 频率限制 | 每 provider 滑动窗口 RPM（默认 llm 30、tts/image 10、video 4）；超预算时排队等待窗口释放，等待超过 30s 返回明确限流提示。收到 429 后按 0.75 系数下调该 provider 的 RPM 预算，成功后缓慢恢复。 |
| 排队机制 | 排队顺序 FIFO；超时出队时返回 `RATE_LIMITED` 友好错误，不静默丢弃。 |
| 重试分级 | 限流（429 / `RATE_LIMITED`）：冷却（默认 30s，支持 `Retry-After`）+ 退避，最多 `retry429` 次（默认 3）；超时/网络（`TIMEOUT`/`NETWORK_ERROR`）：500ms×attempt 最多 2 次；额度耗尽（402 / `QUOTA_EXCEEDED` / 余额·配额·token 文案）：**不重试**，立即给出明确原因；其余错误不重试。 |
| token 额度窗口 | 可通过 `setTokenWindows` 为 provider 配置 5 小时/每周 token 上限，按响应的 `usage.total_tokens`（或 `prompt/completion`）累计；超限返回 `QUOTA_EXCEEDED`，文案标明窗口（“每 5 小时/每周”）与上限，不无限等待。 |
| 冷却交互 | 冷却期内新请求等待（≤45s）；等待不足则直接给出“约 N 秒后重试”的友好提示。 |
| 用户提示 | `429/频率限制` → `story2video.rate_limited`（“生成受频率或额度限制（第 N 个场景）…”）；额度耗尽 → `story2video.quota_exceeded`（“模型 API 的额度或余额已用完…请检查套餐额度，或更换模型后从断点继续”）。所有提示多语言，默认中文；不展示 provider 原始错误体/request id。 |

**断点恢复合同（从失败阶段继续）**

| 合同 | 要求 |
|------|------|
| 快照持久化 | 编排流水线失败时，把 `{ runId, pipeline, currentStage, stages, context, params, error }` 原子写入 `userData/run-state/<runId>.json`；只存纯 JSON 结构化上下文，不含密钥；成功后（或恢复成功后）清理快照。 |
| 恢复入口 | 失败弹窗提供「从断点继续」按钮（内容政策失败除外）；主进程 `pipeline:resumeOrchestration` 从内存 history 或磁盘快照重建运行，`currentStage` 回到失败阶段，前序阶段输出与已完成资源直接复用，随后后台自动推进。 |
| 场景级续传 | 提示词优化与资源生成阶段把部分结果写入 context（`optimize_resume` / `generate_assets.resume.completed`）；恢复时跳过已完成场景，不重复消耗 LLM/图片/TTS 额度。 |
| 失败类型规避 | 限流失败：恢复时由网关冷却自动等待后再继续；额度失败：恢复前用户需先确认/补充额度（提示文案引导），系统不自动重试；内容政策失败：不允许原样恢复，必须修改文案后重新启动；未知/瞬态失败：直接恢复。 |
| 交互 | 恢复期间按钮显示「正在恢复…」；恢复成功即重新显示阶段清单并恢复 3s 轮询；恢复失败以明确原因重新弹窗。 |

#### 7.1.9 流水线进度细化与信息视觉化合同

流水线运行期必须提供持续、细化的进度反馈，避免长耗时阶段让用户焦虑或误判卡死。

| 展示项 | 内容 | 数据来源与约束 |
|--------|------|----------------|
| 文案拆分 | 完成后显示「拆分为了 N 个场景」 | `context.split`（数组或 `{scenes:[...]}`）长度；仅 completed/running 阶段显示 |
| 提示词优化 | 运行中实时显示「共 N 个场景，已完成 M 个」 | `context.optimize_progress = { done, total }`，每场景完成后主进程实时写入；`done`/`total` 必须为非负整数且 `done ≤ total`，非法值不展示 |
| 生成图片与旁白 | 运行中实时显示「图片 a/b · 旁白 c/d」 | `context.assets_progress = { imagesDone, imagesTotal, ttsDone, ttsTotal }`，图片与 TTS 各自完成即写入；含断点续传复用场景；非法值不展示 |
| 视频合成（compose） | 运行中显示子进度条（mini bar）+「正在合成片段 k/N · p%」；非片段阶段显示「视频合成 p%」 | `context.compose_progress = { phase, percent, segmentsDone, segmentsTotal, message? }`（2026-08-09 新增，见下方详细合同）；percent 单调不降、0-100 整数；失败冻结 <100；历史 run 无该字段时不渲染 |
| 阶段耗时 | 每阶段显示「X 分 Y 秒」（running/completed/failed） | 主进程每阶段 `startedAt`/`completedAt`（推进时写入）；渲染层 1s 时钟刷新 running 阶段，不依赖轮询 |
| 整体进度 | 阶段清单顶部细进度条 + 百分比 + 「已用时 X 分 Y 秒」 | 完成阶段数/总阶段数；已用时 = 流水线各步骤实际执行耗时总和（主进程 `run.activeMs` 累计，2026-08-10 起），运行中本地每秒补当前执行段增量；旧数据（无 `activeMs`）回退墙钟 `createdAt` 计算 |
| 完成汇总 | 「完成时间共 X 分 Y 秒 · 文件大小 Z M」 | 时长使用步骤执行耗时累计 `activeMs`（旧数据回退快照 `endedAt - createdAt`）+ `outputSizeBytes`（主进程对成片 `statSync`，仅 completed 且存在成片时返回；stat 失败显示 null 不展示）；预览页通过路由 `durationMs`/`sizeBytes` 透传；项目持久化新增 `outputSizeBytes` 供历史展示 |

- **数据校验**：进度与汇总均为展示增强，任何字段缺失/非法不得阻断流水线；`outputSizeBytes` 只读 stat，不改变文件。
- **本地化**：全部展示文案使用 locale 资源，默认中文，英文同步（`story2video.elapsed/summaryDuration/summaryFileSize/splitSceneCount/optimizeProgress/assetsProgress/durationMinSec/durationSec`；compose 子进度沿用 `translateWithLocaleFallback` 内联 fallback：`story2video.composeSegments` / `story2video.composeProgress`）。
- **交互**：纯信息展示，不新增操作入口；「已用时」与 running 阶段耗时每秒刷新，完成/失败后停止。已用时口径变更见 7.1.9.2 详细合同（2026-08-10）。

##### 7.1.9.1 视频合成子进度详细合同（2026-08-09 新增）

**背景**：compose（视频合成）为六阶段中耗时占比最大的环节（逐场景 ffmpeg 合成 + 拼接 + 旁白合并 + 可选 BGM/转码 + 校验），此前仅显示「进行中」与耗时；本变更补齐子百分比进度条，与 optimize（场景 x/y）、generate_assets（图片/旁白 x/y）的子进度对称。

**数据契约**：`context.compose_progress`（引擎 `Story2VideoComposeEngine.compose` 通过 `onProgress` 回调发射 → 执行器 `StageExecutor` 字段级校验后写入 `run.context` → renderer 3s 轮询 `pipelineGetRunContext` 读取）。

| 字段 | 类型 | 取值范围/约束 | 语义 |
|------|------|--------------|------|
| `phase` | string | `preflight` \| `validated` \| `segments` \| `concat` \| `narration` \| `bgm` \| `webm` \| `verify` \| `done` | 当前子阶段 |
| `percent` | number | 整数，单调不降，0-100 | 合成总进度百分比 |
| `segmentsDone` | number | 0–segmentsTotal 整数 | 已完成视频片段数（仅 segments 阶段展示） |
| `segmentsTotal` | number | ≥1 整数，恒等于场景数 | 总片段数 |
| `message` | string | 可选 | 非 UI 提示（日志/测试 hint），前端不得直接渲染 |

**阶段权重（percent 映射）**：

| 阶段 | percent | 说明 |
|------|---------|------|
| preflight | 0 | 素材路径/大小校验通过后、开始 probe 音频时长 |
| validated | 3 | 预检全部通过（媒体可读、尺寸/时长限额、分辨率合法） |
| segments（k 个片段已完成，共 N 个） | 3 + 72·k/N（k=N 精确 75） | 每个片段 ffmpeg 合成完成即更新一次；片段粒度，非帧级实时 |
| concat | 87 | 拼接（含 >8 段 chunked 递归合成；权重拓宽避免长视频停滞） |
| narration | 89 | 旁白合并为独立音频 |
| bgm | 92 | 可选：BGM 混音 |
| webm | 95 | 可选：WebM 转码 |
| verify | 98 | 输出非空 + ffmpeg 可解码校验 |
| done | 100 | 仅成功 return 前发射 |

**功能逻辑**：
- 引擎侧 `normalizeComposeProgressUpdate` 归一化（percent 取整并钳制 [0,100]；`segmentsTotal` ≥1 整数；`segmentsDone` ∈ [0, total]）；发射端保证 percent 单调不降（低于上次发射值忽略）。
- **失败语义**：全部失败路径（片段生成/拼接/旁白合并/BGM/webm/校验/持久化失败）不发射新值，percent 冻结在最后有效值（<100）；`percent === 100` 与 `code === 0` 一一对应，杜绝假成功信号。
- 执行器侧 fail-closed：回调内字段级校验（phase 为已知枚举；percent 有限且 [0,100]；segmentsTotal/done 整数且范围正确），任一非法丢弃该次更新，绝不向 renderer 下发非法值；结构为纯原始值对象（IPC structuredClone 安全）。
- 可选步骤（无 BGM / 非 webm）按实际路径跳变，单调性保持；`message` 仅测试/日志使用。

**交互逻辑**：
- compose 阶段 running 且 `compose_progress.percent` 合法（有限且 0-100）时，阶段条目内渲染子进度条（mini bar，宽 100%，高 4px，`data-testid="story2video-stage-compose-progress"`）+ 阶段详情文案。
- 数据经现有 3s 轮询链路下发（不新增 IPC 通道）；子进度条宽度由 `width: p%` 驱动，`.stage-sub-fill` 0.3s 过渡平滑；`role="progressbar"` + `aria-valuenow/min/max` 无障碍语义。
- 无 `compose_progress` 字段（历史 run / 旧数据 / 引擎不可用早退）→ 不渲染子进度条与文案，阶段清单保持原状（安全降级）。
- 失败/取消时阶段变 failed/cancelled → 子进度条消失（`stageDetailText` 返回空），与 optimize/assets 现有失败行为一致。

**显示项**：
- 子进度条：仅 compose running 时显示，宽度 = percent，颜色沿用 `--primary`。
- 阶段详情文案（`stageDetailText`）：
  - `phase === 'segments'` 且 `segmentsTotal > 0`：「正在合成片段 k/N · p%」（en：`Composing segment k/N · p%`）
  - 其余 phase：「视频合成 p%」（en：`Composing p%`）
  - compose completed 且保留 `compose_progress` 时显示「视频合成 100%」；无数据则空。

**提示文字**（内联 fallback，zh/en）：
- `story2video.composeSegments`：`正在合成片段 {k}/{N} · {p}%` / `Composing segment {k}/{N} · {p}%`
- `story2video.composeProgress`：`视频合成 {p}%` / `Composing {p}%`
- 引擎侧 message（非 UI）：`正在准备视频合成素材` / `素材校验完成` / `开始合成视频片段` / `正在合成视频片段 k/N` / `正在拼接视频片段` / `正在合并旁白音频` / `正在混入背景音乐` / `正在转码 WebM 输出` / `正在校验输出视频` / `视频合成完成`。

**边界场景**：
1. 片段 i 失败提前 return：percent 冻结在 `3 + 72·(i-1)/N`（≤75），无 done，阶段 failed 后前端隐藏。
2. 拼接/旁白/BGM/webm/校验/持久化失败：分别冻结在 87/89/92/95/98，无 done。
3. 引擎不可用 / scenes 为空 / resolution 非法 / 输入超限：首个 emit 前返回，`compose_progress` 保持 undefined，前端不渲染。
4. N=1：3 → 75 → 快速 100，无中间停滞。
5. 暂停/恢复：`checkpointPolicy:'none'` 下 compose 不暂停；手动 pause 不中断当前 ffmpeg；断点恢复后 compose 重新执行并从头发射进度（前序阶段产物复用）。
6. 并发多 run：context 按 run 隔离，无串扰。
7. 结果页单段重试 `renderSegment`：独立引擎调用、无 context，不写 `compose_progress`。
8. 段内 30s 超时（既有约束）：段进度以段为单位，非帧级实时（记入后续演进）。
9. IPC 载荷：`compose_progress` ≤ 5 字段，3s 轮询无压力；字段级校验为最后防线。

**后续演进（v1 不做）**：ffmpeg `-progress pipe:1` 段内实时百分比（需将 `_createSegment` 从 execFileAsync 改为 spawn + 进度解析，涉及 Windows timeout/maxBuffer/错误语义重构，独立 PR 评估）；chunked 拼接（>8 段）在 75→87 区间的段级 onStep 插值。

##### 7.1.9.2 「已用时」= 步骤执行耗时总和详细合同（2026-08-10 新增）

**背景**：流水线支持暂停、失败后从断点恢复（可跨天）、人工检查点等机制，原「已用时」按墙钟（`endedAt - createdAt` / 运行中 `now - createdAt`）计算，会把暂停、等待与失败→恢复之间的空闲时间全部计入。用户实证：一个可从断点继续的任务显示「已用时 1245 分 33 秒」（约 20 小时），与实际执行时间严重不符。本次将口径改为**各步骤实际执行耗时之和**。

**数据模型**：

| 字段 | 载体 | 语义 | 持久化 |
|------|------|------|--------|
| `run.activeMs` | 主进程 run 对象 | 已结算的步骤执行耗时累计（毫秒），各执行段之和 | 随 `run-state-store` 快照持久化（`version` 保持 1，纯增量字段），失败/取消/运行中快照均携带 |
| `run._activeSegmentStartedAt` | 主进程 run 对象（瞬时） | 当前在飞执行段起点（`Date.now()`）；无执行器在飞时为 `null` | **不落盘**（防应用崩溃后把停机时间误计为执行时间） |
| `activeMs` / `activeSegmentStartedAt` / `elapsedActiveMs` | `pipeline:getRunContext` 快照返回 | 主进程权威值：`activeMs` 已结算累计；`activeSegmentStartedAt` 在飞段起点 ISO；`elapsedActiveMs = activeMs + 在飞段增量`（仅 running） | IPC 增量字段，向后兼容（旧 renderer 忽略） |
| `story2videoRunMeta.activeMs` / `activeSegmentStartedAt` | 前端 | 从轮询快照透传，驱动「已用时」展示 | 内存态 |

**流程（数据链路）**：

1. 流水线启动（`start()` / `startOrchestrated()`）：run 初始化 `activeMs = 0`、`_activeSegmentStartedAt = null`。
2. 每阶段执行（`_executeStage`）：进入执行器前记录 `execStartedAt` 并写入 `run._activeSegmentStartedAt`；执行器返回（**成功/失败/取消/异常均覆盖**，`finally` 保证）后结算 `run.activeMs += max(0, now - execStartedAt)` 并清空在飞段标记。**本处是唯一累计点**，不得再从阶段时间线二次累计。
3. 暂停/检查点等待/失败→恢复空闲：执行器未运行，无累计，天然不计入。
4. 断点恢复（`resumeOrchestration`）：从快照继承 `activeMs`，在飞段从恢复时刻重新起算（不落盘、不膨胀）。
5. 运行中轮询（3s）：`getRunSnapshot` 返回 `activeMs`/`activeSegmentStartedAt`/`elapsedActiveMs`；前端每秒用「`activeMs` + 本地补当前执行段增量」平滑刷新，完成/失败/取消后定格。
6. 终态：`pipeline:complete` 事件 `totalDuration`、完成汇总、结果页 `durationMs` 统一使用累计口径；`executeStage` / `advanceToNextCheckpoint` 的完成响应额外返回 `activeMs`，供「检查点确认直接完成」路径在未及轮询时取到终态权威值（前端 `applyOrchestrationOutcome` 以 `outcome.activeMs` 覆盖轮询缓存）。

**数据校验**：

- `activeMs` 仅接受有限非负数值；`activeSegmentStartedAt` 仅接受可解析 ISO 时间；任一非法视为旧数据（回退墙钟），不阻断展示。**存在性守卫**：`null`/`undefined` 均视为「无累计数据」并回退（`Number(null)===0` 陷阱——必须显式排除，禁止把旧数据误显示为 0 秒）。
- 在飞段增量 `max(0, now - segmentStart)` 钳制非负；运行中 3s 轮询的权威值自愈本地 1s 补差可能产生的 ≤3s 漂移。
- `elapsedActiveMs` 为瞬时值，只读展示，**不写入持久化**（持久化只存 `activeMs`）。

**功能逻辑**：

- 主进程 `_computeElapsedMs(run)`：running 且存在在飞段 → `activeMs + 增量`；否则 → `activeMs`；无 `activeMs`（旧 run）→ 0（不参与编排展示，由前端回退链处理）。
- 前端 `orchestrationElapsedMs` 回退链：① `meta.activeMs` 有限 → `activeMs +（running 且有 activeSegmentStartedAt ? now - segStart : 0）`；② 无 `activeMs` → 墙钟 `endedAt - createdAt`（旧数据展示，避免为空）。
- `orchestrationSummary` 与结果页 `query.durationMs`：优先 `activeMs`，旧数据回退墙钟。

**交互逻辑**：

- 运行中：每秒刷新（沿用 `stageClockTick` 1s 时钟），展示「已用时 X 分 Y 秒」；暂停期间本地补差停止（`pipelineRunStatus.status !== 'running'` 时不补），以主进程轮询值为准。
- 完成/失败/取消：定格为终态累计值，停止计时。
- 纯信息展示，不新增操作入口；不改变阶段条目自身的「阶段耗时」（仍按 `startedAt`/`completedAt` 展示，语义不变）。

**显示项**：

- 进度头部（sticky）：进度条 + 百分比 + 「已用时 X 分 Y 秒」（`data-testid="story2video-orchestration-progress"`）。
- 完成汇总（sticky 下方，仅 ended）：「完成时间共 X 分 Y 秒 · 文件大小 Z M」（`data-testid="story2video-orchestration-summary"`）。
- 结果页：`durationMs` 路由参数展示同口径时长。

**提示文字**（locale，zh/en）：

- `story2video.elapsed`：`已用时 {duration}` / `Elapsed {duration}`
- `story2video.summaryDuration`：`完成时间共 {duration}` / `Finished in {duration}`
- `story2video.summaryFileSize`：`文件大小 {size} M` / `Size {size} MB`
- `story2video.durationMinSec`：`{minutes} 分 {seconds} 秒` / `{minutes}m {seconds}s`；`story2video.durationSec`：`{seconds} 秒` / `{seconds}s`

**边界场景**：

1. 暂停 2 小时后恢复并完成（步骤合计 3 分钟）：「已用时」≈ 3 分钟，不含 2 小时等待。
2. 失败后 7 天从断点继续完成：已用时 = 两段执行之和，不显示 7 天墙钟。
3. 失败重试多次执行段：同一步骤多次执行段全部累计（5 分钟失败段 + 8 分钟重试成功段 = 13 分钟）。
4. 应用重启后断点恢复：历史累计随快照继承，续跑继续累加，不从 0 开始。
5. 执行器异常：`finally` 保证该段照常累计，不丢段。
6. 旧快照/旧历史（无 `activeMs`）：回退墙钟展示，不显示 0 或空。
7. state_machine 旧模式：无编排累计，不参与「已用时」展示（前端回退链兜底），行为不回归。
8. 暂停瞬间执行器仍在后台跑：该段实际消耗资源，仍累计（语义为「真实执行时间」）；用户看到的已用时在暂停后由轮询定格。
9. IPC 载荷：新增 3 个字段（`activeMs`/`activeSegmentStartedAt`/`elapsedActiveMs`），3s 轮询无压力；字段校验为最后防线。

#### 7.1.10 图片轮播选项持久化合同（上次使用的选项）

| 合同 | 要求 |
|------|------|
| 存储 | 主进程 owner-scoped SQLite（`store:set-setting` / `store:get-setting`），键 `story2video.lastOptions.v1`；按当前登录用户隔离，切换账号不串档。 |
| 保存范围 | `s2vConfig`（图片风格/提示词风格/动效/字幕/分句/语音/音色/发布等全部选项）与 `s2vOutputConfig`（比例与分辨率/帧率/格式）；**不保存** `pipelineText` 文案内容（隐私边界，文案不属选项）。 |
| 保存时机 | ① 选项变更后 1s 防抖自动保存；② 点击「启动流水线」成功时立即保存；③ 离开页面前 flush 未落盘变更。 |
| 恢复时机 | 进入/选择【图片轮播】且 provider 加载完成后自动恢复（`mounted` 已选该流水线或 `selectPipeline` 选中 story2video-compose 时触发；**2026-08-09 Bug 反哺**：组件挂载时 `selectedPipeline` 为 null、`loadPipelines` 不设置它，restore 的编排守卫使恢复从未执行——保存成功但重启后不恢复，修复为选中流水线时主动恢复）；生命周期内**只恢复一次**（`_s2vRestoredOnce`），同会话切走再切回不覆盖当前编辑；恢复为浅层合并 + 类型守卫：仅接受与默认值类型一致的键，数组/对象深拷贝防引用共享。 |
| provider 失效处理 | 已不启用（未配置/已删除）的 voice/image provider 及其 model/voiceId **不回填**；语音目录在恢复后重新拉取以校正音色选择。 |
| 重置 | 「恢复默认选项」按钮将选项重置为初始默认并清除已存快照；语音/音色随后按用户默认恢复。 |
| 版本 | 快照携带 `version:1` 与 `savedAt`，为未来迁移预留；非法/损坏快照静默忽略，回退默认值，不阻塞页面。 |
| 失败降级 | 读写失败不影响页面功能（catch 静默）；不显示技术错误。 |

**补充优化（需求方确认后可选）**：恢复时可同时恢复上次「输入方式」Tab（文案/图片/视频）；后续可扩展为每条流水线各自维护选项快照（当前仅图片轮播）；多账号场景下可为快照增加「账号 + 流水线」双维度键。

#### 7.1.11 参数表单 UE 合同（分组折叠 + 反馈）

| 合同 | 要求 |
|------|------|
| 分组 | 图片轮播参数按「基础 / 画面 / 声音 / 高级 / 模板与输出 / 发布」分组，`<details>` 折叠；每组标题栏显示本地化名称 + 实时摘要（如“声音：MiniMax · speech-2.8-turbo · 已选音色”）。 |
| 默认展开 | 基础展开，画面/声音/高级/发布默认折叠；发布关闭时摘要显示“不发布”。 |
| 折叠持久化 | 折叠状态随 `story2video.lastOptions.v1.ui.expandedGroups` 保存/恢复（字符串数组 + 已知组校验，非法值忽略回退默认）。 |
| 轻提示 | 选项自动保存（防抖 1s）后显示「选项已保存 ✓」（1.6s 淡出）；进入页面恢复上次选项后显示「已恢复上次的选项设置」。 |
| 执行控制 | 操作栏（启动流水线/取消/恢复默认选项）sticky 固定在表单底部可视区；运行期进度与阶段清单保持可见。 |
| 声音克隆 | 音色克隆面板内层折叠（默认收起，展开显示上传区、格式/时长/大小要求）；样本上传不再要求页面授权勾选（2026-08-07 调整）。 |
| 本地化 | 组名、摘要、提示全部走 locale，默认中文，英文同步。 |
| 校验边界 | 纯展示层改动：不改动 `s2vConfig` 数据结构与 IPC 契约；折叠状态类型/键校验失败仅回退默认，不阻塞。 |
#### 7.1.12 模型服务异常检测、有界超时与执行日志合同（2026-08-07）

**背景**：实测发现部分 provider（如 agnes-llm）单次请求可挂起 2-3 分钟甚至更久（fetch 级无超时），
「提示词优化」阶段因此看似卡死（单阶段实测 476s）。为避免用户无法区分「模型自身问题」与「程序 bug」，
系统必须：① 给所有 provider 调用加有界超时；② 检测慢响应/超时/网络错误并记为结构化异常快照；
③ 下发给前端展示友好提示；④ 把每次运行的阶段/耗时写入应用日志便于用户/官方/AI 定位。

| 合同 | 要求 |
|------|------|
| 有界超时 | `callAdapter` 兜底超时：视频类 provider 10 分钟，其余类别 2 分钟；`params.timeoutMs` 显式传入时优先（必须为正数）。超时抛 `ProviderError(TIMEOUT)`，按瞬时错误进入既有冷却/重试链路，不让单次挂起请求无限阻塞流水线。 |
| 慢响应阈值 | 超过类别阈值即记为异常：llm/tts/audio 30s、image 60s、video 120s、未知类别 60s。成功但超阈值（慢响应）同样记录。 |
| 异常上报 | `providerAnomalyBus.report({ providerId, category, model, latencyMs, kind })`；kind ∈ `slow` / `timeout` / `network`。超时（TIMEOUT）与网络错误（NETWORK_ERROR）在失败路径上报；成功但慢响应在成功路径上报。 |
| 快照 | 仅内存、按 provider 去重保留最新、最多 5 条、按最近更新时间倒序；重启即清空，不落库、不膨胀。 |
| 下发 | `pipeline:getRunContext` 在存在异常时附带 `providerWarnings` 数组；无异常时不附加该字段，保持返回结构稳定。 |
| 前端展示 | 流水线详情页顶部显示非阻塞警告横幅（role=alert）：「检测到模型服务响应异常：{provider}（{秒} 秒）、…。流水线已自动重试；若反复出现，建议到【模型设置】切换模型或检查该服务商。」横幅随轮询实时更新，运行结束/取消时清空。 |
| 数据校验 | `providerWarnings` 非数组/空数组视为无异常；latencyMs 非数值按 0 处理；横幅纯展示，不阻断流水线、不改变运行逻辑。 |
| 本地化 | 横幅文案走 i18n（默认中文，英文同步），不做硬编码英文。 |
| 执行日志 | pipeline-engine 在每阶段开始/结束记录 INFO 日志（runId、pipeline、stage、序号/总数、success、duration_ms）；运行终态（completed/failed/cancelled）记录 INFO/WARN 日志（总耗时、错误摘要截断 ≤500 字符，不含敏感原文）；配合既有 provider 调用日志（model_provider_logs）定位「模型自身问题」。 |
| 优化进度前置 | 提示词优化阶段一开始即写入 `context.optimize_progress = { done, total }`（done 从断点续传已完成数开始，total 为场景总数），前端在阶段执行期间即可显示「共 N 个场景，已完成 M 个」，不再等阶段结束才出现；非法值不展示。 |

#### 7.1.13 弹窗标题、操作反馈与提示信息规范（2026-08-08）

**背景**：① 弹窗标题出现「{流水线名} 提示」（如「图片轮播 提示」）重复流水线名词；②「选项已保存」toast 作为操作栏 flex 子项挤占【启动流水线】按钮位置；③ 媒体文件校验失败只提示「所选文件不符合要求」，未指出具体原因；④ 用户需要选择音频操作附近看到文件要求说明。

| 合同 | 要求 |
|------|------|
| 弹窗标题 | 提示类弹窗标题统一为「提示」（英文「Notice」），不得携带流水线名词前缀（`getStory2VideoNotificationUiText` 的 `dialogTitle` 固定返回「提示」/「Notice」）。适用于视频创作页错误/删除确认/模板删除确认对话框与结果页通知对话框。 |
| 标题类型盘点 | 其余弹窗标题保持业务语义标题：功能类（添加服务商/编辑服务商/添加账号/账号代理/分组管理/设置/添加监控）、确认类（确认删除）、状态类（审批门/{类型} · 审批、📦 发现新版本）、系统类（启动失败）。不在此次改动范围。 |
| 选项保存反馈 | 「选项已保存 ✓」「已恢复上次的选项设置」toast 使用绝对定位（`position:absolute`，位于操作栏上方 `bottom:calc(100%+10px)`、右对齐），不参与 flex 布局、不挤占【启动流水线】按钮位置；1.6s 自动消失。 |
| 媒体格式提示 | 校验失败按原因细分并插值具体值：格式不支持 →「不支持 {extension} 格式。{kindLabel}仅支持：{extensions}。」；大小超限 →「{kindLabel}文件大小超出限制：最大 {maxMb}MB，当前文件约 {actualMb}MB，请压缩后重试。」；文件不可读 →「无法读取所选{kindLabel}文件，请确认文件未被占用或已损坏后重试。」。 |
| 主进程失败透传 | 主进程导入拒绝（`不支持的媒体格式`/`媒体文件超过大小上限`/`媒体文件不存在或不可读` 等）由 renderer `resolveMediaImportFailure` 映射为对应细分提示；无具体消息时回退通用 MEDIA_INVALID。同一操作只弹一个对话框（批量旁白逐文件失败不重复弹笼统提示）。 |
| 文件要求提示 | 各文件选择控件附近常驻显示要求说明：图片「支持 jpg / jpeg / png / webp，单个文件最大 10MB」；旁白音频「wav / m4a / mp3，最大 50MB」；背景音乐「wav / m4a / mp3，最大 15MB」；视频素材「mp4 / mov / webm / mkv / avi，最大 512MB」。文案走 i18n（`create.story2video.mediaRequirements*`）。 |
| 数据校验 | `validateStory2VideoFile` 与主进程 `importUserSelectedMedia` 规则保持一致（扩展名白名单、按类别大小上限）；`actualMb`/`maxMb` 非数值时按 0 处理，非法参数不展示具体数值但保留友好文案。 |
| 本地化 | 全部新增/调整文案提供中英文，默认中文；未知技术错误仍回退友好通用说明（PRD 7.1 反馈呈现合同）。 |
| 提示信息梳理 | 本轮整体梳理提示/错误信息：媒体校验类已细化（见上）；限流/额度/内容政策/权限/模型配置类已有专属文案与分类（`resolveMessageKey`）；其余瞬时失败保留「请稍后再试」类通用文案作为兜底，不暴露技术细节。 |

#### 7.1.14 视频预览：分段图片与文件下载合同（2026-08-08）

**背景**：① 视频预览页【分段编辑】区域的每段图片显示不出来；② 点击【下载视频】等下载按钮无反应、无保存对话框。

| 合同 | 要求 |
|------|------|
| 分段图片显示 | 本机媒体服务 `Story2VideoMediaServer` 的 Content-Type 映射必须包含图片类型（`.png→image/png`、`.jpg/.jpeg→image/jpeg`、`.webp→image/webp`、`.gif→image/gif`）；响应带 `X-Content-Type-Options: nosniff`，若返回 `application/octet-stream`，Chromium 会拒绝渲染 `<img>`（分段图片显示不出来的根因）。视频/音频类型保持不变（mp4/webm/mp3/m4a/wav 等）。 |
| 下载交互 | 所有「下载」入口（下载视频、下载裁剪片段、下载旁白、分段下载图片/音频/视频）统一走主进程 `story2video:save-as`：弹系统保存对话框（`dialog.showSaveDialog`，默认文件名 + 类型过滤器）→ 校验文件在受控媒体根内且可读 → `fs.copyFileSync` 复制到用户选择位置 → 成功提示「文件已保存。」，取消不提示。 |
| 禁止方案 | renderer 的 `<a download>` 对跨源/本地 HTTP 媒体 URL（`http://127.0.0.1:<port>/media/<token>`）无效——`download` 属性对跨源 URL 被忽略，点击会静默失败；不得用该方法下载媒体文件。 |
| 数据校验 | `save-as` 参数为 `{ filePath, suggestedName }`；`filePath` 必须通过 `resolveReadableFile` 白名单校验（受控媒体根 + canonical 路径 + 非符号链接 + 文件非空）；`suggestedName` 只取 `basename` 并截断 120 字符，防路径注入。 |
| 反馈 | 保存成功显示「文件已保存。」（`SAVE_COMPLETED`，i18n 中英文）；保存对话框取消返回 `cancelled` 不提示；失败弹「当前操作未能完成，请稍后再试。」（`OPERATION_FAILED`）。 |
| 新 IPC | `story2video:save-as`（preload `story2videoSaveAs`，renderer API `story2videoSaveAs(filePath, suggestedName)`）。 |

#### 7.1.15 MiniMax 异步 T2A 与资源进度前置合同（2026-08-08）

**背景**：图片轮播默认 TTS 模型为 `speech-2.8-turbo`（T2A Async 异步模型），但 adapter 一直调用同步端点 `/t2a_v2`——异步模型在同步端点返回 200 但不含 `data.audio`，抛「Missing audio data in response」并被当作瞬时错误反复重试后整段失败（弹「当前操作未能完成，请稍后再试。」）。同时「生成图片与旁白」的进度数字在首个资源完成前不显示（图片生成需 16-30s）。

| 合同 | 要求 |
|------|------|
| 异步模型路由 | `speech-2.8-turbo` / `speech-2.8-hd` / `speech-02-hd` / `speech-02-turbo` 为异步 T2A 模型（官方「异步语音合成」支持模型表），`synthesize` 走异步流程；`speech-2.6-*` 走同步 `/t2a_v2`。 |
| 官方音色 | 系统音色（在 `MINIMAX_SYSTEM_VOICES` 列表内）使用用户配置的模型（默认 `speech-2.8-turbo`）走 `/t2a_async_v2`。 |
| 克隆音色模型 | 克隆（复刻）音色（voice_id 不在系统音色列表）必须使用 `speech-02-hd` 模型走 `/t2a_async_v2`——官方模型表中 `speech-02-hd` 是唯一标注「复刻相似度」的模型；用 `speech-2.8-turbo` 等会报「invalid params, voice id wrong」。 |
| 克隆创建 | 快速复刻接口 `/v1/voice_clone` 请求体必须携带 `model: 'speech-2.8-hd'`（官方文档示例）；请求体为 `{ file_id, voice_id, model }`。 |
| 异步流程 | ① POST `/t2a_async_v2`（body：`model/text/language_boost=auto/voice_setting{voice_id,speed,vol,pitch}/audio_setting{format,audio_sample_rate,bitrate,channel}`）→ `data.task_id`；② 轮询 GET `/query/t2a_async_query_v2?task_id=...` 直至返回 `data.file_id`（或直接 `data.audio` hex）；③ GET `/files/retrieve_content?file_id=...` 下载音频二进制。 |
| 轮询边界 | 默认 90s 超时、1s 间隔（可注入 `asyncPollTimeoutMs`）；查询响应带 `error`/`status=failed`/`base_resp.status_code≠0` 立即失败；超时抛 `ProviderError(TIMEOUT)`（归入瞬时错误自动重试）。 |
| 进度前置 | 「生成图片与旁白」阶段开始即写入 `context.assets_progress={imagesDone:0,imagesTotal:N,ttsDone:0,ttsTotal:M}`，前端立即显示「图片 0/N · 旁白 0/M」，首个资源完成后实时递增；非法值不展示。 |
| 数据校验 | `task_id`/`file_id` 缺失抛 `ProviderError(PROVIDER_ERROR)`；下载结果为空 Buffer 抛 PROVIDER_ERROR；同步路径行为不变。 |
| 查询响应层级（2026-08-08 二次修订） | 官方查询接口把 `status`/`file_id`/`task_id` 放在响应**顶层**（`{ task_id, status, file_id, base_resp }`），历史实现只读 `data.*` 导致任务永远显示 pending 直至 90s 超时（旁白 0/1 的第二层根因）。轮询解析必须**顶层与 `data.*` 双层兼容**：`status` 取 `data?.status ?? nested?.status`，`file_id` 同理；`status=success` + `file_id` 才下载，`processing` 继续轮询，`failed`/`expired` 立即失败。真实验证：修复后 `synthesize success（约 13s）`，成片正常生成。 |

#### 7.1.16 克隆音色 voice_id 合规与失效回退合同（2026-08-08）

**背景**：真实链路排查「旁白 0/1」——图片正常、仅 TTS 合成失败，provider 日志为 `invalid params, voice id wrong`。根因：用户选中的克隆音色 `voice_id="01"` 不符合 MiniMax 官方「音色快速复刻」对自定义 voice_id 的约束（长度 `[8,256]`、**首字符必须为英文字母**、仅允许数字/字母/`-`/`_`、末位不可为 `-`/`_`、不可与已有 id 重复），旧版 `cloneVoice` 用 `name.replace(/[^a-zA-Z0-9_]/g,'').slice(0,32)` 生成 id（如 "01"）导致复刻/合成被平台拒绝。官方文档：`/api-reference/voice-cloning-clone`、`/guides/speech-voice-clone`、`/faq/system-voice-id`。

| 合同 | 要求 |
|------|------|
| voice_id 生成 | `MinimaxTtsAdapter.cloneVoice` 必须用 `buildMiniMaxCloneVoiceId(name)` 生成合规 id：`MiniMax` 前缀（保证首字母）+ 清洗后的名称 + 随机后缀，长度落在 `[8,256]`、末位非 `-/_`；平台回显 id 不合规时回退本次生成值。 |
| 合法性校验 | 新增 `isValidMiniMaxCloneVoiceId(id)`（长度/首字母/字符集/末位）；由 `tts-voice-clone-service.isProviderCloneVoiceIdValid` 对 `minimax-tts` / `minimax` / `minimax-multimodal` 应用（其他 provider 恒合法）。 |
| 存量数据自愈 | `listClones` 对非法克隆 id 标记 `invalid: true`；`tts-voice-service._buildCatalogResponse` 将非法克隆**移出可选项**、放入响应 `invalidVoices` 供前端展示；用户偏好若指向失效克隆（如 "01"）→ `isSafePreference` 不命中 → **自动回退默认音色**（旁白合成恢复正常）。 |
| 前端展示 | 音色下拉对失效克隆显示「{名称}（已失效，请重新克隆）」且禁用；克隆面板列表显示「已失效，请重新克隆」徽标、「设为默认」按钮禁用（删除仍可用，便于清理旧记录）。 |
| 提示文字 | 无需新增错误码：失效克隆通过禁用项与徽标提示；用户需删除旧克隆后重新上传音频克隆（新 id 自动合规）。 |
| 验收标准 | ① 旧注册表 `voice_id="01"` 的克隆在音色下拉中显示「已失效」且不可选，默认音色被自动选中；② 重新克隆（合法 id）后可正常选择并合成；③ 真实流水线「生成图片与旁白」旁白 `x/1` 不再因 voice id 报错（provider 日志无 `voice id wrong`）。 |

#### 7.1.17 提示词优化输出净化与无实质内容守卫（2026-08-09）

**背景**：真实链路「图片轮播」文案输入「12」，提示词优化阶段输出的图片提示词为 `<think>……</think>\n\nA man in his late thirties stands at a crossroads……`——带推理能力的 LLM（MiniMax-M3/M2.7 等）在 OpenAI 兼容接口下把思考过程以 `<think>` 块放进 `content`，系统原样当提示词；同时纯数字文案被模型凭空编造出与原文无关的场景。

| 合同 | 要求 |
|------|------|
| 思考块剥离（Adapter 层） | `minimax-llm.js` 必须对 `chatCompletion` 的 `content` 应用 `stripThinkingBlocks`（剥离成对 `<think>...</think>` 与未闭合 `<think>` 至结尾）；`streamChat` 用状态机抑制跨 chunk 思考块；纯思考无答案时返回空 content。工具导出供测试。 |
| 输出净化（阶段层） | `story2video-stages OPTIMIZE` 对 LLM 返回内容二次净化（`sanitizeOptimizedPrompt`），不依赖具体 adapter；净化后为空 → 视为失败（原 empty prompt 错误）。 |
| 无实质内容守卫 | `hasMeaningfulText(text)`：去掉空白/标点/符号后为空、或**为单个纯数字**（如「1」）→ 跳过 LLM 优化，`optimized_prompt` 用原文，标记 `skipped_optimize: true`，`providerId/model` 为 null；**2 位及以上纯数字（如「81」「1949」，方案B 2026-08-09）与单字中文（如「一」「猫」）视为有意义，正常走 prompt-engine 优化**。后续「生成图片与旁白」读取 `optimized_prompt` 不受影响。 |
| 过短拒绝回退（方案B 配套） | prompt-engine 最小长度校验拒绝（422 `Too short`）时**回退原文并继续运行**：`optimized_prompt` 用原文、`skipped_optimize: true`、`optimize_note: 'prompt_engine_too_short_use_original'`，不使整条流水线失败；非过短校验拒绝（如非法风格）仍按失败处理。**判定词表（2026-08-09 Bug 反哺）**：真实链路中文文案为「描述太简短了（N 字），建议更详细描述画面」，判定正则必须覆盖 `too short | 太短 | 太简短 | 过短 | must be at least | min[_ -]?length | shorter than`（中文变体缺失曾导致回退未命中、整条流水线失败）；回归含真实中文文案端到端回退用例。 |
| 回归测试 | ① `stripThinkingBlocks` 成对/未闭合/纯思考/无思考；② chatCompletion/streamChat 思考块剥离；③ OPTIMIZE 对含 think 的 content 净化；④ 纯数字文案跳过优化用原文（+6 用例）。 |
| 验收标准 | ① 文案「1」运行流水线，优化阶段不出现 `<think>` 内容、不编造人物场景，图片用原文「1」生成；② 文案「81」「1949」等 2 位及以上数字正常走 prompt-engine 优化（优化结果不含思考块）；③ 正常文案优化结果不含思考块；④ 真实 provider（如 MiniMax-M2.7/M3）验证成图提示词纯净。 |

#### 7.1.18 历史记录可见性与运行状态合同（2026-08-09）

**背景**：失败/已取消/运行中的流水线任务被用户误以为「从历史记录消失」——历史页默认 tab 是「渲染记录」（只含成功保存项目的渲染），失败/取消任务只在「流水线记录」tab。

| 合同 | 要求 |
|------|------|
| 任务落库 | 失败/取消：`_finalizeRun` 写内存 `_history` + `runStateStore.saveFailed` 持久化（跨重启可见）；运行中任务经 `getHistory()` 从 `_runs` 实时返回；成功任务额外经 story2videoProjectService 保存项目。 |
| 历史页可见性 | 存在运行中/失败/已取消任务时，进入历史页自动切到「流水线记录」tab；「渲染记录」tab 顶部显示提示横幅（N 条运行中、M 条失败或已取消，点击跳转）。 |
| 状态展示 | 状态文案：completed=已完成 / running=运行中 / failed=生成失败 / cancelled=已取消 / paused=已暂停；取消任务必须保留并显示「已取消」，不得消失。 |
| 运行中进度 | 流水线记录卡片显示总进度条（优先 `run.progress`，否则按 stage 完成比例计算）与每 stage 状态标记（✓ 已完成 / ⟳ 进行中 / ✕ 失败）；每 5s 轮询刷新，与流水线详情页状态一致。 |
| 跳转 | 点击运行中/失败/已取消卡片 → 跳回创作页（CreateView 恢复查看/断点继续）；点击已完成卡片 → 视频预览页。 |
| 分段重试反馈 | 「重试图片/视频」点击后按钮显示「重试中...」（loading 禁用）；成功后重新解析分段图片媒体 URL（`refreshSegmentImageUrls`），保证新图立即显示；失败也尝试刷新（服务端可能部分更新）并弹出友好错误。 |
| 验收标准 | ① 流水线失败后弹窗点「知道了」，历史页能看到该任务（状态「生成失败」）；② 点「从断点继续」后任务恢复运行并显示进度；③ 取消流水线后历史页显示「已取消」；④ 分段编辑重试图片，按钮有「重试中...」反馈且新图片立即显示；⑤ 应用重启后失败/取消任务仍在历史中。 |

#### 7.1.19 参数治理与隐藏工程默认值合同（2026-08-09）

**背景**：图片轮播前端 `s2vConfig` 存在「存在但不可控」的隐藏字段（无 UI、恒默认值），既增加契约表面积又制造假配置项。本变更移除 3 个死字段（voicePitch / creativeLevel / splitBaseWordsPerSecond），并把系统管理参数清单、UI-后端边界、双源结构成文。

**1. 前端死字段移除（本变更）**

| 字段 | 原默认 | 处置 | 兜底来源 |
|------|--------|------|---------|
| `voicePitch` | 0 | 前端 s2vConfig 移除，提交不再传 `voice.pitch` | normalizer 契约默认 0（`story2video-text-config.js` voice.pitch） |
| `creativeLevel` | 5 | 前端 s2vConfig 移除，提交不再传 `optimize.creativeLevel` | normalizer 契约默认 5（`story2video-text-config.js` optimize.creativeLevel 1-10；prompt-engine-contract 为第二层兜底） |
| `splitBaseWordsPerSecond` | 3.3 | 前端 s2vConfig 移除（提交仍按语言表显式下发） | `getLanguageBaseWordsPerSecond`（zh 4.5 / en 2.8 / 其余 3.3）；normalizer 缺省同源兜底 |

- 行为等价性：pipeline `run.params` 先经 `normalizeStory2VideoTextParams` 归一化，下游（stages/resolveRuntimeStageOptions/prompt-engine-contract/project-service）读的都是归一化值（pitch 恒 0、creative_level 恒 5），与前端是否显式提交无关（双模型分析确认无遗漏消费点）。
- 快照兼容：`_applyS2VSnapshot` 按当前默认键白名单应用，旧快照中的已移除键自动忽略；`splitTargetSeconds` 陈旧值仍按主控字数自愈。
- 测试：CreateView（字段不存在 + 提交不携带 + 恢复忽略）、UE 契约（字段不存在）、text-config（缺省 → 默认 0/5 兜底）。

**2. 系统管理参数完整清单（前端不暴露 UI；开放 UI 前须评估契约影响）**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `voicePitch` | 0 | 归一化顶层 `voicePitch`/`voice.pitch`；TTS pitch；R1 已移除前端字段 |
| `creativeLevel` | 5 | `optimize.creative_level` 1-10；prompt-engine 使用；R1 已移除前端字段 |
| `concurrency` | 3 | generate_assets 并发（成本/速度）；normalizer 默认 3、范围 1-8；**R2 已移除前端字段**（旧快照中的非默认 concurrency 值不再恢复，回落契约默认 3） |
| `splitBaseWordsPerSecond` | 语言表 | 不暴露 UI，值由语言表派生，随提交下发；R1 已移除前端字段 |
| `splitSpeechRate` | 1（恒被 voice.speed 覆盖） | normalizer 硬覆盖为 `voice.speed`（单一来源，不校验独立值）；**R2 已移除前端字段与提交** |
| `splitMinWords/MaxWords` | 10/50 | 分镜字数 clamp 边界（内部消费） |
| `splitSubtitleMinChars/MaxChars/Timing` | 8/15/proportional | 字幕分页内部参数 |
| `splitEnforceSentenceBoundary` / `splitOverflowToNext` | true | 分句内部策略 |
| `autoAdvance` / `background` / `checkpointPolicy:'none'` | true/true/none | 全自动编排固定参数（提交 params 字面量携带）；**R2 已移除 autoAdvance 前端字段** |
| `watermarkConfig` 内部项（fontSize/opacity/color/position） | 24/0.6/white/bottom-right | 模板持有（见 4） |

**3. UI-后端边界**

| 参数 | 前端 | 后端边界 |
|------|------|---------|
| fps | 产品子集 24/30/60（`activeOutputConfig.fps` 下拉） | 技术边界 1..120（compose 引擎 clampNumber） |
| splitMaxSentenceLength | 20-1000，默认 200 | YAML `max_sentence_length` 200 |
| negativePrompt | ≤500 字符（maxlength） | optimize.negative_prompt 字符串 |
| splitTargetCharsPerScene | 10-50（主控） | 1..200 整数；targetSeconds 反推 1..60 |

**4. watermark / subtitle 双源结构说明（模板-提交协调，非冗余）**

- **watermark**：UI 文本字段 `watermarkText`（用户输入）+ 样式对象 `watermarkConfig`（position/fontSize/opacity/color，模板/默认持有）。提交时合成 `watermark = { ...watermarkConfig, enabled: Boolean(text), text }`；引擎双源兼容（`options.watermarkText || config.text`）。职责：UI 只管文字，样式由系统/模板管理。
- **subtitle**：UI 选择字段 `subtitleSize`/`subtitleStyleName` + 模板对象 `subtitleStyle`（含 color，`applyS2VTemplate` 写入）。提交时合成 `subtitle = { enabled, size, style, color }`。职责：UI 选字号/样式，color 由模板持有。
- 二者均为「UI 字段 + 样式对象」协调结构，禁止后续合并为单个扁平字段（会破坏模板应用与恢复兼容）。

**5. 后续清理候选（R2 已处理项 + 剩余）**
- ✅ `split.speechRate` 死提交字段（normalizer 硬覆盖为 voice.speed）→ **R2 已移除前端字段与提交**（2026-08-09）。
- ✅ `concurrency` / `autoAdvance` 前端字段 → **R2 已移除**（concurrency 由契约默认 3 兜底、autoAdvance 由 params 字面量提供）。
- ✅ `baseWordsPerSecond` 非语言感知疑虑 → **已核实无桌面缺口**（2026-08-09）：`resolveRuntimeStageOptions`（pipeline-engine.js，函数锚）以 normalizer 的 `stageOptions.split.base_words_per_second`（zh 4.5 / en 2.8 / 其余 3.3）恒覆盖 bundled/YAML 静态默认 3.3；契约测试 `pipeline-story2video-contract.test.js`「语言感知基准语速覆盖静态默认」锁定 zh→4.5 / en→2.8 / auto→3.3（覆盖语义由 zh/en 档承担）。Python YAML 3.3 保留为仅影响绕过 JS 语言表的直接 Python 调用的既有行为说明。
- 剩余候选：`project-service._safeOptions` 保留 `voicePitch`（读归一化参数，回读安全）→ 治理目标下可保留并注明；B 类参数运营化（枚举/目录/限额转 ops-center，需 pipeline_configs 基础设施）→ 独立立项。

#### 7.1.20 输出分辨率能力开关（4K，运营后台）（2026-08-09）

**背景**：4K（3840×2160）输出在「2x 中间分辨率 zoompan」下会产生 7680×4320（8K）中间画布，
内存/编码时长爆炸（E2E-PENDING 待办 D 同类，27 场景 run 曾因 4K 中间 30s 超时失败）；
且图片生成只传 `aspect_ratio`（provider 原生分辨率生成后放大），并非真 4K。因此 4K 作为
**运营后台能力开关**（默认关闭）：关闭时前端所有流程不出现 4K、引擎 fail-closed 拒绝 4K。

**1. 配置与下发流程**

| 项 | 说明 |
|----|------|
| 配置键 | `videoCreation.maxOutputResolution`：`'1080p'`（默认，禁止 4K）\| `'4k'`（开启） |
| 优先级 | 环境变量 `MAX_OUTPUT_RESOLUTION`（部署/调试覆盖）→ store 运营配置（`store:get-setting`）→ 默认 `1080p` |
| 写入方 | 运营后台/管理员通过 `storeSetSetting('videoCreation.maxOutputResolution', '4k')` 或启动环境变量开启；前端不提供用户开关 |
| 读取方 | 主进程容器（compose 引擎构造注入）+ renderer（CreateView mount 时 `storeGetSetting` 读取，失败回退 `1080p`） |
| 判定语义 | 以**像素面积**为界：`1080p` 档允许 ≤ 1920×1080 面积（含 720×1280 / 1080×1920 / 1080×1440 竖屏），`4k` 档允许 ≤ 3840×2160 面积 |

**2. 数据校验（引擎 fail-closed）**

| 校验 | 规则 |
|------|------|
| 能力上限 | `validateResolutionCapability(resolution, maxKey)`：面积 > 上限 → 拒绝；`compose()` 与 `renderSegment()` 入口均校验 |
| 未知配置值 | 一律按 `1080p`（fail-closed），不因拼写错误放行 4K |
| 非法分辨率 | 沿用 `parseResolution`（160..7680 钳制 + 像素上限 7680×4320）后进入能力校验 |
| 错误返回 | `{ code: -1, message: '输出分辨率 {W}x{H} 超出当前允许上限（{MAX}，MAX_OUTPUT_RESOLUTION=4k 或运营配置 videoCreation.maxOutputResolution=4k 可开启 4K）' }` |

**3. 功能逻辑**

| 模块 | 逻辑 |
|------|------|
| compose 引擎 | 构造注入 `maxOutputResolution`；`compose()` / `renderSegment()` 入口能力校验；`computeWorkResolution` 长边封顶 3840 且按比例缩放（4K 输出不再产生 8K/方形中间画布） |
| 前端单点 | `src/story2video/output-resolution.js`：`OUTPUT_RESOLUTION_OPTIONS` 全量 5 档、`getOutputResolutionOptions(maxKey)` 过滤、`normalizeResolution(res, maxKey)` 归一化（超限/非法回退到最高允许档） |
| CreateView | 两处分辨率 `<select>`（图片轮播「比例与分辨率」+ 普通流水线「输出设置 分辨率」）均渲染 `outputResolutionOptions`；模板应用与「上次选项」恢复经 `normalizeResolution` 归一化 |
| 历史/模板 | 历史快照或模板含 4K 且开关关闭 → 归一化到 1920×1080，不残留 4K |

**4. 交互逻辑与显示项**

| 开关状态 | 显示项 | 行为 |
|----------|--------|------|
| `1080p`（默认） | 分辨率下拉仅 4 档（720×1280 / 1920×1080 / 1080×1920 / 1080×1440），无 3840×2160 | 模板/历史含 4K 自动归一化；提交 4K 被引擎拒绝（提示见上） |
| `4k` | 下拉含 3840×2160（5 档） | 4K 全链路可用（compose 中间分辨率仍封顶 3840） |
| 读取失败/未知值 | 按 `1080p` | 前端不出现 4K，引擎拒绝 4K |

**5. 配套修复（同次交付）**

| 项 | 说明 |
|----|------|
| 片段编码超时 | `computeSegmentEncodeTimeoutMs` 按「时长×帧率」估算（最低 30s / 上限 5min），替代固定 30s，避免 4K 中间 zoompan 慢速编码被误杀 |
| 编码降档重试 | `_createSegment` 失败时工作分辨率逐级降档（2x → 1.5x → 1x），全部失败才抛错 |
| 提示词优化回退 | prompt-engine 剥离 `<think>` 推理块，仅返回推理时回退原文（详见 7.1.17；配套 prompt-engine 提交 036dc7d / 1cf449c / 61ad3b2 / 3988d54） |

**6. 验收标准**

① 默认（无配置）：前端两处分辨率下拉无 4K、页面无「3840×2160 / 4K」文案；② 模板/历史含 4K 时打开归一化 1920×1080；③ 直接提交 4K（绕过前端）被引擎拒绝并返回明确提示；④ `MAX_OUTPUT_RESOLUTION=4k` 或 store 配置 `4k` 后，前端出现 4K 选项且引擎放行；⑤ compose 4K 输出中间分辨率封顶 3840（无 8K 画布）；⑥ 全部回归：engine 82 / CreateView 108 / output-resolution 8 / 容器 27 测试通过。

#### 7.1.21 运行中任务持久化与托盘后台运行合同（2026-08-09）

**背景**：运行中任务此前只存在主进程内存 `_runs`；应用退出/重启（含 taskkill /F 强杀）后运行中任务**彻底丢失**（不落盘、历史不可见、无法续跑）。本变更实现两件事：
1. **方案B（持久化）**：运行中编排流水线阶段级落盘 running 快照 + 退出兜底保存，重启后历史仍显示「运行中」任务并可「从断点继续」。
2. **方案A（托盘后台）**：关闭窗口时若有运行中任务且托盘可用，隐藏到托盘（进程不退出、后台继续生成），托盘可恢复窗口/退出。

| 合同 | 要求 |
|------|------|
| 运行中快照 | `RunStateStore.saveRunning(run)` 落盘 `status='running'`、`endedAt=null`、`error=null` 的编排快照（owner 隔离语义同失败快照）；`saveFailed` 重构为共用 `_write(run, status)`。 |
| 阶段级 checkpoint | `startOrchestrated` 启动即写一次；`_executeStage` 在 `stageExecutor.execute` **执行前**写一次（阶段级原子性：中断后从当前阶段重新执行，不产生半完成状态）。 |
| 退出兜底 | `PipelineEngine.saveRunningState()` 遍历内存中 `orchestrationMode='orchestrator' && status='running'` 的运行逐个落盘；`shutdown.js performShutdown` **最先**调用（先于热键/调度器/队列清理）。 |
| 完成清理 | 编排 run 进入 `completed` 时 `runStateStore.remove(run.id)` 清理 running 快照（防已完成任务以「运行中」重现历史）；failed/cancelled 由 `saveFailed` 覆盖同文件。 |
| 历史合并 | `getHistory()` 合并 `listFailed()`（failed/cancelled）+ `listRunning()`（仅 running）；按 runId 与内存条目去重。应用重启后 `listRunning()` 返回的 `status=running` 快照自动归一化为 `paused`（因进程已不存在），同时从 `currentStage` 计算 `pausedStage`（阶段名），前端可展示「暂停环节：xxx」。内存中真正在运行的 run 保持 `running` 不变。 |
| 断点恢复 | `resumeOrchestration` 支持 `status='running'` 快照（从中断阶段重建并自动续跑）；失败快照仍要求带 `error`；内存中已 running 的 run 幂等返回 `{ success, runId, alreadyRunning: true }` 不重复创建。 |
| 窗口关闭→托盘 | `window.js` 主窗口 `close` 事件：托盘可用（`systemTray.isAvailable()`）且 `pipelineEngine.hasRunningOrchestration()` → `preventDefault + hide()`（进程继续后台运行）；任一条件不满足照旧关闭退出。 |
| 托盘可用性 | dev 模式 `dist/assets/icon.png` 缺失时回退内嵌 32×32 占位图标（base64），保证 dev 下托盘可用；headless/无托盘环境仍优雅降级。 |
| 托盘退出 | 菜单「退出」改走 `app.quit()`（触发 before-quit → 运行态落盘 + 服务清理），不再 `tray.destroy + mainWindow.destroy`（会绕过清理丢失运行态）。 |
| 前端历史 | running/paused 历史卡片显示「继续生成」按钮（与 failed 的「从断点继续」并列）；paused 卡片额外显示「暂停环节：xxx」提示；点击运行中/暂停/失败/已取消卡片 → 跳回创作页（CreateView 恢复查看/断点继续）；点击已完成卡片 → 视频预览页。 |
| 数据校验 | `saveRunning` 拒绝空 runId（与 saveFailed 一致）；运行中快照上下文保持纯 JSON（可序列化失败即跳过并告警，不阻塞运行）。 |
| 提示文字 | 窗口隐藏时主进程日志「运行中有流水线任务，窗口隐藏到托盘继续后台执行」；前端 running 卡片按钮「继续生成」/恢复中「恢复中...」。 |
| 跨平台（macOS 前瞻） | 窗口关闭行为收敛到 `services/window-close-policy.js`（`shouldHideToTrayOnClose`）：**darwin 不拦截 close**——关闭窗口不退出应用是 macOS 系统约定（进程留在 Dock、任务继续后台运行，`window-all-closed` 在 darwin 不退出、Dock 点击经 `app.on('activate')` 重建窗口）；win32/linux 维持「运行任务+托盘可用 → 隐藏托盘」。托盘图标按平台回退：darwin 使用 16×16 模板图标（`setTemplateImage(true)`，菜单栏明暗自动适配），其余平台用 32×32 占位图。快照原子写入收敛到 `run-state-store.atomicWriteFileSync`：POSIX `renameSync` 原子覆盖优先、Windows `EEXIST/EPERM/EACCES/EBUSY` 回退 `copyFileSync` 覆盖 + 清理临时文件。 |
| 验收标准 | ① 启动流水线后强杀进程重启，历史出现「已暂停」任务（非「运行中」），卡片显示暂停环节名，点击可断点续跑；② 关闭窗口（有运行任务）进程不退出、任务继续，托盘可恢复窗口；③ 无运行任务关闭窗口正常退出；④ 完成后重启历史无「已暂停」残留；⑤ 失败/取消语义不变；⑥（macOS，真机待验收）关闭窗口任务继续后台运行、Dock 点击恢复窗口、菜单栏图标为模板图标且明暗适配。 |

#### 7.1.22 本地克隆音色删除/设为默认与媒体导入反馈合同（2026-08-09）

**背景**：图片轮播流水线 3 个体验缺陷：① 删除本地克隆音色（含 7.1.16 前存量非法 id「01」）恒弹「音色克隆服务暂时不可用，请稍后重试」——`_deleteCloneLocked` 无条件要求远端 `deleteVoice`，而 MiniMax adapter 未实现该 API（官方 clone API 无删除端点），删除本应是**本地管理**操作（移除 registry 记录 + 本地样本 + 偏好）；② 克隆音色「设为默认」点击无反应（前端并发守卫静默丢弃结果）且无默认状态显示；③ 选择背景音乐本地音频弹「无法读取所选文件，请确认文件未被占用或已损坏后重试」——失败原因被折叠为笼统文案且未指明是背景音乐文件。

##### A. 本地克隆音色删除合同（本地管理语义）

| 合同 | 要求 |
|------|------|
| 删除语义 | 删除本地克隆音色 = 移除本地 registry 记录 + 清理 owner-scoped 本地样本目录 + 清理指向该克隆的音色偏好；**不得**因远端删除 API 缺失而失败。 |
| 远端删除可选 | 仅当 adapter 支持 `deleteVoice`（如 ElevenLabs `DELETE /v1/voices/{id}`）时先执行远端删除，沿用 PENDING→REMOTE_DELETED 状态机；远端失败仍返回 `VOICE_CLONE_PROVIDER_UNAVAILABLE`（可重试）。 |
| 能力判定 | `ModelProviderManager.supportsAdapterMethod(providerId, method)`：与 `callAdapter` 使用相同 provider 数据与 adapter 缓存（避免缓存污染），不校验 API Key 有效性（能力是静态契约），任何异常返回 false 不抛异常。 |
| 兼容回退 | 调用方无 `supportsAdapterMethod` 时回退旧行为（尝试远端删除），保证向后兼容。 |
| 本地失败语义 | 本地 registry 写入 / 样本清理 / 偏好清理任一失败：返回 `VOICE_CLONE_STORE_UNAVAILABLE` / `VOICE_CLONE_STORAGE_UNAVAILABLE`，不静默成功。 |
| 提示文字 | 删除成功无额外提示（列表项移除即反馈）；远端不支持时**不得**提示「音色克隆服务暂时不可用」。 |

##### B. 克隆音色设为默认合同（交互与显示）

| 合同 | 要求 |
|------|------|
| 点击流程 | 克隆列表「设为默认」→ 先同步 `s2vConfig.voiceId`（下拉框立即反映）→ IPC `tts-voice:select` 保存偏好 → 成功回写 `s2vPersistedVoiceId`；并发守卫不再静默丢弃（旧请求被新请求覆盖时仍丢弃，防竞态）。 |
| 默认状态显示 | 克隆行按 `voice.id === s2vConfig.voiceId` 显示「默认」徽标（蓝底）+ 行高亮；当前默认克隆的按钮文案变「已设为默认」且禁用（重复选择无意义）。 |
| 无效克隆 | `invalid: true`（存量非法 id）显示「已失效，请重新克隆」徽标，「设为默认」按钮禁用；删除仍可用（本地清理语义）。 |
| 主进程能力 | 有效克隆在目录响应 `voices` 中（`_buildCatalogResponse` 合并 USER_CLONE），`selectVoice` 校验通过即可保存偏好；无效克隆进 `invalidVoices` 不可选。 |
| 数据校验 | `voice.id` 必须存在于 `s2vVoiceOptions`（目录 + 克隆合并去重），不存在返回「所选音色不在当前目录中」；无效克隆按钮禁用不触发调用。 |

##### C. 媒体导入失败反馈细分合同

| 合同 | 要求 |
|------|------|
| 类别宾语 | `resolveMediaImportFailure(result, kindLabel)` 全部细分分支携带 `kindLabel`（图片/旁白音频/背景音乐/视频素材，`story2videoKindLabel(kind)` 统一映射）；主进程拒绝与 IPC 异常两条路径均透传。 |
| 通道放行（系统根因） | `story2video:import-media` 加入主进程 `PUBLIC_CHANNELS`（license-access-control.js）与 preload `PUBLIC_METHODS`（access-control.js）：本地媒体导入是纯设备本地操作（webUtils 解析用户选择路径 → 受控临时目录复制，kind/扩展名/大小校验 + withSenderCheck 可信来源），未登录/未激活许可证也必须可用——此前被按 authenticated 收紧，未登录返回 code:-3「当前许可证无权访问」→ 媒体导入完全不可用（与历史记录 bug PR #428 同类）。 |
| File 透传（系统根因） | `electron-bridge.invoke` 的 `toPlainIpcValue` 对 File/Blob **原样透传**（contextBridge 原生支持；`webUtils.getPathForFile` 依赖真实 File 对象），禁止 JSON 序列化（`JSON.stringify(File)` = `{}` → 路径丢失 → 误报「无法读取所选文件」）；其余对象仍按纯 JSON 脱壳（防 reactive proxy）。 |
| 路径解析失败 | preload `webUtils.getPathForFile` 拿不到 File 本地路径（返回「无法读取媒体文件路径」）→ `MEDIA_PATH_UNRESOLVED`（`story2video.media_path_unresolved`）：文案「无法获取所选{kindLabel}文件的本地路径，请重新选择文件后再试；若持续出现请重启应用。」——不暗示文件损坏。 |
| 文件不可读/被占用 | 主进程「媒体文件不存在或不可读」「媒体文件被占用，请关闭占用程序后重试」及 EBUSY/EPERM/EACCES 原始错误 → `MEDIA_UNREADABLE`：「无法读取所选{kindLabel}文件，请确认文件未被占用或已损坏后重试。」 |
| 有界重试 | `importUserSelectedMedia` 复制文件对 EBUSY/EPERM/EACCES 做 ≤3 次短退避（150ms×n）重试；持续占用回传可读中文原因；非占用类错误原样抛出，禁止无限重试。 |
| 无法识别 | 未匹配任何原因回退 `MEDIA_INVALID`（不泄露内部错误文本）。 |
| 面板防撑宽（2026-08-09 追加） | 展开「音色复制 / 克隆」面板不得把界面撑宽：`.config-grid` 轨道 `minmax(min(200px,100%),1fr)`（窄容器可收缩）+ 网格/flex 子项 `min-width:0` + 克隆名 `.voice-clone-row > span { overflow-wrap:anywhere }`——长不可断内容（MiniMax 生成的克隆 voice_id、长名称）换行而非溢出；回归：真实 chromium 断言（修复前 97px 溢出 → 修复后 0）+ CSS 契约测试（`voice-clone-layout-regression.test.js`）。 |
| 提示文字（中/英） | `MEDIA_PATH_UNRESOLVED`：zh「无法获取所选{kindLabel}文件的本地路径，请重新选择文件后再试；若持续出现请重启应用。」en「Could not resolve the local path of the selected {kindLabel} file. Choose it again; if this keeps happening, restart the app.」 |
| 验收标准 | ① MiniMax 本地克隆「01」点删除 → 列表移除、无「服务不可用」提示、偏好清理、样本目录删除（服务层 33 用例）；② 有效克隆点「设为默认」→ 下拉同步、出现「默认」徽标、按钮变「已设为默认」（CreateView 用例）；③ 选择正常背景音乐 mp3 → 成功显示受控路径且无错误弹窗（真实 Electron 验证：`setInputFiles` 真实 mp3 → bgmPath=selected-media 受控路径、无对话框）；文件被占用/损坏 → 弹「无法读取所选背景音乐文件…」；无法解析路径 → 弹「无法获取所选背景音乐文件的本地路径…」；④ 未登录/未激活许可证下媒体导入可用（license-access-control 用例 + 真实 Electron code 0）；⑤ 既有 7.1.16 无效克隆「删除仍可用」语义保持。 |

#### 7.1.23 视频创作 UI 设计系统与代码-设计分离合同（2026-08-10）

**背景**：视频创作模块 8 个 UI 文件（CreateView.vue 3428 行、CreateHistory.vue 305 行、ResultView.vue 774 行、ReplayTimeline.vue 576 行、ApprovalGateModal.vue 368 行、BoardStageIndicator.vue 170 行、PipelineBrowser.vue 137 行、ProjectCard.vue 182 行）存在严重的样式碎片化问题：57 个硬编码 hex 颜色值、跨文件颜色体系不统一（Cohere 设计系统 vs Element Plus 色系混用）、CSS 变量定义分散、无统一的设计令牌体系。经深度分析后实施代码与设计分离重构。

##### A. 设计令牌体系（Design Tokens）

| 令牌类别 | 变量前缀 | 示例 | 说明 |
|----------|----------|------|------|
| 流水线分类色 | --pipe-* | --pipe-generated: #3b82f6 | 7 种流水线类型各自的品牌色（border + badge bg + text） |
| 稳定性色 | --stability-* | --stability-production: #22c55e | production/beta/experimental 三级 |
| 状态语义色 | --status-* | --status-completed-bg: #d1fae5 | completed/failed/cancelled/running/pending/waiting/needs-user-input 各自的 bg + text |
| 阶段时间线色 | --stage-* | --stage-active-bg | done/active/waiting/failed/pending 阶段状态 |
| Banner/Notice 色 | --banner-* | --banner-warning-bg: #fef3c7 | warning/info/success 三类提示 |
| 成本标签色 | --cost-* | --cost-low: #10b981 | low/medium/high 三级成本 |
| 历史记录色 | --history-* | --history-running-border: #93c5fd | 运行中边框、进度条、提示 |
| 语音克隆色 | --clone-* | --clone-invalid-bg: #fef3c7 | 无效/默认克隆的徽标色 |

##### B. Token 文件结构

| 文件 | 位置 | 职责 |
|------|------|------|
| cohere-design-system.css | src/styles/ | 全局基础令牌（颜色、间距、圆角、布局） |
| ideo-creation-tokens.css | src/styles/ | 视频创作专用令牌（流水线分类色、状态色、Banner 色等），继承全局令牌 |
| main.js | src/ | 按顺序导入两个样式文件 |

##### C. 暗色模式支持

ideo-creation-tokens.css 内含 [data-theme="dark"] 完整覆盖层：
- 所有 --status-*-bg 切换为暗色背景
- 所有 --status-*-text 切换为亮色文字
- Banner 色系适配暗色对比度
- 语音克隆徽标适配暗色
- 不依赖外部暗色主题库，纯 CSS 变量驱动

##### D. 硬编码颜色消除进度

| 文件 | 优化前 | 优化后 | 说明 |
|------|--------|--------|------|
| CreateView.vue | 57 个唯一 hex | 11 个（均为 var() fallback） | 核心组件，消除 80% 硬编码 |
| CreateHistory.vue | 24 个 | 2 个（均为 var() fallback） | 历史记录页 |
| ResultView.vue | 8 个 | 0 个 | 结果预览页完全使用令牌 |
| ReplayTimeline.vue | 18 个 | 8 个（均为 var() fallback） | 回放时间线 |
| ApprovalGateModal.vue | 13 个 | 未改（Element Plus 色系独立） | 审批弹窗 |
| BoardStageIndicator.vue | 7 个 | 未改（Element Plus 色系独立） | 阶段指示器 |
| PipelineBrowser.vue | 14 个 | 未改（与 CreateView 同色系） | 流水线浏览 |
| ProjectCard.vue | 12 个 | 未改（Element Plus 色系独立） | 项目卡片 |

##### E. 数据校验与边界

| 校验项 | 合同 |
|--------|------|
| Token 定义完整性 | ideo-creation-tokens.css 必须覆盖所有 --status-*、--pipe-*、--stability-* 变量；缺失变量导致 CSS 回退到硬编码色时，CI 视觉回归应捕获差异 |
| 暗色模式对比度 | 暗色模式下所有文字色与背景色对比度 >= 4.5:1（WCAG AA）；Banner 提示文字 >= 3:1 |
| var() fallback 一致性 | --status-completed-bg 的 fallback #d1fae5 必须与 Token 定义值一致；修改 Token 时必须同步更新所有 fallback |
| 导入顺序 | ideo-creation-tokens.css 必须在 cohere-design-system.css 之后导入，确保全局 Token 先定义 |
| Scoped 样式隔离 | CreateView.vue 等组件的 <style scoped> 中引用 ar(--xxx) 时，Token 定义必须在全局作用域（:root），不能在 scoped 内定义 |

##### F. 流程与交互逻辑

| 功能模块 | 交互逻辑 | 显示项 |
|----------|----------|--------|
| 流水线卡片网格 | 7 种分类各有独立品牌色 border-left + badge；hover 时 translateY(-2px) + border-color: var(--primary) | 卡片标题、描述、阶段数、成本标签、可用性徽标、稳定性圆点 |
| 阶段时间线 | sticky 进度条 + 各阶段状态色；running 阶段蓝色高亮；failed 阶段红色 | 进度百分比、已用时、完成摘要、各阶段名+状态+耗时 |
| S2V 配置面板 | 5 个折叠区（基础/画面/声音/高级/发布）；每个区 summary 显示当前配置摘要 | 各表单项标签+值+提示文字 |
| 历史记录 | 渲染记录 tab + 流水线记录 tab；运行中任务蓝色边框 + 提示横幅 | 任务名、状态徽标、时间、阶段进度条 |
| 错误弹窗 | 错误消息 + 详情 + 恢复按钮（可恢复场景）/ 关闭按钮（不可恢复场景） | 错误文案、恢复提示、内容政策提示 |

##### G. 验收标准

1. 所有 ideo-creation-tokens.css 中定义的 Token 在 CreateView.vue、CreateHistory.vue、ResultView.vue 的 CSS 中被引用
2. CreateView.vue <style scoped> 中唯一剩余的 hex 值均为 ar(--xxx, #fallback) 格式的 fallback 值
3. 暗色模式（[data-theme="dark"]）下所有状态色、Banner 色、历史记录色正确显示
4. Vite build 无编译错误；195 个相关测试全部通过
5. 视觉回归测试（如有基线截图）无意外差异



#### 7.1.24 视频创作模块 UI/UX 深度优化（2026-08-10）

**背景**：在 7.1.23 设计令牌体系基础上，对视频创作模块 8 个前端文件（共 6099 行）进行 UI/UX 深度优化，覆盖可访问性、交互体验、视觉一致性、加载状态、空状态等维度。

##### A. 可访问性（Accessibility）

| 优化项 | 优化前 | 优化后 | 影响文件 |
|--------|--------|--------|----------|
| 流水线卡片键盘导航 | 仅支持鼠标点击 | tabindex="0" + role="button" + @keydown.enter | CreateView.vue, PipelineBrowser.vue |
| 流水线卡片 ARIA 标签 | 无 aria-label | :aria-label="pipelineName(p.name)" | CreateView.vue, PipelineBrowser.vue |
| 历史记录卡片键盘导航 | 仅支持鼠标点击 | tabindex="0" + role="button" + @keydown.enter | CreateHistory.vue |
| 焦点可见性 | 无 focus 样式 | .pipeline-card:focus-visible, .render-card:focus-visible, .history-item:focus-visible 统一 outline: 2px solid var(--primary) | CreateView.vue, CreateHistory.vue, PipelineBrowser.vue |

##### B. 视觉一致性

| 优化项 | 优化前 | 优化后 | 说明 |
|--------|--------|--------|------|
| 页面布局 | CreateView: padding 24px, max-width 1100px; CreateHistory: padding 24px 32px, max-width 1080px | 统一为 padding: 24px 32px, max-width: 1080px | 两页面布局对齐 |
| 页面标题间距 | CreateView: margin-bottom 24px; CreateHistory: margin-bottom 20px | 统一为 margin-bottom: 20px | 标题下方间距一致 |
| H1 字号 | CreateView: 24px; CreateHistory: 26px | 统一为 24px | 标题字号一致 |
| 流水线卡片圆角 | CreateView: 12px; PipelineBrowser: 8px; CreateHistory: 10px | 统一为 12px | 卡片圆角一致 |
| 流水线卡片内边距 | CreateView: 20px; PipelineBrowser: 16px; CreateHistory: 16px 20px | 统一为 16px 20px | 卡片内边距一致 |
| 进度条过渡动画 | 无过渡 | transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1) | 进度条平滑过渡 |
| BoardStageIndicator 样式隔离 | <style>（全局泄漏） | <style scoped> | 防止 CSS 污染 |

##### C. 设计令牌扩展

| 新增令牌类别 | 变量前缀 | 示例 | 说明 |
|-------------|----------|------|------|
| Upload Zone 拖拽反馈 | --upload-zone-* | --upload-zone-hover-border: var(--primary) | 上传区域拖拽时的边框和背景色 |
| 骨架屏加载 | --skeleton-* | --skeleton-bg: #e5e7eb | 骨架屏背景和微光动画色 |

##### D. 上传区域交互增强

| 交互状态 | 视觉反馈 | CSS 类 |
|----------|----------|--------|
| 默认 | 2px dashed border | .upload-zone |
| 拖拽悬停 | 边框变为主题色 + 浅色背景 | .upload-zone.drag-over |
| 按下 | 边框变为主题色 + 浅色背景 | .upload-zone:active |

##### E. 空状态优化

| 位置 | 优化前 | 优化后 |
|------|--------|--------|
| 渲染记录为空 | "暂无渲染记录" + 按钮 | 🎬 图标 + "暂无渲染记录" + 提示文字 + 按钮 |
| 流水线记录为空 | "暂无流水线运行记录" + 按钮 | 🔄 图标 + "暂无流水线运行记录" + 提示文字 + 按钮 |
| 错误弹窗（不可恢复） | 仅错误消息 + 关闭按钮 | 错误消息 + 关闭按钮 + "如问题持续出现，请检查日志或重新启动流水线" 提示 |

##### F. 骨架屏加载样式

| 样式类 | 用途 | 动画 |
|--------|------|------|
| .skeleton | 骨架屏基础容器 | 微光动画（shimmer） |
| .skeleton-text | 文字行骨架 | 14px 高度 |
| .skeleton-card | 卡片骨架 | 120px 高度 + 12px 圆角 |

##### G. 数据校验与边界

| 校验项 | 合同 |
|--------|------|
| ARIA 标签完整性 | 所有可交互卡片必须有 aria-label，且值为用户可见的名称文本 |
| 键盘导航 | Tab 键可聚焦所有可交互卡片，Enter 键可激活 |
| 焦点可见性 | focus-visible 样式必须使用 outline（不改变布局），颜色为 var(--primary) |
| 样式隔离 | BoardStageIndicator.vue 必须使用 scoped 样式，防止全局 CSS 污染 |
| 骨架屏 Token | --skeleton-bg 和 --skeleton-shimmer 必须在 :root 和 [data-theme="dark"] 中同时定义 |

##### H. 验收标准

1. 所有可交互卡片（pipeline-card、render-card、pipeline-card、history-item）支持 Tab 键聚焦 + Enter 键激活
2. Tab 键聚焦时显示 2px solid var(--primary) 焦点环
3. 页面布局、卡片圆角、卡片内边距在 CreateView 和 CreateHistory 中完全一致
4. 进度条过渡动画为 0.4s cubic-bezier(0.4, 0, 0.2, 1)
5. 上传区域拖拽悬停时边框变为主题色
6. 空状态显示图标 + 提示文字 + 操作按钮
7. BoardStageIndicator 使用 scoped 样式
8. 158 个相关测试全部通过
9. Vite build 无编译错误

#### 7.1.25 视频+图片轮播混合流水线（AI 视频片段 + 图片轮播组合，2026-08-11）

**背景与目标**：当前 Story2Video 流水线只有「图片轮播」一种视觉形态；AI 视频（videogen 体系）与图片轮播是两套独立流水线。混合模式把两者整合进同一流水线：只把「最值得动态化」的场景（约占总时长 20%-40%）交给 AI 视频生成，其余场景继续图片轮播，在表现力与成本（Token/额度/耗时）之间取得平衡。用户可选两种控制方式：

| 模式 | 语义 | 默认参数 |
|------|------|----------|
| `off`（默认） | 纯图片轮播，行为与旧版完全一致 | — |
| `fixed`（固定比例） | 成片**前段**按顺序累计约 20%-30%（默认 25%）时长的场景使用 AI 视频 | fixedRatio=25（范围 10-50，步进 5） |
| `ai-judged`（AI 智能选择） | LLM 依据场景文案/提示词评估「精彩度（excitement）」，选出适合 AI 视频的场景，总时长占比约束在区间内 | minRatio=20 / maxRatio=40（min 5-50、max 10-80，步进 5），maxScenes=3（1-12） |

**数据校验（normalizer 白名单，story2video-text-config.js）**：

| 字段 | 类型/枚举 | 默认 | 边界 | 失败行为 |
|------|-----------|------|------|----------|
| `video.mode` | off/fixed/ai-judged | off | — | 非法值报错「video.mode 值无效」，流水线不启动 |
| `video.provider` | string id | '' | 空=运行时解析默认视频生成器；非空须匹配 `[a-zA-Z0-9._:@/-]+` | 非法字符报错「video.provider 格式无效」 |
| `video.model` | string id | '' | 同上 | 同上 |
| `video.fixedRatio` | int % | 25 | 10-50 | 越界报错「video.fixedRatio 必须在 10-50 范围内」 |
| `video.minRatio` | int % | 20 | 5-80 | 越界报错 |
| `video.maxRatio` | int % | 40 | 5-80 | 越界报错 |
| `video.maxScenes` | int | 3 | 1-12 | 越界报错 |
| minRatio ≤ maxRatio | — | — | — | 违反报错「video.minRatio 不能大于 video.maxRatio」 |
| 未知字段 | — | — | — | 忽略，不污染归一化结果 |
| 顶层扁平参数 | `params.videoMode/videoProvider/videoModel` | — | 兼容旧调用方 | 与 story2videoTextConfig.video 同源归一化 |

**流水线流程（阶段顺序）**：

```
split → domain_enrich → optimize → select_video_scenes（新增） → generate_assets（扩展） → compose（扩展） → publish
```

1. **select_video_scenes**（type `story2video_select_video_scenes`）：
   - 输入：`context.optimize`（优化后的逐场景提示词）+ `context.split/domain_enrich`（逐场景文案）+ video 配置。
   - `off`：直接输出空 plan（`{ mode:'off', scenes:[], ratio:0, selectedCount:0 }`），不校验视频生成器。
   - `fixed`：按场景顺序累计估算时长（每场景时长 = sentence.duration 优先，否则 split.targetSeconds 默认 6s），标记累计占比首次达到 fixedRatio% 的场景（含边界场景）；至少标记 1 个场景。
   - `ai-judged`：默认 LLM 输入场景列表（index/text/prompt/seconds + 区间与数量约束），要求返回严格 JSON 数组 `[{index, video, excitement(1-10), reason}]`；逐条校验 index 合法（越界/重复/非 JSON → fail closed，提示「AI 智能选择结果无法解析，请重试或改用固定比例模式」）。
   - **比例钳制**：按 excitement 降序排列候选；超 maxRatio 从低 excitement 剔除；不足 minRatio 按高 excitement 补入；受 maxScenes 截断；全部剔除后保留最高 excitement 单场景（保证开启混合模式必有 ≥1 个视频场景）。
   - **前置校验**：mode ≠ off 时必须解析视频生成器（显式 provider/model 优先，否则 `_modelProviderManager.getDefault('video')`）；解析失败 fail closed：「视频生成器未配置，请在设置中添加支持视频生成的模型（视频增强模式需要视频生成能力）」。
   - 输出 `context.video_plan = { mode, provider, model, scenes:[{index,useVideo,excitement,reason,seconds}], ratio, selectedCount, totalSeconds }`。
2. **generate_assets（扩展）**：
   - 视频场景（useVideo=true）：串行调用视频适配器 `generateVideo({prompt, model, width, height, numFrames, frameRate})` → 轮询 `getVideoStatus`（间隔 10s，上限 10 分钟）→ 下载到 `%TEMP%/story2video/videoscenes/<runId>/scene_video_<index>.mp4`；**不再生成图片**（省额度）。
   - 视频生成失败：回退图片轮播（复用已生成图片或补生成图），不中断整条流水线；补图也失败则按既有 allowPartialAssets 语义处理。
   - 图片场景与 TTS：行为与旧版一致（并发、RPM 预算、内容政策检查点、断点续传均保留）。
   - 断点续传快照 `completed` 项新增 `videoPath`；旧快照无该字段兼容。
   - 子进度：`assets_progress` 新增 `videosDone/videosTotal`（视频场景数）；前端在 videosTotal>0 时展示「图片 x/y · 视频 a/b · 旁白 x/y」。
3. **compose（扩展）**：
   - 场景画面源：AI 视频场景 `videoPath`（kind video，mp4/mov/webm/mkv/avi，≤512MB，必须在允许根内）或图片场景 `imagePath` 二选一，`audioPath` 必有；双源冲突时 videoPath 优先；源不可读/越界 → 明确错误「Scene media path is not allowed or unreadable at index N」。
   - 视频片段编码：AI 视频 `-stream_loop -1`（覆盖「视频短于旁白」）→ 等比缩放 + 黑边补齐（`scale=force_original_aspect_ratio=decrease,pad=...`）→ 帧率归一化 → 字幕/水印滤镜 → 按片段有效时长（follow-audio 跟随旁白 / min-duration 静音补齐语义不变）→ 混入 TTS → 降档重试（2x/1.5x/1x）。
   - 片段记录新增 `mediaKind: 'video' | 'image'`；转场拼接/BGM/WebM 转码/校验全部复用既有管线。

**功能逻辑与成本控制**：
- 视频生成并发恒为 1（系统管理，不暴露 UI），图片/TTS 并发不受影响；`maxScenes` 兜底限制视频生成数量，避免长视频超预算。
- 分辨率：优先输出 size（如 720x1280），否则按宽高比映射默认档（16:9→1280x720、9:16→720x1280、1:1→1024x1024、4:3→1280x960、3:4→960x1280）；生成后统一 scale 到目标分辨率。
- 帧数：按场景估算时长取档（≤5s→121、≤8s→201、≤10s→241、其余 441，24fps 近似 8n+1 规则）。

**交互逻辑与显示项（CreateView）**：

| 控件 | 位置 | 选项/说明 | testid |
|------|------|-----------|--------|
| 视频增强模式 | 新折叠区「视频增强」（画面区之后） | 关闭（纯图片轮播）/ 固定比例（成片前段 AI 视频）/ AI 智能选择（最精彩场景） | s2v-video-mode |
| 视频生成器 | 同区，mode≠off 时显示 | 已启用且已配置的视频能力 provider 下拉；空列表提示「未找到可用的视频生成器，请先在「模型服务商」中配置并启用支持视频生成的模型」 | s2v-video-provider |
| AI 视频占比（fixed） | 同区，mode=fixed 时显示 | 滑杆 10-50 步进 5，默认 25；提示「成片前约 X% 时长的场景使用 AI 视频（建议 20%-30%）」 | s2v-video-fixed-ratio |
| AI 视频占比区间（ai-judged） | 同区，mode=ai-judged 时显示 | 最少 5-50、最多 10-80 双滑杆，默认 20/40；提示「AI 根据场景精彩度自动选择视频片段，总占比控制在区间内（默认 20%-40%）；可生成场景数上限 3 个」 | s2v-video-min-ratio / s2v-video-max-ratio |
| 折叠区摘要 | 视频增强区标题右侧 | 关闭 / 固定 25% / AI 判断 20%-40% | — |
| 阶段时间轴 | 阶段清单 | 新增 `select_video_scenes` 阶段（optimize 与 generate_assets 之间） | story2video-stage-select_video_scenes |
| 阶段详情文案 | select_video_scenes 完成/运行 | 「已选 N 个 AI 视频场景（约 X%）」；off 模式显示「纯图片轮播模式」 | — |
| generate_assets 详情 | 资源生成中 | videosTotal>0 时「图片 x/y · 视频 a/b · 旁白 x/y」，否则维持旧文案 | — |

**提示文字清单**：
- 配置区成本提示：「AI 视频更贵也更慢，仅用于最值得动态化的场景；其余场景继续图片轮播，节省额度。」
- select_video_scenes 失败（未配置视频生成器）：「视频生成器未配置，请在设置中添加支持视频生成的模型（视频增强模式需要视频生成能力）」。
- ai-judged 解析失败：「AI 智能选择结果无法解析，请重试或改用固定比例模式」。
- 默认 LLM 不可用（ai-judged 需要 LLM 评估）：「默认 LLM 不可用，AI 智能选择需要先完成模型设置」。

**真实运行稳定性与错误可诊断性（2026-08-11 补充）**：
- compose 的 xfade/acrossfade 合并编码超时 SHALL 按输出时长动态计算（`computeMergeEncodeTimeoutMs` = max(2 分钟, 输出时长×3 + 2 分钟)），不得使用固定 120s——长视频（≥2 分钟成片、27 场景约 337s）的 chunk 合并会全量重编码超过 2 分钟，固定超时会导致 compose 偶发失败。回归：真实 27 场景成片（334.4s/52.9MB）须可稳定产出。
- 视频 provider 的**业务错误响应**（HTTP 200 + 业务错误码，如 MiniMax `base_resp.status_code=2056`「已达到 Token Plan 用量上限」）SHALL 在 adapter 层解析为可读错误并映射 `QUOTA_EXCEEDED`，禁止误报为 `Missing task_id in response`；generateVideo 与 getVideoStatus 均须覆盖。真实用户遇到额度用尽时应看到明确提示（升级 Token Plan / 补充用量），而非误导性技术错误。

**降级与失败策略**：
1. 视频 provider 未配置 → select_video_scenes fail closed（不进入资源生成）。
2. 单个视频场景生成失败 → 回退图片轮播（复用/补生成图）；视频不中断整条流水线。
3. 视频全部失败 → 成片退化为图片轮播；若 allowPartialAssets 关闭且图片也失败 → 既有失败语义（断点续跑记录已完成场景）。
4. `off` 模式：全链路零变化（新增阶段直接输出空 plan，不调用 LLM/视频 provider）。

**验收标准**：
1. `video.mode='off'` 时流水线行为与旧版一致（阶段多一步 select_video_scenes 但快速通过）。
2. fixed 模式：前段场景按顺序标记，实际占比落在 [10,50] 且记录 actualRatio。
3. ai-judged 模式：LLM 选择结果满足 [minRatio, maxRatio] ∩ maxScenes，越界自动钳制；解析失败 fail closed。
4. 混合成片：视频场景片段以 AI 视频为基底（mediaKind='video'），图片场景 zoompan（mediaKind='image'），顺序与场景一致，字幕/BGM/转场正常。
5. 断点续跑：已完成视频场景复用本地 videoPath，不重复调用视频生成。
6. 前端构建无编译错误；相关单测/集成测试全绿。

#### 7.1.26 视频创作子组件 CSS 代码-设计分离扩展（2026-08-11）

**背景**：在 7.1.23 设计令牌体系基础上，继续将视频创作模块剩余 4 个子组件的内联 scoped CSS 提取到独立 CSS 文件，实现代码与设计的彻底分离。此前 CreateView.vue 和 CreateHistory.vue 已完成分离（见 7.1.23），本次覆盖 PipelineSelector、StageProgress、ConfigSummary、ErrorDialog 四个子组件。

##### A. CSS 文件提取清单

| 组件 Vue 文件 | 提取的 CSS 文件 | CSS 行数 | 移除的 scoped 样式行数 | 职责 |
|---------------|----------------|----------|----------------------|------|
| PipelineSelector.vue | src/styles/pipeline-selector.css | 192 行 | ~193 行 | 流水线选择卡片网格布局、卡片悬停/聚焦样式、分类徽标、可用性/稳定性指示器、响应式断点 |
| StageProgress.vue | src/styles/stage-progress.css | 192 行 | ~193 行 | 阶段时间线进度条、阶段状态色（done/active/waiting/failed/pending）、粘性头部、compose 子进度条 |
| ConfigSummary.vue | src/styles/config-summary.css | 70 行 | ~70 行 | S2V 配置面板折叠区摘要、表单项标签/值/提示文字排版、折叠区 summary 摘要行 |
| ErrorDialog.vue | src/styles/error-dialog.css | 147 行 | ~144 行 | 错误弹窗容器、错误消息/详情区域、恢复按钮/关闭按钮样式、内容政策提示区 |

##### B. 导入机制

所有提取的 CSS 文件通过 Vue 单文件组件的 `<style src="...">` 机制导入，不改变运行时行为：

```vue
<!-- 示例：PipelineSelector.vue -->
<style src="../../styles/pipeline-selector.css" scoped></style>
```

- **Vite 构建**：`<style src="...">` 在 Vite 构建时自动解析并注入，行为等同于内联 `<style>` 块
- **作用域隔离**：`scoped` 属性保留，确保 CSS 只作用于当前组件 DOM
- **无 HMR 影响**：Vite HMR 对外部 CSS 文件的热更新与内联样式一致

##### C. 设计令牌引用

提取后的 CSS 文件继续引用 7.1.23 定义的设计令牌（video-creation-tokens.css），主要引用：

| 令牌类别 | 引用变量示例 | 使用位置 |
|----------|-------------|----------|
| 阶段时间线色 | --stage-done-bg, --stage-active-bg, --stage-waiting-bg, --stage-failed-bg, --stage-pending-bg | StageProgress.vue 进度条 |
| 状态语义色 | --status-completed-bg, --status-failed-bg | PipelineSelector.vue 状态徽标 |
| 流水线分类色 | --pipe-story2video, --pipe-image-carousel 等 | PipelineSelector.vue 卡片边框 |
| Banner/Notice 色 | --banner-warning-bg, --banner-info-bg | ErrorDialog.vue 提示区 |
| 全局令牌 | --primary, --text-primary, --text-secondary, --border-color | 所有 CSS 文件 |

##### D. 暗色模式兼容

所有提取的 CSS 文件在 video-creation-tokens.css 的 `[data-theme="dark"]` 覆盖层中已有对应暗色值。CSS 文件本身不包含独立的暗色模式定义，完全依赖 Token 层驱动。

##### E. 数据校验与边界

| 校验项 | 合同 |
|--------|------|
| scoped 作用域 | 每个 Vue 组件必须保留 scoped 属性，防止全局 CSS 污染 |
| CSS 文件路径 | `<style src="...">` 路径必须使用相对路径，从 Vue 文件位置到 src/styles/ |
| Token 完整性 | 提取后的 CSS 文件引用的所有 var(--xxx) 必须在 video-creation-tokens.css 中有定义 |
| 构建验证 | vite build 无编译错误，CSS 文件正确打包进产物 |
| 测试覆盖 | 所有受影响组件的单元测试必须通过（Vitest） |

##### F. 流程与交互逻辑（保持不变）

CSS 提取不改变任何组件的功能逻辑、交互逻辑或显示项。以下为受影响组件的核心交互摘要：

| 组件 | 核心交互 | 显示项 |
|------|----------|--------|
| PipelineSelector | 点击卡片选择流水线、Enter 键激活、hover 高亮 | 流水线名称、描述、阶段数、成本标签、可用性徽标、稳定性圆点 |
| StageProgress | 阶段时间线自动滚动到活跃阶段、粘性头部固定 | 进度百分比、已用时、完成摘要、各阶段名+状态+耗时、compose 子进度 |
| ConfigSummary | 折叠区展开/收起、摘要行显示当前配置 | 基础/画面/声音/高级/发布 各区的配置摘要 |
| ErrorDialog | 恢复按钮点击后重试、关闭按钮关闭弹窗 | 错误消息、错误详情、恢复提示、内容政策提示 |

##### G. 验收标准

1. 4 个 Vue 组件的 `<style>` 块均已替换为 `<style src="..." scoped>` 引用
2. 4 个独立 CSS 文件存在于 src/styles/ 目录
3. Vite build 无编译错误
4. 所有受影响组件的单元测试通过
5. 组件运行时样式与提取前完全一致（无视觉回归）
6. 暗色模式下所有组件样式正确显示


### 7.2 上传图片快速渲染（独立路径）

```
进入「视频创作」→ 选择「快速渲染」的图片模式
    │
    ├─ 拖拽或点击上传多张图片（每张约 5 秒）
    ├─ 选择输出平台 + 主题
    ├─ 点击「开始渲染」
    └─ 走独立 Remotion 快速渲染流程，不创建图片轮播流水线项目
```

### 7.3 AI 写稿

在文本模式下点击「AI 写稿」，调用已配置的 LLM Provider 自动生成视频脚本，节省创作时间。

### 7.4 模型服务商设置（AI 服务商管理）

```
进入「模型服务商设置」页面
    │
    ├─ 查看已配置的服务商列表
    │   ├─ 按类别过滤：全部 / 推理模型 / TTS语音 / 语音识别 / 图片生成 / 视频模型
    │   ├─ 查看每个服务商的 Base URL、模型列表、API Key 状态、启用状态
    │   ├─ 默认服务商标记（★ 图标）
    │   └─ 支持测试连接、编辑、启用/禁用
    │
    ├─ 添加新的服务商
    │   ├─ 第一步：选择模型类别
    │   ├─ 第二步：从预设列表选择 或 自定义
    │   ├─ 第三步：填写 API Key + Base URL + 模型列表
    │   └─ 预设服务商的 Base URL 自动填充
    │
    ├─ 设为默认
    │   ├─ 每个类别只能有一个默认服务商
    │   ├─ 未配置 API Key 的服务商不能设为默认
    │   └─ 设置新默认时自动取消同类别旧的默认
    │
    ├─ 删除规则
    │   ├─ 预设服务商：删除 = 软删除（从列表隐藏 + 清除 API Key + 禁用），
    │   │   可在「添加服务商 → 预设目录」中重新添加并恢复配置
    │   └─ 自定义服务商：物理删除，二次确认
    │
    ├─ 测试连接
    │   ├─ 成功：仅显示「✅ 连接成功」，不展示技术性响应体（如 {"success":true}）
    │   └─ 失败：显示友好错误原因，必要时附可读 detail（原始技术对象不外泄）
    │
    └─ 服务商用于：
        ├─ 推理模型 → AI 写稿、标题生成、内容智能、视频创作 LLM 选择
        ├─ TTS 语音 → 视频配音、语音合成
        ├─ 语音识别 → 字幕生成、语音转文字
        ├─ 图片生成 → AI 图片生成（封面、配图）
        ├─ 视频模型 → AI 视频生成（Hunyuan/Kling/Runway 等）
        └─ 多模态模型 → 一个 API Key 覆盖多个能力（见 7.4.1）
```

### 7.4.1 多模态模型类别（2026-08-08 新增）

**需求**：模型设置新增「多模态模型」类别；预设模型必须声明支持多模态（文字推理 / TTS语音 / 语音识别 / 视觉识别 / 生图 / 生成视频 中**至少 2 项**能力）；前端只需填写**一个 API Key**，并提供「优先使用多模态模型进行所有的AI操作」开关（**默认勾选**）；流水线按能力调用模型时，若多模态模型声明支持该能力则优先使用它。

| 合同 | 要求 |
|------|------|
| 类别与标签 | 后端 `CATEGORIES.MULTIMODAL='multimodal'`、`CATEGORY_LABELS.multimodal='多模态模型'`；前端「模型服务商设置」类别筛选/新增类别卡片/服务商卡片标签同步新增（图标 🌐）。页面副标题更新为「七类 AI 服务商」。 |
| 预设能力声明 | `model-provider-seeds` 中多模态预设必须携带 `capabilities: string[]`（取值于 `llm/tts/speech_recognition/image/video`）与 `capability_models: { [cap]: modelId }`；能力数必须 ≥ `MULTIMODAL_MIN_CAPABILITIES(2)`；每个声明能力必须给出对应默认模型。预设能力持久化：种子写入行 `config.capabilities` / `config.capability_models`；`_syncPresetCapabilities()` 对存量预设行回填（不覆盖已存在的能力配置）。 |
| 预设（MiniMax） | 新增预设 `minimax-multimodal`（名称「MiniMax」，`base_url=https://api.minimaxi.com/v1`），声明能力 `['llm','tts','image','video']`（≥2），能力默认模型 `{ llm:'MiniMax-M2.7', tts:'speech-2.8-turbo', image:'image-01', video:'MiniMax-Hailuo-2.3' }`；仅需填一个 API Key。 |
| 多模态适配器 | 新增 `MinimaxMultimodalAdapter`（`adapters/minimax-multimodal.js`）：组合既有 MiniMax LLM / TTS / Image / Video 四个适配器并按方法委托（chatCompletion/streamChat → LLM，synthesize/listVoices/cloneVoice → TTS，generateImage → Image，generateVideo/getVideoStatus → Video）；`capabilities()` 覆盖 `chatCompletion/streamChat/synthesize/listVoices/cloneVoice/generateImage/generateVideo/getVideoStatus`，不含 `transcribe`。 |
| 能力→调用方法映射 | `ai-generator.TYPE_TO_METHOD` 为能力到 Adapter 方法的一对一映射（`llm→chatCompletion`、`tts→synthesize`、`image→generateImage`、`video→generateVideo`、`speech_recognition→transcribe`）；多模态 provider 按能力选择 `capability_models[type]` 后走与单类型模型完全相同的调用方法（MiniMax 文字推理走 OpenAI 兼容 `POST /v1/chat/completions`，与单类型 MiniMax LLM 一致；TTS 走 t2a_async_v2 异步；生图走 images_generation；视频走 video_generation）。 |
| 能力同步升级 | `_syncPresetCapabilities()` 升级为 diff-merge：存量预设行只合并新增能力（保留用户已有能力与模型选择，不整体覆盖），保证旧版本数据库升级后也能拿到新增的 `llm` 能力。 |
| 优先开关 | 主进程 `ModelProviderManager.getMultimodalPreference()`（默认 true，`settings` 表 user 级 key `prefer_multimodal`）/ `setMultimodalPreference(value)`；前端「模型服务商设置」页头部复选框「优先使用多模态模型进行所有的AI操作」（默认勾选，保存即持久化）。 |
| 能力路由 | `getDefault(category)`：开启偏好 且 多模态 provider（category=multimodal）已配置（enabled=1 + 可用 Key）且 `config.capabilities` 包含该能力 → 直接返回该多模态 provider；否则回退类别内默认。未开启 / 未配置 / 未声明能力 → 原逻辑不变。**video 能力特例**：多模态 provider 参与 video 默认路由必须同时满足 `config.capability_enabled.video === true`（「支持生成视频」开关），缺省/关闭时视为不支持视频，video 默认回落显式视频模型（如 Agnes Video）。 |
| 能力模型选择 | `ai-generator.generateWithDefault(type)`：模型优先取 `provider.capability_models[type]`，否则回退 `provider.models[0]`（多模态 provider 按能力选对模型，避免 TTS/生图/视频混用同一模型）。 |
| 流水线空 provider 兜底 | story2video `generate_assets`：未显式指定 image/voice provider（assetGenerator 路径）时，按能力调用 `getDefault('image'/'tts')` 解析（开启偏好即用多模态模型），legacy python 路径保持空 provider 原行为。显式下拉选择的服务商优先，不受开关影响。 |
| 数据校验 | `createProvider/updateProvider` 类别校验覆盖 `multimodal`；自定义多模态服务商通过 `config.capabilities` / `config.capability_models` 声明（同样 ≥2 项校验由预设层保证，自定义仅提示）。 |
| 交互与显示 | 服务商卡片与预设卡片展示能力 chips（文字推理/TTS语音/语音识别/生图/生成视频，多语言标签）；新增/编辑对话框对 `multimodal` 类别只展示 API Key 与预设能力提示（**隐藏 Base URL 输入**，预设 Base URL 由系统写死），同时隐藏模型列表输入（单模型收敛 / 预设模型由能力映射决定）。**「支持生成视频」开关（2026-08-10 新增）**：多模态表单新增复选框「支持生成视频（默认关闭）」，读写 `config.capability_enabled.video`；新建 minimax-multimodal 默认关闭。 |
| 验收标准 | ① 模型设置新增「多模态模型」类别，预设 MiniMax 显示 4 项能力 chips（文字推理/TTS语音/生图/生成视频）；② 多模态表单只填 API Key（无 Base URL 输入）保存成功；③ 勾选开关后 `getDefault('llm'/'tts'/'image')` 返回多模态 provider，取消勾选后返回类别 provider；`getDefault('video')` 仅在「支持生成视频」开关开启时返回多模态 provider，缺省/关闭时回落视频类别默认（如 Agnes Video），且不影响 llm/tts/image 路由；④ MiniMax 多模态 LLM 走 OpenAI 兼容 chat/completions、TTS 走 t2a_async_v2 异步、生图/视频走各自端点；⑤ 流水线在未显式指定 provider 时优先使用多模态模型；⑥ 真实 provider 账号配置后可跑通 LLM/TTS/生图/视频全链路 E2E。 |

### 7.4.1.1 多模态模型作为能力选择器与音色目录（2026-08-09 新增）

**需求**：用户只保留一个多模态模型（`minimax-multimodal`）即可覆盖图片生成 / TTS 音色 / 文字推理 / 视频生成等全部能力。能力选择器（Story2Video「图片生成器」「语音生成器」下拉）与 TTS 音色目录必须把**已启用且声明支持对应能力**的多模态模型视为合格候选；删除全部单能力模型后，能力下拉仍能选用多模态模型，音色目录/克隆能力保持可用。

| 合同 | 要求 |
|------|------|
| 能力选择器合并 | `ModelProviderManager.listProviders(category)`：当 `category` 为能力（llm/tts/image/video 等，**非** multimodal）时，在类别结果后追加 **已启用（enabled=1）且 `config.capabilities` 包含该能力** 的多模态 provider 行；未启用或未声明该能力的多模态行**不并入**。`category` 为空或 `category='multimodal'` 时语义不变。 |
| 能力过滤 fail-closed | 合并后的多模态行必须再次按能力过滤：`category='multimodal'` 且 capabilities 不含请求能力 → 从结果剔除（避免 image 下拉混入不含 image 能力的多模态模型）；已软删（`preset_hidden=true`）行一律排除。数据源以持久化 `config.capabilities` 为准，禁止按模型名或供应商文档推断。 |
| 前端下拉展示 | Story2Video「图片生成器」「语音生成器」下拉直接消费 IPC `model-provider:list`（后端已合并多模态）。多模态 provider 显示名追加「（多模态）」后缀（如「MiniMax（多模态）」），与单能力同名模型区分；`id` 不变，配置持久化/恢复/合法性校验仍按 `id` 进行。 |
| 已配置过滤（2026-08-09 加固） | 能力下拉只展示 `is_configured=true` 的服务商（有可用 API Key 或免 Key 本地模型）；**未配置 / Key 解密失败（os_crypt 不匹配）的 provider 不进入下拉**。旧配置恢复时若指向的 provider 已不在列表（未配置/已删除），按既有恢复逻辑自动回退到列表首个已配置项（图片）或清空语音 provider/model/音色。目的：避免流水线恢复旧配置选中失效 provider 后在 generate_assets 反复重试「尚未配置 API Key」导致卡住。 |
| 语音模型限定 | `s2vVoiceModelOptions`：多模态 provider 只展示 `capability_models.tts`（如 `speech-2.8-turbo`），禁止把 image/video/llm 模型混入「语音模型」下拉；单能力 provider 保持原逻辑（列出 `provider.models`）。 |
| 默认语音模型 | `getS2VDefaultVoiceModel`：多模态 provider 优先返回 `capability_models.tts`（models 中无该值时也返回该值，避免取到 `models[0]` 的 image/video/llm 模型），其次 `models[0]`；单能力 provider 原逻辑不变。 |
| 音色目录白名单 | `tts-voice-catalog.PROVIDER_MODEL_CAPABILITIES` 新增 `minimax-multimodal` 段：`speech-2.8-turbo / speech-2.8-hd / speech-2.6-hd / speech-2.6-turbo` 均为 `user_clone` + `canListVoices: true` + `desktop_upload` 克隆（能力边界与 `minimax-tts` 完全一致，委托同一 adapter 实现）；未列入白名单的模型（如 `image-01`、未批准的 TTS 模型）返回 `model_not_whitelisted` fail-closed。 |
| provider 能力校验 | `tts-voice-service._hasMatchingProvider` 与 `tts-voice-clone-service._hasMatchingProvider` **同合同**：`category='multimodal'` 且 capabilities **包含 tts** 才放行（音色目录与克隆链路一致）；未声明 tts 能力 → 音色目录 `VOICE_MODEL_MISMATCH` / 克隆 `VOICE_CLONE_MODEL_MISMATCH`，不调用 adapter、不读缓存、不写偏好。模型匹配同时考虑 `models` 与 `capability_models.tts`（避免只列 models 时漏判默认 TTS 模型）。 |
| 克隆与本地管理 | 本地克隆音色（`tts-voice-clone-service`）对 `minimax-tts / minimax / minimax-multimodal` 使用同一 `isProviderCloneVoiceIdValid` 校验与本地管理合同（删除为纯本地管理，不涉及远端 API）；克隆要求/错误码映射沿用 7.1.4。 |
| 交互与提示 | 用户删除全部单能力模型后，「图片生成器」「语音生成器」下拉仍列出「MiniMax（多模态）」；语音模型下拉仅显示 `speech-2.8-turbo` 并默认选中；音色目录正常加载 MiniMax 系统音色并支持克隆/设为默认；所有提示文案与错误码映射沿用 7.1.4，无新增误导性文案。 |
| 验收标准 | ① 只配置 `minimax-multimodal` 时「图片生成器」「语音生成器」下拉可见「MiniMax（多模态）」；② 语音模型下拉只有 `speech-2.8-turbo` 且默认选中；③ 音色目录可加载 MiniMax 系统音色（`canListVoices=true`、克隆 `enabled=true`）；④ `listProviders('image'/'tts'/'video'/'llm')` 包含已启用多模态、不包含未启用/未声明能力/已软删行；⑤ 未声明 tts 能力的多模态 provider 音色目录请求返回 `VOICE_MODEL_MISMATCH`；⑥ 多模态（`minimax-multimodal` + `speech-2.8-turbo`）下「选择本地音频 → 添加克隆音色」成功（`VOICE_CLONE_MODEL_MISMATCH` 不复现），克隆音色可列出/设为默认/删除（纯本地管理）；⑦ 未声明 tts 能力的多模态 provider 克隆请求返回 `VOICE_CLONE_MODEL_MISMATCH` 且不调用 adapter；⑧ 能力下拉不展示 `is_configured=false` 的 provider，旧配置指向失效 provider 时自动回退到已配置项；⑨ 回归：`tts-voice-catalog / tts-voice-service / tts-voice-clone-service / model-provider-multimodal / CreateView` 单测全绿，既有单能力 provider（elevenlabs / minimax-tts / openai-tts 等）行为不变。 |

### 7.4.2 运营后台：预设模型 / 多模态能力设置（2026-08-08 新增）

**需求**：独立运营后台（`D:\Data\projects\ops-center`）新增「预设模型设置」模块，运营人员可维护前端【模型设置】的预设服务商目录。

| 合同 | 要求 |
|------|------|
| 数据模型 | `model_presets` 表：`id/name/category/base_url/models/default_model/is_multimodal/capabilities/capability_models/doc_links/capability_doc_links/is_visible/created_at/updated_at`。 |
| 默认模型设置 | 每个预设可填写「默认模型 Model ID」（`default_model`），运营可修改；系统已知默认模型预填（如 MiniMax 多模态 `MiniMax-M2.7`、MiniMax TTS `speech-2.8-turbo`、MiniMax Image `image-01`、MiniMax Video `MiniMax-Hailuo-2.3`、OpenAI `gpt-4o`、Flux `flux-pro` 等）。 |
| 显示开关 | `is_visible` 控制该预设是否在前端【模型设置】显示（关闭即隐藏，`include_hidden=false` 过滤）。 |
| 文档链接 | 每个模型 `doc_links` 最多 10 条，且必须为 http(s) URL（后端校验，超限/非 URL 返回 400）。 |
| 多模态能力配置 | `is_multimodal=1` 的预设可配置 `capabilities`（能力数组）、`capability_models`（每能力默认模型，缺省会校验 400）、`capability_doc_links`（每能力文档链接，每能力最多 10 条）。 |
| 种子目录 | 后端 `ensure_catalog_seeded()` 初始化内置目录（与 Multi-Publish `model-provider-seeds` 对齐），含 MiniMax 各能力官方文档链接。 |
| API | `GET/POST /api/v1/model-presets`、`GET/PUT/DELETE /api/v1/model-presets/{id}`，写操作需 admin JWT。 |
| 前端 | 「预设模型」菜单页：类别筛选、前端显示开关、默认模型列、文档链接编辑（≤10）、多模态能力编辑（能力多选 + 每能力默认模型 + 每能力文档链接 ≤10）、新增/删除。 |
| 验收标准 | ① 运营后台可新增/编辑/删除预设；② 默认模型字段预填已知值且可修改；③ doc_links 超 10 条或非 URL 被拒绝；④ 多模态能力缺省模型被拒绝；⑤ `is_visible=false` 后前端不再展示。 |

### 7.4.3 测试连接提示脱敏（2026-08-08）

**需求**：模型供应商列表页测试按钮返回「连接成功 {"success":true}」等原始技术信息，需整体脱敏为友好自然语言。

| 合同 | 要求 |
|------|------|
| 成功 | 仅显示「✅ 连接成功」，`detail` 不展示（不再 `JSON.stringify(res.data)` 回显技术响应体）。 |
| 失败 | 显示友好错误 `message`；仅当存在可读 `detail` 时展示，原始技术对象/堆栈不外泄。 |
| 全项目筛查 | 全局检索 `JSON.stringify(res.data)`、`{"success":true}` 等模式，确保无其它入口回显原始技术信息。 |

### 7.4.4 运营信息字段与统一模型调用调度机制（2026-08-10 新增）

**需求**：运营后台模型预设补充运营信息字段（端口URL、获取模型ID URL、默认模型ID、接口技术文档URL、每分钟连接次数、5小时限额次数，均允许为空并按类型校验）；默认模型 ID 下拉选择 +「获取模型」按钮从模型网址拉取全部模型 ID；多模态模型按 7 类能力显示技术文档 URL 输入框；桌面端把模型调用方法提炼为单独调度机制（`model-call-scheduler` + `ApiUsageGovernor`），依据前端设置的默认模型与运营后台配置的「每分钟连接次数」安排并发数量与排队。

#### 7.4.4.1 运营后台字段（与 ops-center 仓库 contract 对齐）

| 字段 | 显示项 | 类型 | 允许为空 | 校验（后端 400 + 前端提示） |
|------|--------|------|---------|----------------------------|
| `base_url` | 接口 Base URL（端口URL） | string | ✅ | http(s)，长度 ≤500 |
| `models_url` | 获取模型ID URL | string | ✅ | http(s)，长度 ≤500；用于「获取模型」按钮 |
| `default_model` | 默认模型 ID | string | ✅ | 非空且 models 非空时必须 ∈ models，否则 400「默认模型 ID 必须在模型列表中」 |
| `doc_links` | 接口技术文档URL | string[] | ✅ | ≤10 条，http(s) |
| `rate_per_minute` | 每分钟连接次数 | int | ✅ | `[0,100000]` 整数（拒绝 `1.5`/`'abc'`/负数/布尔） |
| `limit_per_5h` | 5小时限额次数 | int | ✅ | `[0,10000000]` 整数 |

- 获取模型ID 端点：`POST /api/v1/model-presets/{id}/fetch-models`（admin-only），SSRF 防护（非环回必须 https、禁重定向、超时 10s、响应 ≤512KB、私网解析拒绝、JSON 契约 `{models|data:[...]}`），成功回写 `models`（`default_model` 不在新列表则清空）。
- 多模态 7 类能力文档键：`llm`（文字推理接口）/ `image`（图片生成）/ `video`（视频生成）/ `tts`（TTS语音生成）/ `voice_clone`（TTS语音克隆）/ `speech_recognition`（语音识别）/ `vision`（视觉识别）；未知键 400。

#### 7.4.4.2 桌面端统一调度机制（model-call-scheduler）

| 合同 | 要求 |
|------|------|
| 统一机制 | 模型调用统一走 `ApiUsageGovernor`（并发信号量 + RPM 滑动窗口排队 + 429 冷却重试 + 5h/周额度窗口）；新增薄封装 `model-call-scheduler.js` 提供 `withModelBudget` / `resolveProviderBudget` / `mapWithModelBudget`。 |
| 预算来源 | 优先级：provider 配置 `rate_per_minute`/`limit_per_5h`（运营后台维护，桌面 config 持久化）> 静态表 `governor-provider-limits` > 类别默认。 |
| 并发换算 | `rate_per_minute` → `maxConcurrent = clamp(round(rpm/10), 1, 4)`；未配置视频/音频保持并发 1。 |
| 5h 窗口 | `limit_per_5h` → `setTokenWindows([{ windowMs:5h, field:'requests', limit }])`，按请求次数累计（无 usage 字段也计数），超限返回 `QUOTA_EXCEEDED`。 |
| 注入时机 | `ModelProviderManager.init()` 及 `createProvider`/`updateProvider` 成功后调用 `_applyGovernorLimits()` 同步预算；预设种子 `model-provider-seeds.js` 与 ops-center 种子对齐。 |
| 视频创作联动 | `story2video generate_assets` 图片/TTS 并行生成并发上限 = `min(请求并发, provider maxConcurrent)`（按能力分别解析 image/tts provider），超出部分 worker 队列排队；未配置预算回退静态表/请求并发，行为不回归。 |
| 前端表单 | 模型设置「每分钟连接次数 / 5小时限额次数」为**只读展示**（7.4.5 起由运营后台同步下发或使用服务商默认值，不再手工输入）：编辑弹窗显示当前值或「未配置（默认限流）」，新增服务商步骤 3 提示「限流策略由运营后台同步下发或使用服务商默认值」。 |
| 种子数据来源 | 预设种子 `rate_per_minute` 与 `governor-provider-limits.js` 静态表一致（代码事实，2026-08-10 起由 ops-center 目录统一生成）；`limit_per_5h` 无代码事实 → 不预填（留空由运营填写，注入 provider 级 5h 请求窗口）；`models_url` 无适配器 `/models` 调用事实 → 不预填。运营后台目录与桌面端代码事实一致性命中测试见 ops-center PRD 12A.8。 |

#### 7.4.5 运营后台 → 桌面端运行时同步（2026-08-10 新增）

**需求**：运营后台填写的限流（每分钟连接次数 / 5小时限额次数）、模型 ID、默认模型、能力配置，在桌面端**运行时自动下发**（手动「立即同步」+ 启动自动同步）；前端限流/模型字段由可编辑改为**只读展示**，避免双写漂移。

##### 7.4.5.1 目录同步端点（ops-center）

| 项 | 要求 |
|----|------|
| 端点 | `GET /api/v1/model-presets/catalog`（无需登录，`X-Catalog-Key` 头鉴权） |
| 鉴权 | `X-Catalog-Key` == `OPS_CATALOG_API_KEY`（常量时间比较）；**未配置** `OPS_CATALOG_API_KEY` → 404（不暴露端点存在性）；Key 错误/缺失 → 401 |
| 返回 | `{ items: [...], count, synced_at }`；仅返回 `is_visible=1` 预设，按 is_multimodal/category/name 排序 |
| item 字段 | `id` / `name` / `category` / `base_url` / `models` / `default_model` / `rate_per_minute` / `limit_per_5h` / `is_multimodal` / `capabilities` / `capability_models` / `updated_at`（**不含** API Key 等敏感字段） |
| 数据自洽 | `default_model` 非空时必须 ∈ `models`；`rate_per_minute`/`limit_per_5h` 为 null 或正整数 |

##### 7.4.5.2 桌面端同步服务（OpsCenterSync，主进程）

| 合同 | 要求 |
|------|------|
| 配置存储 | settings key `opsCenterSync`：`{ url, apiKeyEnc, autoSync, lastSyncedAt }`；API Key 经 safeStorage 加密后 base64 序列化，`getConfig()` 永不返回明文（仅返回 `apiKeyConfigured` 布尔） |
| URL 校验 | 必须 http(s)；**非本机回环地址强制 https**（回环 localhost/127.0.0.1/::1 允许 http）；拒绝携带用户名/密码；非法 URL 保存时拒绝并提示「Ops Center 地址必须是 http(s) URL（非本机地址强制 https）」 |
| Key 保留 | `saveConfig` 的 apiKey 为空 = 保留现有 Key，不重复加密 |
| 拉取契约 | `{url}/api/v1/model-presets/catalog`，头 `X-Catalog-Key`；`redirect:'error'` 禁重定向；10s 超时（AbortController）；响应 ≤1MB；非合法 JSON / 缺 `items` 数组 → fail-closed 不写本地 |
| 错误映射 | 401/403 →「Ops Center API Key 无效（401/403）」；404 →「Ops Center 未启用目录同步（404，需配置 OPS_CATALOG_API_KEY）」；其他非 2xx →「Ops Center 返回 HTTP {status}」；超时 →「同步请求超时（10 秒）」；连接失败 →「无法连接 Ops Center: ...」 |
| 应用写入 | 调 `ModelProviderManager.applyCatalog(items)`：合并限流/模型/能力到已有行，**不覆盖** api_key/enabled/is_default/base_url；目录有本地无 → 插入 `is_preset=1/enabled=0` 行；目录缺失的本地行**不清除**；运营未配置限流（null/''/0/布尔）→ 清除本地值并回退默认；**畸形目录项**（缺 `models` 数组等）不清空本地模型列表（fail-closed） |
| default_model | 目录契约信息字段：写入 `config.default_model` 保留运营配置；当前模型调用解析走 `capability_models[type]` 或 `models[0]`，provider 级默认走 `is_default=1`，`default_model` 供展示与后续模型选择路由使用（2026-08-10 审查记录） |
| Governor 联动 | `applyCatalog` 写库后调用 `_applyGovernorLimits()`：`rate_per_minute` → `setProviderLimits({rpm, maxConcurrent})`，`limit_per_5h` → `setProviderTokenWindows(5h 窗口)`；未配置/已清空回退静态表默认 |
| 自动同步 | 配置 autoSync 且已有 URL+Key 时，启动 3 秒后 best-effort 同步；失败仅 warn 不阻塞启动 |
| IPC | `ops-center-sync:get` / `ops-center-sync:save` / `ops-center-sync:now`（preload：`opsCenterSyncGet/Save/Now`；access-control PUBLIC_METHODS） |

##### 7.4.5.3 前端交互（模型设置页）

| 项 | 要求 |
|----|------|
| 同步卡片 | 模型设置顶部「🔄 运营后台同步」卡片：Ops Center 地址输入、目录同步 API Key 输入（已配置时 placeholder「已配置（留空保持不变）」）、「启动时自动同步」开关、「保存配置」「立即同步」按钮、上次同步时间、状态文案 |
| 显示项 | 未同步时「尚未同步」；已同步显示「上次同步：{本地化时间}」；同步成功后显示「同步成功：更新 N 个服务商（时间）」 |
| 失败提示 | 红色状态区显示映射后的错误文案（401/403/404/超时/连接失败），并 ElMessage.error 提示 |
| 启用提示 | 同步已配置时卡片高亮并提示「已启用运营后台下发：服务商的『每分钟连接次数 / 5小时限额次数 / 模型列表』以运营后台为准，桌面端为只读展示；本地仍可配置 API Key、Base URL 与默认服务商。」 |
| 限流只读 | 编辑服务商弹窗「每分钟连接次数 / 5小时限额次数」由输入框改为只读行：显示当前值或「未配置（默认限流）」，附提示「限流值由运营后台同步下发或使用服务商默认值，前端为只读展示。」 |
| 新增流程 | 添加服务商步骤 3 不再显示限流输入框，改为提示「限流策略（每分钟连接次数 / 5小时限额次数）由运营后台同步下发或使用服务商默认值，无需在此填写。」 |
| 模型只读 | 同步启用且编辑预设服务商时，「模型列表」输入禁用并提示「已启用运营后台同步：预设服务商模型列表由运营后台下发，此处为只读。」；自定义服务商模型列表仍可编辑 |
| 数据校验 | 地址输入保存时由主进程校验（http(s)/https 强制/无凭据）；API Key 非空时加密存储；autoSync 布尔开关 |

##### 7.4.5.4 验收标准

① 运营后台配置 `OPS_CATALOG_API_KEY` 后，桌面端填写地址+Key 点击「立即同步」→ 服务商限流/模型更新、卡片显示「同步成功：更新 N 个服务商」；② 未配置 Key 的运营后台端点返回 404，桌面端提示「未启用目录同步」；③ Key 错误返回 401，桌面端提示「API Key 无效」；④ 同步后编辑预设服务商：限流只读展示、模型列表禁用；⑤ 自定义服务商模型仍可编辑；⑥ 勾选「启动时自动同步」重启桌面端 3 秒后自动同步；⑦ 本地 api_key/enabled/is_default/base_url 不被同步覆盖；⑧ 运营后台清空限流 → 桌面端回退默认限流（governor 预算恢复）。

#### 7.4.6 运营后台运行时策略下发：公告 / 版本发布 / 内容安全（2026-08-10 新增）

**需求**：运营后台集中维护公告、版本发布策略、内容安全敏感词库，桌面端启动/同步时经 `runtime/bootstrap` 一次性拉取并应用；前端无需发版即可全局生效。

##### 7.4.6.1 数据与校验（ops-center）

| 表 | 字段 | 允许为空 | 校验（后端 400 + 前端提示） |
|----|------|---------|--------------------------|
| `announcements` | title / content / severity(info\|warning\|maintenance) / active_from / active_until / enabled / sort_order | title/content 必填，其余可空 | severity 三值之一；时间 ISO 格式；active_until ≥ active_from |
| `update_policy` | min_version / force_version / gray_ratio(0-100) / enabled / note（单条 upsert id=1） | 版本可空 | 版本号 `x.y.z`；force ≥ min；gray_ratio 整数 0-100 |
| `content_policy` | name / word_list(JSON) / replacement(≤16) / enabled（单条 upsert id=1） | 词库可空 | 词去重保序 ≤5000 项、单项 ≤100 字符；replacement ≤16 |

##### 7.4.6.2 运行时端点与桌面端应用

| 合同 | 要求 |
|------|------|
| 端点 | `GET /api/v1/runtime/bootstrap`（`X-Catalog-Key` == `OPS_CATALOG_API_KEY`，常量时间比较；未配置→404；错→401） |
| 返回 | `{ announcements: [活动公告按 sort_order], update_policy, content_policy, synced_at }`；活动 = enabled=1 且在有效窗口 |
| 拉取时机 | `OpsCenterSync.syncNow()` 目录同步成功后 **best-effort** 追加拉取（失败仅 warn，不影响目录结果）；启动 autoSync 同链路 |
| 公告 | 存 settings(`opsCenterRuntime`) + 内存；IPC `ops-center-sync:runtime` 暴露；App 顶部 `AnnouncementBanner` 展示：info/warning 可关闭（localStorage 记忆），maintenance 常驻强提示不可关闭 |
| 内容安全 | `content_policy` 启用且词非空 → 重建 `SensitiveFilter`（内置词库 + 远程词，去重）；`sensitive:check/replace` IPC 自动使用远程过滤器（未配置回退内置） |
| 版本发布 | `update_policy` → auto-updater `applyPolicy`：force_version 高于当前版本 → 跳过灰度强制检查；gray_ratio<100 → 按概率跳过检查（灰度）；min_version → 状态 `policy-min-version` 提示升级；enabled=false → 不生效 |
| 安全 | 端点复用目录同步 Key；管理 CRUD require_admin；词库/公告不含用户隐私 |

##### 7.4.6.3 验收标准

① 运营后台发布 maintenance 公告 → 桌面端同步后顶部常驻红色横幅且不可关闭；info 公告可关闭且刷新不重现；② 配置 `force_version=2.3.53` 且当前 2.3.50 → 桌面端强制检查更新（不受灰度限制）；③ `gray_ratio=0` → 桌面端跳过更新检查（`skipped-by-policy`）；④ `min_version=2.3.53` 且当前低于 → 状态含 `policy-min-version` 提示；⑤ 运营后台配置敏感词「新词」→ 桌面端 `sensitive:check('含新词')` 命中；关闭策略 → 仅内置词库；⑥ runtime 拉取失败不影响模型目录同步；⑦ 未配置同步的桌面端公告区为空、更新走默认流程。

#### 7.4.7 模型调用用量上报与运营看板（2026-08-10 新增，P0 第二批）

**需求**：桌面端 `model_provider_logs` 调用日志脱敏聚合后上报运营后台，落地用量看板（调用量/成功率/429/耗时/成本），支撑限流与采购决策。

##### 7.4.7.1 上报契约

| 项 | 要求 |
|----|------|
| 端点 | `POST /api/v1/usage/ingest`（`X-Catalog-Key` 鉴权同目录端点；未配置→404、错→401，无需登录） |
| 上报内容 | `{ items: [{ usage_date(YYYY-MM-DD), client_id(设备哈希), provider_id, category, action, calls, ok_count, fail_count, ratelimit_count, latency_ms(总), tokens_in, tokens_out, cost, latency_buckets{lt1s/1to3s/3to10s/gt10s} }], synced_at }` |
| 校验 | usage_date 格式、数值非负、provider_id/action 非空且限长、单次 ≤500 条；400 + 字段提示 |
| 存储 | `model_usage_daily` 表，唯一键 `(usage_date, client_id, provider_id, action)`，同桶 **upsert 累加（幂等，重试不翻倍）** |
| 脱敏 | **不上报** error_message、model 原文等；仅聚合计数与分布 |

##### 7.4.7.2 桌面端上报（UsageReporter）

| 合同 | 要求 |
|------|------|
| 数据源 | `model_provider_logs`，`id > 水印(settings opsCenterUsageReport.lastId)`，单次 ≤5000 行 |
| 聚合 | 按「上报日期 + provider + category + action」：calls/ok/fail/ratelimit(429/限流文案识别)/总耗时/tokens/cost/耗时分布桶（<1s/1-3s/3-10s/>10s） |
| 上报 | POST ingest（复用运营后台 URL/Key，10s 超时）；成功推进水印=最大 id；失败保留水印下次重试不丢数据 |
| 调度 | 启动 5s 首报 + 每 30 分钟周期；未配置 URL/Key 静默跳过不影响主流程 |
| 修复 | `addProviderLog` INSERT 补 `created_at=datetime('now')`（原实现 created_at 恒为空串） |

##### 7.4.7.3 运营看板

| 项 | 要求 |
|----|------|
| 查询 | `GET /api/v1/usage/summary?days=N`（admin，默认 30，上限 90） |
| 返回 | totals（总调用/成功率/429/平均耗时/成本/活跃服务商）+ by_date（每日趋势）+ by_provider（排行）+ by_action |
| 前端 | 「模型用量」页：时间范围（7/30/90 天）、6 张汇总卡片、每日趋势 CSS 柱状图（失败红色段）、按服务商/按动作表格；空态提示「尚未收到用量上报」 |

##### 7.4.7.4 验收标准

① 桌面端配置同步后产生调用 → 30 分钟内上报，ops-center 看板显示调用量与成功率；② 同桶重复上报（重试）计数不翻倍；③ 失败（429 识别）与耗时分布正确落桶；④ 上报失败水印不推进，恢复后补报；⑤ 未配置同步的桌面端静默不打扰；⑥ 看板非 admin 403；⑦ error_message 等敏感内容不出现在上报 payload。

#### 7.4.8 平台发布元数据管理（2026-08-11 新增，P1 其余）

**需求**：平台发布元数据（标题/内容上限、内容类型分类、是否支持 API、临时下线）从桌面端 `config/platforms.yaml` 迁移到运营后台统一维护，随运行时 bootstrap 下发；桌面端启动/同步时覆盖同名平台字段，不改写 yaml。

##### 7.4.8.1 数据与校验（ops-center）

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| id | str PK | 必填、≤64 | 平台 id（如 wechat_mp） |
| name | str | 必填、≤100 | 平台名称 |
| category | str | ≤20，默认「中文」 | 中文/海外分组 |
| content_category | str | 枚举 VIDEO/IMAGE_TEXT/MIXED | 内容类型分类（PRD F9） |
| type | str | ≤20，默认 mixed | article/mixed 兼容字段 |
| max_title / max_content | int | 正整数或空（拒绝布尔/小数/负数） | 标题/内容上限 |
| has_api | bool | 0/1 | 是否支持 API 发布 |
| enabled | bool | 0/1 | 临时下线开关（关闭后不下发） |
| note | str | ≤200 | 运营备注 |

- id 字符集 `^[a-z0-9_-]{1,64}$`；category ∈ 中文/海外；type ∈ article/mixed；has_api/enabled 仅接受 true/false/1/0。
- 创建（POST）走全量校验，重复 id → 409；更新（PUT）为**部分更新**：与已存在记录合并后全量校验，null 视为不修改，路径 id 优先，空串清空上限，不存在 → 404。
- 删除为**软删除**（deleted_at + enabled=0）：已删平台不再列出/下发；种子化遇已存在（含软删）即跳过，已删种子不复活；软删后同一 id 可重建。
- 种子对齐 `config/platforms.yaml` 关键平台 12 个（已存在即跳过，不覆盖运营修改/软删）。

##### 7.4.8.2 管理端点与运行时下发

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/platform-defs | 列表（登录可读） |
| POST | /api/v1/platform-defs | 新增（admin） |
| PUT | /api/v1/platform-defs/{id} | 更新（admin，部分更新） |
| DELETE | /api/v1/platform-defs/{id} | 删除（admin） |
| GET | /api/v1/runtime/bootstrap | 增加 `platform_defs`（enabled=1 项，同 X-Catalog-Key 鉴权） |

##### 7.4.8.3 桌面端消费

| 项 | 要求 |
|----|------|
| `PlatformConfig.applyRemote(defs)` | 按 id 覆盖已存在平台的远程字段（仅覆盖远程出现的键）；本地独有平台保留；远程新增平台不自动引入（fail-closed）；**不改写 yaml**；cover_size 字符串同步重建解析尺寸 |
| `OpsCenterSync.setPlatformConfig(pc)` | phase1 注入平台配置加载器；无 applyRemote 的对象视为未注入 |
| `applyRuntime` | 注入 platformConfig 时应用 `platform_defs`；未注入跳过，不影响公告/版本发布/内容安全策略 |

##### 7.4.8.4 前端「平台元数据」页

- 列表：ID / 名称 / 类别（中文|海外 tag）/ 内容类型（视频|图文|混合 tag）/ 标题上限 / 内容上限 / 支持 API / 下发开关 / 操作（编辑、删除）；顶部「中文/海外/全部」筛选 + 「新增平台」。
- 编辑弹窗：平台 ID（编辑禁用）/ 名称（必填）/ 类别 / 内容类型（必填下拉）/ 类型 / 标题上限 / 内容上限（正整数或留空）/ 支持 API / 启用下发（关闭提示「桌面端将不再下发该平台」）/ 备注。
- 下发开关即时保存（部分更新 enabled），成功提示「已启用，将随下次同步下发给桌面端」。

##### 7.4.8.5 验收标准

① 首次启动种子 12 平台且可编辑；② 非法 content_category / 负数或小数上限 → 400；③ PUT 仅传部分字段可更新（enabled 临时下线）；④ bootstrap 仅返回 enabled=1 项；⑤ 桌面端 applyRemote 覆盖同名平台、本地独有保留、远程新增不引入、yaml 不被改写；⑥ 未注入 platformConfig 时跳过应用不影响其他策略；⑦ 非 admin 写 403、读 200。

#### 7.4.9 桌面端功能开关运行时下发（2026-08-11 新增，P0-1）

**需求**：桌面端功能开关（key → typed value）由运营后台统一维护，随 `runtime/bootstrap` 下发，桌面端同步后即时生效；首个真实用例为 4K 输出能力开关（7.1.20）。

##### 7.4.9.1 数据与校验（ops-center）

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| key | str PK | 必填、`^[A-Za-z0-9_.-]{1,128}$` | 开关标识 |
| value_type | str | 枚举 string/boolean/number | 值类型 |
| value | str | boolean ∈ true/false/1/0；number 可解析数字 | 存储字符串，下发转 typed value |
| description | str | ≤200 | 用途说明 |
| enabled | bool | 0/1 | 停用后不下发 |

- key 拒绝 `__proto__`/`constructor`/`prototype`；value ≤512；number value 统一 float 解析并校验有限（含科学计数法，前后端一致）。
- POST 重复 key → 409；PUT/DELETE 不存在 → 404；PUT 部分更新（null 不修改、body 中 key 被忽略不可变）；并发冲突 IntegrityError → 409；种子并发冲突幂等忽略。
- 种子：`videoCreation.maxOutputResolution`='1080p'（已存在即跳过）。

##### 7.4.9.2 端点与运行时下发

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/feature-flags | 列表（登录可读） |
| POST / PUT /{key} / DELETE /{key} | /api/v1/feature-flags | 管理（admin） |
| GET | /api/v1/runtime/bootstrap | 增加 `feature_flags` = `{key: typed_value}`（enabled=1，X-Catalog-Key） |

##### 7.4.9.3 桌面端消费

| 项 | 要求 |
|----|------|
| OpsCenterSync | applyRuntime 应用并持久化 featureFlags（仅基本类型值、≤100 项、非法结构空对象 fail-closed）；getFeatureFlag(key)；getRuntimeState 暴露（opsCenterSyncRuntime IPC） |
| 4K 读取优先级 | 环境变量 MAX_OUTPUT_RESOLUTION → 运营功能开关 → store → 默认 1080p（fail-closed） |
| 引擎 | getMaxOutputResolution 惰性读取：compose/renderSegment 取当前值，构造期静态值兜底 |
| 渲染端 | CreateView loadMaxOutputResolution：runtime featureFlags → store → 默认 |

##### 7.4.9.4 前端「桌面端功能开关」页

- 列表：Key / 类型 tag / 当前值（typed 展示）/ 描述 / 启用开关 / 编辑 / 删除；全部/已启用/已停用筛选 + 新增。
- 编辑弹窗：Key（编辑禁用）/ 值类型下拉 / 值输入（布尔/数字/字符串提示）/ 描述 / 启用下发。
- 顶部说明文案注明内置 4K 开关用途与 fail-closed 语义。

##### 7.4.9.5 验收标准

① 首次启动 4K 开关种子存在；② 非法 key/value_type/value → 400；③ POST 重复 409、PUT/DELETE 不存在 404；④ bootstrap 返回 enabled 开关 typed value；⑤ 桌面端 applyRuntime 应用/持久化/重启恢复、非法结构空对象；⑥ 引擎惰性读取：静态 1080p + 动态 4k 放行、动态 1080p 拒绝（fail-closed）；⑦ 未配置同步桌面端用本地默认 1080p。

#### 7.4.10 官方内容模板库下发（2026-08-11 新增，P0-2）

**需求**：官方内容模板库由运营后台统一维护，随 `runtime/bootstrap` 下发；桌面端同步时合并进本地模板（内置标记 builtin），用户自建模板保留；内置种子对齐桌面端 TemplateManager.getPresets() 5 个。

##### 7.4.10.1 数据与校验（ops-center）

| 字段 | 类型 | 校验 |
|------|------|------|
| id | str PK | 必填、`^[a-z0-9_-]{1,64}$` |
| name | str | 必填、≤100 |
| category / title | str | ≤40 / ≤200 |
| content | text | Markdown ≤20000 |
| platforms / tags | JSON | 非空字符串数组 ≤50 |
| enabled / sort_order | bool / int | 0/1；非负整数 |
| deleted_at | str | 软删（不复活，可重建） |

- POST 重复 → 409；PUT 部分更新（null 不修改）+ 404；DELETE 软删 + 404。
- 运行时：bootstrap `content_templates`（enabled=1 未软删，sort_order 排序，builtin=true）。

##### 7.4.10.2 桌面端消费

| 项 | 要求 |
|----|------|
| TemplateManager.applyRemote | 按 id upsert；官方字段白名单；新增标记 builtin；用户模板保留；数组 >200 fail-closed |
| OpsCenterSync | setTemplateManager 注入；applyRuntime 应用 content_templates（异常仅 warn） |

##### 7.4.10.3 前端「内容模板库」页

列表（ID/名称/分类/标题/平台/内置/下发开关/编辑/删除）+ 分类筛选 + 新增；编辑弹窗含 Markdown 正文、平台/标签逗号分隔输入、排序、启用下发。

##### 7.4.10.4 验收标准

① 种子 5 个内置模板；② 非法字段 400；③ POST 重复 409、PUT/DELETE 404；④ bootstrap 仅 enabled 模板；⑤ 软删不复活可重建；⑥ applyRemote 覆盖/新增/保留用户/上限 fail-closed；⑦ 未注入跳过。


#### 7.4.11 发布数据看板（2026-08-11 新增，P1-3）

**需求**：桌面端把发布指标脱敏聚合上报运营后台，运营看板展示各平台产粮/失败情况；仅计数，不含标题/正文/账号等敏感内容。

##### 7.4.11.1 数据与端点（ops-center）

| 项 | 说明 |
|----|------|
| 表 | `publish_metrics_daily`（usage_date+client_id+platform 唯一，upsert 累加） |
| 上报 | `POST /api/v1/publish/ingest`（X-Catalog-Key；校验 date/平台字符集/非负/publish≥ok+fail/≤500） |
| 看板 | `GET /api/v1/publish/summary?days=N`（admin，默认 30 上限 90）：totals + by_date + by_platform（成功率） |

##### 7.4.11.2 桌面端上报（PublishReporter）

- 聚合 publish-history 按 日期+平台 分桶；success → ok、fail/error → fail、监控状态不计（防重复计数）。
- 水印推进/失败重试/5s 首报 + 30min 周期/未配置静默；仅计数。

##### 7.4.11.3 前端「发布数据」页

7/30/90 天切换 + 汇总卡片 + 按平台表 + 每日趋势柱状图 + 空态提示；非 admin 403。

##### 7.4.11.4 验收标准

① 上报校验 400；② 同桶累加；③ Key 404/401；④ summary 非 admin 403；⑤ 聚合与成功率正确；⑥ 桌面端分桶/水印/静默；⑦ 不上报敏感内容。

#### 7.4.12 兑换码签发/吊销/查询（2026-08-11 新增，P1-4）

**需求**：运营后台批量签发 Pro 激活码，格式与桌面端 `redemption-codes.js` 完全兼容（HMAC-SHA256 `MP-XXXX-XXXX-SIG`）；共享密钥 `OPS_REDEMPTION_SECRET` = 桌面端 `REDEMPTION_SECRET`。

| 项 | 说明 |
|----|------|
| 表 | `redemption_codes`（id 代理主键 + code 唯一；plan/batch_id/status/expires_at/note/created_at） |
| 签发 | `POST /api/v1/redemption-codes/batch`（admin；count 1-200、plan free/trial/pro、expires_at ISO、note ≤200；未配置密钥 400） |
| 列表/操作 | `GET`（掩码+plan/status 筛选）、`PUT /{id}/revoke`、`DELETE /{id}`（404 兜底） |
| 算法 | `MP-RAND-RAND-HMAC_SHA256(payload, secret)[:4]`，随机字母表去 I/O/0/1 |

前端「兑换码」页：批量签发弹窗 + 掩码结果 + 列表（掩码/套餐/状态/批次/过期/备注）+ 吊销/删除；侧边栏紧邻「许可证管理」。

验收：① 格式与桌面端兼容（签名可复算）；② 校验/密钥缺失 400；③ 列表掩码、操作按 id；④ 404/403 正确。

#### 7.4.13 关键词监测目录下发（2026-08-11 新增，P1-5）

**需求**：运营后台维护关键词监测目录（关键词/飙升阈值/轮询间隔），随 `runtime/bootstrap` 下发；桌面端同步后按目录监测热度，异常飙升触发通知；用户自建监测词不受影响。

##### 7.4.13.1 数据与端点（ops-center）

| 项 | 说明 |
|----|------|
| 表 | `keyword_watchlist`（id 代理主键 + keyword 唯一；category/threshold/interval_minutes/enabled/sort_order/deleted_at） |
| 管理 | `GET/POST /api/v1/keyword-watchlist`、`PUT/DELETE /{id}`（admin；POST 重复 400、PUT/DELETE 404、DELETE 软删不复活可重建） |
| 校验 | keyword 2-100 字；threshold ≥1；interval_minutes 10-10080 整数 |
| 下发 | bootstrap `keyword_watchlist`（enabled=1 未软删，sort_order 排序） |

##### 7.4.13.2 桌面端消费

| 项 | 要求 |
|----|------|
| KeywordMonitor.applyRemoteWatchlist | 按 keyword upsert（远程条目设置 interval/threshold、标记 source=remote）；缺席即停止远程监测；用户/恢复条目保留；MAX_KEYWORDS 上限 skip+warn |
| OpsCenterSync | setKeywordMonitor 注入；applyRuntime 应用（异常仅 warn） |

##### 7.4.13.3 前端「关键词监测」页

列表（关键词/分类/阈值/间隔/启用开关/编辑/删除）+ 状态筛选 + 新增；编辑弹窗含阈值与间隔输入；顶部说明用户自建词不受影响。

##### 7.4.13.4 验收标准

① 校验 400；② 重复 400、404 兜底；③ 软删不复活可重建；④ bootstrap 仅 enabled；⑤ applyRemoteWatchlist 新增/更新/缺席停止/用户保留；⑥ 未注入跳过；⑦ 非 admin 403。


#### 7.4.14 流水线所需依赖目录（2026-08-11 新增）

**需求**：运营后台列出所有视频创作流水线所需的模型类型（推理/图片/视频/TTS/语音识别/音频）与候选供应商，种子对齐代码事实；运营可维护，为后续桌面端配置检查提供依据。

##### 7.4.14.1 数据与校验（ops-center）

| 字段 | 类型 | 校验 |
|------|------|------|
| pipeline_id | str | 必填、`^[a-z0-9_-]{1,64}$` |
| pipeline_name | str | ≤100 |
| model_type | str | 枚举 llm/tts/speech_recognition/image/video/audio/multimodal |
| required | bool | 0=可选（缺省降级） |
| provider_candidates | JSON | 字符串数组 ≤50，去重保序 |
| default_provider | str | 必须在候选内或留空 |
| description | str | ≤200 |
| deleted_at | str | 软删（不复活，可重建） |

- 唯一约束 (pipeline_id, model_type)；POST 重复 400、PUT/DELETE 404、PUT 改 key 撞唯一 400。

##### 7.4.14.2 种子（代码事实）

12 个有模型依赖的流水线共 31 条：story2video-compose（llm/image/tts/video 可选）、animated-explainer（llm/image/tts）、talking-head（speech_recognition/video）、cinematic（video）、animation（video/llm）、avatar-spokesperson（video/tts）、character-animation（video/llm）、clip-factory（video）、documentary-montage（video/llm/tts/image 可选）、hybrid（video/image/tts/llm）、localization-dub（speech_recognition/tts/llm）、podcast-repurpose（speech_recognition/image/audio）。
screen-demo / framework-smoke 无模型依赖不播种。供应商候选与默认值对齐 model-provider-seeds.js 目录。

##### 7.4.14.3 端点与前端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/pipeline-dependencies | 列表（登录可读，pipeline_id/model_type 筛选） |
| POST / PUT /{id} / DELETE /{id} | /api/v1/pipeline-dependencies | 管理（admin，404/软删） |

前端「流水线依赖」页：列表（ID/名称/类型 tag/必选 tag/默认供应商/候选 tags/说明/启用/编辑/删除）+ 流水线与类型筛选 + 新增；编辑弹窗含候选供应商逗号输入与默认供应商下拉，提示文字覆盖「必选/可选」语义与建议预设。

##### 7.4.14.4 验收标准

① 种子 31 条且 story2video-compose 覆盖 4 类（video 可选）；② 校验 400；③ 重复 400、404 兜底；④ 软删不复活可重建；⑤ 筛选正确；⑥ 非 admin 403/读 200。

---

## 八、内容采集与收藏流程

### 8.1 URL 内容采集

```
进入「内容采集」页面
    │
    ├─ 输入文章链接 → 点击「采集」
    │   └─ 自动提取标题、正文、封面图（og:title/description/image）
    ├─ 预览采集结果
    │   └─ 点击「创建草稿」→ 存入草稿箱
    └─ 失败时提示错误
```

### 8.2 剪贴板导入

```
点击「从剪贴板导入」
    └─ 自动提取剪贴板内容的标题 + 正文 → 创建草稿
```

### 8.3 平台内容采集

支持从微博、知乎、今日头条等平台采集内容，一键创建草稿后进行二次编辑和发布。

### 8.4 草稿箱管理

```
草稿箱（内容采集页面内）
    ├─ 查看所有草稿（标题预览、采集来源）
    ├─ 编辑草稿 → 跳转到发布页
    ├─ 删除草稿
    └─ 新建空白草稿
```

---

## 九、内容智能工作流

### 9.1 热点趋势

```
进入「内容情报」页面
    │
    ├─ 查看热门趋势面板（数据源：Reddit / Hacker News / GitHub）
    ├─ 搜索特定主题 → 跨平台高互动内容结果
    │   ├─ 按来源筛选（Reddit/HN/GitHub）
    │   ├─ 按真实互动评分排序（非 SEO）
    │   └─ 查看搜索结果详情
    └─ 热点数据为创作选题提供参考
```

### 9.2 标题助手与标签推荐

在发布页编辑文章时：
```
├─ AI 生成标题（基于正文内容）
├─ AI 优化标题（提升点击率）
└─ 智能标签推荐（匹配平台热门标签）
```

### 9.3 爆款分析

```
进入「爆款分析」页面
    ├─ 分析各平台爆款内容特征
    ├─ 查看互动数据、发布时间、内容类型分布
    └─ 为创作策略提供数据支撑
```

> **实现说明（v2.3.43）**：爆款分析由 `viral-engine.js` 桥接到外部 orchestrator
> (`ORCHESTRATOR_URL`，默认 `http://localhost:8000`)，提供 AI 驱动的深度分析。
> 当 orchestrator 不可用时（未配置或连接失败），自动回退到**本地启发式分析**
> （`_localAnalyze` / `_localGenerate` / `_localTrending`），基于输入文章的互动
> 数据、标题特征和关键词多样性计算爆款潜力分，确保功能在离线/无 orchestrator
> 环境下仍可使用。本地 fallback 返回数据带 `mode: 'local-fallback'` 标记。

### 9.4 关键词监控

```
进入「关键词监控」页面
    ├─ 设置监控关键词
    ├─ 追踪关键词在各平台的表现趋势
    └─ 实时查看相关内容的互动数据
```

---

## 十、发布日历流程

```
进入「发布日历」页面
    │
    ├─ 日历视图（月视图）
    │   ├─ 左右切换月份
    │   ├─ 「今天」快速定位
    │   └─ 有发布计划的日期显示事件标记
    │
    ├─ 选择日期 → 查看当天发布计划
    │   ├─ 已发布的文章（带状态）
    │   └─ 定时任务（待发布）
    │
    └─ 日历数据来源：
        ├─ 已发布的 publish_history（SQLite）
        └─ 待执行的 scheduled_tasks
```

---

## 十一、云端发布流程

```
进入「云端发布」页面
    │
    ├─ 填写发布表单
    │   ├─ 视频 URL（存储链接）
    │   ├─ 目标平台
    │   ├─ 标题（最多 80 字）
    │   ├─ 描述
    │   ├─ 标签（逗号分隔，点击删除单个标签）
    │   └─ 封面图 URL（可选）
    │
    ├─ 提交云端发布任务
    │   ├─ 任务发送到 ECS 服务器 orchestrator
    │   ├─ 不依赖本地环境（可在任意设备提交）
    │   └─ 查看 orchestrator 在线状态
    │
    └─ 发布结果在任务完成后推送
```

---

## 十二、与 PROJECT-001 的集成

```
PROJECT-001（内容聚合改写）
    │
    │ WebSocket 推送改写后的内容
    ▼
Aggregator Bridge (aggregator-bridge.js)
    │
    │ 调用 taskQueue.addBatch()（单次不超 20 篇，超出自动拆分） 添加多平台任务
    ▼
Task Queue → 各平台发布器 → 发布完成
```

**集成点：**
1. **WebSocket 通信**：PROJECT-001 通过 WebSocket 将改写后的文章推送到 Multi-Publish
2. **自动批量发布**：接收到文章后自动加入任务队列，按平台顺序执行
3. **状态反馈**：发布进度实时回传

---

## 十三、CI/CD

| 环节 | 说明 | 状态 |
|------|------|------|
| GitHub Actions | 推送 main/develop 触发构建 | ✅ |
| 构建产物 | Windows (.exe) + Linux (.AppImage) | ✅ |
| ESLint 检查 | GitHub Actions quality-gate PR 门禁，ESLint 0 errors | ✅ Phase C3 |
| 自动更新 | electron-updater + GitHub Release | ✅（待首次 Release） |

---

## 十四、风险与应对

### 自动化风险

| 风险 | 影响 | 应对 |
|------|------|------|
| RPA 被平台封禁 | 高 | 随机延迟 300-800ms + Cookie 轮换 |
| 平台 UI 变更 | 中 | 模块化设计，单发布器变更不影响整体 |
| Cookie 过期 | 低 | 自动检测 + 一键重新登录 |
| 浏览器兼容性 | 低 | Electron 内嵌 Chromium 版本锁定 |

### RPA 合规性评估

| 平台 | 风险 | 缓解 |
|------|------|------|
| 微信/视频号 | 中 | 频率 <= 人工操作 |
| 抖音/TikTok | 高 | 随机延迟 + 单次 <= 3 篇，间隔 >= 5 分钟 |
| 小红书 | 中 | 同抖音，单账号日 <= 20 篇 |
| B站 | 中 | 优先 API，RPA 仅降级 |

**通用原则：** RPA 间隔 >= 300ms；不绕过付费墙；应用内提示账号风险。

---

## 十五、验收标准

### v1.2.0 验收（Electron 原生 RPA + 平台分类）

- [x] **平台分类**：12 平台分 VIDEO / IMAGE_TEXT / MIXED 三类，API 透传
- [x] **RpaViewManager**：隐藏 BrowserWindow + executeJavaScript RPA 引擎
- [x] **CDP 文件上传**：`DOM.setFileInputFiles` CDP 文件上传
- [x] **Playwright → RpaViewManager 全量迁移（P2-E）**：15 平台从 Playwright 统一迁移到 RpaViewManager
- [x] **隐藏 BrowserView**：静默登录验证（loginSilent）
- [x] **每账号 Session 隔离**：`session.fromPartition()` 独立分区
- [x] **25 回归测试通过**：Python 后端全量通过
- [x] **11 RpaViewManager 测试通过**：模块加载 + API 签名验证
- [ ] 抖音发布选择器需实际页面验证（依赖真实抖音创作者后台）

- [x] **15 个平台**：微信/知乎/微博/抖音/小红书/视频号/快手/头条/YouTube/TikTok/**Twitter/X**/B站/**百家号**/Instagram/Facebook
- [x] **格式适配器**：14 平台格式转换（HTML 白名单/截断/标签格式化）
- [x] **封面图自动处理**：sharp 中心裁剪 + 质量压缩 + 格式转换
- [x] **平台 URL 配置化**：config/platforms.yaml 统一管理
- [x] **敏感词预检**：DFA 算法 + 内置词库，发布前弹窗
- [x] **数据同步系统**：5 平台框架 + SQLite 缓存 + Dashboard
- [x] **评论统一管理**：WebContentsView 内嵌各平台评论页
- [x] **端到端测试** — 全部测试套件通过
- [x] **CI 自动 Release** — GitHub Actions auto-tag + release

- [ ] Pending: 端到端测试（需真实账号凭证）

### v1.1.0 目标（Roadmap）

详见 `docs/roadmap-v1.1.0.md` — 产品稳定 → 运营启动 → 付费闭环 → 迭代增长

---

## 十六、Roadmap

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0-P3 | 基础发布 + 任务队列 + 定时 + 统计 | ✅ |
| **蚁小二集成** | 分屏/回调/扫码/OAuth/SQLite/批量/B站/URL采集/托盘/快捷键/多账号 | ✅ |
| **Phase C（代码质量）** | ESLint v9 flat config + Prettier，201 个问题修复 | ✅ Phase C3 |
| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |
| V1.1 格式适配 | Markdown → 各平台格式转换、封面

---

## 十七、安全审计与质量门禁 (Security Audit & Quality Gates)

### 17.1 安全审计修复（v2.3.42, 2026-07-09）

按 `project_memory.md` 的 `/cso + /guard` 触发器执行全面审计后，修复 11 CRITICAL + 9 MAJOR，详见 [CHANGELOG v2.3.42](../CHANGELOG.md) 和 [decision-log D-030](./decision-log.md)。

**修复要点**：
- 硬编码密钥（master_password / jwt_secret / API Key / 生产 IP）→ 环境变量
- SQL 注入防护（字段名白名单 `sanitizeUpdateFields`）+ 事务包裹
- Electron 安全（contextIsolation: true）+ IPC 来源校验（`_assertTrustedSender`）
- callback-server 鉴权（随机 token + Origin 限制 + body 上限）
- 文件原子写 + 路径穿越校验 + chmod 600
- 62 个 IPC handler 补 try-catch + 删除 22 个 .ts 死代码

### 17.2 质量门禁（QM-1 ~ QM-3）

详见 [AGENTS.md](../AGENTS.md) 强制质量门禁：

| 门禁 | 要求 | 状态 |
|------|------|:----:|
| QM-1 | Electron 主进程代码本地打包验证 | ⏳ 沙箱环境无法执行 |
| QM-2 | Code review 必检项（require 路径/注释语法/模块导出/glob 覆盖） | ✅ |
| QM-3 | 测试策略（单元 + 打包 + 启动） | ✅ 本轮串行全量 357 files / 6120 tests passed |

### 17.3 测试基线

| 包 | 测试数 | 状态 |
|----|--------|:----:|
| apps/desktop | 历史基线 1791 passed / 10 skipped；本轮串行全量 357 files / 6120 tests passed | ✅ |
| ai-writer-api | 10 passed / 0 failed | ✅ |

---

## 十八、蚁小二账号管理与内容发布对齐

### 18.1 范围约束

- 顶部主菜单和最左侧平台账号列表保持现有结构，不复制蚁小二外壳。
- 重构范围限定为主内容区域、账号管理页、内容发布页及动态加载内容。
- 蚁小二逆向工程产物只作为字段、状态、交互和视觉证据，不在运行时加载其 bundle。

### 18.2 功能验收

| 能力 | 验收标准 | 状态 |
|------|----------|------|
| 多账号管理 | 分组、收藏、筛选、排序、批量删除、默认账号、登录状态刷新 | 已实现 |
| 登录方式 | 内嵌浏览器、二维码登录、OAuth/API 登录入口 | 已实现 |
| 多账号发布 | 同平台多个账号展开为独立发布目标 | 已实现 |
| 定时发布 | 校验过去时间、30 天上限和平台频率间隔，支持取消 | 已实现 |
| 批量发布 | 每篇文章独立选择平台/账号，支持执行、排期、进度和终态轮询 | 已实现 |
| 草稿 | 保存并恢复正文、媒体、平台账号、定时和差异化内容 | 已实现 |
| 差异化内容 | 每个平台独立标题/正文在 RPA 与 backend 路由中生效 | 已实现 |
| 取消与退出 | 运行中任务可取消；应用退出时停止队列和延迟任务 | 已实现 |

### 18.2.1 2026-08-04 续作验收补充

| 能力 | 本轮验收合同 | 状态 |
|------|--------------|------|
| 账号卡片动作 | 活动账号显示“设置、验证、删除”；失效账号显示“设置、重新登录、删除”；不显示与蚁小二不一致的“设默认、打开主页” | 本地已实现 |
| 账号归属字段 | 粉丝数、负责人、运营人、代理按多种后端字段名归一化；缺失值显示“暂无数据/未设置” | 本地已实现 |
| 账号重新登录 | 复用 browser auth IPC；取消、业务失败、异常均关闭登录视图并保留错误提示；完成事件显示“账号重新登录成功”并刷新 | 本地合同已实现，真实平台授权待外部验证 |
| 分组侧栏 | 搜索分组、全部分组、共享筛选、成员计数、无分组空态；筛选后只展示分组成员 | 本地已实现，团队共享待后端合同 |
| 收藏空态 | 收藏页签无结果时显示“暂无收藏账号”，不把“没有匹配的账号”误作收藏服务成功 | 本地已实现 |
| 分享链接 | 未接入团队分享服务时显示“未接入服务”，创建按钮禁用，不伪造链接或成员数据 | 本地已实现，后端能力待外部合同 |

### 18.2.2 2026-08-04 parity gap closure

| 能力 | 本轮实现与合同 | 状态 |
|------|----------------|------|
| 模块工具按钮 | 顶部“移动端预览、客服支持、使用指南、通知”均有独立 testid、可关闭本地面板和明确状态；未从逆向 bundle 推断未经证实的外链或 IPC | 本地已实现，真实蚁小二点击目标仍待运行时验收 |
| 草稿箱二级页签 | `/publish?tab=drafts` 首屏进入独立草稿工作区，显示加载/空态/列表，支持返回发布、继续编辑和删除；`/publish?draft=...` 保留编辑器恢复流程 | 本地已实现 |
| 发布进度回归合同 | 进度卡固定 `publish-progress` testid，供功能 E2E 和视觉回归使用；不以通用卡片数量代替状态断言 | 本地已实现 |
| 发布记录删除 | 选择发布记录后可批量删除；renderer API、preload、`history:delete` IPC 和 JSONL service 均按 owner 隔离，删除后刷新并保留结果提示 | 本地已实现，真实多用户共享存储待外部验收 |
| 设计与代码分层 | 本轮新增导航面板、草稿页和反馈状态使用模块级 class/token；未对既有发布表单做无证据的大规模 CSS 重排，遗留 inline style 记录为后续拆分项 | 本轮新增代码已分层，遗留项已记录 |


### 18.2.3 2026-08-10 浏览器式标签栏与导航系统

| 能力 | 实现与合同 | 状态 |
|------|-----------|------|
| 浏览器式标签栏 (TabBar) | 新增 TabBar.vue 组件：标签页创建/关闭/切换，平台图标自动识别（15 个平台 emoji），加载状态 spinner，Home 标签不可关闭，ARIA role=tablist 无障碍 | 本地已实现 |
| 导航栏 (NavBar) | 新增 NavBar.vue 组件：后退/前进/刷新/首页按钮，URL 搜索栏（支持 URL 直接访问和 Bing 搜索），复制网址，加载状态指示，焦点态样式 | 本地已实现 |
| 标签页 Store (tab.js) | 新增 Pinia Store：tabs/activeTabId/navigation 响应式状态，IPC 事件订阅（tab-created/closed/switched/navigation-changed/loading），init/dispose 生命周期 | 本地已实现 |
| page-manager IPC 桥接 | 新增 preload/page-manager.js：14 个 IPC 方法（CRUD + 导航 + 查询 + 事件订阅），所有 handler 使用 withSenderCheck 安全校验 | 本地已实现 |
| WebviewManager 浏览器标签页 | 继承 EventEmitter，新增 createNewTabPage/closeTab/switchToTab/navigate/searchOrNavigate/goBack/goForward/reload 方法，独立 session 分区，Cookie 互不干扰 | 本地已实现 |
| App.vue 集成 | TabBar + NavBar 集成到蚁小二工作区 shell，YixiaoerModuleNav 仅首页标签显示，tab store init/dispose 生命周期管理 | 本地已实现 |
| CreateHistory 空状态增强 | 渲染记录空态显示 🎬 图标 + 提示文案；流水线记录空态显示 🔄 图标 + 提示文案；修复 style 标签闭合位置 | 本地已实现 |
| 账号"去登录"按钮 | AccountManagementCard 新增"去登录"按钮（Monitor 图标），触发 open-creator 事件，Accounts.vue 处理事件并导航到创作者中心 | 本地已实现 |
| 构建修复 | platform-definitions.browser.js 补充 PLATFORM_DASHBOARD_URLS 导出 | 本地已实现 |
| 内存泄漏修复 | webview-manager.js unsubscribe-events 未传 subscriberId 时清理所有订阅者 | 本地已实现 |

**数据校验**：
- URL 导航：协议校验仅允许 http/https/file；域名正则匹配标准域名格式；非 URL 输入走 Bing 搜索编码
- IPC 参数：所有 handler 使用 withSenderCheck 校验发送者来源；参数缺失返回 VALIDATION_ERROR
- 标签页 ID：浏览器标签使用 btab- 前缀，分屏监控使用 tab- 前缀，避免 ID 冲突
- Home tab：tabId 固定为 'home'，不创建 WebContentsView，关闭操作返回 false
- 创作者中心 URL：必须在 PLATFORM_DASHBOARD_URLS 白名单中，不存在时提示"暂不支持该平台"

**交互逻辑**：
- 点击标签页 → switchToTab → 隐藏当前视图 + 显示目标视图 + 更新导航状态
- 关闭标签页 → closeTab → 移除视图 + 切换到下一个标签（无标签时广播 all-tabs-closed）
- URL 输入 → enter → 判断 URL/域名/搜索词 → 导航或 Bing 搜索
- 首页标签 → 隐藏 NavBar 导航按钮，显示模块导航 (YixiaoerModuleNav)
- Home tab 保护：closeTab 拒绝关闭 Home tab（返回 false），确保首页始终存在
- switchToTab(Home)：隐藏所有 WebContentsView，显示 router-view 内容，activeTabId 设为 'home'
- tabStore 初始化：自动创建 Home tab（tabId='home', title='首页'），不调用 IPC 创建 WebContentsView
- 打开创作者中心：点击账号卡片"去登录"按钮 → openCreatorCenter(platform) → 获取 PLATFORM_DASHBOARD_URLS[platform] → createTab({ url, platform, accountId }) → 新标签页全屏显示创作者中心

**显示项**：
- 标签栏高度 36px，背景 #e8eaf2，活跃标签白色背景 + 阴影
- 导航栏高度 40px，URL 搜索栏圆角 15px，焦点态紫色光晕
- 平台图标：微信/抖音/小红书/微博/B站 等 15 个平台

**提示文字**：
- 渲染记录空态："暂无渲染记录" + "创作你的第一个视频，记录将在这里显示"
- 流水线记录空态："暂无流水线运行记录" + "选择创作模式开始流水线，运行记录将在这里显示"
- URL 搜索栏 placeholder："搜索或输入网址"
- 标签页 title："新标签页"（about:blank）或 hostname
### 18.3 设计与代码分层

```text
Vue 展示组件
  -> composables / Pinia（页面状态和用例编排）
  -> src/api/publisher.js（统一 renderer API）
  -> preload（最小能力暴露）
  -> IPC handlers（来源校验、参数白名单）
  -> 主进程 services / publishers（发布、存储、队列）
```

展示组件不直接访问 `window.electronAPI`；业务数据通过 props/emits 和 composable 进入组件。Electron 账号查询只返回公开字段，渲染层不能写入 cookies、localStorage 或 Token。详细计划见 `docs/plans/2026-07-20-yixiaoer-account-publish-parity.md`。

### 18.4 验证口径

最终交付必须同时通过桌面单元测试、覆盖率、故障注入、Monkey、功能 E2E、视觉回归、真实蚁小二像素门禁、preload sandbox 双模式、Windows 打包、ASAR/require 链和应用启动。2026-08-04 parity gap closure 新增的定向门禁覆盖导航工具面板、草稿独立页、发布进度 testid、发布记录删除 API/IPC/service owner 隔离；定向 Vitest 648/648 通过。全量、功能 E2E、视觉、打包和真实蚁小二操作必须以本轮实际命令结果为准，不得沿用旧报告数字。真实第三方平台授权、实际上传/发布、团队分享和跨设备同步仍属于外部验收，不以 mock 结果替代。实际命令和结果记录在 `.quality-gates.md`、`01-docs/yixiaoer-reverse/analysis/04-account-publish-parity-2026-08.md` 以及本任务 `.ccg/tasks/yixiaoer-parity-gap-closure/`。

## 十九、文档体系 (Documentation Index)

### 19.1 前期流程文档

| 阶段 | 文档 |
|------|------|
| 市场调研 | [MARKET-RESEARCH.md](./MARKET-RESEARCH.md) |
| 创意构思 | [viral-copy-product-concept.md](./viral-copy-product-concept.md) |
| 需求确认 | [REQUIREMENTS-SIGNOFF.md](./REQUIREMENTS-SIGNOFF.md) |
| 项目计划 | [roadmap-v1.1.0.md](./roadmap-v1.1.0.md) |
| 技术架构 | [ARCHITECTURE-PLAYWRIGHT.md](./ARCHITECTURE-PLAYWRIGHT.md) / [003-electron-tech-design.md](./003-electron-tech-design.md) |
| 设计评审 | [DESIGN-REVIEW.md](./DESIGN-REVIEW.md) / [DESIGN.md](./DESIGN.md) |
| 开发计划 | [P0](./P0-IMPLEMENTATION-PLAN.md) / [P1](./P1-IMPLEMENTATION-PLAN.md) / [P2](./P2-IMPLEMENTATION-PLAN.md) / [P3](./P3-IMPLEMENTATION-PLAN.md) |

### 19.2 子 PRD

- [PM-PRD-v1.1.md](./PM-PRD-v1.1.md) — F1 格式适配器 / F2 封面图 / F3 百家号 / F4 运营启动
- [PM-PRD-rongmeibao.md](./PM-PRD-rongmeibao.md) — 融媒宝差距分析 → F1-F4 集成规划
- [PRD-remotion.md](./PRD-remotion.md) — Remotion 视频渲染
- [PRD-video-creation.md](./PRD-video-creation.md) — 视频创作模块

### 19.3 架构决策记录（ADR）

- [ADR-001-render-engine-extension.md](./ADR-001-render-engine-extension.md) — RenderEngine 扩展方案
- [ADR-002-module-layering.md](./ADR-002-module-layering.md) — Electron 主进程模块分层

### 19.4 质量与流程

- [decision-log.md](./decision-log.md) — 决策日志（D-001 ~ D-038）
- [learnings.md](./learnings.md) — 复盘记录
- [review-process.md](./review-process.md) — 代码评审流程 L1/L2/L3
- [security-audit-2026-07-08.md](./security-audit-2026-07-08.md) — 安全审计报告（历史）
- [PRD-AUDIT-2026-07-08.md](./PRD-AUDIT-2026-07-08.md) — PRD 审计报告
- [UAT-PLAN.md](./UAT-PLAN.md) / [UAT-REPORT-2026-07-08.md](./UAT-REPORT-2026-07-08.md) — UAT

---

## 更新历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v2.1.2 | 2026-07-05 | PRD 全面修复 14 项 + TODOs 清空（基线版本） |
| v2.3.42 | 2026-07-09 | 恢复 mojibake 乱码（从 bba83b0 干净版本）+ 合并 §2.3/§3.3/§4.4 增量 + 新增 §17 安全审计 / §18 文档体系 + 版本号更新 |
| v2.3.53 | 2026-07-20 | 账号管理与内容发布按蚁小二交互对齐；完成前端分层、多账号发布、草稿、排期、差异化内容、二维码登录、取消/重试及安全边界 |
| v2.3.54 | 2026-08-04 | 续作收敛账号卡片动作、失效账号重新登录、粉丝/归属字段、分组筛选、收藏空态和分享服务边界；补充真实蚁小二像素审计证据 |
| v2.3.55 | 2026-08-04 | 收口顶部工具面板、草稿独立页签、发布进度稳定选择器和发布记录 owner-scoped 批量删除；同步测试与外部能力边界 |
| v2.3.56 | 2026-08-10 | 浏览器式标签栏(TabBar/NavBar/tab store)、page-manager IPC、WebviewManager 标签页系统、CreateHistory 空状态增强、账号去登录入口、构建和内存泄漏修复 |






## 图片轮播合同补充（2026-08-04）

- `story2video-compose` 是稳定内部 ID，外显名称由 i18n 提供：中文“图片轮播”、英文“Image Carousel”。
- 音色目录和偏好按 provider/model 作用域；清除偏好恢复安全默认/Provider 默认，删除克隆音色先使偏好失效并使后续读取不可见。
- OpsCenter 当前无已确认租户/音色同步 API，且受保护仓库禁止本任务写入；未来跨仓库 API 与安全合同另立任务定义。
- Doubao 无后端 connector 时不持有高权限 secret、不生成或展示伪造个人音色列表。item 11 与最近 20 轮记录属于 TBD/审计限制；UE item 15 已获确认，当前按快速模式与五个折叠区实施。

- **用户音色样本归属**：用户上传、保存、删除、设默认的克隆样本管理完全由桌面端前台及其 owner-scoped userData/SQLite 最小元数据负责；OpsCenter 不保存、不管理用户音频样本，仅用于运营受控默认值和未来后台高权限凭据/目录同步。

## 图片轮播 UE 与路由错误边界补充（2026-08-05）

- **已确认的交互方案**：story2video-compose 在创作端采用“基础 / 外观 / 声音 / 高级 / 发布”五个可折叠区，仅“基础”默认展开；用户确认文案和参数后点击“启动流水线”，不再经过人为 checkpoint。
- **多语言**：折叠区标题、启动按钮和流水线标签通过 locale 读取；默认中文显示“图片轮播”和“启动流水线”，英文显示 “Image Carousel” 和 “Start pipeline”。稳定机器 ID、IPC 参数和历史数据仍使用 story2video-compose。
- **空白页处理**：/create 等懒加载路由失败时，router 将错误写入共享响应式状态，应用根布局显示错误占位、错误摘要、“重试”和“刷新应用”操作；错误不会因 App 挂载时序而丢失，也不吞掉 renderer console。
- **阶段反馈**：图片轮播运行态继续使用六项阶段清单，不显示 S2V 百分比；取消后清理 run、上下文、轮询和阶段状态，避免下一次运行继承旧状态。
- **验收边界**：Vue 构建、定向 Vitest 和本地 Electron 可验证路由/界面合同；真实 TTS provider 音色目录、个人槽位、用户克隆上传和图片内容政策降级仍须带真实账号的外部验收，统一标记 PENDING_EXTERNAL。
- **i18n 与 CSP 约束（2026-08-06）**：Electron 渲染进程执行严格 CSP（`script-src 'self'`，不含 `unsafe-eval`）；vue-i18n 不得在运行时编译消息（`new Function`），否则视频创作等动态翻译页面渲染抛 `EvalError` 白屏。应用内全部静态消息在加载时转换为 Message Function；新增插值文案时必须直接使用函数形式（如 `(ctx) => ctx.named('name')`），禁止依赖运行时消息编译。

## 视频创作流水线可用性与表单组织（2026-08-06）

- **可用性标识**：`pipeline:list` 返回的每条流水线附带 `available` 布尔字段。已实现真实执行引擎（有 stageDefs）的流水线为 `available=true`（story2video-compose / animated-explainer / talking-head / cinematic / clip-factory / framework-smoke；documentary-montage 等后续实现流水线随各自分支落地为 true），未实现引擎的其余流水线为 `available=false`。
- **列表卡片**：卡片显示「可用 / 开发中」徽标（i18n：zh pipelines.availability.*）；vailable=false 卡片弱化显示并提示悬停说明。
- **未实现流水线禁用启动**：vailable=false 时详情页【启动流水线】按钮灰显，下方显示提示「该流水线尚未实现执行引擎，暂不能生成视频」；canStartPipeline 与 startPipeline 双重守卫，兜底弹窗使用通知 key story2video.pipeline_not_implemented。消除原 state_machine 占位流水线点击启动后 0% 假运行的误导。
- **高级区子分组**：story2video-compose「高级」折叠区拆为两个子组——「分句与时长」（分句语言/分句模式/单句最大长度/分镜目标时长/无旁白场景时长/负向提示词）与「模板与输出」（模板分类/视频模板/自定义模板/输出分辨率/帧率/格式），降低同一折叠区认知负担。
- **阶段名映射**：自动流水线的阶段清单按流水线名映射（AUTO_PIPELINE_STAGES），避免列表接口不含 stages 时回退显示图片轮播的六阶段名。

## 视频创作流水线真实引擎扩展（2026-08-06）

### documentary-montage（纪录蒙太奇）真实执行引擎
- **输入**：文案/主题（text），与图片轮播、AI 讲解一致走全自动编排（autoAdvance，无 checkpoint）。
- **阶段链**：`research`（默认 LLM 生成纪录片风格解说大纲）→ `ingest`（默认 LLM 生成场景数组，纪实画面提示词 + 纪录片口吻旁白，JSON 解析容错 + 行级兜底）→ `edit`（复用 `story2video_generate_assets`：真实图片 provider + TTS，含内容政策重试）→ `narrate`（旁白与资源清单校验，缺旁白 fail closed）→ `render`（复用 compose：FFmpeg 合成，默认 1920x1080/30fps/mp4）。
- **阶段名映射**：自动流水线前端阶段清单按 `AUTO_PIPELINE_STAGES` 按流水线名映射，不再回退显示图片轮播六阶段名。
- **验收边界**：LLM/图片/TTS 均使用已配置默认 provider；未配置模型时 fail closed 并提示去设置。真实 E2E 验收：输入主题「中国高铁的发展历程，从引进到自主创新的故事」→ 12 图 + 12 TTS + video.mp4（h264 1920x1080 56.97s）完成。
## 图片轮播启动反馈合同与后台执行（2026-08-06 Bug 修复）

- **启动即反馈**：点击【启动流水线】后，pipeline:startOrchestrated 必须立即返回（utoAdvance: true + ackground: true 时主进程后台推进，不得同步等待整个流水线）。前端收到 runId 后立即：按钮切换为【✕ 取消】、渲染阶段清单（条目式，非百分比）、每 3s 轮询 pipelineGetRunContext 更新阶段状态。
- **参数合同**：
ormalizeStory2VideoTextParams 必须透传 utoAdvance 与 ackground 布尔标志；丢失任一标志都会导致启动 IPC 阻塞（数十秒到数分钟无反馈）。
- **完成跳转**：轮询发现 status=completed 后跳转结果页；ailed/cancelled 弹应用内提示。
- **回归**：单元测试覆盖「background 模式立即返回 runId 且后台推进到完成」「normalizer 透传 background」；前端契约测试断言启动参数含 ackground: true。
## 视频预览/动效/布局三处修复（2026-08-06）
- **返回流水线列表**：视频预览页（ResultView）头部新增显式【← 返回流水线列表】按钮（data-testid=back-to-pipeline-list），点击回到 /create 流水线列表；原「重新创作」按钮保留。
- **图片动效修复**：buildImageEffectFilter 的 zoompan 必须使用 d=输出总帧数（时长×帧率）。此前 d=1 且输入为 -loop 1 静态图时 zoom 状态不累积，「慢慢放大/平移/缩放」等动效在成片中不可见；修复后 _createSegment 在有动效时改用单帧图片输入（zoompan 自行生成 d 帧），实测早/晚帧差异 0.05 → 28（动效清晰可见）。
- **页面宽度回归**：启动流水线后渲染的「中间结果」面板包含 200 字符 JSON 长字符串（路径/提示词），无换行约束会把页面从 609px 撑宽到 977px。新增 .orchestration-context/.context-value 的 overflow-wrap:anywhere + word-break:break-word + min-width:0 约束，实测启动后页面宽度保持 696px 不再变宽。
## MiniMax TTS 音色目录与克隆 + 语音/画面/抖动修复（2026-08-06）
- **MiniMax TTS 默认模型**：speech-2.8-turbo（异步长文本 T2A Async）；模型设置隐藏模型 ID 输入（单模型收敛，含存量数据迁移）。
- **音色目录**：音色列表来自 MiniMax 官方系统音色清单（system-voice-id，327 个），adapter listVoices 返回；语音/音色 ID 下拉可选并可持久化用户选择。
- **音色克隆**：按官方 API（上传 POST /v1/files/upload purpose=voice_clone → 复刻 POST /v1/voice_clone）实现；前端上传提示与校验：格式 mp3/m4a/wav、时长 10 秒-5 分钟、大小 ≤20MB（数据驱动展示与本地校验）。
  - **voice_id 合规（2026-08-08 修复）**：复刻接口自定义 voice_id 必须满足长度 `[8,256]`、首字符为英文字母、仅 `[A-Za-z0-9_-]`、末位非 `-/_`；`cloneVoice` 用 `buildMiniMaxCloneVoiceId` 生成合规 id，存量非法克隆标记失效并让偏好回退默认音色（见 7.1.16）。
- **错误友好化**：VOICE_CATALOG_UNSUPPORTED 等 VOICE_*/VOICE_CLONE_* 技术错误码不再直出，映射为多语言友好提示；全项目排查同类泄露。
- **UI 调整**：外观→画面；字幕默认启用；高级区「输出分辨率」改「比例与分辨率」移入画面区，选项括号只标注横屏/竖屏；移除「中间结果」原始 JSON 调试面板。
- **动效抖动修复**：zoompan 先 2x 上采样再执行、后下采样，消除亚像素抖动（帧间差异 stddev 0.89→0.11）。
- **分段编辑**：结果页分段编辑显示每段对应图片预览。
  - **CSP 图片放行（2026-08-08 修复）**：分段图片与成片预览均来自本机媒体服务（`http://127.0.0.1:<port>/media/...`）。此前 CSP 仅 `media-src` 放行本机来源而 `img-src` 未放行，导致 `<video>`（媒体）正常、`<img>`（分段图片）被拦截不显示。修复：`apps/desktop/src/index.html` CSP `img-src` 增加 `http://127.0.0.1:* http://localhost:*`（与 `connect-src`/`media-src` 对齐），`index.test.js` 断言同步。
## 提示词优化阶段性能（2026-08-06）
- **根因**：story2video_optimize 逐场景串行调用默认 LLM，N 个场景耗时 ≈ N × 单次推理延迟（用户长文案 6 场景约 2.7 分钟）。
- **修复**：改为 _mapWithConcurrency 有界并发（默认 3）并行优化；保留逐场景错误定位。实测 6 场景：优化阶段 162s → 54s。
- **剩余耗时边界**：每场景 LLM 推理约 20-30s（provider 自身延迟，max_tokens 500 请求很小）；剩余时长属模型推理固有成本，非应用阻塞。
## 提示词优化失败健壮性与多语言（2026-08-06）
- **optimize 重试**：逐场景 LLM 调用对瞬态 provider 错误做有界重试（maxRetries 默认 2，退避 0.8s×次数）；持久失败才 fail closed 并定位场景。
- **多语言**：错误/确认对话框标题使用当前流水线本地化名（中文「图片轮播 提示」/英文「Image Carousel Notice」），不再硬编码 Story2Video；消息体不嵌入英文专名。
- **英文名**：图片轮播流水线英文名统一为 Image Carousel（pipelines.names locales），Story2Video 仅作为内部稳定 ID 保留。
## 中文字幕渲染合同（2026-08-06 Bug 修复）
- **问题**：Windows 静态 ffmpeg 的 drawtext 默认字体无 CJK 字形，中文/日文/韩文等烧录成豆腐块（用户确认）。
- **修复**：drawtext（字幕+水印）显式注入 fontfile——按优先级解析系统 CJK 字体（msyh.ttc → simhei.ttf → simsun.ttc → msjh.ttc）；字体路径统一为正斜杠并用单反斜杠转义冒号（C\\:/Windows/Fonts/msyh.ttc）。
- **回归**：buildSubtitleFilter 断言含 msyh fontfile；实测字幕区像素密度 2496（豆腐块）→ 3979（正常字形）。非 Windows 由 fontconfig 处理，不注入 fontfile。

## 应用日志 log 合同（2026-08-06）

### 需求概述
为便于 AI 开发工具排查 bug 原因、用户自查问题或向官方反馈，桌面应用新增本地日志功能：控制台与文件双写、按日期滚动、敏感信息脱敏、单文件 500MB 自动清理、设置页手动清理与查看。

### 1. 日志记录范围（行为清单）
- **进程生命周期**：应用启动/主窗口创建、退出清理完成；未捕获异常（uncaughtException）、未处理拒绝（unhandledRejection）、渲染进程全局错误（Vue errorHandler / window error / unhandledrejection 经 logs:error 上报）。
- **流水线与任务**：流水线启动/完成/失败/取消、各阶段推进与耗时、断点恢复、任务队列操作。
- **敏感操作**：登录/登出/账号切换（不含凭据）、发布动作、许可证激活/变更、模型服务商配置变更（API Key 只记录掩码）。
- **Provider 调用**：模型供应商调用结果与错误码（不含完整 API Key、Bearer Token）。
- **服务生命周期**：Bridge 启动/停止、回调服务器、媒体服务器、自动更新检查结果等关键服务事件。
- **错误与异常**：所有 log.error / log.warn 路径，附错误码与上下文。

### 2. 日志格式与敏感信息脱敏
- **文件行格式**：<ISO8601 时间> [级别] <模块> <消息> [JSON meta]，每行一条；级别 DEBUG/INFO/WARN/ERROR。
- **控制台**：保持原有 [时间] [级别] 模块 消息 [meta] 输出，行为不变。
- **脱敏规则（落盘前统一 redact）**：
  - Authorization: <token> / Bearer <token> → Bearer ***；
  - apiKey / api_key / authorization 字段值 → ***；
  - sk- 前缀密钥保留前 7 位（sk-xxxx***）其余掩码。
- **meta 规则**：第三参为对象时 JSON 序列化（超过 8000 字符截断加 …）；为 Error 时记录 stack/message；为字符串时按原文拼接（兼容既有 log.level('模块', '消息') 调用约定，不产生多余引号）。

### 3. 保存规则与路径
- **滚动规则**：按日期单文件 app-YYYY-MM-DD.log；同日追加同文件，跨日自动新建。
- **路径**：userData/logs/（app.getPath('userData')/logs）。userData 位于用户目录（非程序安装目录），满足未来安装包在 Program Files 等只读目录部署时仍可写入；开发/测试环境可用 setLogOptions({dir}) 注入隔离目录。
- **大小规则**：默认单文件上限 500MB（maxFileBytes，可注入覆盖用于测试）。每追加约 64KB 核对一次真实文件大小，超限自动删除该日期文件并从头重建；启动首次写入时也会核对历史超限文件并重建。
- **写入方式**：异步队列，不阻塞主进程；磁盘写失败静默回退控制台，不影响主流程。
- **退出保证**：应用退出清理阶段调用 log.flush() 排空写入队列后再退出。

### 4. 设置页交互（设置-通用设置）
- **入口**：设置对话框「通用设置」Tab（原为禁用占位，本次启用）。
- **显示项**：
  - 标题「应用日志」、副标题「查看与管理本地日志文件，便于排查问题或反馈给官方」；
  - 日志目录完整路径；
  - 日志文件数、日志总大小、单文件上限（500 MB）；
  - 文件列表：文件名 + 单文件大小（按文件名排序）；
  - 空态「暂无日志文件」。
- **操作项**：
  - 【刷新】重新读取日志信息；
  - 【清理日志】调用 logs:clear 删除全部 app-*.log；清理中按钮禁用防重复提交；清理后自动刷新列表。
- **提示文字（固定展示）**：「Log 文件达到 500M 时，系统会自动清理。」（i18n：zh/en）。
- **多语言**：上述文案走 locale（settings.logs.*），默认中文、英文可用。

### 5. IPC 与数据合同
- logs:info → { code: 0, data: { dir, totalBytes, fileCount, maxFileBytes, files: [{ name, size }] } }；失败 { code: -1, message }。
- logs:clear → { code: 0, data: { removed } }（removed=删除文件数）；成功后记录 log.info('Logs', '用户手动清理日志文件', { removed })。
- logs:error → 入参 { message }，主进程以 ERROR 级写入模块 Renderer；无 message 时使用默认文案「未知渲染进程错误」；返回 { code: 0, data: true }。
- 三个通道均加入 PUBLIC_CHANNELS 与 preload PUBLIC_METHODS（logsGetInfo / logsClear / logError），登录与否均可访问；renderer 统一经 src/api/publisher.js 封装，无 electronAPI 时 fallback 返回错误码。

### 6. 数据校验与容错
- setLogOptions({ maxBytes })：非有限数或小于等于 0 不生效，保留原值。
- 目录创建失败/不可写：仅控制台输出，不抛错。
- 单文件统计失败：跳过该文件，不中断列表。
- 清理只匹配 app-*.log，不删除其他文件。
- 手动清理与 500MB 自动清理后 currentLogPath 置空，下一次写入重建文件。

### 7. 验收标准
- 单元测试：electron/services/logger.test.js（日期滚动/脱敏/超限自动删/启动核对/clearLogs/getLogsInfo/非法 maxBytes）、electron/ipc-handlers/logs.test.js（三通道）、electron/preload.test.js（方法数与存在性）、shutdown.test.js（flush）。
- 打包后：启动应用并在 userData/logs/ 看到当日 app-*.log；设置页可查看/刷新/清理；500MB 上限行为可用小上限注入验证。
- 外部边界：真实 provider 调用日志内容为灰度验证项，不纳入自动验收。
## 技术债务 W1/W2/W3 闭环（2026-08-06）

来源：`01-docs/QUALITY-RHYTHM-BACKFILL-2026-08-06.md` 集中代码审查的三项 WARNING/INFO，本次全部闭环。

### W1：run-state 快照 owner 隔离
- **问题**：`RunStateStore` 快照按 runId 平铺落盘（`userData/run-state/<runId>.json`），同机多账号场景下泄露 runId 即可读取他人恢复上下文。
- **修复**：已登录时快照写入 `userData/run-state/owners/{sha256(subject)}/<runId>.json`；owner 由 `setOwnerProvider(provider)` 注入（与 store/offline-manager 一致），在 `phase3-services.js` 使用同一 `ownerSubjectProvider` 接线并随身份切换更新。
- **兼容**：未登录/身份不可用时回退 legacy 平铺路径；`load` 优先读 owner 目录，命中 legacy 平铺快照时自动迁移（copyFileSync + 清理旧文件）；`remove` 同时清理两处路径。
- **数据约束**：ownerHash 为 `sha256(subject)` 完整 hex；快照额外记录 `owner`（subject）便于追溯；快照仍不含密钥。
- **验收**：`run-state-store.test.js` 覆盖 owner 保存/读取、跨账号隔离（A 读不到 B）、legacy 迁移、双路径 remove、provider 校验与抛错回退。

### W2：governor 排队超时统一回收
- **问题**：`_acquireSlot` 中已过截止时间的 waiter 仅在 `_pump`（下次释放）时被拒绝；若某 key 无后续释放，过期 waiter 会悬挂到任务链结束。
- **修复**：
  - 新增 `_sweepExpired(key, st)`：按绝对截止时间回收该 key 全部过期 waiter（不仅队首）；`_pump` 复用该方法。
  - 每次 `run()` 入口先 sweep 该 key（新请求到达即回收，不依赖释放）。
  - 新增 `sweepAll()`：统一回收所有 key 的过期 waiter；`PipelineEngine._finalizeRun`（完成/失败/取消统一出口）调用 `governor.sweepAll()`（governor 经 container 注入 pipelineEngine）。
- **验收**：governor 单测覆盖「无释放时 sweepAll 回收」「新请求到达回收过期 waiter」；resume-orchestration 测试覆盖「失败/取消时调用 sweepAll」。

### W3：governor 默认 RPM 按 provider 配置化
- **问题**：`DEFAULT_LIMITS` 按类别（llm/tts/image/video/audio）固定，真实供应商限额差异大。
- **修复**：新增 `governor-provider-limits.js`，为 52 个已知 provider 提供 `{ rpm, maxConcurrent, cooldownMs, retry429 }` 预算（保守估计，非官方保证；本地类 provider 给高预算）；`ApiUsageGovernor` 支持 `setProviderLimits(providerId, limits)` 与构造函数 `providerLimits` 注入，container 启动时注入 `PROVIDER_LIMITS`。
- **优先级**：精确 key 覆盖 > provider 级 > 类别默认 > 全局默认；429 自适应（rateFactor 0.75）仍兜底真实限流。
- **验收**：governor 单测覆盖「provider 级 rpm 生效」「未配置 provider 回退类别默认」「构造函数注入」。

## 音色目录/克隆校验修复合同（2026-08-07）

### Bug 1：MiniMax 系统音色选择（VOICE_CATALOG_INVALID_ARGUMENTS）
- **背景**：选择「沉稳高管」「搞笑大爷」等 MiniMax 系统音色报 `VOICE_CATALOG_INVALID_ARGUMENTS`。根因：MiniMax 官方 system voice id 含空格与括号（如 `Chinese (Mandarin)_Reliable_Executive`），而 `selectVoice` 的 voiceId 校验只允许 `/^[a-zA-Z0-9._-]+$/`。
- **数据校验合同（voiceId）**：
  - 允许字符集：任意非控制字符文本（含空格、括号、中文等），长度 ≤256；
  - 拒绝：控制字符（U+0000-U+001F、U+007F）、路径分隔符（`/`、`\`）、遍历序列（`..`）；
  - providerId / model 仍使用严格 ASCII 白名单（`/^[a-zA-Z0-9._-]+$/`）不变；
  - voiceId 只用于偏好持久化与传给 adapter 合成参数（MiniMax `voice_setting.voice_id`），不进入文件路径。
- **交互逻辑**：目录可展示并选择全部 MiniMax 系统音色（327 个，含空格括号 id）；选择后保存偏好并在下次进入时作为默认。
- **回归保护**：`tts-voice-service.test.js` 覆盖「含空格括号 id 选择成功」「路径分隔符/遍历序列拒绝」。

### Bug 2：音色克隆样本时长误报（VOICE_CLONE_SAMPLE_DURATION_INVALID）
- **背景**：符合要求（mp3/m4a/wav、10s-5min、≤20MB）的 wav 上传后仍报「上传的音频文件时长不符合要求」。根因：`ffprobe` 从 stdin（pipe:0）流式探测部分 PCM wav（如带 `LIST` chunk 的 RIFF）拿不到 `format.duration`（文件模式正常）。
- **流程与功能逻辑（时长探测）**：
  1. 首选 pipe 探测（mp3/m4a 等流式可解析路径）；
  2. **有音频流但 duration 缺失/无效** → 回退写临时文件（`os.tmpdir()/voice-clone-probe-<random>.wav`，`mode 0o600`）用文件模式探测，`finally` 删除临时文件；
  3. **明确无音频流** → fail closed（`VOICE_CLONE_SAMPLE_DURATION_INVALID`），不回退；
  4. pipe 与文件模式都失败 → 返回无效（不伪造时长）。
- **数据约束**：临时文件仅存在于 `os.tmpdir()`、随机名、600 权限、探测后必删；样本时长校验阈值不变（10s-5min，MiniMax）。
- **提示文字**：不变（「上传的音频文件时长不符合要求，请按提示调整时长后重试」）；真实原因（探测失败）不再误报为时长不符，而是正常完成校验。
- **回归保护**：`tts-voice-clone-service.test.js` 覆盖「pipe 无 duration 回退文件探测」「pipe 成功不回退」「双失败返回 null」「无音频流 fail closed 且不落盘」；端到端验证用户 wav（27.12s）通过。

## 视频创作后台运行与并发合同（2026-08-07）

### 需求概述
流水线启动后应在后台持续运行：用户返回流水线列表或切换模块不影响执行；历史记录可查看运行中未完成的任务及其实时流程状态；同一应用支持多个流水线并行，但设上限防止资源过载。

### 1. 后台运行（已具备，本次固化合同）
- **启动即后台**：`pipeline:startOrchestrated` 传 `autoAdvance: true, background: true` 时，主进程后台推进整条流水线并立即返回 `runId`；renderer 每 3s 轮询 `pipeline:getRunContext` 刷新阶段状态。
- **页面无关性**：运行绑定在主进程 `PipelineEngine._runs`（runId 驱动），不依赖任何页面/组件生命周期。CreateView `beforeUnmount` 仅清理轮询 timer 与时钟，**不取消 run**。
- **返回恢复查看**：CreateView `mounted` 调用 `resumeRunningOrchestration()`——遍历候选流水线名，用 `pipeline:status` 找到 `status=running && orchestrationMode=orchestrator` 的运行并自动恢复阶段清单查看（含轮询）。renderer 重载/切页返回均适用。
- **断点恢复**：失败 run 落 `RunStateStore` 快照，`pipeline:resumeOrchestration` 从失败阶段继续（并发槽位占用，见下）。
- **运行中任务持久化（2026-08-09 新增）**：运行中编排 run 阶段级落盘 running 快照（`saveRunning`）+ 退出兜底 `saveRunningState()`；应用退出/强杀重启后，任务以「运行中」状态继续显示在历史记录并可「从断点继续」（见 7.1.21）。

### 2. 历史记录显示运行中任务
- **数据源**：`pipeline:history`（`PipelineEngine.getHistory()`）现在返回「运行中 run（在前）+ 终态历史」；`_runs` 中 `<runId>` 与 `_<pipelineName>` 指向同一对象，返回前去重。
- **显示项（创作历史-流水线记录）**：
  - 运行中卡片：状态圆点（running 蓝）、流水线名（i18n 名称）、时间（`completedAt || startedAt || createdAt`，运行中显示创建时间）、阶段标签（completed/running/pending 色块）、状态文案「运行中」、提示「返回创作页查看进度」。
  - **轮询刷新**：列表存在 `status=running` 任务时每 5s 自动刷新（阶段状态实时更新）；全部结束后自动停止轮询；`beforeUnmount` 清理 timer。
- **可发现性（2026-08-07 修订）**：进入创作历史页时同时加载流水线记录；存在运行中任务时自动切到「流水线记录」tab 直接展示运行中卡片；「渲染记录」tab 顶部显示横幅「有 N 条流水线正在后台运行，点击查看运行状态」（点击切到流水线记录）。避免用户进入历史页默认看渲染记录而误以为运行中任务未出现。
- **CreateView 内部历史记录视图（2026-08-07 修订）**：【视频创作】-【历史记录】是 `CreateView` 内部视图（非 `/create/history` 独立页）：`loadHistory()` 合并项目记录与 `pipeline:history`（含运行中 run），运行中流水线**置顶**展示（优先于已完成项目/终态 run）。
  - **展示（2026-08-07 二次修订，修复布局错乱）**：运行中项为**卡片式**——主信息行（名称/状态「进行中」/「返回流水线创作查看进度」提示/时间）+ 独立「阶段进度条」（每阶段一个分段，done 绿 / active 蓝高亮 / pending 灰 / failed 红，语义同流水线页阶段清单），不再内联标签挤占单行。
  - **刷新（2026-08-07 二次修订，修复闪烁；三次修订，修复运行结束任务消失）**：存在运行中任务时每 5s 执行 `refreshRunningHistory()` **原地更新**运行中项的 stages/currentStage（保持列表对象身份），不重建整表、不重刷项目记录；**运行中项结束后（不在 `pipelineHistory` 运行集中）触发一次完整 `loadHistory()`，以终态（已完成/失败/已取消）保留显示，不直接消失**。
  - 点击运行中项切回流水线创作视图并自动恢复查看该 run。
  - **失败任务持久展示（2026-08-08 修订）**：流水线执行失败的任务也必须显示在历史记录中，状态文案为「生成失败」。
    - **数据源**：失败时 `RunStateStore.saveFailed(run)` 持久化快照（新增 `createdAt` 字段）；`PipelineEngine.getHistory()` 在内存 `_runs`/`_history` 之外，合并 `runStateStore.listFailed()` 的持久化失败快照（按 runId 与内存条目去重）。
    - **重启保持**：应用重启后内存历史清空，但失败快照仍从 run-state 目录读取，失败任务继续显示在历史记录中（状态「生成失败」、时间取 `completedAt/updatedAt/createdAt`）。
    - **状态文案**：`failed` 状态在【历史记录】显示为「生成失败」（CreateView 内部历史视图 `historyStatusLabel` 与 `/create/history` 独立页 `statusLabel` 同步；状态筛选项「失败」改为「生成失败」）。
    - **交互（2026-08-08 二次修订，新增断点继续）**：失败且可恢复（非内容政策类）的卡片显示「从断点继续」按钮，点击调用 `pipeline:resumeOrchestration` 从失败阶段续跑，自动切回流水线创作视图并展示实时进度；续跑后该任务以「进行中」状态继续留在历史记录（不再消失）。内容政策类失败（需修改文案）不显示该按钮，保持仅展示状态。点击失败卡片本体同样触发续跑（与运行中卡片点击行为一致）。
    - **终态记录唯一性（2026-08-08 二次修订）**：断点续跑复用同一 runId，`PipelineEngine._finalizeRun` 写入 `_history` 时按 runId 去重（同 id 只保留最新一条终态，避免新旧终态重复展示）。
    - **终态快照扩展（2026-08-08 二次修订）**：编排模式取消（cancelled）与失败（failed）一样调用 `RunStateStore.saveFailed` 持久化终态快照——续跑时会删除旧失败快照，若续跑后再次取消必须保留新终态，否则应用重启后该任务在历史中丢失；取消快照状态为 `cancelled`，不可恢复（`resumeOrchestration` 仅允许 `failed`/`running`）。
    - **运行中任务持久化（2026-08-09 新增，见 7.1.21）**：运行中编排 run 在启动与每个阶段执行前落盘 `status='running'` 快照（`endedAt=null`），退出/强杀时 `saveRunningState()` 兜底；应用重启后 `getHistory()` 经 `listRunning()` 合并这些快照，任务以「运行中」显示并带「继续生成」按钮——点击调用 `resumeOrchestration` 从中断阶段重建并自动续跑（同会话内幂等返回 `alreadyRunning`，仅附加实时进度，不重复创建运行）。已完成 run 的 running 快照在 `_finalizeRun(completed)` 时删除，杜绝「已完成任务以运行中重现」。
- **交互逻辑**：
  - 点击运行中卡片 → 跳转 `/create`（CreateView 自动恢复查看该 run 进度）。
  - 点击已完成卡片 → 跳转 `/create/result?path=<成片路径>` 预览。
  - 失败/取消卡片：保持仅展示状态，不跳转。
- **数据校验**：`pipeline:history` 失败返回 `{ code: -1, message, data: [] }`；前端 5s 加载超时提示「流水线记录加载超时，请重试」。

### 3. 并发限制
- **上限**：默认按机器资源自适应（`computeDefaultMaxConcurrentRuns`，取值 1–4：可用并行度 ≥8 且可用内存 ≥8GB → 4；≥4 且 ≥4GB → 3；<2 核或 <2GB → 1；其余 → 2）。**固定上限开关（2026-08-07）**：环境变量 `STORY2VIDEO_MAX_CONCURRENT_RUNS`（正整数 1–8，非法/空回退自适应）可强制固定上限（如设 `2` 即固定 2 条），`deps.maxConcurrentRuns` 注入仍最优先（测试/调优）。依据：每条流水线的资源生成阶段并发调用模型 API（受 api-usage-governor 限流），compose 阶段跑 ffmpeg 合成（CPU/内存密集，27 场景曾触发 x264 OOM）；自适应保证低配机器 1 条兜底、高配放宽，封顶 4 不放任资源占用。
- **统计口径**：`_countActiveRuns()` 统计 `_runs` 中 `orchestrationMode=orchestrator && status=running` 的独立 run（去重 `_<name>` 索引）。
- **启动/恢复统一门禁**：`startOrchestrated`（创建 run 前）与 `resumeOrchestration`（恢复前）都调用 `_assertConcurrencyBudget()`；达到上限返回：
  - `{ success: false, errorCode: 'PIPELINE_CONCURRENCY_LIMIT', error: '当前已有 N 条流水线正在后台运行，最多同时运行 M 条，请等待其中一条完成后再启动。', errorParams: { count: N, max: M } }`
- **槽位释放**：run 进入终态（completed/failed/cancelled）即从 `_runs` 移除，槽位释放。
- **提示文字（前端）**：`story2video-notifications.js` 新增 `PIPELINE_CONCURRENCY_LIMIT`（zh/en），通过 `errorCode` 显式映射 + 中文错误文本正则兜底解析；弹窗展示友好文案，不展示技术细节。

### 4. 验收标准
- 引擎单测：`getHistory` 含运行中且无重复；上限 2 拒绝第 3 条；注入 1 时第 2 条拒绝、取消后释放；`resumeOrchestration` 超限拒绝；`computeDefaultMaxConcurrentRuns` 覆盖 1/2/3/4 资源档位与注入覆盖。
- 前端单测：CreateHistory 运行中任务显示 + 5s 轮询 + 结束后停止 + 点击跳 `/create`；notifications 并发文案解析（zh/en/errorCode/正则）。
- 交互验收（人工）：启动图片轮播 → 返回列表/切模块 → 历史-流水线记录可见运行中任务且阶段实时刷新 → 点击卡片回创作页恢复查看 → 再启动另一条流水线至 2 条并行 → 第 3 条弹并发提示。
- 交互验收（人工）：启动图片轮播 → 返回列表/切模块 → 历史-流水线记录可见运行中任务且阶段实时刷新 → 点击卡片回创作页恢复查看 → 再启动另一条流水线至 2 条并行 → 第 3 条弹并发提示。

## 真实链路修复合同（2026-08-07，E2E 暴露）

### 1. MiniMax Image 空结果降级
见 7.1.5「空响应重试合同」修订：HTTP 200 但无 `image_urls` → adapter 显式抛错（内容安全信号→`CONTENT_POLICY`，否则 `PROVIDER_ERROR`）；asset-generator 在内容政策重试循环内校验，前 2 次同提示词重试、第 3 次起安全改写、第 5 次仍空 → `needs_user_input(reason=empty_result)` 友好提示。防止「1/2 场景已生成、第 2 个场景空结果导致整条流水线失败」。

### 2. compose 转场滤镜 transition=undefined
- **根因**：`buildTransitionPlan` 返回的计划对象不含 `transitionName` 字段，而 `_xfadeMerge` 从 `plan.transitionName` 构造 `xfade=transition=<name>` 滤镜 → 得到 `xfade=transition=undefined`，ffmpeg 报 `const_values array too small for transition` / `Not yet implemented`，compose 阶段失败。
- **修复**：`buildTransitionPlan(segmentDurations, requestedDuration, transitionName)` 在所有返回路径携带 `transitionName`（默认 `fade`）；`_concatSegments`（≤8 段直连）与 `_concatSegmentsChunked`（分块）均传递该值；`_xfadeMerge` 使用 `plan.transitionName` 构造滤镜。
- **数据约束**：`transition` 取值必须命中 `TRANSITION_NAMES`（fade/slide-left/right/up/down），非法值按 `none` 走无损拼接，不进入 xfade；转场时长仍按相邻片段真实时长收敛（不直接用用户配置值）。
- **回归保护**：compose-engine 测试断言 `buildTransitionPlan` 携带 `transitionName`、直连/分块路径传给 `_xfadeMerge` 的计划均含 `transitionName='fade'`。

### 3. 并发上限固定开关
见「视频创作后台运行与并发合同 §3」修订：环境变量 `STORY2VIDEO_MAX_CONCURRENT_RUNS`（1–8，非法回退自适应）可固定上限（如 `2`）；优先级 deps 注入 > 环境变量 > 机器资源自适应。回归：resume-orchestration 覆盖设 2/非法回退/deps 优先/封顶 8。

## Podcast 转视频流水线引擎合同（2026-08-07）

### 1. 流水线
- 名称：`podcast-repurpose`（播客转视频，音频 → 可视化视频），category=hybrid，`available=true`（2026-08-07 实现引擎）。
- 阶段：`analyze` → `visualize` → `assemble` → `render`。

### 2. 阶段合同
| 阶段 | 类型 | 输入 | 输出 | 说明 |
|------|------|------|------|------|
| analyze | `podcast_analyze` | `params.audio`/`params.audioPath`（受控媒体根目录，wav/m4a/mp3）；`params.transcript` 可选 | `{ audioPath, duration, transcript, segments:[{index,text,start,end}] }` | ffprobe 探测时长；文案优先 `params.transcript`（按行分句、均分时长，最多 30 段），否则走 `story2videoProjectService.transcribeFile`（需已配置语音识别供应商）；两者皆无 → fail closed「需要文案或语音识别服务」 |
| visualize | `podcast_visualize` | `context.analyze` | `{ ...analyze, images:[{index,success,path,error?}] }` | 每段文案经 AssetGenerator.generateImage 生成配图；图片 provider 优先级 params.imageProvider > stage.options.imageProvider > 默认 image provider；aspect 默认 16:9 |
| assemble | `podcast_assemble` | `context.visualize` | `{ scenes:[{index,text,imagePath,audioPath,duration}] }` | ffmpeg 按 start/end 切分音频为 m4a 片段（`os.tmpdir()/story2video/podcast/<runId>/seg_XXXX.m4a`）；单段切分失败跳过；全部失败 → fail closed |
| render | `compose`（内置） | `context.assemble`（`inputFrom: 'assemble'`） | 成片 mp4 | Story2Video 合成引擎；transition=fade、subtitleEnabled=false、720x1280、fps 30 |

### 3. 数据与安全约束
- 音频路径必须经 `resolveReadableMediaFile(kind='audio')` 校验（受控媒体根目录 + 扩展名 + 大小）；运行目录 runId 走 `safeRunId` 语义（`story2video/podcast/<runId>`）。
- 切分产物为运行隔离临时文件；流水线结束由 compose 引擎的 session 清理机制覆盖（`_cleanupSession`）。
- 无真实语音识别供应商时，analyze 不伪造转写，明确提示提供文案。

### 4. 验收
- 引擎单测 11 例：注册/分句/analyze（缺音频、不可读、真实 wav+文案、无文案失败）/visualize（配图、缺 segments）/assemble（真实切分、缺 context）。
- E2E（待办 B）：真实音频（可先提供文案）→ 4 阶段 → 成片 mp4；语音识别转写路径需配置 whisper 供应商后验收。

## 字幕样式与位置合同（2026-08-07 修订）

| 合同 | 要求 |
|------|------|
| 字体 | 中文必须显式指定 CJK fontfile（Windows 静态 ffmpeg 默认字体无中文字形），否则渲染成豆腐块/乱码；Linux 无 Windows 字体时不注入但仍合法。 |
| 字号 | `subtitleStyle.size`（size1-6 / sm-xl）映射 16-40px，`fontSize` 优先；范围 12-96。 |
| 样式 | `style2` 加黑底 `box`（0.55 透明度 + 10px 边框）；`style3` 描边加粗（borderw=4）。 |
| **位置（2026-08-07 修订）** | 字幕底边默认位于画面 **80% 高度**（即**距底部 20%**，`bottomMarginRatio=0.2`，范围 0.05-0.5，可经 `subtitleStyle.bottomMarginRatio` 覆盖）；y 表达式 `y=h*(1-bottomMarginRatio)-th`。原固定 `h-th-40`（约 3%）废弃。 |
| 水平 | 恒居中 `x=(w-text_w)/2`。 |
