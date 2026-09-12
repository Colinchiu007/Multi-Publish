# PRD：百家号文章采集「超时」误报修复

**版本**：v1.0 | **日期**：2026-09-12 | **状态**：已实施

## 1. 问题背景

用户在采集页输入百家号文章链接（如 https://baijiahao.baidu.com/s?id=1873093353787420593 ），点击【采集】或【一键改写】后显示错误提示：

> 目标网站响应超时。请检查网络连接后重试；若持续超时，可能是目标站点负载高，建议稍后再试。

该提示完全误导用户——实际失败原因与超时无关。

## 2. 根因分析（QM-5 五步）

### 2.1 第一性原因（三个独立缺陷叠加）

| # | 缺陷 | 位置 | 影响 |
|---|------|------|------|
| ① | baijiahao.baidu.com 无平台映射 | url-collector.js _platformFromHostname | 落到 generic 平台；generic 的 weekendFactor=0.6 在周末 40% 概率随机拒绝（weekend-throttle） |
| ② | IPC 失败返回缺顶层 message | url-collector.js registerIpcHandlers | 返回 { code: -1, data: result }，错误只在 data.error，无顶层 message |
| ③ | 前端取错字段 | Collection.vue collectUrl 回退分支 | collectError.message = result.message（undefined）→ 分类器按 code=-1 兜底误判为 timeout |

### 2.2 完整失败链

```
用户点击【采集】
  → Python 聚合层（trafilatura）：被百度重定向到 wappass.baidu.com 图形验证码 → 400 失败
  → 前端回退到 Node url-collect:fetch
  → _platformFromHostname('baijiahao.baidu.com') → 'generic'（缺陷①）
  → RateLimiter.evaluate(generic 策略)：周六 + weekendFactor 0.6 → 40% 概率 weekend-throttle 拒绝
  → collect() 返回 { success: false, error: '请求频率受限，请稍后再试', reason: 'weekend-throttle' }
  → IPC 返回 { code: -1, data: {...} }（缺陷②：无顶层 message）
  → 前端 collectError = { code: -1, message: undefined }（缺陷③）
  → classifyCollectError({ code: -1 }) → code=-1 匹配 timeout
  → UI 显示「目标网站响应超时」（完全误导）
```

### 2.3 逃逸分析

- **单测层**：url-collector.test.js 无 _platformFromHostname 的 baijiahao 用例；无 IPC 失败返回结构断言
- **集成层**：Collection.test.js 失败用例直接传 { code: 1, message: 'xxx' }（有 message），未覆盖 message 缺失场景
- **审查盲区**：PR #1714 加错误分类器时假设 IPC 返回总有 message，未验证 url-collect:fetch 的实际返回结构

## 3. 修复方案

### 3.1 平台映射（缺陷①）

```js
// url-collector.js _platformFromHostname
if (hostname.includes('baijiahao') || hostname === 'mbd.baidu.com') return 'baijiahao'
```

### 3.2 baijiahao 平台策略（default-strategies.json）

```json
"baijiahao": {
  "riskLevel": "medium",
  "dailyBudget": 100,
  "interval": { "min": 5000, "max": 15000 },
  "activeHours": { "start": 7, "end": 23 },
  "weekendFactor": 1.0,
  "backoff": { "baseMs": 30000, "maxMs": 900000, "factor": 2 },
  "circuitBreaker": { "failureThreshold": 3, "cooldownMs": 900000, "halfOpenMaxRequests": 1 },
  "fetcher": { "primary": "electron", "fallback": "stealthy" },
  "needsLogin": false,
  "warmup": false,
  "behaviorIntensity": "light"
}
```

**设计说明**：weekendFactor=1.0（不衰减）——百家号是内容采集目标而非发布平台，周末采集是正常用户行为；fetcher primary=electron（SPA 需要 stealth 浏览器渲染）。

### 3.3 IPC 返回补顶层 message（缺陷②）

```js
// url-collector.js registerIpcHandlers
if (result.success) {
  return { code: 0, data: result }
}
return { code: -1, message: result.error || '采集失败', data: result }
```

### 3.4 前端兜底读 data.error（缺陷③）

```js
// Collection.vue 回退分支
collectError.value = { code: result.code, message: result.message || (result.data && result.data.error) || '' }
```

## 4. 数据校验

- _platformFromHostname：baijiahao.baidu.com / mbd.baidu.com → 'baijiahao'；www.baidu.com 仍为 generic（非百家号落地页）
- weekendFactor=1.0：RateLimiter 周末判断 factor < 1 才拒绝，1.0 永不触发 weekend-throttle
- IPC 失败返回：message 必为非空字符串（result.error || '采集失败' 兜底）
- 前端 message 三级兜底：result.message > result.data.error > 空串（分类器对空串返回 unknown，不再误判）

## 5. 流程与交互逻辑

### 5.1 采集流程（修复后）

1. 用户输入百家号链接，点击【采集】
2. Python 聚合层尝试 → 被百度验证码拦截 → 失败回退（预期行为）
3. Node url-collect:fetch → platform='baijiahao'（不再 generic）
4. RateLimiter：weekendFactor=1.0 → 不再周末随机拒绝
5. Stealth 浏览器渲染 → 提取正文 → 成功
6. UI 显示成功卡片（标题 + 正文 + 创建草稿 + 加入爆款库 + 改写选项）

### 5.2 错误显示逻辑（修复后）

若仍被限流（如连续采集触发 rate-limit），错误链路：

1. collect() 返回 error='请求频率受限，请稍后再试'
2. IPC 返回 { code: -1, message: '请求频率受限...', data: {...} }
3. 前端 collectError.message = '请求频率受限...'
4. 分类器匹配「频率受限」→ rate_limited
5. UI 显示「请求过于频繁，被平台限流。请等待 30 秒后重试。」+ 重试按钮

## 6. 显示项与提示文字

| 场景 | 显示文案（zh） | 重试按钮 |
|------|--------------|---------|
| 采集成功 | ✅ {标题} + 创建草稿/加入爆款库/改写选项 | — |
| 限流（真实） | 请求过于频繁，被平台限流。请等待 30 秒后重试。 | 显示 |
| 验证码拦截 | 目标页面触发了安全验证（如知乎反爬）。建议：1) 在浏览器中打开该链接确认可访问；2) 稍后重试；3) 换用其他文章链接。 | 显示 |
| 超时（真实） | 目标网站响应超时。请检查网络连接后重试；若持续超时，可能是目标站点负载高，建议稍后再试。 | 显示 |

## 7. 回归保护

- url-collector.test.js 新增：baijiahao 平台映射断言 + IPC 失败返回顶层 message 断言
- 既有 25 个 url-collector 用例全绿（含 SSRF/知乎/百家号正文提取）
- collection-engine 91 用例全绿（新策略不破坏既有平台）

## 8. 验收标准（已全部通过）

- [x] baijiahao.baidu.com → platform 'baijiahao'（非 generic）
- [x] IPC 失败返回带顶层 message
- [x] 前端兜底读 data.error
- [x] 真机 CDP：urlCollectFetch 返回 code=0, success=true, 标题+2185 字正文
- [x] UI E2E：点击【采集】4 秒显示成功卡片
- [x] 审计日志：platform=baijiahao, status=200
