# prompt-engine-byok-llm — Proposal

## Why

桌面版调用 8013 提示词引擎时未携带用户在「模型设置」中配置的 LLM，引擎按自身 config.yaml 兜底（实测 MiniMax）返回优化词，用户实际期望使用自己配置的 SenseNova 文字推理模型。目标契约：哪个产品调用引擎，就用哪个产品自己配置的 LLM（BYOK）。

## What Changes

- `PromptBridge` 统一注入 `llm` 对象与 `caller: multi-publish-desktop`：从桌面 `ModelProviderManager` 解析默认 LLM（多半模态开关关闭后为 llm 分类的启用首行，如 sensenova-llm），解密密文 key 后在主进程边界组装 `{provider, model, base_url, api_key}`。
- 无可用 LLM 时桌面侧 fail-closed（不向引擎发请求，返回可操作错误）。
- 覆盖 8013 全部分支：`optimize` / `optimizeBatch` / `optimizeVideo`（legacy-8013 回退）/ `optimizeVideosBatch`（legacy-8013 回退）。

## Capabilities

- Modified: `image-prompt-engine` — 新增 Requirement：桌面调用 8013 必须携带本机 LLM 绑定（llm + caller），主进程解密注入，api_key 不出渲染层、不落日志。

## Impact

- `apps/desktop/electron/services/prompt-bridge.js`（构造注入 modelProviderManager + optimize/optimizeBatch/optimizeVideo/optimizeVideosBatch 注入 llm/caller + fail-closed）。
- `apps/desktop/electron/bootstrap/phase1-context.js`（promptBridge.modelProviderManager 注入，与 story2videoProjectService 同模式）。
- 测试：`prompt-bridge.test.js` 新增 llm 注入/fail-closed 用例；容器与既有链路测试回归。
- 触发 QM-1（electron 主进程 services 变更）打包门禁与桌面 vitest。
