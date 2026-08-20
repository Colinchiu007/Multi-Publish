# PR 1037 CI 门禁复盘

## 结论

本轮失败由两类问题组成：

1. PR 分支基于旧的 main，而 CI 使用合并后的 PR ref。main 在 PR 创建后新增了 Story2Video 场景素材/恢复相关改动，导致 ResultView、视觉和部分 GUI 断言与旧基线不一致。
2. 旧分支还缺少三项可确定修复的提交态契约：model-provider 测试注册顺序、preload bundle 生成物、CJK 行号基线。

本次已处理第二类问题，并将最新 origin/main 合并到 PR 分支。历史删除业务修复没有被改写。

## QM-5 逃逸分析

### 第一性原因

历史删除问题的第一性原因是 CreateView.loadHistory() 用历史运行记录携带的 projectId 反向决定项目归属。旧快照中的 projectId 可能失效或与 run.id 冲突，导致完成任务被错误路由到 story2video:delete-project。项目服务正确拒绝了当前用户不拥有的项目，渲染层随后显示通用项目删除失败。

### 为什么之前没测出来

- 单元测试：覆盖了项目删除和运行删除的各自成功/失败路径，但没有覆盖 pipeline history 携带陈旧 projectId 这一身份归属边界。
- 集成测试：IPC 和项目服务测试验证了接口合同，却没有把 loadHistory() 的合并结果连接到删除路由，因而没有检查 canonical run.id 与不可信 projectId 的冲突。
- E2E：历史页基础展示和删除路径没有使用“运行记录存在、项目索引为空、运行记录仍带 projectId”的真实 fixture；正常数据下错误路由不会出现。
- 视觉回归：只检查页面像素，不判断删除 IPC 目标，无法发现行为路由错误。
- 代码审查：原实现看起来像兼容旧数据的 fallback，但缺少“项目归属只能来自当前项目索引”的身份不变量审查项。

回归保护已补到 CreateView.test.js 和 CreateViewHistory.test.js，覆盖 canonical project、失效 projectId、ID 冲突、失败保留历史和登录门拒绝；项目服务和 IPC 也有对应合同测试。

## 本轮 CI 修复

- apps/desktop/electron/ipc-handlers/model-provider.test.js：测试期望顺序与生产注册顺序一致。
- apps/desktop/electron/preload/index.bundle.js：通过 pnpm run build:preload 重新生成，补齐 source preload 中已存在的 IPC API。
- .github/scripts/locale-cjk-baseline.json：按仓库门禁规定吸收 CreateView.vue 行号漂移；条目数保持 1491，未新增中文命中。

## 验证

- 历史/结果/项目服务/Story2Video IPC：5 files, 456 tests passed
- model-provider + preload contract：2 files, 45 tests passed
- IPC contract：6 tests passed
- locale CJK scan：passed, 1491 baseline / 1491 current
- locale zh/en pair check：passed
- git diff --check：passed
- pnpm exec electron-builder --win --x64 --publish never：passed
- asar contains electron/preload/index.bundle.js
- packaged Electron remained alive for 8 seconds

## Review 说明

本地审查未发现 Critical 问题。Antigravity 后端因当前地区不可用，Claude 审查进程在超时后停止；两者均已尝试，未把不可用的外部审查结果伪装成通过。独立本地测试、打包和静态合同检查作为替代证据。

