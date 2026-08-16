# prompt-engine-byok-llm — Design

## 1. LLM 绑定解析（PromptBridge）

```js
resolveLlmBind() {
  const manager = this.modelProviderManager
  if (!manager || typeof manager.getDefault !== 'function') return null
  const row = manager.getDefault('llm')        // 多模态关闭后返回 llm 分类启用首行（如 sensenova-llm）
  if (!row || !row.id) return null
  const withKey = manager.getProviderWithKey(row.id)   // 主进程解密 api_key
  if (!withKey || !withKey.api_key) return null
  return {
    provider: engineProviderFor(withKey),       // sensenova-llm→sensenova; deepseek→deepseek; 其余→openai_compat
    model: (withKey.models && withKey.models[0]) || '',
    base_url: withKey.base_url || undefined,
    api_key: withKey.api_key,
  }
}
```

- 仅在请求未显式携带 `llm` 时注入（显式优先）。
- `caller` 常量：`multi-publish-desktop`。
- 解析失败（无默认 LLM / 无 key）→ `optimize*` 抛出可操作错误，不发起 HTTP 请求。

## 2. 注入点

- `optimize()` / `optimizeBatch()`：`normalizeOptimizeRequest` 后合并 `llm` / `caller`。
- `optimizeVideo()` / `optimizeVideosBatch()`：仅 legacy-8013（`/v1/optimize` 域）分支注入；独立 8020 引擎不在本任务范围。

## 3. 安全

- 解密仅发生在 Electron 主进程（`crypto.decrypt`）；`api_key` 不进入日志（`_post` 仅记录 path + traceId）、不进入渲染层。
- `normalizeOptimizeRequest` 不改动未知字段，`llm` 对象整体透传给引擎。
