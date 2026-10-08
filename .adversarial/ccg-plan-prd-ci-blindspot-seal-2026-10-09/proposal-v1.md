# PRD：把两处「PR 侧看不见」的门禁缺口变成可判 —— 暗档基线 与 vendored 契约镜像

- 日期：2026-10-09
- 分支/PR：`ci-quality-rhythm-whitelist`（缺口 B）、`visual-dark-pr-side-gate`（缺口 A，分两刀）
- 复杂度判定：M（跨 `.github/workflows/` + `scripts/` + 基线工件；触发 QM-6 双模型评审）
- 风险：**改「谁来守门」** —— 本 PRD 的两处改动都直接改变门禁的覆盖面，属 AGENTS.md「禁止自动合并情形」之一，已由用户于 2026-10-08 明确人工过目并授权。

---

## 1. 一句话

质量节拍有两处承诺在 CI 上**不成立**：①「基线新鲜度门禁拦得住暗色档漂移」——暗色档在 PR 侧根本没有渲染来源；②「文档白名单里的内容仍有门禁兜底」——vendored 契约镜像的漂移锁住在会被 docs-only 整片短路的 job 里。本 PRD 把这两处从「探测器」改回「防线」，并顺带解除 `.quality-rhythm/**` 每次改动都付全量重型 CI 的浪费。

## 2. 现场证据（全部当场取，不引记忆）

| # | 事实 | 取证命令/出处 |
| --- | --- | --- |
| E1 | main tip `a43287ac7`（PR #3159 深色可读性）的 Visual Tests **红** | `gh run view 37799089491 --json jobs` → JOB `visual-test`，唯一失败步骤 `Baseline freshness gate (same-run CI render)` |
| E2 | 违规 8 张**全是暗色档**，浅色套与四套全量视觉均 success | 同 run 失败步骤日志：`基线新鲜度：检查 41 张 / 违规 8 张 / 登记内动态漂移 0 张 / CI 无渲染 3 张 / 本次跳过 0 张` |
| E3 | 8 张清单与量级（`来源=pixel-gate`） | 同上：`accounts-list-dark` 16 px / `accounts-list-flag-on-dark` 16 px / `cloud-publish-dark` 11176 px(0.539%) / `create-history-dark` 18 px / `create-result-dark` 150 px / `publish-form-dark` 11108 px(0.536%) / `publish-history-dark` 144 px / `viral-analysis-dark` 773 px |
| E4 | PR 侧 `visual` job **不跑暗档**，Gate 7b 因此只能 `--partial` | `.github/workflows/quality-gate.yml` Gate 7 步骤只调 `test:visual:pixel` / `test:visual` / `test:visual:supplement`；Gate 7b 注释自述「本 job 不跑暗色套，所以只产出一部分基线的同源渲染」 |
| E5 | 暗档渲染在 `visual-test.yml` 里有现成产法，成本可忽略 | `visual-test.yml` 同一步骤内 `test:visual:pixel`(:90) 之后接 `test:visual:pixel:dark`(:100)；该步骤实测 15:18:58→15:19:47 = **49 s**（含两档） |
| E6 | 暗档当前渲染文件名与新鲜度查找器对得上 | `test-runner.js:553` 写 `` `${testName}${themeSuffix}-current.png` ``；`check-baseline-freshness.js:35` 的 `findRender` 回落 `<name>-current.png`（`from: 'pixel-gate'`） |
| E7 | vendored 镜像漂移锁住在**会被短路**的 job | `node --test scripts/quality-rhythm-spec-mirror.test.js` 现位于 `quality-gate.yml:252`，而 `static-gates` 起于 `:182` 且带 `if: needs.changes.outputs.docs-only != 'true'` |
| E8 | 该锁只需 Node 内建模块，可安全搬进无依赖安装的 `changes` job | `quality-rhythm-spec-mirror.test.js:8-11` 只 require `node:assert/strict` `node:fs` `node:path` `node:test` |
| E9 | 白名单与「去向对账表」是**双向 deepEqual**，加条目不登记当场红 | `scripts/classify-docs-only.test.js:177-207`（`GATE_COVERAGE_FOR_WHITELIST` 13 行 == `CI_IGNORED_PATHS` 13 项） |
| E10 | `.quality-rhythm/**` 内含 11 个可执行脚本，但本仓 CI 不执行它们 | `git ls-files .quality-rhythm \| grep -E '\.(js\|ps1\|sh\|py)$'` = 11；`check-unwired-tests.js:28` 的 `VENDORED_MIRROR = [".quality-rhythm/"]` 已把该树排除在测试扫描域外；全仓 workflow 正文里 `.quality-rhythm` 只出现在 E7 那行注释与 gate report 标题 |
| E11 | 先例：同一缺口已真实卡死全仓 | 本会话 #3114 遗留的镜像漂移使 `QG Static`（必需上下文）在 main 转红，**阻塞当时全部 13 个开放 PR**，由 #3116 收口 |

