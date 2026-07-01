# 平台 URL 配置化 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **参考**: 融媒宝 `data/media_url_list.txt` 设计
> **目标**: 将所有平台信息集中到 `config/platforms.yaml`，替代散落在代码中的硬编码

---

## 一、方案

### 方案 A：YAML 配置文件（推荐）

```
multi-publish/
  config/
    platforms.yaml    ← 所有平台配置
```

| 维度 | 评分 |
|------|:----:|
| **简单** | ⭐⭐⭐⭐⭐（纯文本，无数据库） |
| **可扩展** | ⭐⭐⭐⭐⭐（加平台=加一段 YAML） |
| **读取性能** | ⭐⭐⭐⭐⭐（单次加载，缓存到内存） |
| **推荐** | ✅ **采纳** |

---

## 二、配置结构

```yaml
# config/platforms.yaml
platforms:
  wechat_mp:
    id: 1
    name: 微信公众号
    type: article                # article | video | mixed
    icon: 💬
    category: 中文
    publish_url: ""
    data_url: ""
    comment_url: ""
    cover_size: 900x500
    max_title: 64
    max_content: 20000
    has_api: false               # 是否有公开 API

  douyin:
    id: 36
    name: 抖音
    type: mixed
    icon: 🎵
    category: 中文
    publish_url: "https://creator.douyin.com/"
    data_url: "https://creator.douyin.com/studio/data"
    comment_url: "https://creator.douyin.com/studio/comment"
    cover_size: 1080x1440
    max_title: 30
    max_content: 1000
    has_api: true
```

---

## 三、加载器设计

### 核心接口

```javascript
// packages/shared-utils/src/platform-config.js

class PlatformConfig {
  constructor(configPath) { ... }
  
  /** 获取所有平台列表 */
  listPlatforms() → [{ id, name, type, icon, ... }]
  
  /** 获取单个平台配置 */
  getPlatform(id) → { id, name, ... } | null
  
  /** 获取平台数据同步 URL */
  getDataUrl(platform) → string | null
  
  /** 获取平台评论 URL */
  getCommentUrl(platform) → string | null

  /** 获取封面尺寸 */
  getCoverSize(platform) → { width, height } | null
}
```

### 受益方替代方案

| 当前硬编码位置 | 改为从 PlatformConfig 读取 |
|---------------|--------------------------|
| `App.vue` 的 `platformMeta` | `listPlatforms()` |
| `Accounts.vue` 的 `platformMap` | `listPlatforms()` |
| `Publish.vue` 的 `platforms` 数组 | `listPlatforms()` |
| `rules.js` 的 `LIMITS` | `getPlatform(id).maxTitle / maxContent` |
| `presets.js` 的 `PRESETS` | `getCoverSize(id)` |
| Registry 的平台注册 | 保持不变（代码类注册） |

---

## 四、验收

- [ ] `config/platforms.yaml` 覆盖全部 12 个平台
- [ ] 从配置加载替代 App.vue 的 platformMeta 硬编码
- [ ] 从配置加载替代 rules.js 的 LIMITS
- [ ] 从配置加载替代 presets.js 的 PRESETS
- [ ] 配置不存在 → 报错提示（不静默失败）
- [ ] 单个平台配置缺失 → 跳过，不影响其他平台
