"""PromptEval 生成/翻译/评估服务测试（fake HTTP client）。"""
import base64
import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import prompt_eval_generation_service as gen  # noqa: E402
from services import prompt_eval_translation_service as tr  # noqa: E402
from services import prompt_eval_evaluation_service as ev  # noqa: E402
from services import prompt_eval_contract as contract  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class FakeResponse:
    def __init__(self, status_code, json_data, text="", content=b""):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.content = content

    def json(self):
        return self._json


class FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def post(self, url, json=None, headers=None):
        self.calls.append({"url": url, "json": json, "method": "post"})
        if self.responses:
            return self.responses.pop(0)
        return FakeResponse(200, {})

    async def get(self, url, headers=None):
        self.calls.append({"url": url, "method": "get"})
        if self.responses:
            return self.responses.pop(0)
        return FakeResponse(200, {})

    async def aclose(self):
        pass


def _cfg():
    return {"provider": "minimax-image", "model": "image-01", "api_key": "sk", "base_url": "https://x/v1"}


@pytest.mark.asyncio
async def test_generate_saves_valid_image_and_retries_429():
    out = tempfile.mkdtemp(prefix="pe-gen-")
    client = FakeClient([
        FakeResponse(429, {}, "rate"),
        FakeResponse(200, {"data": {"image_base64": [base64.b64encode(PNG).decode("ascii")]}, "base_resp": {"status_code": 0, "status_msg": "success"}}),
    ])
    files = await gen.generate_images(_cfg(), "提示词", 1, "1:1", out, 7, http=client)
    assert len(files) == 1 and files[0].startswith("run_7_")
    assert len(client.calls) == 2  # 429 后重试
    assert client.calls[-1]["url"] == "https://x/v1/image_generation"
    saved = open(os.path.join(out, files[0]), "rb").read()
    assert gen.validate_image_bytes(saved)


@pytest.mark.asyncio
async def test_generate_empty_or_invalid_fails():
    out = tempfile.mkdtemp(prefix="pe-gen2-")
    client = FakeClient([FakeResponse(200, {"data": {}, "base_resp": {"status_code": 0, "status_msg": "success"}})])
    with pytest.raises(gen.GenerationError, match="空结果"):
        await gen.generate_images(_cfg(), "p", 1, "1:1", out, 1, http=client)
    client2 = FakeClient([FakeResponse(200, {"data": {"image_base64": [base64.b64encode(b"not an image").decode("ascii")]}, "base_resp": {"status_code": 0, "status_msg": "success"}})])
    with pytest.raises(gen.GenerationError, match="魔数"):
        await gen.generate_images(_cfg(), "p", 1, "1:1", out, 2, http=client2)


def test_minimax_payload_contract():
    # MiniMax image-01：无 size、response_format=base64、保留 aspect_ratio/n
    p = gen.build_image_payload("minimax-image", "image-01", "p", 2, "16:9")
    assert p == {"model": "image-01", "prompt": "p", "n": 2, "aspect_ratio": "16:9", "response_format": "base64"}
    assert "size" not in p
    # n 越界（0 或 >9）→ fail closed（前端允许 1-20，MiniMax 仅 1-9）
    for bad_n in (0, -1, 10, 20):
        with pytest.raises(gen.GenerationError, match="1-9"):
            gen.build_image_payload("minimax-image", "image-01", "p", bad_n, "1:1")
    # flux 保持 OpenAI 兼容（size + b64_json）
    pf = gen.build_image_payload("flux", "f", "p", 1, "1:1")
    assert pf["size"] == "1024x1024" and pf["response_format"] == "b64_json"


@pytest.mark.asyncio
async def test_minimax_generate_uses_image_generation_endpoint():
    out = tempfile.mkdtemp(prefix="pe-gen-mm-")
    client = FakeClient([FakeResponse(200, {
        "data": {"image_base64": ["data:image/png;base64," + base64.b64encode(PNG).decode("ascii")]},
        "base_resp": {"status_code": 0, "status_msg": "success"},
    })])
    files = await gen.generate_images(_cfg(), "p", 1, "1:1", out, 9, http=client)
    assert client.calls[0]["url"] == "https://x/v1/image_generation"
    assert client.calls[0]["json"]["response_format"] == "base64"
    assert "size" not in client.calls[0]["json"]
    assert len(files) == 1
    assert gen.validate_image_bytes(open(os.path.join(out, files[0]), "rb").read())


