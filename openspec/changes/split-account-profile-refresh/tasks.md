# 任务：拆出账号资料刷新簇

## 1. 基线与「先改锚、后搬家」

- [x] 1.1 记录改动前绿色基线：`account-manager-profile` / `-relogin-status` / `-toutiao-render-crash` / `account-manager.test` / `tests/account-manager-extract-info` 五文件全绿（实测 `Test Files 5 passed (5)`，rc=0）
- [x] 1.2 先把 `account-manager-profile.test.js:276` 的结构守卫改成「两个锚点都必须先断言存在、缺失即红」的形态
- [x] 1.3 对改锚后的守卫做**锁本身**的反证（三条，实跑于搬家前）：① `checkLoginStatus` 改名 → 该守卫红；② 摘掉一处 DOM 回填 → 红；③ 摘掉两处 HTTP 出口回填 → 红；三条还原后源文件 md5 一致
- [x] 1.4 旧/新守卫对照模拟（四种变异的内存模拟，不写盘）：结论是改锚属**预防性加固**（本次搬家保留了同名委托，`indexOf` 仍命中，我最初预言的 -1 假绿并未发生），当下真正新增的抓得住的回归是 **HTTP 出口计数**（旧守卫绿 / 新守卫红）。文档措辞已按实测收敛

## 2. 拆模块（行为保持）

- [x] 2.1 新建 `apps/desktop/electron/publishers/account-profile-refresh.js`，移入 `extractAccountInfo` / `extractAccountInfoFromWebContents` / `refreshProfileFromPage` / `refreshProfileFromHttpApi`；`isSafePathSegment` 由调用点注入；MUST NOT require `./account-manager`
- [x] 2.2 `account-manager.js` 的 4 个函数改为单行委托，对外导出名与签名零变化；`checkLoginStatus` 内 4 处调用点（533/576/627/657）不动
- [x] 2.3 新增 `account-profile-refresh.test.js`：新模块直接特征测试（四条纪律各一条）+ 反向接线锁（`account-manager.js` 不得再直接组合 `profileUtils.collectWith*` 与 `/api/accounts/` PATCH）
      实得 17 例；连同既有 5 个文件共 6 文件 **131 passed**（基线 5 文件 114 passed，逐文件核对未减少）

## 3. 回归与门禁

- [x] 3.1 第 1.1 条的五个文件 + 新测试全绿，且**测试总数不得减少**（防止搬家时把用例连锅端走）
      实测 **6 文件 131 passed / 0 failed**（基线 5 文件 114 passed；新模块 17 例），逐文件核对未减少
- [x] 3.2 `pnpm vitest run electron` 全量对照；任何红必须先归因（既有缺陷 / 本 PR 引入），既有缺陷须给出控制实验
      全量 `pnpm vitest run electron` = **415 passed | 2 failed | 1 skipped（418 文件），8074 passed**。两条红均在本刀改动面之外：① `feedback.test.js` = `EPERM symlink`（本机非提权不能建符号链接，既有缺陷）；② `story2video-manual-assets.test.js:685` = `expected false to be true`（与 HEAD 逐字节相同、单跑同样红、与 `account-*` 无 require 关系）——属 main 既有红，已单独报告，不在本刀顺手修
- [x] 3.3 `eslint` 改动文件 rc=0；`check-max-lines.js` 通过（**登记值不动**——1061 已低于实测 1096，改成实测值等于放宽上限，见 design.md「债务登记」段）；`check-debt-budget.js` 五项在基线内；`check-unwired-tests.js` 通过（新测试文件须被 vitest workspace 收集，或显式接线）
      eslint 四个改动文件 rc=0（另有 2 条 `Unused eslint-disable directive` warning：把 `git show HEAD:` 版本落成同目录探针文件跑同一条检查，HEAD 同样报这 2 条，第二条行号只是从 856 挪到 784 ⇒ 既有，不属本刀）；`check-max-lines.js` rc=0（登记值不改，理由见 design.md）；`check-debt-budget.js`、`check-unwired-tests.js`、`openspec validate --strict` 均通过；新测试文件被 vitest workspace 收集（全量汇总行里出现其文件名）
