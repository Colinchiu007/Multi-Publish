---
record: log-notify-w2-d2
task: 日志契约迁移波次-2 刀-2——注入型 sink 三文件 51 处裸标签迁移为 log.notify 结构化契约
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 合并后的下一个会话
---

## 本次执行记录：日志契约迁移 波次-2 刀-2 注入型三文件（log-notify-w2-d2，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（electron 主进程 services） | worktree `D:/Data/projects/mp-worktrees/mp-log-notify-w2-d2`，裸分支 `log-notify-w2-d2` |
| 迁移范围 | ✅ 51 处 | `ops-center-sync.js` 28 + `login-network-diagnostics.js` 12 + `auth-partition-reclaim.js` 11，裸标签调用全部改为 `log.notify(key, params)` 结构化契约 |
| 结构锁扩展 | ✅ | `ALLOWED_KEYS` 81→**132 键**（下界断言同步 126）；`TARGET_FILES` 11→**14 文件**。锁覆盖 services 域剩余站点 |
| 测试适配 | ✅ 177/177 | 定向 4 文件全绿：`ops-center-sync.test.js` 75、`login-network-diagnostics.test.js` 46、`auth-partition-reclaim.test.js` 26、`observability-messagekey.test.js` 30 |
| **合入 main 后复验** | ✅ 177/177 | 与 origin/main 合并（解 `01-docs/learnings.md` 冲突）后**重跑同一组 4 文件仍 177/177 全绿**——冲突解决未引入回归，非"推上去就不知道了" |
| 断言适配逐条对账真实调用形态 | ✅ | ①验签失败断言：实际键是 `runtime-sync-skipped`（error 含「验签失败」），不是臆造的 signature 键；②`code`：源码 `String(code)` 归一 ⇒ 期望 `'10001'` **字符串**；③`contentLength`：`readContentLength` 返回 string ⇒ 断言对齐 string；④`auth-partition-reclaim` 修复拆键脚本引入的 `if (log) if (log)` **双前缀**缺陷 |
| 行尾与 diff 对账 | ✅ | 冲突解决走 Node 字节级前插拼接（沿用 prepend 型文档的可靠做法，不用 split/join）；解决后实测 `冲突标记残留=0`、`CRLF=17420 / bareLF=0` |
| 会话隔离健康检查 | ✅（设计内拦截） | 过程中 `tmp-main-baseline`（**无 mp- 前缀**的临时 worktree）触发 `mp-worktree-health` fail-closed 拒绝新建——保护正确工作，未强行绕过；已清理全部临时 worktree |
| 接线棘轮 | ✅ | 本刀未新增 `*.test.js`；结构锁 `observability-messagekey.test.js` 已在既有 workflow 接线内 |
| ESLint | ✅ 0 error | 37 warning 为既有基线，非本刀引入 |
| QM-1 打包 | ✅ rc=0 | 本地 `electron-builder` 通过 |
| QM-4 视觉 / QM-6 双模型评审 | 未执行 | 未触 UI 渲染面；本机无 `codeagent-wrapper`，如实写未执行，不以自审冒充 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#2947)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin log-notify-w2-d2` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 本刀的 CI 红灯不是本刀引入的（归因实录）

`QG Visual` 曾红在 `create-history` 补充视图 15s 就绪超时，`Gate Result` 随之连坐。**归因结论：与日志迁移无关。**

- 该视图超时后触发 Gate 7b **round2 重采**；round2 在 `apps/desktop` 跑完两套 suite 后只 `cd ..` 回了一层、cwd 停在 `apps/`，取证脚本 `node scripts/check-baseline-freshness.js` 按仓库根相对路径调用 ⇒ 解析成 `apps/scripts/...` ⇒ `Cannot find module` ⇒ exit 1。**所有触发 round2 重采的 PR 一律假红。**
- 实证：main 上与本 PR 无关的 `f3aec57a0` 同样 `Gate Result` 红、同一病因。
- 根治在 PR #2966（`cd ..` → `cd ../..`），本刀不夹带该修复。

### 遗留（不假装已闭合）

- **`ALLOWED_KEYS` 下界断言（126）与实际 132 之间有 6 键余量**：键是逐波次加的，断言只保下界防止"解析退化成空集合"。**余量本身不构成漂移**，但若某刀新增键数超过余量而无对应调用点，`observability-messagekey.test.js` 不会自动变红——锁的形状是"键集 ⊆ 白名单 且 白名单 ⊆ 实际调用"，余量方向是安全的，登记在此仅为下刀知情。
- **波次-3（services/ipc-handlers 剩余约 1038 处）尚未开工**：本刀三个基础设施障碍已全部扫除（结构锁覆盖 14 文件/132 键、`this._log` 注入形态正则已就位、`notify` mock 键面全仓已清零），但分批计划尚未定。
- **`.quality-gates.md` 已有一篇覆盖波次-1/2 的合并后补写记录**（PR #2964 落地），但 `check-pr-exec-record` 的判据只认 `openspec/records/` 下的载体，故本篇仍需存在——两者不互相替代，不要以为 `.quality-gates.md` 写过就免了。
- **本刀的锁下界与 TARGET_FILES 清单需随波次-3 持续更新**：若下刀新增文件超出 14 文件清单，结构锁会红（设计如此），但清单的"剩余站点"范围本刀未逐一枚举。