@pytest.mark.asyncio
async def test_minimax_base64_plain_and_data_url_prefix():
    out = tempfile.mkdtemp(prefix="pe-gen-mm-b64-")
    b64 = base64.b64encode(PNG).decode("ascii")
    # 纯 base64（官方契约 image_base64）与 data URL 前缀均兼容
    client = FakeClient([FakeResponse(200, {"data": {"image_base64": [b64, "data:image/png;base64," + b64]}, "base_resp": {"status_code": 0, "status_msg": "success"}})])
    files = await gen.generate_images(_cfg(), "p", 2, "1:1", out, 6, http=client)
    assert len(files) == 2
    for f in files:
        assert gen.validate_image_bytes(open(os.path.join(out, f), "rb").read())


@pytest.mark.asyncio
async def test_minimax_business_failure_fail_closed():
    out = tempfile.mkdtemp(prefix="pe-gen-mm-fail-")
    client = FakeClient([FakeResponse(200, {"data": {}, "base_resp": {"status_code": 1001, "status_msg": "invalid params"}})])
    with pytest.raises(gen.GenerationError, match="业务失败 1001"):
        await gen.generate_images(_cfg(), "p", 1, "1:1", out, 3, http=client)
    assert len(client.calls) == 1  # 业务失败不重试


@pytest.mark.asyncio
async def test_minimax_business_success_with_string_status_code():
    # 官方契约示例 metadata 为字符串；base_resp.status_code 若为 "0" 字符串不得误判失败
    out = tempfile.mkdtemp(prefix="pe-gen-mm-str-")
    b64 = base64.b64encode(PNG).decode("ascii")
    client = FakeClient([FakeResponse(200, {"data": {"image_base64": [b64]}, "base_resp": {"status_code": "0", "status_msg": "success"}})])
    files = await gen.generate_images(_cfg(), "p", 1, "1:1", out, 8, http=client)
    assert len(files) == 1


@pytest.mark.asyncio
async def test_minimax_count_shortfall_fail_closed():
    out = tempfile.mkdtemp(prefix="pe-gen-mm-short-")
    b64 = base64.b64encode(PNG).decode("ascii")
    client = FakeClient([FakeResponse(200, {"data": {"image_base64": [b64]}, "base_resp": {"status_code": 0, "status_msg": "success"}})])
    with pytest.raises(gen.GenerationError, match="数量不符"):
        await gen.generate_images(_cfg(), "p", 2, "1:1", out, 9, http=client)


@pytest.mark.asyncio
async def test_minimax_url_result_downloads():
    out = tempfile.mkdtemp(prefix="pe-gen-mm-url-")
    client = FakeClient([
        FakeResponse(200, {"data": {"image_urls": ["https://img.example.com/a.png"]}, "base_resp": {"status_code": 0, "status_msg": "success"}}),
        FakeResponse(200, {}, content=PNG),
    ])
    files = await gen.generate_images(_cfg(), "p", 1, "1:1", out, 4, http=client)
    assert len(files) == 1 and files[0].startswith("run_4_")
    assert client.calls[1]["method"] == "get"
    assert gen.validate_image_bytes(open(os.path.join(out, files[0]), "rb").read())


@pytest.mark.asyncio
async def test_flux_still_uses_openai_images_generations():
    out = tempfile.mkdtemp(prefix="pe-gen-flux-")
    client = FakeClient([FakeResponse(200, {"data": [{"b64_json": base64.b64encode(PNG).decode("ascii")}], "base_resp": {"status_code": 0, "status_msg": "success"}})])
    files = await gen.generate_images({"provider": "flux", "model": "f", "api_key": "sk", "base_url": "https://x/v1"}, "p", 1, "1:1", out, 5, http=client)
    assert client.calls[0]["url"] == "https://x/v1/images/generations"
    assert client.calls[0]["json"]["size"] == "1024x1024"
    assert client.calls[0]["json"]["response_format"] == "b64_json"
    assert len(files) == 1  # 非 MiniMax 忽略 base_resp，不被误拦截


