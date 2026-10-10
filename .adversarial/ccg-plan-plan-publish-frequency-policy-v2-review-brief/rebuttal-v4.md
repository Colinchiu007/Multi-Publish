# Rebuttal v4 — 对 run C critique-v1 的逐条回应

- 被评方案：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md` v4
- 评审：`critique-v1.md`（5 条：Critical **0** / Warning 3 / Info 2，最低维度分 6）
- 引擎裁决：**cleared**（首轮即无 Critical、无未解决 High ⇒ 放行，rc=0）

---

## i1 Warning · consistency · 「平台档与 `platform:*` 键在默认配置下失效」

**裁决：指控不成立（dismissed，L1 反例）。**

评审的推理是「账号档 20/10/3 ≥ 平台档 2 ⇒ `max(账号档, 平台档)` 恒等于账号档 ⇒ 平台档从不生效」。**这个推理只对「同一账号」成立，对评审要论证的「同平台多账号」不成立**：

- **同账号**再发布：账号键 `platform:acc1` 与平台键 `platform:*` 都有历史。账号档 20/10/3 分钟 > 2 分钟 ⇒ 账号档决定 ⇒ 平台档确实不改变结果。**这是正确行为**，不是失效。
- **同平台换账号**：账号键 `platform:acc2` **无历史** ⇒ `accountRemaining = 0`；平台键 `platform:*` 有历史 ⇒ `platformRemaining = 2 分钟` ⇒ `max(0, 2分钟) = 2 分钟` ⇒ **平台档正是在这个场景生效**，而这正是它唯一被设计来管的场景（跨账号）。
- **结论**：平台档并非「从不生效」，而是「只在跨账号时生效」——这与 D1 的 key 归属（间隔写两键、日配额只写账号键）完全自洽。

**但评审的困惑本身是文档缺陷的证据**（同一处两个场景没写清）⇒ **部分采纳**：在 D1 后补「两档何时绑定」的显式说明（同账号：账号档胜；跨账号：平台档胜），并在 PRD §5 同处补写。

## i2 Warning · security · 漏接线时失败路径无告警 ⇒ I1 可能失效

**裁决：指控成立（upheld）。这是本轮最有价值的一条。**

- 反例（L1）：若某传输层从未调用 `markSubmitAttempted()`，则 `submitAttempted` 恒为 `false` ⇒ 「已提交但失败」被判为可回滚 ⇒ **I1 被违反**（危险侧：早于窗口的重复发布）。而 I4 只自证**成功**路径的 `submittedAt`，对**失败**路径完全静默。
- 修正（新增 I9 + 失败路径探针）：
  1. **失败路径计数**：任务失败且 `submitAttempted === false` 时，递增「疑似漏接线失败」计数（按平台维度，设置页可见）。
  2. **矛盾检测（fail-closed）**：同一平台若**成功路径已证明会调 `markSubmitted`**（即曾出现过成功且 `submittedAt !== null`），却持续出现 `submitAttempted === false` 的失败 ⇒ 判定为**接线矛盾** ⇒ `log.error` + **对该平台临时停用回滚**（直到应用重启或用户在设置页确认），即回到「一律占窗口」的旧行为。
  3. **结构锁**：枚举并断言发布传输层的 `markSubmitAttempted` 调用点（与 D5 的 prev 处理同法），新增传输层必须登记。
- 这条把评审指出的「失败路径静默」变成**两路可观测 + 一条自动降级**。

## i3 Warning · completeness · `_quotaBlocked` 与次日定时器为内存态，重启恢复未说明

**裁决：指控部分成立（upheld 于「未写明」，dismissed 于「会永久卡住」）。**

- **dismissed（L2 依据）**：`_quotaBlocked` 与定时器是内存态，但**配额计数是持久化的**（`publish_daily_count`）。重启后任务以 `pending` 持久化恢复，`_processNext` 重新调 `check()`，`check()` 从持久表读 `count` 与 `day_key` ⇒ 仍超限则**重新入 `_quotaBlocked` 并重新武装定时器**。不存在「永久卡在 daily 阻塞」（次日 `day_key` 变化即放行），也不存在「定时器丢失后不再复位」（每次 `check()` 都是重新武装点）。
- **upheld**：v4 简报未写明这条链路 ⇒ 补明文，并把 `A15` 拆成两条可执行用例：① 重启后窗口仍生效；② 配额被拒任务重启后**重新武装定时器**且不忙循环。

## i4 Info · clarity · `platform:*` 与 `buildKey` 的 percent-encode 规则冲突

**裁决：指控成立（upheld）。** 修正：显式规定 `buildKey(platform, null)` 返回 `` `${encodeURIComponent(platform)}:*` `` —— 哨兵 `*` **不参与 percent-encode**，由函数以字面量追加；平台段仍编码。这样既满足 I8（禁止裸拼接），又不产生 `%2A` 与 `*` 两种形态的键分裂。补一条断言：`buildKey('weibo', null) === 'weibo:*'`、`buildKey('weibo', 'a:b') === 'weibo:a%3Ab'`。

## i5 Info · consistency · 未登记平台的平台档标 2 分钟「无意义」

**裁决：同 i1（dismissed），采纳措辞修正。** 未登记平台行的平台档同样**只在跨账号时绑定**；表格改为标注「平台档（跨账号时生效）」，消除误导。
