# 实施清单（进度唯一来源）

## 阶段 1：OpenSpec 提案（本切片）
- [x] proposal.md / design.md / tasks.md / specs/video-clone-pipeline/spec.md
- [x] worktree + 分支 codex/video-clone-pipeline（隔离并发会话）

## 阶段 2：engine 核心（契约 + 编排）
- [x] packages/video-clone-engine/package.json（零依赖，node:test）
- [x] src/constants.js（层级/类型/平台/阶段/错误码）
- [x] src/errors.js（VideoCloneError + 分类表）
- [x] src/clone-report.js（validate/normalize/edit/sanitizeForIpc）
- [x] src/similarity.js（F4 四项指标 + 综合报告）
- [x] src/stage-executor.js（checkpoint/有界重试/fail-closed）
- [x] src/pipeline.js（adapter 注入 + run）
- [x] src/index.js

## 阶段 3：测试（node --test，零依赖）
- [x] clone-report.test.js（合法/非法/边界/编辑往返/IPC 脱壳）
- [x] similarity.test.js（指标 + 阈值 + 层级判定）
- [x] stage-executor.test.js（顺序/重试/checkpoint/fail-closed）
- [x] pipeline.test.js（happy/错误/请求校验/adapter 未实现）
- [x] `node --test packages/video-clone-engine/test/` 全绿

## 阶段 4：文档
- [ ] PRD 详细规格：数据校验 / 流程 / 功能逻辑 / 交互逻辑 / 显示项 / 提示文字（zh/en）/ 错误码
- [ ] CHANGELOG
- [ ] .quality-gates.md 执行记录
- [ ] CCG task 归档 + 记忆更新

## 阶段 5：交付
- [ ] commit → push → PR → 合并（核实远程状态）
- [ ] 后续切片（另行 change）：真实 ingest（yt-dlp/ffprobe）、analyze（ASR/镜头/风格）、plan（改写）、generate（provider 接入）、compose（ffmpeg）、publish（PublisherRouter）、UI 与桌面集成
