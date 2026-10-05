---
record: fix-settings-roundtrip
task: 桌面端 settings 读写往返类型对称化——运营中心下发配置重启后可恢复（getSettingObject 单一实现 + 真实存储回归锁）
date: 2026-10-05
---
## 本次执行记录：settings 往返类型对称化（运营下发配置重启后可恢复）（fix-settings-roundtrip-contract，2026-10-05）

> 分支：fix-settings-roundtrip（worktree D:/Data/projects/mp-worktrees/mp-fix-settings-roundtrip，start-mp-task.ps1 建区，verify-worktree-deps.js OK 11 项，基线 origin/main@15cf2bae）
> 范围：🐛 Bug 修复（主进程持久化契约误判）——运行时代码变更 → 完整质量节拍 + OpenSpec change `fix-settings-roundtrip-contract`

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | `git rev-parse --abbrev-ref HEAD`=fix-settings-roundtrip；共享根保持 main clean（porcelain 0）；写保护任务在位 |
| 根因（QM-5 第 1 步） | PASS | `store/settings-store.js:22` `getSetting` 返回 `safeJsonParse` 后的**对象**，而 4 个服务按字符串读：`String(obj)`→`[object Object]`→`JSON.parse` 抛→恒 `{}`；引入点 `384b5c8b`(2026-08-10)，非 Store 拆分引入（拆分前 `store.js:291` 已如此） |
| 逃逸链（QM-5 第 2 步） | PASS | 单元层：`ops-center-sync.test.js:44 makeStore` 原样回吐存入类型，与真实存储不同形 → 改动前实测 90 passed 全绿（含用例名"重启后从 settings 恢复 appMenu"）；集成/E2E：无该链路；视觉层：侧栏回落内置菜单，对"配置未生效"零区分；审查层：读起来自洽 |
| 系统性漏洞（QM-5 第 3 步） | PASS | 定位到 `apps/desktop/electron/services/ops-center-sync.test.js` 的夹具契约 + 缺失"真实存储往返"这一类锁（Mock 边界漏洞 + 门禁缺失漏洞） |
| TDD（先红后绿） | PASS | 实现前真实存储锁实跑 **13 failed**（红因逐条核对：`expected '` to be 'http://127.0.0.1:8010'`、`expected null to be truthy`、水位线 `expected +0 to be 7/9`），并修正一次探针自坏（`_loadWatermark` 方法名不存在，真实为 `_getWatermark`）；实现后 5 文件 **104 passed** |
| 回归保护（QM-5 第 4 步） | PASS | 新增 `apps/desktop/electron/services/settings-roundtrip-contract.test.js`：真 `Store`(sql.js) + 真服务，**关闭并重开同一库文件**模拟重启，恢复期替换 `global.fetch` 计数须为 0；夹具全部改为同形（字符串进、对象出），旧用例仅调调用形状、未放宽断言 |
| 反证纪律 | PASS | M1 摘对象分支 7 红 / M2 生产误判+同形夹具 21 红 / M2' 生产误判+退回原样回吐夹具 → 单元 0 红（逃逸复现）而真实锁 2 红 / M3 appMenu 恒 null 1 红（唯一防线）/ M4 写入 no-op 1 红；全部按 md5 逐字节还原。另记两条**判据自身故障**并纠正：ANSI 色码使 `/Tests \d+ failed/` 恒不匹配（4 条红被误报"锁没抓住"）、CJK 以 latin1 解码使 `expectHint` 恒假 |
| QM-6 修复轮反证（8 条变异） | PASS(8/8 红) | 每条新锁都**先跑基线**证明未变异时为绿再变异：M1 摘「未注入 store」留痕 / M2 摘「缺少方法」留痕 / M3 方法抛错退回静默 catch / M4′ 扫描式判据改恒空 / M5 窄包装转发契约里不存在的方法 / M6 扩转发却不销账 / M7 运行时策略写错键 / M8 把 `origin/main` 的**历史原形原文**注回被守文件 ⇒ 8 条全部 `1 failed`，收尾断言被改文件与备份**逐字节相同**。两条自己抓到的假证据并当场纠正：① 判据矩阵用 `toBeTruthy()` 断言数组——空数组同样 truthy，于是"函数恒返回空数组"的 no-op 完全抓不住（M4′ 首轮报绿暴露），改为 `.length).toBe(1)`；② 结构锁为消误报收窄成 `getSetting\s*\(` 之后**漏掉修复前的真实原形** `String(this._store?.getSetting ? this._store.getSetting(K) || '' : '')`（三元里的 ` ? ` 空格断了字符类），等于"消误报顺手把锁改弱"；改为取 `String(` 的配对实参再判其中是否引用 `get(?:User)?Setting`，并以 `git show origin/main:<file>` 原文为语料验证（修复前命中 6/1/1/1、修复后 0，7 个正例含空格成员/方括号成员/可选链/跨行/用户作用域全 FLAGGED，5 个负例含新入口全 CLEAN） |
| 消费者并集（非只跑改过文件） | PASS | 对 4 个被改模块 + store 取 `git grep -l` 并集全跑：**55 文件 / 812 passed**；渲染层 appmenu 链 3 文件 79 passed |
| 全量测试 | PASS(1 项既有红) | QM-6 修复后重跑 `vitest run electron` = **444 passed 文件 / 8526 passed / 1 failed**（另 1 skipped）；唯一红 `feedback.test.js` 为 `EPERM: symlink`（本机建符号链接需特权），在未改动的 main 上实测同红，非本 PR 引入 |
| QM-1 本地打包 | PASS（QM-6 修复后重跑） | `verify-worktree-deps.js` OK 11 项 → `pnpm run build:dir` → 产物内三处真身 `hasNewApi=true`/旧误判形状=false（`settings-store.js` 2487B、`ops-center-sync.js` 28140B、`usage-reporter.js` 8156B）→ 打包 exe 以独立 temp userData 启动 8 秒存活、**stderr 0 字节**、禁用特征 0 命中（含 `getSettingObject is not a function`，即"注入物形状不符"的风险在产物侧也被守住）。首轮曾假绿：未建渲染层时 builder rc=0 但 stderr 报 `ERR_FILE_NOT_FOUND app.asar/dist/index.html` 白屏——补建后消失 |
| Live 端到端 | PASS | 真服务打到本机 `127.0.0.1:8010`（监听实测非 0.0.0.0）：同步 `runtimeApplied=true`、菜单 21 项；关闭重开后 `url`/`apiKeyEnc`/自定义锚/`lastSyncedAt` 全读回、菜单逐项全等、恢复期出站 0；换错公钥 → `runtimeApplied=false` 且不覆盖已验签缓存 |
| 行尾对账 | PASS | CHANGELOG `19/0`、learnings `13/0` 两口径一致且删除数为 0；`.quality-gates.md`（含 NUL 的 binary、混行尾）按首行自身行尾插入，未做任何归一；AGENTS.md `2/0` 两口径一致 |
| 品牌残留 / 文档同步 | PASS | 未出现竞品品牌名（用"运营中心/参考产品"口径）；新增 `docs/settings-persistence-contract.md` 满足 doc-gate 且不与人顶插同一行 |
| QM-6 双模型评审 | PASS(两路均走降级通道，偏差如实登记) | 指定通道两路都不干净：**前端路** `codeagent-wrapper --backend claude`（真源 `~/.claude/.ccg/config.toml` [routing.frontend]=claude）两次空转（rc=0/1、零 `agent_message`、无产物）；**后端路** 首投 PID 42800 跑满约 14 分钟后 stdout 截断在第一条 finding 中途（1839B）、包装器日志退出时自清、`~/.codex/sessions` 无 rollout ⇒ 不可恢复，改法＝要求"先落盘产物、正文只回摘要"重投才拿到结论。实际结论来源：前端 `opencode/nemotron-3-ultra-free` 的 findings 经本地逐条实测复核（推翻其 2 条子主张、自查拦下 1 条会引入新 Bug 的迁移建议）；后端 codex 第二投 **0 Critical / 5 Warning / 9 Info**。处置合计：前端 1 条 Critical（`_readStoredObject` 三个出口中两个是无声 `return {}`，含"压根没注入 store"这一最极端契约不符形态，与其自身 JSDoc 第 137 行声明及同 PR 三个 reporter 的出声口径相矛盾）已修；W4/W5/W6 已修；W2/W3 以文档纠偏落地。**驳回 2 条并留证据**：① "主进程中文日志会被 CJK 门禁拦"——`check-locale-sync.js:39` 的扫描域只有 `apps/desktop/src`，不覆盖 `electron/`；② "日志统一中文"——三个 reporter 既有约定实测为英文（英/中 = 4/6/9 : 1，唯一那条中文正是本 PR 新引入的），故按**文件自身约定**统一为英文（OpsCenterSync 相反，中 18 : 英 5，保持中文）。后端 5 条 Warning：#2 重复实现登记→已按实测 **13 处**收口（比评审报的 7 处更全）；#3 数组型覆盖缺口→文档 §2 限定为"对象型唯一入口"并写明数组收口方式；#10/#12（结构锁、装配锁）的**证据被本 worktree 未提交改动污染**（其引用的 `FORBIDDEN_SHAPE`/`KNOWN_LAGGING` 在 `7bbe33e6b` 里不存在），须对新 head 重评；#4 损坏行抹 Key、#6 信任锚不重验签→登记为文档 §8 已知残留并写明威胁模型断言。Critical 现为零 |
| 远程同步 | PASS | PR #2899 squash 合并 10d2a8202（2026-10-05，完整 SHA 10d2a8202a83d173d3495652d84c02a9fed7a62d；main 上主题：settings 往返类型对称化，运营下发配置重启后可恢复 (#2899)）；远端分支 已删（git ls-remote --heads origin fix-settings-roundtrip 返回 0 行）；本条记录即由本次 docs-only PR 就地回填，frontmatter 的 sync_* 三字段同一次删除 |

---

## 附：合并后由 docs-only 回填 PR 使用的 CHANGELOG 条目原文

本 PR 是运行时代码变更，按既有纪律（置顶件 + 20 分钟以上 CI ≥ main 前进间隔 ⇒ auto-merge 反复落不了地）
不把 CHANGELOG 顶插带进本 PR；原文在此，合并后单独走 docs-only PR 插回 CHANGELOG 顶部。

```md
# [未发布] fix(桌面端): 运营中心配置"写得进读不回"——settings 往返类型不对称令菜单/公告/开关重启即失效（fix-settings-roundtrip-contract，2026-10-05）

### 症状
- 运营中心「应用菜单」改了显隐/排序并保存，桌面端侧栏**永远不变**；每次重启都回落到应用内置菜单。`openspec/specs/app-menu/spec.md` 里"落入本地缓存，重启后仍可恢复"那条自 2026-08-10 起从未被满足。

### 根因（类型契约误判，不是同步逻辑坏）
- `store/settings-store.js` 的 `getSetting` 返回**解析后的值**（对象），而 `ops-center-sync` / `diagnostics-reporter` / `publish-reporter` / `usage-reporter` 按字符串读取：`String(obj)` → `[object Object]` → `JSON.parse` 抛 → 静默回落 `{}`。共 9 处读取点。
- 后果面还包括三类上报水位线恒 0（重复上报）。
- 为什么 90 条用例全绿：`makeStore` 夹具"存进什么类型就返回什么类型"，与真实存储「字符串进、对象出」不同形 —— 对这类缺陷结构性免疫。

### 修复
- 读回归一化收敛为存储侧唯一实现 `getSettingObject(key, defaultValue)`；写入一律传对象。因 `safeJsonStringify` 对字符串原样透传，**落盘字节逐字不变 ⇒ 零迁移**；回滚须整体回滚。
- 夹具改为同形；新增真实 Store 往返锁 `apps/desktop/electron/services/settings-roundtrip-contract.test.js`（真库 + 关闭重开同一文件模拟重启 + 恢复期禁止出站）。
- 反证：M1 摘对象分支 7 红 / M2 生产误判 + 同形夹具 21 红 / M2′ 退回原样回吐夹具则单元 0 红而真实锁 2 红（逃逸复现）/ M3、M4 各 1 红。
- Live 取证：真服务打到本机 `127.0.0.1:8010`，重启后 `url`/`apiKeyEnc`/自定义验签锚/`lastSyncedAt` 全部读回、菜单逐项全等且恢复期零出站；换错公钥时 `runtimeApplied=false` 且不覆盖已验签缓存。
- 详见 `docs/settings-persistence-contract.md`（含运营中心未部署这一半问题：`ops.iart.work` 当前 DNS 不解析）。

---

```
