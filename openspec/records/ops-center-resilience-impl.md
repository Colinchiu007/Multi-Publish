---
record: ops-center-resilience-impl
task: 运营中心远程化韧性落地（三层降级 / 权益宽限期 / 配置生效验证），实现 PR
date: 2026-10-08
sync_reason: PR #3126 已开、CI 未完成，此时写 PENDING 是正确状态；合并后在**同一次提交**里改写为 PASS + merge SHA 并删除本登记项（回填与销账必须同一次发生）
sync_backfill_owner: agent（PR #3126 自动合并后回填）
---

## 本次执行记录：运营中心远程化韧性落地（ops-center-resilience-impl，2026-10-08）

对应 openspec change：`openspec/changes/ops-center-resilience/`（跨端契约见 `design.md`）
PRD：`01-docs/PRD-OPS-CENTER-RESILIENCE-2026-10-08.md`
架构方案（前置文档，本次落地其 §4/§5/§6）：`01-docs/ARCH-OPS-CENTER-RESILIENCE-2026-10-06.md`

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离声明 | PASS | 运行时代码变更（apps/ + packages 无 + ops-center/ + .github/ + scripts/）⇒ **混合 PR**，不走 docs-only 快速通道。在隔离 worktree `D:\Data\projects\mp-worktrees\mp-ops-center-resilience-impl`（分支 `ops-center-resilience-impl`，D 盘非 C 盘）内开发，共享主工作区全程 main clean |
| QM-1 打包 | PASS | 见下方「QM-1 取证」小节：**种子确实进入 app.asar**，且打包产物启动日志实证 `runtime-hydrated-from-seed {"tier":"L3"}` 与 `platform-defs-replayed-late` |
| QM-2 代码必检 | PASS | `vitest run electron/`：**9191 项，0 失败**（含既有 `ops-center-sync.test.js` 75 项、`identity/` 13 文件 218 项全绿）；`pytest`：**541 项全绿**（含 QM-6 新增的跨端数值防护用例） |
| QM-3 TDD | PASS | 全部新模块测试先于实现；种子门禁 17 项、韧性测试 47 项、客户端 170 项均为新增 |
| QM-4 视觉 | N/A | 本次无 UI 变更（用户可见文案已在 PRD §6.3 定义，UI 接线列入范围外） |
| QM-5 Bug 反思 | PASS | 本次实施过程中**实测抓到 5 个真缺陷**（3 条来自自查/worker 独立报告，2 条来自 QM-6 外部评审），全部已修 + 回归锁，见下方「实施中实测抓到的缺陷」 |
| QM-6 双模型外部评审 | PASS（单家族实质） | **opencode 家族产出 65KB 实质评审，抓到 3 条 CRITICAL 全部核实属实并修复**；claude 家族输出捕获失败（3 种调用方式均 0 字节），已按「子代理降级」条款如实标注，详见 `openspec/changes/ops-center-resilience/reviews/ccg-dual-family-review.md` |
| 变异反证 | PASS | 见下方「变异反证」小节 |
| 远程同步 | PENDING | 待合并后回填（合并与回填必须同一次提交，另见 AGENTS.md 回填/销账规则） |

---

## CI 首轮抓到的两个问题（本地全绿，CI 才暴露）

| 门禁 | 症状 | 根因 | 处置 |
|---|---|---|---|
| Gate 12b 文本编码完整性 | `fail 3` | 两处**刻意的 U+FFFD 测试夹具**（种子门禁要表达「文件含 U+FFFD 就失败」）+ 一处真损坏（追加测试时引入） | 判据改用 `String.fromCharCode(0xfffd)` 表达同一语义 —— **源码层面是 ASCII，运行时展开成真替换字符**。写字面量会让这条判据永远红，逼人加豁免（等于自己关掉校验）或直接删判据（更糟） |
| 债务熔断（max-lines） | `NEW_OVER_LIMIT` × 2 | `ops-resilience-reporter.js` 503 行、`runtime_service.py` 540 行（CI 按 **LF** 计，本地 PowerShell 口径是 473/457，差在 CRLF） | 按仓库既有 mixin/composable 范式拆分：`ops-resilience-protocol.js`（载荷构造/校验/鉴权解析）与 `config_fingerprint.py`（hash 计算 + 数值校验）。**未抬基线绕过** |

