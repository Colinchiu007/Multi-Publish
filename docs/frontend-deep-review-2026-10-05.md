# Multi-Publish 前端代码深度审查报告

- **审查日期**：2026-10-05
- **审查基线**：`main` @ `e7797789`
- **审查范围**：`apps/desktop/src/`（551 文件 / 12.98 万行）+ `ops-center/frontend/src/`（75 文件 / 8.8 千行）
- **审查方式**：只读静态审查。4 个并行专项探子 + 主会话独立复核。未修改任何文件，未运行构建/测试。
- **复核声明**：标注 **[已复核]** 的结论由主会话打开源文件逐行确认；其余为专项探子结论，已附证据位置供复核。

---

## 一、执行摘要

### 1.1 总体判断

**工程质量高于同类 Electron + Vue 项目的平均水平，但存在两个结构性问题掩盖了个别真实缺陷。**

先说被做得好的部分——这些不是客套话，是本报告后续所有"不要动"建议的依据：

| 已做对的事 | 实证 |
|---|---|
| 生产代码零 console 日志 | `console.log/debug/info` 命中 **0** |
| 零 XSS 入口 | `v-html` 命中 **0** |
| 零硬编码等待 | `waitForTimeout` / `sleep(` 命中 **0** |
| 路由 100% 懒加载 | 33 条路由全部为动态 `import()`，无一静态导入 |
| `v-for` 零缺 key | 287 个 `v-for` 全部命中 `:key` |
| 定时器/监听清理到位 | 4 处 `window.addEventListener` 全部有配对 remove；各视图 `onUnmounted` 清理完整 |
| IPC 脱壳集中收口 | `electron-bridge.js:12` `toPlainIpcValue` 覆盖全部 271 个调用点，**现行调用点零违例** |
| i18n 实现质量高 | CSP 安全（无 `new Function`）、插值参数正确、中文/英文键数完全对齐（各 2168） |
| 模块级集合有上限 | `publish-failure-draft-saver.js:19` LRU、`risk-hold-notifier.js:24` 环形裁剪 |
| 测试断言行为非实现 | 810 用例 / 2555 断言，快照命中 **0**，无 `.only/.skip` 遗留 |

### 1.2 问题分布

| 严重度 | 数量 | 说明 |
|---|---|---|
| **CRITICAL** | **1** | 功能永久失效且无任何报错 |
| **MAJOR** | **16** | 4 个已确认数据/流程 Bug、2 个门禁失真、10 个架构与性能风险 |
| **MINOR** | **11** | 一致性、死代码、低成本清理项 |

### 1.3 三个最该立刻知道的事

**① 覆盖率门禁量的不是前端。** `vitest.config.js:67-82` 的 `coverage.include` 全是 `*.js` glob，**146 个 Vue 单文件组件一个都匹配不到**。阈值 `statements 55 / branches 40` 实际主要由 Electron 主进程（484 个命中文件中的 412 个）撑起来。**[已复核]**

**② 一个功能是永久坏的。** 影视工程"单镜重试"因 preload 命名空间错配，调用恒为 `undefined`，用户点重试永远失败且**零错误提示**。后端 handler 完好，只有前端方法名写错。**[已复核]**

**③ 超大文件治理是"永不下降"的棘轮。** 500 行上限，但 98 个文件已被永久挂账豁免（其中前端 27 个、合计 36,586 行）；`CreateView.vue` 挂账值 5657 行。门禁只防"新增"和"膨胀 >200 行"，**不要求任何下降**。另有 20 个 >500 行的测试文件因在 `EXCLUDE` 列表里，连门禁都看不到。**[已复核]**

---

## 二、CRITICAL

### [C-1] `filmEngineeringRetryShot` 命名空间错配，影视单镜重试永久失效 **[已复核]**

- **位置**：`apps/desktop/src/api/publisher.js:396`（调用侧） ↔ `apps/desktop/electron/preload/film-engineering.js:26`（暴露侧）
- **现象**：前端按**扁平方法名**调用，preload 只在**命名空间**下暴露了它。

```js
// src/api/publisher.js:396 —— 扁平名
export async function filmEngineeringRetryShot(payload) {
  return invokeWithFallback("filmEngineeringRetryShot", { code: -1, message: 'electronAPI not available' }, payload)
}

// electron/preload/film-engineering.js:14,26 —— 在命名空间里
filmEngineering: {
  ...
  retryShot: (payload) => ipcRendererRef.invoke('film-engineering:retry-shot', payload),
}
```

- **影响**：`window.electronAPI.filmEngineeringRetryShot` 为 `undefined` → `electron-bridge.js:34` 直接 `return undefined` → fallback 返回 `{code:-1}`。两处生产调用方 `useFilmProduction.js:280` 与 `useFilmVideoGen.js:237` 判定 `res.code === 0` 恒为 false，**用户点"重试"永远失败，且界面上没有任何错误文案**。
- **后端是好的**：主进程 handler `ipc-handlers/film-engineering.js:256` 正常注册，preload 暴露正常，`preload.test.js:716` 也有引用。**纯粹是前端一个方法名写错**。
- **逃逸链（为什么测试没拦住）**：
  1. `useFilmVideoGen.test.js:25` / `useFilmProduction.test.js:32` 用 `vi.mock('@/api/publisher')` **整体 mock 掉本模块**，只断言"调用了 `filmEngineeringRetryShot`"，从不断言 preload 是否真有该方法 → 单元层放行；
  2. 无 preload 契约测试 → 集成层放行；
  3. 无"重试失败分镜"端到端用例 → E2E 层放行。
- **修复建议**：
  1. 改走命名空间（`invokeWithFallback('filmEngineering', ...)` 后取 `retryShot`），或加一层 `filmEngineering` 命名空间封装；
  2. **补 preload 契约测试**（见 M-9），这条测试能一次性拦住本类及所有未来同类缺陷，是本报告**收益最高的单条投资**。

---

## 三、MAJOR — A 类：已确认的正确性 Bug

### [M-1] 发布重入窗口：锁在第一次 `await` 之后才置位 → 重复提交 **[已复核]**

- **位置**：`composables/usePublishFlow.js:283`（守卫）/ `:285`（await）/ `:414`（置位）；同形态见 `useBatchPublish.js:417-420`
- **现象**：守卫在函数最开头，锁却在 130 行之后才置位，中间隔着一次真实的长耗时 `await`。

```js
282:  async function handlePublish() {
283:    if (publishing.value) return
284:    // 主动操作登录门：未登录弹登录窗口，登录成功后继续发布
285:    if (!(await ensureLogin())) return      // ← 未登录时先弹 Element Plus 确认框
286:    if (!article.title.trim()) { ... }       // …以下 128 行为同步校验…
414:    publishing.value = true                 // ← 锁到这才置位
424:    try { ... }
```

- **影响**：**未登录用户**是触发前提。`useLoginGate.js:43` 显示已登录时直接 `return true`（窗口极小），但未登录时会先 `await notifyConfirm(...)`（`:48`，用户手动点确认，秒级到分钟级）再 `await openSignIn()`（`:56`，OAuth 流程）。该窗口内再次点击"发布"，两次调用都通过 `:283` 守卫，随后各自走完发布 —— **同一篇文章在平台侧出现两条内容**。`ElMessageBox.confirm` 不提供互斥，两次调用各自等待。
- **额外风险**：`:414` 置锁、`:424` 才进 `try`，意味着 `:286-412` 之间的所有 `return` 都不受 `finally` 保护——修复时必须把 `try` 起点上移，不能只删 `:414`。
- **修复建议**：锁提到 `await` 之前。`handlePublish` 改为 `if (publishing.value) return; publishing.value = true`，`try` 起点上移到置锁处，保留 `finally` 中 `publishing.value = false`。批量侧同理。**改动量约 6 行，风险收益比最高。**

