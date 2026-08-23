## 1. 规格与实现

- [x] 1.1 test_provider_connection 回退条件扩展 400/404/405（prompt_eval_service.py）
- [x] 1.2 回归测试：chat 400+/models 200 → ok；401 仍失败；400+/models 404 → 双状态码提示（test_prompt_eval_services.py）

## 2. 验证与交付

- [x] 2.1 pytest tests/test_prompt_eval_api.py tests/test_prompt_eval_services.py 通过
- [x] 2.2 openspec validate + 双模型审查（antigravity/claude 降级则记录）
- [x] 2.3 推送 codex/ 分支 → PR → 合并回 main → 重启 ops-center 后端
- [x] 2.4 三同步归档（openspec archive + CCG task 归档 + learnings）