> **口径差异值得记一笔**：本地用 PowerShell `Get-Content | Measure-Object -Line` 数出的是**逻辑行**，
> CI 按 LF 字符计数。CRLF 文件两者差一条，所以「本地刚好 499 行」不等于「CI 通过」。
> 判超限时**一律以 CI 的 LF 口径为准**。

---

## QM-1 取证（打包实证）

```
命令：node scripts/verify-worktree-deps.js            → OK（11 个 workspace 解析通过）
     pnpm exec electron-builder --win --dir --publish never

产物：apps/desktop/dist-electron/win-unpacked/resources/app.asar（145,426,739 字节）

asar 清单（关键条目）：
  \electron\services\ops-runtime-snapshot.js
  \electron\services\ops-resilience-reporter.js
  \resources\ops-seed\runtime-bootstrap.json      ← L3 种子确实进包

asar 内测试文件数：0
check-asar-test-files.js：OK（config + 命名反查 1109 个打包域 .test. 文件 + extraResources + 接线维度）

启动冒烟（12 秒存活，进程 pid 存活=True）：
  [NOTIFY] OpsCenterSync runtime-hydrated-from-seed {"tier":"L3","source":"...","staleDays":0}
  [NOTIFY] OpsCenterSync platform-defs-replayed-late {"applied":0}
```

**AGENTS.md 点名的致命模式一个都未出现**：无 `Failed to load platform config`、无
`PluginLoader.*mkdir failed`、无 `ENOTDIR.*app.asar`、无配置/插件路径指向 ASAR 内部。

**如实记录的启动期非致命告警**（均与本次改动无关，附归因）：
- `PythonBridge spawn python ENOENT` —— 本机 PATH 无 `python` 命令，环境问题。
- `CallbackServer EADDRINUSE :16521` —— 端口被占（另一实例），环境问题。
- `main-window-load-failed ERR_FILE_NOT_FOUND .../app.asar/dist/index.html` ——
  **归因：本次只跑了 `electron-builder --dir`，未先跑 `pnpm run build:vue` 生成渲染层产物**，
  实测 `apps/desktop/dist/index.html` 不存在。故 QM-1 覆盖「主进程启动 + 服务注册 + L3 数据源加载」，
  **未覆盖「渲染层界面呈现」**；后者需在带 `build:vue` 的完整打包下复验，本次未做。

---

## 实施中实测抓到的缺陷（QM-5 素材，共 5 条）

前 3 条来自自查与被委派 worker 的独立报告，后 2 条来自 **QM-6 外部评审**（opencode 家族）。
值得注意的是：缺陷 3 与缺陷 4 **是同一类错误的不同实例** —— 都是「夹具比生产更顺，
替实现兜住了问题」，这本身就是本 change 最值得记的一条教训。

### 缺陷 1：种子文件压根不会进安装包（会让 L3 兜底层变成空壳）

- **表现**：种子放在 `apps/desktop/resources/ops-seed/`，但 `electron-builder` 的
  `build.files` 只含 `dist/**`、`electron/**`、`node_modules/**`、`package.json`
  ⇒ 打包产物里没有种子，L3 恒缺失，功能不崩但兜底层是空的。
- **怎么发现的**：**两个独立来源**。① 我在核对 `resolveSeedPaths()` 的路径解析时对照
  `build.files` 发现；② 被委派的 worker 在交付报告里独立报出同一条（它也查了打包配置）。
- **修复**：`build.files` 增加 `"resources/**/*"`。
- **为什么测试测不出来**：单元测试只验证读取端能解析种子，**不验证种子是否真的被收集进产物**
  —— 这类「声明了但没生效」的问题只有真产物能证明（同 check-asar-test-files.js 的 `--asar` 维度）。
