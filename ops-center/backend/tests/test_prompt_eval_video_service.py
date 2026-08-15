"""PromptEval 视频生成服务测试：提交/轮询/下载/抽帧/魔数/超时/重试。"""
import asyncio
import os
import pathlib
import subprocess
import sys
import tempfile
import uuid

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import prompt_eval_video_service as vs  # noqa: E402

_RUN_ID = uuid.uuid4().hex[:8]
_TMP = pathlib.Path(tempfile.gettempdir()) / f"ops_pe_video_{_RUN_ID}"
_TMP.mkdir(parents=True, exist_ok=True)

CFG = {"provider": "agnes-video", "model": "agnes-video-v2.0", "api_key": "sk-test", "base_url": "https://apihub.agnes-ai.com/v1"}

MP4_HEAD = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64
PNG_HEAD = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_validate_video_bytes():
    assert vs.validate_video_bytes(MP4_HEAD)
    assert not vs.validate_video_bytes(b"\x00\x00\x00\x18moov" + b"\x00" * 8)  # 非 ftyp
    assert not vs.validate_video_bytes(MP4_HEAD[:8])  # 过短
    assert not vs.validate_video_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 64)  # jpg 拒绝
    big = bytearray(MP4_HEAD)
    big.extend(b"\x00" * (vs.MAX_VIDEO_BYTES + 1))
    assert not vs.validate_video_bytes(bytes(big))


@pytest.mark.asyncio
async def test_submit_video_task_id():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"id": "task-1"}))
    async with httpx.AsyncClient(transport=transport) as client:
        task_id = await vs.submit_video(CFG, "prompt", http=client)
    assert task_id == "task-1"


@pytest.mark.asyncio
async def test_submit_video_retry_then_success(monkeypatch):
    calls = {"n": 0}

    def handler(r):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"error": "video_queue_full"})
        return httpx.Response(200, json={"task_id": "task-2"})

    async def no_sleep(_s):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        task_id = await vs.submit_video(CFG, "p", http=client)
    assert task_id == "task-2"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_submit_video_non_retryable(monkeypatch):
    async def no_sleep(_s):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    transport = httpx.MockTransport(lambda r: httpx.Response(401, json={"error": "unauthorized"}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="401"):
            await vs.submit_video(CFG, "p", http=client)


@pytest.mark.asyncio
async def test_submit_video_missing_task_id():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"ok": True}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="task id"):
            await vs.submit_video(CFG, "p", http=client)


@pytest.mark.asyncio
async def test_poll_video_status_completed():
    def handler(r):
        assert "agnesapi" in str(r.url) and "video_id=task-9" in str(r.url)
        return httpx.Response(200, json={"status": "completed", "metadata": {"url": "https://cdn/v.mp4"}})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        out = await vs.poll_video_status(CFG, "task-9", http=client, timeout=60, interval=0.01)
    assert out == {"status": "completed", "video_url": "https://cdn/v.mp4"}


@pytest.mark.asyncio
async def test_poll_video_status_pending_then_completed(monkeypatch):
    calls = {"n": 0}

    def handler(r):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json={"status": "in_progress", "progress": 30})
        return httpx.Response(200, json={"status": "completed", "metadata": {"url": "https://cdn/v.mp4"}})

    async def no_sleep(_s):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        out = await vs.poll_video_status(CFG, "task-9", http=client, timeout=60, interval=0.01)
    assert out["status"] == "completed"


@pytest.mark.asyncio
async def test_poll_video_status_failed():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "failed", "error": "content rejected"}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="content rejected"):
            await vs.poll_video_status(CFG, "t", http=client, timeout=60, interval=0.01)


@pytest.mark.asyncio
async def test_poll_video_status_timeout(monkeypatch):
    async def no_sleep(_s):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "in_progress"}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="超时"):
            await vs.poll_video_status(CFG, "t", http=client, timeout=0.01, interval=0.001)


@pytest.mark.asyncio
async def test_poll_video_status_completed_without_url():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "completed"}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="下载地址"):
            await vs.poll_video_status(CFG, "t", http=client, timeout=60, interval=0.01)


