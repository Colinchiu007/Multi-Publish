# Proposal: 内容政策失败历史任务「修改场景文案并重新生成」操作入口

## Why

`story2video-resume-gating`（PR #876）已对内容政策类失败任务统一恢复门控并给出不可恢复原因提示（含场景号），明确「不能断点续跑、必须修改文案后重新生成」，但历史记录只有提示与删除按钮，**没有把用户引导到「修改→重新生成」路径的操作入口**。单场景内容修改能力（`story2video:update-segments` + 结果页分段编辑 + `重新合成`）已上线，具备完整闭环；本 change 补齐入口：政策失败任务一键进入结果页编辑，等价实现「修改文案后断点续跑」。

## What Changes

- 历史卡片操作区与详情弹窗 footer：对 `status === 'failed'`、有 `projectId`、错误文本命中 `RESUME_BLOCKING_ERROR_PATTERN`（不可恢复门控）的任务，显示按钮「修改场景文案并重新生成」（zh）/ "Edit scenes & regenerate"（en），点击复用既有 `open-result` → `/create/result?project=<id>` 链路跳转结果页；无 `projectId` 或可恢复失败不显示，`completed` 任务保留既有「编辑并重新合成」按钮。
- 场景定位契约：政策失败任务跳转时在 query 附加 `focusScenes=<场景号,逗号分隔,升序展开>`（如 `49,73,74`）；场景号与 `contentPolicyScenes` 同源提取（`Image #N` 段内命中门控关键字，N=segments 下标+1）。结果页依据 `focusScenes` 对目标分段渲染「内容政策需修改」徽标（`data-testid="segment-policy-flag"`）与高亮样式；无 `focusScenes` 或号码越界时安全降级不渲染。
- 单一来源：`history-utils.js` 抽出 `collectContentPolicySceneNumbers(error)`（`contentPolicyScenes` 与 `policySceneQuery` 均复用）；`policyEditTarget` 与按钮门控沿用 #876 统一 `RESUME_BLOCKING_ERROR_PATTERN`（本 PR 不重复改 `historyItemResumable`）。
- i18n：新增 `create.history.policyEditAndRegenerate`、`story2video.sceneMaterial.scenePolicyFlag`（zh/en 成对，Gate 7 校验）。

## Capabilities

- **New Capabilities**: 无
- **Modified Capabilities**: `story2video-resume-gating`（增量：不可恢复任务的操作入口与场景定位契约）

## Impact

- 代码：`apps/desktop/src/views/history-utils.js`、`apps/desktop/src/views/CreateViewHistory.vue`、`apps/desktop/src/views/CreateView.vue`、`apps/desktop/src/views/ResultView.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`
- 测试：`apps/desktop/src/views/history-utils.test.js`、`CreateViewHistory.test.js`、`CreateView.test.js`、`ResultView.test.js`
- 文档：`CHANGELOG.md`
- 兼容性：`focusScenes` 为增量 query 参数，缺省行为不变；不涉及主进程 IPC/恢复语义改动。
