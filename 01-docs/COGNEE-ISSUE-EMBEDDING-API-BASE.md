# Cognee Issue: Custom Embedding API Base URL not respected by LiteLLM routing

## Description

When configuring Cognee with a custom OpenAI-compatible embedding endpoint (e.g., SiliconFlow, local vLLM, or any self-hosted embedding service), the `EMBEDDING_API_BASE` environment variable is ignored by LiteLLM. Instead, LiteLLM routes embedding requests to the default provider endpoint based on the model name prefix.

## Steps to Reproduce

1. Set environment variables:
```bash
export EMBEDDING_PROVIDER="openai"
export EMBEDDING_MODEL="openai/BAAI/bge-m3"
export EMBEDDING_API_KEY="sk-xxx"
export EMBEDDING_API_BASE="https://api.siliconflow.cn/v1"
```

2. Run `cognee-cli remember "test content"`

3. Observe the error:
```
litellm.NotFoundError: NotFoundError: OpenAIException - Error code: 404
```

The request is sent to `https://api.openai.com/v1/embeddings` (OpenAI's default) instead of `https://api.siliconflow.cn/v1/embeddings` (the custom endpoint).

## Expected Behavior

When `EMBEDDING_API_BASE` is set, LiteLLM should use that base URL for embedding requests, regardless of the model name prefix.

## Root Cause

LiteLLM routes by provider prefix (e.g., `openai/` → OpenAI's default endpoint). When a custom `EMBEDDING_API_BASE` is set, it should override the provider's default endpoint, but the override is not applied.

## Workaround Attempted

- Setting `OPENAI_API_BASE` did not affect embedding routing
- Setting `EMBEDDING_PROVIDER="openai"` with `EMBEDDING_API_BASE` was ignored
- The `LLM_BASE_URL` correctly routes to the custom endpoint for LLM calls, but the embedding equivalent (`EMBEDDING_API_BASE`) does not work for embedding calls

## Environment

- Cognee version: 1.5.3
- Python: 3.12.14 / 3.14.4
- OS: Ubuntu (WSL2 on Windows 11)
- Embedding provider: SiliconFlow (OpenAI-compatible API)

## Related

This is blocking the use of Cognee with any non-OpenAI embedding provider. Many users rely on self-hosted or alternative embedding services (SiliconFlow, local Ollama, vLLM, etc.) for cost or privacy reasons.