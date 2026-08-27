# Review — fix-watermark-drift-center（水印「移动」起点居中修复）

> 2026-08-27 · 双模型交叉审查（opencode + Claude 并行，wrapper `codeagent-wrapper.exe`）· 变更范围：compose-engine 表达式 + 测试 + locales + 文档

## 双模型结论（合并去重）

| 模型 | Critical | Warning | Minor | 结论 |
|---|---|---|---|---|
| opencode | 0 | 2 | 3 | ✅ 批准 |
| Claude | 0 | 2 | 5 | ✅ 批准 |

- 数学契约独立验证通过：t=0 → x=910 / y=520（旧 cos y=988 必失败）；幅度 ∈[0.05,0.95]×自由空间；周期 x=100 / y=140 保持；确定性不变。
- 三层回归锁（字符串双轴 sin / `not.toContain('cos(2*PI*t/140)')` / 数学求值 t=0+幅度扫描+峰值+周期）互补：字符串锁实现细节，数学锁行为契约。
- `evalDrawtextExpr` 特意保留 `cos` 在作用域：若回归重引入 cos 能得到可诊断的 988px≠520px 失败而非 ReferenceError。

## Warning 处置（已修复）

1. **周期回原点断言必要非充分** → 已追加峰值断言：x(25)≈0.95×(1920-100)、y(35)≈0.95×(1080-40)（25s/35s 为周期 100/140 的 90° 相位峰，周期漂移到约数如 /50、/70 时峰值偏离，独立锁定周期与幅度），重跑 140/140 通过。
2. **多镜头成片每段回到中心未文档化** → PRD 3.1.38 功能逻辑段与 product-manual 13.1.1.1 已补「水印按片段计时、每镜头开头回到画面中心附近、场景切换处中心吸附跳变属既定行为；跨场景连续漂移需合并后统一叠加（架构变更另立跟进项）」。

## Minor 处置

- 表达式提取正则假设首个 `:x='` → 已用 `?.[1]` + 显式 `expect(xExpr).toBeTruthy()` 守卫，避免空匹配抛晦涩 TypeError。
- `new Function` 代理 ffmpeg 求值器 → 已补注释：仅覆盖 sin/cos/PI/四则运算，引入 ffmpeg 特有运算符（lt/if/mod）需同步更新。
- 真实 ffmpeg 冒烟未自动化 → 记录为后续项（若仓库有图像 golden 断言流水线，将 moving t=0 帧中心像素命中水印色块纳入；本次为纯数学修复可接受）。
- test.js 既有 ESLint error（no-useless-escape / no-useless-assignment，417:46 / 2549:11）→ 非本次 diff 引入、CI 无 lint 门禁，不扩大范围；已记录留给后续 lint 清理。

## 验证证据

- `story2video-compose-engine.test.js`：140/140（TDD 红→绿；threads pool 下首次运行偶发瞬态失败，重跑通过，与已知环境抖动一致）
- `story2video-text-config.test.js` + `pipeline-story2video-contract.test.js`：100/100
- locale 门禁：`check-locale-sync.js --cjk` PASS（基线 1505 条无新增硬编码）；zh/en `movingHint` 成对
- QM-1：`pnpm exec electron-builder --win --dir --publish never` 成功（Multi-Publish.exe 225MB）；asar 提取验证 `moving` 表达式为双轴 sin、无 cos 残留
- 真实 ffmpeg 40s 冒烟：t=0 帧居中（910,520 附近）、t=15/t=35 边界内（记录于任务档案）

## 结论

无 Critical 遗留，Warning 已修复并回归通过，**批准合并**。
