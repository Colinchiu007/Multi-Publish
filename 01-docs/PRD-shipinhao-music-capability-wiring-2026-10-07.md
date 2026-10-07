# 视频号音乐库能力面接线 —— 补 #3066 孤岛

- **PR**：#3108
- **提交**：`d7028aa5`
- **基线**：`f210f191`（#3066）
- **日期**：2026-10-07
- **类别**：缺陷修复 / 接线（不是新功能）

---

## 一、问题：功能完整，但没人能调到

#3066 合并了 `packages/api-publish-engine/src/publish/platforms/shipinhao-music.js`（视频号音乐库，212 行）。

它的交付质量很高：21 个单测全绿、CI 21 项全绿、取证来自主进程 bundle 的真实端点/请求头/请求体/模式值。

**但它是一个孤岛**——合并后生产代码对它的引用数为 **0**。没有路由能调到它，没有能力面方法包装它，桌面端没有任何入口。

模块自己测试全绿，**恰恰是这类缺陷完全隐形的原因**：单测验证「模块自己正确」，不验证「有没有人用」。`import` 了就算接线成功，即便没人 import。

> 这是一条评测设计层面的教训：任何新增的**叶子模块**（被调用方），单测再全也不能证明接线。接线要由**调用方**的测试来锁。

---

## 二、接线：四处，缺一则路由仍 404

```
① 能力面矩阵        CAPABILITY_MATRIX.tencent_video.musicLibrary = {...}
② 路由方法映射      PATH_TO_METHOD['music-library'] = 'musicLibrary'
③ 暴露白名单        EXPOSED_CAPABILITIES += 'musicLibrary'
④ 能力方法          ShipinhaoCapabilities.musicLibrary(params)
                     └─ 委托 ShipinhaoMusicChain（不复制协议逻辑）
```

④ 里的参数翻译（HTTP 面 → 链面）：

| HTTP 参数 | 链参数 | 说明 |
|---|---|---|
| `search` | `query` | 微信侧用 `query`，HTTP 面用 `search` |
| `page` | `currentPage` | 同上 |
| `mode` | `mode` | `hot` / `search` / `recommend` |

返回归一化音乐条目 + `lastBuffer` / `hasMore`（`lastBuffer` 是翻页游标，必须回传给调用方）。

---

## 三、顺带修掉的两个真缺陷

### 甲：键名不匹配 → 连接配置静默失效

`ShipinhaoMusicChain` 的构造器只读 `opts.api`：

```js
this.api     = opts.api || defaultApi()      // 承重
this.timeout = opts.timeout
this.cookie  = opts.cookie
// opts.client  ← 从未被读取
```

我最初写的是 `client: this.client`。**静默不匹配，不报错**：

- 音乐库于是自建默认 client
- 能力层的**代理 / 超时配置对它完全不生效**
- 外部注入面也随之失效 —— 测试打不进假服务器，请求直接走真实域名

> 判据：`getCapabilities(platform, opts)` 的签名注释本就写着「opts 透传给构造器（cookie / **client** / signer / finderId …）」，但 `ShipinhaoMusicChain` 读的是 `api`。**同一个词在两层里指向两个键，且都不报错。**

### 乙：路由层把 `getCapabilities` 锁在闭包里

```js
// publish-api-capabilities.js:26
const { getCapabilities } = require('../publish/capabilities')   // 解构捕获
// :119
caps = getCapabilities(platform, { cookie })                       // 只传 cookie
```

注入面是通的（`getCapabilities` 支持透传 `client/signer/...`），**只是路由层没用满**。

> **影响面超出音乐库本身**：能力层的代理 / 超时对**所有平台**此前都不生效。

本 PR 把 `_capabilitiesClient` 可选透传下去；**未设置时行为与改前逐字节一致**（`undefined → falsy → { cookie }`）。

**明确不做**：不改 `hasAccountProxy ⇒ 关闭 API 轨` 的闸门。代理是否对能力面生效，属行为变更，待实测后单独决策。

---

## 四、本仓既有测试空洞（本次暴露）

`publish-api-capabilities.test.js` 覆盖了：

| 分支 | 是否真发请求 |
|---|---|
| 矩阵总览 | 否 |
| 404 拒绝 | 否 |
| 405 方法错 | 否 |
| 400 缺 cookie | 否 |