@pytest.mark.asyncio
async def test_download_video():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=MP4_HEAD))
    async with httpx.AsyncClient(transport=transport) as client:
        data = await vs.download_video("https://cdn/v.mp4", http=client)
    assert data == MP4_HEAD


def test_download_video_rejects_invalid_url():
    with pytest.raises(vs.VideoGenerationError, match="非法"):
        asyncio.run(vs.download_video("file:///etc/passwd"))


@pytest.mark.asyncio
async def test_download_video_magic_fail():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=b"not a video"))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="魔数"):
            await vs.download_video("https://cdn/v.mp4", http=client)


def test_parse_duration():
    assert vs.parse_duration("  Duration: 00:00:05.04, start: 0.000000") == pytest.approx(5.04)
    assert vs.parse_duration("no duration here") is None


@pytest.mark.asyncio
async def test_extract_frames(monkeypatch):
    out = _TMP / "frames"
    out.mkdir(parents=True, exist_ok=True)
    written = {}

    async def fake_run(args, ffmpeg, timeout=None):
        target = pathlib.Path(args[-1])
        written[str(target)] = True
        target.write_bytes(PNG_HEAD)
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr(vs, "_run_ffmpeg", fake_run)
    monkeypatch.setattr(vs, "_probe_duration", lambda p, f: 5.0)
    names = await vs.extract_frames(MP4_HEAD, str(out), 42, ffmpeg="fake-ffmpeg")
    assert names == ["run_42_frame_0.png", "run_42_frame_1.png", "run_42_frame_2.png"]
    assert len(written) == 3
    assert (out / "run_42_video.mp4").read_bytes() == MP4_HEAD  # 视频保留供前端播放
    for n in names:
        assert (out / n).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.asyncio
async def test_extract_frames_fail_closed(monkeypatch):
    out = _TMP / "frames_fail"
    out.mkdir(parents=True, exist_ok=True)

    async def fake_run(args, ffmpeg, timeout=None):
        return subprocess.CompletedProcess(args, 1, b"", b"error decoding")

    monkeypatch.setattr(vs, "_run_ffmpeg", fake_run)
    monkeypatch.setattr(vs, "_probe_duration", lambda p, f: 5.0)
    with pytest.raises(vs.VideoGenerationError, match="抽帧失败"):
        await vs.extract_frames(MP4_HEAD, str(out), 43, ffmpeg="fake-ffmpeg")


def test_extract_frames_requires_ffmpeg(monkeypatch):
    monkeypatch.setattr(vs, "find_ffmpeg", lambda: None)
    with pytest.raises(vs.VideoGenerationError, match="ffmpeg"):
        asyncio.run(vs.extract_frames(MP4_HEAD, str(_TMP), 44, ffmpeg=None))


@pytest.mark.asyncio
async def test_generate_video_full_flow(monkeypatch):
    def handler(r):
        if r.url.path.endswith("/videos") and r.method == "POST":
            return httpx.Response(200, json={"id": "task-v"})
        if "agnesapi" in str(r.url):
            return httpx.Response(200, json={"status": "completed", "metadata": {"url": "https://cdn/v.mp4"}})
        return httpx.Response(200, content=MP4_HEAD)

    out = _TMP / "gen"
    out.mkdir(parents=True, exist_ok=True)
    transport = httpx.MockTransport(handler)

    async def fake_run(args, ffmpeg, timeout=None):
        pathlib.Path(args[-1]).write_bytes(PNG_HEAD)
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr(vs, "_run_ffmpeg", fake_run)
    monkeypatch.setattr(vs, "_probe_duration", lambda p, f: 5.0)

    async with httpx.AsyncClient(transport=transport) as client:
        result = await vs.generate_video(CFG, "prompt", str(out), 45, http=client, poll_timeout=60, poll_interval=0.01)
    assert result["video"] == "run_45_video.mp4"
    assert result["frames"] == ["run_45_frame_0.png", "run_45_frame_1.png", "run_45_frame_2.png"]
    assert (out / "run_45_video.mp4").exists()


