# BUGFIX：登录临时分区 persist:auth-* 每次新建、永不回收（#2701）

- 日期：2026-10-01
- 分支 / PR：`fix-auth-partition-reclaim` / #2735
- 类型：🐛 运行时代码缺陷（用户数据目录无界增长 + 第三方登录会话半成品残留）
- 影响面：`apps/desktop/electron/services/auth-view-manager.js`、`auth-view-session.js`、`auth-partition.js`，新增 `auth-partition-reclaim.js`

## 1. 第一性原因（不是「忘了删」，是「删不掉」的设计缺口）

三个入口每次调用都新建一个带时间戳的**持久**分区，而全仓没有任何删除逻辑：

| 入口 | accountId / 分区名 | 磁盘目录名 |
| --- | --- | --- |
| `openLogin` | `auth-<platform>-<Date.now()>` | `auth-auth-<platform>-<ts>` |
| `openSavedAccount` | `auth-saved-<platform>-<Date.now()>` | `auth-auth-saved-<platform>-<ts>` |
| `loginSilent` | — | `silent-auth-<platform>-<ts>` |

用 `persist:` 是为了让登录页的 Cookie/localStorage 在一次会话内可用；但分区名里带时间戳，
意味着**每次调用都是一份新目录**，Chromium 会为其建整套存储（Cache / GPUCache / Local Storage /
IndexedDB / Cookies）。`git grep 'rmSync|rimraf|rm('` 在 `auth-partition.js` 与
`auth-view-session.js` 上 **0 命中**——不是漏写一行 `rm`，而是当初引入 `Date.now()` 时没有人
问「这份分区什么时候不再被需要」。

实测成本（本机 `D:\tmp\Multi-Publish-debug-profile`）：`session/Partitions` 下
**21 个 `auth-auth-*` 目录 = 436MB**，占整个 Partitions（476MB）的 **92%**，单个最大 93MB。
开 issue 时按「删掉 15 个分区回收 130MB」估的是 ≈8.7MB/次，实测均值约 20MB/次，量级低估一倍。

## 2. 测试逃逸链

| 层 | 为什么没拦住 |
| --- | --- |
| 单元 | 所有登录相关测试用 mock 的 `session.fromPartition`，**磁盘上根本不产生目录**；「目录是否被回收」在本仓测试模型里不可表示 |
| 集成 | `verify-worktree-deps.js` / 打包冒烟只看产物结构，不看用户数据目录增长 |
| E2E | 无「连续开 N 次登录页」的用例；profile 尺寸没有任何断言 |
| 视觉 | 与本类缺陷正交（看不见文件系统） |
| 代码审查 | 双前缀怪形状 `auth-auth-*` 早在 `auth-partition.js` 的注释里被**承认过**（「accountId 形如 auth-{platform}-{ts} 时会产生双 auth 前缀」），但当时只当作命名怪，没人追问它的存储后果 |

## 3. 系统性漏洞定位

**测试场景缺失 + 判据缺位**：本仓对「只进不出的目录型状态」没有任何门禁。
同类先例是 `run-state` 快照删除要级联（AGENTS.md「删除 story2video 项目必须级联清理持久化 run-state 快照」）——
那条之所以存在，是因为踩过一次「删了又长回来」；本条是它的镜像：「建了从来不删」。

## 4. 修复与回归保护

### 4.1 唯一删除判据：每组只留字典序末位

`auth-partition.findAuthPartitionDir` 对每组前缀做 `names.filter(prefix).sort()` 后**只取最后一个**，
而发布链的两处读者都经它定位：

- `rpa-view-manager.js:74`（API 轨 cookie 兜底 `collectAuthPartitionCookies`）
- `rpa-view-session.js:116`（RPA 轨 `_restoreAuthPartitionCookies`）

因此「较旧的 auth 分区」**从来没有读者** ⇒ 删除非末位目录可证明为**读取中性**。
新旧判定必须与定位端**同一口径**（字典序 `sort()` 末位，不是 mtime）：两侧规则一漂移，
就会删掉兜底真正在读的那一份。这条不靠注释，由一把注入真实现的锁守住：
回收前后 `findAuthPartitionDir('wechat_mp'|'zhihu', null, userData)` 必须返回**同一个分区名**。

### 4.2 未取证的会话当场清存储，成功取证的一律不清