**从未测过「路由 → 真发请求」**。而本次改动正好落在这条路径上 —— 如果没有新建 e2e，改坏了不会红。

---

## 五、回归锁 `test/shipinhao-music-capability.test.js`（15/15）

| 层 | 条数 | 锁什么 |
|---|---|---|
| 契约层 | 5 | 矩阵声明 / `PATH_TO_METHOD` / `EXPOSED_CAPABILITIES` / `isCapabilitiesUrl` / 归一化 |
| 实现层 | 3 | 方法存在 / 真委托（非空壳）/ **透传承重键 `api:`** + 死键 `client:` 反断言 |
| 端到端 | 5 | 请求真打到假服务器 / 三 mode 的 `type`（3/104/103）/ `_rid` 前缀 / `page→currentPage` |
| fail-closed | 2 | 五个未声明平台经路由实测全部 404 且零请求 / 缺 cookie 零请求 |

**为什么必须用假服务器**：只断言响应不足以证明 client 注入生效 —— 响应可能来自**真实微信**。必须断言「请求真的命中假服务器」。

### 变异验证（逐条实跑）

| 变异 | 结果 |
|---|---|
| 撤掉路由的 client 注入 | 端到端红 |
| 撤回 `PATH_TO_METHOD['music-library']` | 路由锁红 |
| 删承重键 `api:` | 红 6 条 |
| **把死键 `client:` 加回去** | **反断言红** |

---

## 六、独立审查：PASS（无 CRITICAL / MAJOR）

`ccg-review-decider.js` 因两个后端 CLI 不可用，判定降级 SELF-REVIEW。为避免"自己审自己"，派了**独立 `Verifier`**：只读、拿方案 + diff + 「我声称做过变异验证，请独立复现」。

它独立复现了我声称的两条变异，均真红；并确认接线在真实 `PublishApiServer` 上确实通。

### 已修的 3 个 MINOR

**F1（最有价值）：我的断言方向完全反了。**

上一轮那个键名 bug，我在测试里加了断言锁 `client: this.client`。结果：

```
删掉承重键 api:  → 它不红
删掉死键 client:  → 它反而红
```

**我写的锁在守护那个错误的键**，等于把 bug 焊死了。注释里「两种命名都接受，避免再次踩坑」还是**事实错误**（构造器只接受 `api`）。

已删死键 + 改正注释 + 断言改为锁承重键 + 加死键反断言。

> **教训**：加断言时要问「如果我把 bug 修对了，这条断言会怎样？」
> 锁在一个**能被正确实现绕过**的字符串上 = 没有牙齿。
> 判据：把正确实现拿掉测试会红，把错误实现拿掉测试也会红。

**F2**：用例名叫「→ 404」却只断言矩阵格子为空，**一次 status 都没断言、没打路由**。名字承诺的东西没验。已改为真打路由。

**F5**：改了路由契约却没改文件头的契约表。

### 未修的 2 个 MINOR（如实记录）

- **F3** e2e 无出网护栏：`api:` 一旦回归，测试会**先真打外网再变红**（已加「请求真的打到假服务器」断言，但拦不住先发生的真实请求）
- **F4** `raw: { totalCount }` 是合成的，与全仓其余 17 处「平台原始响应」同名不同义

---

## 七、验证记录

| 项 | 结果 |
|---|---|
| 引擎全量 Vitest | 34 文件 / **294 用例全通过** |
| 回归锁 | **15/15** |
| 变异 | 4 条逐条实跑，全部真红 |
| 六项门禁 | `exit=0`（max-lines / debt-budget / brand-residue / gate-record / check-text-encoding-integrity / check-doc-abs-paths） |
| 第二层 119 脚本 | 两项存量失败（用 `git archive` 纯净副本复现过，与本 diff 无关） |

---

## 八、给后续的三条

1. **新增叶子模块时，同一个 PR 里必须有调用方的 e2e。** 单测全绿不等于接线。
2. **跨层传 `opts` 时，`api` / `client` 这类同义词必须在两侧都 grep 确认。** 不匹配不报错，只静默失效。
3. **断言要问「正确实现会不会被绕过」。** 能被绕过 = 没牙齿（见 F1）。
