# requirements.md — 水印修复与选项扩展（增强需求）

规格真相源：openspec/changes/watermark-options/（proposal/design/specs/tasks）。本文件仅记录用户原始诉求与决策要点，不重复规格内容。

## 用户诉求（原话提炼）
1. 水印功能没生效：输入框填写了文字，但最终视频没有水印 → 疑问「是不是没保存上」。
   - 结论：保存链路无断点（project-service 保存 run.params，buildS2VLastOptions 保存完整 s2vConfig）；根因是 compose 端 drawtext 坐标 bug（bottom-right 默认位置 y=h-20 把文字画出画布，见 openspec proposal Why）。
2. 新增选项：
   - 透明度：下拉选项，百分比数字（实现 10%-100% 步进 10%，默认 60%）
   - 字号大小：下拉选项，5 个选择（实现 16/24/32/40/48，默认 24）
   - 位置：下拉选项，正中/左上/左下/右上/右下/移动（实现 6 项枚举；moving=确定性平滑漂移，非逐帧随机，原因见 design 决策 2）

## 关键决策
- moving 语义定为「平滑循环漂移（Lissajous 轨迹，确定性）」并在 PRD/UI 提示中向用户说明：逐帧随机会导致闪烁且不可预期。
- 默认值保持兼容：bottom-right / 24 / 0.6；normalizer 数值契约 10-96 / 0-1 不变。
- 所有新 UI 文案走 locales（zh/en 成对），CI Gate 7 会拦截 src 中文硬编码新增。
