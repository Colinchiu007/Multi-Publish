# story2video-watermark Specification

## Purpose
全能创作（Story2Video）水印功能的渲染契约：位置坐标、透明度、字号、位置枚举与移动语义，以及 UI 交互与数据校验规则。

## Requirements

### Requirement: 水印位置坐标渲染可见
全能创作成片的水印 MUST 完整绘制在视频画面内，任何位置选项都不能把文字画出画布。

#### Scenario: 默认右下位置完整可见
- **WHEN** 用户启用水印并填写文字，位置保持默认 bottom-right
- **THEN** buildWatermarkFilter 输出 y=h-text_h-20，真实 ffmpeg 渲染帧中水印文字完整可见

#### Scenario: 中央位置居中
- **WHEN** 用户选择位置 center
- **THEN** buildWatermarkFilter 输出 y=(h-text_h)/2，水印水平垂直均居中

#### Scenario: 四角位置
- **WHEN** 用户选择 top-left / top-right / bottom-left / bottom-right
- **THEN** 对应 drawtext x/y 表达式正确，文字距边距 20px 且不越界

### Requirement: 位置枚举契约
watermark.position MUST 属于白名单 ['top-left','top-right','bottom-left','bottom-right','center','moving']；normalizer 对白名单外值 MUST fail-closed（拒绝），不得静默回退默认。

#### Scenario: 非法位置被拒绝
- **WHEN** 提交的 watermark.position 不在白名单（如 middle / random / undefined 字符）
- **THEN** normalizeStory2VideoTextParams 抛出错误，compose 端不会收到该值

#### Scenario: 合法位置通过
- **WHEN** 提交 six 个合法枚举任一
- **THEN** normalizer 原样保留，stageOptions.compose.watermarkConfig.position 与提交一致

### Requirement: 移动位置为确定性平滑漂移
moving 位置 MUST 以确定性 Lissajous 表达式实现平滑循环漂移（非逐帧随机），保证任意时刻位置可复现、可回归。

#### Scenario: moving 输出确定性表达式
- **WHEN** 用户选择位置 moving
- **THEN** buildWatermarkFilter 的 x/y 为含 sin/cos 的确定性表达式，不含 random()，t=0 时位于画面中央

#### Scenario: 移动幅度不越界
- **WHEN** 渲染 moving 水印
- **THEN** 文字始终位于画面内（幅度 0.9 倍中心区间），任意时刻不越界

### Requirement: 透明度契约
watermark.opacity MUST 为 0-1 数值；UI 以 10%-100%（步进 10%）下拉提供，默认 60%。

#### Scenario: 透明度档位传递
- **WHEN** 用户选择透明度 40%
- **THEN** 提交 watermarkConfig.opacity=0.4，drawtext 输出 fontcolor=white@0.40

#### Scenario: 透明度边界
- **WHEN** 提交 opacity 越界（如 1.5 / -0.1）
- **THEN** normalizer 拒绝（fail-closed），与既有 0-1 契约一致

### Requirement: 字号契约
watermark.fontSize MUST 为 10-96 整数；UI 提供 16/24/32/40/48 五档下拉，默认 24。

#### Scenario: 字号档位传递
- **WHEN** 用户选择字号 40
- **THEN** 提交 watermarkConfig.fontSize=40，drawtext 输出 fontsize=40

#### Scenario: 字号边界
- **WHEN** 提交 fontSize 越界（如 5 / 100）
- **THEN** normalizer 拒绝（fail-closed）

### Requirement: 快照恢复吸附合法档位
恢复「上次选项」时，watermarkConfig 的陈旧枚举值（position/字号/透明度）MUST 被吸附到合法档位，下拉框不得出现空白选项。

#### Scenario: 陈旧位置吸附
- **WHEN** 快照中 watermarkConfig.position 为已下线枚举（如 middle）
- **THEN** 恢复后吸附为默认 bottom-right 或白名单首项，下拉框有选中值

#### Scenario: 陈旧字号/透明度吸附
- **WHEN** 快照中 fontSize=30 或 opacity=0.55（不在档位表）
- **THEN** 恢复后吸附到最近档位（32 / 0.6），下拉框有选中值

### Requirement: UI 交互与提示
视频增强区水印块 MUST 提供文字输入 + 位置/字号/透明度三个下拉；新增文案 MUST 走 locales（zh/en 成对），不得在 src 硬编码中文。

#### Scenario: 控件展示
- **WHEN** 展开视频增强区
- **THEN** 显示水印文字输入与位置（6 项）、字号（5 档）、透明度（10 档）下拉，默认值与 normalizer 契约一致

#### Scenario: 文案本地化
- **WHEN** 界面语言为 zh / en
- **THEN** 水印区全部文案使用对应 locale key，无中文硬编码新增
