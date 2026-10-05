# 渲染层 ↔ preload 暴露面对账清单

> change: `fix-ipc-namespace-contract` ｜ 生成日期: 2026-10-05 ｜ 对应 tasks 1.1 / 1.2
> 本文是**取证产物**，只描述存量事实，不含实现方案（方案见 `design.md`）。
> 全部数据由脚本现场抽取，未手抄任何清单；可复跑复核。

## 一、为什么要对账

`electron-bridge.js` 的 `invoke(method, ...)` 在 `typeof api[method] !== "function"` 时**直接 `return undefined`**，
`invokeWithFallback` 随后返回调用方给的 fallback。渲染层拿到的就是 `{ code: -1 }`，
**没有任何异常、没有控制台错误、界面也没有提示**——功能表现为"点了永远没反应"。

这条路径两侧各有测试，中间那道接缝无人测：

- **preload 侧测得很全**：`preload.test.js` 有转发矩阵、`toHaveProperty` 暴露面断言、键数锁
- **渲染层测不到**：`useFilmVideoGen.test.js` / `useFilmProduction.test.js` 用 `vi.mock('@/api/publisher')`
  整体 mock 掉本模块，只断言"调用了 `filmEngineeringRetryShot`"，**从不断言 preload 是否真有该方法**

于是方法名写错能一路进主干。这就是本 change 要补的那道接缝。

## 二、两份"面"的真实构成（务必先看清，否则会把正确设计误报成缺陷）

`preload/index.js` 的暴露面**不是一个静态集合**，而是经过权限过滤的：

```js
const fullApi = { ...createPublishApi(...), ...createSystemApi(...), ... /* 共 20+ 工厂 */ }
const exposedApi = createDynamicAccessApi(fullApi, getAccessLevel)   // ← 按等级过滤
contextBridge.exposeInMainWorld('electronAPI', exposedApi)
```

`access-control.js` 的 `requiredLevelForMethod` 分三档：`ADMIN_ONLY_METHODS` → `admin`，
`PUBLIC_METHODS` → `public`，**其余一律 `authenticated`**；而 `createDynamicAccessApi` 对
`requiredLevel === 'admin' && 当前等级 !== 'admin'` 的方法**整键跳过**（不暴露）。

`ADMIN_ONLY_METHODS` 恰好 5 个：`paymentComplete`、`paymentSimulate`、`proxyTest`、`proxyTestAll`、`proxyReset`。

现场实测三份面：

| 面 | 顶层键 | 扁平函数 | 命名空间 | 可解析方法名 |
|---|---|---|---|---|
| `public` 等级 | 411 | 400 | 11 | 467 |
| `admin` 等级 | 416 | 405 | 11 | 472 |
| 分类表 | ADMIN_ONLY 5 + PUBLIC 127 = 132 | | | |

`public` 恰好比 `admin` 少 5 个 = `ADMIN_ONLY_METHODS` 全集，符合上述逻辑。

> ⚠️ **对账必须对「public ∪ admin」求差集**。只对 public 求差集会把 `paymentSimulate` 这类
> **故意只给管理员**的方法误报成缺陷（见下文 §四 B 类）。

11 个命名空间：`approvalGate` `board` `contactSheet` `filmEngineering`(17) `pageManager`(26)
`pipelines` `project` `replay` `ttsVoice` `ttsVoiceClone` `videoClone`。

## 三、调用侧规模

扫描 `apps/desktop/src/api/**` 全部 `.js`：

| 项 | 数量 |
|---|---|
| 字面量方法名（去重，含测试文件） | 218 |
| 字面量调用点总数 | 221 |
| 动态取名（首参非字面量） | 2 |
| **渲染层真实用到（去重、排除 `electron-bridge.js` 内部转发与测试夹具）** | **213** |

那 2 处"动态取名"是 `electron-bridge.js:44-45` —— `invokeWithFallback` 内部转发给 `invoke(method, …)`，
**不是真实调用点**，对账时必须排除，否则会把 wrapper 自己算成一条。

## 四、差集与逐条判定

对「public ∪ admin」求差集得 9 项，逐条判定如下。

### A. 任何等级都未暴露（真缺陷候选，4 项生产 + 5 项测试夹具）