- [x] 3.4 QM-1：离线打包（`build:vue` + `electron-builder --win --x64 --dir --config.electronDist`）**并补做「启动 8 秒捕获 stderr」**——本刀改了 `electron/` 代码，打包是强制门禁；这一子项同时销掉 `.quality-gates.md` 里 #2527 记录挂着的 `[~]`
      打包 rc=0（首跑失败一次：`--config.electronDist` 传相对路径时因 node-linker=hoisted 解析不到 electron/dist ⇒ ENOENT，改绝对路径通过）；asar 内含新模块；隔离 `--user-data-dir` 启动 8 秒存活，隔离 profile 日志 224 行含「主窗口已显示」，四类禁止模式均未出现
- [x] 3.5 反证实跑：① 摘掉 `guardProfilePatchBySource` 调用 → 昵称保护用例红；② 把「资料回填失败」改成抛错 → 「不影响登录态」用例红；③ 把委托改成 no-op（返回固定值）→ 接线锁红；④ 新模块加一句 `require('./account-manager')` → 成环锁红
      实跑结果：① 摘掉 `guardProfilePatchBySource` → **2 红**（`account-manager-profile` 的 T9 回填例 + 新模块的「保护必须在 PATCH 之前」）；③ 委托改 no-op → **2 红**（T9 回填例 + 新模块的接线锁）；④ 新模块 `require('./account-manager')` → **1 红**（成环锁）；⑤ `catch` 不再吞异常 → **1 红**，红因精确等于「采集抛错 → false + warn（资料是增强信息…）」那条；四条还原后源文件 md5 一致。**② 是我构造的一个等价变异，不构成反证**：把 warn 换成 `throw` 后仍被同一个 `catch` 吞成 `return false`，可观测行为不变 ⇒ 17 例全绿。结论按事实写：纪律「回填失败绝不影响登录态」是**结构性成立**（外层 catch 兜住），要证伪必须破坏兜底本身，于是补了 ⑤。

## 4. QM-6 双模型外部评审

- [x] 4.1 按 `~/.claude/.ccg/config.toml` 的 `[routing]` 取模型名（**不得**在文档里写死），后端 + 前端两路并行审查实现 diff
      实测：`[routing.backend].primary=codex` 一路**已跑完并落盘** `openspec/changes/split-account-profile-refresh/review-backend.md`（8060 字节，含 1 Critical / 2 Warning / 3 Info）；`[routing.frontend].primary=claude` 一路**两次尝试均失败**——wrapper 报 `claude completed without agent_message output`，且两次直连 `claude -p` 探针 120s/180s 零输出超时（rc=124、bytes=0），未产生任何发现文件。⇒ QM-6 双模型**只达成一半**，不拿单模型冒充双模型
- [x] 4.2 Critical 必须修复后才能合并；Warning 逐条处置并记录
      C1 已修（HTTP 快速路径读不到真源就不写）并补 2 条回归；W1 已补 HTTP 委托结构锁；W2（本条与台账不一致）已回填 3.4/5.1–5.3；I1（Scenario 实为 5 条）已按事实改计数；I2/I3 判为不改（探针已说明当前无绕过点、`body.length` 断言近乎恒真但锚点断言才是实质）。反证新增三条且全部实跑、红因精确命中：⑥ 摘掉 C1 早退 → 「真源 GET 失败 → 绝不发 PATCH」红；⑦ HTTP 委托改链 → 委托结构锁红；⑧ 摘掉 HTTP 分支真 guard → 「manual 命名不得被抓取结果覆盖」红

## 5. 文档回写与交付

- [x] 5.1 `CHANGELOG.md` 顶部前置条目（按字节前插，禁止整文件改写行尾）
      含 C1 行为修正条目
- [x] 5.2 `.quality-gates.md` 执行记录（含 1.3 / 3.5 反证的实测数字与 QM-1 的 8 秒 stderr 结论）
      含 QM-6 单侧达成的如实记录
- [x] 5.3 更新 `openspec/changes/archive/2026-09-28-split-account-manager-session-restore/tasks.md` 的 T4.4 勾（销账必须与实现同 PR）；`max-lines-baseline.json` 按上述结论**不改**
      T4.4 已销账；max-lines 登记值按 design.md 结论不改
- [ ] 5.4 开 PR → 挂 squash 自动合并 → 顶栏冲突按「整份取上游 + 前置我的字节前缀」自愈 → 合并后在 main 复验并清理工作区/分支
