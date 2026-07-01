# 数据同步系统 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **目标平台**: 视频号/小红书/公众号/抖音/B站

---

## 一、方案

### 设计思路

利用各平台的创作者后台数据页面，通过 Playwright 登录后抓取页面数据，或通过 API 直接拉取。

```
定时触发 (每小时/每天)
    │
    ├─ Playwright 模式: 登录 → 打开 data_url → 提取数据
    │   └─ 适合: 无公开 API 的平台 (微信/小红书/视频号)
    │
    └─ API 模式: 直接调平台 API
        └─ 适合: 有公开 API 的平台 (抖音/B站)
```

| 平台 | 模式 | data_url | 可行性 |
|------|------|---------|:------:|
| **视频号** | Playwright | channels.weixin.qq.com/data | ⭐⭐⭐ |
| **小红书** | Playwright | creator.xiaohongshu.com/creator/data-center | ⭐⭐⭐⭐ |
| **公众号** | Playwright | mp.weixin.qq.com/cgi-bin/home | ⭐⭐⭐ |
| **抖音** | API | creator.douyin.com/studio/data | ⭐⭐⭐⭐ |
| **B站** | API | member.bilibili.com/platform/analysis | ⭐⭐⭐⭐⭐ |

---

## 二、接口设计

```javascript
// packages/shared-utils/src/data-sync.js

class DataSyncService {
  /** 拉取所有平台数据 */
  async syncAll() → { results: { platform, data, error }[] }

  /** 拉取单个平台数据 */
  async syncPlatform(platform) → { articles, views, comments, ... }

  /** 获取缓存的数据 */
  getCachedData(platform) → { ... } | null
}
```

同步数据格式：
```javascript
{
  platform: 'douyin',
  syncedAt: '2026-06-13T10:00:00Z',
  articles: 42,         // 发布文章数
  views: 15800,         // 总阅读
  comments: 320,        // 评论数
  likes: 1200,          // 点赞数
  followers: 5280,      // 粉丝数
  income: null,         // 收益（暂不支持）
}
```

---

## 三、存储

数据缓存到 Store (SQLite)：

```sql
CREATE TABLE sync_data (
  platform    TEXT PRIMARY KEY,
  data        TEXT,  -- JSON
  synced_at   TEXT
);
```

---

## 四、验收

- [ ] 5 个平台的数据同步配置
- [ ] syncAll 不崩溃（单个失败不影响其他）
- [ ] 数据缓存到 SQLite
- [ ] Dashboard 展示同步数据
- [ ] 手动触发同步按钮
