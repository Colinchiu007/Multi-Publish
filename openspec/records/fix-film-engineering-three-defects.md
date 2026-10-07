---
record: fix-film-engineering-three-defects
task: 修影视工程三处静默失真——台账复用只比数量、批次确认看不到本批上下文、LLM 润色开关在出厂构建里永不生效
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在，回填需在合并后取 git log 证据
sync_backfill_owner: 合并后的后续 docs PR
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
| QM-1 打包 / QM-4 视觉 | N/A | 未新增依赖、未改构建产物。视觉回归：该视图**无像素基线**（`tests/visual-testing/views/` 下无 film 相关），改动为既有列表行内新增一行文本 + 一个 CSS 类，未改布局结构 |
| locale 成对（Gate 7） | PASS | zh/en `filmEngineering` 命名空间 **204 ↔ 204 键完全对称**（删除 3 键后仍对称）。CI Gate 7 `check-locale-sync.js` 需 git ref，在无 `.git` 的测试副本内不可跑，改以键集直接比对取证 |
| QM-6 CCG 双模型外部评审 | **未执行（环境不具备）** | `sh scripts/deep-review.sh --check-deps` 实测：`claude`（评审主力）MISS、`opencode`（跨家族校验）MISS、`codeagent-wrapper` 候选路径是 Windows `.exe` 形态与本 Linux 沙箱不匹配；脚本自述「没有任何评审后端可用 —— 深度审查根本起不来」。按 AGENTS.md「CCG 未安装 → 告警并跳过，不阻断任务」处理，如实记「未执行」 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#3110)$' --format='%H\|%cI'` 回填 merge SHA 与时间，`git ls-remote --heads origin fix-film-engineering-three-defects` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

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

## 遗留（不假装已闭合）

- **磁盘产物与 shotId 无关联**：`runId` 由 `prod-<taskId>-b<N>` 确定性派生，同一 taskId 换分镜后 runId 不变。台账已正确重建，但磁盘上旧的 `shot_NNN.mp4` 仍会被磁盘复核判为「已完成」并跳过 —— **产物层面仍可能采纳旧片段**。彻底关闭需让产物文件名或 sidecar 携带 shotId，属独立改动。
- `download-recycled` 既有失败待独立排查。
- LLM 润色若将来接线：`ScriptAdapter` 的 `llm` 选项与 `enhance` 契约**原样保留**（有测试），但需同时改 `container.setup.js:453` 与 `film-engineering-stages.js` 的硬编码，两处位置已写进代码注释。