## 3. 缺口 A：暗色档在 PR 侧结构性不可判

### 3.1 第一性原因（QM-5 第 1 步）

不是 #3159 写坏了暗色样式——那是**有意的**可读性修复（别名桥接层 + 硬编码暗色覆盖）。第一性引入点是 **2026-09-29 把 Gate 7b 接进 PR 侧时只补跑了浅色两套 views**（`quality-gate.yml` Gate 7 的注释自述理由成立但结论不完整：它解决了「浅色基线的权威渲染域」，却把暗色基线永久留在 `--partial` 的 skipped 名单里）。从那天起，任何改暗色 CSS 的 PR 都在**无对照**的情况下合并，漂移只能在 main push 时暴露——而 main push 的暴露**不设阻断**（`Visual Tests` 不是必需上下文）。

### 3.2 逃逸链（QM-5 第 2 步）

| 层 | 为什么没拦住 |
| --- | --- |
| 单元/vitest | 暗色覆盖是 CSS 计算值，组件单测不渲染样式表 |
| `test:visual:pixel`（PR 必跑） | 只读浅色基线；暗色基线不在其域内 |
| Gate 7b（PR 必跑，防线） | `--partial`：暗色无渲染 ⇒ 记 `skipped` 并放行，**且 skipped 名单被解释为「本次没产图」而非「这个能力不存在」** |
| `Full visual suites`（main 阻断） | 四套全量比的是 6% 阈值，11176 px = 0.539% **整个吃掉**（同 dashboard 4.249% 失明的既有实测） |
| 代码审查 | 人审 diff 看不出「暗色基线该跟着刷」，且 PR 检查清单里没有这一项 |
| 唯一暴露点 | main push 的 `Baseline freshness gate` —— 事后、非阻断、无人认领 |

归类：**环境差异 + 门禁缺失**（判据在 PR 侧不存在，不是判据错了）。

### 3.3 系统性漏洞（QM-5 第 3 步，具体到文件）

`quality-gate.yml` 的 `visual` job（Gate 7 步骤）与其后的 Gate 7b 步骤之间缺一条**「判定域 == 渲染来源」的接线锁**：`check-baseline-freshness.js` 能如实报告 `skipped`，但没有任何东西在问「skipped 是否应该恒为空」。同族先例是 `visual-ci.test.js` 的「pixelTests 每条用例的基线都必须被白名单放行」——那把锁上线时当场抓出一处既有缺口；本次补的是它的暗色镜像。

## 4. 缺口 B：白名单与漂移锁的位置倒挂

`.quality-rhythm/**` 不在 `CI_IGNORED_PATHS` ⇒ 只改那份**文档镜像**的 PR 也判 `docs-only=false`，跑满 Desktop Shards + Coverage + Visual（实测重型 job 15 分钟量级）。而要把它放进白名单，AGENTS.md 的**进白名单前提锁**要求「它的校验必须先待在不会被短路的 job」——`scripts/quality-rhythm-spec-mirror.test.js` 现在恰恰住在被短路的 `static-gates`（E7）。

所以本 PR 的因果顺序是：**先把锁搬进无条件执行的 `changes` job，再放开白名单**。搬锁这一步单独就修掉一个真实缺口：只改主规格 `openspec/specs/**` 的 PR 本来就是 `docs-only=true`（`openspec/**` 已在白名单），今天那条锁对这类 PR **一次都不跑** —— 这正是 E11 那次全仓阻塞的上游。

## 5. 方案对比

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| A1（选） | Gate 7 补跑 `test:visual:pixel:dark`；比较结果不另设门禁（沿用 views 两套既有口径：0 px 严格强于 6%），退出码出声；Gate 7b 判定域随之覆盖暗档 | 复用已有产物与已有查找器（E6），零新机制，成本 ≈ +25 s（E5 实测两档合计 49 s） |
| A2 | 把暗档从 `--partial` 名单里"登记为已覆盖" | 否决：那是给「没测」写一句"算测过"，把盲区钉成契约 |
| A3 | 让 PR 侧也跑 `visual-test.yml` 全量 | 否决：四套全量在 PR 侧是重复付费（`visual-test.yml:11` 注释已记录"每次改 apps 都会跑两遍、占两台 runner"） |
| B1（选） | 锁搬 `changes` job 的「非 PR 早退之前」段（与 `check-gate-record-debt` 同段），再 `.quality-rhythm/**` 进白名单 + 对账表登记 + 三个 workflow 的 `paths-ignore` 同步 | 满足前提锁；顺带修 §4 末尾那条既有缺口 |
| B2 | 只加白名单不搬锁 | 否决：E9 的对账表当场红，且真把镜像漂移变成无人检查 |
| B3 | 只搬锁不加白名单 | 部分采纳为**最小可退路**：若评审认为 11 个可执行脚本进白名单风险偏高，则只搬锁（仍有独立价值），白名单另案 |

