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

- **消费侧唯一入口**：`store.getSettingObject(key, defaultValue)`。内含对象判据、JSON 文本兼容、损坏行回落调用方默认、`_ready=false` 回落。**禁止**再写 `String(getSetting(...)) + JSON.parse`。
- **写入侧传对象**：`setSetting(key, cfg)`。因为 `safeJsonStringify` 对对象做 `JSON.stringify`、对字符串原样透传，**落盘字节与修复前逐字相同** ⇒ 零迁移、零格式变更、旧行照样读得回。
- **回滚必须整体**：只回滚读侧或只回滚写侧会重新制造不对称。

覆盖的恢复路径（本 PR 收敛的 12 处）：`ops-center-sync.js` 的 `getConfig` / `_readEncryptedKey` / `_getManualUrl` / `_getStoredKeyEnc` / `_getRuntimePublicKey` / `_loadRuntimeState`（应用菜单、公告、功能开关、发布管线选项、内容类别）与 `opsCenterSync`/`opsCenterRuntime` 的三处写入；`diagnostics-reporter.js`、`publish-reporter.js`、`usage-reporter.js` 各自的水位线读写对。

## 3. 回归锁与夹具纪律

- **绝对下界是真实存储**：`apps/desktop/electron/services/settings-roundtrip-contract.test.js` 用真 `Store`（sql.js，库文件落在 `os.tmpdir()` 下带 pid+随机后缀的独立目录），**关闭并重新打开同一份文件**模拟重启，断言 `save → 重开实例 → read` 等价。
- **夹具必须同形**：历史逃逸的直接原因是 `ops-center-sync.test.js` 的 `makeStore` 写作 `getSetting: () => data / setSetting: (_k, v) => { data = v }`，即"存进去什么类型就返回什么类型"，与被测契约（字符串进、对象出）**不同形**，使 68 条用例对该缺陷结构性免疫。现夹具改为落文本、读解析值。
- 断言"重启后恢复"必须能在**实现退回误判写法**时变红——见下表 M2。

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

## 6. 已知重复项（不在本 PR 收敛）

`apps/desktop/electron/services/hot-topics-service.js` 的 157/185/360 行各有一份 `typeof raw === 'string' ? JSON.parse(raw) : raw`。它们**行为正确**，因此不是缺陷；但它们是同一判据的第二、三、四份拷贝，属应收敛对象。不在本 PR 收敛的原因：该服务的注入物是 `apps/desktop/electron/core/container.setup.js` 的窄包装（只转发 `getSetting`/`setSetting`），要走存储侧唯一实现必须先扩那层转发——那是跨装配面的独立切片，混进 bugfix 会把半径放大。后续收敛时**必须先删这三份**，否则"两份实现漂移"的原始病灶仍在。

## 7. 本机运营中心配置现场（2026-10-05 实测）

三段配置此前均缺失，桌面端因此从未成功同步：

1. `ops-center/backend/.env` 缺 `OPS_CATALOG_API_KEY` 与 `OPS_RUNTIME_SIGNING_PRIVATE_KEY`；`routers/runtime.py` 是"私钥未配置即 404 fail-closed"。现已补 `OPS_CATALOG_API_KEY` + `OPS_RUNTIME_SIGNING_KEY_PATH`（私钥文件位于仓库外 `%LOCALAPPDATA%\Mulpub\ops-center-dev\`，不入 git、不入对话）。
2. 后端此前未运行；重启后实测监听 `LocalAddress=127.0.0.1`（非 0.0.0.0，登录面未暴露到局域网）。`GET /api/v1/runtime/bootstrap` 错 Key=401、对 Key=200 且带 `signature`。
3. `config/identity-public.json:22` 的 `opsCenterUrl` 指向 `https://ops.iart.work`，而该域名 **DNS 不解析**（对照组：`github.com`、主域 `iart.work`→39.105.42.85 均正常解析）。即运营中心的生产部署（task #19）尚未发生，应用启动同步必然 `fetch failed`。

因此本机的可用形态是"本地运营中心 + 手动配置"；一旦 ECS 部署完成，应删除那行手动的 `opsCenterSync` 配置，让应用回落到 identity 自动发现，而不是把用户桌面端钉在某台开发机的 8010 上。

**部署前置条件（不可省略）**：打包态不吃内置 DEV 公钥——`runtime-trust-anchor.js` 在无自定义锚时返回 `NO_PRODUCTION_TRUST_ANCHOR` 并令整份运行时策略不生效。故生产必须自造 Ed25519 密钥对、私钥进服务端、公钥作为 `runtimePublicKey` 交客户端。另需纠正一处文档漂移：`ops-center-sync.js` 与 `runtime-trust-anchor.js` 的注释称 DEV 私钥"在 `.env.example` 标注"，实际 `.env.example` 已不含 PEM（`ops-center/backend/tests/test_p0_security.py` 明确禁止），那把私钥现存在于 `ops-center/backend/tests/conftest.py`。
