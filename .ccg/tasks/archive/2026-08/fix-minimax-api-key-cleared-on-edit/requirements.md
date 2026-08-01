# Requirements: fix-minimax-api-key-cleared-on-edit

## Bug report

设置-模型设置：保存生图模型 MiniMax（`minimax-image`）的 API Key 后返回模型列表，
点击测试图标报：

```text
码 -1
API Key not configured
```

## Root cause

1. 前端编辑表单 `createEditForm` 把 `api_key` 初始化为空字符串，编辑对话框
   文案为“留空保持不变”。
2. `useModelProviderCrud.submitForm` 无条件把 `api_key`（含空字符串）上送 IPC。
3. 后端 `ModelProviderManager.updateProvider` 把空字符串视为“清除 API Key”，
   写入 `api_key_enc = NULL` 并禁用服务商。
4. 列表页基于缓存/旧响应显示“已配置”，但点击测试时 `getProviderWithKey`
   已解不出 Key，返回“API Key not configured”。

## Fix

- 前端：`api_key` 为空时不上送该字段（沿用 `useProviderForm` 既有正确模式），
  与“留空保持不变”文案一致。
- 后端：`updateProvider` 中 `api_key: ''` 不再清除 Key；只有显式
  `clearApiKey: true` 才清除，并把 `enabled` 置 0。
- 错误提示：`testConnection`/`callAdapter` 的 API Key、适配器、方法不支持等
  错误改为友好中文并给出操作指引，同时保留原英文关键字便于排查。

## Acceptance

- 保存 `minimax-image` Key 后 `model-provider:test` 返回 code 0。
- 编辑保存时空 Key 不会清除已保存 Key。
- 相关错误提示为可理解的中文操作指引。
