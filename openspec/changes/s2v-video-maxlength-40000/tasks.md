# Tasks

> 状态：实现中，待测试与门禁。

## - [ ] 契约层视频域上限 40000
  - [ ] `video-prompt-engine-contract.js` `videoMaxLengthMax` 20000 → 40000；`videoMaxLengthRanges.standalone` {200,20000} → {200,40000}
  - [ ] `video-prompt-engine-contract.test.js` standalone clamp 断言同步 40000（legacy [50,2000] 断言不改）
  - [ ] 共享 kernel 500 / refined 5000 / legacy 2000 断言不改（回归）

## - [ ] 落库上限视频专属 40000
  - [ ] `story2video-project-service.js` videoPrompt 三处 `safeText(..., 20000)` → 40000（图片 prompt 20000 不动）
  - [ ] `story2video-project-service.test.js` video regen `max_length=20000` 断言 → 40000；超长 5000 字符返回完整落库断言保持

## - [ ] 门禁与文档
  - [ ] 定向 Vitest（story2video-project-service + video-prompt-engine-contract）通过
  - [ ] QM-1 `electron-builder --win --x64` 打包通过
  - [ ] `01-docs/PRD-video-creation.md` 3.1.29.5 补充 40000；`01-docs/CHANGELOG.md` 置顶条目
  - [ ] `.quality-gates.md` 本次执行记录
  - [ ] openspec validate 通过
  - [ ] 双模型审查（可用时）或降级主代理直审记录
  - [ ] 推送 `codex/s2v-video-maxlength-40000` → PR（目标 main）→ CI 绿 → 合并（QG Autonomous 预存红按 #906 先例 admin 放行）
  - [ ] openspec archive + CCG task 归档（与引擎仓 change 三同步）
