# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
LLM (Large Language Model) Service - Direct OpenAI SDK implementation
Supports structured output via response_type parameter (Pydantic model).

Migrated from Pixelle-Video (Apache 2.0) to Multi-Publish.

Config resolution (replaces Pixelle-Video's config_manager):
    Priority: constructor `config` dict value -> environment variable
    (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL) -> built-in default.
"""
import json
import os
import re
from typing import Optional, Type, TypeVar, Union

from loguru import logger
from openai import AsyncOpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMService:
    """
    LLM (Large Language Model) service

    Direct implementation using OpenAI SDK. No capability layer needed.

    Supports all OpenAI SDK compatible providers:
    - OpenAI (gpt-4o, gpt-4o-mini, gpt-3.5-turbo)
    - Alibaba Qwen (qwen-max, qwen-plus, qwen-turbo)
    - Anthropic Claude (claude-sonnet-4-5, claude-opus-4, claude-haiku-4)
    - DeepSeek (deepseek-chat)
    - Moonshot Kimi (moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k)
    - Ollama (llama3.2, qwen2.5, mistral, codellama) - FREE & LOCAL!
    - Any custom provider with OpenAI-compatible API

    Usage:
        # Direct call
        svc = LLMService(config={"model": "gpt-4o", "api_key": "sk-..."})
        answer = await svc("Explain atomic habits")

        # Structured output with Pydantic model
        class MovieReview(BaseModel):
            title: str
            rating: int
            summary: str

        review = await svc(
            prompt="Review the movie Inception",
            response_type=MovieReview,
        )
        print(review.title)
    """

    def __init__(self, config: Optional[dict] = None):
        """
        Initialize LLM service

        Args:
            config: Optional flat dict of LLM settings (api_key, base_url, model).
                    When omitted, values are read from environment variables
                    LLM_API_KEY / LLM_BASE_URL / LLM_MODEL, then defaults.
        """
        self._config: dict = config or {}
        self._client: Optional[AsyncOpenAI] = None

    def _get_config_value(self, key: str, default=None):
        """
        Get a config value with the resolution chain:
        constructor config dict -> environment variable -> default.

        Args:
            key: Config key name (e.g. "api_key", "base_url", "model")
            default: Default value if not found

        Returns:
            Config value
        """
        # 1. constructor-provided config dict
        val = self._config.get(key)
        if val:
            return val
        # 2. environment variable (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL)
        env_val = os.environ.get(f"LLM_{key.upper()}")
        if env_val:
            return env_val
        # 3. default
        return default

    def _create_client(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> AsyncOpenAI:
        """
        Create OpenAI client

        Args:
            api_key: API key (optional, uses config if not provided)
            base_url: Base URL (optional, uses config if not provided)

        Returns:
            AsyncOpenAI client instance
        """
        # Get API key (priority: parameter > config > dummy key for Ollama)
        final_api_key = (
            api_key
            or self._get_config_value("api_key")
            or "dummy-key"  # Ollama doesn't need a real key
        )

        # Get base URL (priority: parameter > config)
        final_base_url = (
            base_url
            or self._get_config_value("base_url")
        )

        # Create client
        client_kwargs = {"api_key": final_api_key}
        if final_base_url:
            client_kwargs["base_url"] = final_base_url

        return AsyncOpenAI(**client_kwargs)

    async def __call__(
        self,
        prompt: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        response_type: Optional[Type[T]] = None,
        **kwargs
    ) -> Union[str, T]:
        """
        Generate text using LLM

        Args:
            prompt: The prompt to generate from
            api_key: API key (optional, overrides config)
            base_url: Base URL (optional, overrides config)
            model: Model name (optional, overrides config)
            temperature: Sampling temperature (0.0-2.0). Lower is more deterministic.
            max_tokens: Maximum tokens to generate
            response_type: Optional Pydantic model class for structured output.
                          If provided, returns a parsed model instance instead of str.
            **kwargs: Additional provider-specific parameters

        Returns:
            Generated text (str) or parsed Pydantic model instance (if response_type)

        Raises:
            ValueError: When response_type is set but the LLM output cannot be parsed.
            Exception: Re-raised OpenAI SDK / network errors.
        """
        # Create client (new instance each time to support parameter overrides)
        client = self._create_client(api_key=api_key, base_url=base_url)

        # Get model (priority: parameter > config > default)
        final_model = (
            model
            or self._get_config_value("model")
            or "gpt-3.5-turbo"  # Default fallback
        )

        logger.debug(
            f"LLM call: model={final_model}, base_url={client.base_url}, "
            f"response_type={response_type}"
        )

        try:
            if response_type is not None:
                # Structured output mode - inject JSON schema into the prompt
                return await self._call_with_structured_output(
                    client=client,
                    model=final_model,
                    prompt=prompt,
                    response_type=response_type,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs
                )
            else:
                # Standard text output mode
                response = await client.chat.completions.create(
                    model=final_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs
                )

                raw_content = response.choices[0].message.content
                result = raw_content if isinstance(raw_content, str) else ""
                logger.debug(f"LLM response length: {len(result)} chars")
                if not result or not result.strip():
                    logger.warning(
                        f"LLM returned empty text content "
                        f"(model={final_model}, base_url={client.base_url})"
                    )

                return result

        except Exception as e:
            logger.error(
                f"LLM call error (model={final_model}, "
                f"base_url={client.base_url}): {e}"
            )
            raise

    async def _call_with_structured_output(
        self,
        client: AsyncOpenAI,
        model: str,
        prompt: str,
        response_type: Type[T],
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> T:
        """
        Call LLM with structured output support

        Appends a JSON schema instruction to the prompt for maximum compatibility
        across all OpenAI-compatible providers (Qwen, DeepSeek, Ollama, etc.).

        Args:
            client: OpenAI client
            model: Model name
            prompt: The prompt
            response_type: Pydantic model class
            temperature: Sampling temperature
            max_tokens: Max tokens
            **kwargs: Additional parameters

        Returns:
            Parsed Pydantic model instance

        Raises:
            ValueError: If the response cannot be parsed as `response_type`.
        """
        # Build JSON schema instruction and append to prompt
        json_schema_instruction = self._get_json_schema_instruction(response_type)
        enhanced_prompt = f"{prompt}\n\n{json_schema_instruction}"

        # Call LLM with enhanced prompt
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": enhanced_prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        raw_content = response.choices[0].message.content
        content = raw_content if isinstance(raw_content, str) else ""

        logger.debug(f"Structured output response length: {len(content)} chars")
        if not content or not content.strip():
            logger.warning(
                f"LLM returned empty structured-output content "
                f"(model={model}, base_url={client.base_url})"
            )

        # Parse JSON from response content (three-tier fallback)
        return self._parse_response_as_model(content, response_type)

    def _get_json_schema_instruction(self, response_type: Type[T]) -> str:
        """
        Generate JSON schema instruction for LLM fallback mode

        Args:
            response_type: Pydantic model class

        Returns:
            Formatted instruction string with JSON schema
        """
        try:
            # Get JSON schema from Pydantic model (Pydantic v2)
            schema = response_type.model_json_schema()
            schema_str = json.dumps(schema, indent=2, ensure_ascii=False)

            return f"""## IMPORTANT: JSON Output Format Required
You MUST respond with ONLY a valid JSON object (no markdown, no extra text).
The JSON must strictly follow this schema:
```json
{schema_str}
```
Output ONLY the JSON object, nothing else."""
        except Exception as e:
            logger.warning(f"Failed to generate JSON schema: {e}")
            return """## IMPORTANT: JSON Output Format Required
You MUST respond with ONLY a valid JSON object (no markdown, no extra text)."""

    def _parse_response_as_model(self, content: str, response_type: Type[T]) -> T:
        """
        Parse LLM response content as a Pydantic model.

        Three-tier fallback strategy:
            1. Direct json.loads on the whole content
            2. Extract from a ```json ... ``` markdown code block
            3. Extract the substring from the first `{` to the last `}`

        Every tier is wrapped in try-except so malformed LLM output never crashes
        the caller; a ValueError is raised only when all three tiers fail.

        Args:
            content: Raw LLM response text
            response_type: Target Pydantic model class

        Returns:
            Parsed model instance

        Raises:
            ValueError: If the content cannot be parsed as `response_type`.
        """
        # Tier 1: direct JSON parsing
        try:
            data = json.loads(content)
            return response_type.model_validate(data)
        except (json.JSONDecodeError, ValueError):
            pass

        # Tier 2: extract from markdown code block (```json ... ``` or ``` ... ```)
        json_pattern = r'```(?:json)?\s*([\s\S]+?)\s*```'
        match = re.search(json_pattern, content, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(1))
                return response_type.model_validate(data)
            except (json.JSONDecodeError, ValueError):
                pass

        # Tier 3: find any JSON object (first `{` to last `}`)
        brace_start = content.find('{')
        brace_end = content.rfind('}')
        if brace_start != -1 and brace_end > brace_start:
            try:
                json_str = content[brace_start:brace_end + 1]
                data = json.loads(json_str)
                return response_type.model_validate(data)
            except (json.JSONDecodeError, ValueError):
                pass

        raise ValueError(
            f"Failed to parse LLM response as {response_type.__name__}: "
            f"{content[:200]}..."
        )

    @property
    def active(self) -> str:
        """
        Get active model name

        Returns:
            Active model name
        """
        return self._get_config_value("model", "gpt-3.5-turbo")

    def __repr__(self) -> str:
        """String representation"""
        model = self.active
        base_url = self._get_config_value("base_url", "default")
        return f"<LLMService model={model!r} base_url={base_url!r}>"