### [M-2] 任务重试换新 taskId → 结果卡永久失联

- **位置**：`composables/usePublishFlow.js:116-122`（`activeSession` 定义）、`:125-147`（终态 watch）；`stores/publishProgress.js:285-287`（重试换 id）
- **现象**：`activeSession` 靠**旧** taskId 是否仍在 `session.tasks` 中反查会话；store 重试时删除旧 id、写入新 id。

```js
116:  const activeSession = computed(() => {
119:    return publishProgressStore.sessions.find(
120:      (s) => ids.some((id) => Object.prototype.hasOwnProperty.call(s.tasks, id)),
121:    ) || null
122:  })
// stores/publishProgress.js —— _retryOne
285:    delete session.tasks[taskId]
287:    _ensureTask(session, newTaskId, platform)
```

- **影响**：重试后 `activeSession` 变 `null` → `:125` 的 watch getter 恒返回 `null`，永不触发。批次第二轮的"全部成功/部分失败"结果卡不再更新。`:124` 的注释明确写着这段代码就是为了修"用户不知道发布是否成功"——**失败 → 重试 → 再成功**这条路径上，用户看到的是卡住的旧结果。
- **修复建议**：改用 `registerSession` 返回的 session 引用（`publishProgress.js:258` 本身就返回 session 对象）持有，比按 taskId 反查稳。最小改动：store 记 `taskIdAliases`，匹配时一并查。

### [M-3] `useCopyLibrary` 读-改-写无串行化 → 并发静默丢数据

- **位置**：`composables/useCopyLibrary.js:132-154`（`upsertRewrite`）、`:157-163`（`removeRewrite`）
- **现象**：两处都是 `await readCurrent()` → 内存构造 `next` → `await storeSetSetting(...)`，全程无互斥。
- **影响**：两个并发调用读到同一份 `current`，各自算出一个 `next`，后写者覆盖先写者 —— **一条改写文案静默丢失**。文件自己的注释（`:118-119`）已写明"采集页与文案库面板各自持有一份 composable 实例"，这正是并发写的前提。
- **附加**：`MAX_COPY_REWRITES = 200`（`:29`），超过后静默丢弃最旧的，无任何提示。
- **修复建议**：模块级 `let _writeChain = Promise.resolve()`，把 read-modify-write 包进串行队列。

### [M-4] Collection 批量轮询无失败计数 → UI 永久卡在"采集中" **[已复核]**

- **位置**：`views/Collection.vue:2545-2587`（轮询）、`:146-163`（按钮门禁）
- **现象**：2 秒轮询的异常分支只写了注释、什么都不做。

```js
2584:  } catch (e) {
2585:    // 轮询失败不立即中断，继续下次轮询
2586:  }
2587:  }, 2000)
```

同文件 `:2556/2573` 的 completed / failed 分支都会复位 `batchCollecting` 并停止轮询，**唯独异常路径不处理**。
- **影响**：只要 IPC 持续失败（主进程重启、任务记录丢失、鉴权失效），`batchCollecting` 永远为 `true` → 两个发起按钮 `:disabled="batchCollecting"` 永久禁用，进度条停在中间值且无错误文案。**用户唯一逃生口是自己猜到点"取消"。** Electron 桌面端没有浏览器 console 和 500 页面，用户只会觉得"应用卡了"。
- **修复建议**：加 `consecutiveFailures` 计数，3~5 次即报错 + 停轮询 + 复位状态；再加一个总时长上限（如 10 分钟）兜底。**改动 <10 行。**

### [M-5] `reportError` 未处理 Promise 拒绝，且 console 兜底不可达 **[已复核]**

- **位置**：`utils/report-error.js:15-16`、`:21`；`src/main.js:39-40`、`:49-51`

```js
12:  try {
13:    const api = getApi()
14:    if (api && typeof api.logError === 'function') {
15:      api.logError(String(text).slice(0, 2000))   // ← 返回的 Promise 既未 await 也未 .catch
16:      return                                    // ← 使 :21 的 console 兜底永远不可达
17:    }
18:  } catch (_) {}                                // ← try/catch 捕获不到 Promise 拒绝
21:  if (err !== undefined) console.error(message, err)
```

- **影响**：
  1. **函数头注释声明的"保证不吞错"契约在 Electron 路径下失效**——`logError` 失败时错误被完全吞掉，既不落盘也不打 console；
  2. **反馈环（条件触发，非必然）**：`main.js:49` 监听 `unhandledrejection` → 又调 `reportError` → 又产生未处理拒绝。正常路径下主进程 handler 已注册且被 try/catch 包裹（`ipc-handlers/logs.js:33-41`），故不触发；但**窗口销毁期间或 handler 尚未注册时**，会形成自激循环并刷爆日志文件。
- **对照证据（正确写法就在同仓库）**：`utils/notifyCore.js:103` `invoke('notifyLog', payload).catch(() => {})` —— 同项目两种写法并存。
- **修复建议**：`api.logError?.(msg)?.catch?.(() => console.error(message, err))`；`main.js:40` 同样处理；建议再加模块级 `reporting` 布尔闸门防重入。

---

## 四、MAJOR — B 类：门禁失真与架构债

### [M-6] 覆盖率门禁完全不含 Vue 单文件组件 **[已复核]**

- **位置**：`apps/desktop/vitest.config.js:67-82`

```js
67:  include: [
68:    'electron/services/**/*.js',
...
76:    'src/stores/**/*.js',
77:    'src/composables/**/*.js',
78:    // Stage 3.1：将 src/views、src/components、src/domain 纳入覆盖率统计
79:    'src/views/**/*.js',        // ← 只匹配 .js，146 个 .vue 命中 0
80:    'src/components/**/*.js',
81:    'src/domain/**/*.js',
82:  ],
```

- **实际命中分布**（探子实测）：

| 目录 | 命中文件数 |
|---|---|
| `electron/{services,ipc-handlers,core,bootstrap}` | **412** |
| `src/composables` | 49 |
| `src/stores` | 15 |
| `src/views` | **6**（146 个 .vue 中命中 0） |
| `src/components` | **0** |
| 合计 | 484 |

- **影响**：渲染层 13 万行 SFC 逻辑在门禁视野外。阈值 `statements 55 / branches 40 / functions 60 / lines 55` 实际由主进程高分撑起。**任何 `.vue` 内的渲染逻辑、事件处理、computed 都可以在覆盖率上"免费"**——这直接导致第十节列出的测试盲区。此外 `src/{utils,features,api,services,locales,router,story2video}` 共 73 个非测试 `.js` 也不在 include 内，**即使写了测试也不计入门禁**。
- **修复建议**：include 补 `src/**/*.vue`（v8 provider 对 SFC 有效）与缺失的 5 个目录，并按目录拆分阈值避免主进程高分掩盖渲染层。**注意：必须"先补 include + 记录基线"两步走，直接提阈值会立刻变红。**

### [M-7] 超大文件治理是永不下降的棘轮，98 个文件永久豁免 **[已复核]**

