"""Tests for LLMService and LLM presets — migrated from Pixelle-Video (Apache 2.0).

Covers:
  1. Direct JSON parsing (happy path)
  2. Markdown code block fallback (```json ... ```)
  3. Brace extraction fallback (first `{` to last `}`)
  4. Runtime parameter override (api_key / base_url / model at call time)
  5. All 6 presets carry correct base_url / model
  6. Empty / malformed LLM response -> empty string (text) or ValueError (structured)
  7. HTTP calls are mocked — no real API traffic
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from multi_publish.services.llm_presets import (
    LLM_PRESETS,
    find_preset_by_base_url_and_model,
    get_preset,
    get_preset_names,
)
from multi_publish.services.llm_service import LLMService


# --------------------------------------------------------------------------- #
# Pydantic model used across structured-output tests
# --------------------------------------------------------------------------- #
class MovieReview(BaseModel):
    title: str
    rating: int
    summary: str


# --------------------------------------------------------------------------- #
# Mock helpers
# --------------------------------------------------------------------------- #
def _make_mock_client(content: str, base_url: str = "https://mock.test/v1"):
    """Build a fake AsyncOpenAI client whose create() returns `content`."""
    client = MagicMock()
    client.base_url = base_url
    message = MagicMock()
    message.content = content
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    client.chat.completions.create = AsyncMock(return_value=response)
    return client


# --------------------------------------------------------------------------- #
# Presets
# --------------------------------------------------------------------------- #
class TestLLMPresets:
    def test_has_exactly_six_presets(self):
        assert len(LLM_PRESETS) == 6

    def test_preset_names(self):
        names = get_preset_names()
        assert names == ["Qwen", "OpenAI", "Claude", "DeepSeek", "Ollama", "Moonshot"]

    def test_qwen_preset(self):
        p = get_preset("Qwen")
        assert p["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
        assert p["model"] == "qwen-max"

    def test_openai_preset(self):
        p = get_preset("OpenAI")
        assert p["base_url"] == "https://api.openai.com/v1"
        assert p["model"] == "gpt-4o"

    def test_claude_preset(self):
        p = get_preset("Claude")
        assert p["base_url"] == "https://api.anthropic.com/v1/"
        assert p["model"] == "claude-sonnet-4-5"

    def test_deepseek_preset(self):
        p = get_preset("DeepSeek")
        assert p["base_url"] == "https://api.deepseek.com"
        assert p["model"] == "deepseek-chat"

    def test_ollama_preset(self):
        p = get_preset("Ollama")
        assert p["base_url"] == "http://localhost:11434/v1"
        assert p["model"] == "llama3.2"
        # Ollama needs a placeholder key for the OpenAI SDK
        assert p["default_api_key"] == "ollama"

    def test_moonshot_preset(self):
        p = get_preset("Moonshot")
        assert p["base_url"] == "https://api.moonshot.cn/v1"
        assert p["model"] == "moonshot-v1-8k"

    def test_get_preset_unknown_returns_empty(self):
        assert get_preset("DoesNotExist") == {}

    def test_find_preset_by_base_url_and_model_hit(self):
        assert (
            find_preset_by_base_url_and_model(
                "https://api.openai.com/v1", "gpt-4o"
            )
            == "OpenAI"
        )

    def test_find_preset_by_base_url_and_model_miss(self):
        assert find_preset_by_base_url_and_model("https://nope", "nope") is None


# --------------------------------------------------------------------------- #
# Three-tier JSON parsing (unit-test the parser directly)
# --------------------------------------------------------------------------- #
class TestParseResponseAsModel:
    def setup_method(self):
        self.svc = LLMService()

    def test_direct_json_happy_path(self):
        content = '{"title": "Inception", "rating": 9, "summary": "A heist movie."}'
        result = self.svc._parse_response_as_model(content, MovieReview)
        assert isinstance(result, MovieReview)
        assert result.title == "Inception"
        assert result.rating == 9

    def test_markdown_code_block_with_json_lang(self):
        content = 'Here you go:\n```json\n{"title": "Up", "rating": 8, "summary": "Balloons."}\n```\nDone.'
        result = self.svc._parse_response_as_model(content, MovieReview)
        assert result.title == "Up"
        assert result.rating == 8

    def test_markdown_code_block_without_lang(self):
        content = '```\n{"title": "Wall-E", "rating": 7, "summary": "Robot love."}\n```'
        result = self.svc._parse_response_as_model(content, MovieReview)
        assert result.title == "Wall-E"

    def test_brace_extraction_fallback(self):
        content = 'Sure! Here is the review: {"title": "Coco", "rating": 10, "summary": "Music."} hope it helps!'
        result = self.svc._parse_response_as_model(content, MovieReview)
        assert result.title == "Coco"
        assert result.rating == 10

    def test_malformed_raises_value_error(self):
        with pytest.raises(ValueError):
            self.svc._parse_response_as_model("not json at all, no braces", MovieReview)

    def test_empty_raises_value_error(self):
        with pytest.raises(ValueError):
            self.svc._parse_response_as_model("", MovieReview)

    def test_json_with_trailing_prose_uses_brace_extraction(self):
        # realistic LLM output: valid JSON followed by prose (no stray braces)
        content = '{"title": "Dune", "rating": 9, "summary": "Sand."} hope this helps!'
        # brace extraction (first { to last }) yields the valid JSON object
        result = self.svc._parse_response_as_model(content, MovieReview)
        assert result.title == "Dune"

    def test_stray_brace_in_prose_raises_value_error(self):
        # pathological case: a stray `}` in trailing prose breaks brace extraction.
        # All three tiers fail -> ValueError, matching source behaviour.
        content = '{"title": "Dune", "rating": 9, "summary": "Sand."} extra }'
        with pytest.raises(ValueError):
            self.svc._parse_response_as_model(content, MovieReview)


# --------------------------------------------------------------------------- #
# JSON schema instruction
# --------------------------------------------------------------------------- #
class TestJsonSchemaInstruction:
    def test_instruction_contains_schema(self):
        svc = LLMService()
        instruction = svc._get_json_schema_instruction(MovieReview)
        assert "JSON" in instruction
        assert "title" in instruction
        assert "rating" in instruction


# --------------------------------------------------------------------------- #
# End-to-end __call__ behaviour (HTTP mocked)
# --------------------------------------------------------------------------- #
class TestLLMServiceCall:
    @pytest.mark.asyncio
    async def test_plain_text_returns_string(self):
        svc = LLMService(config={"model": "gpt-4o"})
        mock_client = _make_mock_client("Hello world")
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Say hi")
        assert result == "Hello world"
        mock_client.chat.completions.create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_structured_output_direct_json(self):
        svc = LLMService(config={"model": "gpt-4o"})
        body = '{"title": "Inception", "rating": 9, "summary": "Dreams."}'
        mock_client = _make_mock_client(body)
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Review Inception", response_type=MovieReview)
        assert isinstance(result, MovieReview)
        assert result.title == "Inception"

    @pytest.mark.asyncio
    async def test_structured_output_markdown_fallback(self):
        svc = LLMService(config={"model": "qwen-max"})
        body = '```json\n{"title": "Up", "rating": 8, "summary": "Balloons."}\n```'
        mock_client = _make_mock_client(body)
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Review Up", response_type=MovieReview)
        assert result.title == "Up"

    @pytest.mark.asyncio
    async def test_structured_output_brace_fallback(self):
        svc = LLMService(config={"model": "deepseek-chat"})
        body = 'Sure! {"title": "Coco", "rating": 10, "summary": "Music."} enjoy!'
        mock_client = _make_mock_client(body)
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Review Coco", response_type=MovieReview)
        assert result.title == "Coco"

    @pytest.mark.asyncio
    async def test_runtime_override_api_key_base_url_model(self):
        """api_key / base_url / model passed at call time must reach the client + request."""
        svc = LLMService(config={"model": "default-model"})
        mock_client = _make_mock_client('{"title": "X", "rating": 1, "summary": "Y"}')

        with patch.object(svc, "_create_client", return_value=mock_client) as mock_factory:
            await svc(
                "Review",
                response_type=MovieReview,
                api_key="runtime-key",
                base_url="https://runtime.example/v1",
                model="runtime-model",
            )

        # _create_client receives api_key + base_url
        mock_factory.assert_called_once_with(api_key="runtime-key", base_url="https://runtime.example/v1")
        # the request uses the runtime model, not the config default
        create_kwargs = mock_client.chat.completions.create.await_args.kwargs
        assert create_kwargs["model"] == "runtime-model"

    @pytest.mark.asyncio
    async def test_runtime_override_without_response_type(self):
        svc = LLMService(config={"model": "default-model"})
        mock_client = _make_mock_client("plain answer")
        with patch.object(svc, "_create_client", return_value=mock_client) as mock_factory:
            result = await svc(
                "hi",
                api_key="k",
                base_url="https://b.example/v1",
                model="m",
            )
        assert result == "plain answer"
        mock_factory.assert_called_once_with(api_key="k", base_url="https://b.example/v1")
        assert mock_client.chat.completions.create.await_args.kwargs["model"] == "m"

    @pytest.mark.asyncio
    async def test_empty_text_response_returns_empty_string(self):
        svc = LLMService(config={"model": "gpt-4o"})
        mock_client = _make_mock_client("")
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Say nothing")
        assert result == ""

    @pytest.mark.asyncio
    async def test_non_string_content_returns_empty_string(self):
        svc = LLMService(config={"model": "gpt-4o"})
        mock_client = _make_mock_client(None)
        with patch.object(svc, "_create_client", return_value=mock_client):
            result = await svc("Say nothing")
        assert result == ""

    @pytest.mark.asyncio
    async def test_malformed_structured_raises_value_error(self):
        svc = LLMService(config={"model": "gpt-4o"})
        mock_client = _make_mock_client("totally not json, no braces here")
        with patch.object(svc, "_create_client", return_value=mock_client):
            with pytest.raises(ValueError):
                await svc("Review", response_type=MovieReview)

    @pytest.mark.asyncio
    async def test_empty_structured_raises_value_error(self):
        svc = LLMService(config={"model": "gpt-4o"})
        mock_client = _make_mock_client("")
        with patch.object(svc, "_create_client", return_value=mock_client):
            with pytest.raises(ValueError):
                await svc("Review", response_type=MovieReview)


# --------------------------------------------------------------------------- #
# Config resolution & representation
# --------------------------------------------------------------------------- #
class TestLLMServiceConfig:
    def test_config_dict_provides_values(self):
        svc = LLMService(config={"api_key": "k1", "base_url": "https://c/v1", "model": "m1"})
        assert svc._get_config_value("api_key") == "k1"
        assert svc._get_config_value("base_url") == "https://c/v1"
        assert svc._get_config_value("model") == "m1"

    def test_config_env_fallback(self, monkeypatch):
        monkeypatch.setenv("LLM_API_KEY", "env-key")
        monkeypatch.setenv("LLM_MODEL", "env-model")
        svc = LLMService()
        assert svc._get_config_value("api_key") == "env-key"
        assert svc._get_config_value("model") == "env-model"

    def test_config_default_when_missing(self, monkeypatch):
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("LLM_MODEL", raising=False)
        svc = LLMService()
        assert svc._get_config_value("api_key") is None
        assert svc._get_config_value("model", "gpt-3.5-turbo") == "gpt-3.5-turbo"

    def test_create_client_uses_runtime_params(self):
        svc = LLMService()
        with patch("multi_publish.services.llm_service.AsyncOpenAI") as mock_openai:
            svc._create_client(api_key="rt-key", base_url="https://rt/v1")
        mock_openai.assert_called_once_with(api_key="rt-key", base_url="https://rt/v1")

    def test_create_client_dummy_key_for_ollama(self, monkeypatch):
        svc = LLMService()
        with patch("multi_publish.services.llm_service.AsyncOpenAI") as mock_openai:
            svc._create_client()  # no api_key, no config, no env
        kwargs = mock_openai.call_args.kwargs
        # falls back to dummy-key so Ollama works without a real key
        assert kwargs["api_key"] == "dummy-key"

    def test_active_property_default(self, monkeypatch):
        monkeypatch.delenv("LLM_MODEL", raising=False)
        svc = LLMService()
        assert svc.active == "gpt-3.5-turbo"

    def test_repr(self):
        svc = LLMService(config={"model": "qwen-max", "base_url": "https://qwen/v1"})
        repr_str = repr(svc)
        assert "qwen-max" in repr_str
        assert "LLMService" in repr_str
