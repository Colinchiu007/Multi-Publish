# Phase 2 执行计划 v2（优化版）

> **更新**: 2026-06-27 | **状态**: 待确认

---

## 评估发现：5 个关键优化点

### 🔍 发现 1：Playwright 发布器已损坏（严重）

**所有 14 个 `*-rpa.js`** 都从 `playwright-manager.js` 解构 `smartWait`，但该文件**根本不导出 smartWait**。

```
// playwright-manager.js 导出
module.exports = { launchBrowser, getContext, newPage, closeBrowser }
//                                        ↑ 没有 smartWait!

// 所有 publisher 都这么写（错误）
const { smartWait } = require('../playwright-manager')
// smartWait === undefined → await smartWait() 会抛 TypeError
```

这意味着当前非抖音的 13 个平台的 RPA 发布**事实上不可用**。不是"需要迁移"，而是"根本跑不起来"。

**影响**：迁移不是重构，而是修 bug + 重建。不需要兼容旧代码。

---

### 🔍 发现 2：发布流程高度重复 → 可配置化

分析 14 个 publisher 后，它们都遵循同一个模板：

```
1. goto(publish_url)
2. fill(title_input, title)
3. fill(editor/content, content)
4. set_file_input(file_input, file_path)
5. click(publish_btn)
6. wait(success_selector) or wait(url_change) or wait(api_response)
```

每个平台差异只有：CSS 选择器、发布 URL、内容类型、超时时间。

而**这些信息已经存在**于三个地方：

| 信息来源 | 位置 | 覆盖范围 |
|---------|------|---------|
| 发布 URL + 内容限制 + 类型 | `config/platforms.yaml` | 全 14 平台 |
| CSS 选择器 | `src/platform-selectors.js` → `PLATFORM_PUBLISH_SELECTORS` | 全 14 平台 |
| 超时配置 | `rpa-view-manager.js` → `PLATFORM_TIMEOUTS` | 全 14 平台 |
| 成功响应模式 | `rpa-view-manager.js` → `PLATFORM_SUCCESS_PATTERNS` | **仅抖音** |

**结论**：99% 的 publisher 逻辑可以用**配置驱动**，不需要写 11 个 `_publish_*` 方法。

---

### 🔍 发现 3：`platforms.yaml` 与 RpaViewManager 配置重复

`rpa-view-manager.js` 有自己的 `PLATFORM_PUBLISH_URLS`（LINE 24-37），但 `config/platforms.yaml` 同样有 `publish_url`。

```
# rpa-view-manager.js       # config/platforms.yaml
douyin: creator.douyin.com   douyin: creator.douyin.com
weibo: weibo.com             weibo: weibo.com
...                          ...
```

两份配置不同步会导致诡异 bug。

---

### 🔍 发现 4：依赖链清晰，可精确裁剪

Playwright 依赖集中在 `playwright-manager.js`，外部消费者有限：

| 消费者 | 路径 | 是否可替换 |
|--------|------|-----------|
| base-rpa-publisher.js | `packages/rpa-engine/src/` | 全部 publisher 迁移后删除 |
| all `*-rpa.js` | `packages/rpa-engine/src/publishers/` | 迁移一个删一个 |
| url-collector.js | `apps/desktop/electron/` | 仅 fallback，不影响核心发布 |
| account-manager.js | `apps/desktop/electron/publishers/` | 与 AuthViewManager 关联，独立 |
| main.js | `apps/desktop/electron/` | 切换成 PublisherRouter |

**结论**：迁移完成后可以安全移除 `playwright` npm 包，节省约 200MB 的 `node_modules` 和浏览器二进制文件。

---

### 🔍 发现 5：`platform-selectors.js` + `platforms.yaml` 已覆盖 95% 的平台数据

`platform-selectors.js` 已经定义了 14 个平台的登录 URL、登录成功选择器、发布选择器。

