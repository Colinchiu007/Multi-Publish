# Fix Watermark Drift Start Center — Design

## How

### 方案对比

| 方案 | 做法 | 评价 |
|------|------|------|
| A. y 轴 cos → sin | `y=(h-text_h)/2*(1+0.9*sin(2*PI*t/140))` | ✅ 最简单、零新增符号、t=0 居中、周期/幅度/确定性不变；表达式无逗号、冒号，滤镜链安全 |
| B. 保留 cos 加相位 | `y=(h-text_h)/2*(1+0.9*cos(2*PI*t/140-PI/2))` | 数学等价但可读性差，`-` 在 drawtext 表达式内合法但增加理解成本 |
| C. 随机起点 | seeded RNG + 随机相位 | ❌ 破坏确定性/可复现契约，引入新状态与测试复杂度 |

**选定方案 A**：与既有 x 轴 sin 对称，注释契约一致（「sin(0)=0 居中」），最小 diff。

### 数学推导

`coord(t) = (D-d)/2 * (1 + 0.9*sin(θ))`，θ=2πt/T：
- t=0：sin(0)=0 → coord=(D-d)/2（居中）✅（旧版 y 用 cos：cos(0)=1 → 0.95(D-d) ❌）
- 幅度：sin∈[-1,1] → coord∈[0.05(D-d), 0.95(D-d)]，任意 t 不出画布（与旧版边界一致）
- 周期：sin(2π(t+T)/T)=sin(2πt/T) → x 周期 100s、y 周期 140s 回原点
- 确定性：纯 t 函数、无 random()，逐帧可复现；轨迹为 sin/sin Lissajous（频率比 5:7）

### 变更清单

1. `apps/desktop/electron/services/story2video-compose-engine.js:573`：y 表达式 cos→sin，注释同步（记录 2026-08-27 回归说明）。
2. `apps/desktop/electron/services/story2video-compose-engine.test.js`：字符串断言更新（双轴 sin + 禁止 cos 回退）；新增「moving 数学契约」求值断言（t=0 居中 / 幅度扫描 [0.05,0.95] / 周期回原点）。
3. `apps/desktop/src/locales/zh.js` + `en.js`：`movingHint` 更新为「从画面中心附近开始…」（zh/en 成对，CI 门禁）。
4. `apps/desktop/src/views/CreateView.vue:348`：回退文案同步（2 处）。
5. 文档：`01-docs/PRD-video-creation.md`（3.1.24 表格/语义修正 + 新增 3.1.38）、`CHANGELOG.md`（新增条目）、`01-docs/learnings.md`（QM-5 复盘）、`01-docs/product-manual.md`（水印说明）。

### 不做的事（明确排除）

- 不改 Remotion `Story2VideoSlideshow.tsx`（无 moving 分支，双路径差异另立跟进）。
- 不改 python-backend `story2video-compose.yaml`（仅默认值，无公式）。
- 不改枚举白名单 / normalizer / 快照吸附（position 值与结构不变）。
- 不处理 `w<text_w` 负向溢出（既有问题，另立任务）。