- **回归锁**：QM-1 打包实证（上文 asar 清单）已把它钉住。

### 缺陷 2：种子类型表「照文档想当然」，3 个块标错（被导出自检当场拦下）

- **表现**：`SEED_BLOCK_TYPES` 首版把 `contentCategories` 标成 `'array'`、
  `appMenu` 标成 `'object'`、`rewrite_hard_constraints` 标成 `'object'`（不容 null）。
- **实际形态**：`contentCategories` 服务端 `get_bootstrap_content_categories` 返回
  **`{items, count, synced_at}` 对象**；`appMenu` 客户端 `normalizeAppMenu` 要求
  **`{items:[...]}` 对象**；`rewrite_hard_constraints` 服务端 `get_default_runtime` **可为 None**。
- **怎么发现的**：`scripts/export-ops-seed.js` 的导出自检**第一次运行就失败**，
  报 `SEED_BLOCK_TYPE` 三条。
- **为什么测试测不出来**：没有「用真实服务端形态跑一遍导出」的测试；
  单元测试用的夹具是**自己编的**，与真实下发形态不同构 —— 与缺陷 3 同源。
- **修复**：逐条对着 `ops-center-sync.js` 的 `applyRuntime` 真实判定改正，并新增
  `'array-or-object'` 形态（`contentCategories` 的归一化同时接受裸数组与 `{items}`）。
- **回归锁**：`check-ops-seed.test.js` 对 13 项类型表**整表 `toEqual` 硬断言** + 三种形态各一例。

### 缺陷 3：`platform_defs` 恢复不回来（夹具顺序与生产顺序不同构）

- **表现**：6 类数据里，`platform_defs`（平台字数/封面尺寸）在 L2/L3 恢复时**注入器仍是 null**，
  恢复静默失效。症状与「压根没做持久化」完全一样，极难归因。
- **第一性原因**：`setPlatformConfig` 在 `bootstrap/phase1-context.js:457`，
  而 L2/L3 水合跑在 `autoSyncOnStart()`（`:240`）开头 —— **注入器比水合晚 217 行到达**。
- **逃逸分析**：既有接线用例把 6 个管理器**全部接在水合之前**才调用恢复，
  那是**夹具顺序不是生产顺序**。这正是 AGENTS.md 记过的「测试断言不得反向固化错误行为」
  与「夹具不得替对方剥壳」的另一种形态 —— 夹具比现实更顺，于是替实现兜住了缺陷。
- **修复**：不去调 phase1 的调用顺序（顺序依赖是隐式契约，下次插桩就会静默打翻），
  改为**保留重放 payload + 注入器晚到时补喂**（`replayLateBlock`，对顺序不敏感）。
- **回归锁**：新增用例**按生产顺序**复现（先 5 个早到管理器 → 水合 → 再注入 platformConfig）。

### 缺陷 4（QM-6 外部评审抓到）：上报链路在生产中整条空转

- **表现**：`ops-center-sync.js` 构造 `OpsResilienceReporter` 时**没传 `fetcher`** ⇒
  `_postJson` 首行即返回 `{code:0, skipped:true}` ⇒ 调用方按 `result.code !== 0` 判「成功」
  ⇒ **降级事件被出队永久删除、ACK 被记为「已发」**。本 change 的核心目标
  （让运营知道断连与生效情况）在生产中**完全失效**，且不留任何错误。
- **谁发现的**：opencode 家族外部评审（独立来源，非自查）。
- **为什么自查没抓到**：测试夹具 `makeFixture` **总是注入 fetcher**，
  「夹具替实现兜住了接线漏」。这与缺陷 3（夹具顺序比现实更顺）**是同一类错误的两个实例**——
  单元测试验的是「模块能用」，不是「生产接线正确」。
