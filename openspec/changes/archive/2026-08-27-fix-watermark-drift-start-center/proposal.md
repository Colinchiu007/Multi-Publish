# Fix Watermark Drift Start Center — Proposal

## Why

故事讲述流水线（Story2Video）水印位置选择「移动（平滑漂移）」后，成片水印只在画面底部区域移动，未按既有契约「t=0 位于画面中央」渲染。用户期望水印从画面中心附近开始移动。

**根因**：`buildWatermarkFilter`（`apps/desktop/electron/services/story2video-compose-engine.js`）moving 表达式的 y 轴误用 `cos(2πt/140)`：`cos(0)=1` → t=0 时 y=0.95×(h-text_h)（底部 95%）；x 轴用 `sin(0)=0` 正确居中。2026-08-14 slow-drift 将周期放慢 10 倍（100s/140s）后，短视频（10-40s）内 y 滞留下半区，问题从「起点偏差」放大为「全程只在下半区移动」。公式引入于 commit `3c3835d1b`（PR #792）。

**修复**：y 轴表达式改为 `(h-text_h)/2*(1+0.9*sin(2*PI*t/140))`，双轴同用 sin → t=0 从画面正中起步；周期（x 100s / y 140s）、0.9 幅度边界（坐标 ∈[0.05,0.95] 自由空间）、确定性 Lissajous 属性全部不变。

## 差异审计（基线 vs 现状）

- 基线规格：`openspec/changes/archive/2026-08-14-watermark-options/specs/story2video-watermark/spec.md`（「t=0 时位于画面中央」）— 该契约已被实现违反，本次为契约对齐修复，非新功能。
- 现状代码：`story2video-compose-engine.js:573`（cos 版 y 表达式）；`story2video-compose-engine.test.js:253-261`（字符串断言固化错误公式）。
- 待办（本 change）：代码 1 处表达式 + 测试断言升级（数学求值）+ 文案（locales movingHint）+ 文档（PRD 3.1.38 / CHANGELOG / learnings / product-manual）。
- 不在范围：Remotion `Story2VideoSlideshow.tsx` 无 moving 分支（fallback bottom-right，休眠缺口，另立跟进）；python-backend yaml 仅默认值（无需改）；`w<text_w` 负向溢出（既有问题，另立任务）。