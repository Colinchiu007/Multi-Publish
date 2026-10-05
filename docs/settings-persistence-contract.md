# 应用设置真源的读写往返契约（settings-persistence）

> 关联 OpenSpec change：`openspec/changes/fix-settings-roundtrip-contract/`
> 关联既有规格：`openspec/specs/app-menu/spec.md`（「应用菜单配置落入本地缓存，**重启后仍可恢复**」那条）
> 引入点：`384b5c8b`（2026-08-10，运营策略下发首批）；存续约 57 天，至本文所述 PR 才第一次被满足。

## 1. 症状与根因

**用户可见症状**：在运营中心「应用菜单」页改了显隐/排序并保存，桌面端侧栏**永远不会变**；每次重启都回落到应用内置菜单。

**根因是一处类型契约误判**，不是同步逻辑坏了：

| 侧 | 真实行为 | 位置 |
| --- | --- | --- |
| 写入 | `setSetting(key, value)` 经 `safeJsonStringify`：字符串**原样透传**、对象 `JSON.stringify` | `apps/desktop/electron/services/store/settings-store.js` |
| 读取 | `getSetting(key)` 返回 `safeJsonParse(row.value, row.value)` —— 即**解析后的值（对象）**，不是字符串 | 同上 |

而四个主进程服务把读回当成字符串：

```js
raw = String(this._store.getSetting(SETTING_KEY) || '')   // → '[object Object]'
cfg = JSON.parse(raw)                                     // → 抛 → catch → cfg = {}
```

于是**配置写得进去、读不回来**，且失败方向是"静默空值"，不报错、不留日志。

## 2. 修复后的契约

- **对象型设置的唯一入口**：`store.getSettingObject(key, defaultValue)`。内含对象判据、JSON 文本兼容、损坏行回落调用方默认、`_ready=false` 回落。**禁止**再写 `String(getSetting(...)) + JSON.parse`。
  该命题**只覆盖对象型**：数组型值（`drafts` / `automation_tasks` 等）被其 `!Array.isArray` 判据主动排除，`getSettingObject(arrKey, {})` 返回的是 `{}` 而不是数组本体——把数组消费点迁进来会把「有数据」读成「无数据」，比不迁更坏。数组型的当前收口方式见 §6。
- **写入侧传对象**：`setSetting(key, cfg)`。因为 `safeJsonStringify` 对对象做 `JSON.stringify`、对字符串原样透传，**落盘字节与修复前逐字相同** ⇒ 零迁移、零格式变更、旧行照样读得回。
- **回滚必须整体**：只回滚读侧或只回滚写侧会重新制造不对称。

覆盖的恢复路径（本 PR 收敛的 12 处）：`ops-center-sync.js` 的 `getConfig` / `_readEncryptedKey` / `_getManualUrl` / `_getStoredKeyEnc` / `_getRuntimePublicKey` / `_loadRuntimeState`（应用菜单、公告、功能开关、发布管线选项、内容类别）与 `opsCenterSync`/`opsCenterRuntime` 的三处写入；`diagnostics-reporter.js`、`publish-reporter.js`、`usage-reporter.js` 各自的水位线读写对。

## 3. 回归锁与夹具纪律

- **绝对下界是真实存储**：`apps/desktop/electron/services/settings-roundtrip-contract.test.js` 用真 `Store`（sql.js，库文件落在 `os.tmpdir()` 下带 pid+随机后缀的独立目录），**关闭并重新打开同一份文件**模拟重启，断言 `save → 重开实例 → read` 等价。
- **夹具必须同形**：历史逃逸的直接原因是 `ops-center-sync.test.js` 的 `makeStore` 写作 `getSetting: () => data / setSetting: (_k, v) => { data = v }`，即"存进去什么类型就返回什么类型"，与被测契约（字符串进、对象出）**不同形**，使 68 条用例对该缺陷结构性免疫。现夹具改为落文本、读解析值，并**按键分槽**（`_row(key)` 必须点名键）——旧版单键夹具里 `_getData()` 返回"最后一次写入"，与所断言的键无关，任何一次别的键写入都能满足它，属 AGENTS.md 禁止的装饰性断言（QM6-W5）。
- 断言"重启后恢复"必须能在**实现退回误判写法**时变红——见下表 M2。
- **测试侧内联的归一化只用于同形模拟，不构成对 `getSettingObject` 语义的验证**：`diagnostics-reporter.test.js:44`、`ops-center-sync.test.js:55` 与 `:934`、`publish-reporter.test.js:17`、`usage-reporter.test.js:33` 各内联了一份判据用于让夹具形状贴近真源。改动 `getSettingObject` 的判据时，证据面一律只有 `settings-roundtrip-contract.test.js`（真 Store + 真 sql.js），不要拿这 5 份副本的存在当作回归覆盖。

