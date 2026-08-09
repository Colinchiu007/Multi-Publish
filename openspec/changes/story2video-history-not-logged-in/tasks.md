# Tasks — story2video-history-not-logged-in

## 审计与前置
- [x] 复现与根因：未登录(provider->null) → listProjects 抛「无法识别当前用户」→ IPC code!=0 → CreateView 弹 HISTORY_LOAD_FAILED；复现脚本 /c/tmp/ccg-image-prompts/repro-history.js
- [x] OpenSpec change 创建（proposal/design/specs/tasks）

## 实现（codex/story2video-history-not-logged-in 分支）
- [x] TDD：project-service 测试改为「未登录回退 legacy 可读写」+ store 缺失抛错 + 登录/legacy 隔离 + 忠实 mock（owner 二次解析分桶）
- [x] 实现：`_ownerSubject()` 未登录回退 `__legacy__`；`_readProjects/_writeProjects` 显式透传 owner 到 settings-store（Critical 修复）
- [x] 渲染端：CreateView 新增「未登录空历史不弹错」用例（service 修复后 code 0，无代码改动）
- 测试目标：story2video-project-service.test.js、CreateView.test.js、story2video.js ipc 测试

## 验证与交付
- [x] 聚焦回归：project-service 23 / CreateView 102 / story2video ipc + pipeline-engine + contract 78（181 用例全绿，self-hosted Vitest 串行）；真实 sql.js 端到端：未登录读写 legacy、登录隔离、切回保留（exit 0）
- [x] 双模型审查（Claude 两轮：首轮 2 Critical 已修复 → 复审无 Critical；antigravity 因 agy 缺失降级记录）
- [x] 文档：learnings 复盘 / PRD-video-creation §3.1.4.1 / CHANGELOG / quality-gates
- [ ] 提交 → push → PR → CI → 合并回 main
- [ ] 应用重启验证：未登录打开历史记录不再弹错
- [ ] OpenSpec archive + CCG 归档 + 记忆更新
