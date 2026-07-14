# Phase 5.5 运维手册 — Multi-Publish 稳定性运维指南

**版本**: 1.0 | **生成时间**: 2026-07-14 23:20 | **质量节拍**: Phase 5.5

---

## 一、服务清单

### 1.1 核心服务

| 服务 | 端口 | 启动命令 | 健康检查 |
|------|------|----------|----------|
| platform-orchestrator | 8000 | `uvicorn main:app --reload --port 8000` | GET /health |
| TrendScope API | 8001 | `uvicorn trendscope.api.main:app --reload --port 8001` | GET /health |
| smart-sentence-splitter | 8002 | `uvicorn 02-source.api.rest_api:app --reload --port 8002` | GET /v1/split (POST) |
| prompt-engine | 8013 | `uvicorn prompt_engine.api:app --port 8013` | GET /v1/optimize (POST) |
| Vite dev server | 5173 | `cd apps/desktop && npm run dev` | GET / |

### 1.2 后台服务

| 服务 | 命令 | 备注 |
|------|------|------|
| TrendScope 爬虫 | `celery -A trendscope.crawler.celery_app worker -l info -c 4` | Celery worker |
| Electron 桌面端 | `cd apps/desktop && npm run electron:dev` | 主进程 + 渲染进程 |

---

## 二、启动顺序

```
1. shared-models (pip install -e .)
2. content-aggregator-shared (pip install -e .)
3. platform-orchestrator (pip install -e .)
4. content-aggregator (pip install -e .)
5. smart-sentence-splitter (pip install -e .)
6. prompt-engine (pip install -e .)
7. trendscope (pip install -e .)
8. Python bridges (port 8002, 8013)
9. orchestrator (port 8000)
10. TrendScope API (port 8001)
11. Vite dev (port 5173)
12. Electron desktop
```

---

## 三、资源约束 (生产环境)

| 项目 | 约束 | 备注 |
|------|------|------|
| 目标环境 | 4G 阿里云 ECS | Alibaba Cloud Linux 3 |
| 常驻内存 | < 200 MB | orchestrator |
| 峰值内存 | < 800 MB | 视频任务 |
| 并发视频 | 1 (串行) | 设计限制 |
| Python 版本 | 3.12+ | |
| Node.js 版本 | 22.x | |
| 数据库 | aiosqlite (WAL) + PostgreSQL 15 | |

---

## 四、常见问题排查

### 4.1 Python bridge 启动失败

**症状**: port 8002/8013 无法连接

**排查步骤**:
1. 检查 Python 版本: `python --version` (需 3.12+)
2. 检查依赖: `pip install -e .`
3. 检查端口占用: `netstat -ano | findstr :8002`
4. 查看日志: bridge 启动时会输出到 stdout
5. 验证 watchdog: bridge 崩溃后应在 30s 内自动重启

**恢复**: 重启 Electron 桌面端，bridge 会随主进程自动启动

### 4.2 Electron 白屏

**症状**: 应用启动后显示白屏

**排查步骤**:
1. 检查 Vite dev server (port 5173) 是否运行
2. 检查 package.json 是否有 UTF-8 BOM (用 `Format-Hex package.json` 检查前 3 字节)
3. 检查 CreateView.vue 等组件是否有语法错误
4. 查看 DevTools Console (Ctrl+Shift+I)

**已知修复**:
- BOM 问题: `fix: 移除 package.json 的 UTF-8 BOM 解决 Vite CSS 500 白屏` (commit be1f6cd)
- 组件注册: `fix: 修复 CreateView 组件注册` (commit 6e3b988)

### 4.3 Remotion 引擎状态异常

**症状**: 视频合成失败，引擎状态不可用

**排查步骤**:
1. 检查 workspace hoisting: Remotion 可能在 monorepo 根目录
2. 验证 RenderEngine.getStatus(): 应返回 ready
3. 检查 ffmpeg 是否安装: `ffmpeg -version`

**已知修复**:
- workspace hoisting: `fix: Remotion 引擎状态检测修复 — 支持 workspace hoisting` (commit 7ad9959)

### 4.4 IPC 通道未注册

**症状**: `pipeline:registerStageExecutor` 测试失败

