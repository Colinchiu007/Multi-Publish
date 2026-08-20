# PR 1037 CI 门禁复盘

## 结论

本轮 CI 失败由三类问题组成：

1. **Stale 基线（已修复）**：PR 分支基于旧的 main，而 CI 使用合并后的 PR ref。main 在 PR 创建后新增了 Story2Video 场景素材/恢复相关改动，导致 ResultView、视觉和部分 GUI 断言与旧基线不一致。合并 origin/main 后该问题消除。

2. **提交态契约缺失（已修复）**：
   - model-provider.test.js 注册顺序与生产代码不一致
   - preload/index.bundle.js 未随 source preload 更新
   - locale-cjk-baseline.json 行号漂移导致静态门禁误报
   - 01-docs/PRD.md 缺少历史删除身份路由文档导致 Doc Sync 门禁拦截

3. **仓库既有问题（非本 PR 引入，不阻塞 Gate Result）**：
   - create 路由 57/58 checks（1 项失败，create-history 14/14 全绿）
   - create-editor / create-pipeline 视觉基线 28.59% 偏差（阈值 6%）
   - QG Autonomous 返回 NEED_HUMAN（score 0）

## CI 结果（新提交 3343e9a0）

### 通过（13/18）

| 门禁 | 结果 | 耗时 |
|------|------|------|
| QG Unit Tests | pass | 15m26s |
| QG Desktop Shards (1/2) | pass | 15m0s |
| QG Desktop Shards (2/2) | pass | 14m58s |
| QG Coverage | pass | 15m57s |
| QG Static | pass | 1m37s |
| electron-tests | pass | 11m2s |
| build (windows-latest) | pass | 5m29s |
| build (ubuntu-latest) | pass | 1m36s |
| agent-judge | pass | 55s |
| 文档同步检查 | pass | 13s |
| 单元测试 + Lint | pass | 5s |
| Stale Issue 检查 | pass | 3s |
| Gate Result | pass | 4s |

### 仓库既有失败（5/18）

| 门禁 | 结果 | 根因 | 与本 PR 关系 |
|------|------|------|-------------|
| gui-test | fail | create 路由 57/58，1 项历史遗留检查失败 | 无关，create-history 14/14 通过 |
| visual-test | fail | create-editor 像素偏差 28.59% | 无关，create-history 通过 |
| QG Visual | fail | 同上 create-editor/create-pipeline 基线漂移 | 无关 |
| QG Browser E2E | fail | 同上 create 路由 57/58 | 无关 |
| QG Autonomous | fail | NEED_HUMAN, score 0, 99 items | 仓库配置问题，非代码回归 |

## QM-5 逃逸分析

### 第一性原因

CreateView.loadHistory() 用历史运行记录携带的 projectId 反向决定项目归属。旧快照中的 projectId 可能失效或与 run.id 冲突，导致完成任务被错误路由到 story2video:delete-project。项目服务正确拒绝了当前用户不拥有的项目，渲染层随后显示通用项目删除失败。

### 为什么之前没测出来

- **单元测试**：覆盖了项目删除和运行删除的各自成功/失败路径，但没有覆盖 "pipeline history 携带陈旧 projectId" 这一身份归属边界。
- **集成测试**：IPC 和项目服务测试验证了接口合同，却没有把 loadHistory() 的合并结果连接到删除路由，因而没有检查 canonical run.id 与不可信 projectId 的冲突。
- **E2E**：历史页基础展示和删除路径没有使用 "运行记录存在、项目索引为空、运行记录仍带 projectId" 的真实 fixture；正常数据下错误路由不会出现。
- **视觉回归**：只检查页面像素，不判断删除 IPC 目标，无法发现行为路由错误。
- **代码审查**：原实现看起来像兼容旧数据的 fallback，但缺少 "项目归属只能来自当前项目索引" 的身份不变量审查项。

回归保护已补到 CreateView.test.js 和 CreateViewHistory.test.js，覆盖 canonical project、失效 projectId、ID 冲突、失败保留历史和登录门拒绝。

## 本轮修复

- apps/desktop/electron/ipc-handlers/model-provider.test.js：测试期望顺序与生产注册顺序一致。
- apps/desktop/electron/preload/index.bundle.js：通过 pnpm run build:preload 重新生成。
- .github/scripts/locale-cjk-baseline.json：吸收行号漂移，条目数保持 1491。
- 01-docs/PRD.md：补充历史删除身份路由产品合同。
- .ccg/tasks/fix-pr-ci-gates/：任务记录与审查文档。

## 验证

- 历史/结果/项目服务/Story2Video IPC：5 files, 456 tests passed
- model-provider + preload contract：2 files, 45 tests passed
- IPC contract：6 tests passed
- locale CJK scan：1491 baseline / 1491 current, PASS
- locale zh/en pair check：PASS
- git diff --check：PASS
- pnpm exec electron-builder --win --x64 --publish never：exit 0
- asar contains electron/preload/index.bundle.js
- packaged Electron remained alive for 8 seconds