- **位置**：`.github/scripts/max-lines-baseline.json`（`limit: 500`、`growthAllowance: 200`）、`check-max-lines.js`
- **机制**：门禁只执行四条规则——① 超限且未挂账 → 阻断；② 台账文件已消失 → 阻断；③ 已降到 limit 以下却没销账 → 阻断；④ 较登记值增长 >200 行 → 阻断。**没有任何一条要求存量下降。**
- **当前实况**（实际运行 `node .github/scripts/check-max-lines.js`）：
  ```
  limit=500 growthAllowance=200 超限文件=98 挂账=98 墓碑=1
  ✅ 无新增超大文件，挂账清单与现实一致。
  ```
- **前端部分**：98 个中 **27 个**在 `apps/desktop/src`，合计 **36,586 行**——占前端 12.98 万行的 **28%**。

| 目录 | 挂账文件数 |
|---|---|
| `views/` | **17** |
| `composables/` | 3 |
| `components/` | 2 |
| `locales/` | 2 |
| `api/` / `features/` / `styles/` | 各 1 |

- **测试文件整体逃逸**：`check-max-lines.js:45` 的 `EXCLUDE` 含 `tests`/`test`/`__tests__`，导致 **20 个 >500 行的测试文件完全不进门禁**：`CreateView.test.js`（5961 行）、`ResultView.test.js`（1954）、`Accounts.test.js`（1743）、`Collection.test.js`（1560）等。
- **影响**：棘轮防住了"新债"，但存量 3.6 万行被永久豁免，且最大的那个文件 `CreateView.vue`（挂账 5657 行）还在测试侧有个 5961 行的对照文件。**"文件太大"在这套机制下是一个已经解决的历史问题，而不是一个持续偿还的债。**
- **修复建议**：给挂账文件设**偿还配额**（如每季度要求总行数净下降 X%，超限文件在 `--update` 时不得再登记新文件），或对 TOP 20 挂账文件设独立的目标行数与结项状态。另建议把测试文件纳入一个**单独的高行数阈值**（如 1500）而非完全排除。

### [M-8] `CreateView.vue` 单组件承载 102 data / 70 computed / 245 methods

- **位置**：`views/CreateView.vue`（5589 行，Options API）；`data` `:1033`、`computed` `:1206`、`watch` `:1777`、`methods` `:1803-5642`（独占 3840 行）
- **现象**：单组件同时承担视图路由状态机、流水线启动/轮询/编排、S2V 配置持久化、TTS 音色目录与克隆、模板库 CRUD、BGM 库管理、批量任务、历史轮询、通知文案解析、IPC 调用与错误格式化、事件订阅。
- **关键问题**：已完成的 `S2vConfigPanels.vue` 抽取**只搬走了模板（584 行）**，把父组件 245 个方法中的 28 个（`S2V_PANEL_METHODS`）以 `fns` 转发暴露给子组件——**逻辑复杂度原地未减，还额外生成了跨文件耦合**。
- **影响**：任何 S2V 相关改动都要在 5589 行文件里定位；review 无法有效做差异聚焦。
- **修复建议**：按**功能域**而非模板行数切分。优先下沉：S2V 音色目录 + 克隆（`:3400-3500`）、模板库 CRUD（`:2290-2320`）、批量任务、历史轮询（`:5119-5160`）；`S2vConfigPanels` 改为消费 composable 而非父实例方法转发。**应作为独立 change 走 openspec。**

### [M-9] IPC 契约靠约定：9 份 `getApi()` + 6 个文件绕过桥接层

- **位置**：`api/electron-bridge.js:8`、`api/cloud-publisher.js:7-11`、`api/identity.js:1`、`api/model-providers.js:8`、`api/ops-center-sync.js:7`、`api/providers.js:8`、`api/services.js:1`、`api/tts-voice-catalog.js:6`、`api/tts-voice-clone.js:1`；绕过点 `api/publisher.js:550-559`
- **现象**：
  1. **9 份独立 `getApi()`，防御强度不一致**：`electron-bridge.js:9` 与 `identity`/`services`/`tts-*` 有 `typeof window !== 'undefined'` 守卫；`model-providers.js:9`、`ops-center-sync.js:8`、`providers.js:9`、`cloud-publisher.js:9` **无守卫**；
  2. **6 个文件绕过桥接层**，因此不经过 `toPlainIpcValue` 脱壳——`model-providers.js:32` `api.modelProviderCreate(data)`、`providers.js:25` `api.providerCreate(data)` 都是直接传对象，**模型服务商配置含 API Key**；
  3. `publisher.js:550-559` 三个导出直接调 `window.electronAPI.X(...)`，与该文件 `:3` 自述的"所有组件通过此文件访问 IPC"契约自相矛盾；浏览器开发环境下 `window.electronAPI` 为 undefined → `TypeError` 而非设计的 fallback。
- **影响**：C-1 那个 CRITICAL 正是这个根因的产物——**没有任何测试断言"前端调用的方法在 preload 存在"**，所以名字写错能一路进主干。
- **修复建议**：
  1. **补 preload 契约测试**（最高收益）：遍历 `src/api/` 全部导出方法名，断言每个都在 `filterApiByAccessLevel(fullApi, 'admin')` 暴露面内存在；
  2. 全部 `getApi()` 收敛到 `electron-bridge.getApi()`；
  3. `model-providers` / `providers` / `ops-center-sync` / `cloud-publisher` / `publisher.js:550-559` 改走 `invokeWithFallback`，顺带获得脱壳与 fallback 语义。

### [M-10] S2V 父子契约的 fail-closed 是单向的

- **位置**：`views/video-creation/s2v-panel-contract.js:105-136`；`S2vConfigPanels.test.js:43-63`
- **现象**：契约注释（`:125`）承诺"未登记键访问显式抛错，防止拼错的键静默返回 undefined"。实际只有**未登记**键会抛；**已登记但父级已改名/删除**的键不会——

```js
107:  for (const key of S2V_PANEL_STATE) {
108:    Object.defineProperty(state, key, { get: () => vm[key], enumerable: true, configurable: false });
109:  }
129:  // guard 只在 !(prop in target) 时抛错 —— 提前 defineProperty 使键存在性检查永远通过
```

- **影响**：CreateView 里重命名/删除任一 data 或 computed（例如 `s2vVoiceClonePending`）后，S2V 配置面板对应控件**静默渲染为空/默认值，零报错**——正是注释声称要防的那类 Bug。`s2vOptionVisible` 拿到 undefined 会让运维后台的 `optionKey` 显隐全部回退为"显示"。
- **测试为何发现不了**：`S2vConfigPanels.test.js:45-60` 用 `S2V_PANEL_STATE` **自身**构造合成 `vm`，白名单与真实 CreateView 实例之间**没有任何交叉校验**——**测试结构上不可能发现这类漂移**。
- **修复建议**：补一条静态回归测试，**双向**交叉校验白名单键与 CreateView 实际 `data`/`computed`/`methods` 键集合（白名单有而父级无 → 失败）。纯新增测试，零风险。

---

## 五、MAJOR — C 类：性能与健壮性

### [M-11] PublishHistory 一次筛选即全表串行拉取，且 `views/` 无任何防抖工具

- **位置**：`views/PublishHistory.vue:651-670`、`:443`、`:457-475`、`:665-670`
- **现象**：`loadRemainingRecordsForFilters` 是 `while (hasActiveFilters && hasMoreRecords)` 的**无上限串行分页循环**（`PAGE_SIZE = 50`），任何筛选条件变化都触发把整张历史表拉完；`watch` 监听 7 个筛选源，**无防抖**。