**状态**: 已知预存问题，非阻断

**排查**: 检查 bootstrap/phase5-ipc.js 是否正确注册所有 IPC handler

### 4.5 版本号显示错误

**症状**: 前端显示版本号不正确

**排查步骤**:
1. 检查 package.json 相对路径
2. 检查 IPC 返回结构: 应正确解构 `{ code, data }`

**已知修复**:
- `fix: 版本号显示修复 — 直接从 package.json 读取` (commit bc17bd3)
- `fix: 版本号显示修复 — 正确解构 IPC 返回的 { code, data } 结构` (commit 063a226)

---

## 五、监控指标

### 5.1 健康检查

```powershell
# 检查所有端口
$ports = @(8000,8001,8002,8013,5173)
foreach ($p in $ports) {
    $r = Test-NetConnection -ComputerName localhost -Port $p -WarningAction SilentlyContinue
    Write-Output "Port $p : $($r.TcpTestSucceeded)"
}

# 检查进程内存
Get-Process | Where-Object { $_.ProcessName -match "python|node|electron" } |
    Select-Object ProcessName, Id, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB,1)}}
```

### 5.2 基线指标 (2026-07-14)

| 指标 | 基线值 | 告警阈值 |
|------|--------|----------|
| Electron 内存 | 476.5 MB | > 600 MB |
| Node.js 内存 | 228.8 MB | > 350 MB |
| Python 内存 | 123.2 MB | > 200 MB |
| 总内存 | 828.5 MB | > 1000 MB |
| CPU 负载 | 15% | > 80% |

---

## 六、故障恢复流程

### 6.1 Python bridge 崩溃

```
bridge 崩溃
    ↓
watchdog 检测 (30s 内)
    ↓
自动重启 bridge
    ↓
验证健康 (/v1/split 或 /v1/optimize)
    ↓
恢复服务
```

### 6.2 Electron 主进程崩溃

```
主进程崩溃
    ↓
用户重启应用
    ↓
bootstrap.js 按阶段初始化 (phase1-5)
    ↓
Python bridges 随主进程启动
    ↓
验证全部服务健康
```

### 6.3 数据库损坏

```
aiosqlite WAL 模式
    ↓
检查 .db-wal 文件
    ↓
如损坏: 删除 .db-wal, 从 .db 主文件恢复
    ↓
重启 orchestrator
```

---

## 七、日志位置

| 服务 | 日志位置 |
|------|----------|
| Electron 主进程 | DevTools Console + stdout |
| Python bridges | stdout (watchdog 捕获) |
| orchestrator | stdout + aiosqlite |
| TrendScope | Celery log + PostgreSQL |

---

## 八、安全检查清单

- [ ] .env 文件未被 git 跟踪
- [ ] 所有 BrowserWindow 配置 sandbox:true
- [ ] 所有 BrowserWindow 配置 contextIsolation:true
- [ ] 所有 BrowserWindow 配置 nodeIntegration:false
- [ ] JWT_SECRET 和 MASTER_PASSWORD 通过环境变量提供
- [ ] 无硬编码 API Key (grep 扫描)
- [ ] npm audit 无 HIGH/CRITICAL 漏洞

---

## 九、备份策略

| 数据 | 位置 | 备份频率 |
|------|------|----------|
| aiosqlite 数据库 | orchestrator 目录 | 每日 |
| PostgreSQL | TrendScope 目录 | 每日 |
| 用户配置 | Electron userData | 每周 |
| 代码仓库 | GitHub | 每次 push |

---

## 十、联系方式

- **项目负责人**: Colin Chiu
- **代码仓库**: Multi-Publish (GitHub)
- **文档位置**: 01-docs/
- **复盘报告**: 01-docs/retros/

---

*生成工具: 质量节拍 Phase 5.5 Operations Manual*


---

## 十一、P0/P1 修复后新增配置（2026-07-14 23:58 追加）

### 11.1 新增环境变量

P1-A 硬编码路径清理后，3 个文件改用 env 变量优先 + `process.cwd()` fallback 模式。生产部署需在启动脚本中显式设置以下变量：

