# P1b 记忆库+治理 审查报告（双模型）

日期：2026-08-13
审查对象：staged diff（origin/main 79082e51 → 当前分支），17 文件 +1752/-29（审查后含 Warning 修复增量）

## 双模型执行情况

| 模型 | 状态 | 结果 |
|------|------|------|
| antigravity（Codex） | ✅ 完成 | 完整分级报告，SID 019ffbb9-9023-7252-bb7b-2c40209f5cef |
| claude | ⛔ 两次失败（exit 1，无有效输出） | 按降级路径：主代理逐条复核 Codex 报告 + 自读源码验证 |

降级说明：Claude 后端两次调用均以 status 1 退出且无审查内容（codeagent-wrapper 进程异常），符合"子代理/外部模型不可用立即降级"机制硬化规则。Warning 均经主代理读源码逐条复核后修复。

## 审查结论

- **Critical**：1 项（phase5-ipc.js 未将 promptMemory/governance 传入 handlerDependencies）→ **已修复 + 回归测试**（phase5-ipc.test.js 新增接线断言，22 例全绿）
- **Warning 5 项 → 全部修复**：
  - W1 fragment 空对象/全空值可入库 → gateStructure 要求至少一个非空可控参数 + 测试
  - W2 activate confirmedBy 可缺省 → memory 层强制必填 64 位 hex userHash（V0 仅人工确认激活语义）+ IPC 测试
  - W3 冷却期死逻辑 → 升版继承父版本 cooldownUntil + 测试
  - W4 evaluateRollback 非法 now 抛 RangeError → NaN/falsy 语义修复（now != null 判定）+ 测试
  - W5 升版取首个匹配 → 收集全部候选取 score 最高者 + 双候选构造测试
- **Info 8 项**：I3 已修复（get/activate 缺 id → TEMPLATE_INVALID(-20)，version 正整数校验）；I1/I2/I4-I8 评估为 V0 可接受或文档化语义，不阻塞合并

## 验证

- 修复后全量：prompt-evolution(86) + generation-feedback(21) + phase5-ipc(22) + preload(346) + bootstrap/ipc-handlers 全绿
- 新增测试覆盖：W1×2、W2 缺省/非法、W3 冷却继承、W4 非法 now×3、W5 多候选最优升版、IPC 错误码统一×4、phase5 接线×1
