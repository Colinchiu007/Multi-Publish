---
record: fix-film-engineering-three-defects
task: 修影视工程三处静默失真——台账复用只比数量、批次确认看不到本批上下文、LLM 润色开关在出厂构建里永不生效
date: 2026-10-07
---

## 本次执行记录：影视工程三处静默失真修复（fix-film-engineering-three-defects，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | **代码变更**（14 文件全 M）。`classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=false` ⇒ 不得借道 docs-only 快速通道，走完整质量节拍。分支 `fix-film-engineering-three-defects` → PR #3110，未直推 main |
| 第一性原因（QM-5 ①） | PASS | `git log -S` 实测（已 `--unshallow` 到 4572 提交，浅克隆下 `-S` 只会命中边界提交，不可用）：③ 引入于 `a3a93913`（2026-08-15，`llm: null` **从第一天就在**）；① ② 引入于 `7aff2b33`（2026-09-23）。**三处均为原始设计缺陷，非回归** |
| 逃逸分析（QM-5 ②） | PASS | ① `sameShape` 分支**从未被任何测试走过**（测试只覆盖 `loadLedger 损坏→null`）；② 视图测试只测入口按钮，**从未测 batching 阶段渲染内容**；③ `enhance` 契约被 mock 测得很好，但**无任何测试断言生产环境真的注入了 llm**——契约两端各测一半，接缝无人验 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增/改写 **13 条**用例（`production-driver` +4、`FilmEngineeringView` +3、`FilmCanvasView.actions` 整组替换为 +4、`useFilmEngineering` 改 3 新 2）。**3 组变异反证全部实测**：拆 `sameShotIds`→2 红；删 `batchCard` 行→2 红；塞回 LLM 复选框→1 红；各自还原后全绿 |
| 防止再次发生（QM-5 ⑤） | PASS | ① `production-driver.js` 注释写明「taskId 是用户手输的，故必须比对 shotId 本身」；② `useFilmEngineering.js:310-313` 写明快照演进必须「多余字段忽略、缺失字段不阻塞」并点名「字段被删、断言还在」即本 bug 形态；③ `pipeline-model-preflight.js` / `film-engineering-stages.js` 把**未来接线的位置**写进代码，而非仅标「已废弃」 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 相等（无删除行 ⇒ 无 CRLF 幽灵行）。全部改动文件纯 LF：`CR=0 / NUL=0 / BOM=False` |
| 接线棘轮 | N/A | 未新增 `*.test.js` 文件（全部在既有测试文件内追加），不涉及 workflow 接线 |
| QM-1 打包 | PASS | **运行时代码变更（`apps/` 下 8 个源文件）⇒ QM-1 适用，不适用 N/A**。打包证据取自 CI `build` job（结论 success，run 对应 head `3ff6542`）——该 job 产出 Electron 安装包，本次改动不新增依赖、不改 `package.json` / `files` glob / asar 资源清单，故打包面无变化。未改 `pnpm-lock.yaml`。|
| QM-4 视觉 | N/A（已确认非跳过） | 该视图**无像素基线**：`apps/desktop/tests/visual-testing/views/` 下无 film 相关用例，无基线可回归。改动为既有列表行内新增一行文本 + 一个 CSS 类（`.fe-vg-shot-meta`），未改布局结构、未新增路由/组件/全局样式，故不触发像素基线失效。CI `QG Visual` job 实跑 success。|
| locale 成对（Gate 7） | PASS | zh/en `filmEngineering` 命名空间 **204 ↔ 204 键完全对称**（删除 3 键后仍对称）。CI Gate 7 `check-locale-sync.js` 需 git ref，在无 `.git` 的测试副本内不可跑，改以键集直接比对取证 |
| QM-6 CCG 双模型外部评审 | **未执行（环境不具备）** | `sh scripts/deep-review.sh --check-deps` 实测：`claude`（评审主力）MISS、`opencode`（跨家族校验）MISS、`codeagent-wrapper` 候选路径是 Windows `.exe` 形态与本 Linux 沙箱不匹配；脚本自述「没有任何评审后端可用 —— 深度审查根本起不来」。按 AGENTS.md「CCG 未安装 → 告警并跳过，不阻断任务」处理，如实记「未执行」 |
| 远程同步 | PASS | 合并 commit `c44385bc2e4c5a60ad69c1cd0d9db013e614bc78`（`2026-10-10T16:39:17+08:00`），由 `git log origin/main --grep='(#3110)$' --format='%H|%cI'` 现场取证；`git ls-remote --heads origin fix-film-engineering-three-defects` 返回 **0 行**，证远端分支已删 |

## 测试证据

**跑测试的位置很关键**：本沙箱 `/workspace` 是 NFS（`stat -f` 实测 `/tmp=overlayfs`、`/workspace=nfs`），实测在同一份 store 上装依赖 NFS 需 5 小时量级、本地盘 **6.3 秒**。故测试在 `/tmp` 的工作树副本上跑，改动文件逐个 `cp` 同步过去（跑前 `diff -q` 验证源与副本一致）。

