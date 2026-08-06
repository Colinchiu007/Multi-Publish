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
在「模型服务商设置」页配置 AI 模型的 API Key。支持 5 类模型：

| 类别 | 用途 | 预设服务商 |
|------|------|----------|
| 推理模型 (LLM) | AI 写稿、标题生成、内容智能 | Anthropic / OpenAI / Gemini / OpenRouter / Ollama / 豆包 / DeepSeek |
| TTS 语音 | 视频配音、语音合成 | ElevenLabs / OpenAI TTS / 豆包 TTS / Google TTS / Piper |
| 语音识别 | 字幕生成、语音转文字 | OpenAI Whisper / Google STT / 豆包语音识别 / 百度语音识别 / 本地 Whisper |
| 图片生成 | 封面图、配图、AI 图像 | Flux / DALL-E / Recraft / Imagen / Grok Image / Pixabay / Pexels / 本地扩散 / ComfyUI |
| 视频模型 | AI 视频生成 | 混元 / CogVideo / Grok Video / HeyGen / Kling / Runway / Veo / Wan / MiniMax / LTX / Seedance / Higgsfield |

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
- **Doubao 个人槽位**：当前配置与 TTS adapter 的已注册/已验证调用合同不证明已经把用户个人槽位同步到本地，也不允许本地创建或伪造槽位。
  UI 必须提示用户先在供应商官方控制台创建/管理音色，再点击“刷新音色目录”并仅在有官方 API 证据及已验证的
  `listVoices` adapter 后选择；证据缺失时显示 `unsupported`/`unavailable`，不显示假列表。

#### 7.1.5 图片内容政策恢复与审计边界

只允许结构化 `CONTENT_POLICY` 或 provider 明确的安全拒绝信号进入重写循环；认证、限流、网络、超时、配置、空响应和
未知 4xx/5xx 必须原样失败，**不得**改写重试。每个场景最多 5 次总图片尝试，重写仅安全化可疑描述而不扩大主题。审计只保存
场景序号、尝试次数、provider/model、提示词版本哈希和非敏感安全摘要，严禁保存原始 prompt、密钥或完整 provider 错误体。
第 5 次拒绝后显示友好的“可能存在内容风险，请修改文案后重新启动”说明，并遵循 7.1.3 的取消旧 run 与新建 run 合同。

#### 7.1.6 运营配置与交付边界

独立运营后台位于 `D:\Data\projects\ops-center`。截至 2026-08-03，尚未确认 Multi-Publish 与其已有可用的运行时配置分发、
鉴权或回滚合同；本任务不接入 OpsCenter，不能把本地受控默认值、本文需求或测试计划描述为已联通、已发布或已交付。
后续必须在独立任务中定义配置版本、授权、分发、回滚和端到端验收。本文图片轮播需求是目标合同，不代替真实 provider、
Electron 打包、工作树、PR 或发布状态证据。
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
    │   ├─ 预设服务商：不允许删除，只能禁用
    │   └─ 自定义服务商：允许删除，二次确认
    │
    └─ 服务商用于：
        ├─ 推理模型 → AI 写稿、标题生成、内容智能、视频创作 LLM 选择
        ├─ TTS 语音 → 视频配音、语音合成
        ├─ 语音识别 → 字幕生成、语音转文字
        ├─ 图片生成 → AI 图片生成（封面、配图）
        └─ 视频模型 → AI 视频生成（Hunyuan/Kling/Runway 等）
```

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
- **错误友好化**：VOICE_CATALOG_UNSUPPORTED 等 VOICE_*/VOICE_CLONE_* 技术错误码不再直出，映射为多语言友好提示；全项目排查同类泄露。
- **UI 调整**：外观→画面；字幕默认启用；高级区「输出分辨率」改「比例与分辨率」移入画面区，选项括号只标注横屏/竖屏；移除「中间结果」原始 JSON 调试面板。
- **动效抖动修复**：zoompan 先 2x 上采样再执行、后下采样，消除亚像素抖动（帧间差异 stddev 0.89→0.11）。
- **分段编辑**：结果页分段编辑显示每段对应图片预览。
## 提示词优化阶段性能（2026-08-06）
- **根因**：story2video_optimize 逐场景串行调用默认 LLM，N 个场景耗时 ≈ N × 单次推理延迟（用户长文案 6 场景约 2.7 分钟）。
- **修复**：改为 _mapWithConcurrency 有界并发（默认 3）并行优化；保留逐场景错误定位。实测 6 场景：优化阶段 162s → 54s。
- **剩余耗时边界**：每场景 LLM 推理约 20-30s（provider 自身延迟，max_tokens 500 请求很小）；剩余时长属模型推理固有成本，非应用阻塞。
## 提示词优化失败健壮性与多语言（2026-08-06）
- **optimize 重试**：逐场景 LLM 调用对瞬态 provider 错误做有界重试（maxRetries 默认 2，退避 0.8s×次数）；持久失败才 fail closed 并定位场景。
- **多语言**：错误/确认对话框标题使用当前流水线本地化名（中文「图片轮播 提示」/英文「Image Carousel Notice」），不再硬编码 Story2Video；消息体不嵌入英文专名。
- **英文名**：图片轮播流水线英文名统一为 Image Carousel（pipelines.names locales），Story2Video 仅作为内部稳定 ID 保留。