- **修复**（三层）：
  1. 构造时显式注入 `fetch`；
  2. `_postJson` 区分 `no-fetcher`（接线漏了，生产不该出现）与 `no-headers`（此刻无凭证，可恢复），
     避免前者被当常态长期不修；
  3. **纵深防御**：`reportRecovered` / `maybeSendAck` 遇 `skipped` 时**不写 ACK 记录、不出队事件**，
     只发告警 —— 将来接线再漏一次也不会静默丢数据。
- **附带修**：`reportRecovered` 成功后队列已清空，`recordApplied` 原先回头读队列拿
  `degraded_since` 会得到 null，`maybeSendAck` 于是**用恢复时刻当降级起点** ⇒ 服务端拿到的
  断连起点是错的。改为 `reportRecovered` 回传 `degradedSince`。
- **回归锁**：`ops-resilience-reporter.test.js` 新增 5 条，**用不注入 fetcher 的夹具复现生产形态**。

### 缺陷 5（QM-6 外部评审抓到）：跨端 canonical JSON 对同一数值序列化不同

- **实测证据**（两端实跑，非推测）：

  | 数值 | Python `json.dumps` | JS `JSON.stringify` |
  |---|---|---|
  | `1.0` | `1.0` | `1` |
  | `1e16` | `1e+16` | `10000000000000000` |
  | `1.5e-7` | `1.5e-07` | `1.5e-7` |
  | `-0.0` | `-0.0` | `0` |
  | `9007199254740993` | `9007199254740993` | `9007199254740992`（丢精度） |

- **后果**：两端永远算不出同一个 `config_hash` ⇒ ACK 每次都判「hash 变了」⇒
  **每 24h 全量客户端空烧流量**，且看板 hash 对不上任何客户端。
- **为什么不能「统一序列化格式」**：`canonicalJson` / `canonical_json` 同时是
  **Ed25519 签名路径**，改数字格式会让**存量客户端验签全部失败** ⇒ 属破坏性变更，
  不在韧性范围。
- **可达性核实**：当前 bootstrap 13 块**实测零浮点**（全 int/bool/string），
  平台元数据只有整数阈值。但那是**数据现状不是机制保证** —— 运营哪天填个 `0.5` 的阈值就会踩中。
- **处置**：两端 **fail-closed** —— 非有限数 / 非整数 / `-0.0` / 超 2^53 一律拒绝，
  错误信息带**完整路径**（`rewrite_strategies[0].items[0].weight`）与实际值
  （数据来自 39 个运营页面，只说「含非整数」等于让人自己猜）。
  bootstrap **兜住异常**：`config_version=0` + `config_hash=""` + error 日志，**策略本体照常下发**
  （bootstrap 一挂，全部客户端策略同时失效，代价远大于看板少个版本号）。
- **踩坑记录**：第一版判据用 `value.is_integer()`，被测试打脸 —— `1e16.is_integer()` 与
  `(-0.0).is_integer()` **都是 True**（值确实是整数），但序列化文本仍不同。
  正确判据是「**序列化文本是否与 JS 一致**」。
- **回归锁**：服务端 14 条、客户端 6 条。其中 bootstrap 降级用例走**真实路径**
  （`feature_flags.value_type='number'` 使 `typed_value` 产出真 float）并**自证浮点确实进了 payload**，
  避免写成恒真断言 —— 我第一版就是用 `UPDATE` 塞字符串 `"0.5"`，SQLite 根本不存浮点，
  测试「通过」了但什么都没测到。

---

## 变异反证（证明新测试真的锁得住，而不是恒真）

对缺陷 3 的修复做反向变异，验证测试会红：

| 变异 | 预期 | 实测 |
|---|---|---|
| 摘掉 `setPlatformConfig` 的晚到补喂 | 新增回归用例变红，其余保持绿 | **1 failed / 10 passed**，失败项恰为「注入器晚于水合到达时仍能补喂」，其余 10 项全绿 ✅ |

变异后已恢复，源文件逐字节还原，无残留备份文件。

