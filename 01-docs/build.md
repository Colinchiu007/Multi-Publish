# Multi-Publish — 打包验证与构建发布

## 打包验证


每次修改 `apps/desktop/electron/` 或 `packages/rpa-engine/` 下代码后：

```bash
cd apps/desktop
rm -rf dist-electron
npx electron-builder --win --dir --publish never

# 验证 1：asar 文件清单
npx asar list dist-electron/win-unpacked/resources/app.asar | grep "logger"

# 验证 2：require 链测试
npx asar extract dist-electron/win-unpacked/resources/app.asar /tmp/app-test
node -e "require('/tmp/app-test/node_modules/@multi-publish/rpa-engine')"

# 验证 3：启动测试（8 秒不崩溃）
dist-electron/win-unpacked/Multi-Publish.exe &
sleep 8 && kill $!
```

> 本文件由 Hermes `professional-ai-coding-workflow` 技能转换生成，适配通用 AI 编码工具。

---

## 构建与发布

## 新增模块清单


### packages/shared-utils/src/（v1.6.0，蚁小二复用）

- `chunked-uploader.js` — 通用分片上传器（init→upload chunks→complete, 进度回调, 取消）
- `proxy-pool.js` — 代理池轮换 + 健康检查（round-robin, 自动移除失效, 事件通知）
- `analytics-service.js` — 平台数据分析服务（provider 模式, 多平台并行, 指标归一化）

### apps/desktop/electron/

- `electron/account-state-restorer.js` — 账号登录状态持久化（JSONL）
- `electron/credential-store.js` — localStorage + accountInfo 加密存储（AES-256-GCM）
- `electron/publish-monitor.js` — 发布后状态自动查询（QueryStateTaskScheduler）
- `electron/video-uploader.js` — 视频分片上传
- `electron/system-tray.js` — 系统托盘（最小化到托盘 + 托盘菜单）
- `electron/content-aggregator-bridge.js` — 内容采集引擎桥接（对接 shared_modules）
- `electron/api-platform-adapter.js` — API 模式发布适配器（微博/抖音/B站/知乎）
- `rpa-engine/api-mode-publisher.js` — API+RPA 混合发布器（自动回退）
- `electron/webview-manager.js` — **分屏监控**（P0，WebContentsView 多屏布局，支持2/3/4/6屏）
- `electron/callback-server.js` — **实时回调服务器**（P1，HTTP POST回调 + 59s心跳，端口16521）
- `electron/monitor-preload.js` — 分屏视图预加载脚本
- `electron/qrcode-login.js` — **二维码扫码登录**（P2，自动检测页面二维码，扫码即登录）
- `electron/auth-qrcode-preload.js` — 扫码登录视图预加载脚本
- `electron/store.js` — **统一 SQLite 持久化**（P2，better-sqlite3，替代零散JSONL）
- `electron/oauth-manager.js` — **OAuth 2.0 认证**（P2，YouTube/TikTok/微博/抖音 API Token 授权）
- `electron/batch-manager.js` — **批量发布管理器**（批量编辑/排期/复制，支持多篇文章独立选平台+定时）
- `rpa-engine/publishers/bilibili-rpa.js` — **B站 API+RPA 发布器**（专栏/视频，Cookie认证 + 自动CSRF）
- `rpa-engine/publishers/baijiahao-rpa.js` — **百家号 RPA 发布器**（图文，iframe 编辑器兼容）
- `electron/url-collector.js` — **URL 内容采集**（HTTP+Playwright双模式，og:meta提取）
- `electron/hotkeys.js` — **全局快捷键**（6组 Ctrl+Alt+... 导航快捷键）

