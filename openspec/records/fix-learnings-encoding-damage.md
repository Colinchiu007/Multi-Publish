---
record: fix-learnings-encoding-damage
task: 修复 01-docs/learnings.md 的7212 处编码损坏并重建 2026-07-11 复盘内容
date: 2026-10-07
---

## 本次执行记录：learnings 编码损坏治理（fix-learnings-encoding-damage，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯文档变更 ⇒ 仍用隔离 worktree `mp-learnings-fix`（`01-docs/learnings.md` 是跨会话热点文件，就地编辑会与并发写入冲突）；共享根未动 |
| 第一性原因 | PASS | 损坏**非单次事故而是长期累积**：blob 级计数 `52edddef`=0 → `5ad345d2`(2026-07-11)=202 → `3f12278f`=2714 → `7fa0083c`(08-06)=3606 → `172bb520`(08-13)=**7212**，此后固定不变。形态为「中文全毁、ASCII 存活」（`Remotion`/`2026-07-11`/`remotion-composer` 均完好，中文成 U+FFFD），strict_utf8 校验为 true ⇒ 是**已写入文件的替换字符实体**，非非法字节序列 |
| 逃逸分析 | PASS | `scripts/text-encoding-baseline.json` 把 `01-docs/learnings.md`以 **7212 处/546 行**显式登记为「唯一例外」，棘轮对已登记项不判红 ⇒ 损坏静默存活三个月。`79d5d599`(#2911「全仓控制字节批量清理—吞字修复」) 声称修了 learnings 30 处，实际缺口 7182 处，量级差两个数量级 |
| 根因误判纠正 | PASS | 曾用 `git blame` 判定元凶是 `1dd05b12`(#2792) —— **错误**。实测其父提交 `e6859c57` 已含 7212 处，该提交只是整文件重写(+16891/−16826)导致 blame 归因转移。**改用 blob 级逐提交计数才定位到真实引入点** |
| 重复性发现 | PASS | 546 受损行实为**两个完全相同的 394 行块**：行数一致、结构签名 192 项重合度 100%、ASCII token 376/110 全等、overlap_ratio=1.00 ⇒ 实际只有 1 个主题、394 行 |
| 恢复可行性 | PASS | **不可从历史恢复**：损坏前提交 `52edddef` 中不含「第五十三」等内容（当时为新增），这些中文从未以正确形态进入过 git 对象库 |
| 重建依据 | PASS | 受损行的 ASCII 残留保留了大量结构化信息：规则编号 R85/R86/R87/R90/R91、**20 个 commit hash**、文件名（`render-engine.js`/`CreateHistory.vue`）、函数名（`renderGetStatus()`/`invokeWithFallback`/`CopyFromScreen`）、数量（`500 行`/`v1.0.0`）。**逐个核实 20/20 hash 真实存在于仓库**，且其提交信息里的中文完好 ⇒ 重建有真实证据支撑，非编造 |
| 重建内容 | PASS | 按 commit 归并为 5 个主题节：①Remotion 引擎未就绪（workspace hoisting，`7ad9959`/`9c36518`/`6a62b49`）②Electron 窗口未显示需人工验证（`d5ce0a7`）③CreateHistory.vue 的 BOM + `@click` 双问题（`c6564b0`/`d8167ef`，产出 R90/R91）④版本号路径少一层 `../`（`6129150`）⑤质量节拍 6 步循环与 R85/R86/R87（`c468661`/`bb89b27`） |
| 不编造原则 | PASS | 原表的质量分统计（`CRITICAL/MAJOR/MINOR` 各多少、`865 passed`）**明确未重建**，并在文末写明原因与「宁可缺，不可编」。受损表的数字虽 ASCII 存活，但中文表头与判定口径已毁，无法确认每个数字的来源 |
| 中间过程失误 | PASS | 归档脚本首版按**正序** `splice`，索引随前面替换漂移 ⇒ 只搬走一半、主文档残留 3553 处。已`git checkout` 还原并改为**倒序替换 + 强校验**（覆盖度检查 + 落盘前 FFFD 必须为 0），重跑后守恒检查 true（7212 = 0 + 7212，零字节丢失） |
| 最终结果 | PASS | 主文档 `01-docs/learnings.md` FFFD **7212 → 0**，行数 17645 → 16641；归档文件（内容已由重建件覆盖）已删除；`strict_utf8=true`、`bareLF=0`（CRLF 保持） |
| 门禁收口 | PASS | `scripts/check-text-encoding-baseline.json` 经 `--update-baseline` 从 8 条收到 **7 条**（移除 `learnings.md`）；`node scripts/check-text-encoding-integrity.js` → **OK：无新增编码损坏** |
| 剩余存量（未处理） | PASS | 7 个文件仍带损坏且**已在案不判红**：`.ccg/tasks/archive/…analysis-claude.md`(2)、`analysis-opencode.md`(1)、`01-docs/ARCH-OPS-CENTER-RESILIENCE-2026-10-06.md`(3)、`01-docs/marketing/01-产品卖点清单.md`(2)、`openspec/specs/creator-monitor/spec.md`(2)、`packages/api-publish-engine/src/adapters/xiaohongshu.js`(2)、`packages/shared-utils/src/__tests__/scheduler.test.js`(3)。其中 **`adapters/xiaohongshu.js` 的 2 处在本次范围内**（#3009 重写过该文件），其余为更早的独立存量，留待专项 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面与运行时代码 |
<<<<<<< Updated upstream
| 远程同步 | PASS | merge SHA `89a971eb734c43f1273e3cf3323186e89556c43d`（2026-10-08T17:39:09+08:00）。取证：`git log origin/main --grep='(#3091)

### 机制层面的教训（比这次修复本身更重要）

**① 「已登记不判红」是棘轮的固有盲区。** 本次 7212 处损坏之所以能静默三个月，
正是因为当初把它**单独登记为例外**，而不是修掉。棘轮只能保证「不新增」，
无法保证「已登记的一定会被修」。**登记必须带到期或复核条件**，否则等于永久豁免。

**② `git blame` 在整文件重写场景下会误导归因。** #2792 重写了整个 learnings.md，
导致 blame 把损坏行归给它，而它父提交里损坏早已存在。**归因必须用 blob 级逐提交
计数，不能只信 blame**。

**③ 编码损坏的「形态」本身就是线索。** ASCII 存活 + 中文全毁 + strict_utf8 通过
⇒ 典型的「按错误编码解读后写回」；若strict_utf8 失败则是字节级损坏，两者修法不同。

**④ 三次栽在编码上**（今日改测试注释写坏 2 处、回填时 `String.replace` 的 `$'`
令牌损坏文件、本次 7212 处存量），说明**中文内容经脚本改写**是本机的高风险路径。
本次已验证可行的做法：写 `.js` 脚本改写 + 只读探针回读 + 强校验后落盘。 --format=%H|%cI` → `89a971eb…56c43d|2026-10-08T17:39:09+08:00`；`git ls-remote --heads origin fix-learnings-encoding-damage` 返回 0 行（远端分支已删） |
=======
| 远程同步 | PASS | 已合并 #3091 = `89a971eb734c43f1273e3cf3323186e89556c43d`（squash，committer 2026-10-08T17:39:09+08:00）。取证：`git log origin/main --grep='(#3091)$' --format=%H|%cI` 唯一命中；`git ls-remote --heads origin` 对应分支返回 0 行。补记：本文件为 #3164 批量回填的漏项，由本次回填 PR 就地闭合 |
>>>>>>> Stashed changes

### 机制层面的教训（比这次修复本身更重要）

**① 「已登记不判红」是棘轮的固有盲区。** 本次 7212 处损坏之所以能静默三个月，
正是因为当初把它**单独登记为例外**，而不是修掉。棘轮只能保证「不新增」，
无法保证「已登记的一定会被修」。**登记必须带到期或复核条件**，否则等于永久豁免。

**② `git blame` 在整文件重写场景下会误导归因。** #2792 重写了整个 learnings.md，
导致 blame 把损坏行归给它，而它父提交里损坏早已存在。**归因必须用 blob 级逐提交
计数，不能只信 blame**。

**③ 编码损坏的「形态」本身就是线索。** ASCII 存活 + 中文全毁 + strict_utf8 通过
⇒ 典型的「按错误编码解读后写回」；若strict_utf8 失败则是字节级损坏，两者修法不同。

**④ 三次栽在编码上**（今日改测试注释写坏 2 处、回填时 `String.replace` 的 `$'`
令牌损坏文件、本次 7212 处存量），说明**中文内容经脚本改写**是本机的高风险路径。
本次已验证可行的做法：写 `.js` 脚本改写 + 只读探针回读 + 强校验后落盘。