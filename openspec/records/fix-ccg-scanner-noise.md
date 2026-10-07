---
record: fix-ccg-scanner-noise
task: CCG 安全扫描器治理第一步——剔除测试文件噪音 + 修单文件假绿灯
date: 2026-10-07
sync_status: PASS
---

## 本次执行记录：CCG 扫描器噪音治理（fix-ccg-scanner-noise，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | `scripts/` 工具脚本 + 测试 + CI 配置（混合 PR）⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-ccg-scanfix`，裸分支 `fix-ccg-scanner-noise`；共享根停留 main |
| 第一性原因 | PASS | 两处根因均在扫描器自身：①`DEFAULT_EXCLUDES` 只排除**目录名**（`tests`/`test`/`__tests__`/`spec`），但同目录下的 `foo.test.js`/`foo.spec.js`/`foo.e2e.js` 仍走 `CODE_EXTENSIONS` 分支被扫 ⇒ fixtures 里的假私钥、`sk-xxx`、假 token 全被当成真实高危；②`scanDirectory` 无条件走 `walkDir`，而 `walkDir` 用 `readdirSync` 读目录，对**单个文件**必然失败返回 `[]` ⇒ `files_scanned: 0` 且 `passed: true`（假绿灯） |
| 逃逸分析 | PASS | 扫描器无任何自测；`files_scanned` 只出现在输出里，从未被断言。`passed` 由 `findings.some(...)` 计算，0 文件时 findings 必为空 ⇒ 恒真。**「没扫到东西」和「扫过且没问题」在输出里长得一模一样** |
| 系统性漏洞定位 | PASS | 扫描器缺两类自检：①范围判定的回归锁（哪些文件算测试）；②「扫描是否真的发生」的判据（`files_scanned` 必须与用户意图一致）。前者让真问题被噪音淹没，后者让工具失效不可见 |
| 修复 | PASS | ①新增 `isTestFile(filePath, excludeDirs)`：文件名形态（`foo.test.*`/`foo.spec.*`/`foo.e2e.*`）+ 前缀形态（`test_*`/`spec_*`/`e2e_*`）+ 路径中的测试目录名（`tests`/`__tests__`/`__mocks__`/`fixtures`），`walkDir` 据此跳过；②`scanDirectory` 先 `statSync` 区分「用户点名扫这个文件」与「目录里没有可扫文件」，前者强制计入 `files_scanned` 并真扫，点名测试文件时返回 `passed:false` + 说明性 finding（fail-closed，禁止退化成 0 文件绿灯）；③导出 `scanDirectory`/`walkDir`/`isTestFile`/`DEFAULT_EXCLUDES` 供自测 |
| 防「排测试」变成「关扫描器」 | PASS | 反向用例：生产文件 `app.js` 里的同名形态**必须报出**（`files_scanned: 1` 且有 finding）。排除测试文件不等于放弃防护——fixtures 里的「凭据」是刻意构造的假值，真实泄露只可能发生在被发布的代码路径 |
| TDD | PASS | 先写 7 例全红（实现未导出 `scanDirectory` ⇒ `undefined`，5 例 fail；另 2 例因噪音仍在报），再改实现转 7/7 全绿。`test_helper.js` 一例首轮红（`TEST_FILE_RE` 只认 `test.` 不认 `test_` 前缀）→ 补 `TEST_PREFIX_RE` |
| 变异反证 | PASS | 两次实跑：①移除 `walkDir` 里的 `isTestFile` 跳过 ⇒ 7 例中 2 例红；②`if (stat && stat.isFile())` 改 `if (false && …)` 关闭单文件入口 ⇒ 7 例中 3 例红；均已还原，`git diff` 仅含预期改动 |
| 接线棘轮 | PASS | `.ccg/` 下测试不被本仓自动收集，`check-unwired-tests.js` 判为「未接线」并阻断 ⇒ 已接入 `.github/workflows/quality-gate.yml` 的脚本测试段（`node --test .ccg/skills/tools/verify-security/scripts/security_scanner.test.js`），复跑 62/62 OK |
| 实仓效果 | PASS | `apps/desktop/electron/services/`：files_scanned **670 → 351**，critical **2 → 0**，high **14 → 7**，low 7 → 1。剔掉的正是 `ops-center-sync.test.js`/`runtime-trust-anchor.test.js` 的假私钥与 6 个测试文件里的假 key |
| 残留真问题（不在本 PR） | PASS | 噪音剔净后剩下的 7 条 high 才是需要逐条定性的对象：`rpa-view-helpers.js` 70/73/106/111 四处 innerHTML + 170 处硬编码密码；`rpa-view-platforms.js` 1031 处 innerHTML；`logger.js` 210 处 console.log。**本 PR 不动业务代码**——改 RPA 填词注入路径会外溢到已跑通的发布链，须独立立项、单独验证 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面与运行时代码；改的是 `.ccg/` 工具脚本与其 CI 接线 |
| 远程同步 | PASS | PR #3023 已 squash 合并，merge SHA `6335bdb85997966dc4533eeb5d63a417b9334786`，2026-10-07T10:12:15+08:00。取证 `git log origin/main --grep='(#3023)$' --format=%H|%cI`；`git ls-remote --heads origin fix-ccg-scanner-noise` 返回 0 行，证远端分支已删 |

### 定性更正（此前表述不准确）

上一轮我说「`rpa-view-platforms.js:1024` 硬编码密钥 + `:963` XSS」是两条待治理高危。剔除噪音后重新取证：

- **1024 那条已消失**——`passed` 不再因为噪音而失真，且该处 `token=` 实为用户会话 URL 的正则捕获拼接，非凭证。原判定（误报）成立。
- **963 仍在 high 档**，但真正更值得看的是 `rpa-view-helpers.js` 的四处 innerHTML 与 170 行的 `new Function()`。后者属动态代码执行，风险高于 innerHTML 注入。

### 遗留（不假装已闭合）

- `security_scanner.js` 的 `--json` 位置敏感（`parseCliArgs` 遇首个非 flag 参数即停解析，前置会让 flag 被当成路径）**本 PR 未修**：`--json` 被当路径时 `statSync` 失败落回目录分支，行为已不致命，但 `--help` 文案仍需补「参数顺序」说明。
- `fixtures` 目录被列入 `TEST_DIR_PARTS`，若将来出现真实产物落在 `fixtures/` 下会被误排除，需按实际目录约定复核。
- 剩余 7 条 high 的逐条定性与修复留待专项 PR。