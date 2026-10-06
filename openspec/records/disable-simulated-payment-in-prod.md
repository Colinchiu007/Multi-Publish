---
record: disable-simulated-payment-in-prod
task: 正式包不渲染「模拟支付成功（开发模式）」入口——主进程两道拦截本就 fail-closed，这是 UI 层的诚实性修复
date: 2026-10-07
---

## 本次执行记录：正式包不渲染模拟支付入口（disable-simulated-payment-in-prod，2026-10-07）

> 分支：`disable-simulated-payment-in-prod`；worktree：**沙箱内无法执行**（`scripts/session-init.sh` / `start-mp-task.ps1` 依赖 Windows + Git for Windows Bash，本环境不具备）——按 AGENTS.md 分层判定走「运行时代码必须在分支上」，未直推 main，隔离缺口如实登记
> 范围：🐛 UI 修复 + 回归锁 —— `apps/desktop/src/components/UpgradeModal.vue`（模板 1 处 + 样式 1 处 + 1 个构建期常量）、`apps/desktop/src/components/UpgradeModal.test.js`（+1 describe / 3 用例）
> 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false** ⇒ 完整质量节拍，不走 docs-only 快速通道

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | **PARTIAL** | 分支 ✅ / 未直推 main ✅ / `--no-verify` 未用 ✅；**worktree 隔离未执行**——沙箱无 `scripts/session-init.sh` 可用的 Windows + Git Bash 环境。⚠️ 落地到真机复跑时必须先 `scripts/session-init.sh disable-simulated-payment-in-prod` |
| 第一性原因（QM-5 ①） | PASS | `8480a7e`（2026-07-04 `feat: P2 许可证系统 — LicenseManager + IPC + UpgradeModal + 150 tests`）引入本组件，模拟支付按钮**自诞生起就无条件渲染**，无任何构建期条件。⚠️ 本地克隆为**浅克隆（`.git/shallow` 3 边界 / 仅 8 commits）**，`git log --follow` 返回的边界提交是假的；真实历史经 GitHub API `commits?path=…` 取回 |
| 逃逸分析（QM-5 ②） | PASS | **两处独立逃逸，均为「断言不精确」**：① `829dc22`（2026-07-04）把 UpgradeModal 函数覆盖率 41%→**76%**，`981bc71` 还专门修了激活测试——**76% 里没有一条断言「正式包不该出现这个按钮」**，覆盖率只证明代码被执行过，不证明该出现的形态被覆盖；② `apps/desktop/tests/payment-ipc.test.js` 的 `beforeEach` 把 `__electronMock.app.isPackaged = false` **钉死在开发态**，全部用例（含 `payment:simulate handler completes payment`）都验证「开发态能模拟支付」，**`grep -c "isPackaged = true"` = 0** ⇒ 主进程 `app.isPackaged` 那道生产拦截**从未被测过** |
| 系统性漏洞（QM-5 ③） | PASS | 具体到文件与环节：**`apps/desktop/tests/` 缺少「正式构建形态」这一测试维度**。`payment-ipc.test.js` 把 `isPackaged` 写死在 `beforeEach`；组件单测（`src/**/*.test.js`，50 个文件）没有任何一个用 `vi.stubEnv('DEV', false)` 摆出生产形态。根因是全仓只有 `useFeatureFlag.js` 一个 dev-only 通道，它自己是被 Gate 7 探针**逼出来的**（`useFeatureFlag.test.js` 头注记着前一版加了 `options.{dev,search}` 注入口、被 QM-6 外部评审打回），**该模式没有被提炼成可复用的门禁约定** |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：`simulatedPaymentAvailable = import.meta.env.DEV`（构建期常量，**默认关闭即安全**），`v-if` 换掉无条件的模拟支付按钮，正式包改渲染「付费通道筹备中，暂不支持购买」。**刻意不给组件开测试注入口**——沿用 `useFeatureFlag.js` 的既有口径，能传给测试的开关同样能传给误用者。回归锁：`UpgradeModal.test.js` 新增 3 用例，用 `vi.stubEnv('DEV', false)` 摆出正式包形态，**跑的是生产同一条分支**；含一条反失明断言（先 `expect(w.text()).toContain("扫码支付")` 证明真的推进到了扫码页，避免"因为前置失败所以没渲染"的假绿） |
| 防止再次发生（QM-5 ⑤） | PASS | ① **回归测试进入 CI**：`apps/desktop/src/**/*.test.js` 属 vitest workspace（`apps/`），由 `QG Desktop Shards` 收集，无需额外接线；② **模式提炼进 `01-docs/learnings.md`**：dev-only UI 通道的三条口径（默认关闭 / 不开测试注入口 / `vi.stubEnv` 摆形态），让下一个写 dev-only 通道的人不必重新踩 |
| QM-1 打包 | ➖ N/A | `git diff --name-only origin/main...HEAD` 无 `apps/desktop/electron/**`、无 `packages/rpa-engine/**` —— 改的是渲染进程组件 |
| QM-4 视觉 | ➖ N/A | `apps/desktop/tests/visual-testing/` **无 UpgradeModal 视觉基线**（`find` 全仓 `*upgrade*png/snap/spec` 为空）⇒ 该组件不在 `QG Visual` 覆盖范围，无基线可回归 |
| 依赖漏洞审计 | 待 CI | 本 PR 未改任何依赖 / manifest / lockfile |
| 远程同步 | PENDING | 合并后回填：`.quality-gates.md` 状态列改 `PASS` + merge SHA、删 `sync_*` 三字段、删 `scripts/gate-record-debt-ledger.json` 登记项，**同一次提交** |

