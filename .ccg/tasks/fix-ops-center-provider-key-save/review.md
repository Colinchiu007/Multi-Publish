# 运营后台模型密钥保存 500 修复记录

## QM-5 根因与逃逸分析

- 第一性原因：git blame 指向 2d5619bc7（2026-08-12）引入 _secret() 的进程环境读取和不安全回退。Pydantic Settings 会加载 .env，但不会把该值反写到 os.environ，导致有效配置被误判为 change-me。
- 次要故障：后续提交 7b4ec5729 增加了 except IntegrityError 恢复逻辑但未导入异常类，因此配置错误进入该路径时被 NameError 覆盖为 HTTP 500。
- 逃逸链：现有 API 测试仅覆盖管理员权限和请求字段校验，未覆盖 dotenv 加载但环境变量不存在及安全配置 fail-closed 的 HTTP 契约；集成测试未使用与生产相同的 Settings 单例行为；审查未检查异常处理中的名称解析。
- 系统性漏洞：测试场景缺失（配置加载边界）与审查盲区（异常类导入）。

## 修复与预防

- 修复：路由统一从 config.settings.secret_key 读取；服务在数据库读取前验证密钥；预期配置错误映射为 HTTP 400；补齐 IntegrityError 导入。
- 回归保护：test_prompt_eval_api.py 覆盖 dotenv-only 成功写入和缺失密钥返回 400 两个场景。
- 预防：涉及 Settings 的路由必须测试 dotenv-only 与环境变量路径；新增 except 异常时审查其导入与对应的失败测试。

## 审查与验证

- OpenSpec：openspec validate ops-center-provider-key-save-error --strict 通过。
- 回归：pytest tests/test_prompt_eval_api.py tests/test_prompt_eval_services.py 通过（28 passed）。
- 双模型审查降级：2026-08-15，Antigravity 因地区资格检查失败；Claude wrapper 在收到审查提示后以 exit 1 退出且未输出结论。按机制硬化停止重试，主代理对 diff、异常映射、加密 fail-closed 行为与回归覆盖执行本地审查，结论为 0 Critical / 0 Warning。