| # | 调用名 | 调用点 | 判定 | 证据 |
|---|---|---|---|---|
| A1 | `filmEngineeringRetryShot` | `src/api/publisher.js:396` | **真实缺陷（活）** | preload 只在 `filmEngineering.retryShot` 暴露（命名空间成员，`access-control.js` 未把它归 admin，故 public/admin 两面均在）。6 个文件引用它，其中 `useFilmProduction.js`、`useFilmVideoGen.js` 是真实生产调用方 ⇒ **影视单镜重试永久失效且界面零报错**。即审查报告的 CRITICAL-1 |
| A2 | `pipelinePauseWithCheckpoint` | `src/api/publisher.js:398` | **死代码** | 暴露面有 `pipelinePause` / `pipelinePauseRun`，无此名；**全仓 0 个调用方**（仅自身定义）。潜伏陷阱，不是活缺陷 |
| A3 | `pipelineResumeFromCheckpoint` | `src/api/publisher.js:399` | **死代码** | 暴露面有 `pipelineResume` / `pipelineResumeOrchestration`，无此名；**0 调用方** |
| A4 | `pipelineRegisterPipeline` | `src/api/publisher.js:400` | **死代码** | 暴露面无任何 `pipeline*Register*`；**0 调用方** |
| A5 | `importMedia` | `src/api/electron-bridge.test.js:51` | **测试夹具** | 假名，测试用 |
| A6 | `missing` | `src/api/electron-bridge.test.js:60` | **测试夹具** | 假名（专测 fallback 分支） |
| A7 | `missingMethod` | `src/api/electron-bridge.test.js:22` | **测试夹具** | 假名（专测 `undefined` 回落） |
| A8 | `submit` | `src/api/electron-bridge.test.js:35` | **测试夹具** | 假名 |
| A9 | `testMethod` | `src/api/electron-bridge.test.js:14` | **测试夹具** | 假名 |

> A5–A9 全部落在 `*.test.js`。**扫描域必须排除测试文件**，否则契约测试开局就 5 条假阳性，
> 会被后人当成噪声而删掉整个锁——这正是 `settings-roundtrip-contract.test.js` 判据矩阵
> 里"负例不得误伤，否则下个会话直接把锁删掉"那条纪律的现实版本。

### B. 仅 admin 暴露（权限门控，**非缺陷**）

| 调用名 | 调用点 | 判定 | 证据 |
|---|---|---|---|
| `paymentSimulate` | `src/api/publisher.js:348`，`components/UpgradeModal.vue:191` | **权限门控的正常设计** | `ADMIN_ONLY_METHODS` 第 1 项（`access-control.js:7`）⇒ 非 admin 等级**整键不暴露**；admin 面实测存在。主进程 handler `ipc-handlers/payment.js:64` 另有硬守卫 `app.isPackaged !== false`（"只有明确未打包的开发应用才能模拟支付，环境变量不能覆盖打包事实"）且已有测试 `license-access-control.test.js:401`。`UpgradeModal` 是升级弹窗，模拟支付本就只对管理员/开发态有意义 |

> 这一条是本次对账**最容易被误判**的地方：只看 public 面会把它当成"第二个真实缺陷"，
> 进而去 preload 补暴露——那会**扩大敏感 API 暴露面**，与既有安全设计相反。

## 五、结论

- **活的真实缺陷：1 个**（A1 / CRITICAL-1）
- **死代码（潜伏陷阱）：3 个**（A2–A4）
- **权限门控、非缺陷：1 个**（B）
- **测试夹具：5 个**（A5–A9，扫描域排除）
- 动态取名：**0 个**（生产侧）

按 tasks 1.3 的拆分判据：真实缺陷 1 个 ≤ 8 ⇒ **本 change 一次做完，不拆分**。

## 六、复跑方式

```bash
# 1) 扫描域：apps/desktop/src/api/*.js（排除 *.test.js）
#    抽出 invoke / invokeWithFallback 的首参字面量，排除 electron-bridge.js 内部转发
# 2) 暴露面：拦截 contextBridge.exposeInMainWorld 取 exposedApi（index.js 不导出它）
#    分别以 access level = public / admin 各取一份
# 3) 差集：调用名 − (public ∪ admin)
# 4) 分类：仅 public 缺失 → 疑似 admin-only，需查 ADMIN_ONLY_METHODS 确认
#         两面都缺 → 再查调用方数量，区分「活缺陷」与「死代码」
```

## 七、踩过的坑（写给下一个会话）

1. **`preload/index.js` 不导出 `exposedApi`**，只导出 `{getAccessLevel, accessLevelCache, filterApiByAccessLevel, createDynamicAccessApi, ADMIN_ONLY_METHODS, PUBLIC_METHODS}`。想拿真实面只能拦截 `contextBridge.exposeInMainWorld`。
2. **不要用 `preload.test.js` 里的 `api` 当暴露面**。它只组合了 7 个工厂（publish/account/system/identity/videoClone/filmEngineering/services），断言键数 334；而 `index.js` 组合 20+ 个工厂，真实面是 411/416。**334 这个数是漂移的子集，拿它对账会产生大面积假阳性。**
3. **权限等级会改变面的形状**，不是静态集合。只对 public 求差集会误报 admin-only 方法（见 §四 B）。
4. **wrapper 的内部转发不是调用点**。`invokeWithFallback` 内部调 `invoke(method, …)`，首参是变量，若不排除会被算成一条"动态取名"。
5. **启发式相似名只是线索，不是证据**。本次 `paymentSimulate` 的相似名建议把我导向"preload 缺暴露"的方向，差一步就去改 preload——实际是 ADMIN_ONLY 门控。判定必须落到「分类表 / 调用方数量 / 主进程守卫」这类可查事实。