def test_magic_validation():
    assert gen.validate_image_bytes(PNG)
    assert gen.validate_image_bytes(b"\xff\xd8\xff" + b"x" * 8)
    assert not gen.validate_image_bytes(b"hello world")
    assert not gen.validate_image_bytes(b"")


@pytest.mark.asyncio
async def test_provider_connection_probe():
    from services import prompt_eval_service as svc

    class FakeDB:
        async def execute(self, stmt):
            class _R:
                def scalar_one_or_none(self):
                    return None

                def scalars(self):
                    return []

            return _R()

    db = FakeDB()
    # 1) chat 探测 200 → ok
    client = FakeClient([FakeResponse(200, {})])
    r = await svc.test_provider_connection(db, {"provider": "minimax-llm", "model": "M2.7",
                                                "api_key": "sk", "base_url": "https://x/v1"}, "secret", http=client)
    assert r["ok"] is True
    assert "chat/completions" in r["detail"]
    assert client.calls[0]["url"] == "https://x/v1/chat/completions"
    assert client.calls[0]["json"]["max_tokens"] == 1

    # 2) chat 401 → ValueError 带状态码，且不触发 /models 回退
    client2 = FakeClient([FakeResponse(401, {}, "unauthorized")])
    with pytest.raises(svc.ValueError if hasattr(svc, "ValueError") else ValueError, match="401"):
        await svc.test_provider_connection(db, {"provider": "x", "model": "m", "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client2)
    assert len(client2.calls) == 1

    # 3) chat 404 → fallback /models 200 → ok
    client3 = FakeClient([FakeResponse(404, {}, "nf"), FakeResponse(200, {})])
    r3 = await svc.test_provider_connection(db, {"provider": "flux", "model": "f", "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client3)
    assert r3["ok"] is True and "/models" in r3["detail"]

    # 4) chat 404 + models 404 → ValueError 提示真实生成验证
    client4 = FakeClient([FakeResponse(404, {}, "nf"), FakeResponse(404, {}, "nf")])
    with pytest.raises(ValueError, match="真实生成"):
        await svc.test_provider_connection(db, {"provider": "flux", "model": "f", "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client4)

    # 5) 无 api_key 且未保存 → ValueError
    with pytest.raises(ValueError, match="API Key"):
        await svc.test_provider_connection(db, {"provider": "flux", "model": "f", "base_url": "https://x/v1"}, "s", http=FakeClient([]))

    # 6) chat 400（MiniMax 图片模型 unknown model）→ fallback /models 200 → ok
    client6 = FakeClient([FakeResponse(400, {}, "invalid params, unknown model 'image-01'"), FakeResponse(200, {})])
    r6 = await svc.test_provider_connection(db, {"provider": "minimax-image", "model": "image-01",
                                                 "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client6)
    assert r6["ok"] is True and "/models" in r6["detail"]
    assert client6.calls[1]["url"] == "https://x/v1/models"
    assert len(client6.calls) == 2

    # 7) chat 400 + models 404 → ValueError 提示真实生成验证（不误判成功）
    client7 = FakeClient([FakeResponse(400, {}, "unknown model"), FakeResponse(404, {}, "nf")])
    with pytest.raises(ValueError, match="真实生成"):
        await svc.test_provider_connection(db, {"provider": "minimax-image", "model": "image-01",
                                                 "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client7)

    # 8) chat 400 非模型类错误（参数非法等）→ 不回退，直接失败
    client8 = FakeClient([FakeResponse(400, {}, "invalid request body")])
    with pytest.raises(ValueError, match="400"):
        await svc.test_provider_connection(db, {"provider": "minimax-image", "model": "image-01",
                                                 "api_key": "sk", "base_url": "https://x/v1"}, "s", http=client8)
    assert len(client8.calls) == 1


def test_strip_think_block():
    # 推理模型返回 <think>...</think> 思维链 + 最终内容 → 只保留最终内容
    assert tr._strip_think("<think>让我分析</think>写实风格，老妇人做饭") == "写实风格，老妇人做饭"
    assert tr._strip_think("<think>第一段\n第二段</think>\n\nA realistic scene") == "A realistic scene"
    # 无 think 块 → 原样（去除首尾空白）
    assert tr._strip_think("  写实风格  ") == "写实风格"
    # 仅 think 块 → 空
    assert tr._strip_think("<think>only reasoning</think>") == ""


@pytest.mark.asyncio
async def test_translate_success_and_failure():
    client = FakeClient([FakeResponse(200, {"choices": [{"message": {"content": "  A realistic scene  "}}]})])
    text = await tr.translate_prompt_zh(_cfg(), "中文提示词", http=client)
    assert text == "A realistic scene"
    # 推理模型：content 含 <think> 块 → 剥离后返回
    client_th = FakeClient([FakeResponse(200, {"choices": [{"message": {"content": "<think>翻译思路</think>A realistic old woman cooking over a fire"}}]})])
    text_th = await tr.translate_prompt_zh(_cfg(), "中文提示词", http=client_th)
    assert text_th == "A realistic old woman cooking over a fire"
    # 仅 think 块 → 视为空内容 fail closed
    client_empty = FakeClient([FakeResponse(200, {"choices": [{"message": {"content": "<think>only</think>"}}]})])
    with pytest.raises(tr.TranslationError, match="空内容"):
        await tr.translate_prompt_zh(_cfg(), "p", http=client_empty)
    client2 = FakeClient([FakeResponse(200, {"choices": [{"message": {"content": "  "}}]})])
    with pytest.raises(tr.TranslationError, match="空内容"):
        await tr.translate_prompt_zh(_cfg(), "p", http=client2)
    client3 = FakeClient([FakeResponse(500, {}, "err")])
    with pytest.raises(tr.TranslationError):
        await tr.translate_prompt_zh(_cfg(), "p", http=client3)


def _valid_eval(image_count=1):
    dims = [{"id": d["id"], "score": 80, "evidence": "e", "issues": [], "suggestions": []} for d in contract.resolve_dimension_weights(image_count)]
    return {"overall": 80, "dimensions": dims, "problems": [], "promptOptimizationPoints": []}


def test_eval_prompt_and_fail_closed():
    prompt = ev.build_eval_prompt("原文", "上下文", "中文提示词", "EN prompt", 1)
    assert "原文" in prompt and "EN prompt" in prompt and "relevance" in prompt
    assert "cross_image_consistency" not in prompt
    prompt2 = ev.build_eval_prompt("原文", None, "中文", None, 2)
    assert "cross_image_consistency" in prompt2

    parsed = ev.parse_and_validate(json.dumps(_valid_eval(1)), 1)
    assert parsed["overall"] == 80
    with pytest.raises(ev.EvaluationError):
        ev.parse_and_validate("not json", 1)
    bad = _valid_eval(); bad["overall"] = 101
    with pytest.raises(ev.EvaluationError):
        ev.parse_and_validate(json.dumps(bad), 1)
    bad2 = _valid_eval(); bad2.pop("problems")
    with pytest.raises(ev.EvaluationError):
        ev.parse_and_validate(json.dumps(bad2), 1)
    with pytest.raises(ev.EvaluationError):
        ev.parse_and_validate(json.dumps(_valid_eval(1)), 2)  # 单图 3 维度提交给多图


@pytest.mark.asyncio
async def test_evaluate_images_success():
    raw = json.dumps(_valid_eval(1))
    client = FakeClient([FakeResponse(200, {"choices": [{"message": {"content": raw}}]})])
    text = await ev.evaluate_images(_cfg(), "prompt", [PNG], http=client)
    parsed = ev.parse_and_validate(text, 1)
    assert parsed["overall"] == 80
