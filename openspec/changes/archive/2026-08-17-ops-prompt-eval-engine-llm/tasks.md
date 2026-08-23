## 1. 测试先行（TDD）

- [x] 1.1 引擎客户端捕获真实 HTTP 请求体，断言 llm/caller 透传且未传 llm 时不新增字段
- [x] 1.2 dual API 全链路回归：请求体含 provider=minimax、model、非空 api_key/base_url 和 caller=ops-center
- [x] 1.3 引擎返回 422 时客户端继续显式抛出 EngineUnavailableError
- [x] 1.4 provider 映射单测覆盖 minimax-llm、已知兼容 provider 和未知 provider
- [x] 1.5 dual 缺少 LLM 密钥时返回 400 且不调用引擎

## 2. 引擎客户端契约

- [x] 2.1 扩展 prompt_eval_engine_client.optimize() 参数和 payload，更新契约文档字符串
- [x] 2.2 保持现有重试、响应校验、错误码和 context 归一化行为不变

## 3. 双路编排接入

- [x] 3.1 增加 ops-center provider 到 prompt-engine provider 注册名的映射
- [x] 3.2 _llm_cfg() 返回引擎需要的 provider/model/key/base_url 配置
- [x] 3.3 dual create_run 通过 engine_ctx.llm 传递绑定并固定 caller
- [x] 3.4 确认 engine_meta、日志和响应不包含 api_key

## 4. 验证与交付

- [x] 4.1 cd ops-center/backend && pytest tests/test_prompt_eval_engine_dual.py -q（28 passed）
- [x] 4.2 cd ops-center/backend && pytest -q（已执行：297 passed，5 个既有/环境隔离失败，见交付记录）
- [x] 4.3 运行 OpenSpec change 状态校验（本 change 4/4 工件完成；全库 validate 受其他 active change 失败影响）
- [x] 4.4 完成质量节拍审查、提交 PR，核对 CI/合并状态后归档 OpenSpec 与 CCG task
