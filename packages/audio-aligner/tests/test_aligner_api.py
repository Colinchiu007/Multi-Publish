# -*- coding: utf-8 -*-
"""audio-aligner API 契约测试（mock transcribe，不依赖真实音频/模型）。"""
import pytest
from fastapi.testclient import TestClient

from aligner import api as api_mod


@pytest.fixture()
def client(monkeypatch):
    return TestClient(api_mod.app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_align_success(client, monkeypatch):
    def fake_transcribe(audio_path, **kwargs):
        return {
            "words": [{"text": "你好", "start": 0.0, "end": 0.5, "probability": 0.99}],
            "segments": [{"text": "你好", "start": 0.0, "end": 0.5}],
            "language": "zh",
            "language_probability": 0.98,
            "duration": 0.5,
            "elapsed_ms": 320,
            "model": "base",
        }

    monkeypatch.setattr(api_mod, "transcribe", fake_transcribe)
    r = client.post("/align", json={"audio_path": "C:/tmp/vo.mp3", "options": {"model": "base", "language": "zh"}})
    assert r.status_code == 200
    body = r.json()
    assert body["words"][0]["text"] == "你好"
    assert body["duration"] == 0.5


def test_align_missing_audio(client, monkeypatch):
    def fake_transcribe(audio_path, **kwargs):
        raise FileNotFoundError(audio_path)

    monkeypatch.setattr(api_mod, "transcribe", fake_transcribe)
    r = client.post("/align", json={"audio_path": "C:/tmp/not-exist.mp3"})
    assert r.status_code == 404


def test_align_transcribe_error(client, monkeypatch):
    def fake_transcribe(audio_path, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(api_mod, "transcribe", fake_transcribe)
    r = client.post("/align", json={"audio_path": "C:/tmp/vo.mp3"})
    assert r.status_code == 500
    assert "boom" in r.json()["detail"]
