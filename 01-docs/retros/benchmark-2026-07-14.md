# Phase 5.2 性能基准报告 — 2026-07-14

**项目**: Multi-Publish | **测试环境**: 本地开发机 | **生成时间**: 2026-07-14 23:10

---

## 一、测试环境

| 项目 | 值 |
|------|-----|
| CPU | 12th Gen Intel Core i5-12450H |
| 总内存 | 31.8 GB |
| 已用内存 | 18.7 GB (58.8%) |
| 空闲内存 | 13.1 GB (41.2%) |
| CPU 负载 | 15% |
| 操作系统 | Windows |

---

## 二、进程内存基线

### Electron 进程（5 个）

| PID | 内存(MB) | CPU(s) | 推测角色 |
|-----|----------|--------|----------|
| 31404 | 113.3 | 5.2 | 主进程 |
| 12236 | 112.7 | 23.9 | 渲染进程（UI） |
| 13216 | 103.3 | 5.7 | GPU 进程 |
| 8704 | 97.0 | 2.0 | Utility 进程 |
| 1844 | 50.2 | 0.7 | Zygote/子进程 |
| **小计** | **476.5** | **37.5** | |

### Node.js 进程（6 个）

| PID | 内存(MB) | CPU(s) | 推测角色 |
|-----|----------|--------|----------|
| 17708 | 54.1 | 5.2 | Vite dev server |
| 31084 | 36.9 | 0.5 | ESLint/TSC watcher |
| 2368 | 36.6 | 0.4 | Build worker |
| 24352 | 36.0 | 0.5 | Test runner |
| 2388 | 32.7 | 0.1 | Plugin host |
| 29100 | 32.5 | 1.0 | MCP server |
| **小计** | **228.8** | **7.7** | |

### Python 进程（4 个）

| PID | 内存(MB) | CPU(s) | 推测角色 |
|-----|----------|--------|----------|
| 28588 | 51.9 | 31.6 | smart-sentence-splitter (port 8002) |
| 20660 | 29.0 | 16.2 | prompt-engine (port 8013) |
| 32680 | 25.7 | 29.0 | Python bridge worker |
| 8528 | 16.6 | 15.4 | Python bridge watcher |
| **小计** | **123.2** | **92.2** | |

### 总内存占用

| 类别 | 内存(MB) | 占比 |
|------|----------|------|
| Electron | 476.5 | 57.5% |
| Node.js | 228.8 | 27.6% |
| Python | 123.2 | 14.9% |
| **总计** | **828.5** | 100% |

---

## 三、端口监听状态

| 端口 | 服务 | 状态 | 备注 |
|------|------|------|------|
| 8000 | platform-orchestrator | ❌ False | 未启动 |
| 8001 | TrendScope API | ❌ False | 未启动 |
| 8002 | smart-sentence-splitter | ✅ True | 运行中 |
| 8013 | prompt-engine | ✅ True | 运行中 |
| 5173 | Vite dev server | ❌ False | 未启动 |

**服务可用率**: 2/5 = 40%

---

## 四、与 CLAUDE.md 资源约束对照

| 约束项 | 目标值 | 实测值 | 状态 |
|--------|--------|--------|------|
| 常驻内存 (orchestrator) | < 200 MB | N/A (未启动) | ⚠️ 无法评估 |
| 峰值内存 (视频任务) | < 800 MB | 828.5 MB (全部进程) | ⚠️ 接近上限 |
| Python 服务启动 | < 10s | 需实际测量 | ⏳ 待测 |
| 崩溃恢复 | < 30s | 需实际测量 | ⏳ 待测 |
| 并发视频 | 1 (串行) | N/A | ✅ 设计支持 |

**注**: CLAUDE.md 约束针对 4G 阿里云 ECS 生产环境，当前为本地开发机（31.8GB RAM），内存约束不直接适用。但峰值 828.5 MB 接近生产约束 800 MB，需关注。

---

## 五、基线指标摘要

```
=== Phase 5.2 Performance Baseline ===
Timestamp: 2026-07-14 23:10
Environment: Local Dev (Windows, i5-12450H, 31.8GB RAM)

Process Summary:
  Electron: 5 processes, 476.5 MB total, 37.5s CPU
  Node.js:  6 processes, 228.8 MB total, 7.7s CPU
  Python:   4 processes, 123.2 MB total, 92.2s CPU
  TOTAL:    15 processes, 828.5 MB, 137.4s CPU

Port Status:
  8000 (orchestrator):    DOWN
  8001 (trendscope-api):  DOWN
  8002 (splitter):        UP
  8013 (prompt-engine):   UP
  5173 (vite-dev):        DOWN

System Load:
  CPU: 15%
  RAM: 58.8% used (18.7/31.8 GB)

Health Score: 6/10
  - Python bridges healthy (2/2)
  - Core services down (0/3: orchestrator/trendscope/vite)
  - Memory within local dev bounds
  - CPU load normal

Recommendations:
  1. Start orchestrator (port 8000) for full E2E baseline
  2. Monitor memory over 1h to detect leaks
  3. Measure Python service cold-start time
  4. Test crash recovery (kill -9 + watchdog restart)
```

---

## 六、长期稳定性测试计划

### 短期（1 小时）

- [ ] 启动全部 5 服务，记录初始内存
- [ ] 每 10 分钟采样内存/CPU
- [ ] 检查内存增长趋势（泄漏检测）

### 中期（4 小时）

- [ ] 持续运行，每小时执行 1 次 E2E 测试
- [ ] 记录响应时间基线
- [ ] 检查 Python 服务 GC 行为

### 长期（24 小时）

- [ ] 夜间无人值守运行
- [ ] 次日检查内存增长 < 10%
- [ ] 检查日志错误率
- [ ] 验证 watchdog 自动恢复

---

## 七、风险预警

| 风险 | 严重度 | 说明 |
|------|--------|------|
| 内存接近 800MB 上限 | 🟡 中 | 全进程 828.5MB，生产环境 4G ECS 需优化 |
| 3 个核心服务未启动 | 🔴 高 | orchestrator/trendscope/vite 未运行，无法做完整 E2E |
| Python CPU 占用高 | 🟡 中 | 4 个 Python 进程 CPU 累计 92.2s，需排查是否有死循环 |
| 未做长时间泄漏测试 | 🟡 中 | 当前为瞬时快照，缺乏时间维度数据 |

---

## 八、下一步行动

1. **立即**: 启动 orchestrator (port 8000) + TrendScope API (port 8001) + Vite dev (port 5173)
2. **1 小时内**: 完成全服务内存泄漏检测
3. **4 小时内**: 完成 E2E 响应时间基线
4. **24 小时内**: 完成长期稳定性验证

---

*生成工具: 质量节拍 Phase 5.2 /benchmark (适配版) | 数据源: Get-Process + Test-NetConnection*
