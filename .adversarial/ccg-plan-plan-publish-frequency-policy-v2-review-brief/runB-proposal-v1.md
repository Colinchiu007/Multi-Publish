# 方案评审简报 v3 — 发布频率策略 v2

> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。

## 范围
- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。

## 决策
- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。
- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
- D6 未提交判据：**按提交阶段判定，不按错误类型**。发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次 + 两次放行间隔 ≥10 分钟。
- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
- D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。

## 不变量
- I1 已提交后的失败仍占窗口。
- I2 阶段判据之外一律占窗口。
- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
- I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。
- I5 release 不回滚他人窗口。
- I6 抖动不得减少等待。
- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。

## 数据校验
env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。

## 交互
- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
- 未提交失败：「未提交到平台，可立即重试」。
- 已提交失败：「已提交，需等待约 N 分钟」。
- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。

## 测试与变异
单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。

## 明确拒绝项（附证据）
- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。

## 已知限制
审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