### 严重度修正（本次执行中发现的判断错误，如实登记）

接到需求时的初始判断是「任何用户点得到，会白送 Pro」——**这个判断是错的，追根溯源时被推翻**：

- `ipc-handlers/payment.js:66-68` 已有 `if (!app || app.isPackaged !== false) return { code: REQUEST_ERROR, message: '模拟支付在生产环境禁用' }`
- `license-access-control.js:91-93` 把 `payment:simulate` 列入 `ADMIN_ONLY_CHANNELS`，`hasAccess` 对 `admin` 级只放行 `currentLevel === 'admin'`，**普通登录用户够不着**

**所以这不是安全漏洞，是 UI 诚实性缺陷**——正式包渲染一个点下去必然被拒的按钮，还标着「开发模式」给用户看。修复本身依然正确，但严重度、commit 措辞与后续优先级都应按「UX 缺陷」而非「安全漏洞」计。

### 遗留（不假装已闭合）

- **主进程 `app.isPackaged` 生产拦截仍是零测试覆盖**（`payment-ipc.test.js` 全程开发态）。本次只补了渲染进程侧，**未补主进程那条**——会让本 PR 同时含"改行为"与"补另一模块的锁"两件事，review 成本翻倍。建议单独一条 PR：加 `isPackaged = true` 形态的拒收用例。
- **`payment:create-order` 属 public 通道**（`license-access-control.js:13`），正式包里普通用户**能创建订单并看到扫码页**——只是付不了款。是否一并门禁属产品决策，未动。
- **`¥99 /永久` 的价格文案本次未改**。产品已定「Pro 是订阅」，但 `UpgradeModal.vue:26` 仍显示 `¥99 /永久`、`confirm` 按钮仍显示 `确认支付 ¥99`。改成三档订阅形态需要同时对接 `plan-matrix.js` 与 `license-manager` 的授权模型（买断 vs 订阅两套体系尚未打通），属独立需求。
- **qm-5 第 1 步的完整历史依赖 GitHub API**：本地浅克隆下 `git log --follow` 不可信。已在 `.git/shallow` 3 边界 / 8 commits 处取证。
