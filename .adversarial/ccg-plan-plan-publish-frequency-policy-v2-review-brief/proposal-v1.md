# 方案评审简报 v4 — 发布频率策略 v2

> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。已并入 run A / run B 两轮评审的**全部**采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md` / `rebuttal-v3.md`。v4 = v3（已 cleared）+ run B critique-v2 的 8 条修正。

## 范围
- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
- P2-5 拆分：本期只改 `config/platforms.yaml` 注释；`publish:wechat` 的 accountId 改动移出（已审计：渲染层零生产调用方）。
- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。

## 决策
- D1 数值与档位映射：

| tier | 平台 | 账号档 | 平台档 | 日配额 |
|---|---|---|---|---|
| `long` | wechat_mp/zhihu/baijiahao/toutiao | 20 min | 2 min | 3 |
| `clip` | douyin/kuaishou/tencent_video/xiaohongshu/bilibili/youtube/tiktok/instagram/facebook | 10 min | 2 min | 5 |
| `short` | weibo/twitter | 3 min | 2 min | 20 |
| 未登记 | 任意 | 20 min | 2 min | 3 |

  平台档**默认开 2 分钟**，仅显式 `0` 关闭（与日配额 `0` 同义）。合并公式：`remaining = max(账号档, 平台档)`；日配额为**独立否决项**；同时命中时 `bucket='daily'`。key 归属：间隔 → `platform:accountId` **与** `platform:*` 两键同写；日配额 → **仅** `platform:accountId`。
- D2 抖动：`wait = remaining × (1 + 0.4×rand)`，`rand∈[0,1)`，只增不减；`ratio=0` 严格退化旧值。
- D3 日界：**本机运营日** `YYYY-MM-DD`，注入 `today()`；不与平台日界换算、不声称等价。**次日定时器截止时间由同一注入时钟（`now()`）推导**，两者同源。
- D4 存储：新表 `publish_daily_count(owner,key,day_key,count,rollback_count)`；不动 `publish_timeline`。**窗口存储 = SQLite `publish_timeline`（跨重启持久、owner 隔离）**，故「重启清空窗口」路径不存在。
- D5 release：仅当 `store.get(key) === hold.at` 时回滚（否则不动，绝不回滚他人窗口）；调用方须回传 `prev`，缺失/错配 → `{released:false,reason:'prev_missing'}` + `log.error` + 设置页可见计数；调用点由结构锁枚举断言。
- D6 未提交判据（**双标记 + 阶段判据**，不按错误类型）：
  - `markSubmitAttempted()`：传输层**发起首次平台写尝试之前**调用 → `task.submitAttempted`；
  - `markSubmitted()`：平台**已确认发出**后调用 → `task.submittedAt`；
  - **可回滚**：① `submitAttempted === false`（登录失效/预检不过/风控挂起/缺文件）；或 ② 传输层显式抛 `definitelyNotSent === true`（连接未建立、DNS 失败等**可确证未送出**）；
  - **不可回滚**：已发起写尝试且无法确证未送出（超时、半途中断、平台非预期返回）；
  - `e.notSubmitted` 为佐证位，与上述结论不一致 ⇒ 占窗口 + `log.error`。
- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；`_quotaBlocked` 集合 + `_processNext` **跳过**（防忙循环）；定时器指向次日 00:00:05（同源时钟）并 `unref()`。溢出守卫保留在**含抖动系数后**的值上：`wait > 2³¹−1` ⇒ 钳到 `2³¹−2 000`（该路径任务处于 delayed、被跳过，不忙循环）。间隔源上界 **7 天**，越界钳位 + warn。配额分支在记账之前、**从未占用窗口**，故无 hold 持久化需求。
- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口）+ **每账号每日 1 次** + 「与上**一次任意账号**的放行间隔 ≥10 分钟」（与限次**正交**：限次防单账号滥用，冷却防跨账号脚本连点）。
- D9 防风：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
- D10 配额回补：`count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
- D11 key 构造：守卫与 store 的 key 一律经**唯一构造函数** `buildKey(platform, accountId)`（两段分别 percent-encode），分隔符 `:` / `#` 无法造成碰撞或越界；IPC 输入面另用 `isSafePathSegment` 校验（两层）。

## 不变量
- I1 已提交后的失败仍占窗口。
- I2 阶段判据之外一律占窗口。
- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
- I4 **成功发布必须 `submittedAt !== null`**，否则 `log.error` + 计数（传输层漏接线的主动告警）。
- I5 release 不回滚他人窗口。
- I6 抖动不得减少等待。
- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移。
- I8 任何 key 必须由 `buildKey()` 生成，禁止字符串拼接。

## 数据校验
env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL（上界 7 天）/ DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组复用策略表既有 `tier` 字段（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃。计数读回 `parseInt`，非有限 → 0 + warn。

## 交互
- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
- 未提交失败：「未提交到平台，**约 10 秒后**可重试」。
- 已提交失败：「已提交，需等待约 N 分钟」。
- 设置页「发布频率策略」：实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。

## 测试与变异
新增用例：`_processNext` 忙循环断言（重复判定次数上限）、重启后窗口仍生效、同一错误类型在提交前/后相反结果、`submitAttempted=false` 与 `definitelyNotSent` 两条回滚路径、传输层漏接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界、抖动溢出钳位（7 天 × 1.4）、key 编码防碰撞。变异 M1–M16 各让指定锁**恰好**变红。

## 明确拒绝项（附证据）
- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；按平台时区计日会让同一运营者面对多个「今天」。
- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。

## 已知限制
审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
