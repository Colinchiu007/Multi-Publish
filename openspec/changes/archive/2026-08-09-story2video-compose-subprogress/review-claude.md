I've completed a thorough review — read the full diff, traced every emit/failure path in the engine, verified the executor boundary, the Vue rendering/degradation, the docs, and ran all five affected test files (140 electron + 105 Vue tests, all green; the 5 new progress tests confirmed running, not skipped). Here is the structured report.

---

# 审查报告：图片轮播流水线 compose 阶段子百分比进度条

## 总体结论

**无 Critical 问题。** 核心契约成立且经测试证实：引擎发射路径覆盖全部成功/失败分支，`done/100` 确实只在成功 `return` 前出现（两处：`copyFileSync` 失败仍按成功返回的路径 796、正常成功路径 844），所有失败路径均冻结在最后有效值；执行器 fail-closed 校验有效；前端渲染与降级正确；文档与实现权重表一致；5 个受影响测试文件全部通过（已实际运行验证）。

以下为 Warning/Info 级改进建议，按优先级排列。

---

## Warning 🟡

### W1. 执行器「最后防线」未强制 `percent === 100 ⟺ phase === 'done'`
- **位置**: `stage-executor.js:51-53`（配合 `story2video-compose-engine.js:59-61`）
- **问题**: 引擎在回调前先做归一化，`Math.min(100, Math.round(percent))` 会把任何 `>100` 或 `≥99.5` 的值钳制/取整为 `100`。执行器收到的是**已钳制**的值，其 `percent > 100` 检查永远不会针对引擎输出触发。因此一旦引擎（现版本或未来新增阶段）在 done 之前发射了 `99.6` 或 `150`，`context.compose_progress` 会被写入 `{phase:'verify', percent:100}` —— 正是文档 7.1.9.1 宣称杜绝的「假成功信号」(`percent === 100 ⟺ code === 0`)。当前引擎最大 pre-done 权重为 98，属潜伏缺陷而非现网 bug。
- **修复**: 在 `_normalizeComposeProgressForContext` 中增加 `if (Math.round(percent) >= 100 && phase !== 'done') return null`（或 `percent >= 100 && phase !== 'done'`），把「100 只在 done」这条不变量收进边界校验。

### W2. 两处「共用语义」归一化实现不一致 + phase 枚举重复
- **位置**: `stage-executor.js:39-49` vs `story2video-compose-engine.js:44-47`
- **问题**: 注释声称「与 normalizeComposeProgressUpdate 语义一致」，但实际不一致：
  1. 引擎对越界 percent **钳制**（120→100），执行器对越界 percent **拒绝**（fail-closed）——语义分歧在 99.5~100 区间会产生「引擎发射了、执行器丢弃」的静默差异；
  2. 引擎只要求 phase 非空，执行器要求已知枚举——这是**更严**的正确方向，但 9 个 phase 字面量（`stage-executor.js:49`）与引擎 10 处发射点重复维护，新增 phase 时漏改执行器枚举会导致该 phase 全部更新被静默丢弃。
- **修复**: 从引擎导出单一 `KNOWN_COMPOSE_PHASES` 常量供执行器复用；在注释中如实说明「执行器为 fail-closed 更严，越界 percent 拒绝而非钳制」。

---

## Info 🟢

### I1. `Number()` 强转削弱 fail-closed 的严格性
- **位置**: `stage-executor.js:51,54-64`；`story2video-compose-engine.js:57-73`
- **问题**: `Number(update.percent)` 会接受 `null→0`、`true→1`、`[]→0`、`[50]→50`、`"39"→39`。因此 `{phase:'segments', percent:null}`、`{phase:'segments', percent:[]}` 会通过校验并写入 context，与「任一字段非法则丢弃」的文案不符。现有测试只覆盖了 NaN/字符串/越界/组合非法，未覆盖这些强转穿透用例。
- **修复**: 将 `Number(...)` 改为 `typeof update.percent === 'number' && Number.isFinite(...)`（segmentsTotal/Done 同理），或补充强转用例并明确「数值字符串放行」为有意行为。

### I2. 前端 `composeSubProgressPercent(stage)` 单次渲染调用 3 次
- **位置**: `CreateView.vue:72-73`
- **问题**: `v-if`、`:aria-label`、`:style` 三处各自调用一次，且方法每次重读整个 `orchestrationContext`。纯属微优化，但可在模板外先用一次计算属性/局部变量复用。
- **修复**: 模板中改为 `const p = ...` 不适用于模板表达式；可增加 `composeSubProgressPercent` 的缓存或改用计算属性返回 `{pct, text}` 一次求值。

