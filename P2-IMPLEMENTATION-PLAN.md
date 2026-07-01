# P2 实施计划：多平台扩展 + PROJECT-001 集成 + 打包

> **基线分支**：`develop`
> **预计工时**：6-10 小时

---

## P2-M1：微博 RPA 发布器

**目标**：Playwright 自动化发布到微博

| 任务 | 文件 |
|------|------|
| 创建微博发布器 | `electron/publishers/weibo-rpa.js` |
| Python 适配器 | `python/publishers/rpa_weibo.py` |
| 注册 main.js | 任务队列添加 weibo 分支 |
| 前端启用 | Publish.vue 平台列表添加微博 |

**关键路径**：`https://weibo.com/` → 登录检查 → 创作中心 → 发布

---

## P2-M2：抖音 RPA 发布器

**目标**：Playwright 自动化发布到抖音

| 任务 | 文件 |
|------|------|
| 创建抖音发布器 | `electron/publishers/douyin-rpa.js` |
| Python 适配器 | `python/publishers/rpa_douyin.py` |
| 注册 main.js | 任务队列添加 douyin 分支 |
| 前端启用 | Publish.vue 平台列表添加抖音 |

---

## P2-M3：PROJECT-001 集成

**目标**：content-aggregator 抓取文章后自动推送到 Multi-Publish

| 任务 | 文件 |
|------|------|
| WebSocket 桥接 | `electron/aggregator-bridge.js` |
| API 监听端点 | `python/server.py` 新增 `/api/publish-from-article` |
| 前端状态 | 新增集成状态页面或通知 |

---

## P2-M4：Electron 打包

**目标**：electron-builder 生成 .exe 安装包

| 任务 | 文件 |
|------|------|
| 构建配置 | `electron-builder.yml` |
| package.json scripts | 添加 `build:win` 脚本 |
| Vite 生产构建 | 预构建 dist 目录 |
| Playwright 内嵌 | 打包 Chromium 二进制 |

---

### 执行顺序

```
P2-M1 (微博) → P2-M2 (抖音) → P2-M3 (001集成) → P2-M4 (打包)
```

M1+M2 可并行开发。
