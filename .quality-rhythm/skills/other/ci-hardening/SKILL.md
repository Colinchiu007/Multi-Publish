---
name: ci-hardening
description: "CI/CD 硬化与优化（自托管 runner 迁移、并行拆分、触发去重、路径门控、affected 测试选择、大套件分片、workflow 契约测试同步）。Use when (1) 把 GitHub Actions job 从自托管/ECS runner 迁到 GitHub 官方 runner；(2) CI 单 job 串行过长需要并行拆分与触发去重；(3) 无关改动触发全量 CI（改文档也跑全套）需要路径门控；(4) workspaces monorepo 想只跑受影响测试（Nx affected + 缓存）；(5) 大测试套件是 CI 关键路径需要跨 runner 分片；(6) 修改 .github/workflows 前需要全仓排查契约测试；(7) 为新的 Node/Electron 项目初始化质量门禁（并行 Quality Gate + 本地 .quality-gates.md + Electron CI）。"
---

# CI Hardening

把「CI 迁移判断、瓶颈实测、并行拆分、触发去重、路径门控、affected 选择、大套件分片、契约同步」沉淀为可跨项目复用的方法与模板（源于 Multi-Publish 2026-08-09 实战：electron-tests 迁移 GitHub runner 7.5min、Quality Gate 25min→12min、路径门控文档改动 0 CI、Nx affected + 缓存、桌面分片单测 11→6.4min）。

## 何时使用（触发）
- 用户要求 CI 更快 / 排队 / 迁移 runner / 优化 Quality Gate。
- 无关改动（文档/流程/配置）触发全量 CI，希望门控跳过。
- workspaces monorepo 希望只跑受影响测试 / 复用缓存。
- 大测试套件（如桌面 5000+ 用例）是 CI 关键路径，希望分片并行。
- 修改或新建 `.github/workflows/*.yml`。
- 为新项目初始化质量门禁体系。

## 使用步骤

> **路径说明**：本技能已并入质量节拍仓库（`skills/other/ci-hardening/`）。下方命令以技能目录为 cwd；若从质量节拍仓库根或其他位置调用，请使用完整路径：
> - 技能目录：`node scripts/apply-ci-hardening.js ...`
> - 质量节拍仓库根：`node skills/other/ci-hardening/scripts/apply-ci-hardening.js ...`

1. **读方法论**：`references/methodology.md`（M1 迁移判断法 / M2 优化法 / M3 契约同步法 / M4 三层门禁 / M5 交付节奏 / M6 路径门控法 / M7 affected 选择+缓存法 / M8 大套件分片法 + 通用清单）。
2. **初始化新项目门禁**（B+C 集成）：
   ```bash
   node scripts/apply-ci-hardening.js --repo <target> [--with-electron] [--dry-run]
   ```
   生成：并行 `quality-gate.yml`（触发去重）+ `.quality-gates.md`（本地清单）+ 可选 `electron-ci.yml`。可在目标仓库放 `ci-hardening.config.json` 覆盖占位符（见脚本 DEFAULTS）。`install-mechanism.js` 会自动调用本脚手架为新项目渲染门禁产物。
3. **优化既有 CI**：先 `node scripts/analyze-ci-steps.js <run-id>` 实测瓶颈（M2），再并行拆分；单测是瓶颈时套 M8 分片；无关改动触发全量时套 M6 路径门控；workspaces monorepo 套 M7 affected。
4. **预测受影响测试**：`node scripts/affected-report.js --base=<ref> --head=<ref>`（workspaces monorepo 通用，动态发现项目与依赖图，零依赖）。
5. **契约同步（必做）**：改 workflow 前全仓 grep 契约测试（`.github/scripts/*.test.js` 与 `*/tests/*.test.js`），改结构后本地跑通再推 CI。
6. **Electron 注意**：`@electron/rebuild` 必须在 vitest（Node ABI）之后、Electron 冒烟之前；保留 checksum pin 与镜像。

## 铁律
- 运行时代码/CI 变更禁止直改默认分支：隔离 worktree → 分支 + PR → PR 自身 CI 验证 → 合并 → 归档三同步 → 记忆。
- 本地通过 ≠ 交付通过：push 后必须确认 CI（Quality Gate）通过。
- 模板中的 `REPLACE_ME` 与占位命令必须替换为项目真实值，不得原样提交。
- 确定性测试套件上任何并行方案必须显式控并行度（`--parallel=1` / 每分片进程内串行），并断言核心属性而非字符串存在。
- 优化盯关键路径：分片/并行后瓶颈会转移（Multi-Publish：单测 11→6.4min 后 coverage 11.7min 成新瓶颈）。

## 资源
- `assets/templates/`：quality-gate.yml.tpl / electron-ci.yml.tpl / quality-gates.md.tpl（脚手架渲染，B）/ nx.json.tpl（M7）/ paths-ignore.yml.tpl（M6）/ shard-matrix.yml.tpl（M8，手动或 config 驱动）
- `scripts/`：apply-ci-hardening.js（脚手架，C）/ analyze-ci-steps.js（瓶颈分析）/ affected-report.js（受影响测试预测，workspaces 通用）
- `references/methodology.md`：方法论（A，M1-M8）
- `examples/ci-acceleration-multipublish.md`：Multi-Publish 三阶段实测案例（L3 参考：数据与决策记录，具体路径/阈值按项目另适配）
