# 模型服务商质量门禁测试契约修复

## 根因

`createProvider()` 现在正确拒绝没有 API Key 的远程服务商；旧单测仍用该被拒绝的创建调用来准备“无 API Key 服务商”，随后 `callAdapter()` 只能看到“服务商不存在”，与测试期望的“API Key 未配置”不符。

## 修复

测试改为直接在 mock SQLite 表中植入一个历史遗留的、未配置 API Key 的服务商记录，再验证 `callAdapter()` 的 fail-closed 错误消息。这样分别覆盖：

- 新增服务商缺少 API Key 会在创建时被拒绝；
- 已存在的遗留未配置记录调用时明确返回 API Key 未配置。

## 验证

- RED：`npx vitest run electron/services/model-provider-call-adapter.test.js --reporter=verbose`，39 项中 1 项失败，实际为“Provider not found”。
- GREEN：相同命令 39/39 通过。
- `git diff --check` 通过。

## 审查

仅测试夹具变更；未改变 API Key 校验或服务商运行时代码。
