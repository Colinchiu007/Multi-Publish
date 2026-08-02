# 修复 MiniMax API Key 保存后测试报 API Key not configured

## 用户需求

1. 修复“模型设置中保存 MiniMax Image API Key 后，返回列表点击测试仍报 码 -1 / API Key not configured”。
2. 说明“码 -1”是什么，为什么显示；优化所有这类错误提示为友好中文。
3. 设为默认按钮报英文 `Please configure API Key before setting as default`，一并修复。
4. API Key 填入后显示头部和尾部各 4 个字符（掩码）。
5. 预设 MiniMax Image 固定模型 `image-01`，无需填写 Model ID。

## 根因分析

### 根因 1：sqlite-wrapper 写入从不落盘

`apps/desktop/electron/services/sqlite-wrapper.js` 的 `Statement.run()` 从未把 `_dirty` 置位，
导致所有 `prepare().run()` 写入只存在于内存，`persist()` 永远不触发，重启后数据库仍是空行。
保存 API Key 的 `api_key_enc` 因此不会真正写入磁盘。

### 根因 2：crypto 解密 BLOB 时损坏密文

sql.js 的 BLOB 列读回是 `Uint8Array`，`crypto._toBuffer()` 只处理 `Buffer`/`string`，
`Uint8Array` 被当作字符串做 base64 解码，密文损坏后 `safeStorage.decryptString` 抛错，
`decrypt()` 返回空字符串，`getProviderWithKey` 便视作“未配置 API Key”。

### 直接表现

- 保存后测试：`码 -1 / 尚未配置 API Key ...（API Key not configured）`
- 设为默认：`Please configure API Key before setting as default`
- “码 -1”是应用内部统一业务状态码（0=成功，-1=失败），不是 MiniMax 厂商错误码，
  对用户无意义，且容易误导，应从界面移除。

## 逃逸链

1. 单元测试：`crypto.test.js` 旧 Uint8Array 用例只断言“不崩溃”，未断言密文严格往返，放过了根因 2。
2. 单元测试：`sqlite-wrapper.js` 完全没有测试文件，`Statement.run()` 不落盘无任何拦截，放过了根因 1。
3. 集成测试：`model-provider-preset-integration.test.js` 使用自定义 SqlJsAdapter，
   不走 sqlite-wrapper 的真实持久化路径，因此内存中“看似保存成功”掩盖了根因 1。
4. 代码审查：测试夹具与生产 wrapper 双实现差异未被审查清单覆盖。

## 修复方案

1. `sqlite-wrapper.js`：`Statement` 持父引用，`run()` 有 changes 时置 `_dirty`；导出 `ready` 供测试等待 WASM。
2. `crypto.js`：`Uint8Array` 原样转 Buffer，不再按 base64 解码。
3. `ModelProviders.vue`：移除“码 -1”内部码展示，只显示可读 message。
4. `model-provider-manager.js`：`setDefault` 与 CRUD 错误消息中文化，保留括号英文原文；MiniMax 旧种子行同步为 `image-01`。
5. `model-provider-seeds.js`：`minimax-image` 预设模型固定 `['image-01']`。
6. 掩码：`crypto.mask` 已实现长度 >=8 时返回前 4 + **** + 后 4，补齐测试覆盖。

## 回归测试

- `electron/services/sqlite-wrapper.test.js`：run 后落盘 + BLOB 读回 Uint8Array 严格往返。
- `electron/services/model-provider-minimax-fixed-model.test.js`：固定 image-01、旧行迁移不覆盖自定义模型、setDefault 中文提示、有 key 可设默认。
- `electron/services/crypto.test.js`：Uint8Array 解密严格往返。
