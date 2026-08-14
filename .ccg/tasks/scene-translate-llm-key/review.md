# Review — scene-translate-llm-key

## 变更范围
- ops-center/backend/routers/prompt_eval.py（`_llm_cfg` fail-fast + 路由日志）
- ops-center/backend/tests/test_prompt_eval_api.py（回归测试）
- ops-center/frontend/src/views/PromptEvalWorkbench.vue（批量失败透出真实原因）
- CHANGELOG.md

## 双模型审查（降级记录）
- **antigravity**：地区不可用（Eligibility check failed: not available in your location），降级主代理自审 + Claude 单模型审查。
- **Claude**：审查完成（SESSION d7bd23a6-c888-4260-b54b-768d0acfd618）。

## Claude 审查结论
| 级别 | 内容 | 处置 |
|------|------|------|
| W1 | `translate_case` 502 把上游 `resp.text[:200]` 透传给浏览器 | 已修复：改为通用文案 + `logger.exception` 保留详情 |
| W2 | 视觉感知文案与 LLM 密钥提示风格不一致（create_run 视觉密钥缺失仍 502） | 本次 diff 范围外，记录待办不修改 |
| W3 | 空白 key 绕过检查（`cfg["api_key"]` 未 strip；表内行 api_key 为空时检查被跳过） | 已修复：strip + 表内空 key fail-fast |
| Info | 缓存命中场景也被强制要求密钥（幂等缓存 7 天） | 产品意图待确认，记录不修改 |
| 确认项 | `logger.exception` 不泄漏 api_key（traceback 无局部变量值）；前端 `errorMsg` 绑 el-alert :title 无 v-html，批量 detail 无 XSS 风险 | — |

## 主代理自审补充
- 反向验证：`test_scene_translate_requires_llm_key` 在旧代码（stash 还原 router）下 FAIL、新代码下 PASS，确认测试真实捕获 bug。
- 根因（QM-5）：git blame 溯源 `ea838461`（场景工作流引入吞错路由）+ `25c968a6`（改读模型密钥表）；逃逸链：单测仅 monkeypatch `translate_scene` 覆盖 200 路径，从未覆盖「密钥缺失」分支；集成/E2E 无场景批量用例；审查盲区为「配置缺失 fail-fast 提示缺失」（对照 create_run 视觉密钥已有 400 提示）。

## 遗留
- W2（视觉密钥缺失提示对齐）、Info（缓存命中强制密钥）不在本次范围，建议后续产品确认后跟进。
