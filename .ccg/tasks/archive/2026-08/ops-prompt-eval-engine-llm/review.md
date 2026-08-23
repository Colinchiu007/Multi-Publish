# Review: ops-prompt-eval-engine-llm

## 结论

主代理审查：无 Critical。实现范围与 OpenSpec change 一致。

## 检查项

- prompt_eval_engine_client.optimize() 保留原 http positional 参数位置，新 llm/caller 追加在末尾。
- dual 路由从已保存 minimax-llm 或环境变量构造 BYOK 配置，provider 映射为 prompt-engine 注册名 minimax。
- api_key 仅进入引擎请求体；engine_meta 和响应快照没有该字段或值。
- 缺少 LLM 密钥在路由入口 fail-fast 为 400，不创建 run，也不调用引擎。
- 客户端对 HTTP 422 保留显式 EngineUnavailableError，不静默降级。
- OpenSpec 本 change 校验通过；全量 backend 测试的 5 个失败均为既有模板漂移或共享 SQLite/目录测试隔离问题，定向复跑确认与本变更无关。

## 外部审查

antigravity 与 Claude wrapper 在本机执行时因 Windows Bash 路径/运行时环境不可用，未取得外部模型报告；按项目降级规则完成主代理审查并记录该边界。

## CI

- PR #915 的必需构建、单元、覆盖率、桌面分片、浏览器 E2E、视觉、Electron、文档同步检查均通过。
- `QG Autonomous` 独立返回 `NEED_HUMAN`（PRD 覆盖条目为 0），不是本次 backend 变更引入；按既有仓库合并例外处理。