- 未取证（用户取消 / 超时 / 没拿到凭证）：`close()` 里对该 Session 调
  `clearStorageData()` + `clearCache()`。这是进程内唯一安全的清空方式——**persist Session
  在进程内不销毁**（`webContents.close()` 也不销毁），此时 `rm` 目录等于对 Chromium
  仍持有的存储目录做 unlink。
- 成功取证：**不清**。`kuaishou-w3-live-fix` 的根因写进过代码注释——部分平台的登录 cookie
  只落在 `persist:*` 分区、未同步进凭证库；清掉就把发布链的兜底来源抹了。

### 4.3 进程内 liveness 登记表（自审揪出的漏洞，不在原 issue 里）

第一版只把「本次会话那一个分区名」当跳过集，漏了：本轮早先创建的分区、以及
`collectAuthPartitionCookies` **只读**实例化过的分区，都会被随后的 sweep 连目录删掉。
补 `livePartitions` 集合，三个开 Session 的入口全部登记（`createSession`／`loginSilent`／
只读兜底），回收语义随之明确为**跨进程**：本轮新建的当场只清存储，目录留给下一次回收。

### 4.4 回收属旁路

`setImmediate` 延后（不给登录首屏添延迟）；`realpath` 越界拒绝（只允许删 root 的直接子项）；
Windows 上只对 `EPERM/EACCES/EBUSY` 做有界重试；任何失败只 warn；`userDataPath` 读不到就不动手。

### 4.5 回归锁与反证

- 新增 `.test.js` 两个文件共 **37 例**（23 例模块级 + 14 例端到端/接线），消费面 8 文件 **120 例全绿**。
- **12 条变异**逐个实跑：M1 摘 close()→3 红 · M2 取消 captured 守卫→2 红 · M3 保留规则反向（删末位）→**11 红**
  · M4 前缀放宽到 `account-`→2 红 · M5 摘 realpath 拒绝→1 红 · M6 `scheduleReclaim` 不吞异常→37 红
  · M7 摘 loginSilent 清理→1 红 · M8 摘开局回收→1 红 · **M9 不并入登记表→1 红 · M10 `createSession`
  不登记→1 红 · M11 只读路径不登记→1 红 · M12 `loginSilent` 不登记→1 红**。还原后 37/37 绿、四文件字节一致。
- 端到端断言落在**真实文件系统**上（`os.tmpdir()` + 真实 `fs`，禁仓库内共享路径），不靠 mock。
- QM-1 真打包（离线 `--config.electronDist`）：新模块入包、`asar extract` 后在解包产物上 require 并跑判据、
  产物 exe 独立 profile 启动 14s、**stderr 0 字节**、六项禁项各 0 次。

## 5. 防止再次发生

1. **AGENTS.md/本档**：新增「临时分区必须声明回收边界」的判据式表述——凡 `fromPartition` 的名字里
   带 `Date.now()`，就必须同时回答「谁读它、什么时候不再被需要、由谁回收」，三问缺一即视为设计缺口。
2. **单一实现收敛**：分区目录名从 `auth-view-session.createSession` 的字面量收敛为
   `auth-partition-reclaim.partitionNameOf()` 一处实现（依赖方向 session → reclaim，reclaim 只依赖
   fs/path，避免互相 require 成环）；两处各写一份必然漂移。
3. **同族缺陷登记**：#2734「定位端只按名字择新、不看内容」——一次失败/取消的登录会把该平台真正的
   凭证分区遮断。本 PR 不改变它（删非末位对它是中性的），按「一次变更只做一件事」另开单。

## 6. 已知边界与未做

- 历史积压不会「一次清空」：每个平台组仍保留末位那一份（可能被发布兜底读取）。
- 本轮运行期间新建的分区不在本轮删除（进程内 Session 不销毁），当场只清存储。
- legacy 形态 `auth-<platform>-<ts>` 与 `auth-<真实 accountId>` **刻意排除**在白名单外：与在用账号分区
  同形，无法安全区分，误删即抹凭证。本机 21 个残留全部是 `auth-auth-*`，覆盖真实问题面。
- CHANGELOG 条目由后续 docs PR 与本档同批带上（置顶型文档撞车面降到 0）。

## 7. QM-6 外部评审的处置（codex 臂出结论，claude 臂缺失）

评审臂的实际状态值得记下来，因为它两次改变了我对「工具不可用」的判断：

