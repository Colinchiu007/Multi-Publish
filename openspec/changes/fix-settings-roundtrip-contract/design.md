## Context

动机见 `proposal.md - Why`；行为规范见 `specs/desktop/settings-persistence/spec.md`。这里只记录影响技术方案的两处现状事实：

1. `settings-store.js` 的 `getSetting` 已经返回**解析后的值**（`safeJsonParse(row.value, row.value)`），而 `setSetting` 的 `safeJsonStringify` 对字符串**原样返回**、对对象做 `JSON.stringify`。因此「写对象」与「写 `JSON.stringify(对象)`」落盘字节完全相同，`getSetting` 读回的也都是对象——**真实存储的往返契约本来就是类型对称的**，坏的是 9 个消费点对它的误判。
2. 该缺陷的探测器（`ops-center-sync.test.js` 的 `makeStore`）自己实现了另一套契约（存的类型原样回吐），因此 68 条用例对该缺陷结构性免疫；改动前实测 4 文件 90 passed。

约束：本仓 `apps/desktop/**` 下的 `*.test.js` 由 vitest workspace 自动收集并进 CI，而 `scripts/`、`.github/scripts/` 下的测试必须逐个显式点名接线——回归锁的落点选择受此约束。文件系统类测试禁止把可写状态落在仓库内共享路径（并发会话竞争）。

## Goals / Non-Goals

**Goals:**

- 使「读回恒为空」这一类缺陷在**单元层**就可表示（夹具同形），并有一条走真实存储的往返锁作为绝对下界。
- 归一化判据收敛为**一处实现**，消费点不得各写一份。
- 修复过程零数据迁移、零落盘格式变化、零 IPC 契约变化。

**Non-Goals:**

- 不改 `getSetting`/`setSetting` 对**其它**既有消费方的语义（它们已按对象使用，工作正常）。
- 不重构运营同步链路本身（通道解耦、广播、验签信任锚均不动）。
- 不处理「运营中心未部署」这一半问题（属 task #19 部署域，另议）。
- 不顺手清理 `src/composables/useOpsCenterSync.js` 的无消费者状态（撤 UI 的产品后果，需单独决策）。

## Decisions

### D1：归一化落在存储侧新方法 `getSettingObject(key, defaultValue)`，而不是消费者侧工具函数

在 `settings-store.js` 增一个与 `getSetting` 并列的方法，内部完成「读值 → 对象判据 → 兜底」，9 个消费点一律改为 `this._store.getSettingObject(KEY, {})`。

- **为什么不选「在 `store-schema.js` 放一个 `toStoredObject(value)` 自由函数」**：那样每个消费点仍要自己决定「先 getSetting 再转换」，两步里漏一步就复发；且判据与 `_ready` 语义分家（`getSetting` 在未就绪时返回 `defaultValue`，这层知识只有 store 自己清楚）。
- **为什么不选「直接让消费方用 `getSetting` 返回值、不加新方法」**：`getSetting` 对「值是合法 JSON 但语义是字符串」「行损坏」两类输入分别返回字符串与原样文本，消费点若各自判类型，就是把 9 份剥壳逻辑换成 9 份类型分支——正是 AGENTS.md 禁止的「两份实现必然漂移」。
- **代价**：store 多一个 API。可接受——它是契约的一部分，且 `getUserSetting` 已有同族先例。

### D2：写入侧改为直接传对象

`setSetting(KEY, cfg)` 取代 `setSetting(KEY, JSON.stringify(cfg))`。落盘字节逐字不变（见 Context 第 1 条），因此存量行无需迁移，且回滚不需要数据恢复。

- **备选**：保持写入侧 `JSON.stringify` 不变、只改读侧。否决理由：读侧一旦按对象消费，写侧再 stringify 就成了「靠 `safeJsonStringify` 恰好透传字符串」的隐式巧合，下一位改成写对象会多套一层引号——把正确性押在一个函数的分支行为上。

### D3：夹具必须改成与真实存储同形，旧用例不得改期望

`makeStore` 改为「`setSetting(k, v)` 按 `safeJsonStringify` 语义存字符串、`getSetting(k)` 按 `safeJsonParse` 语义返回解析值」。68 条既有用例只允许因新 API 名而调整调用形状，**不得放宽断言**。

- 验收判据：夹具同形 + 实现未修时，恢复类用例必须变红；实现修好后全绿。若同形化后旧用例仍全绿而真实存储锁红，说明夹具仍不同形——以真实存储锁为最终裁决。

### D4：回归锁文件放 `apps/desktop/electron/services/`，用真实 `Store`

新增 `apps/desktop/electron/services/settings-roundtrip-contract.test.js`，用真 `Store`（sql.js）+ 真服务实例，覆盖四条恢复路径（`opsCenterSync` 配置、`opsCenterRuntime` 含 appMenu、三个 watermark）。库文件落在 `os.tmpdir()` 下带随机后缀的独立目录。

- **为什么放这里**：`apps/desktop/**` 由 vitest workspace 自动收集并进 CI；若放 `scripts/` 则必须同 PR 往 `quality-gate.yml` 点名，否则是一条永不执行的死锁（本仓有实测先例）。
- **需要的注入接缝**：`base-store.js:11` 在模块加载期 `require('electron')` 取 `app.getPath('userData')`，测试须经 mock 把 userData 指向临时目录——这是**接缝**，不是对被测逻辑的 mock（被测的是 store 与服务的往返，两者均用真实实现）。

### D5：反证（变异）逐条实跑并记录命中用例名

① 把 `getSettingObject` 的对象分支摘掉（只走字符串分支）→ 真实存储锁必须红；② 把夹具退回「原样回吐」→ 真实存储锁仍红（证明该锁不依赖夹具形状）；③ 把某条服务的写入动作改成 no-op → 对应恢复用例红；④ 把 `_loadRuntimeState` 的 appMenu 恢复改为恒 null → 侧边栏恢复用例红。每条变异还原后按字节比对确认无残留。

## Risks / Trade-offs

- **[Risk] 修好后运营配置第一次真正生效，运营侧的错误配置会从「看不见」变成「看得见」** → 缓解：fail-open 语义保持不变（无该键 → 内置默认），并在本机以当前 20 行真实配置验收渲染结果；这也是保留本机 `opsCenterSync` 行作为验收现场的理由。
- **[Risk] 与并发分支 `automation-content-category` 同改 `ops-center-sync.js`，对方在 `_loadRuntimeState` 里新增一行 `contentCategories`** → 缓解：本 PR 改的是该函数的**读取表达式**，对方改的是**字段投影**，合并后必须重跑对方新增用例（`contentCategories` 恢复路径同样受本契约保护，属交叉受益而非冲突）。
- **[Risk] 真实存储测试撞上 Windows 长路径 / 文件句柄占用（本仓已知两类坑）** → 缓解：临时目录带随机后缀 + `afterEach` 显式 `close()`；不引入仓库内路径；若 CI 出现仅 runner 侧的维度差异，按「可配置维度必须本机复现」处理，不得登记成欠账。
- **[Trade-off] store 多一个读取 API**，换来「误判契约」在调用点上不可表示。

## Migration Plan

1. 先落夹具同形（D3）与真实存储锁（D4），此时新锁应**红**（这是 Bug 探针，不是防回归锁）。
2. 再落 D1/D2 实现，转绿。
3. 回滚：整体 revert 本 PR。MUST NOT 单独回滚读侧或写侧——只回滚一侧会重新制造类型不对称。无数据回滚需求（落盘格式未变）。
