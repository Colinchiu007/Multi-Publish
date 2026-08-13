# Review — s2v-manual-video-parallel（manual 视频候选并行化）

## 审查方式

- 双模型并行派发（CCG 规范）：antigravity + Claude 同时审查 git diff。
- **antigravity 降级**：区域不可用（Eligibility check failed: not available in your location），既有已知模式，见 .quality-gates.md 多次记录。
- Claude 独立审查完成（`--backend claude`，实际运行了测试套件 19 全绿后出具报告）。

## Claude 审查结论（分级）

- **Critical**：无。
- **Major**：
  1. story2video-stages.js `await Promise.all` 后冗余双 await（`(await imagePromise).flat()` 为死代码/失败面不直观）→ **已修复**：解构 `const [, imageResultSets] = await Promise.all(...)`。
  2. 测试 1 的 gate `release()` 不在 finally → 断言失败会悬挂 pending、掩盖回归 → **已修复**：gate/release 提升到 try 外，finally 防御性释放。
- **Minor**：
  1. 视频并发未取整（2.5 → 3 worker）→ **已修复**：`Math.floor(Number(videoConcurrency)) || 1`。
  2. 「视频默认 maxConcurrent=1」注释过时（实际默认 2）→ **已修复**：auto 注释同步为默认 2、rpm 可收敛。
  3. fixture listen 无 catch → **已修复**：`server.once('error', reject)`。
  4. 缺「一路成功一路失败」混合用例 → **已补**：新增第 4 个用例（确定性按 prompt 区分成败）。
- **Info**：manual 额度契约（每视频场景 2 图 + 1 视频）与 auto（视频成功跳图）不同属设计使然 → **CHANGELOG 已明确表述**。

## 主代理自检（质量节拍 6 项）

- 异常处理：视频 worker 各分支恰好 set 一次 + 进度一次；Promise.all 失败面显式。✅
- 边界值：并发下限 1、取整；`optimizedPrompts[index]` 越界走缺提示词分支。✅
- 并发安全：同场景图片 seq 0→1 顺序、视频/图片输出路径按 index 隔离、计数器无 await 穿插。✅
- 代码风格：与 auto 路径一致（withModelBudget + withAssetTransientRetry + 同格式日志）。✅
- scope：仅 manual 分支 + executor manual 分支 + 测试 + PRD/CHANGELOG；auto 零行为改动（仅注释）。✅
- 测试：171 全绿（manual 20 / stages 83 / text-config 68）。✅