@pytest.mark.asyncio
async def test_download_video_stream_cap():
    """流式下载：超过 50MB 即中断（W2），不整包缓冲后再校验。"""
    big = MP4_HEAD + b"\x00" * (vs.MAX_VIDEO_BYTES + 1)
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=big))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="50MB"):
            await vs.download_video("https://cdn/v.mp4", http=client)


def test_download_video_rejects_http_non_loopback():
    """http 仅允许本机 loopback（SSRF 纵深防御，W7）。"""
    with pytest.raises(vs.VideoGenerationError, match="http 仅允许本机"):
        asyncio.run(vs.download_video("http://169.254.169.254/latest/meta-data/"))
    with pytest.raises(vs.VideoGenerationError, match="http 仅允许本机"):
        asyncio.run(vs.download_video("http://internal.example/v.mp4"))


@pytest.mark.asyncio
async def test_download_video_validated_redirect():
    """3xx 跳转：Location 经白名单校验后有限跟随（W-2），非法跳转拒绝。"""
    def handler(r):
        if r.url.path == "/redirect":
            return httpx.Response(302, headers={"location": "/final/v.mp4"})
        if r.url.path == "/final/v.mp4":
            return httpx.Response(200, content=MP4_HEAD)
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        data = await vs.download_video("https://cdn/redirect", http=client)
    assert data == MP4_HEAD

    def evil(r):
        if r.url.path == "/redirect":
            return httpx.Response(302, headers={"location": "http://169.254.169.254/meta"})
        return httpx.Response(200, content=MP4_HEAD)

    async with httpx.AsyncClient(transport=httpx.MockTransport(evil)) as client:
        with pytest.raises(vs.VideoGenerationError, match="http 仅允许本机"):
            await vs.download_video("https://cdn/redirect", http=client)


@pytest.mark.asyncio
async def test_extract_frames_failure_cleans_partial_media(monkeypatch):
    """抽帧失败：清理半成品视频与部分帧（W4），成功路径保留视频。"""
    out = _TMP / "frames_clean"
    out.mkdir(parents=True, exist_ok=True)
    calls = {"n": 0}

    async def fake_run(args, ffmpeg, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            pathlib.Path(args[-1]).write_bytes(PNG_HEAD)  # 第 1 帧成功
            return subprocess.CompletedProcess(args, 0, b"", b"")
        return subprocess.CompletedProcess(args, 1, b"", b"decode error")

    monkeypatch.setattr(vs, "_run_ffmpeg", fake_run)
    monkeypatch.setattr(vs, "_probe_duration", lambda p, f: 5.0)
    with pytest.raises(vs.VideoGenerationError, match="抽帧失败"):
        await vs.extract_frames(MP4_HEAD, str(out), 46, ffmpeg="fake-ffmpeg")
    assert not (out / "run_46_video.mp4").exists()  # 半成品视频已清理
    assert not list(out.glob("run_46_frame_*.png"))  # 部分帧已清理


@pytest.mark.asyncio
async def test_poll_retry_backoff_bounds(monkeypatch):
    """轮询连续 503：退避数组越界保护（W6），不抛 IndexError。"""
    transport = httpx.MockTransport(lambda r: httpx.Response(503, text="busy"))
    monkeypatch.setattr(vs, "POLL_BACKOFF", [0.0, 0.0])
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(vs.VideoGenerationError, match="503"):
            await vs.poll_video_status(CFG, "t", http=client, timeout=60, interval=0.01)


def test_agnes_status_terminal_unknown_fast_fail():
    """未知终态（error/canceled/expired）映射 failed 快速失败，其余未知按 processing。"""
    assert vs._agnes_status({"status": "error"})[0] == "failed"
    assert vs._agnes_status({"status": "canceled"})[0] == "failed"
    assert vs._agnes_status({"status": "expired"})[0] == "failed"
    assert vs._agnes_status({"status": "weird_unknown"})[0] == "processing"
    assert vs._agnes_status({"status": "completed", "metadata": {"url": "https://x/v.mp4"}})[0] == "completed"
