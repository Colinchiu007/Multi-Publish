"""视频作品采集（抖音/小红书 + ASR 转写）测试。

覆盖：模型扩展向后兼容、平台检测、错误分类、管线各阶段（mock yt-dlp/ffmpeg/ASR）。
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ── 1. CollectResult 模型扩展（向后兼容） ──────────────────────────────

def test_collect_result_old_data_backward_compatible():
    """旧 JSON（无新字段）反序列化 → media_type=article，新字段为默认值。"""
    from multi_publish.aggregation.models import CollectResult

    old = CollectResult(title="t", content="c", source_url="https://example.com")
    assert old.media_type == "article"
    assert old.video_url == ""
    assert old.duration == 0.0
    assert old.transcript == ""


def test_collect_result_video_fields():
    from multi_publish.aggregation.models import CollectResult

    r = CollectResult(title="t", content="文案", media_type="video", video_url="https://v.douyin.com/x/",
                      duration=125.0, transcript="文案")
    assert r.media_type == "video"
    assert r.duration == 125.0


def test_collect_result_rejects_invalid_media_type():
    from multi_publish.aggregation.models import CollectResult
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        CollectResult(media_type="audio")


def test_collect_video_request_validation():
    from multi_publish.aggregation.models import CollectVideoRequest
    import pydantic

    req = CollectVideoRequest(url="https://v.douyin.com/abc/")
    assert req.asr_engine is None

    with pytest.raises(pydantic.ValidationError):
        CollectVideoRequest(url="not-a-url")
    with pytest.raises(pydantic.ValidationError):
        CollectVideoRequest(url="https://v.douyin.com/abc/", asr_engine="bad_engine")


# ── 2. 平台检测 ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("url,expected", [
    ("https://v.douyin.com/abc123/", "douyin"),
    ("https://www.douyin.com/video/730123", "douyin"),
    ("https://www.xiaohongshu.com/explore/abc", "xiaohongshu"),
    ("https://xhslink.com/xyz", "xiaohongshu"),
    ("https://www.zhihu.com/question/123", None),
    ("https://example.com", None),
])
def test_detect_platform(url, expected):
    from multi_publish.aggregation.video_service import detect_platform
    assert detect_platform(url) == expected


# ── 3. 下载错误分类 ─────────────────────────────────────────────────────

def test_classify_download_error_categories():
    from multi_publish.aggregation.video_service import classify_download_error

    assert classify_download_error("This video is private")[0] == "VIDEOCLONE_LINK_PRIVATE"
    assert classify_download_error("captcha required")[0] == "VIDEOCLONE_LINK_ANTI_BOT"
    assert classify_download_error("video not found")[0] == "VIDEOCLONE_LINK_UNAVAILABLE"


# ── 4. ASR 引擎抽象 ─────────────────────────────────────────────────────

def test_get_asr_engine_default():
    from multi_publish.aggregation.asr_engine import FasterWhisperEngine, get_asr_engine
    engine = get_asr_engine(None)
    assert isinstance(engine, FasterWhisperEngine)


def test_get_asr_engine_unknown():
    from multi_publish.aggregation.asr_engine import AsrEngineError, get_asr_engine
    with pytest.raises(AsrEngineError):
        get_asr_engine("nonexistent")


def test_faster_whisper_engine_missing_dependency():
    from multi_publish.aggregation.asr_engine import AsrEngineError, FasterWhisperEngine

    engine = FasterWhisperEngine()
    with patch("builtins.__import__", side_effect=ImportError("no faster_whisper")):
        assert engine.is_available() is False
        with pytest.raises(AsrEngineError) as exc_info:
            engine.transcribe("/nonexistent/audio.wav")
        assert exc_info.value.code in ("no_audio", "engine_unavailable")


def test_faster_whisper_engine_transcribe_mock(tmp_path):
    from multi_publish.aggregation.asr_engine import FasterWhisperEngine

    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")

    seg1 = MagicMock(); seg1.id = 0; seg1.start = 0.0; seg1.end = 2.0; seg1.text = " 你好 "
    seg2 = MagicMock(); seg2.id = 1; seg2.start = 2.0; seg2.end = 4.0; seg2.text = "世界 "
    info = MagicMock(); info.language = "zh"; info.duration = 4.0

    fake_model = MagicMock()
    fake_model.transcribe.return_value = (iter([seg1, seg2]), info)

    engine = FasterWhisperEngine()
    with patch("multi_publish.aggregation.asr_engine.Path.exists", return_value=True):
        with patch.dict("sys.modules", {"faster_whisper": MagicMock(WhisperModel=MagicMock(return_value=fake_model)), "torch": MagicMock()}):
            import sys
            torch_mock = sys.modules["torch"]
            torch_mock.cuda.is_available.return_value = False
            result = engine.transcribe(str(audio))

    assert result.text == "你好世界"
    assert result.language == "zh"
    assert result.duration_seconds == 4.0
    assert len(result.segments) == 2


# ── 5. VideoCollectService 管线（mock 子进程） ──────────────────────────

def _make_completed(returncode=0, stdout="", stderr=""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = stdout
    proc.stderr = stderr
    return proc


def test_collect_video_success(tmp_path, monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest
    from multi_publish.aggregation.asr_engine import AsrResult

    svc = video_service.VideoCollectService()

    meta_json = json.dumps({"title": "测试视频", "duration": 60, "uploader": "作者", "thumbnail": "https://t.example/c.jpg"})

    def fake_run(cmd, timeout=None, **kwargs):
        if "--dump-json" in cmd:
            return _make_completed(0, stdout=meta_json)
        if cmd[0] == "yt-dlp":
            return _make_completed(0)
        if "-select_streams" in cmd:
            return _make_completed(0, stdout=json.dumps({"streams": [{"codec_type": "audio"}]}))
        return _make_completed(0)  # ffmpeg

    def fake_stat(self, *a, **kw):
        st = MagicMock(); st.st_size = 1024; return st

    fake_engine = MagicMock()
    fake_engine.is_available.return_value = True
    fake_engine.transcribe.return_value = AsrResult(
        text="这是转写文案", language="zh", duration_seconds=60.0,
        segments=[{"id": 0, "start": 0, "end": 60, "text": "这是转写文案"}], engine="faster_whisper",
    )

    monkeypatch.setattr(video_service, "_run_subprocess", fake_run)
    monkeypatch.setattr(Path, "stat", fake_stat)
    monkeypatch.setattr(video_service, "get_asr_engine", lambda name=None: fake_engine)
    monkeypatch.setattr(video_service.VideoCollectService, "_transcribe_with_timeout",
                        lambda self, eng, p: fake_engine.transcribe(p))

    result = svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))

    assert result.media_type == "video"
    assert result.title == "测试视频"
    assert result.content == "这是转写文案"
    assert result.transcript == "这是转写文案"
    assert result.word_count == len("这是转写文案")
    assert result.metadata["platform"] == "douyin"
    assert result.metadata["asr_engine"] == "faster_whisper"


def test_collect_video_rejects_non_video_platform():
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://example.com/video"))
    assert exc_info.value.code == "VIDEOCLONE_INVALID_PLATFORM"


def test_collect_video_probe_anti_bot(tmp_path, monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    monkeypatch.setattr(video_service, "_run_subprocess",
                        lambda *a, **kw: _make_completed(1, stderr="captcha required"))

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))
    assert exc_info.value.code == "VIDEOCLONE_LINK_ANTI_BOT"
    assert "风控" in exc_info.value.message


def test_collect_video_too_long_at_probe(monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    meta = json.dumps({"title": "长视频", "duration": 15 * 60})
    monkeypatch.setattr(video_service, "_run_subprocess",
                        lambda *a, **kw: _make_completed(0, stdout=meta))

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://www.xiaohongshu.com/explore/x"))
    assert exc_info.value.code == "VIDEOCLONE_FILE_TOO_LARGE"


def test_collect_video_no_audio_stream(tmp_path, monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    meta = json.dumps({"title": "t", "duration": 30})

    def fake_run(cmd, timeout=None, **kwargs):
        if "--dump-json" in cmd:
            return _make_completed(0, stdout=meta)
        if "-select_streams" in cmd:
            return _make_completed(0, stdout=json.dumps({"streams": []}))
        return _make_completed(0)

    def fake_stat(self, *a, **kw):
        st = MagicMock(); st.st_size = 1024; return st

    monkeypatch.setattr(video_service, "_run_subprocess", fake_run)
    monkeypatch.setattr(Path, "stat", fake_stat)

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))
    assert exc_info.value.code == "-8"
    assert "无音轨" in exc_info.value.message


def test_collect_video_engine_unavailable(monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    fake_engine = MagicMock()
    fake_engine.is_available.return_value = False
    fake_engine.install_hint.return_value = "请安装 faster-whisper"
    monkeypatch.setattr(video_service, "get_asr_engine", lambda name=None: fake_engine)

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))
    assert exc_info.value.code == "-6"


def test_collect_video_transcribe_timeout(monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest

    svc = video_service.VideoCollectService()
    meta = json.dumps({"title": "t", "duration": 30})

    def fake_run(cmd, timeout=None, **kwargs):
        if "--dump-json" in cmd:
            return _make_completed(0, stdout=meta)
        if "-select_streams" in cmd:
            return _make_completed(0, stdout=json.dumps({"streams": [{"codec_type": "audio"}]}))
        return _make_completed(0)

    def fake_stat(self, *a, **kw):
        st = MagicMock(); st.st_size = 1024; return st

    def fake_transcribe_timeout(self, engine, path):
        raise asyncio.TimeoutError()

    import asyncio
    monkeypatch.setattr(video_service, "_run_subprocess", fake_run)
    monkeypatch.setattr(Path, "stat", fake_stat)
    monkeypatch.setattr(video_service.VideoCollectService, "_transcribe_with_timeout", fake_transcribe_timeout)

    fake_engine = MagicMock()
    fake_engine.is_available.return_value = True
    monkeypatch.setattr(video_service, "get_asr_engine", lambda name=None: fake_engine)

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))
    assert exc_info.value.code == "-7"


def test_collect_video_empty_transcript(monkeypatch):
    from multi_publish.aggregation import video_service
    from multi_publish.aggregation.models import CollectVideoRequest
    from multi_publish.aggregation.asr_engine import AsrResult

    svc = video_service.VideoCollectService()
    meta = json.dumps({"title": "t", "duration": 30})

    def fake_run(cmd, timeout=None, **kwargs):
        if "--dump-json" in cmd:
            return _make_completed(0, stdout=meta)
        if "-select_streams" in cmd:
            return _make_completed(0, stdout=json.dumps({"streams": [{"codec_type": "audio"}]}))
        return _make_completed(0)

    def fake_stat(self, *a, **kw):
        st = MagicMock(); st.st_size = 1024; return st

    monkeypatch.setattr(video_service, "_run_subprocess", fake_run)
    monkeypatch.setattr(Path, "stat", fake_stat)
    monkeypatch.setattr(video_service.VideoCollectService, "_transcribe_with_timeout",
                        lambda self, e, p: AsrResult(text="", language="zh", duration_seconds=30.0, engine="faster_whisper"))

    fake_engine = MagicMock()
    fake_engine.is_available.return_value = True
    monkeypatch.setattr(video_service, "get_asr_engine", lambda name=None: fake_engine)

    with pytest.raises(video_service.VideoCollectError) as exc_info:
        svc.collect_video(CollectVideoRequest(url="https://v.douyin.com/abc/"))
    assert exc_info.value.code == "ASR_EMPTY"