- **claude 臂（frontend）三次调用均无正文**：`claude completed without agent_message output` / RC=1。
  绕开 wrapper 直连 `claude -p` 拿到确切根因——回包是一句计费提示
  （「your requests go through 127.0.0.1:15721, which isn't compatible with this update …」），
  即本机 CC Switch 网关与新版 auto-mode 分类器计费不兼容，模型正文根本没吐出。按门禁口径记为**缺失**，
  不当第二双眼睛。
- **codex 臂（backend）第 4 次跑通并写出 findings**（2 Critical + 1 Warning + 2 Info）。前三次失败的成因
  各自不同且都已实测定位：把空 stdin 当提示词（`--json -`）、`< NUL` 在 bash 下根本不是设备名
  （正解 `/dev/null`）、shell 工具路由连续报 `missing field 'cmd'`。
- 我一度把本条登记成「未执行（外部工具本机不可用）」——那句只对了一半，已就地更正。
  **教训**：「工具不可用」必须每次重新取证，不能因为上一轮取证过就沿用；沿用会把一条真实存在的评审抹掉。

### C1（成立，已修）
`qrcode-login.js:129/157` 创建的目录名是 `auth-auth-<平台>-<ts>-<seq>`，**同样命中回收白名单**，
但它既不经 `auth-view-session.createSession` 也不登记存活 ⇒ 活跃扫码分区可被 sweep 连目录删掉。
这正是我自己写进注释的「三个入口必须全部登记，漏一个就是沉默缺陷」——而实际至少有第四个入口。
修法：复用 `partitionNameOf` 单一命名 + `noteLivePartition`；回归锁用**真目录端到端**
（铺两份同组目录，活跃那份刻意做成非末位，断言 `removed=[]` 且两份都在），
并加**反向对照**：不登记时它确实会成为 victims——否则那两个断言可能只是「谁都删不动」。

### C2（成立，已修）
「未取证」不等于「没有可用登录态」。用户按 Escape 或关闭登录标签时，页面**可能已经拿到真实会话 Cookie**；
而对快手这类「登录态只落分区、未同步进凭证库」的平台（`kuaishou-w3-live-fix` 根因），
无条件清空等于亲手抹掉发布兜底唯一可读的那一份——那正是 #2701 要保护的东西。
修法：清空前先探 `cookies.get` + `isPlatformCookieDomain`，命中该平台域名就不清并留痕；
**探测失败同样不清**（不确定时保守留数据：残留下次还能清，抹掉的凭证找不回来）。

### 由 C1 夹具暴露的更根本一条（评审没提，我自己踩到的）
分组键原来只剥**最后一段** `-<数字>`，而扫码目录名是 `...-<ts>-<seq>` ⇒
每次扫码各自成一组，同平台扫三次就有三个"最新"，**一个都删不掉**——回收面根本收不拢。
改为反复剥尾，使分组粒度对齐定位端使用的前缀（`auth-auth-<平台>-`）。
这条是「端到端真目录夹具」比「mock 断言」值钱的实证：mock 版本里它完全不可表示。

### W1（部分采纳）
采纳：`loginSilent` 的清空由 `void` 改为 `await`，避免与窗口销毁竞争后静默留下带数据的目录。
不采纳：「不要把 silent 分区登记为 live」——persist Session 在进程内不销毁，不登记就正好复刻 C1 要修的
unlink；该风险的代价是本轮内 silent 目录不减少，由下一次进程启动回收，属已写明的保守取舍。

### I1 / I2（记为已知，不改判据）
I1：字典序与创建序在 seq 跨 9→10 时分歧，但**定位端用的是同一口径**，读取中性不破；
真要修得连 `findAuthPartitionDir` 一起改，不在本 PR 夹带。

## 后续（2026-10-01 同日，#2734 已落地）

上面那句延期已经在 `fix-auth-partition-content-select` 里兑现：定位端改成「同组从新到旧**按内容**探，取第一个真含该平台 Cookie 的」，`findAuthPartitionDir` 已删除并被 `selectAuthPartition` / `listAuthPartitionCandidates` 取代。**本文其余部分按 #2701 当时的口径保留，不回改**——其中「每组只留字典序末位」与「回收前后 `findAuthPartitionDir` 返回同一分区名」两条在今天已不成立，现在的不变量是「回收保留数 = 定位探测窗口 `PROBE_LIMIT`」与「回收前后候选集完全相同」。详见 `01-docs/BUGFIX-AUTH-PARTITION-CONTENT-SELECT-2026-10-01.md`。
I2：`livePartitions` 只增不减 ⇒ 回收语义就是「跨进程」，已在本档与 `.quality-gates.md` 写明。
