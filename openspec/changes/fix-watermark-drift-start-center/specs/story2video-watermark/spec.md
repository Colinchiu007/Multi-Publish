# story2video-watermark Specification（fix-watermark-drift-start-center 增量）

> 本文件是本 change 对基线 `openspec/changes/archive/2026-08-14-watermark-options/specs/story2video-watermark/spec.md` 的增量修正：仅覆盖 moving 起始位置的契约纠偏，其余需求（位置枚举、透明度、字号、快照吸附、UI 交互）以基线为准。

## Requirements

### Requirement: moving 以双轴 sin 确定性漂移且 t=0 起点画面正中
moving 位置的 drawtext x/y 表达式 MUST 同为确定性正弦漂移：x=`(w-text_w)/2*(1+0.9*sin(2*PI*t/100))`、y=`(h-text_h)/2*(1+0.9*sin(2*PI*t/140))`；t=0 时 x/y 均位于画面中心（对应自由空间 0.5），y 轴 MUST NOT 使用 cos（cos(0)=1 会把起点推到底部 95%）。

#### Scenario: t=0 起点居中
- **WHEN** 用户选择位置 moving 且渲染启动（t=0）
- **THEN** buildWatermarkFilter 输出的 y 表达式为 `(h-text_h)/2*(1+0.9*sin(2*PI*t/140))`，数学求值 t=0 得 y=(h-text_h)/2（居中）；x 同理由 sin 得 (w-text_w)/2

#### Scenario: 幅度与周期不变
- **WHEN** 渲染任意时刻 t
- **THEN** x/y 坐标占比 ∈[0.05, 0.95]（0.9 幅度自由空间，不越界）；x(100)=x(0)、y(140)=y(0) 周期回原点

#### Scenario: 确定性保持
- **WHEN** 同参数重复渲染
- **THEN** 逐帧位置完全一致（纯 t 函数、无 random()），表达式无逗号（防滤镜链切分）

### Requirement: 回归保护数学断言
compose-engine 测试 MUST 对 moving 表达式做数学求值断言（t=0 居中 + 幅度扫描 + 周期回原点），不得仅以字符串包含断言锁定公式。

#### Scenario: 回归测试拦截 cos 回退
- **WHEN** y 表达式被回退为 cos(2*PI*t/140)
- **THEN** 数学契约用例在 t=0 求值断言失败（988px ≠ 520px），字符串断言 `not.toContain('cos(2*PI*t/140)')` 同时拦截