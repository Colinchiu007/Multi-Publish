# Review — add-env-example-benchmark-ips

- 变更：`ops-center/backend/.env.example` 增加 3 行注释 + `OPS_ALLOW_PROXY_BENCHMARK_IPS=false`。
- 门禁自检：变更类型=配置/文档；规模=微小（4 行）；无逻辑代码改动。
- 验证：`pytest tests/test_model_presets_api.py` → 35 passed；diff 仅 +4 行；文件保持全 CRLF 行尾。
- 风险：默认值 false 与代码 fail-closed 一致；ECS/生产环境按注释保持关闭。