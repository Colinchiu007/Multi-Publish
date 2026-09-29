# harden-batch-schedule — 设计

## 决策 1：定时器索引结构（`Set<timer>` → `Map<batchId, Set<timer>>`）

两个缺陷（b1 幽灵发布、b2 重复排期）**同根**：`_timers` 是 `Set<timer>`，**没有批次维度**。
于是「按批次清除」在数据结构上就不可表达——`batch:delete` 想清也定位不到该批次的 timer，
`scheduleBatch` 也认不出「这批已经排过」。

| 方案 | 说明 | 取舍 |
|------|------|------|
| A. `Map<batchId, Set<timer>>`（**采纳**） | 按批次索引；清除点收敛为 `_clearBatchTimers(batchId)` | 一处结构改，同时修 b1+b2+b3 的底座；`stopAll` 遍历 values |
| B. 保留 Set + 每条 timer 挂元数据 | 用 `{timer, batchId}` 包装对象塞进 Set | 清除需遍历全表匹配 batchId，O(n) 且容易漏；且 Set 里放对象后 `clearTimeout` 要解包 |
| C. 每批次一个独立字段 | `this._timers[batchId] = [...]` | 批次数无界，动态属性会让实例形状不稳定；Map 明确表达「键是批次」 |

**A 的附带收益**：`cancelBatch` 有了天然的「是否真的取消了」判据（`_clearBatchTimers` 返回清除数，
为 0 说明该批次根本没在排期 → 返回 false，不误报成功）。这与单篇 `scheduler.cancel`
（只认 pending）的 fail-closed 语义一致。

**顺序契约**：`batch:delete` 必须**先清定时器再删记录**。反过来说「先删记录再清定时器」需要
在删除前把 timer 句柄抠出来——那等于把索引又拆成两份。

## 决策 2：离线缓存形状同源（唯一展开点）

缺陷根因是**两处各自定义形状**：写入侧（渲染层）用 `{targets, data}`，重放侧（offline-manager）
判 `task.platform && task.article`。两者从不同源，且既有测试夹具**只用重放侧形状**，
所以「写入的条目永远重放不了」这件事在测试里不可表示。

修法不是「让渲染层改成扁平」（那会让每条缓存丢失「同一篇文章 × 多平台」的分组），
而是在重放侧引入 `expandCachedTask(task)` 作为**唯一展开点**：

- 扁平 `{platform, article, accountId}` → 原样透传（**存量缓存向后兼容**）
- 嵌套 `{targets: [...], data}` → 按 targets 逐条展开成
  `{platform, article: data, accountId}`
- 无法识别 → `[]`，调用方留缓存（**不静默丢弃**）

**原子性语义**：一条缓存的全部 target 都入队成功才 `count += n` 并移出缓存；
任一 target 抛错则整条留在缓存。理由：部分成功后移出缓存会**丢失未入队的平台**，
而留在缓存最坏只是重放一次已成功的平台（重复发布可被业务层幂等吸收，丢平台不可逆）。

## 决策 3：渲染层写入侧归一化（防新畸形条目）

`getArticleTargets(a)` 在未接入账号目录时返回**字符串数组**（`['wechat_mp']`），
字符串 target 无法被 `expandCachedTask` 的嵌套分支识别（它要求 `target.platform`）。
因此离线缓存专用 `buildCacheTargets(a)`（`buildPublishTargets` 归一化 + 映射为
`{platform, accountId: null}`），与 `getArticleTargets`（兼容 batchCreate 的宽松契约）**分职**。

不改 `getArticleTargets` 本身：它是 batchCreate 的既有契约（主进程 `resolvePlatform` 能同时吃
字符串与对象），改它会波及在线提交路径。

## 决策 4：死路径清理的边界（删到哪一层）

| 层 | 处置 | 理由 |
|----|------|------|
| 3 个 store IPC | **删** | 对外暴露面；删掉即消除「有人误用」的可能，且改动可控（1 文件 + 测试） |
| 3 个 preload 桥接 | **删** | 与 IPC 一一对应；保留等于留着一条打不通的桥 |
| `scheduled_tasks` 表 | **保留** | `base-store.migrateFromJsonl` 仍写入（历史迁移）、`account-store` 删账号时级联清理仍读取 |
| `scheduler-store.js` 5 个方法 | **保留 + ⛔ 标注** | `store-snapshot`/`store-owner-isolation` 两个测试用它们守护「表的 owner 隔离」语义；删方法要重写这两个测试，收益（少 5 个无调用者方法）不匹配风险 |
| 防再犯 | **结构锁 4 例** | preload/主进程/渲染层三面禁复活 + 真源入口（`scheduler:create/cancel`、`batch:schedule/cancel`）在位 |

**为什么不彻底删方法**：那张表还在被迁移与级联删除使用，而 `store-owner-isolation.test.js`
验证的正是「这张表的数据按 owner 隔离」——删掉方法会让这层守护失去载体，
而真正的风险（有人把死路径当真源）已由「删 IPC + 删桥接 + 结构锁 + dead-path 标注」四重覆盖。
完整清理（连方法一起删）已登记为后续项，需与两个测试的重写同批进行。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `_timers` 结构变更破坏 `stopAll`/`restoreScheduledBatches` | 既有回归测试覆盖（stopAll 清空 + restore 不叠加）；新增 Map 结构回归用例 |
| `expandCachedTask` 成为新形状的隐藏判据 | 它是唯一展开点且有 5 例形状测试（含「无法识别留缓存」「部分失败整条留」） |
| 批量离线逐篇缓存产生 N 次 IPC | 离线是罕见路径且 N = 文章数（通常 <10）；换来的是「不硬发」的正确语义 |
| 删 preload 桥接影响打包 | 重打包 bundle 并由 `preload.test.js`（计数+清单）+ bundle 内容断言共同守护 |
| 新增 `batchCancel` 触发计数锁 | 同步更新 4 处计数（system 148→149、account 52→49、总键 337→334、ACCOUNT_METHODS 51→48）并把变更原因写进断言标题 |

## QM-6 评审降级说明

按 AGENTS.md 的「子代理降级」纪律派发了两路外部评审，**两路均因上游额度 403 不可用**：

- `claude -p` → `Failed to authenticate. API Error: 403 今日订阅额度已用尽或未配置订阅`
- `codex exec` → 同因（CC Switch 本地代理转发上游 AllinOne，`upstream_status: HTTP 403`），
  且 codex 的 shell 被沙箱 policy 拦截、无法执行 `git show`

处置：**不盲等**，立即降级为主代理对抗性自审（本文件决策 1-4 即其产物之一），
并把「两路不可用」的事实与证据行写入 `.quality-gates.md` 与 PR 描述——
**不记为「评审通过」**，也不把自审冒充为第二路独立评审。
本轮自审实际产出了 3 个 #2655 之后的新缺陷（b1/b2/b4a），强度不低于形式化评审。