| 环境变量 | 默认值 | 用途 | 影响文件 |
|----------|--------|------|----------|
| `SPLITTER_DIR` | `process.cwd()` | smart-sentence-splitter 项目根目录 | `electron/services/splitter-bridge.js` L17 |
| `PROMPT_DIR` | `process.cwd()` | prompt-engine 项目根目录 | `electron/services/prompt-bridge.js` L16 |
| `FFMPEG_PATH` | 自动查找 | ffmpeg 可执行文件绝对路径 | `electron/services/story2video-compose-engine.js` L36 |

### 11.2 ffmpeg 跨平台查找顺序

未设置 `FFMPEG_PATH` 时，`findFfmpeg()` 按以下顺序查找：

1. 检查 `process.env.FFMPEG_PATH` 是否存在
2. 尝试 `ffmpeg -version` 调用（依赖系统 PATH）
3. 检查常见安装位置：
   - **Windows**: `C:\ffmpeg\bin\ffmpeg.exe`、`%PROGRAMFILES%\ffmpeg\bin\ffmpeg.exe`
   - **Linux/macOS**: `/usr/bin/ffmpeg`、`/usr/local/bin/ffmpeg`、`/opt/homebrew/bin/ffmpeg`
4. 全部失败返回 `null`，video compose 阶段会返回 `code === -1`

### 11.3 生产部署启动脚本示例

#### Linux (阿里云 ECS)

```bash
# /etc/systemd/system/multi-publish.service
[Service]
Environment="SPLITTER_DIR=/opt/multi-publish/smart-sentence-splitter"
Environment="PROMPT_DIR=/opt/multi-publish/prompt-engine"
Environment="FFMPEG_PATH=/usr/bin/ffmpeg"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/multi-publish/apps/desktop/electron/main.js
```

#### Windows (开发机)

```powershell
# 启动前设置（PowerShell）
$env:SPLITTER_DIR = "D:\Data\projects\smart-sentence-splitter"
$env:PROMPT_DIR = "D:\Data\projects\prompt-engine"
$env:FFMPEG_PATH = "D:\Projectsfmpeg-7.1infmpeg.exe"
cd D:\Data\projects\Multi-Publishpps\desktop
npm run electron:dev
```

### 11.4 IPC sender 白名单（P1-B 运维须知）

`phase5-ipc.js` 中 `usage:stats/daily/track` 三个 IPC handler 现已加 `isTrustedSender(event, app)` 验证：

- ✅ 允许：`app://` 协议（Electron 打包后）
- ✅ 允许：`file://` 协议（Electron 本地资源）
- ✅ 允许（仅 dev）：`http://localhost:*` / `http://127.0.0.1:*`
- ❌ 拒绝：其他所有来源（返回默认值 + `log.warn` 记录）

**运维影响**: 
- 生产环境不会有影响（app:// + file:// 始终可信）
- 开发环境如果出现 "Untrusted IPC sender" 警告，检查 Vite dev server 是否在 `localhost` 而非 `0.0.0.0`

### 11.5 容器循环依赖检测（P0-2 运维须知）

`container.js` 现已启用真实循环依赖检测：

- **运行时**: `container.get('serviceName')` 触发 `_resolving` Set 追踪，发现环时抛 `Circular dependency detected: A -> B -> A`
- **主动探测**: `container.detectCircularDeps()` 遍历未初始化 factory，触发 get() 进行探测，结果缓存到 `_lastCycle`
- **运维影响**: 启动时如出现循环依赖错误，检查 `container.setup.js` 中 factory 注册顺序；修复方式是调整 factory 依赖关系，或在 factory 内部用 lazy get 延迟解析

### 11.6 更新后的启动配置清单

- [ ] 设置 `SPLITTER_DIR` env 变量
- [ ] 设置 `PROMPT_DIR` env 变量
- [ ] 设置 `FFMPEG_PATH` env 变量（或确保 ffmpeg 在 PATH 中）
- [ ] 验证 IPC sender 白名单不阻塞生产流量（应在 app:// 协议下自动通过）
- [ ] 验证 `container.detectCircularDeps()` 启动时不抛错

---

*追加时间: 2026-07-14 23:58 | 修复 commit: 481a6fd + 899b5cf | 工具: 质量节拍 Phase 5.5 Operations Manual (更新)*
