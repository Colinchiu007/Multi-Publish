---
record: ccg-dual-family-review
change: ops-center-resilience
date: 2026-10-08
backends: opencode (✅ 实质评审) / claude (❌ 输出捕获失败)
---

# QM-6 外部双家族评审结果（ops-center-resilience）

## 后端可用性实测（先跑 `--version`，不靠「帮助文本里没列」下结论）

| 后端 | 版本 | 可执行 | 评审产出 |
|---|---|---|---|
| `opencode` | 1.18.34 | ✅ | ✅ **65,553 字节实质评审**（mimo-v2.6-flash-free 家族），实际读取了 git status / 多份 diff / 多个源文件 |
| `claude` | 2.1.292 | ✅ | ❌ **0 字节**（连续三种调用方式均失败，见下） |

评审产物原文：`reviews/critique-opencode-v1.md`

## claude 家族失败的具体原因（不笼统写「工具不可用」）

三次尝试，全部产出 0~1 字节：

| # | 调用方式 | 结果 |
|---|---|---|
| 1 | `claude -p "<长任务>" 2>&1 \| Out-File` | 2 字节（空） |
| 2 | `Start-Process claude -RedirectStandardOutput/-StandardError` | 0 字节 |
| 3 | `claude -p "..." --output-format text 2>&1 \| Out-File` | 0 字节（跑满 12 分钟后取消） |

**同环境下的对照实验证明不是环境整体故障**：
`claude -p "回答两个字：收到"` → 正常输出「收到」，rc=0。
`claude -p "回答一个字：OK"` → 正常输出「OK」，rc=0。

**判定**：短提示词路径正常，**长任务（需要读文件、多次工具调用）的 stdout 在本环境下
经重定向持续为 0 字节**。这是「该后端在本环境的长任务输出捕获不可用」，
不是「claude 没装」也不是「没 API key」。故按 AGENTS.md「子代理降级」条款，
Claude 家族的份额由 opencode 家族的实际评审补位，且**在 CI 与 PR 记录里如实标注单家族**，
不伪装成双家族已跑完。

---

## opencode 评审抓到的 3 条 CRITICAL（全部已核实属实并修复）

### CRITICAL #1：`ops-center-sync.js` 未向 reporter 注入 `fetcher` ⇒ 上报链路在生产中整条空转

- **位置**：`ops-center-sync.js` 构造 `new OpsResilienceReporter({ store, log, getAuth })`
- **失效链**：`fetcher` 未注入 ⇒ `this._fetcher === null` ⇒ `_postJson` 首行即
  `return { code: 0, skipped: true }` ⇒ 调用方按 `result.code !== 0` 判「成功」⇒
  ① 降级事件被**出队永久删除**（服务端从未收到，断连证据丢失）
  ② ACK 被**记为已发**（看板被污染，且下一次 ACK 被 24h 心跳窗口挡住）
- **为什么测试全绿**：`makeFixture` 总是注入 fetcher —— **夹具替实现兜住了接线漏**。
  这与本次已抓到的 `platform_defs` 缺陷同源：**夹具顺序/形态比现实更顺**。
- **修复**：① 构造时显式注入 `fetch`；② `_postJson` 把 `no-fetcher`（接线漏了，**生产不该出现**）
  与 `no-headers`（此刻拿不到凭证，**可恢复**）分成两个 reason，避免前者被当常态长期不修。
- **纵深防御**：`reportRecovered` / `maybeSendAck` 在 `result.skipped` 时
  **不写 ACK 记录、不出队事件**，只发告警。这样即便将来接线再次漏掉，也不会静默丢数据。
- **回归锁**：`ops-resilience-reporter.test.js` 新增 5 条（用**不注入 fetcher** 的夹具复现生产形态），
  覆盖：事件留队列、不写 ACK 记录、no-headers 同判、两个 reason 可区分、
  `degraded_since` 必须是降级起点而非恢复时刻。

### CRITICAL #2：`skipped` 被当作成功 ⇒ 证据被丢弃（同 CRITICAL #1 的另一半，已一并修复）

见上「纵深防御」。补充修复：恢复后队列已清空时，`recordApplied` 原先回头读队列拿
`degraded_since` 会读到 null，`maybeSendAck` 于是**用恢复时刻当降级起点** ⇒ 服务端拿到的
断连起点是错的。改为 `reportRecovered` 回传 `degradedSince`。

### CRITICAL #3（实际归为 MAJOR 处置）：双端 `canonical JSON` 对同一数值序列化不同