## 4. 反证矩阵（全部实跑，非推定）

改动前基线：`ops-center-sync / diagnostics / publish / usage` 四文件 **90 passed 全绿**（无一条是 Bug 探针）。

| 变异 | 单元套件（同形夹具） | 真实存储锁 | 命中的用例 |
| --- | --- | --- | --- |
| M1 摘掉 `getSettingObject` 的对象分支 | — | **7 红** | 存储往返 2 条 + saveConfig/appMenu + Diagnostics/Usage 水位线（证明它是真单点） |
| M2 生产读回退回 `String(getSetting)+JSON.parse` | **21 红** | 红 | `saveConfig/getConfig` 整组；此前同一误判在旧夹具下为 0 红 |
| M2′ 生产误判 + 夹具退回"原样回吐" | **0 红（68 passed，逃逸复现）** | **2 红** | 即历史状态：单元全绿而生产坏；只有真实存储锁抓得住 |
| M3 `appMenu` 恢复改恒 `null` | — | **1 红** | `applyRuntime 落盘的应用菜单，重启后无需再同步即可恢复`（该锁是唯一防线） |
| M4 `usage` 水位线写入改 no-op | — | **1 红** | `UsageReporter 的水位线在重启后读回上一份值` |

每条变异均在完成后按 md5 逐字节还原源文件；`GREEN(锁没抓住)` 一律作为待解释异常处理，不登记为"该变异是 no-op"。

## 5. Live 端到端取证（本机运营中心）

以真 `Store` + 真 `OpsCenterSync` + 真 HTTP 打到本机 `127.0.0.1:8010`（仅回环），三阶段：

1. 配置 + 同步：`saveConfig` → `syncNow` 返回 `code=0, runtimeApplied=true`，菜单 21 项落入缓存。
2. 真重启且**拦截全部出站**（替换 `global.fetch` 并计数）：重开库、新建实例后 `url`/`apiKeyConfigured`/自定义验签锚/`lastSyncedAt` 全部读回，菜单 21 项与阶段 1 **逐项全等**（key/visible/group/sort_order），恢复期出站计数 = **0**。
3. 验签负控：把自定义公钥换成不相干的一把 ⇒ `runtimeApplied=false`，且已验签缓存**未被覆盖**（fail-closed 成立）。

> 判据写成关系式而非快照数字：运营中心配置会被并发会话改动（取证当天该清单从 20 项/3 隐藏变为 21 项/0 隐藏），钉死数字只会让锁随机红。

## 6. 同族归一化的实测清点（不在本 PR 收敛）

判据形态：`` `typeof raw === 'string' ? JSON.parse(raw) : raw` ``（含 `safeParse` 变体）。
扫描域 `apps`/`packages`/`ops-center`/`config`/`scripts` 共 **3251 个被跟踪文件**，排除 `*.test.*`；下列计数取自主进程与渲染层的**生产**代码。

**读 settings 真源（`store.getSetting` / `getUserSetting` 及其 IPC 等价）的共 13 处**——本节此前只记了 3 处，QM6 复审补到 7 处，仍不全：

| 落点 | 值形态 | 未收敛的**真实**阻塞理由 |
| --- | --- | --- |
| `services/hot-topics-service.js:157/185/360` | 对象 | 注入物是 `core/container.setup.js:229` 的窄包装（只转发 `getSetting`/`setSetting`），要走唯一实现必须先扩那层转发 |
| `ipc-handlers/store.js:411/436/455` | **数组**（`drafts`） | `getSettingObject` 的 `!Array.isArray` 判据主动排除数组，**不是**窄包装问题 |
| `services/publish-failure-draft.js:82/86` | **数组**（`drafts`，含 `getUserSetting` 用户作用域） | 同上 |
| `services/automation-scheduler.js:74` | **数组**（`automation_tasks`） | 同上；它在 `container.setup.js` 拿到的是完整 Store，因此**不受**窄包装阻塞——照"先扩转发"的理由去迁它，前提就是错的 |
| `src/composables/useCopyLibrary.js:40`、`useCopyLibrarySources.js:43`、`src/views/Collection.vue:1447/2222` | 数组/对象混合 | 渲染层经 IPC 读同一真源，够不到主进程 mixin；要收敛得先定 IPC 侧的值形态合同 |

⛔ **禁止把数组消费点迁进 `getSettingObject`。** 这条是本节的历史错误本身：初稿把「窄包装未扩转发」写成对全部漏项通用的唯一阻塞理由，复审过程中还提出过「automation-scheduler 有完整 Store，可以直接迁」——实测 `` `getSettingObject('arr', {})` `` 对数组返回 `{}`，照此迁移会把有数据读成空对象，正是本 PR 要消灭的「写得进读不回」换到数组维度重演一遍。数组入口需另立同形判据（如 `getSettingArray` / `getUserSettingObject`）；本 PR **未新建**，因为没有现存消费者需要它——先建就是无人认领的死 API。后续谁建，谁负责回头收敛上述 4 组数组点。

