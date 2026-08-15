## MODIFIED Requirements

### Requirement: 下游 ffmpeg 超时按媒体时长动态缩放
旁白合并、BGM 混音、WebM 转码、输出完整解码校验、无损 concat 与转场合并的等待预算 SHALL 随该阶段处理的预计媒体时长增长，并同时设置阶段最小值和硬上限。合法的 50 分钟成片不得再被 60s、120s 或 180s 固定超时提前终止；缺失、非数值或非正时长 SHALL 回退阶段最小预算，不得生成无限或无界等待。

#### Scenario: 50 分钟 WebM 与校验预算随时长增长
- **WHEN** 预计最终成片时长为 3000 秒
- **THEN** WebM 转码与输出完整解码校验预算均大于原固定 180 秒/60 秒，且不超过各自硬上限

#### Scenario: 短片保持最小预算
- **WHEN** 预计媒体时长很短，按倍率计算结果低于阶段最小值
- **THEN** 该 ffmpeg 阶段使用既有短片最小预算，不因动态公式缩短等待窗口

#### Scenario: 无效时长安全回退
- **WHEN** 预计媒体时长缺失、非数值、为零或为负数
- **THEN** 该 ffmpeg 阶段使用阶段最小预算，且结果为有限正整数

#### Scenario: 超长估算受硬上限约束
- **WHEN** 预计媒体时长使计算预算超过阶段最高值
- **THEN** 预算钳制在阶段最高值，避免子进程无限占用资源

### Requirement: 各阶段使用对应媒体时长
无损 concat SHALL 使用该次拼接输入的预计总时长；旁白合并 SHALL 使用未含静音补齐的旁白预计总时长；BGM 混音、WebM 转码与输出校验 SHALL 使用预计最终成片时长；转场合并 SHALL 使用该合并计划的预计输出时长。

#### Scenario: min-duration 不放大旁白预算
- **WHEN** 场景启用静音补齐且成片时长大于真实/上报旁白总时长
- **THEN** 旁白合并预算按旁白预计总时长计算，BGM/WebM/输出校验按预计成片时长计算

#### Scenario: 分块 concat 使用当前块时长
- **WHEN** 超长片段列表进入分块递归拼接
- **THEN** 每次无损 concat 按当前块可用片段时长计算预算，不使用整条流水线的固定值

## ADDED Requirements

### Requirement: Story2Video 时长与合成超时通知
renderer SHALL 将成片/旁白总时长超限、单段旁白超限、ffmpeg 合成阶段超时分别映射为稳定消息键，并从 zh/en locale 资源输出“原因 + 下一步”文案。总时长提示 SHALL 指示缩短文案或减少场景；单段提示 SHALL 指示拆分该段；合成超时提示 SHALL 指示从断点重试并检查设备负载/磁盘。任何提示不得回显 ffmpeg 命令、文件路径、stderr、token 或内部错误栈。

#### Scenario: 中英文总时长超限映射
- **WHEN** renderer 收到中文成片/旁白总时长超限，或英文 Requested/Composed video duration limit 错误
- **THEN** 输出总时长超限稳定 key，并按当前 locale 展示本地化的缩短内容建议

#### Scenario: 单段旁白超限映射
- **WHEN** renderer 收到单段旁白时长超限错误
- **THEN** 输出单段旁白超限稳定 key，并提示拆分该段文案

#### Scenario: 下游合成超时映射
- **WHEN** renderer 收到旁白合并、BGM 混音、WebM 转码或输出校验的 timeout、timed out、ETIMEDOUT 或中文超时错误
- **THEN** 输出合成超时稳定 key，展示可重试与设备检查建议，且不展示原始技术错误

#### Scenario: 未知错误继续安全回退
- **WHEN** renderer 收到不属于已知时长或合成超时类别的技术错误
- **THEN** 继续使用通用失败文案且不泄漏原始错误文本
