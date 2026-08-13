# Design: 水印渲染修复与选项扩展

## 决策 1：drawtext 坐标语义

ffmpeg drawtext 的 x/y 是文本包围盒左上角坐标（相对于画面左上角）。既有代码把 y 当作基线/底边使用导致文字出画布。
修复公式（20px 边距沿用现有约定）：

| 位置 | x | y |
|------|-----|-----|
| top-left | 20 | 40 |
| top-right | w-text_w-20 | 40 |
| bottom-left | 20 | h-text_h-20 |
| bottom-right | w-text_w-20 | h-text_h-20 |
| center | (w-text_w)/2 | (h-text_h)/2 |

## 决策 2：移动（moving）语义

- 需求原文「随机移动」。逐帧随机不可行：ffmpeg drawtext 表达式中 random() 每帧取新值，文字会高频跳变闪烁，且不可复现、无法回归测试。
- 实现：确定性 Lissajous 漂移，表达式（字符串字面量，避免逗号与冒号破坏 filter 语法）：
  - x=(w-text_w)/2*(1+0.9*sin(2*PI*t/10))
  - y=(h-text_h)/2*(1+0.9*cos(2*PI*t/14))
  - 语义：文字在画面中央 90% 幅度范围内平滑漂移，x 周期 10s、y 周期 14s，双周期合成避免单一往返的机械感；t=0 时位于画面正中。
  - 表达式必须用单引号包裹，内部不出现逗号（逗号会切分 filter 链）、不出现冒号。
- PRD 中明确定义「移动 = 平滑循环漂移」，并说明为什么不是逐帧随机。

## 决策 3：normalizer 枚举 fail-closed

watermark.position 改用 enumValue（既有惯例），白名单与 compose 端 positions 表保持单一来源同步（两端各自定义 + 契约测试锁定一致性）。

## 决策 4：UI 控件与数据流

- CreateView.vue 视频增强区水印块：文字输入（既有）+ 三个下拉，v-model 绑定 s2vConfig.watermarkText / s2vConfig.watermarkConfig.{position,fontSize,opacity}。
- 提交路径不变：buildStory2VideoTextConfig 的 watermark 对象 {...config.watermarkConfig, enabled, text}，normalizer 白名单校验后进 stageOptions.compose.watermarkConfig → buildWatermarkFilter。
- 快照恢复：_applyS2VSnapshot 已整体深拷贝 watermarkConfig 对象，新字段自动恢复；新增 normalizeS2VWatermarkOptions 把陈旧值吸附到合法档位（position 白名单、fontSize 最近档、opacity 最近档），复用 normalizeS2VRestoredEnums 调用点。

## 决策 5：透明度/字号档位

- 透明度：0.1-1.0 步进 0.1（10%-100%），默认 0.6；normalizer 契约 0-1 不变，UI 档位在白名单内。
- 字号：16/24/32/40/48 五档，默认 24；normalizer 契约 10-96 不变。
- 语义：字号越大水印越醒目，提示文案说明「建议 24-40」；透明度 10% 接近不可见，提示「建议 40% 以上」。

## 决策 6：文案 i18n

新增 key 位于 create.story2video.watermark.*（zh/en 成对），模板用 translateWithLocaleFallback 渲染；不新增 src 中文硬编码（CI Gate 7 拦截）。