缺少的字段：
- 内容类型选择器细化（title vs content vs tags 分离）
- 成功检测方式（api_response / url_change / dom_selector）
- API 响应匹配模式（仅抖音有）
- 特殊 hook 标记（如微信公众号需要切 iframe）

---

## 优化方案：配置驱动 → 1 个通用方法替代 11 个

### 核心变更

在 `rpa-view-manager.js` 中新增一个方法 `_publish_generic`，从此结束逐个平台的重复编写：

```javascript
async _publish_generic (win, article, platform) {
  const config = this._getPlatformConfig(platform)
  // config = {
  //   publish_url, timeout, type: 'article'|'video'|'mixed',
  //   selectors: { title, content, tags, file_input, publish_btn },
  //   success: { mode: 'api'|'url'|'dom', patterns: [...], selector: '...' },
  //   preFill: 'switchToIframe' | null  // hook
  // }
  
  this._emitProgress(platform, '导航到发布页...', 5)
  await this._navigateAndWait(win, config.publish_url, 3000)

  // 检查登录态
  if (win.webContents.getURL().includes('login')) {
    return { success: false, error: `${platform} 未登录`, platform }
  }

  // Hook: 预操作（如切 iframe）
  if (config.preFill) await this._execHook(win, config.preFill)

  // 填充标题
  if (article.title && config.selectors.title) {
    this._emitProgress(platform, '填写标题...', 25)
    await this._fillInput(win, config.selectors.title, article.title)
  }

  // 填充正文
  if (article.content && config.selectors.content) {
    this._emitProgress(platform, '填写正文...', 40)
    await this._fillInput(win, config.selectors.content, article.content)
  }

  // 上传文件
  if (article.video_path && config.selectors.file_input) {
    this._emitProgress(platform, '上传文件...', 55)
    await this._setFileInput(win, article.video_path)
    // 等待上传完成
    const uploadDone = await this._waitForCondition(win, `
      function() { return !document.querySelector('[class*="progress"]'); }
    `, config.timeout * 0.6)
  }

  // 标签
  if (article.tags?.length && config.selectors.tags) {
    // 逐个标签输入 + Enter
  }

  // 发布
  this._emitProgress(platform, '正在发布...', 85)
  const responsePromise = config.success.mode === 'api'
    ? this._waitForResponse(win, config.success.patterns, 60000)
    : Promise.resolve(null)

  await this._click(win, config.selectors.publish_btn)

  // 验证成功
  if (responsePromise) {
    const response = await responsePromise
    return response
      ? { success: true, url: win.webContents.getURL(), platform }
      : { success: false, error: '发布结果确认超时', platform }
  }
}
```

### 配置示例

```yaml
# config/platforms.yaml 扩展
platforms:
  weibo:
    rpa_config:
      type: mixed                       # article | video | mixed
      timeout: 120000
      selectors:                        # 从 platform-selectors.js 引用
        title: null                     # 微博没有标题
        content: '.publisher_text textarea'
        file_input: 'input[type="file"]'
        publish_btn: 'a[node-type="submit"]'
      success:
        mode: dom                       # api | url | dom
        selector: '.success-toast'

  bilibili:
    rpa_config:
      type: mixed
      mode: api+rpa                     # API 优先，RPA 回退（特殊处理）
      api: { /* API 配置 */ }
      timeout: 300000
```

### 与原始方案的对比

| 维度 | v1 方案（逐个迁移） | v2 优化方案（配置驱动） |
|------|:------------------:|:---------------------:|
| 每个平台的工作量 | ~80-120 行 JS | ~10 行 YAML |
| 11 个平台总工作量 | ~4.5 天 | ~0.5 天 |
| 新增平台成本 | ~4 小时（写完整方法） | ~10 分钟（配 YAML） |
| 平台 UI 变更适应 | 改方法代码 | 改 YAML 选择器 |
| 测试覆盖面 | 11 个方法分别测 | 1 个方法 + 11 套配置 |
| 架构复杂度 | 高（11 个平级方法） | 低（1 通用 + N 配置） |
| 死代码清理 | 逐个删 | 批量删 |

