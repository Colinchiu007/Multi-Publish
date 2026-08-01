# Review: fix-minimax-api-key-cleared-on-edit

## Escape analysis

1. **单元测试层**：`model-provider-crypto.test.js` 旧断言把
   `updateProvider({ api_key: '' })` 固化为“清除”，反向固化了错误行为；
   本次改为“留空保留”并新增 `clearApiKey` 显式清除契约。
2. **集成测试层**：`model-provider-preset-integration.test.js` 此前只覆盖
   预设目录可选，未覆盖“保存后立即测试连接”的真实用户路径；本次新增
   `minimax-image` 保存 → `model-provider:test` 回归。
3. **组合式函数层**：`useModelProviderCrud.test.js` 缺少“编辑时空 Key 不
   上送”用例；本次新增断言 payload 不含 `api_key`。

## Local review

- Critical: none.
- Warning: Windows Electron QM-1 完整 electron-builder 打包未执行：
  当前开发实例占用 `node_modules/electron` 二进制，构建会因
  `dxcompiler.dll` 文件锁失败；本次改动位于已由 184 项测试真实加载执行的
  服务层与渲染层 composable，语法检查通过，打包证据待开发实例关闭后补跑。
- Info: 错误提示改动保留英文关键字（括号内），兼容既有断言与日志排查。

## Evidence

- `useModelProviderCrud.test.js` 31 passed
- `model-provider-crypto.test.js` 12 passed
- `model-provider-preset-integration.test.js` 4 passed
- `model-provider-call-adapter.test.js` 39 passed
- `model-provider-local-no-key.test.js` 2 passed
- `ipc-handlers/model-provider.test.js` 42 passed
- `useProviderCrud.test.js` 30 passed
- `views/Providers.test.js` 24 passed
- `node --check` 通过（manager + composable）
