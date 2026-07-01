# 格式适配器 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **依赖**: PRD v1.1（PM-PRD-v1.1.md F1）

---

## 一、方案对比

### 方案 A：统一 Pipeline

```
input → detect_platform → normalize → platform_formatter → output
                                                     ↓
                                              (每个平台一个函数)
```

| 维度 | 评分 |
|------|:----:|
| **实现简单** | ⭐⭐⭐⭐⭐ |
| **扩展性** | ⭐⭐⭐⭐⭐（加平台=加函数） |
| **测试性** | ⭐⭐⭐⭐⭐（纯函数，无副作用） |
| **推荐** | ✅ **采纳** |

### 方案 B：类继承体系

```
BaseFormatter → WeChatFormatter
             → ZhihuFormatter
             → ...
```

| 维度 | 评分 |
|------|:----:|
| **实现简单** | ⭐⭐⭐（类继承增加抽象） |
| **扩展性** | ⭐⭐⭐⭐ |
| **测试性** | ⭐⭐⭐⭐ |
| **理由** | ❌ 不需要，纯函数就够了 |

**结论**：方案 A，每个平台一个导出函数。

---

## 二、详细设计

### 2.1 文件结构

```
packages/shared-utils/src/
  format-adapter/
    index.js          ← 入口：formatForPlatform(html, platform, options)
    formatters.js     ← 11 个平台的 format 函数
    rules.js          ← 各平台尺寸/长度限制常量
    sanitize.js       ← HTML 清理（标签白名单）
```

### 2.2 核心接口

```javascript
// index.js
function formatForPlatform(html, platform, options = {}) {
  // 1. 解析 HTML → 内部结构（title, content, images, tags）
  // 2. 按平台限制截断（标题长度、正文长度）
  // 3. 调用 platform 的 formatter
  // 4. 返回 { title, content, tags, ... }
}

// formatters.js
// 每个平台一个导出函数：
function wechatFormatter(struct) → { title, content, coverSize }
function zhihuFormatter(struct) → { title, content, tags }
function weiboFormatter(struct) → { title, content }
// ... 11 个
```

### 2.3 数据流

```javascript
// 输入
const html = '<h1>标题</h1><p>正文内容...<img src="..."/></p>'

// 1. normalize
const struct = {
  title: '标题',
  content: '正文内容...',
  images: ['...'],
  tags: ['标签1', '标签2'],
}

// 2. apply platform limits
struct.title = struct.title.slice(0, LIMITS[platform].maxTitle)
struct.content = struct.content.slice(0, LIMITS[platform].maxContent)

// 3. format
const output = formatters[platform](struct)
```

### 2.4 各平台限制（rules.js）

```javascript
const LIMITS = {
  wechat_mp: { maxTitle: 64, maxContent: 20000, maxImages: 10, coverSize: '900x500' },
  zhihu:     { maxTitle: 120, maxContent: 100000, maxImages: 50, coverSize: '1280x720' },
  weibo:     { maxTitle: 120, maxContent: 2000, maxImages: 9, coverSize: '980x550' },
  douyin:    { maxTitle: 30, maxContent: 1000, maxImages: 9, coverSize: '1080x1440' },
  xiaohongshu: { maxTitle: 20, maxContent: 1000, maxImages: 9, coverSize: '1080x1080' },
  tencent_video: { maxTitle: 60, maxContent: 1000, maxImages: 9, coverSize: '1080x1080' },
  kuaishou:  { maxTitle: 40, maxContent: 500, maxImages: 9, coverSize: '1080x1440' },
  toutiao:   { maxTitle: 64, maxContent: 50000, maxImages: 20, coverSize: '1200x600' },
  youtube:   { maxTitle: 100, maxContent: 5000, maxImages: 1, coverSize: '1280x720' },
  tiktok:    { maxTitle: 30, maxContent: 500, maxImages: 1, coverSize: '1080x1440' },
  bilibili:  { maxTitle: 80, maxContent: 20000, maxImages: 20, coverSize: '1146x717' },
}
```

### 2.5 TDD 测试策略

| 测试 | 说明 |
|------|------|
| HTML 解析 | <h1> <p> <img> 标签正确提取 |
| 长度截断 | 超长标题/正文自动裁切 |
| 标签处理 | HTML tag 移除 / 白名单保留 |
| 空输入 | 空字符串/Null 不崩溃 |
| 各平台格式 | 至少微信/知乎/微博 3 个核心平台验证 |
| 回退机制 | 不支持格式 → 纯文本降级 |

---

## 三、与 F2 封面图的集成点

格式适配器输出中标记 `coverSize`，F2 根据此信息处理封面图：

```javascript
// 格式适配器输出
{ title, content, tags, coverSize: '900x500' }
// → F2 读取 coverSize 裁剪封面图到 900×500
```

---

## 四、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 平台格式变化 | 某个 formatter 失效 | 模块化，单个修复不影响整体 |
| HTML 解析复杂 | 内容丢失或样式错乱 | 白名单机制，只保留安全标签 |
| 图片 URL 带防盗链 | 文章无法显示图片 | 保留原 URL，不处理图片本身 |

---

> **请 CEO 确认：** 方案 A（纯函数 Pipeline）是否接受？确认后进入 TDD 开发阶段。
