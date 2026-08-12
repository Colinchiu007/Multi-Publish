# Review — prompt-image-eval-system

> 审查时间：2026-08-11 ｜ 方式：Claude 双模型审查（antigravity 因后端不可用未执行，见下）

## 审查结论

Claude reviewer 完成独立 diff + 新增文件审查，发现 **1 Critical / 8 Warning / 11 Info**。Critical 与主要 Warning 已全部修复并补测试；Info 级按价值选择性修复。

## 问题清单与修复状态

| 级别 | 问题 | 状态 |
|------|------|------|
| 🔴 C1 | `prompt-eval:run` 可读取任意本地文件 base64 外带至外部视觉模型（无魔数/扩展名校验） | 已修复：扩展名白名单 + 文件头魔数校验（EVAL_IMAGE_INVALID）；IPC 层拷贝入参 + path.resolve |
| 🟠 W1 | store getRecord/deleteRecord id 未消毒 → 路径穿越 | 已修复：`^[A-Za-z0-9._-]{1,100}$` 白名单 + 测试 |
| 🟠 W2 | problems/promptOptimizationPoints 缺失或非数组被静默降级为空 | 已修复：缺失/非数组 → EVAL_LLM_INVALID_RESPONSE 整次失败 + 测试 |
| 🟠 W3 | 敏感上下文过滤仅浅层，嵌套凭据泄露 | 已修复：`filterSensitiveDeep` 递归过滤任意嵌套深度 + 测试 |
| 🟠 W4 | 多图评估将真实上下文替换为占位符，逐图判据丢失 | 已修复：prompt-builder 逐项输出每张图输入快照（保留每项上下文）+ 测试 |
| 🟠 W5 | sourceText/context/negativePrompt 无长度上限 | 已修复：EVAL_SOURCE_TOO_LONG(20000)/EVAL_CONTEXT_TOO_LONG(20000)/EVAL_NEGATIVE_TOO_LONG(5000) + 测试 |
| 🟠 W6 | （已并入 W4）多图上下文占位 | 见 W4 |
| 🟠 W7 | 业务文本原文嵌入的提示注入面 | 说明：评估功能语义即分析用户文本，属预期；长度上限 + 输入快照 JSON 序列化兜底，风险可接受 |
| 🟠 W8 | UI hasEvaluatorHint 变量语义（dimensions 加载不代表评估器可用） | 已修复：仅在 run 失败且 code=EVAL_LLM_UNAVAILABLE 时显示引导文案 |
| 🔵 Info | evaluatorModel 恒为 null | 已修复：evaluator 暴露 `lastModelId`，写入报告 |
| 🔵 Info | 非整数分数被静默舍入 | 保留：契约按整数要求，0-100 校验 + 舍入后重校验（结果等价）；文档已注明 |
| 🔵 Info | 无 code 错误被映射为 EVAL_LLM_INVALID_RESPONSE | 已修复：llm 错误统一带 code；store 错误 → EVAL_STORE_WRITE_FAILED；兜底 EVAL_INTERNAL |
| 🔵 Info | writeFileSync 失败遗留 tmp 文件 | 已修复：写入异常清理临时文件 |
| 🔵 Info | sleepSync 忙等阻塞主进程 | 保留：总退避 ≤350ms（50/100/200），有界；后续可异步化 |
| 🔵 Info | deleteRecord 吞 unlink 失败 | 已修复：unlink 失败 → EVAL_STORE_WRITE_FAILED，不更新索引 |
| 🔵 Info | CLI --analyze 两分支相同 / PROMPT_EVAL_EVALUATOR 未读取 | 已修复：去重 + 读取环境变量 |
| 🔵 Info | composable get/remove 未 catch rejection | 保留：调用方（视图）有错误横幅兜底；低风险 |
| 🔵 Info | temperature 被接受但忽略 | 已修复：0-2 收敛校验并透传 evaluator |
| 🔵 Info | isRetryable 重复 ETIMEDOUT | 已修复：去重 |
| 🔵 Info | IPC run 原地改写调用方对象 | 已修复：拷贝入参 |

## 二次校验

修复后聚焦回归：prompt-eval 服务 46 + IPC 4 + preload 2 + composable 3 + bootstrap 32 + 中心 IPC 15 = 102/102 通过；Vue build 通过；全量桌面测试后台运行中。

## antigravity 说明

antigravity 审查本次未执行：子代理后端返回 403（Upstream 403，http://127.0.0.1:57321/v1/responses），机制硬化规则要求降级不盲等。本记录不把「未执行」冒充为「双模型通过」。
