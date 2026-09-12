# PRD：采集链路日志覆盖补强（P0-P2）+ 手动采集周末限流豁免

**版本**：v1.0 | **日期**：2026-09-12 | **状态**：已实施

## 1. 问题背景

百家号采集 bug（PR #1735）排查时发现两个系统性问题：

1. **日志遗漏**：采集链路 6 个环节不写应用日志（app-*.log），排障只能靠审计 jsonl 或猜
2. **周末限流误伤手动采集**：RateLimiter 的 weekendFactor 策略为自动批量采集设计（模拟人类周末低频降低封号风险），但用户周六手动点击【采集】也被 40-60% 概率随机拒绝，且提示文案不解释原因，用户非常迷惑

## 2. 日志遗漏清单与修复（P0-P2 全部实现）

| 优先级 | 遗漏环节 | 修复 | 日志级别 |
|-------|---------|------|---------|
| P0-① | 前置拦截分支（预算/冷却/熔断/限流）不写应用日志 | 每个分支补 `this._log.warn('url-collect', '采集被拦截：...', { url, platform, reason, waitMs })` | warn |
| P0-② | 缓存命中无日志（返回空数据无法解释） | 补 `缓存命中（返回空标题/正文为预期行为，内容已缓存）` | info |
| P1-③ | 采集过程无日志（浏览器/HTTP 启动无记录） | 补 `启动 stealth 浏览器采集` / `启动 HTTP 采集`（含 mode） | info |
| P1-④ | 采集成功无 info 日志 | 补 `采集成功`（含 durationMs/titleLen/contentLen） | info |
| P1-⑤ | 前端 notifyError 上报不带用户看到的文案 | useNotify 的 notify() 把实际文案作为 error 字段传 reportNotify | — |
| P2-⑥ | 聚合层 IPC 非零码无日志（400/422 业务失败无痕） | aggregation:collect 非零码补 `logger.warn('[aggregation] collect returned non-zero:...')` | warn |

## 3. 手动采集周末限流豁免

### 3.1 设计决策

**问题**：weekendFactor 策略（如知乎 0.5 = 周末 50% 概率拒绝）为自动批量采集设计——模拟人类周末低频使用，降低账号被平台封禁的风险。但用户手动点击【采集】也被随机拒绝不合理：

- 用户明确想采这一篇，被概率拦截无意义
- 拦截后提示「请求频率受限」不解释是周末策略，用户迷惑

**方案**：`collect(url, opts)` 新增 `manual` 参数：

- `manual: true`（采集页手动点击）→ **跳过 weekend-throttle 随机拒绝**，但保留 interval 限流（防连点）与熔断/冷却（防滥用）
- `manual` 未传/false（自动批量路径）→ weekend-throttle 照常生效

### 3.2 数据流

```
采集页点击【采集】
  → preload urlCollectFetch(url) → invoke('url-collect:fetch', { url, manual: true })
  → IPC handler → collect(url, { manual: true })
  → RateLimiter.evaluate({ ...strategy, manual: true })
  → isWeekend && !manual → false（跳过随机拒绝）
  → interval 限流照常 → 采集执行
```

**调用链安全性**：`urlCollectFetch` 仅采集页手动点击使用（批量采集走 `aggregationCollectBatch` 不经此 IPC，已核实 Collection.vue 全部调用点），preload 固定传 `manual: true` 不会误豁免自动路径。

### 3.3 RateLimiter 变更

```js
// packages/collection-engine/src/rate-limiter.js evaluate()
if (isWeekend(now) && !strategy.manual) {  // ← 新增 manual 豁免
  const factor = strategy.weekendFactor ?? 1
  if (factor < 1 && this._rng() > factor) {
    return { allowed: false, reason: 'weekend-throttle' }
  }
}
```

## 4. 周末限流的用户提示（自动批量路径仍会触发时）

新增 `weekend_throttle` 错误分类 + zh/en 文案：

**zh**：
> 周末自动采集已按保护策略降低频率（模拟人工低频使用，降低账号被平台封禁的风险）。本次请求被随机延迟。您可以：1) 稍等片刻再试；2) 在采集页手动输入链接单次采集（手动采集不受周末策略限制）；3) 工作日再执行批量采集。

**文案设计原则**（从用户角度）：
- 先解释**为什么**：保护账号不被封禁（用户关心自己的账号安全）
- 再给**怎么办**：三个可操作选项（等/手动/工作日）
- 明确告知手动采集**不受限**（引导用户用正确的方式）

## 5. 数据校验

- `collect(url, opts)`：opts.manual 仅接受 Boolean（`Boolean(opts.manual)` 归一化）
- IPC 层：`arg.manual` 缺省为 false（`Boolean(arg.manual)`）
- RateLimiter：`strategy.manual` truthy 即豁免；不传/undefined/false 均不豁免
- 前端分类器：`weekend-throttle`（机器码）或 `周末限流`（中文）→ weekend_throttle 类

## 6. 流程与交互逻辑

### 6.1 手动采集（修复后）

1. 用户周六点击【采集】→ manual: true → 跳过周末随机拒绝 → interval 限流（8-25s 内连点会被拦，提示 rate_limited）→ 采集执行

### 6.2 自动批量采集（不变）

1. 批量任务 → 无 manual → weekend-throttle 按平台 factor 随机拒绝
2. 被拒时返回 reason: 'weekend-throttle'
3. 前端分类 → weekend_throttle → 显示解释性文案 + 重试按钮

## 7. 显示项与提示文字

| 场景 | 显示文案 | 重试按钮 |
|------|---------|---------|
| 手动采集（周末） | 正常采集（无周末拦截） | — |
| 手动采集连点过快 | 请求过于频繁，被平台限流。请等待 30 秒后重试。 | 显示 |
| 自动批量周末被随机拒绝 | 周末自动采集已按保护策略降低频率…（完整文案见 §4） | 显示 |

## 8. 回归保护

- url-collector.test.js 新增 10 用例：P0×3（预算/熔断/限流日志）+ P1×1（缓存日志）+ P2×2（成功/浏览器日志）+ manual×3（豁免/不豁免/IPC 透传）+ 1 修复
- collect-error.test.js：weekend_throttle 分类（45 用例全绿）
- collection-engine 91 + Collection 53 + aggregation IPC 14 + notify 全绿

## 9. 验收标准（已全部通过）

- [x] 8 个前置拦截/缓存/成功分支全部写应用日志
- [x] 采集过程（浏览器/HTTP 启动）写 info 日志
- [x] 采集成功写 info（含 durationMs/titleLen/contentLen）
- [x] 前端 notifyError 上报用户实际看到的文案
- [x] 聚合层非零码写 warn 日志
- [x] 手动采集（周六实测）不被 weekend-throttle 拦截
- [x] 自动路径（无 manual）仍受 weekend-throttle 限制
- [x] weekend_throttle 分类与文案 zh/en 成对
- [x] 真机日志验证：启动/成功/失败三类日志均落盘
