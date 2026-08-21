# s2v-publish-skip-jump — 双模型审查结果

日期：2026-08-21
审查范围：`codex/s2v-publish-skip-jump` worktree 工作区 diff（相对 `origin/main`）

## 审查模型

- opencode（前端/UI 视角）：`codeagent-wrapper.exe --backend opencode --lite --progress`，reviewer 角色。
- claude（架构/语义视角）：`codeagent-wrapper.exe --backend claude --lite --progress`，reviewer 角色。
  - 首次直接调用失败：本地 Claude 代理返回 `API Error: 400 thinking_budget`，探测后确认需
    `MAX_THINKING_TOKENS=0` 绕过（`claude -p` 冒烟 `PONG` 通过），降级/恢复后重跑成功。

## 合并结论

- 两模型均确认：无 Critical 问题；核心修复（发布跳过语义 + 后台完成跳转）正确、可合并。
- 合并后双方意见（去重）：

| 级别 | 位置 | 问题 | 处置 |
|------|------|------|------|
| MAJOR | CreateView.vue checkBackgroundRunCompletion | 后台完成跳转丢弃 `activeMs`，结果页丢失时长展示 | 已修复：透传 `story2videoRunMeta`（createdAt/endedAt/outputSizeBytes/activeMs），并新增 `query.durationMs` 断言 |
| MAJOR | CreateView.vue runOrchestrationInBackground | `loadHistory` 异常路径遗留监听标志、完成不跳转 | 已修复：先 `startBackgroundCompletionWatch()` 再 `await loadHistory()` |
| MINOR | CreateView.vue runOrchestrationInBackground | `orchestrationRunId` 重置前重复赋值（死代码） | 已修复：删除前置赋值 |
| MINOR | pipeline-engine.js _finalizeRun | 完成态持久化 `run.progress` 停在倒数阶段值（历史卡片 <100%） | 已修复：`status==='completed'` 时 `run.progress=100`，并断言 `getHistory().progress===100` |
| MINOR | CreateView.vue 遗留 stageStateClass/Icon | 不识别 `skipped` 会渲染成 pending | 已核对：该组方法未在模板引用（S2V 走 `StageProgress`），为遗留死代码；保持不动并记录 |
| MINOR | .github/scripts/locale-cjk-baseline.json | 行号位移导致基线重生成 | 已核对：106 added / 106 removed 全部限于 CreateView.vue，净值 1489→1489，`--cjk` 通过，无新增硬编码中文 |
| MINOR | handlePipelinePush 终态事件 | 终态 push 仍多发一次 getRunContext 确认 | 保留：progressOnly push 无 context/videoPath，结果页跳转必须全量快照确认 |

## 回归证据（审查后复测）

- `pipeline-engine.test.js` + `StageProgress.test.js` + `CreateView.test.js`：288 项通过
- `CreateView.test.js`：212 项通过（含后台完成跳转 + durationMs 断言）
- 宽集（48 文件 / 1354 项）审查前通过，Vite build 通过
- `check-locale-sync.js --pair-base`（提交后生效）与 `--cjk` 满足 CI Gate 7

结论：双模型审查通过，无阻塞项；已按上述 MAJOR/MINOR 完成修复与复测。