- **实测证据**（两端实跑，非推测）：

  | 数值 | Python `json.dumps` | JS `JSON.stringify` |
  |---|---|---|
  | `1.0` | `1.0` | `1` |
  | `1e16` | `1e+16` | `10000000000000000` |
  | `1.5e-7` | `1.5e-07` | `1.5e-7` |
  | `-0.0` | `-0.0` | `0` |
  | `9007199254740993` | `9007199254740993` | `9007199254740992`（丢精度） |

- **后果**：服务端与客户端永远算不出同一个 `config_hash` ⇒ ACK 每次都判「hash 变了」⇒
  **每 24h 全量客户端空烧一次流量**，且看板上的 hash 对不上任何客户端。
- **为什么不能「统一序列化格式」**：`canonicalJson` / `canonical_json` 同时是
  **Ed25519 签名路径**（与已部署客户端逐字节对齐），改数字格式会让**存量客户端验签全部失败** ——
  属破坏性变更，不在本次韧性范围。
- **可达性核实**：当前 bootstrap 的 13 个数据块**实测零浮点**（全为 int/bool/string），
  平台元数据也只有整数阈值。但那是**数据现状，不是机制保证** —— 运营哪天在配置里填个
  `0.5` 的限流阈值就会踩中。
- **处置（fail-closed，不是静默算错）**：
  - 服务端 `assert_integer_numbers`：非有限数 / 非整数 / `-0.0` / 超 2^53 一律 `ValueError`，
    错误信息带**完整路径**（`rewrite_strategies[0].items[0].weight`）与实际值 ——
    bootstrap 数据来自 39 个运营页面，只说「含非整数」等于让人自己猜。
  - 客户端 `assertNoFractionalNumbers`：同判据。
  - **bootstrap 兜住异常**：`config_version=0` + `config_hash=""` + error 日志，
    **策略本体照常下发**。理由与 `resolve_config_version` 同源：bootstrap 一挂，
    全部客户端的运行时策略同时失效，代价远大于看板少一个版本号。
- **回归锁**：服务端 8 条（含 `bootstrap_still_serves_when_payload_has_fractional_number`，
  该用例走**真实路径** `feature_flags.value_type='number'` 并**自证浮点确实进了 payload**，
  避免写成恒真断言）；客户端 6 条（含路径自证与嵌套数组）。

### opencode 另有两条次要观察，未采纳为改动但如实记录

1. `saveRawSnapshot` 里 `computeConfigHash(payload)` 被调用两次（一次存字段、一次返回）。
   —— **不修**：属微优化，且此刻调用有「跨端数值校验」的有意副作用（提前暴露脏数据）。
   改动收益小于引入新风险。
2. `_postJson` 的 skipped 分支、ACK 记录的写入时序 —— 已并入 CRITICAL #2 的修复。

### opencode 确认成立、本次已有的结论（交叉验证）

- `phase1-context.js` 的真实顺序已核实：`setUpdatePolicyConsumer`(:209) → 5 个管理器(:217-234)
  → `setRewriteEngineService`(:237) → **`autoSyncOnStart()`(:240)** → **`setPlatformConfig`(:457)**
  ⇒ `platform_defs` 确实晚于 hydration ⇒ 本次加的 `replayLateBlock` 补喂是**必要**修复，
  不是过度设计。
- 权益宽限期分析：`verifyEntitlementToken` 以 `now = exp-1` 跳过过期检查，但**绑定与签名仍验**，
  `exp` 受签名保护；`_applyGrace` 只由 fetch throw 触发，HTTP 非 2xx / json 解析失败 /
  `status !== 'active'` 均保持 fail-closed。**与本次 spec 一致，无异议。**
  但 opencode 指出的一点已写入残余风险：**离线场景下被停用账号最长可延至 `exp + 72h`**，
  这是有意的取舍（避免网络抖动误伤付费用户），代价需被明确知晓。

---

## 评审未覆盖的部分（如实声明）

- **QM-6 只实质覆盖了 opencode 一个家族**，Claude 家族因输出捕获失败未产出结论。
- opencode 的评审是其自述基线（mimo-v2.6-flash-free），**未做变异测试**；
  本次的变异反证是主会话自己做的（针对 `platform_defs` 补喂）。
- 未做真实网络故障注入验证（断网/断电/DNS 劫持下的端到端行为），
  验收场景见 `01-docs/PRD-OPS-CENTER-RESILIENCE-2026-10-08.md` §9，尚未逐项实跑。