```js
654:  pendingFilterLoad = (async () => {
655:    while (hasActiveFilters.value && hasMoreRecords.value) {
656:      const loaded = await loadRecords({ append: true })
657:      if (!loaded) break
658:    }
659:  })().finally(() => { pendingFilterLoad = null })
```

- **影响**：历史表积累到数千条后，**单次输入框搜索会引发上百次串行 IPC 往返**；`filteredRecords`（`:457`）每次按键还要对已加载全量做 `toLowerCase().join()` 全文匹配。
- **根因**：`views/` 下 `debounce|throttle` 匹配数为 **0**。唯一手写防抖是 `Accounts.vue:741-745` 的 `setTimeout(..., 300)`，其余全裸。
- **修复建议**：① 抽 `@/composables/useDebouncedRef` 接入 7 源 watch（根因是缺工具而非缺调用）；② 给分页循环设页数上限，或把 `searchQuery` 下推到服务端。

### [M-12] CreateView 双深 watch：每次编辑触发两次全量对象遍历

- **位置**：`views/CreateView.vue:1787-1788`

```js
s2vConfig: { deep: true, handler() { if (!this.s2vConfigProfileApplying) { this.s2vActiveConfigProfile = ''; this.scheduleS2VLastOptionsSave() } } },
s2vOutputConfig: { deep: true, handler() { ... } },
```

- **影响**：`s2vConfig` 含 `subtitleStyle` 等多层嵌套（`:3192`）。用户在配置面板拖滑块或逐字输入时，每次变更都要对两个对象做完整深度遍历并置位 data 属性 → 触发 5589 行组件的依赖链重算。深 watch 粒度远粗于实际需求（此处只关心"值变了"，不关心"结构变了"）。
- **同类**（规模较小）：`ProductionBoard.vue:181-192`（board 含全部 scenes/takes，每 3s 轮询更新）、`usePlatformSelection.js:163-167`（3 源深监听含嵌套对象）、`StageProgress.vue:279`、`SceneAssetSelection.vue:268`、`ConfigProfileManager.vue:451`、`GroupTagsEditor.vue:69`。
- **修复建议**：改为浅层快照比较（`watch(() => JSON.stringify(cfg), ...)`）或列显式叶子 getter；至少加 `flush: 'debounce'` 合并同 tick 连续变更。

### [M-13] 全域 IPC 零超时，主进程不返回即永久 pending

- **位置**：`api/electron-bridge.js:32`（`invoke` 无超时包装）、`api/publisher.js` 全 434 行
- **证据**：对 `apps/desktop/src/**/*.js`（排除测试）全量搜索 `Promise.race` / `AbortController` / `setTimeout`，**生产代码零命中**。270+ 个 API 封装全部无超时。
- **影响**：任一主进程 handler 卡死（Python bridge 挂起、CDP 卡住、SQLite 锁），前端 Promise 永久 pending，调用点 `loading` 永不复位、按钮永久禁用，**用户零错误提示**。`pipelineStart`、`aggregationCollect`、`story2videoTranscribe` 这类长任务风险最高。
- **修复建议**：桥接层加 `invokeWithTimeout(method, ms, fallback, ...args)`，长任务类 API 显式设上限，建议与主进程 handler 自身超时对齐。

### [M-14] `invokeWithFallback` 对"权限不足"完全失效

- **位置**：`api/electron-bridge.js:32-54`；`electron/preload/access-control.js:136-141`
- **现象**：preload 对 `authenticated` 级方法在**同步**调用时 `throw createPermissionError(key)`。因为 `invoke` 是 `async function`，同步 throw 变成 **rejected promise**，`invokeWithFallback` 的 `await` 直接抛出，**fallback 分支永不执行**。

```js
32: export async function invoke(method, ...args) {
33:   const api = getApi()
34:   if (!api || typeof api[method] !== 'function') return undefined   // 仅"方法不存在"才走 fallback
35:   return api[method](...args.map(toPlainIpcValue))                  // 权限 throw 从这里逃逸
36: }
44: export async function invokeWithFallback(method, fallback, ...args) {
45:   const result = await invoke(method, ...args)                     // ← throw 在此逃逸
```

- **影响**：`PUBLIC_METHODS`（`access-control.js:12-79`）之外的所有方法——即"未登录/许可证未激活"这一**生产环境最高频失败模式**——都拿不到 `{code:-1}` 信封，而是抛 `LicensePermissionError`。调用方若只判 `res.code === 0` 而无 try/catch，会得到 unhandled rejection。`electron-bridge.js:3-5` 头部注释"提供一致的错误处理"与实际行为不符。
- **缓解事实（不夸大）**：抽查的调用方多已自行 try/catch（`Intelligence.vue:191`、`ViralLibraryTable.vue:107`、`ViralAnalysis.vue:517`），因此多为"错误提示不友好"而非崩溃。
- **修复建议**：`invokeWithFallback` 内加 `catch (e) { if (e?.name === 'LicensePermissionError') return fallback; throw e }`，让 fallback 语义真正覆盖"不可用"全集。

### [M-15] 全仓零虚拟滚动、零分页，长列表一次性全量渲染

- **位置**：`views/Accounts.vue:263-283`（`v-for="account in visibleAccounts"`，无 `slice`）、`PublishHistory.vue:196`、`CopyLibraryView.vue:55`、`HotTopics.vue:129`
- **证据**：`virtual-scroll|vue-virtual|VirtualList|useVirtual` → **0 命中**；`el-pagination|mp-pagination` → **1 命中**（仅 `PatternAnalysisPanel.vue:40`）。`visibleAccounts` computed 只做 `filter` 不截断；`AccountManagementCard` 单卡接收 15+ prop 与 10 个事件。
- **影响（结构缺口已确认，实际卡顿程度取决于账号规模）**：多平台账号管理下账号数可达数百，网格一次性挂载数百个重组件，每次 store 变更触发全量 patch。属于"数据量增长后必然劣化"，**不是当前必现的 bug**。
- **修复建议**：**不建议现在上虚拟滚动**——先给账号/历史/素材类列表加 `el-pagination`（复用已有 `PatternAnalysisPanel` 模式），成本最低、收益立竿见影；至少在 computed 层加 `slice(0, N)` + 「加载更多」。

### [M-16] Collection 两处异步副作用未纳入卸载清理

- **位置**：`views/Collection.vue:1353-1358`（`onUnmounted`）、`:1446-1449`、`:1601-1622`
- **现象**：`onUnmounted` 只清了 `batchPollTimer` 和 3 个事件订阅，**未清**：(a) `:1446` ASR 安装成功后的 1200ms 重试 `setTimeout`；(b) `videoStageTimers`（3 个最长 75s 的阶段推进定时器）。
- **影响**：用户在 ASR 安装成功后 1.2 秒内离开页面，定时器仍会执行 `collectUrl()`——**在组件已卸载后发起一次真实采集 IPC（写操作，无 UI 承接）**；视频阶段定时器则继续修改已卸载实例的 ref。

---

