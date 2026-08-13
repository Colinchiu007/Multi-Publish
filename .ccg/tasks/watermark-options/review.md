# 审查报告：水印坐标修复 + 位置/字号/透明度选项（watermark-options，2026-08-14）

## 审查方式（降级记录）

- **antigravity**：不可用（`Error: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`）——区域限制，非本次可解。日志 `D:\Temp\wm-review-antigravity.md`。
- **Claude**：wrapper 运行 >10 分钟仍在自主执行真实 ffmpeg 验证（thinking_tokens 事件 26k+，未产出最终报告），按 CCG 10 分钟规则介入停止；其思路（真实验证渲染）与既有真实渲染回归（`D:\Temp\wm-regress\` 五帧）一致，无已交付发现。
- **主代理自审**（降级替代）：逐文件通读 diff + 边界用例实测，结果如下。

## 主代理自审发现

### Critical：0

### Warning：1（已修复）
- `CreateView.vue normalizeS2VWatermarkOptions`：快照 `fontSize=null`/`opacity=''` 时 `Number(null)=0`（finite）→ 吸附到最小档 16/0.1，与注释「非法数值回退默认值（24/0.6）」不符。已修复：null/空串显式回退默认（`wm.fontSize == null || wm.fontSize === '' ? NaN : Number(...)`）；新增 CreateView 用例「null/空串回退默认值」验证（170 tests 全绿）。

### Info：2（已处理）
- PRD 中 top-left/top-right 的 `y=40`（既有约定，非本次改动）已修正文档口径（20px 水平/底部边距、40px 顶部边距）。
- locales 键数实际为 14（非交接摘要的 12），PRD/CHANGELOG 已修正。

## 自审清单（逐项）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 坐标修复正确性 | PASS | bottom-right=`x=w-text_w-20:y=h-text_h-20`、center=`(w-text_w)/2:(h-text_h)/2`；drawtext 左上角语义；真实渲染帧（bottom-right/center/moving t=0/5/10）水印可见 |
| moving 确定性 | PASS | Lissajous sin/cos 表达式、无 random()、t=0 居中、表达式无逗号（防滤镜链切分） |
| fail-closed 校验 | PASS | normalizer 白名单拒绝 middle/random 等；opacity/fontSize 越界拒绝；实测报错信息正确 |
| compose 二次防线 | PASS | clampNumber(fontSize 10-96 / opacity 0-1)；非法 position 回退 bottom-right（normalizer 已拦截，此为兜底） |
| 恢复吸附 | PASS | 陈旧枚举吸附最近档位；null/空串回退默认；合法档位幂等 |
| 保存透传 | PASS | `pipeline-story2video-contract` 18 项（watermarkConfig 无损透传）；CreateView 提交断言 watermark 对象含 position/fontSize/opacity |
| locale 成对 | PASS | zh/en 各 14 键同构；CI 脚本 `--pair-base HEAD` PASS；CJK 基线扫描 PASS（1562 条无新增硬编码） |
| 测试 | PASS | 受影响 344（compose-engine + text-config + CreateView）+ contract 18 + 真实 ffmpeg 1/1 全绿 |
| 打包 | PASS | vue build exit 0 + electron-builder exit 0；asar 含 `\dist\index.html`（59 项）与新 testid bundle；主进程 services 在 asar |

## VERDICT：APPROVE（Critical 0，Warning 1 已修复，Info 已处理）
