# Review — s2v-optimize-maxlength

- 审查方式：antigravity（区域资格不可用，明确错误 "not currently available in your location"，降级）+ Claude reviewer（完成，PASS）。主代理按 CCG 规则对 Claude 发现项复核后处理。
- 审查基线：Claude 审查 10 文件快照期间工作树并发补上 project-service 重生成修复（C1），最终以当前 13+ 文件状态为准。

## Critical
- C1（历史重生成路径 500 截断）：Claude 审查快照未含 `story2video-project-service.js` 修复；当前已闭环——`regenerateScenePrompt(kind=image)` 经 `buildPromptEngineOptimizeRequest(seed, { max_length: max })` 显式携带 2000 并做 2000 Unicode 安全本地截断，测试断言透传与截断。已解决，无需遗留。

## Warning
- W1（S2V optimize 恒含 max_length 无守护）：新增 stageDef 恒含断言（`pipeline-story2video-contract.test.js`）+ `resolveRuntimeStageOptions` 注释点明 undefined → stageDef 2000 隐式兜底。已解决。
- W2（`DEFAULT_STORY2VIDEO_TEXT_CONFIG.optimize.maxLength` 500 漂移）：常量同步 2000 + 测试断言。已解决。
- W3（渲染层 [200,2000] vs 引擎 [50,2000] + 非档位值不吸附）：恢复钳制改为区间内非档位值吸附最近档位（650→700），越界/缺失回退 2000，测试补充。已解决。
- I3（存量 run 快照不追溯）：CHANGELOG 补充说明（恢复/续跑沿用旧值，重新生成按 2000）。已解决。
- I4（tasks 预案与实现漂移）：tasks.md 描述修正（通用执行器默认 500 保持、视频 8020 不动）。已解决。
- I2（regenerate 请求附加 IMAGE_QUALITY_BASELINE，与流水线 stage 对齐）：确认符合“契约同源”意图，测试已 `stringContaining` 兼容，无动作。

## 结论
PASS（C1/W1/W2/W3 已落实）。
