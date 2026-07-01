# P1 实施计划：富文本编辑器 + 任务队列 + 多账号 + 知乎 RPA

> **基线分支**：`develop`
> **预计工时**：8-12 小时

---

## 里程碑 P1-M1：富文本编辑器

**目标**：将发布页的纯文本 textarea 替换为 WYSIWYG 富文本编辑器

| 任务 | 文件 | 说明 |
|------|------|------|
| 安装 TinyMCE/Quill | `npm install @tinymce/tinymce-vue` 或 vue-quill | 轻量、中文友好 |
| 创建编辑器组件 | `src-frontend/components/ArticleEditor.vue` | 封装富文本，支持 HTML 粘贴 |
| 更新 Publish.vue | 替换 textarea 为 ArticleEditor | 保持 data 绑定一致 |

**验证**：输入加粗/标题/图片 → 点击发布 → 后台收到正确 HTML

---

## 里程碑 P1-M2：任务队列系统

**目标**：发布请求进入队列，后台顺序执行，支持重试和超时

| 任务 | 文件 | 说明 |
|------|------|------|
| 任务模型 | `electron/publishers/task-queue.js` | 队列 FIFO + 状态 (pending/running/done/failed) |
| 任务存储 | `task-queue.js` 内或单独文件 | 内存队列 + 持久化到 JSON |
| IPC 接口 | `electron/main.js` | 新增 `publish:queue` / `publish:status` |
| 前端组件 | `src-frontend/components/TaskList.vue` | 任务列表显示 (el-table) |

**验证**：连续提交 3 篇文章 → 队列顺序执行 → 状态正确更新

---

## 里程碑 P1-M3：多账号管理

**目标**：支持添加/删除/切换微信公众号账号

| 任务 | 文件 | 说明 |
|------|------|------|
| 账号存储 | `electron/account-manager.js` | 读取 Python `/api/accounts`，本地缓存 |
| 添加账号 IPC | `electron/main.js` | 打开 Playwright 浏览器 → 扫码 → 保存 Cookie + 账号信息 |
| 前端页面 | `src-frontend/views/Accounts.vue` | 完善为完整 CRUD 页面 |
| Cookie 隔离 | `electron/cookie-store.js` | 按 account_id 隔离 Cookie 文件 |

**验证**：添加微信公众号账号 → Cookie 加密保存 → 列表显示 → 删除 → Cookie 清除

---

## 里程碑 P1-M4：知乎 RPA 发布器

**目标**：支持 Playwright 自动化发布到知乎

| 任务 | 文件 | 说明 |
|------|------|------|
| 知乎发布器 | `electron/publishers/zhihu-rpa.js` | 登录 + 创作中心 → 写文章 → 发布 |
| Python 适配器 | `python/publishers/rpa_zhihu.py` | 接口定义 |
| 前端注册 | `src-frontend/views/Publish.vue` | 添加知乎勾选项 |
| IPC 路由 | `electron/main.js` | 新增 `publish:zhihu` handler |

**验证**：可选知乎 → 输入内容 → 发布 → 知乎上可见文章

---

### 执行顺序

```
P1-M1 (富文本) → P1-M2 (任务队列) → P1-M3 (多账号) → P1-M4 (知乎)
```

优先做 M1+M2，这两项是 P0 缺失的核心体验。M3+M4 可以并行开发。
