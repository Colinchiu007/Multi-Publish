## MODIFIED Requirements

### Requirement: 卡片背景为打包内置静态资源

流水线卡片背景 SHALL 为随应用打包发布的固定静态图片资源（git 版本控制），每张流水线卡片对应一张主题相关的背景图；渲染端 SHALL 直接引用内置资源，不得调用任何图片生成 API、不得访问网络、不得写入本地缓存。

#### Scenario: 卡片渲染使用内置图
- **WHEN** 渲染进程进入流水线选择视图
- **THEN** 每张卡片直接使用打包内置的背景图资源，无需等待、无生成提示、无失败降级提示

#### Scenario: 静态图与流水线主题相关
- **WHEN** 检查某流水线卡片背景
- **THEN** 背景图为与该流水线功能/主题相关的统一风格图像（低饱和深色、抽象、留白、无文字无人物），且与前景文字保持可读对比度

#### Scenario: 无运行时生成副作用
- **WHEN** 应用启动/进入页面
- **THEN** 不发起任何图片生成请求（无 API 调用、无磁盘缓存写入、无 loopback 服务）

### Requirement: 移除运行时生成链路

系统 SHALL 移除此前交付的运行时背景生成能力：主进程生成服务、IPC `pipeline-card:backgrounds`、preload 方法、相关安全下载/缓存/静态服务逻辑及其暴露面。

#### Scenario: 运行时生成接口不存在
- **WHEN** 渲染进程或外部调用方尝试调用 `pipeline-card:backgrounds` 或 `pipelineCardBackgrounds`
- **THEN** 该通道/方法不存在（preload 无该方法、主进程未注册该通道），不影响其他功能

### Requirement: 背景视觉与可访问性

静态背景卡 SHALL 保持双层暗色遮罩以保证文字对比度，背景层对辅助技术隐藏（aria-hidden），卡片保留 role=button/aria-label/键盘操作；悬停/焦点动效 SHALL 在 prefers-reduced-motion 下降级。

#### Scenario: 可读性与无障碍
- **WHEN** 卡片渲染静态背景图
- **THEN** 前景文字为浅色且背景有暗色遮罩，背景图 aria-hidden，卡片键盘可达

#### Scenario: 减少动态偏好
- **WHEN** 系统启用 prefers-reduced-motion: reduce
- **THEN** 入场/悬停动效关闭或显著降级
