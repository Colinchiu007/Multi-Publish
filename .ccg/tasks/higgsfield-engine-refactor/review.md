# 双模型评审记录：image-prompt-higgsfield-mechanics

## 评审方式
- **antigravity**：探测启动后进程退出无输出（既有区域限制不可用模式）→ 记录降级，本轮仅 Claude 独立评审。
- **Claude**（session 8c2b056f-ad1b-4bce-8227-f208a99ba2ca）：读全量 diff + openspec change + 分析报告，对照旧视频实现逐参数比对，并实跑受影响套件（396 例基线全绿）。

## 评审基线（修复前）
kernel 32 + contract 30 + video-contract 93 + story2video-stages 84 + stage-executor 64 + pipeline-story2video + text-config + prompt-bridge = 409 例全绿。

## 发现与处置

| 级别 | 问题 | 处置 |
|------|------|------|
| 🔴 C1 | scorePrompt 保真维除零：source 无 ≥2 字中文且无 ≥4 字母英文时 0/0=NaN → 择优静默取 candidates[0] | ✅ 修复：enTokens 空 → fidelity=0；英文提取放宽至 ≥3 字母；补 3 例回归 |
| 🟡 W1 | 择优候选未经 extractOptimizedBase 截断：胜出候选可达 5083 字符绕过 max_length，truncated 标志失真 | ✅ 修复：3 个接入点（stage-executor 主/wrapped、story2video）择优后重新施加 Unicode 安全截断 + truncated；补 2 例回归（择优截断 / select_best=false 关闭） |
| 🟡 W2 | plausible-only 把"no people / 避免人物 / without hats"排除式负面词整体清空 | ✅ 修复：新增 VAGUE_QUALITY_WORDS 模糊质量词表（bad/ugly/丑/坏…），否定前缀+实质内容保留、+模糊词清理；补 2 组回归 |
| 🟡 W3 | 长度维度：英文 >400 词无惩罚（死代码）、中文回退误用 words 而非字符数 | ✅ 修复：英文超长按 400/words 比例惩罚、中文按字符数 4000/chars 比例；补 2 例回归 |
| 🟢 I1 | 视频契约 max_length 层级注释错位残留 | ✅ 删除 |
| 🟢 I2 | text-config 路径 maxLength 恒显式 → 精修层默认不触发 | 记录为已知取舍（配置层显式传值语义正确，P1 配置层优化另行排期） |
| 🟢 I3 | 空串/非数值 max_length 语义变化（''→500 而非 50） | 接受：退化值收敛更合理，story2video 路径恒为数值不受影响 |
| 🟢 I4 | 空 prompt 默认变基线串 | 预期行为（OPTIMIZE 有前置拦截、批处理 delete prompt） |
| 🟢 I5 | 契约注释"四键"与实际 7 键不符 | ✅ 修正注释 |

## 修复后回归
kernel 32 + contract 30 + video-contract 93 + stage-executor 66 + story2video-stages 84 + text-config + pipeline-story2video + prompt-bridge = **409/409 全绿**（评审修复后重跑）。

## 结论
Critical 已修复并补回归；W1/W2/W3 已修复；I1/I5 已修；I2-I4 记录为已知取舍。同意合并（建议在 PR 描述中附本记录）。
