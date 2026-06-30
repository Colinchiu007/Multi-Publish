---
name: multipublish-design
description: Multi-Publish DESIGN.md — 发布引擎与反检测设计
---

# Multi-Publish — 设计文档

> **版本**: v1.6.3 | **更新**: 2026-07-01

## 一、任务队列设计

### 1.1 TaskQueue 模型

```javascript
class TaskQueue {
    maxConcurrent: 2       // 最大并发发布数
    retryConfig: {
        maxRetries: 3,
        backoff: [5, 15, 30]  // 秒
    }
    queue: asyncio.Queue
    active: number
}
```

### 1.2 PublishIntervalGuard

按平台的最小发布间隔：

| 平台 | 最小间隔 |
|------|---------|
| B站 | 30s |
| 抖音 | 60s |
| 小红书 | 120s |
| 视频号 | 60s |
| YouTube | 300s |

---

## 二、RPA 反检测设计

### 2.1 StealthWindow 架构

每个 RPA BrowserWindow 注入 stealth-helper.js：

| 检测点 | 覆盖方式 | 注入值 |
|--------|---------|--------|
| navigator.webdriver | `Object.defineProperty` → undefined | `undefined` |
| chrome.runtime | 伪造 Extension ID | `"aohghmighlieiainnegkcijnfilokake"` |
| navigator.plugins | 3 个伪造插件 | Chrome PDF / Widevine |
| navigator.languages | 重写 getter | `['zh-CN', 'zh', 'en']` |
| permissions.query | 拦截 clipboard-read | grant |
| WebDriver 特征 | 全部清除 | — |

### 2.2 注入时机

```
win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(STEALTH_SOURCE)
})
```

在页面完全加载后注入，确保覆盖所有运行时检测。

---

## 三、上传引擎设计

### 3.1 ChunkedUploader

| 参数 | 值 | 说明 |
|------|-----|------|
| 分块大小 | 5MB | 兼顾成功率与效率 |
| 最大并发 | 3 | 避免带宽抢占 |
| 重试次数 | 3 | 失败块自动重试 |
| 完整性校验 | MD5 | 合并前验证 |

### 3.2 ProxyPool

| 功能 | 实现 |
|------|------|
| IP 轮换 | 随机选择 + 失败剔除 |
| 健康检查 | 每 5min 探活 |
| 延迟排序 | 按响应时间优选 |

---

## 四、平台选择器设计

`platform-selectors.js` 定义各平台的 DOM 操作路径：

```javascript
const SELECTORS = {
    bilibili: {
        uploadBtn: '#app > ...',
        videoInput: 'input[type=file]',
        titleField: '.title-input input',
        submitBtn: '.publish-btn',
    },
    douyin: {
        // ...
    }
}
```

---

## 五、测试覆盖

| 层级 | 数量 | 覆盖 |
|------|------|------|
| 单元测试 | 45+ | TaskQueue, ChunkedUploader, ProxyPool, IntervalGuard |
| 集成测试 | 21 | RPA 流程, CloudPublisher, E2E |
| 发布测试 | 9 | B站/抖音/小红书/视频号 |
