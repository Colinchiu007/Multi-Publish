# PRD：IPC 超时兜底 / 权限不足兜底 / 卸载清理（批次 A，M-13 + M-14 + M-16，2026-10-07）

> 关联缺陷：前端深度审查报告 §M-13（全域 IPC 零超时）、§M-14（`invokeWithFallback` 对「权限不足」完全失效）、§M-16（Collection 两处异步副作用未纳入卸载清理）
> 关联实现：`apps/desktop/src/api/electron-bridge.js`、`apps/desktop/src/views/Collection.vue`
> 状态：实现中

---

## 一、三条缺陷的用户可见表现

| 缺陷 | 用户撞上时会看到什么 |
|---|---|
| **M-13** IPC 零超时 | 点某个操作后按钮**永久转圈**、loading 永不消失，且**没有任何错误提示**。只能重启应用 |
| **M-14** 权限不足不兜底 | 未登录 / 许可证未激活时点功能，拿到的是 unhandled rejection，界面要么无反应要么弹通用报错，**而不是「请先登录/升级」** |
| **M-16** 卸载清理缺失 | 采集途中离开页面，阶段提示计时器继续跑，对**已卸载的组件**写状态；ASR 安装成功后的自动重试也会在离开后触发 |

M-13 与 M-14 合起来就是报告里那句「**用户零错误提示**」：不是提示不友好，是压根没有提示。

---

## 二、M-13：IPC 超时兜底

### 2.1 缺陷

`invoke()` 直接 `return api[method](...)`，**没有任何超时包装**。全仓生产代码搜索 `Promise.race` / `AbortController` 与 IPC 相关的 `setTimeout` **零命中**。

任一主进程 handler 卡死（Python bridge 挂起 / CDP 卡住 / SQLite 锁），前端 Promise 永久 pending，调用点 `loading` 永不复位、按钮永久禁用。

### 2.2 修法：新增 `invokeWithTimeout`，**不改 `invoke` 的默认行为**

```js
invokeWithTimeout(method, timeoutMs, fallback, ...args)
```

| 参数 | 语义 |
|---|---|
| `timeoutMs > 0` | 超时后 resolve(fallback)，并打开发模式警告 |
| `timeoutMs <= 0` | **不设超时**，原样 await（长任务用） |
| fallback | 超时后返回值 |

**为什么是新增函数而不是给 `invoke` 加默认值**：`pipelineStart`、`aggregationCollect`、`story2videoTranscribe` 这类长任务合法耗时可达数分钟。给它们套一个统一默认值，会把「长任务」变成「必超时」——用一个拍脑袋的默认值制造一批新故障。宁可让调用方显式选。

### 2.3 交互逻辑与提示文案

- 超时触发时，**开发模式**下打印 `[electron-bridge] IPC 超时 {ms}ms: {method} — 主进程未返回，调用方 loading 不会自动复位，请检查该 handler 是否卡死`
- 生产模式**静默返回 fallback**：避免高频场景刷屏
- 调用方拿到 fallback 后**必须自行渲染错误态**——本函数只保证不永久挂死，不替调用方决定文案

### 2.4 数据校验

| 判据 | 行为 |
|---|---|
| `timeoutMs` 为 `NaN` / `undefined` / `0` / 负数 | 视作不设超时 |
| 主进程在超时前 reject | 错误**原样抛出**，不被 fallback 吞掉 |
| 超时后原 promise 迟到 resolve | 不改写已返回的 fallback（settle-once） |
| 参数含循环引用 | 仍由 `toPlainIpcValue` 抛 `TypeError`（不变） |
| 无 API / 方法不存在 | 返回 `undefined`（与 `invoke` 一致，**不是** fallback） |

---

## 三、M-14：权限不足必须落进 fallback

### 3.1 缺陷

preload 的 `createPermissionError()` 对 `authenticated` 级方法**同步 throw**（`error.name = 'LicensePermissionError'`）。而 `invoke` 是 `async function` ⇒ 同步 throw 变成 **rejected promise** ⇒ `invokeWithFallback` 的 `await` 直接抛出，**`fallback` 分支永不执行**。

而 `PUBLIC_METHODS` 之外的所有方法（即"未登录/许可证未激活"这一**生产环境最高频失败模式**）都要求 `authenticated` 级。

### 3.2 修法

```js
catch (e) {
  if (e?.name === 'LicensePermissionError') return fallback
  throw e
}
```

判定依据是 `error.name` **而非 message** —— 改文案不该影响兜底行为。

**其余错误照原样抛出**：静默兜底会把真实故障藏起来，那比现在更糟。

### 3.3 数据校验

| 场景 | 行为 |
|---|---|
| preload 同步 throw 权限错误 | 返回 fallback |
| preload 异步 reject 权限错误 | 返回 fallback |
| 权限错误但 message 完全不同 | 仍返回 fallback（按 name 判） |
| 普通错误（主进程真炸了） | **原样抛出** |
| 正常返回 | 不被 fallback 覆盖 |

---

## 四、M-16：卸载清理补齐

### 4.1 缺陷

`Collection.vue` 的 `onUnmounted` 已清理 4 项（批量轮询、类别订阅、ASR 安装订阅、知乎收藏进度订阅），但漏了：

1. **视频采集阶段推进**（`videoStageTimers`）—— 一串 `setTimeout`，只在两处 `finally` 里停（`:1741`、`:1914`）。用户在采集途中离开页面 → 计时器继续对已卸载组件写 `videoCollectStage`。
2. **ASR 安装成功后的 1200ms 自动重试** —— `setTimeout` 句柄从未被追踪。

### 4.2 修法

```js
onUnmounted(() => {
  stopBatchPolling()
  stopVideoStageProgression()          // 新增
  if (asrRetryTimer) { clearTimeout(asrRetryTimer); asrRetryTimer = null }  // 新增
  asrInstallPendingUrl = ''
  /* …原有 4 项… */
})
```

`asrRetryTimer` 在排程时保存句柄、触发时置 `null`，重排前先清旧句柄（避免连点叠加多个计时器）。

### 4.3 验收

用「真实挂载 + 真实卸载 + 假定时器」验证：卸载后**不得残留任何未取消的计时器**。只看源码断言没用——缺陷正是「源码里有清理逻辑、只是漏了某几个」。

---

## 五、不做的事

- **不给 `invoke` 加默认超时**：会把长任务变成必超时（见 §2.2）
- **不批量改造调用方**：本批只补桥接层能力。哪些调用点该显式设上限，属独立 change
- **不虚拟滚动**（M-15）：报告明说「不建议现在上虚拟滚动」，改做分页，放批次 D
- **不合并 9 份 `getApi()`**（M-9）：属独立重构，放批次 C