**同形但不同真源、不属于本契约的 7 处**，勿"顺手收敛"（各有各的源与语义）：`packages/api-publish-engine/src/auth/postgres-identity-repository.js:427`（PG JSON 列）、`packages/api-publish-engine/src/publish/platforms/douyin-image.js:133` 与 `douyin-video.js:178`（账号 auth 串）、`packages/rewrite-engine/src/strategy-manager.js:104/122`（词库文件 JSON）、`packages/rpa-engine/src/publish-signer.js:111`、`packages/shared-utils/src/data-sync.js:98`。

装配面版本差由 `settings-roundtrip-contract.test.js` 的「窄包装装配面不得静默落后于存储契约」锁看守：按**形态**取对象语义读取入口（`/^get.*Object$/`），未出现在窄包装转发集里就必须进 `KNOWN_LAGGING` 显式认欠，清单只能缩小、扩了转发不销账同样变红。
## 7. 本机运营中心配置现场（2026-10-05 实测）

三段配置此前均缺失，桌面端因此从未成功同步：

1. `ops-center/backend/.env` 缺 `OPS_CATALOG_API_KEY` 与 `OPS_RUNTIME_SIGNING_PRIVATE_KEY`；`routers/runtime.py` 是"私钥未配置即 404 fail-closed"。现已补 `OPS_CATALOG_API_KEY` + `OPS_RUNTIME_SIGNING_KEY_PATH`（私钥文件位于仓库外 `%LOCALAPPDATA%\Mulpub\ops-center-dev\`，不入 git、不入对话）。
2. 后端此前未运行；重启后实测监听 `LocalAddress=127.0.0.1`（非 0.0.0.0，登录面未暴露到局域网）。`GET /api/v1/runtime/bootstrap` 错 Key=401、对 Key=200 且带 `signature`。
3. `config/identity-public.json:22` 的 `opsCenterUrl` 指向 `https://ops.iart.work`，该主机**从未部署**（task #19），应用启动同步必然 `fetch failed`。
   本条的**取证通道换过一次**，留作方法论现场：原写法「该域名 DNS 不解析」的判据是本机 `dns.lookup`，而在 fake-ip 型代理（本机 Clash/TUN，或上游路由器/网关 OpenClash）下，代理 DNS 对**任何**域名都回 `198.18.x.x`，该探针已无法区分「未部署」与「已部署但链路不通」——结论恰好没错，证据却是无效的。2026-10-05 改用 DoH（`https://dns.google/resolve?name=<host>&type=A`，正控 `github.com`→`20.205.243.166` 证明通道本身可用）复测：`ops.iart.work` = **Status 3 (NXDOMAIN)**（记录确实没建）；`auth.iart.work` = `39.105.42.85` 且线上正常（HTTP 302），`api.iart.work` = 同 IP 但证书 SAN 只覆盖 `auth.iart.work`，TLS 报 `SEC_E_WRONG_PRINCIPAL`。即**部署主机已在**，缺的是 `ops` 这条 DNS 记录、nginx server 块与覆盖该名的证书。

因此本机的可用形态是"本地运营中心 + 手动配置"；一旦 ECS 部署完成，应删除那行手动的 `opsCenterSync` 配置，让应用回落到 identity 自动发现，而不是把用户桌面端钉在某台开发机的 8010 上。

**部署前置条件（不可省略）**：打包态不吃内置 DEV 公钥——`runtime-trust-anchor.js` 在无自定义锚时返回 `NO_PRODUCTION_TRUST_ANCHOR` 并令整份运行时策略不生效。故生产必须自造 Ed25519 密钥对、私钥进服务端、公钥作为 `runtimePublicKey` 交客户端。另需纠正一处文档漂移：`ops-center-sync.js` 与 `runtime-trust-anchor.js` 的注释称 DEV 私钥"在 `.env.example` 标注"，实际 `.env.example` 已不含 PEM（`ops-center/backend/tests/test_p0_security.py` 明确禁止），那把私钥现存在于 `ops-center/backend/tests/conftest.py`。

## 8. 已知残留与安全断言（QM-6 后端评审登记，均未在本 PR 修）

### 8.1 行损坏时保存会抹掉已存 API Key（Warning，非本 PR 引入）

`_readStoredObject` 目前把「行不存在」「行是非法 JSON」「读取抛异常」三态一律归为 `{}`。
于是 `saveConfig({apiKey: ''})`（语义＝"保留现有 Key"）在**行损坏**时会把 `apiKeyEnc` 写成空串，抹掉旧密文；
`syncNow` 成功后的回写同理。本 PR 把该窗口从「每次读取都失败」收窄为「仅行损坏时」，形态未消灭。