## 六、MINOR

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| m-1 | `looksTechnical` 复制后已漂移 | `utils/message-contract.js:221-226` vs `utils/user-facing-error.js:148-155` | 两份 `TECHNICAL_TEXT_PATTERNS` 完全重复，但后者多一条 `/\belectronAPI\b/i`，前者没有。而 `'electronAPI not available'` 正是 publisher.js 约 50 处 fallback 的 message 值——**走 `message-contract`/`notifyCore` 路径不会被识别为技术文本，存在直出到界面的口子**。`message-contract.js:219` 注释却写"复用"，与事实不符 |
| m-2 | `toPlainIpcValue` 三份副本语义不一致 | `electron-bridge.js:12-24`、`tts-voice-catalog.js:13-20`、`tts-voice-clone.js:7-14` | bridge 版支持 `File`/`Blob` 原样透传（依赖 `webUtils.getPathForFile`），TTS 两版没有；bridge 版失败抛 `TypeError`（可诊断），TTS 版返回 `null` 后被 `tts-voice-catalog.js:36` 判为 `TTS_VOICE_INVALID_ARGUMENTS`——**把序列化 bug 误报成参数错误，排障方向被带偏** |
| m-3 | `toPlainIpcValue` 固有边界 | 同上 | `JSON.parse(JSON.stringify())` 会把 `Date` 转 ISO 串、`Map`/`Set` 转 `{}`、丢弃 `undefined` 值键、遇循环引用抛错。当前调用点未传这些类型，属**潜在风险** |
| m-4 | `useModelProviderCrud.toggleEnabled` 无 try/catch、无防重入 | `composables/useModelProviderCrud.js:458-467` | 同文件 `setDefault`（`:489`）与 `toggleCapabilityDefault`（`:510`）都包了 try/catch，只有它裸调。IPC reject → unhandledRejection，界面无反馈，用户以为已启用实则未生效；连点两下发两次请求。**896 行测试中未见该路径用例** |
| m-5 | `useOpsCenterSync` 同文件内错误处理不一致 | `composables/useOpsCenterSync.js:55-62`、`:65-79` | 前两个函数裸 await IPC 无任何保护；同文件第三个 `runSyncNow`（`:87-118`）处理完整。主进程未就绪时 reject → 同步配置面板首帧空白且不报错 |
| m-6 | `publishProgress.init()` 标志位先置、订阅后建 | `stores/publishProgress.js:399-405` | `listenersBound = true`（`:400`）在 `onProgress(...)`（`:403`）**之前**。若订阅抛错，标志已是 true，后续 `init()` 直接跳过 → 进度面板永不更新且无报错。与本仓 `accounts.js:80-81` 的 fail-closed 纪律不一致 |
| m-7 | `usePipelineHistory` 是零调用方死代码 + 泄漏隐患 | `composables/usePipelineHistory.js:138`、`:180-182` | 全量搜索（排除测试）**无任何生产调用方**。236 行带 5 秒 `setInterval`，清理靠导出的 `destroy()` 却**未用 `onScopeDispose`**（对比 `useBatchPublish.js:125-127` 的正确写法）。当前无运行时影响；一旦接线，调用方忘调 `destroy()` 就永久泄漏 |
| m-8 | `useModelProviderCrud` 的 `loading` 初值为 true | `composables/useModelProviderCrud.js:105` | 无 `onMounted` 自动加载。若组件在 `loadProviders()` 被调用前渲染，骨架屏常驻；接入方忘记调用时表现为永久 loading 而非报错 |
| m-9 | 三个 pipeline API 是死代码 | `api/publisher.js:398-400` | `pipelinePauseWithCheckpoint` / `pipelineResumeFromCheckpoint` / `pipelineRegisterPipeline` 在 preload 与主进程**全仓零命中**，且无任何调用方。风险在于 `pipelineRegisterPipeline(def)` 语义是"运行时注册任意流水线定义"，一旦有人接线而无 handler 校验，等于开一条动态执行面；且 `pipeline:pause`/`pipeline:resume` 已有真实通道（`license-access-control.js:123-124`），易被误认为"只差 preload 一层"而误接线 |
| m-10 | fallback 错误文案硬编码英文且口径分裂 | `api/publisher.js`（约 50 处 `message: 'electronAPI not available'`）、`hot-topics.js:14,18`（`'IPC unavailable'`）、`identity.js`、`services.js` | 未走 i18n；且 `hot-topics.js` 的 `'IPC unavailable'` 与全仓主流措辞不同，**会导致 m-1 的 `/\belectronAPI\b/i` 规则匹配不到它**——恰恰是最需要拦截的字符串用了不同措辞 |
| m-11 | `reportError` 无去重与采样 | `utils/report-error.js:7-23` | 被 20+ 处调用，含 `useAccountEvents.js:70`、`useExpiredAccountsBanner.js:62` 等轮询/事件路径。同一根因反复失败逐条写盘，淹没真实首因。对照：`publish-failure-draft-saver.js:21-33` 有 `Set`+`maxSeen=100` LRU，`risk-hold-notifier.js:24` 有 `maxRecent=50` 环形裁剪——**错误上报反而缺了这层**。建议同时加 token/cookie 正则脱敏 |

---

## 七、专项结论

### 7.1 i18n：实现优秀，存量债务真实

- **实现质量高**：`i18n/index.js` 用正则插值 Message Function 规避了 CSP `unsafe-eval`，并修复过"旧实现丢弃插值参数导致 `{original} 字` 泄漏到界面"的真实 Bug（68 条叶子受影响）。zh/en 键数完全对齐（各 2168）。`utils/message-contract.js` 与 `utils/user-facing-error.js` 有专门的 i18n key 泄漏守卫。**这部分不建议动。**
- **存量债务**：`.github/scripts/locale-cjk-baseline.json` **永久豁免 1489 条**非 locales 文件中的中文字面量，涉及 **90 个文件**。Top 集中区：

| 条数 | 文件 |
|---|---|
| 267 | `views/CreateView.vue` |
| 83 | `components/AiWriterPanel.vue` |
| 66 | `views/video-creation/S2vConfigPanels.vue` |
| 60 | `views/ResultView.vue` |
| 57 | `views/PromptEvalView.vue` |
| 56 | `components/UpgradeModal.vue` |

- 全量统计：非测试代码中含中文的 **6778 行**中，注释 **4850**（合规）、字符串 **1428**（债务）、行尾/混合 **500**。
- **建议**：棘轮机制本身是对的（阻止新增），但同样没有偿还配额。挑 2~3 个用户可见度最高的文件（`UpgradeModal` 56 条、`AccountGroupsPanel` 38 条）做存量偿还试点，比全量推进现实。

### 7.2 ops-center/frontend：几乎无工程护栏

| 维度 | 桌面端 | ops-center |
|---|---|---|
| 源文件 / 测试文件 | 293 / 258 | **72 / 3** |
| 路由懒加载 | 100% | 100% ✅ |
| i18n | vue-i18n，双语对齐 | **完全无**（无 i18n 目录、未依赖 vue-i18n） |
| 硬编码中文 | 1489 条挂账 | **1902 行** |
| 内联颜色字面量 | 有门禁（`cssVarUndefined`/`colorLiterals`） | **150 处** |
| 测试覆盖对象 | 全域 | **仅 3 个 store**（`menu.test.js` / `menu-visibility.test.js` / `menu-edge.test.js`） |
| console 残留 | 0 | 0 ✅ |
| Electron API 误用 | — | 0 ✅（正确隔离） |

- **判断**：ops-center 是内部运营后台，规模（8.8 千行）可控，路由懒加载与 console 纪律都做对了。**主要缺口是零 i18n 与近乎为零的测试**。若该后台仅内部中文使用，零 i18n 可接受（建议在 README 明确记录这一决策，避免后续误当 bug 修）；但 **72 个源文件仅 3 个测试文件、且都只测同一个 menu store** 是实打实的风险——`PromptEvalWorkbench.vue`（603 行）、`ModelPresets.vue`（417 行）这类含模型配置与密钥管理的界面零覆盖。
- **建议**：为 `Secrets.vue`（247 行）、`ModelPresets.vue`（417 行）、`RedemptionCodes.vue`（175 行）这三个涉及凭据/权限的模块优先补测试。