## 6. 验收标准

- **AC-1**（缺口 A，先决）：暗档 8 张漂移逐张归因为「#3159 的有意暗色改动 + 基线未刷」，且重建后同一 run 自证 `0 px`；`漂移未归因禁止重建` 不得被绕过。
- **AC-2**：PR 侧 `QG Visual` 的 Gate 7 日志出现 `test:visual:pixel:dark` 的实跑痕迹（主题行 `主题: dark（暗色）`），且 Gate 7b 的 `skipped` 名单**只含**真正无渲染的视图，暗色档不再出现在其中。
- **AC-3**：`QG Visual` 在暗档上从「不判定」变为「判定」——把任一张暗档改坏，PR 必须变红（变异反证）。
- **AC-4**：`.quality-rhythm/**` 进白名单后，`node scripts/classify-docs-only.js` 对只改镜像的 PR 判 `docs-only=true`，同时 `QG Changes` 仍执行镜像锁（读 CI 日志现场，不看代码）。
- **AC-5**：三个全量 workflow 的 `push.paths-ignore` 与 `CI_IGNORED_PATHS` 逐项一致（`workflow-contract.test.js` 现有断言，不得放宽）。
- **AC-6**：`QG Changes` 与 `QG Static` 全绿，且**本 PR 自身**在 PR 侧被暗档门禁覆盖（即 AC-2 的现场来自本 PR 的 run）。

## 7. 测试映射（先写测试再改，红→绿）

| 新增/修改的锁 | 位置 | 断言 | 变异反证（必须红） |
| --- | --- | --- | --- |
| PR 侧暗档接线锁 | `.github/scripts/workflow-contract.test.js` | `visual` job 正文含 `test:visual:pixel:dark` 且出现在 Gate 7 与 Gate 7b round2 **两处**；`--partial` 不得被摘 | 摘掉 dark 调用 ⇒ 红；只补 round1 不补 round2 ⇒ 红 |
| 判定域非空锁 | `apps/desktop/tests/visual-testing/visual-ci.test.js` | 暗色基线集合必须能在 `findRender` 口径下解析出渲染来源（镜像浅色那条既有「基线必须被白名单放行」锁） | 新增一张无渲染来源的暗档基线 ⇒ 红 |
| 白名单对账 | `scripts/classify-docs-only.test.js` | 名单与去向表双向 deepEqual；`.quality-rhythm/**` 行的 `commands` 必须命中 changes job 正文且全 workflow 只出现一次 | 加白名单不登记 ⇒ 红；把锁同时留在 static-gates 与 changes ⇒ "只出现一次"红 |
| 编码/行尾 | 流程层 | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致 | 不适用（本次含 PNG 二进制，逐文件核） |

## 8. 预算与副作用

- `visual` job `timeout-minutes: 20` 不变；实测两档像素合计 49 s，余量充足（不写「应该够」，够不够由本 PR 的 run 时长现场证）。
- 副作用：PR 侧从此**每一次**视觉 job 都会判暗档 ⇒ 暗色 CSS 改动必须同 PR 刷暗档基线。这是本 PR 的目的，但会让"只改浅色"的 PR 也多等两档采集；已在 §5 A1 记录取舍。
- 不做：不引入暗色全量四套、不改 6% 阈值、不动 `KNOWN_DYNAMIC`（现由用例钉为空）、不重建浅色基线。

## 9. 与既有门禁的关系

- QM-4 第 7 条「基线必须与比对环境同源」：本次重建一律取**本 PR head 的 CI 渲染**，禁止本机截图。
- 「观察者要报告自己的盲区」：`--partial` 的 skipped 逐个点名是既有能力；本 PR 把暗档从那份名单里**真正消掉**，而不是把名单注释掉。
- 「注册≠注入≠生效」：AC-4 明确要求读 CI 日志现场，不接受"锁的代码里写了"。