**为何不在本 PR 修**：三态归一正是这个入口的简化前提，要区分就得改 `_readStoredObject` 的返回契约并波及全部 6 个调用点，
那是独立切片的设计工作（要顺带决定损坏行是"拒绝写"还是"原样保字段"）。另一个更常见的情形其实**不会**抹 Key：
若 `getSettingObject` 直接抛异常（库被关闭/SQL 故障），同一 store 上的 `setSetting` 也会抛，保存整体失败并返回 `code:-1`，
落不了盘。真正可达的只剩「行是非法 JSON」这一档，而此时旧密文本身也已不可恢复，代价是用户重填一次 Key。

### 8.2 运行时状态的持久化缓存不经验签（威胁断言，必须写明）

自定义信任锚 `runtimePublicKey` 与被保护的运行时状态分别落在 `settings` 表的 `opsCenterSync` 与 `opsCenterRuntime` 两行；
构造期 `_loadRuntimeState` 直接恢复缓存、**不重新验签**，验签只发生在 `_fetchRuntime` 对网络负载上。
⇒ 签名链保护的是"传输"，不保护"落盘后的重放"。能写本机 SQLite 的一方既可写自己的 PEM（自签），也可直接写运行时状态行。

断言：**本仓的威胁模型不含"攻击者已能写本机应用库"**——该前提一旦成立，等于已具备本机代码/数据执行能力，
远不止绕过运营配置。因此本 PR 不为此新增验签层（修了也不改变风险等级，却会引入"缓存必须带签名+canonical 载荷"的状态迁移）。
如果产品要把运营下发内容当作**对抗面**（例如多用户共享机器、或要防本地篡改发布策略），那么正确做法不是给恢复路径加验签，
而是把信任锚移出可写表（独立受保护文件或与数据主密钥绑定），这条属产品级安全决策，需单独立项。

注：修复前该路径其实**不可达**（读回恒 `{}`，缓存永远恢复不出来），所以"本 PR 使既有设计缺陷首次可被利用"的说法
只在"读回真的生效"这个意义上成立；结合上面的威胁模型断言，其可利用性并不因本 PR 改变结论。
## 9. 结构锁的精度欠账（QM-6 后端复核实测，未在本 PR 修）

§3 那条结构锁（`findStringReadsOfSettings`）守的是「把这四个文件里 `getSetting` 的返回值当字符串再处理」这一形状。
复核实测出它的四条边界，**登记在此而不是现在就修**：修它们要动判据实现，属独立切片，且本 PR 是文档面。

| # | 边界 | 现状与影响 | 若要收口，正解是 |
| --- | --- | --- | --- |
| L1 | **拆句等价绕过**：`const raw = getSetting(K)` 另起一行再 `String(raw)` / `JSON.parse(raw)` | 语义是同一个错，锁静默绿。可达性真实（重构时很容易写成两步） | AST 判据：按数据流看 `getSetting` 返回值的消费者，而不是看字符邻接 |
| L2 | **别名 / 动态方法名**：`const g = store.getSetting` 后 `String(g(K))`，或 `store[key](K)` | 同上，绕过后无痕迹 | 同上；纯文本判据对此无解，别指望加正则 |
| L3 | **字面量与注释不识别**：实参里带 `)` 会让配对扫描提前收口（漏判）；注释里写 `String(getSetting(...))` 会被判红（**假红**） | 假红方向尤其危险：下一个人为了消红很可能**直接删锁** | 扫描前先剥字符串/模板/正则/注释（或走 AST，天然区分） |
| L4 | **扫描域是写死的 4 个文件名**，且 `files` 数组自身无断言钉住；新增第 5 个消费点不会被守，从数组里删一行也不会变红 | 防再长出来 只对这 4 个文件成立（源码注释已写明该边界） | 扫描域改由**消费方清单**推导（例如 grep 全部 require 到 store 的服务），并加 清单只能扩大 的棘轮 |

另有两条**已实测到但不修**的精度事实：`/\bString\s*\(/g` 收窄为 `/\bString\(/g` 时 7 条正例仍全绿，但 `String (x.getSetting(K))` 会漏（不红变体）；
装配锁的 `/^get.*Object$/` 按**名称形状**取候选，命名成 `readObjectSetting` 即整条绕过。

判据仍然有效的部分（有反证现场）：历史原形与 6 类绕行写法可抓、`getSettingObject` 不误伤、把判据函数改成恒返回空会红、
窄包装转发不存在的方法会红、扩了转发不销账会红。原始 findings 已随本 PR 入仓：
`.ccg/review/qm6-frontend-roundtrip.json`、`.ccg/review/qm6-backend-roundtrip.json`、
`.ccg/review/qm6-backend-recheck-6bf7d97.json`（后两份的模型通道偏差见 §8 与本文件所在 PR 的记录）。
