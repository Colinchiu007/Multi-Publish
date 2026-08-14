# Review — prompt-eval-engine-dual-path（运营后台双路对比）

## 评审方式
- **Claude（双模型 A）**：codeagent-wrapper --backend claude 完成，SESSION_ID fdce2629-c226-46c8-850b-af31490db0f7。
- **antigravity（双模型 B）**：不可用降级——"Your current account is not eligible for Antigravity, because it is not currently available in your location"（地区限制，与上轮一致）。
- 主代理按评审结果自查 diff + 全量测试。

## Claude 评审结论（REQUEST_CHANGES → 已修复复评通过）
- **C1（Critical，已修）**：`ensureCase` payload 未发送 compare_mode → 双路功能 UI 无法触发。修复：payload 补 `compare_mode` / `engine_creative_level` / `engine_num_candidates`。
- **W3（已修）**：engineError 仅瞬时返回。修复：`_persist_engine_error` 写入 manual run `engine_meta.engine_error`，刷新详情可见（测试断言覆盖）。
- **W4（已修）**：manual 快照不稳定。修复：`variant_snapshot` manual 分支优先 `run.prompt_source_zh`；前端中英提示词列优先 `prompt_source_zh`。
- **W1（v1 语义，记录）**：顶层聚合按 run 统计（dual 双倍加权）——`dual` 区块已按 pair 正确配对，顶层按 run 语义为 v1 设计，前端标签「评估记录」相符。
- **W2（v1 设计，记录）**：引擎派生同步阻塞请求内（20s×2 + 翻译）；无幂等键。v1 取同步简单可靠；幂等/异步化列入后续迭代（引擎本地可用，超时预算 40s 覆盖）。
- **I12（已修）**：显式 null 引擎参数回退默认值。
- **Info 记录**：I1 维度均值分母对齐、I2 context 截断日志、I3 max_length 硬编码、I4 429 重试、I5 pair 排序、I7 except Exception 细分、I10 非 admin 按钮 403 提示（前端已显示 detail）、I11 列表大小上限——均列为后续迭代。

## 验证证据
- 后端：`test_prompt_eval_engine_dual.py` 25 例全绿（真网络栈假引擎）；既有 prompt-eval 回归 31 例全绿；全量 pytest 242 passed（3 例 scheduler 顺序敏感失败单跑全绿，与本次无关）。
- 前端：`npm run build` 通过（两次，修复后复跑）。
