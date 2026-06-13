# 评论统一管理 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **参考**: 融媒宝评论 URL 配置

---

## 一、方案对比

### 方案 A：WebContentsView 内嵌 + 统一收件箱

```
左侧：平台列表          右侧：评论页面
┌──────────┐          ┌──────────────────┐
│ 全部评论  │          │  抖音评论管理页    │
│ 抖音      │          │  (WebContentsView) │
│ 小红书    │          │                   │
│ 公众号    │          │  内嵌浏览器        │
│ B站      │          │  直接加载各平台     │
└──────────┘          │  评论管理 URL      │
                      └──────────────────┘
```

| 维度 | 评分 |
|------|:----:|
| **实现简单** | ⭐⭐⭐⭐⭐（复用 WebviewManager） |
| **功能完整** | ⭐⭐⭐⭐⭐（平台原生评论页全部能力） |
| **即时性** | ⭐⭐⭐⭐⭐（实时，无需 API） |
| **推荐** | ✅ **采纳** |

### 方案 B：API 拉取 + 自定义收件箱

通过各平台 API 拉取评论数据，自建统一收件箱 UI。

| 维度 | 评分 |
|------|:----:|
| **实现难度** | ⭐⭐（每个平台 API 不同） |
| **统一体验** | ⭐⭐⭐⭐⭐（真正的统一收件箱） |
| **推荐** | ❌ 工作量太大，先用方案 A |

**结论**：先做方案 A（内嵌浏览器），后续视需求升级方案 B。

---

## 二、详细设计

### 2.1 文件

```
apps/desktop/electron/
  comment-view.js       ← 评论视图管理器（基于 WebviewManager）
  
apps/desktop/src/views/
  Comments.vue          ← 新页面：左侧平台列表 + 右侧评论视图
```

### 2.2 页面布局

```
┌─────────────────────────────────────────────┐
│  评论管理                                      │
│  ┌──────────┬──────────────────────────────┐ │
│  │ 全部评论  │                              │ │
│  │──────────│    WebContentsView           │ │
│  │ 抖音  🔴 │    内嵌浏览器加载各平台       │ │
│  │ 小红书   │    评论管理页面               │ │
│  │ 公众号   │                              │ │
│  │ B站     │                              │ │
│  │ 视频号   │                              │ │
│  └──────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 2.3 评论 URL（从 platforms.yaml 读取）

```javascript
// 从平台配置获取 comment_url
wechat_mp:  "https://mp.weixin.qq.com/misc/appmsgcomment"
douyin:     "https://creator.douyin.com/studio/comment"
xiaohongshu: "https://creator.xiaohongshu.com/creator/comment"
toutiao:    "https://mp.toutiao.com/profile_v4/manage/comment/all"
bilibili:   "https://member.bilibili.com/platform/comment"
youtube:    "https://studio.youtube.com/channel/UC/comments"
```

### 2.4 评论计数（可选）

WebContentsView 加载后，通过页面 JS 提取评论数，显示在侧栏。

### 2.5 验收

- [ ] Comments.vue 新页面，左侧平台列表
- [ ] 点击平台 → 右侧 WebContentsView 加载评论页
- [ ] 至少 5 个平台可加载
- [ ] 复用 Moni tor.vue 的 WebContentsView 管理
- [ ] 从 router 可访问