| 范围 | 结果 |
|---|---|
| `electron/services/film-engineering/`（19 文件） | ✅ 全绿 |
| `src/composables/useFilm*` + `src/views/Film*` + `src/i18n`（9 文件） | ✅ 全绿 |
| 改动文件 `node --check` | ✅ 5/5 |
| locale zh/en 键集对称 | ✅ 204 ↔ 204 |
| 债务基线 `maxFileLines` | ✅ 7 个改动源文件均不在 `scripts/debt-baseline.json` 内 |

**既有失败（与本次无关，已证）**：`electron/ipc-handlers/film-engineering.test.js` 的 `download-recycled` 用例报 `TypeError: Cannot read properties of undefined (reading 'ok')`。取证方式：`git archive origin/main` 导出**未改动的原版测试文件**跑，同样失败 ⇒ main 上既有，未在本次修复范围。

## 合并前 rebase（2026-10-10 补记）

PR #3110 开了约两天半后 `mergeable_state` 变 `dirty`——`origin/main` 已前进 **133 个提交**。按 AGENTS.md 判据① 执行 rebase，两处冲突全在 locale，处置记录如下（**不是**「剥标记、双方保留」那套通用解法）：

| 冲突 | 形态 | 处置 |
|---|---|---|
| `apps/desktop/src/locales/{zh,en}.js` | main 已把 `filmEngineering` 从内联大对象**重构成** `filmEngineering: { ...filmEngineeringZh }`（拆到 `locales/film-engineering/{zh,en}.js`）；本分支仍持有旧的 388 行内联块 | **采用 main 的拆分结构**，并把本分支的 3 个 locale 键删除**注入到拆分后的模块文件**里，内联块整个丢弃 |

若用「双方内容都保留」消解，两个 `filmEngineering` 键会同时存活 ⇒ JS 对象字面量后者覆盖前者 ⇒ **main 的拆分重构被整个静默回退**，且 `check-locale-sync` 对此**不报错**（它只校验 zh/en 成对，不校验文件自身自洽）。

**收口自查（全部实跑）**：
- `filmEngineering` 顶层键在 `zh.js`/`en.js` 中各**只出现 1 次**（确认拆分未被回退）
- 真解析器（`import()`，非 `node --check`）加载两个模块成功，**各 231 键、zh/en 完全对称、无 llm 残留**
- 重复 key 扫描：我的扁平扫描在缩进 4 报出 `title` 重复，逐处核对后确认**分属不同父对象**（顶层 `title` vs `production.title`），是检测器误报而非真重复

**rebase 后测试全部重跑**（`origin/main` 前进 133 提交，旧结论不作数）：film-engineering 19 文件全绿、composables+views+i18n 9 文件全绿、3 组变异反证重跑（2 红 / 2 红 / 1 红）后还原全绿。

> 运行环境提示：本次沙箱 `/workspace` 为 NFS、`/tmp` 为 overlayfs。装依赖实测 NFS 需 5 小时量级、`/tmp` 需 83 秒，**测试一律在 `/tmp` 的工作树副本上跑**，改动文件逐个同步并在跑前 `diff -q` 验证一致。

### 合并收口

- PR #3110 已 squash 合并，merge commit `c44385bc2e4c5a60ad69c1cd0d9db013e614bc78`（`2026-10-10T16:39:17+08:00`）
- 远端分支 `fix-film-engineering-three-defects` 已删除（`git ls-remote` 返回 0 行，现场取证）
- 三个 `sync_*` frontmatter 字段随本次回填删除。本记录**未**在 `scripts/gate-record-debt-ledger.json` 登记欠账——`openspec/records/` 体例的「远程同步」行不由该清单管控，`node scripts/check-gate-record-debt.js` 实测 OK
- 合并后复核 `origin/main` 上 `locales/zh.js` 仍为 `filmEngineering: { ...filmEngineeringZh }`，**main 的 locales 拆分重构未被本 PR 回退**（这是 rebase 冲突处置的核心验收点）

## 遗留（不假装已闭合）

- **磁盘产物与 shotId 无关联**：`runId` 由 `prod-<taskId>-b<N>` 确定性派生，同一 taskId 换分镜后 runId 不变。台账已正确重建，但磁盘上旧的 `shot_NNN.mp4` 仍会被磁盘复核判为「已完成」并跳过 —— **产物层面仍可能采纳旧片段**。彻底关闭需让产物文件名或 sidecar 携带 shotId，属独立改动。
- `download-recycled` 既有失败待独立排查。
- LLM 润色若将来接线：`ScriptAdapter` 的 `llm` 选项与 `enhance` 契约**原样保留**（有测试），但需同时改 `container.setup.js:453` 与 `film-engineering-stages.js` 的硬编码，两处位置已写进代码注释。
