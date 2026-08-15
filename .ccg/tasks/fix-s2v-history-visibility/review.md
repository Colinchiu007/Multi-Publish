# 评审报告：fix-s2v-history-visibility

## 评审方式

- 按 CCG 规则 M 复杂度应双模型并行评审；antigravity 后端地区不可用、claude wrapper 连续 `exit 1` 无输出（机制硬化：不盲等，降级为主代理自审），已记录于计划。
- 主代理自审基于：代码事实（`_finalizeRun`/`loadHistory` 原文）+ 定向回归 + 打包产物验证。

## 变更清单

| 文件 | 变更 |
|------|------|
| apps/desktop/electron/services/pipeline-engine.js | `_finalizeRun` failed/cancelled 时同步当前 stage 终态 + completedAt（幂等） |
| apps/desktop/src/views/CreateView.vue | loadHistory 排序：运行中 → 暂停/失败 → 已完成项目 → 其他终态，各组按 updatedAt||createdAt 倒序 |
| apps/desktop/electron/tests/pipeline-engine.test.js | +1 例（failed/cancelled stage 终态同步） |
| apps/desktop/src/views/CreateView.test.js | +1 例（失败/暂停排在已完成项目之前） |
| 01-docs/PRD.md / PRD-video-creation.md / CHANGELOG.md / learnings.md | 合同 + 复盘 |
| .github/scripts/locale-cjk-baseline.json | CreateView 排序代码净增 3 行后，按官方 `--update-baseline` 重锚 38 条存量 CJK 行号；总数保持 1530 |
| .ccg/tasks/fix-s2v-history-visibility/ | task.json 推进 |

## 自审结论（0 Critical / 0 Warning / 0 Info）

### 正确性
- `_finalizeRun` 早退守卫 `!run || run.endedAt` 不变；新增分支仅对 failed/cancelled 生效，completed/paused 路径零影响。
- `cancel()` 先置 `stage.status='cancelled'`（L908）→ `_finalizeRun` 再置一次 + completedAt，幂等；无 endedAt 竞态（首次 finalize 即返回）。
- 排序改动保持 running 置顶（既有轮询/重挂契约依赖 running 检测，不依赖位置），项目条目（projectId 键）未被 runs 过滤逻辑触碰。
- `historyTime` 对非法日期回退 0，sort 稳定（V8 稳定排序），无 NaN 比较。

### 风险核对
- 未改 IPC 契约、未改 stage 状态机其它流转点（pause/resume/advance 原样）。
- 前端失败任务 pausedStage 补位逻辑本就优先 `stage.status==='failed'`（CreateView L3776-3777），主进程修复后该分支命中更准，不回退到末位兜底。
- 无新增中文字面量；CI Gate 7 首轮因 `file:line` 基线脆弱性误报 38 条存量中文，官方 `--update-baseline` 重锚后条目总数仍为 1530，确认未吸收新增硬编码；无 locale 变更。

### 测试/打包证据
- pipeline-engine + pipeline-story2video-contract + batch queue 84/84；CreateView + CreateHistory 217/217；定向受影响测试合计 301/301。
- QM-1：electron-builder --win --dir exit 0；asar list/临时验证确认产物包含新增「终态同步」逻辑。
- Vite production build exit 0；全量 Vitest 未形成最终汇总，运行在外部评估器 CLI 用例处中止，未计入通过证据。

## 过程事故与教训（已闭环）

- **asar extract-file 覆盖源文件事故**：`asar extract-file app.asar electron/services/pipeline-engine.js` 会把文件输出到 CWD 相对路径，覆盖仓库源文件；随后清理误删源文件导致 phase1-context 套件 11 例瞬时失败。已从 HEAD 恢复并重新应用修改，重跑 56/56 通过；全量 vitest 已重跑。教训：asar 校验只允许用 `asar extract <tmp 目录>` 或 `list`，禁止在仓库内用 extract-file 输出；删除任何「提取产物」前先确认路径。
- **CJK 基线首轮 CI 误报**：`CreateView.vue` 的排序逻辑净增 3 行，扫描器却以 `file:line` 作为命中 ID，导致该位置之后 38 条既有中文全部被识别为新增。按脚本明示流程运行 `node .github/scripts/check-locale-sync.js --cjk --update-baseline`，基线仍为 1530 条，再运行 `--cjk` 通过。系统性漏洞是行号型基线对无关代码位移敏感；本次只重锚，不迁移无关既有文案。
