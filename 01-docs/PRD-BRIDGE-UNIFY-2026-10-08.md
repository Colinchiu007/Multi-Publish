# PRD：IPC 桥接层收敛 —— getApi 单一真源 + API Key 链路脱壳（M-9，批次 C）

- 文档类型：修复型 PRD（含数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）
- 日期：2026-10-08
- 来源：前端深度审查报告 `docs/frontend-deep-review-2026-10-05.md` M-9（报告正文编号）
- 分支：`batch-c-getapi-unify`
- worktree：`D:\Data\projects\mp-worktrees\mp-batch-c-getapi-unify`

---

## 1. 问题（用户会遇到什么）

M-9 的三个缺陷环环相扣，核心一句话：**9 份各自为政的 `getApi()` 让同一批 IPC 能力
存在两条调用路径，其中一条绕过了脱壳与兜底。**

### 1.1 数据校验缺陷：API Key 不脱壳直传 IPC

`model-providers.js` 的 `modelProviderCreate(data)` / `modelProviderUpdate(id, updates)`
与 `providers.js` 的 `providerCreate(data)` / `providerSetUserKey(name, apiKey, baseUrl)`
直接把调用方给的对象塞进 `api.X(...)`。

调用方（`useModelProviderCrud`）传的是 Vue reactive 表单对象 —— 绕过
`toPlainIpcValue` 脱壳意味着：

- reactive Proxy 原样穿过 contextBridge，行为依赖 Electron 版本的序列化实现；
- 主进程收到的可能是代理对象，API Key 等敏感字段的生命周期脱离可审计范围；
- 任何字段不可序列化时，错误在 IPC 深处爆出，用户看到的只是"保存失败"。

修复后：所有参数经 `toPlainIpcValue` 脱壳（JSON 安全化，File/Blob 原样放行），
不可序列化时在**桥接层**抛出明确 TypeError。

### 1.2 流程缺陷：9 份 getApi 防御强度不一

| 旧实现 | 守卫 | 无 API 时行为 |
|---|---|---|
| electron-bridge.js | `typeof window !== 'undefined' &&` | 回 undefined，调用方拿 fallback |
| model-providers / providers / ops-center-sync / cloud-publisher | `window.electronAPI \|\| null` | 回 code:-1 信封 |
| identity / services | `typeof window !== 'undefined' &&` | 回 code:-1 信封 |
| tts-voice-catalog / tts-voice-clone | 命名空间子对象检查 | 回 code:-1 信封 |

同一仓库四种防御形态，preload 未注入时的表现取决于"你调的是哪个文件"。

修复后：`getApi()` 唯一定义在 electron-bridge.js（契约测试守卫），8 个文件
全部改走 `invokeWithFallback` / `invokeNamespace`，无 API 时统一回各自的
code:-1 信封（信封字段与旧实现逐字段一致，调用侧判空逻辑零改动）。

### 1.3 一致性缺陷：publisher.js 4 处绕过「单轨」门规

`publisher.js` 文件头自述「所有组件通过此文件访问 IPC」，但 531/555/558/567
四行直接 `window.electronAPI.X(...)`——绕过脱壳与 fallback。其中
`creatorPendingTotal` 还是审查报告点名三处**之后**新长出来的第四处
（证明：没有机械守卫，这个形态必然复发）。

修复后：四处全部走 `invokeWithFallback`，并新增契约守卫
「getApi / window.electronAPI 直访必须收敛到 electron-bridge 单一定义」——
任何人再写直访，测试直接点名文件。

---

## 2. 功能逻辑（改了什么）

### 2.1 electron-bridge.js

- `getApi` 加 `export`（成为全仓唯一真源），文件头注明 M-9 收敛背景。

### 2.2 model-providers.js / providers.js（API Key 链路，本批最高风险项）

- 删除本地 `getApi` 副本；
- 11 + 8 个导出函数全部改为 `invokeWithFallback(method, fallback, ...args)`；
- fallback 信封逐字段照抄旧实现的"无 API"返回
  （如 `modelProviderList` 的 `{ code: -1, message: UNAVAILABLE, data: [] }`），
  调用侧 `useModelProviderCrud` 只判 `res.code` / `res.data`，零改动。

### 2.3 identity.js（登录链路）

- 5 个查询/操作函数改 `invokeWithFallback`，fallback = `{ code: -1, message: 'IDENTITY_API_UNAVAILABLE' }`；
- `onIdentityStateChanged` 改走 bridge 的 `on('IdentityStateChanged', cb)`
  （bridge.on 内部拼 `on + event` 并做同款守卫，旧实现的方法存在性检查被覆盖）；
