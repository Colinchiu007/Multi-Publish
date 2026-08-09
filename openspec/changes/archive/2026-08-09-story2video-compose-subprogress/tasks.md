# Tasks: story2video-compose-subprogress

## 1. 引擎：compose() 新增 onProgress 进度发射

- [x] `story2video-compose-engine.js`：`compose(assetManifest, options, onProgress)`，内部 `_emitComposeProgress`（percent 取整/钳制/单调不降，done 仅成功 return 前），按权重表在 preflight/validated/逐片段/拼接/旁白/BGM/WebM/校验/成功处发射
- [x] 失败路径（7 条）不发射新值，percent 冻结 <100；`KNOWN_COMPOSE_PHASES` 单一来源导出；严格 typeof number 校验
- **测试目标**：`story2video-compose-engine.test.js` — 正常路径序列、7 条失败路径冻结（片段/拼接/旁白/BGM/WebM/校验/持久化）、单调性、normalize 校验

## 2. 执行器：COMPOSE 透传 onProgress 并字段级校验写入 context

- [x] `stage-executor.js` COMPOSE 执行器：`options.onProgress` 透传 composeVideo；回调内字段级 fail-closed 校验（KNOWN_COMPOSE_PHASES 惰性复用 + percent≥100 仅限 done + 严格数值）后写 `context.compose_progress`；执行器开头重置旧值（断点续跑不残留）
- **测试目标**：`stage-executor.test.js` — 合法写入、percent NaN/越界/total=0/未知 phase/强转穿透/非 done 100 不写入

## 3. 前端：子进度条 + 文案

- [x] `CreateView.vue`：`stageDetailText` compose 分支（segments 文案「正在合成片段 k/N · p%」/通用「视频合成 p%」）；`.stage-main` 子进度条（静态 data-testid `story2video-stage-compose-progress` + role=progressbar aria 语义，仅 running 且 percent 合法时渲染）；`composeSubProgressPercent` helper；`.stage-sub-*` CSS
- **测试目标**：`CreateView.test.js` 文案与渲染/降级断言；`story2video-ue-contract.test.js` data-testid 快照

## 4. 契约测试

- [x] `pipeline-story2video-contract.test.js`：composeVideo mock 触发 onProgress，断言 `getRunContext`/`getRunSnapshot` 暴露 `compose_progress`
- **测试目标**：上述文件内新增用例

## 5. 文档

- [x] `01-docs/PRD.md` 7.1.9.1：compose 子进度（数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字/边界/后续演进）
- [x] `01-docs/PRD-video-creation.md` 3.1.10：同步补充 + 1.6 修订记录
- [x] `CHANGELOG.md`：变更条目
- **测试目标**：无（文档核对）

## 6. 门禁与交付

- [x] 全套受影响的 vitest 用例通过（compose engine / stage-executor / contract / CreateView / UE contract；全量 383 files / 6552 tests PASS）
- [x] 双模型审查（claude reviewer approve；antigravity 本机 CLI 缺失降级记录）W1/W2/I1/I3/I4/I5/I7/I8 全部修复
- [x] `.quality-gates.md` 提交前自检勾选（2026-08-09 门禁记录）
- [x] 推送 `codex/story2video-compose-subprogress`，PR #420 合并 origin/main（ccda45d3）
- [x] 重启桌面应用验证可见窗口（MainWindowHandle=3803448，标题「社媒管家」）+ 最新 main 代码