### I3. 无障碍语义：英文 aria-label 且挂在非交互元素上
- **位置**: `CreateView.vue:72`
- **问题**: `:aria-label="'compose progress ' + ...%"` 是英文，与全中文 UI 不一致；且 `aria-label` 挂在非交互 `<span>` 上不符合 ARIA 用法。对屏幕阅读器更有意义的是 `role="progressbar"` + `aria-valuenow/min/max`。
- **修复**: 改为 `role="progressbar" :aria-valuenow="composeSubProgressPercent(stage)" aria-valuemin="0" aria-valuemax="100"`，或按 `translateWithLocaleFallback` 生成中文 label。

### I4. 字面量模板绑定 data-testid / 文档类名不一致
- **位置**: `CreateView.vue:72`；`PRD.md:850`
- **问题**: `:data-testid="\`story2video-stage-compose-progress\`"` 是字面量却用绑定语法，应改为静态 `data-testid="..."`。另 PRD 7.1.9.1 写「`.progress-fill` 0.3s 过渡」，实现类名是 `.stage-sub-fill`（`CreateView.vue:2982`），文档与实现类名不符。
- **修复**: 模板改静态属性；文档改 `.stage-sub-fill`。

### I5. 失败路径冻结测试覆盖不完整
- **位置**: `story2video-compose-engine.test.js:1044-1183`
- **问题**: 仅覆盖 3 条失败路径（片段生成/拼接/输出校验）。旁白合并失败(冻结 89)、BGM 失败(92)、webm 失败(95)、持久化失败(98) 未直接断言冻结；虽然结构上「失败点后无发射」保证了冻结，但显式测试可防止未来重构引入 emit。
- **修复**: 对 narration/bgm/webm/persist 失败补 `progress.at(-1)` 冻结断言 + 无 done。

### I6. 新进度契约测试沿用 `if (!findFfmpeg()) return` 守卫
- **位置**: `story2video-compose-engine.test.js:1058,1086,1109,1134`
- **问题**: 与文件既有约定一致，但本组测试 mock 了全部 ffmpeg 工作（`_createSegment`/`_concatSegments` 等），无 ffmpeg 的 CI 上会**静默跳过**进度契约测试，而非失败。属覆盖盲区而非缺陷。
- **修复**: 可考虑不依赖 `FFMPEG` 的注入方式（如临时将引擎的 FFMPEG 判定置真），或至少在无 ffmpeg 环境显式 skip 计数。

### I7. compose 阶段重试/续跑时不清空旧 `compose_progress`
- **位置**: `stage-executor.js:391-396`
- **问题**: 执行器在调用 `composeVideo` 前不重置 `context.compose_progress`。断点续跑（PRD 7.1.9.1 边界 #5）复用同一 context 重跑 compose 时，首次发射前（素材校验窗口）前端会短暂显示上次冻结值（如「视频合成 87%」），引擎早退（如仍不可用）时旧值会残留整个阶段。
- **修复**: COMPOSE 处理器开头 `if (context && typeof context === 'object') context.compose_progress = undefined`，保证「无新数据即不渲染」语义始终成立。

### I8. 引擎 `compose` JSDoc 未记录新参数
- **位置**: `story2video-compose-engine.js:426-431`
- **问题**: `@param {object} [options]` 下未补充 `@param {Function} [onProgress]` 第三参（options.onProgress 兼容说明仅在注释里）。文档完整性小缺口。

---

## 验证记录

- 实际运行 `vitest run`：`story2video-compose-engine.test.js` + `stage-executor.test.js` + `pipeline-story2video-contract.test.js` **140 passed**；`CreateView.test.js` + `story2video-ue-contract.test.js` **105 passed**。
- 用 `-t "子进度发射"` 确认新增 5 条引擎进度测试**真实执行**（5 passed / 60 skipped，非 ffmpeg 守卫跳过）。
- 数据链路核验：引擎 `compose(assetManifest, options, onProgress)`（第三参优先，兼容 `options.onProgress`）→ `serviceBus.composeVideo`（同进程直接转发，函数可透传，`service-bus.js:71-81`）→ 执行器 `_normalizeComposeProgressForContext` 校验后写 `context.compose_progress` → `getRunSnapshot`/`getRunContext` 暴露（`pipeline-engine.js:1281,1291`）→ IPC `pipeline:getRunContext`（`ipc-handlers/pipeline.js:140`）→ 前端 3s 轮询 `orchestrationContext`（`CreateView.vue:2269`）。
- 发射点穷举：preflight 0 → validated 3 → segments 3 / 3+72k/N → concat 87 → narration 89 → bgm 92（可选）→ webm 95（可选）→ verify 98 → done 100，共 11 个发射点、15 条失败路径全部落在「冻结」区间，与 PRD 权重表完全一致。

**评审结论：通过（approve），建议合并前处理 W1/W2 两项（低成本、防潜伏假成功信号与枚举漂移），其余 Info 可跟进。**

---
SESSION_ID: 4d1af161-a910-4cc6-bda9-5b195ee35d01