> 反证过程中还暴露了**变异注入本身没生效**（PowerShell `[IO.File]::WriteAllLines` 写回未落盘，
> 测试「全绿」是假象）。改用 `edit` 工具做确定性变异后重跑才拿到上表结果。
> 记在这里是因为「变异没注入却看到全绿」和「测试没锁住」在输出上长得一模一样。

---

## 跨端契约固定向量（防漂移）

`compute_config_hash` 的 Python 与 JS 两份实现用**同一批固定向量**互相锚定，
任一端改算法或改字段名，两端同时红：

| 输入 | hash |
|---|---|
| `{}`（13 块全缺失，以 null 参与） | `29f1096e3e93eaaf` |
| `{announcements: []}` | `f30e01b53ec6b839` |
| `{announcements: [{title: '公告'}]}` | `fdbebf95ae223dfe` |

- Python 侧：`ops-center/backend/tests/test_runtime_resilience_api.py::test_config_hash_pinned_vectors`
- JS 侧：`apps/desktop/electron/services/ops-runtime-snapshot.test.js`（独立 describe，注释标注同源）

除固定向量外，另锁两条最容易写错的约束：
① `synced_at` / `config_version` / `config_hash` / `signature` 任一变化，hash **不得**变
   （纳入 `synced_at` 会导致每次请求 hash 都变 → 客户端每次都发 ACK → 推送地狱）；
② 缺失键与显式 `null` 必须产生相同 hash（否则「删除一个数据块」与「该键本来不存在」不可区分）。

---

## 已做 / 未做边界

**本 change 落地**：三层降级（L2 完整 payload 快照 + L3 打包种子 + CI 校验）、
权益宽限期、降级遥测队列与补报、config_version/hash + 客户端 ACK + 服务端生效聚合。

**明确不在本 change（已列入部署清单，须逐项勾掉）**：

| 项 | 原因 |
|---|---|
| 看板前端（V-4）、未确认明细下钻（V-6） | UI 工作，本次只交付数据通路与契约 |
| 外部探针（A-5）、告警 Webhook（A-6） | 基础设施配置，非代码。**运营中心自身宕机的告警绝不能依赖运营中心自己** |
| `config_audit_log` 写入点补全（V-5） | 需覆盖 39 个运营页面，回归面独立 |
| 墓碑补传（D-6）、零配置限流自检（D-7） | 独立缺陷，另开 change |

**用户可见文案**已在 PRD §6.3 定义完整 i18n key 表（zh/en 成对），但**本 change 未接入 UI** ——
`getRuntimeState()` 的 IPC 契约刻意未加字段，避免动既有契约。UI 接线列入后续。

---

## 残余风险（如实列，不假装已闭合）

1. **信任锚**：打包版未配置自定义 Ed25519 公钥时，运行时策略**全部拒绝**
   （`NO_PRODUCTION_TRUST_ANCHOR`）。这是既有设计，但**部署前必须做**，否则本 change 的
   L1/L2/L3 全部拿不到数据。PRD §10 部署清单第 1 项。
2. **L3 种子当前是占位**：`config_version=0`、`source` 标注「发版前须用 --url 从生产运营中心重新导出」。
   结构与校验都成立，但里面的值还不是生产的最终版配置。
3. **`resolve_config_version` 每次 bootstrap 都写库**：并发下靠 `uq_runtime_config_version_hash`
   兜底，异常一律降级返回 0 并告警（不抛，否则整个 bootstrap 挂掉、所有客户端策略同时失效）。
   高频轮询场景下的写放大未做实测。
4. **`/api/v1/me/*` 生产归属未定**：代码指向 `auth.iart.work`，与运营中心 `ops.iart.work` 是两台主机。
   会员通道的部署形态需在部署前实测确认（架构方案风险 R1）。
5. **种子进包的其余字段未做白名单审计**：本 change 只硬拦了 `content_policy.word_list`。
   是否还有别的字段不该进包，取决于生产 bootstrap 的实际内容，需在首次真实导出后复核。