- **语义差异声明**：旧实现"方法缺失回信封"，新实现走 invoke——若主进程真 reject，
  invokeWithFallback 会**抛出**而非回信封；调用侧 `identity.js store` 的调用处
  本来就有 try/catch（`useIdentity` 的 catch 分支），行为兼容。

### 2.4 services.js / cloud-publisher.js / ops-center-sync.js

- 同形态收敛；cloud-publisher 的 `_api` 模块级缓存一并删除
  （该缓存会把「preload 晚注入」永久误判为 null）；
- ops-center-sync 的 `onOpsCenterRuntimeUpdated` 改走 bridge `on()`。

### 2.5 tts-voice-catalog.js / tts-voice-clone.js（命名空间链路）

- 它们调的是 `electronAPI.ttsVoice.*` / `ttsVoiceClone.*` **命名空间**，
  改走 bridge 的 `invokeNamespace(NS, method, input)`；
- 旧实现的"方法缺失/主进程拒绝回 UNAVAILABLE 信封"语义保留：
  `invokeNamespace` 缺方法时返回 undefined，包装层补同一信封；
- **每个导出直接写 ns/method 字面量**，不经参数转发——否则契约测试的
  静态对账看不见这些路径（C-1 就是这么漏的）。

### 2.6 publisher.js

- 4 处直访改 `invokeWithFallback`；
- fallback 选择：`extractVideoCover`/`generateAiCover` 回 `null`（调用方已判空）、
  `listPlatformCollections` 回 code:-1 信封、`creatorPendingTotal` 回
  `{ code: 0, data: { total: 0 } }`（博主监控角标在无 IPC 时显示 0，
  与后端"无记录"语义一致，不弹错误打扰用户）。

### 2.7 契约测试（ipc-exposure-contract.test.js）—— 防复发机制

1. **SCAN_DOMAIN 从 5 文件扩到 13 文件**（新增 8 个 getApi 文件）；
2. **域守卫判据扩展**：从「含 invoke( 调用」扩展为「触碰 IPC」
   （invoke / invokeWithFallback / invokeWithTimeout / invokeNamespace /
   window.electronAPI 任一命中即须登记）；
3. **新增 M-9 守卫**：「getApi / window.electronAPI 直访必须收敛到
   electron-bridge 单一定义」——除 electron-bridge 外任何 api 文件出现
   `getApi` 定义或 `window.electronAPI` 访问，测试点名该文件；
4. **extractCalls 支持模块级常量首参**：`const NS = 'ttsVoice'` +
   `invokeNamespace(NS, 'catalog', …)` 这种形态，ns 常量会被解析参与对账。

## 3. 交互逻辑与显示项（用户可见变化）

无。所有调用侧（视图/composable/store）零改动；各 API 函数签名、返回信封
逐字段兼容。唯一的理论行为差异：主进程 **真 reject** 时，旧实现部分函数回
code:-1 信封、新实现会抛出——调用侧 catch 分支已存在（identity store /
useModelProviderCrud 均有），用户看到的是同样的错误提示路径。

## 4. 反证（撤掉修复 ⇒ 断言必须转红）

| 反证注入 | 预期 | 实测 |
|---|---|---|
| model-providers.js 把 `modelProviderCreate` 拼成 `modelProviderCreat` | 对账点名缺口 | ✅ 「未登记的暴露面缺口（1）：modelProviderCreat」 |
| tts-voice-catalog.js 注入 `window.electronAPI.ttsVoice.catalog(...)` 直访 | M-9 守卫点名文件 | ✅ 「绕过直访 IPC 的文件（1）：tts-voice-catalog.js」 |

两条反证都恢复后回绿（20/20）。

## 5. 验证

| 项目 | 结果 |
|---|---|
| 契约测试 ipc-exposure-contract | 20/20 |
| src/api 目录全量 + identity store + crud | 423/423 |
| check-max-lines / check-debt-budget / check-test-microtask-spin | rc=0 |
| 反证 ×2 | 转红并恢复 |

## 6. 非目标与残留

- publisher.js 其余 invoke/invokeWithFallback 调用不在本批范围（已合规）；
- ttsVoice 命名空间的"缺方法回信封"依赖 invokeNamespace 返回 undefined 的约定，
  若将来 bridge 改为抛错需同步调整这两文件的包装层；
- 报告 M-9 提到的「preload 契约测试」建议由 #2952 落地（532 行），本批是它的扩域。
