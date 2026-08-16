# review.md — fix-s2v-segment-status-reason（2026-08-16）

## 双模型审查降级记录（机制硬化：backend 不可用立即降级主代理自审）

| 后端 | 结果 | 证据 |
|------|------|------|
| antigravity | 不可用 | `codeagent-wrapper --backend antigravity` exit 1：`Eligibility check failed: ... not currently available in your location`（地区限制，与既往多次记录一致，2026-08-16T18:2x） |
| claude | 不可用 | wrapper exit 1 + 直接探测 `claude -p "ok"` → `API Error: Unable to connect to API (ConnectionRefused)`（claude 2.1.224，环境网络/API 不可达，2026-08-16T18:3x）；`claude --version` 正常 |

两个外部模型均不可达，按 AGENTS「子代理降级」与质量节拍既有降级先例：**降级为主代理系统自审**，结论写入本文件；门禁记录同时写入 `.quality-gates.md`。

## 主代理自审（Critical / Warning / Info）

### 🔴 Critical

- 无。

### 🟠 Warning

- 无。逐项核验通过：
  - **写回点全量枚举**：`rg "status: 'completed'|segment.status = 'completed'"` 全文件 9 处 —— replaceSegmentAudio(L690)、retrySegment(L766)、recomposeProject(L826，项目级状态不涉及分段 error，保持不动)、regenerateSceneSubtitle(L987，先例已带 error:null)、regenerateSceneAudio(L1038)、regenerateScenePrompt(L1124)、generateSceneAiVideo(L1197)、generateSceneImage(L1381)、generateSceneVideo(L1447)；失败 catch 路径 6 处均保持写 `error`（retrySegment / regenerateSceneAudio / regenerateScenePrompt / generateSceneAiVideo / generateSceneImage / generateSceneVideo）。
  - **渲染层契约**：徽标 `segmentStatusLabel` 只映射 completed/failed/processing/pending，未知回退 completed 标签；原因行 `v-if="status==='failed' && error"` 满足「非 failed 不展示失败样式/原因（含残留 error）」；`segmentStatusReason` 复用 `resolveStory2VideoNotification({error})` 归一化（未知类别回退 operation_failed 通用文案，不暴露内部错误文本），120 码点截断（`Array.from` 码点安全）。
  - **i18n 成对**：zh/en `story2video.segmentStatus.*` 四键成对新增；`check-locale-sync --cjk` 通过（基线仅 18 处 ResultView.vue 行号位移 18+18，无新增用户可见硬编码；脚本文档化边界）；变更文件无新增中文硬编码。
  - **测试**：project-service.test.js +2（retry 成功清 error、generateSceneImage 成功清 error，失败保留 error 既有用例覆盖）与 ResultView.test.js +3（本地化标签+原因内联、completed 残留 error 不显示、未命中回退通用文案）——共 159 例定向通过；story2video-notifications.test.js 定向回归通过。

### 🟢 Info（不阻塞，既有行为）

- `PROVIDER_PARAMS_UNSUPPORTED` 的 provider/param 提取正则要求引号包裹（`provider 'x'` / `Setting 'y'`）；裸写错误（如 `Setting response_format is not supported by provider agnes-t2i-general-model`）会得到空插值「模型 “” 不支持参数 “”」，可读性降级但不误导，且与通知弹窗既有归一化输出一致，归属通知模块后续优化，不在本次范围。
- `.segment-status-reason` 使用 `flex:1 1 auto` 在 `.segment-header` 内挤压排序按钮；长原因行 `word-break` 包裹，不溢出卡片。若后续发现挤压严重可给 `.segment-header` 加 `flex-wrap: wrap`。
