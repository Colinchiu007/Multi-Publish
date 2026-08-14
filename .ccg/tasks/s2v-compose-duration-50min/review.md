# Review: s2v-compose-duration-50min（Story2Video 合成时长上限调整到 50 分钟）

## 审查方式
- 双模型并行审查：antigravity（地区限制不可用，历史既有模式）+ Claude（完成完整审查，实跑相关测试）。
- 审查输入：`.review-s2v50.diff`（git diff 快照）+ 可读源码。

## Claude 审查结论（0 Critical / 3 Warning / 5 Info）

### Critical
无。

### Warning（处理结论）
1. **W1 成片错误文案在默认配置下不可达**（旁白检查先于成片检查，`story2video-compose-engine.js` 原 702-706）→ **已修复**：调换预检检查顺序，成片检查在前；默认配置下任何超限输入返回「成片总时长不能超过 50 分钟」，旁白检查仅在旁白上限更严时可达。新增用例：恰 3000s 通过/3000.1s 拒绝（严格大于）、旁白上限 40 分钟 < 成片 50 分钟时返回旁白文案。OpenSpec 新增「预检检查顺序与文案可达性」Requirement。
2. **W2 下游固定 ffmpeg 超时未随 50 分钟缩放**（旁白 concat 120s / BGM 120s / WebM 180s / 校验 60s）→ **接受为已知限制**：按评审建议选项 (b)，在 PRD §7.1.25a 已知限制节与 OpenSpec spec 显式声明，列为后续优化项，不阻塞本次上限调整。
3. **W3 同树文档仍声明旧 10/15 分钟上限**（PRD-video-creation.md:70,542,544,1945 / architecture-video-integration.md:249）→ **已修复**：五处旧值同步为 50 分钟并加 §7.1.25a 交叉引用。

### Info（处理结论）
1. 边界恰 3000s 未直接测到 → **已修复**：新增「恰为 3000 秒通过、3000.1 秒拒绝」用例。
2. `Math.round(limit/60)` 对非整分钟配置误导 → **已修复**：新增 `formatDurationLimit` 按「X 分 Y 秒」格式化，补 90s →「1 分 30 秒」spec 场景。
3. 声明时长/运行时累计英文文案未动态化 → **已修复**：两条英文文案拼入分钟数（`of N minutes`）。
4. 前端错误映射回退通用文案 → **接受**：PRD 已知限制已记录，时长类 pattern 映射列入后续优化。
5. `MAX_INPUT_TOTAL_BYTES` 512MB 输入总量约束 → **接受**：PRD 已知限制已记录，输入总量约束不变，可达性以真实样例验收。

## 修复后复验
- 修改后重跑 `story2video-compose-engine.test.js`：**105 用例全绿**（含新增 2 例）。
- 关联套件：compose-engine-cleanup / text-config / stages 回归。
- `openspec validate s2v-compose-duration-50min`：**valid**。

## 结论
0 Critical / 3 Warning（1 修复、2 记录为已知限制）/ 5 Info（3 修复、2 记录）。允许合入。