### 7.3 不构成问题、明确不建议动的部分

- **`Publish.vue`（1659 行）架构正确**：模板 720 行，script `722-1489` 几乎全是 composable 编排（`usePublishFlow` / `useBatchPublish` / `usePublishDrafts` / `useCopyDetailMode`），职责已充分下沉。
- **`Dashboard.vue`（679 行）** script 仅 `189-347`，`ModelProviders.vue`（1428 行）** script 仅 `517-615**，主体是模板与 CSS。**行数大 ≠ 逻辑重**，重构收益为负、回归风险为正。
- **状态管理层有大量值得保护的范式**：`useCoverPreview.js:20-87`（requestToken 序号防竞态，教科书级）、`useTheme.js:80-104`（await 后重查 disposed）、`useBatchPublish.js:416-750`（有界轮询 180 次上限、`keepPublishingLock` + `finally`、`onScopeDispose` 清理）、`stores/publishProgress.js`（终态吸收、MAX_SESSIONS=5 裁剪）、`stores/accounts.js`（`_loadPromise` in-flight 去重、瞬时失败保留上一次列表）、`stores/tab.js:27-29`（三个请求序号防乱序）。**后续治理应复制这些范式，而不是发明新机制。**
- **测试断言的是行为不是实现**：`usePublishFlow.test.js`（1037 行）对排期回滚、敏感词预检、字数截断、payload 键集 parity 都有行为级断言；810 用例零快照。**这一点明显高于常见水平。**

---

## 八、测试覆盖盲区清单

按"无同名测试文件 **且** 全测试集内 0 处引用"双重核实（已排除被间接覆盖的）：

| 文件 | 行数 | 风险 |
|---|---|---|
| `features/accounts/components/AccountGroupsPanel.vue` | 448 | 账号分组主面板，0 引用 |
| `composables/useHotTopicsGenVideo.js` | 420 | 仅被 `utils/rewrite-lineage.test.js:81` 当**路径字符串**扫描（结构锁），无行为测试 |
| `components/ViralFormDialog.vue` | 241 | 爆款表单弹窗，0 引用 |
| `composables/usePipelineHistory.js` | 236 | 零调用方死代码（见 m-7） |
| `composables/useContentCategories.js` | 123 | 0 引用 |
| `utils/viral-trending-merge.js` | 90 | 合并去重逻辑（含 3 个 `Set`），0 引用 |
| `composables/usePublishProgressAutoCollapse.js` | 66 | 0 引用 |
| `utils/provider-name-map.js` | 55 | provider 名归一，0 引用 |
| `features/publish/components/CopyDetailBanner.vue` | 46 | 与 `useCopyDetailMode` 的 CRITICAL 修复同链路 |
| `composables/useWordCountValidation.js` | 31 | 0 引用 |

**已排除的误报**（核实后确认有覆盖）：

- `views/ModelProviders.vue`（1428 行）无同名测试，但被 18 处测试引用（`useProviderCrud.test.js` 等），属部分覆盖——**不是 1428 行全裸**。
- `composables/useCopyDetailMode.js`（109 行）被 `views/Publish.test.js:1567-1700` 通过 mock 完整覆盖了注释声明的 keep-alive CRITICAL 回归锁。
- `useEmbeddedViewSuspension.js`、`PersonalKnowledgePanel.vue` 分别有 8 / 6 处引用。

**其他盲区**：

- 87 个源文件无同名测试文件，其中 15 个 >200 行（不含 locales 两个大文件）。
- `src/{utils,features,api,services,locales,router,story2video}` 共 73 个非测试 `.js` 完全不在 `coverage.include` 内（见 M-6）。
- **重入与并发写整类无覆盖**：`usePublishFlow.test.js`（1037 行）、`useBatchPublish.test.js`（1201 行）对错误路径、终态、订阅释放覆盖极密，但**没有任何一个用例验证"两次快速调用同一入口"**——而这正是 M-1 所在。`toggleEnabled`（m-4）整条路径无测试。
- **错误路径覆盖偏薄**：`reject|mockRejected|throw new Error` 相关行数——`ResultView.test.js`=11、`Publish.test.js`=8、`Accounts.test.js`=7、`CreateView.test.js`=6、`Collection.test.js`=5、**`RewriteView.test.js`=2**（对应 88 个用例）。
- **测试与实现细节强耦合**：Options API 组件测试普遍通过 `w.vm.<内部字段> = ...` 强改内部状态再直接调内部方法（每用例平均 1.5~2 次），跳过用户路径。`CreateView.test.js` 的 17 个 `describe` 呈**按日期追加**形态而非按领域归组。内部字段一改名就大批变红，团队会倾向"改测试"而非"改实现"。

---

## 九、治理路线图

### P0 — 立即做（改动小、收益高、风险低）

| # | 动作 | 位置 | 工作量 |
|---|---|---|---|
| 1 | 修 `filmEngineeringRetryShot` 命名空间错配 | `api/publisher.js:396` | 1 行 + 2 处调用方 |
| 2 | `reportError` 加 `.catch` + 重入闸门 | `utils/report-error.js:15` | <10 行 |
| 3 | 发布重入锁前置 | `usePublishFlow.js:283/414`、`useBatchPublish.js:417` | ~6 行 |
| 4 | Collection 轮询失败计数 + 总超时 | `Collection.vue:2584` | <10 行 |
| 5 | PublishHistory 分页循环上限 | `PublishHistory.vue:651` | <10 行 |

### P1 — 结构性投入（一次投入多点受益）

| # | 动作 | 理由 |
|---|---|---|
| 6 | **补 preload 契约测试**（遍历 `src/api/` 导出方法名断言在 preload 暴露面内） | **收益最高的单条投资**：能同时锁死 P0-1 和未来所有同类缺陷 |
| 7 | **修 `vitest.config.js` coverage include**：补 `src/**/*.vue` + 缺失 5 个目录；先记录基线，**不立即提阈值** | 门禁失真是根因，不修则后续所有测试投入都无度量 |
| 8 | 抽 `@/composables/useDebouncedRef`，接入 PublishHistory（7 源）/ Collection 搜索框 | 根因是缺工具而非缺调用 |
| 9 | `invokeWithFallback` 捕获 `LicensePermissionError`；桥接层加 `invokeWithTimeout` | 覆盖最高频失败模式与永久 pending |
| 10 | 9 份 `getApi()` 收敛到 `electron-bridge`；6 个绕过文件改走桥接层 | 顺带获得脱壳与 fallback 语义 |
| 11 | 补 `s2v-panel-contract` 白名单 × CreateView 实际键的**双向交叉校验测试** | 防止 M-10 在下次重构变成真实故障；纯新增测试，零风险 |

### P2 — 降低复杂度（应作为独立 change 走 openspec）

| # | 动作 |
|---|---|
| 12 | 按功能域把 CreateView 的音色/模板/批量/历史四块下沉为 composable，`S2vConfigPanels` 改消费 composable 而非父实例方法转发 |
| 13 | 给 98 个挂账超限文件设**偿还配额**；测试文件纳入独立高行数阈值（1500）而非完全排除 |
| 14 | 拆 `CreateView.test.js`（5961 行）为 4 个领域文件；建立"每新增一个 IPC 调用必须有一条 rejected 分支"的门禁 |
| 15 | 收窄 `CreateView.vue:1787-1788` 双深 watch 与 `ProductionBoard.vue:181` |
| 16 | 账号/历史列表加 `el-pagination`（**不要**直接上虚拟滚动） |

### P3 — 收尾清理

`toPlainIpcValue` 三份合一（M-2）→ `looksTechnical` 去重并对齐注释（m-1）→ fallback 错误文案统一入 i18n（m-10）→ `reportError` 加去重采样（m-11）→ `useOpsCenterSync` / `toggleEnabled` 补 try-catch（m-4/m-5）→ `publishProgress.init()` 标志位置后（m-6）→ 删除 `usePipelineHistory` 死代码或改 `onScopeDispose`（m-7）→ 删除 3 个死 pipeline 导出（m-9）→ `S2V_PANEL_KEY` 上移到 `src/contracts/` 解开 components→views 反向依赖 → 补 `AccountGroupsPanel` / `useHotTopicsGenVideo` / `ViralFormDialog` 行为测试。

### 明确不要做

- **不要按行数去动** `Dashboard.vue`（679）/ `ModelProviders.vue`（1428）/ `Publish.vue`（1659）——结构健康，重构收益为负、回归风险为正。
- **不要**给 `s2vConfig` 深 watch 换更花哨的响应式方案——收窄监听粒度即可。
- **不要**在覆盖率 include 补全的同一次变更里提阈值——会立刻变红并阻塞其他所有工作。

---

## 十、证据边界与未验证项（诚实声明）

**本报告为纯静态代码审查，未运行任何测试、构建或打包。** 以下事项明确未验证：

1. **未做性能实测**。M-15 的严重度按代码结构判定——"账号规模实际能到多少""数百个 `AccountManagementCard` 的实际渲染耗时"均无运行时数据。
2. **未运行测试套件**。测试盲区清单基于文件名比对 + 全测试集字面引用搜索，未运行用例验证。
3. **两处存疑未排除**：
   - `stores/tab.js:153,204` 有两处 `_unsubscribes.push(...)`，未确认重复 `_refreshTabs` 调用是否会累积订阅者。若会，是本次唯一未排除的 Electron 长会话累积泄漏路径，建议主进程侧一并核查。
   - `M-2`（`activeSession` 失联）的触发前提是"用户使用重试功能"，未找到该功能被实际使用的证据。
4. **IPC 契约核对**以 `electron/preload/*.js` **源文件**为准，未验证 `index.bundle.js`（打包产物）是否与源文件一致。
5. **`CreateView.test.js`（5961 行）**为抽样阅读（断言风格 + describe 结构）与全量 grep 统计，未逐条通读；`ResultView.vue` 完整列举了方法清单确认粒度合理，但未逐个方法深读实现体。
6. **`ops-center/frontend`** 本轮以结构化扫描为主（规模、依赖、i18n、测试），未做逐文件精读——若需要对该后台做与桌面端同等深度的审查，需追加一轮。

**M-1、M-4、M-5、M-6、M-7、C-1 已由主会话打开源文件逐行独立复核确认。** 其余 MAJOR/MINOR 为专项探子结论，均附精确位置与代码证据，建议按需抽样复核后再排期。

---

## 附录 A：二次复核（2026-10-06 凌晨，对抗性自检）

> 本附录由**批判性复核**产生，目的是检验正文结论是否经得起复查、并补上原审查遗漏的维度。基线 `main` @ `d98f54db`（自报告合入后已推进 17 个提交）。

### A.1 结论有效性：全部 P0 原样未变

二次复核最重要的结论是**正文没有一条结论被证伪，也没有任何一条被修复**：

| 项 | 正文位置 | 复核结果（`d98f54db`） |
|---|---|---|
| C-1 命名空间错配 | `api/publisher.js:396` | **仍存在** —— preload 中扁平名 `filmEngineeringRetryShot` 命中数仍为 0 |
| P0-1 发布重入锁 | `usePublishFlow.js:283/285/414` | **未变** —— 守卫 :283、`await ensureLogin()` :285、置锁 :414 三行位置与原审查完全一致 |
| P0-2 Collection 轮询 | `Collection.vue:2585` | **未变** —— "轮询失败不立即中断" 注释仍在，异常分支依旧不做任何处理 |
| P0-3 `reportError` | `utils/report-error.js:15` | **未变** —— `api.logError(...)` 仍既未 await 也未 `.catch` |
| M-6 覆盖率门禁 | `vitest.config.js:67-82` | **未改善** —— `include` 仍全是 `*.js` glob，仍无 `src/**/*.vue` |
| M-7 超大文件棘轮 | `max-lines-baseline.json` | **未改善** —— 台账仍 **98** 条，`CreateView.vue` 登记值仍 **5657** |

**含义**：正文列出的 P0 至今**零修复**，路线图第 1 步（补 preload 契约测试）仍是投入产出比最高的动作。

### A.2 数据更正：ops-center 硬编码中文口径

正文 §7.2 表格中的"硬编码中文 **1902 行**"是**含测试文件的旧口径**，属我的统计疏漏。更正为：

| 口径 | 行数 |
|---|---|
| 旧（正文，误含测试文件） | 1902 |
| **更正：仅非测试源文件** | **1844** |
| 其中注释行（合规） | 160 |
| **实为用户可见文案（债务）** | **1684** |

结论方向不变（零 i18n 是真实缺口），但债务量比正文暗示的略高，且应扣除 160 行注释。

### A.3 补上遗漏维度：可访问性（a11y）——原报告完全未涉及

原审查把 a11y 排除在扫描范围外，这是一个**方法论盲区**。补扫结果：

| 项 | `apps/desktop` | `ops-center` |
|---|---|---|
| `<div @click>` 冒充按钮 | **31** | 0 |
| 其中带 `role` / `tabindex`（键盘可达） | 4 | — |
| **键盘完全不可达比例** | **87%** | — |
| `<img>` 缺 `alt` | **12** / 35 | 0 |
| `<button @click>`（正确写法对照） | 318 | 0 |

- **问题**：`ProjectCard.vue:2`、`SceneCard.vue:2` 等用 `<div @click>` 做可点击卡片，未加 `role="button"` + `tabindex="0"` + `@keyup.enter`，**键盘用户无法触达**。
- **范围界定**：`@click.self` 的遮罩层（`PersonalFormDialog.vue:2`、`UpgradeModal.vue:2`）**属合理用法**（点空白关闭，点遮罩本身不构成交互目标），不应计入。真实缺口集中在 31 处中的卡片类组件。
- **为何 ops-center 为 0**：它全用 Element Plus 组件，天然带正确语义。**缺口是桌面端自研组件特有的**。
- **定级**：**MAJOR（可访问性）** —— 不影响功能正确性，但键盘/读屏用户完全无法使用这些卡片。桌面应用场景下影响面小于 Web，但并非可忽略。

### A.4 已排除的误报：`TODO/FIXME` 遗留债务

补扫 `TODO|FIXME|HACK|XXX` 时，`Home.vue` 命中 11 次"最高"。逐行核实后发现**全部是 `todoItems` / `mp-home-todo` 这类变量名与 CSS 类名被正则误命中**（`const todoItems = computed(...)`、`.mp-home-todo {`），**不是遗留标记**。全仓真实 `TODO`/`FIXME` 遗留为 **0**。

这说明**基于正则的遗留标记扫描必须逐条核实**，否则会产出看似严重的假阳性。正文未收录此项，避免误导。

### A.5 安全面补充扫描：结论维持

为检验"零 XSS 入口"的断言是否只覆盖了 `v-html`，补扫全域危险 API：

| 危险构造 | 命中 | 判定 |
|---|---|---|
| `innerHTML` | **0** | ✅ 正文断言成立 |
| `eval(` | **0** | ✅ |
| `dangerouslySetInnerHTML` | **0** | ✅ |
| `document.write` | **0** | ✅ |
| `new Function` | 2 | ✅ **均为注释与测试代码**（`i18n/index.js:5,18` 解释为何不用的注释；`i18n/i18n.test.js:87` 专门模拟 CSP 禁用场景做回归锁）——生产代码为 0 |
| `tsconfig` `strict` | **true** | ✅ 附带确认 |

**结论**：正文的"零 XSS 入口"经扩大扫描后**依然成立**，且 TypeScript 严格模式已开启（正文未提及，属正面事实）。

### A.6 本次复核发现的报告自身缺陷

诚实列出本报告的问题，供后续修订：

1. **§7.2 统计口径错误**（1902 → 1844），见 A.2。**结论方向未受影响。**
2. **未覆盖 a11y 维度**（见 A.3），是最大的方法论盲区。
3. **未做 "遗留标记" 扫描**，导致"是否还有 TODO 债务"这一常规问题在报告中缺席（实际为 0）。
4. **未核实"35 个 img"的可访问性归属**，把装饰性图片与内容图片混为一谈（12 个缺 alt 中，部分可能是合法省略）。

上述 1~4 均为**覆盖广度问题**，不涉及正文任何一条技术结论的准确性。

---

## 附录 B：P0-1 运行实证（2026-10-06，质量节拍 ② 阶段产出）

> 附录 A 指出「全部结论来自静态阅读」是本报告最大短板。本附录用**运行证据**关闭其中一条 —— 选取 P0-1（发布重入窗口）做完整实证，含基线、反证与修复方案验证。

### B.1 验证方法

| 项 | 说明 |
|---|---|
| 隔离 | 独立 worktree `mp-verify-p0-reentry`，基线 `770967c0`；`node scripts/verify-worktree-deps.js` **rc=0**（11 项 workspace 解析正确） |
| 装置 | **照抄项目官方 `usePublishFlow.test.js` 的做法**：只用 `vi.mock('@/api/publisher')` 替换 IPC 层，其余依赖全部走真实实现 |
| 被测对象 | 真实 `usePublishFlow.handlePublish`，非骨架复刻 |
| 证据文件 | `apps/desktop/src/__p0verify__/p0-reentry-v2.test.js`（实证）、`p0-reentry-mutation.test.js`（反证） |

**装置失败的教训（如实记录）**：第一版装置注入了 20+ 个依赖替身，结果**基线用例（单次调用、无并发）也进不了发布体**（`publishBatch=0` 且无任何 warning）。诊断发现两处 mock 契约错误：① 校验函数读的是 `.valid` 而非写错的 `.ok`（`usePublishFlow.js:313/:318`）；② 注入替身改变了 `applyPlatformContentConversion` 的返回形状。该版本已废弃删除 —— 若不设基线用例，会把**装置缺陷误报成被测代码缺陷**。

### B.2 基线：单次调用正常工作

```
[基线] publishBatch 调用次数 = 1
[基线] ensureLogin 调用次数 = 1
[基线] publishing 终态 = false
[基线] progress = [{"text":"发布到 1 个目标（含多账号）...","type":"info"},
                   {"text":"✓ 已添加 1 个任务","type":"success"}]
```

**这是重入判据的前提**：单次点击必须真的发起发布，否则后续「两次」无从谈起。

### B.3 实证：重入窗口成立 ❌

模拟用户在登录引导弹窗弹出期间二次点击「发布」：

```
[重入] 第一次点击后: ensureLogin=1次 publishing=false
[重入] 第二次点击后: ensureLogin=2次 publishing=false     ← 守卫两次都放过
[重入-终] publishBatch 调用次数 = 2                        ← 两次真实发布请求
[重入-终] ensureLogin 调用次数 = 2
[重入-终] ❌ 重复提交成立：一次登录引导放行了 2 次真实发布请求
```

**P0-1 从「代码推理」升级为「运行坐实」**：`ensureLogin` 被调用 **2 次**（证明 `:283` 守卫两次都通过），`publishBatch` 收到 **2 次**真实请求。用户在登录弹窗上的这一次等待，被当成了两次独立的发布意图。

### B.4 触发条件的修正（原报告在此处不够精确）

原报告 P0-1 写的是「用户在登录引导框弹出期间再次点击发布」。运行证据补充了一条**原报告未提及的防线**：

- `Publish.vue:587` 的发布按钮是 `:disabled="selectedPlatforms.length === 0 || publishing"`
- `UiButton.vue:5` 把 `disabled` 落到真实 DOM `<button>`，`:30` 的 `isDisabled` 还合并了 `loading`
- `UiButton.vue:39-43` 的 `onClick` 另有显式守卫：`if (isDisabled.value) { event.preventDefault(); return }`

**含义**：鼠标点击在 DOM 层会被挡住。真实触发路径因此收窄为以下三类（而非原报告暗示的「任意快速双击」）：

1. **键盘 / 程序化触发** —— DOM `disabled` 会阻止原生点击，但 `handlePublish` 被 `usePublishFlow` 返回后在 `Publish.vue:1250`、`:1462` 多处暴露，非按钮路径可直接调用
2. **其他调用方** —— 同上，`handlePublish` 不是只服务于那个按钮
3. **登录引导是长耗时** —— 未登录时 `useLoginGate.js:48` 先弹 Element Plus 确认框、`:56` 再走 OAuth，窗口可达**秒级到分钟级**，远大于普通双击的毫秒级间隔

**结论不变但更精确**：缺陷依然成立（实证坐实 2 次调用），但**触发条件应表述为「登录引导窗口内的二次提交」而非「快速双击」** —— 快速双击在 DOM 层本就被 `disabled` 挡住。原报告此处措辞偏宽，本附录予以收窄。

### B.5 反证：修复方案有效且测试有鉴别力

无鉴别力的测试无法支撑结论，故做变异验证：

| 版本 | 进入发布体 | 被守卫拦截 | 时序 |
|---|---|---|---|
| 修复版（锁前置到第一个 `await` 之前） | **1** | 1 | `["locked","blocked"]` |
| 原版（锁在 `await` 之后，对照组） | **2** | 0 | 复现缺陷 |

**两组结论同时成立**，证明 (a) 缺陷可复现、(b) 修复方案确能关闭窗口、(c) 测试断言具备鉴别力而非恒真。

### B.6 对治理路线图的影响

- 附录 A.1 曾记录「6 项关键结论全部原样未变、零修复」。本附录**不改变该结论**，但为其中 P0-1 补上了第一份**运行证据**，并把它从「代码推理可信」提升为「已实证复现 + 修复方案已验证」。
- 其余 4 条 P0（P0-2 结果卡失联 / P0-3 Collection 轮询 / P0-4 `reportError` / P0-5 `useCopyLibrary` 竞态）**仍未实证**，维持附录 A.1 的静态结论。其中 P0-4 依赖真实 IPC 拒绝，需 Electron 主进程环境，非 vitest 可覆盖 —— 这是本轮选择「先验 P0-1」的原因：它的依赖全部可注入，是 5 条里实证成本最低的。
- **新增一条普适教训**：为「重入类」缺陷写验证时，**必须先跑基线用例确认单次路径本身通**。第一版装置正是因为缺基线，把 mock 契约错误误当成产品缺陷。若无基线，结论方向会完全错误。
