---
record: add-encoding-integrity-gate
task: 新增文本编码完整性门禁（Gate 12b）——拦字面 U+FFFD 与非 UTF-8 文本，棘轮两层
date: 2026-10-07
---

## 本次执行记录：文本编码完整性门禁（add-encoding-integrity-gate，2026-10-07）

> 分支：`add-encoding-integrity-gate`；worktree：**沙箱内无法执行**（无 Windows + Git Bash）
> 范围：🔧 工具脚本 + CI 接线 —— 新增 `scripts/check-text-encoding-integrity.js`（含自测）+ `scripts/text-encoding-baseline.json`，改 `.github/workflows/quality-gate.yml` 加 Gate 12b
> 判定：`classify-docs-only` → **docs-only=false**（改了 `.github/workflows/`）⇒ 混合 PR，走完整质量节拍

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 动因（问题定位） | PASS | `01-docs/learnings.md` 在 main 上有 **7212 个字面 U+FFFD / 546 行受损**。溯源：`003589a`（2026-07-12）字面 U+FFFD=0 但有 **273 行 GBK 裸字节**（`b5 da ce e5` = 「第五」）；`origin/main` 字面 U+FFFD=7212、非 UTF-8 行=0 ⇒ **「把非法字节当坏字符清理」把合法中文洗成了 U+FFFD**。时间线：2026-07-17 首批 3606、2026-08-13 翻倍到 7212 |
| 影响面 | PASS | 全仓扫描：**15 个 tracked 文本文件**带损坏（不止 learnings.md）——`ai-autonomous-tester` 的 verifier/detector/path-resolver 共 430、`decision-log.md` 141、`scheduler.test.js` 3、`xiaohongshu.js` 2、**2 个 CSS 仍是 GBK 裸字节**。174 个非 UTF-8 文件里绝大多数是 `.mp4` 等二进制，已用 `BINARY_EXT` 排除出判据域 |
| 棘轮语义 | PASS | 与 `check-no-brand-residue.js` / `check-max-lines.js` 同构：基线在 `scripts/text-encoding-baseline.json`，**清单只能缩小**。存量 15 条登记在案不判红（否则无人能提交），新增即红；清干净一条跑 `--update-baseline` 收口 |
| 变异实测 ①（首版漏掉的洞） | **PASS（补洞后）** | 首版棘轮**只判「出现基线外的新文件」**。实测往已登记的 `ARCH-OPS-CENTER-RESILIENCE-2026-10-06.md` 追加 3 个 U+FFFD → **仍判绿**。已补第二层「基线内文件损坏量增加即红」，补后同样变异 → rc=1 并点名文件与增量（`U+FFFD 3→4 (+1)`） |
| 变异实测 ②（新损坏文件） | PASS | 新建含 U+FFFD 的 `01-docs/ZZ-encoding-mutation-test.md` 并 `git add` → rc=1，报错点名文件与数量。还原后回绿。⚠️ 未 `git add` 时不判红是**正确行为**——判据用 `git ls-files`，只管 tracked；提交时必然已 tracked，洞在 CI 侧是关闭的 |
| 自测（QM-3） | PASS | `node --test scripts/check-text-encoding-integrity.test.js` → **5 pass / 0 fail**，含两条变异用例 + 一条「基线每条必须含 fffd/nonUtf8 计数（第二层棘轮靠它）」的结构锁 + 一条「mp4 不得被判为编码损坏」 |
| 接线 | PASS | 挂在 `quality-gate.yml` 的 **changes job**（与 Gate 12 同族位置），**不在**被 docs-only 短路的 static-gates —— 依据 AGENTS.md「进白名单的前提锁：门禁的校验必须接线到不被 docs-only 短路的 job」 |
| workflow 契约 | PASS | `node --test .github/scripts/workflow-contract.test.js` → **32 pass / 0 fail**，新 gate 未破坏既有契约 |
| 品牌残留 | PASS | 扫描 7106 tracked 文件 |
| 债务 / max-lines / CHANGELOG / locale-sync | PASS | 全部在基线内；locale `--cjk` 与 `--keys` 均 PASS |
| 性能 | PASS | 本地 20s（`user 0.987s` / `real 20s`，95% 是沙箱 NAS 挂载的 I/O 等待）；对照既有 `check-no-brand-residue.js` 本地 23s，同量级 |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未改 `apps/desktop/electron/**`；无 UI 变更 |
| ⚠️ 踩坑记录 | — | **`.gitignore:106` 有 `scripts/*.js`** —— 新门禁脚本必须 `git add -f` 才能入库，否则 `git add -A scripts/` 会静默跳过（本次就中了一次，直到 `git status` 才发现文件没进暂存区） |
| ⚠️ 踩坑记录 | — | 自测文件首行写成 `# @ts-check` → JS 里 `#` 开头是 SyntaxError（只有 `#!` 是 hashbang）。同族 `check-no-brand-residue.test.js` 用的是 `/**` 块注释 |
| 远程同步 | PASS —— PR #3032 已合并为 `origin/main` b7c1a83（2026-10-07T12:21:12+08:00，squash merge，CI 19 success / 1 skipped / 0 failure）；远端分支 add-encoding-integrity-gate 随合并自动删除 |

### 首轮 CI 实证：门禁在合入前就抓到了自己

PR #3032 首次 CI `QG Changes` + `Gate Result` 红，日志：

```
❌ 新增 2 处编码损坏（基线外，清单只能缩小）：
  + scripts/check-text-encoding-integrity.js:     U+FFFD × 4（首现行 8）
  + scripts/check-text-encoding-integrity.test.js: U+FFFD × 2（首现行 38）
```

**新门禁把自己的源码判成了损坏**，两层根因：
① 检测器不能包含被检测的模式——注释里为举例写了 U+FFFD 字面量；
② 基线在 `git add` 之前生成，而判据域是 `git ls-files`，脚本自己没进基线。

修法：注释改文字描述 + 脚本头部写死自指约束（**本文件自身不得出现字面 U+FFFD，注释里也不许**）
+ 自测改用 `String.fromCodePoint(0xFFFD)` 构造 + 重新 `--update-baseline`。
第二轮 CI 起 `QG Changes` 即绿。选码点构造而非显式自指豁免：豁免是特例，
会被后人当模板抄走；码点构造让脚本在**结构上**就踩不到自己。

### 遗留（不假装已闭合）

- **存量 15 个文件仍带损坏**，只登记不修。`learnings.md` 那 546 行里，**220 行是纯中文、连一个 ASCII 锚点都没有**，无法回溯到 2026-07-12 的干净版；326 行有 ASCII 锚点但需逐条验证幸存字节是否对得上。硬恢复有「静默污染一份经验库」的风险，未做。
- **`ai-autonomous-tester` 的 430 处**分布在 `verifier/requirements-verifier.js`(326)、`detectors/feature-detector.js`(63)、`utils/path-resolver.js`(41)，**这四个是运行时代码不是文档**——它们的 U+FFFD 是否影响行为（尤其 verifier 在做断言比对）**未验证**。建议单独开一条排查。
- **2 个 CSS 仍是 GBK 裸字节**（`staggered-reveal.css` 11 行、`Collection.polish.css` 1 行），未修。它们是**构建输入**，会进产物。
- **QM-6 双模型外部评审未执行**：沙箱内无可用外部评审后端，不以自审冒充通过。
