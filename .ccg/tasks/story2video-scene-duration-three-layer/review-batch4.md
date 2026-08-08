# Batch 4 双模型审查汇总（codex + claude）

## 结论：**通过**（无 Critical；W/M 级意见已全部处理）

- 审查对象：`.ccg/tasks/story2video-scene-duration-three-layer/review-batch4.diff`（6 个任务文件，450 行）
- 验证方式：双模型独立审查 + 实跑 `vitest run src/views/CreateView.test.js`（90/90）、eslint 0 error、`vite build` 通过、像素视觉回归 17/17（本地）

## codex 审查（review-batch4-codex.log）

- Critical：无
- W1（N 输入无 UI 侧 clamp）→ **已修**：新增 `s2vMinSceneDurationView` setter，clamp 1..60、0 no-op
- W2（clamp 边界无 UI 测试）→ **已修**：新增换算边界用例（60s→50 字、5 字→10、0 no-op、语速 0.5 估算随动、N 100→60）+ 旧快照恢复默认值断言
- I1（显示 1 位小数与提交整数口径不一致/step 失配）→ **已修**：估算统一整数秒（与 normalizer 幂等反推一致）
- I3（旧快照 targetSeconds 静默替换）→ **已修**：restore 后按主控字数自愈（`applyS2VTargetChars`），避免「恢复→保存」循环污染；CHANGELOG 注明
- I2/I4：记录（min/max 与 clamp 源默认一致；像素证据已补 CHANGELOG）

## claude 审查（review-batch4-claude.log）

- Critical：无；结论「通过（可合并）」
- W1（时长输入可达上限与 max 脱节、clamp 无反馈）→ **已修**：新增 `s2vSplitMaxSeconds` 派生 `:max`（输入范围 = 可达范围）
- W2（默认显示 6.1 与提交 6 偏差）→ **已修**：整数秒口径（同 codex I1）
- M2（restore 残留陈旧 targetSeconds）→ **已修**：restore 自愈（同 codex I3）
- M3（aria 选中态缺失）→ **已修**：按钮补 `:aria-pressed`
- M4（6s→20 字断言是默认值别名）→ **已修**：改用非默认 8s→26 字往返
- M5（normalizer 后契约断言）→ 已由 text-config 契约测试覆盖（Batch 1），记录不改
- M1/M6（splitSpeechRate 死字段、非整数 restore）→ M6 由自愈顺带覆盖；M1 记录（后续 batch 清理）

## 关键验证证据

- 双视图往返：8s→26 字→8s（speed 1）；clamp：60s→50 字、5 字→10、0 no-op；语速 0.5 → 20 字≈12s
- 提交契约：默认（chars=20, targetSeconds=6, follow-audio, N=6）与 Batch 1-3 默认完全等价，无默认行为漂移
- 8002 通道：`_buildStorySplitterOptions` 白名单不收 target_chars_per_scene，只收 normalizer 重算 target_duration；本地 fallback 直读 chars 显式优先——双通道一致
- 恢复：旧快照缺新字段 → 保留默认值；陈旧 targetSeconds=8 → 按 20 字 + voice.speed 1.5 自愈为 4
- 视觉：像素 17/17（含 /create）；`vite build` 28s 通过
