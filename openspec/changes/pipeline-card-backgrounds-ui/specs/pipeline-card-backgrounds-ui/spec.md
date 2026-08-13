## Purpose

定义视频创作首页流水线卡片 UI 的可观察行为契约：多列响应式布局、MiniMax 生成统一风格差异化背景（含缓存与降级）、交互动效与可访问性。

## ADDED Requirements

### Requirement: 多列响应式布局

流水线卡片网格 SHALL 根据视口宽度自动排列为 1-5 列，且页面容器在流水线选择视图 SHALL 允许超过 1080px 以充分利用宽屏；任意宽度下卡片最小宽度不小于 260px，间隙不小于 12px。

#### Scenario: 宽屏自动多列
- **WHEN** 视口宽度 ≥ 1440px 且处于流水线选择视图
- **THEN** 卡片网格渲染 ≥ 4 列，页面容器不因 1080px 封顶压缩列数

#### Scenario: 窄屏单列
- **WHEN** 视口宽度 ≤ 768px
- **THEN** 卡片网格渲染 1 列，卡片保持可读宽度

### Requirement: MiniMax 差异化卡片背景

每张流水线卡片 SHALL 展示一张由已配置图片生成服务商（默认 MiniMax image-01）生成的差异化背景图；所有卡片背景 SHALL 遵循统一视觉风格（低饱和深色渐变、抽象几何、留白、无文字无人物），并与卡片前景文字颜色保持可读对比度。

#### Scenario: 已配置图片生成服务商
- **WHEN** 用户进入流水线选择视图且系统存在可用的图片生成 provider（image 类别默认或多模态含 image 能力）
- **THEN** 系统为该批流水线生成/复用缓存背景图，卡片以背景图渲染并叠加暗色遮罩保证文字可读

#### Scenario: 背景图磁盘缓存复用
- **WHEN** 同一流水线名称已存在有效缓存背景图
- **THEN** 系统不得重复调用图片生成 API，直接复用缓存并提供本地 URL

#### Scenario: 未配置图片生成服务商
- **WHEN** 系统不存在可用的图片生成 provider
- **THEN** 卡片回退为按分类色系渐变背景，不报错、不阻塞流水线选择，并可展示一次性提示

#### Scenario: 单卡生成/下载失败
- **WHEN** 某张卡片背景生成或下载失败
- **THEN** 该卡片回退渐变背景，其余卡片不受影响，失败信息在响应中分级返回

### Requirement: 卡片背景安全边界

背景图下载 SHALL 仅允许 HTTPS（测试注入除外）、拒绝私有/环回/链路本地目标、校验响应内容类型为图片且大小有界；本地静态服务 SHALL 仅绑定 127.0.0.1、使用随机 token、仅服务缓存目录内 realpath 校验通过的文件、仅允许 GET/HEAD、返回 nosniff 与图片内容类型。

#### Scenario: 非法下载目标
- **WHEN** 生成服务返回的图片 URL 非 HTTPS 或解析到私有/环回/链路本地地址
- **THEN** 下载被拒绝并记为失败，卡片回退渐变

#### Scenario: 本地服务越界访问
- **WHEN** 请求的 token 不存在或对应文件不在缓存目录内
- **THEN** 服务返回 404，不泄露路径信息

### Requirement: IPC 输入校验与失败语义

`pipeline-card:backgrounds` IPC SHALL 校验流水线名称（非空字符串、`^[a-zA-Z0-9_-]{1,80}$`、批量上限 50）与选项（force 布尔）；无可用 provider、部分失败均为正常返回（code 0），仅参数非法返回校验错误。

#### Scenario: 非法参数
- **WHEN** 调用方传入非字符串、空串、超长或含非法字符的流水线名称
- **THEN** 返回校验错误且不触发任何生成

#### Scenario: 部分成功
- **WHEN** 一批流水线中部分生成成功部分失败
- **THEN** 返回 code 0，data 区分 generated/cached/failed，前端对失败卡回退渐变

### Requirement: 交互动效与可访问性

卡片 SHALL 提供悬停/键盘焦点的视觉反馈（抬升、阴影/光晕、背景图缩放、边框高亮）与受限的入场动画；动效 SHALL 在 `prefers-reduced-motion: reduce` 下关闭或降级；背景层 SHALL 对辅助技术隐藏（aria-hidden），卡片保持 role=button + aria-label 与键盘操作。

#### Scenario: 悬停与焦点反馈
- **WHEN** 鼠标悬停或键盘 Tab 聚焦某卡片
- **THEN** 卡片出现明确视觉反馈，背景图轻微缩放且文字对比度不下降

#### Scenario: 减少动态偏好
- **WHEN** 系统启用了 prefers-reduced-motion: reduce
- **THEN** 入场/悬停动画被禁用或显著降级，功能不受影响

### Requirement: 文案本地化

所有新增用户可见文案 SHALL 以 zh/en 成对形式加入 locales（`pipelines.selector.*`），渲染端不得硬编码新中文字符串字面量。

#### Scenario: 语言切换
- **WHEN** 应用语言在 zh 与 en 之间切换
- **THEN** 卡片背景相关提示（生成中、未配置、失败回退）显示对应语言文案