---

## 修订后执行计划

### P2-A: PublisherRouter + 配置合并 (1d)

- 新建 `publisher-router.js` — 统一路由表
- 将 `platforms.yaml` 作为单数据源
- 移除 RpaViewManager 中重复的 `PLATFORM_PUBLISH_URLS` / `PLATFORM_TIMEOUTS`
- 合并 `platform-selectors.js` 到配置系统
- 补全 `PLATFORM_SUCCESS_PATTERNS` 到全平台（至少每个平台一个模式）

### P2-B: 通用发布引擎 + per-Field 重试 (1.5d)

- 在 RpaViewManager 中实现 `_publish_generic` 方法
- 实现 `_getPlatformConfig(platform)` 从配置加载
- 实现 `_execHook(win, hookName)` 平台特殊操作（iframe 切换等）
- 集成 Per-Field 重试状态机到通用方法
- 集成 ProgressThrottle

### P2-C: 平台配置补全 (1d)

为 13 个非抖音平台补全 `rpa_config`：

| 批次 | 平台 | 复杂度 | 说明 |
|:----:|------|:------:|------|
| 1 | weibo, zhihu, toutiao | ★☆☆ | 纯文本 + 无文件上传 |
| 2 | xiaohongshu, baijiahao, twitter | ★★☆ | 图文 + 图片上传 |
| 3 | wechat_mp | ★★★ | iframe 切换 + 草稿群发 |
| 4 | kuaishou, tiktok, tencent_video | ★★☆ | 视频上传 |
| 5 | youtube, instagram, facebook | ★★★ | 海外平台 + 表单复杂 |

### P2-D: 特例平台适配 (1d)

对无法通过通用方法覆盖的平台添加 preProcess/postProcess hook：

- **bilibili**: API 优先 + RPA 降级（保留现有 API 调用逻辑）
- **wechat_mp**: 需要 iframe 切换、草稿保存、群发三步
- **douyin**: 已独立实现 `_publish_douyin`，保留不变
- **youtube**: 文件上传可能需要特殊 CDP 处理

### P2-E: 清理 + 文档 (0.5d)

- 删除所有 `*-rpa.js` 文件（含 `douyin-rpa.js` 残留）
- 删除 `base-rpa-publisher.js`、`playwright-manager.js`、`cookie-store.js`（确认无外部引用后）
- 更新 `@multi-publish/rpa-engine` 入口
- 更新 PRD
- 删除 `playwright` 和 `playwright-core` npm 依赖

---

## 总工作量对比

| | v1 分平台迁移 | v2 配置驱动 |
|:--|:-----------:|:----------:|
| P2-A | 0.5d | 1d |
| P2-B | 4.5d | 1.5d |
| P2-C | 0.5d (Per-Field) | 并入 P2-B |
| P2-D | 0.5d (节流阀+日志) | 并入 P2-B |
| P2-E | 0.5d (特例平台) | 1d (特例适配) |
| P2-F | 0.5d (清理) | 0.5d (清理) |
| **合计** | **~5-8d** | **~4d** |
| **新增平台** | **4h** | **10min** |

---

## 风险点

1. **CDP 文件上传兼容性**：抖音的 CDP 上传已验证，YouTube/B站/快手的视频上传可能不同（分片上传、转码）。需逐一测试。
2. **微信公众号 iframe**：公众号编辑器在 iframe 中，`_fillInput` 需要切换到 iframe context。RpaViewManager 的 `executeJavaScript` 默认在主 frame，需要加 `win.webContents.mainFrame` 或 frame 选择。
3. **海外平台网络**：YouTube/Instagram/Facebook 需要代理。P2-1 SOCKS5 代理已实现，但需要验证在 RpaViewManager 的 BrowserWindow 中能正常工作。
4. **`api-mode-publisher.js` 与通用引擎的关系**：B站的双模式（API+RPA）需要特殊处理。对于 API 模式，不应该走 RpaViewManager。
