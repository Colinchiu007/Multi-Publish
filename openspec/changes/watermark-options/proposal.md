# Proposal: 全能创作水印修复与透明度/字号/位置选项

## Why

「视频创作-全能创作」的水印功能实际未生效：用户填写水印文字后成片无水印。
实证（真实 ffmpeg 渲染对比，/tmp/wm-proof/{buggy,fixed}.png）与代码审查共同锁定根因：

- story2video-compose-engine.js buildWatermarkFilter（自 commit e1b46eba0 引入，2026-07-23）坐标公式错误：
  - bottom-right / bottom-left 使用 y=h-20。drawtext 的 y 是文本框顶部坐标，y=h-20 使文字主体绘制在画布之外 → 默认位置（bottom-right）下水印完全不可见，且 ffmpeg 不报错，成片正常输出，是「看起来没保存上」的直接原因；
  - center 使用 y=(h+text_h)/2，文本下移 text_h，明显偏离正中。
- 次要问题：normalizer（story2video-text-config.js）对 watermark.position 仅做字符集校验（idValue），非法枚举在 compose 端静默回退 bottom-right，违反项目 fail-closed 惯例；UI 未暴露透明度/字号/位置控件。

用户需求：新增水印选项——透明度（百分比下拉）、字号大小（5 档下拉）、位置（正中/左上/左下/右上/右下/移动）。其中「移动」实现为平滑循环漂移（Lissajous 轨迹，确定性），而非逐帧随机（ffmpeg random() 逐帧取值会导致文字闪烁、渲染不可预期，无法回归测试）。

## What Changes

- 修复 buildWatermarkFilter 坐标：bottom-left/bottom-right 改为 y=h-text_h-20，center 改为 y=(h-text_h)/2。
- 新增 moving 位置：drawtext 的 x/y 使用带 sin/cos 的确定性表达式，文字在画面内做 90% 幅度的平滑漂移（周期约 10s/14s，双周期避免简单往返感）。
- normalizer watermark.position 改为枚举白名单 ['top-left','top-right','bottom-left','bottom-right','center','moving']，非法值直接拒绝（fail-closed），与既有 enumValue 惯例一致。
- UI（CreateView.vue 视频增强区）新增三个下拉：透明度（10%-100%，步进 10%，默认 60%）、字号（16/24/32/40/48，默认 24）、位置（6 项，默认右下）。所有新文案走 locales（zh/en 成对）。
- 快照恢复归一化：watermarkConfig 恢复时把陈旧枚举值（position/字号档位/透明度档位）吸附到白名单，避免下拉框空白。
- 测试：compose engine 坐标/移动/边界断言 + normalizer 枚举 fail-closed + 真实 ffmpeg 渲染回归（bottom-right / center / moving 可见性）。

## Capabilities

- **Modified Capabilities**: story2video-watermark（水印渲染契约：坐标、透明度、字号、位置枚举与移动语义）

## Impact

- 生产代码：apps/desktop/electron/services/story2video-compose-engine.js、apps/desktop/electron/services/story2video-text-config.js、apps/desktop/src/views/CreateView.vue、apps/desktop/src/locales/{zh,en}.js
- 测试：story2video-compose-engine.test.js、story2video-text-config.test.js、CreateView.test.js
- 文档：01-docs/PRD-video-creation.md、01-docs/product-manual.md、01-docs/learnings.md、CHANGELOG.md
- 兼容性：旧快照 position 无 moving，白名单校验兼容；fontSize/opacity 数值范围契约不变（10-96 / 0-1）；默认值不变（bottom-right / 24 / 0.6）。
