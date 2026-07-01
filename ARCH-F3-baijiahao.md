# 百家号 RPA 发布器 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **依赖**: PM-PRD-v1.1.md F3.1

---

## 一、平台调研

| 项目 | 信息 |
|------|------|
| **平台** | 百家号 (baijiahao.baidu.com) |
| **登录方式** | 百度账号（扫码/密码）+ Cookie 持久化 |
| **发布模式** | 纯 RPA（无公开 API） |
| **发布类型** | 图文、视频 |
| **编辑器** | 富文本编辑器（支持排版/图片/视频） |
| **封面要求** | 16:9 推荐，≥ 1200×675 |
| **标签** | 支持，最多 5 个 |
| **发布流程** | 编辑 → 设置封面 → 添加标签 → 提交审核 |

---

## 二、方案

### 方案 A：Playwright RPA（同现有 10 个平台）

继承 `BaseRPAPublisher`，实现 `checkLogin()` / `waitForLogin()` / `publish()`。

| 维度 | 评分 |
|------|:----:|
| **实现成本** | ⭐⭐⭐⭐（复用已有基类） |
| **稳定性** | ⭐⭐⭐（RPA 固有风险） |
| **推荐** | ✅ **采纳** |

**与 F1/F2 集成**：
- 发布前调 `formatAdapter.formatForPlatform(html, 'baijiahao')` 格式化内容
- 封面图调 `coverProcessor.processCover(input, 'baijiahao', dir)` 处理

---

## 三、详细设计

### 3.1 文件

```
packages/rpa-engine/src/publishers/
  baijiahao-rpa.js      ← 百家号发布器
```

### 3.2 发布流程

```
publishArticle(article)
  │
  ├─ 1. init() → 打开 Playwright 页面
  ├─ 2. checkLogin() → 检查 Cookie 是否有效
  │     └─ 失败 → waitForLogin() → 扫码登录
  ├─ 3. navigate to writer.baijiahao.baidu.com
  ├─ 4. 点击「写文章」
  ├─ 5. 填写标题
  ├─ 6. 填写正文 (粘贴 HTML / 纯文本)
  ├─ 7. 设置封面图 (上传或 URL)
  ├─ 8. 添加标签
  ├─ 9. 点击「发布」
  └─ 10. 等待发布结果 → 返回 { success, postId, url }
```

### 3.3 验收标准

- [ ] 语法正确，注册到 registry
- [ ] checkLogin() 能检测已登录/未登录状态
- [ ] 发布流程覆盖：标题/正文/封面/标签
- [ ] 发布结果返回正确结构
- [ ] cleanup() 正确关闭

---

> **注意**：百家号编辑器页面可能有嵌套 iframe，需要额外处理。
