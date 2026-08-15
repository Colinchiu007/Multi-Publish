"""PromptEval 视频生成服务 — 运营后台服务端直连视频生成 provider（异步任务）+ 抽帧。

- provider：agnes-video（Agnes Video V2.0，OpenAI 兼容 /videos 异步任务契约，与桌面端
  agnes-video.js 对齐：POST /videos 提交返回 taskId；轮询走域名根 /agnesapi?video_id=...）
- 流程：提交 → 轮询状态（有界重试/429 退避/总超时）→ 下载 MP4（魔数/大小校验）→
  ffmpeg 抽帧（首/中/尾 3 帧 PNG）→ 产物落盘本地媒体目录
- ffmpeg 解析：环境变量 FFMPEG_BIN 优先，fallback imageio-ffmpeg 自带二进制
"""
from __future__ import annotations

import asyncio
import datetime
import os
import pathlib
import re
import subprocess
import urllib.parse

import httpx

try:
    import imageio_ffmpeg
except ImportError:  # 测试环境未安装时允许 FFMPEG_BIN 覆盖
    imageio_ffmpeg = None

from services.prompt_eval_contract import MAX_VIDEO_BYTES, VIDEO_FRAME_COUNT
DEFAULT_WIDTH = 1152
DEFAULT_HEIGHT = 768
DEFAULT_NUM_FRAMES = 121  # 8n+1 规则，121 = 8*15+1 ≈ 5s @24fps
DEFAULT_FRAME_RATE = 24

DEFAULT_POLL_INTERVAL = 15  # 秒
DEFAULT_POLL_TIMEOUT = 20 * 60  # 秒（Agnes 队列满载可持续 15+ 分钟）
DEFAULT_FFMPEG_TIMEOUT = 30  # 单次抽帧/探测超时（秒）

# 提交/轮询重试：瞬时错误（429/5xx/网络）有界重试 + 递增退避
MAX_SUBMIT_RETRIES = 3
SUBMIT_BACKOFF = [1.0, 2.0, 4.0]
MAX_POLL_RETRIES = 3
POLL_BACKOFF = [2.0, 4.0]


class VideoGenerationError(Exception):
    pass


def _mp4_magic(data: bytes) -> bool:
    """MP4 魔数：偏移 4-7 为 'ftyp'（ftyp box 位于文件头）。"""
    return len(data) >= 12 and data[4:8] == b"ftyp"


def validate_video_bytes(data: bytes) -> bool:
    return bool(data and 12 <= len(data) <= MAX_VIDEO_BYTES and _mp4_magic(data))


def is_retryable_status(status: int) -> bool:
    return status in (429, 500, 502, 503, 504)


def find_ffmpeg() -> str | None:
    """ffmpeg 解析：FFMPEG_BIN 环境变量优先，fallback imageio-ffmpeg。"""
    custom = os.environ.get("FFMPEG_BIN")
    if custom and os.path.isfile(custom):
        return custom
    if imageio_ffmpeg is not None:
        try:
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            if exe and os.path.isfile(exe):
                return exe
        except Exception:
            return None
    return None


def build_video_payload(model: str, prompt: str) -> dict:
    """归一化请求体（Agnes Video V2.0 OpenAI 兼容契约，镜像桌面端 agnes-video.js）。"""
    return {
        "model": model,
        "prompt": prompt,
        "width": DEFAULT_WIDTH,
        "height": DEFAULT_HEIGHT,
        "num_frames": DEFAULT_NUM_FRAMES,
        "frame_rate": DEFAULT_FRAME_RATE,
    }


async def _post_with_retry(client: httpx.AsyncClient, url: str, payload: dict, headers: dict) -> dict:
    """提交视频任务：429/5xx/网络错误有界重试 + 递增退避。"""
    last_error: Exception | None = None
    for attempt in range(MAX_SUBMIT_RETRIES + 1):
        try:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                if is_retryable_status(resp.status_code) and attempt < MAX_SUBMIT_RETRIES:
                    await asyncio.sleep(SUBMIT_BACKOFF[min(attempt, len(SUBMIT_BACKOFF) - 1)])
                    continue
                raise VideoGenerationError(f"视频提交返回 {resp.status_code}: {resp.text[:200]}")
            return resp.json()
        except httpx.HTTPError as e:
            last_error = e
            if attempt < MAX_SUBMIT_RETRIES:
                await asyncio.sleep(SUBMIT_BACKOFF[min(attempt, len(SUBMIT_BACKOFF) - 1)])
    raise VideoGenerationError(f"视频提交请求失败: {last_error}")


async def submit_video(cfg: dict, prompt: str, http: httpx.AsyncClient | None = None) -> str:
    """POST {base}/videos 提交视频生成任务，返回 task_id（兼容 id/task_id 字段）。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise VideoGenerationError("未配置视频生成服务 base_url")
    model = cfg.get("model") or "agnes-video-v2.0"
    api_key = cfg.get("api_key") or ""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=60)
    try:
        data = await _post_with_retry(client, f"{base_url}/videos", build_video_payload(model, prompt), headers)
        task_id = data.get("id") or data.get("task_id")
        if not task_id:
            raise VideoGenerationError("视频提交响应缺少 task id")
        return str(task_id)
    finally:
        if own_client:
            await client.aclose()


def _agnes_status(data: dict) -> tuple[str, str]:
    """Agnes 状态映射（镜像桌面端）：queued/in_progress→processing，completed/failed 直通。
    未知终态（error/canceled/expired 等）统一映射 failed，避免无意义轮询到总超时。"""
    status_map = {
        "queued": "processing", "in_progress": "processing",
        "completed": "completed", "failed": "failed",
        "error": "failed", "canceled": "failed", "cancelled": "failed", "expired": "failed",
    }
    status = status_map.get(str(data.get("status") or ""), "processing")
    video_url = ""
    if status == "completed":
        meta = data.get("metadata")
        video_url = str((meta or {}).get("url") or data.get("url") or "")
    return status, video_url


async def poll_video_status(cfg: dict, task_id: str, http: httpx.AsyncClient | None = None,
                            timeout: float | None = None, interval: float | None = None) -> dict:
    """轮询视频任务至终态，返回 {"status", "video_url"}。

    - 轮询端点：域名根 /agnesapi?video_id=<id>&model_name=<model>（与桌面端一致，base 之外）
    - 总超时（默认 20min）内未完成抛 VideoGenerationError；429/5xx 查询失败有界重试
    """
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise VideoGenerationError("未配置视频生成服务 base_url")
    api_root = re.sub(r"/v1/?$", "", base_url)
    model = cfg.get("model") or "agnes-video-v2.0"
    api_key = cfg.get("api_key") or ""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        poll_timeout = float(timeout if timeout is not None else float(os.environ.get("OPS_PROMPT_EVAL_VIDEO_POLL_TIMEOUT", DEFAULT_POLL_TIMEOUT)))
        poll_interval = float(interval if interval is not None else float(os.environ.get("OPS_PROMPT_EVAL_VIDEO_POLL_INTERVAL", DEFAULT_POLL_INTERVAL)))
    except (TypeError, ValueError) as e:
        raise VideoGenerationError(f"视频轮询参数非法: {e}") from e
    url = f"{api_root}/agnesapi?video_id={task_id}&model_name={model}"
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=30)
    deadline = datetime.datetime.now(datetime.timezone.utc).timestamp() + poll_timeout
    try:
        while True:
            data = None
            last_error: Exception | None = None
            for attempt in range(MAX_POLL_RETRIES + 1):
                if datetime.datetime.now(datetime.timezone.utc).timestamp() >= deadline:
                    raise VideoGenerationError(f"视频生成超时（>{int(poll_timeout)}s），请稍后重试")
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code >= 400:
                        if is_retryable_status(resp.status_code) and attempt < MAX_POLL_RETRIES:
                            await asyncio.sleep(POLL_BACKOFF[min(attempt, len(POLL_BACKOFF) - 1)])
                            continue
                        raise VideoGenerationError(f"视频状态查询返回 {resp.status_code}: {resp.text[:200]}")
                    data = resp.json()
                    break
                except httpx.HTTPError as e:
                    last_error = e
                    if attempt < MAX_POLL_RETRIES:
                        await asyncio.sleep(POLL_BACKOFF[min(attempt, len(POLL_BACKOFF) - 1)])
            if data is None:
                raise VideoGenerationError(f"视频状态查询失败: {last_error}")
            status, video_url = _agnes_status(data)
            if status == "failed":
                detail = (data.get("error") or data.get("message") or "未知原因")
                raise VideoGenerationError(f"视频生成失败: {detail}")
            if status == "completed":
                if not video_url:
                    raise VideoGenerationError("视频任务已完成但缺少下载地址")
                return {"status": "completed", "video_url": video_url}
            if datetime.datetime.now(datetime.timezone.utc).timestamp() >= deadline:
                raise VideoGenerationError(f"视频生成超时（>{int(poll_timeout)}s），请稍后重试")
            await asyncio.sleep(poll_interval)
    finally:
        if own_client:
            await client.aclose()


_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _validate_download_url(url: str) -> None:
    """下载 URL 白名单：仅 https；http 仅允许本机 loopback（纵深防御 SSRF）。"""
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError as e:
        raise VideoGenerationError(f"视频下载地址非法: {e}") from e
    if parsed.scheme not in ("http", "https"):
        raise VideoGenerationError("视频下载地址非法（仅允许 http/https）")
    if parsed.scheme == "http" and (parsed.hostname or "").lower() not in _LOOPBACK_HOSTS:
        raise VideoGenerationError("视频下载地址非法（http 仅允许本机调试）")


async def download_video(url: str, http: httpx.AsyncClient | None = None) -> bytes:
    """流式下载视频（边收边限 50MB）并校验 MP4 魔数；URL 白名单见 _validate_download_url。

    3xx 跳转：Location 经同一白名单校验后有限跟随（≤3 跳，兼容 CDN/预签名 URL），
    避免 follow_redirects=False 导致签名跳转下载失败。
    """
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0), follow_redirects=False)
    try:
        current = url
        for hop in range(4):
            _validate_download_url(current)
            async with client.stream("GET", current, follow_redirects=False) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        raise VideoGenerationError(f"下载视频失败: {resp.status_code} 无跳转地址")
                    current = str(httpx.URL(current).join(location))
                    continue
                if resp.status_code >= 400:
                    raise VideoGenerationError(f"下载视频失败: {resp.status_code}")
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > MAX_VIDEO_BYTES:
                        raise VideoGenerationError("视频文件超过 50MB 上限")
                if not validate_video_bytes(bytes(buf)):
                    raise VideoGenerationError("视频魔数/大小校验失败")
                return bytes(buf)
        raise VideoGenerationError("下载视频失败: 跳转次数过多")
    finally:
        if own_client:
            await client.aclose()


_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


def parse_duration(stderr_text: str) -> float | None:
    """从 ffmpeg -i stderr 解析 Duration: HH:MM:SS.xx，解析失败返回 None（调用方 fail closed）。"""
    m = _DURATION_RE.search(stderr_text or "")
    if not m:
        return None
    h, mi, s = m.group(1), m.group(2), m.group(3)
    return int(h) * 3600 + int(mi) * 60 + float(s)


async def _run_ffmpeg(args: list[str], ffmpeg: str, timeout: float = DEFAULT_FFMPEG_TIMEOUT) -> subprocess.CompletedProcess:
    """在线程池执行 ffmpeg（阻塞调用），超时抛 VideoGenerationError。"""
    try:
        return await asyncio.to_thread(
            lambda: subprocess.run(args, capture_output=True, timeout=timeout)
        )
    except subprocess.TimeoutExpired as e:
        raise VideoGenerationError(f"ffmpeg 执行超时: {' '.join(args[:4])}") from e


def _probe_duration(video_path: str, ffmpeg: str) -> float:
    """ffprobe 不可用时用 ffmpeg -i 探测时长；失败 fail closed。"""
    result = subprocess.run([ffmpeg, "-i", video_path], capture_output=True, timeout=DEFAULT_FFMPEG_TIMEOUT)
    duration = parse_duration(result.stderr.decode("utf-8", errors="replace"))
    if duration is None or duration <= 0:
        raise VideoGenerationError("无法解析视频时长")
    return duration


async def extract_frames(video_bytes: bytes, out_dir: str, run_id, ffmpeg: str | None = None,
                         http: httpx.AsyncClient | None = None) -> list[str]:
    """抽帧：写临时视频 → 探测时长 → ffmpeg -ss 抽 首/中/尾 3 帧 PNG，返回文件名单。

    帧时间：0 / duration/2 / max(0, duration-0.5)。任一帧失败即整次失败（fail closed）。
    """
    ffmpeg = ffmpeg or find_ffmpeg()
    if not ffmpeg:
        raise VideoGenerationError("ffmpeg 不可用（请安装 imageio-ffmpeg 或设置 FFMPEG_BIN）")
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    video_name = f"run_{run_id}_video.mp4"
    video_path = out / video_name
    video_path.write_bytes(video_bytes)
    success = False
    try:
        duration = await asyncio.to_thread(_probe_duration, str(video_path), ffmpeg)
        mid = duration / 2.0
        end = max(0.0, duration - 0.5)
        names: list[str] = []
        for i, t in enumerate((0.0, mid, end)):
            frame_name = f"run_{run_id}_frame_{i}.png"
            frame_path = out / frame_name
            result = await _run_ffmpeg(
                [ffmpeg, "-ss", f"{t:.3f}", "-i", str(video_path), "-frames:v", "1", "-q:v", "2", "-y", str(frame_path)],
                ffmpeg,
            )
            if result.returncode != 0:
                raise VideoGenerationError(f"抽帧失败（t={t:.3f}）: {result.stderr.decode('utf-8', errors='replace')[-200:]}")
            frame_data = frame_path.read_bytes()
            if not frame_data or frame_data[:8] != b"\x89PNG\r\n\x1a\n":
                raise VideoGenerationError(f"抽帧产物魔数校验失败（t={t:.3f}）")
            names.append(frame_name)
        success = True
        return names
    finally:
        # 抽帧完成后保留视频文件（供前端播放）；异常时清理半成品视频与部分帧
        if not success:
            video_path.unlink(missing_ok=True)
            for partial in out.glob(f"run_{run_id}_frame_*.png"):
                partial.unlink(missing_ok=True)


async def generate_video(cfg: dict, prompt: str, out_dir: str, run_id, http: httpx.AsyncClient | None = None,
                         now: datetime.datetime | None = None,
                         poll_timeout: float | None = None, poll_interval: float | None = None,
                         ffmpeg: str | None = None) -> dict:
    """完整视频生成链路：提交→轮询→下载→抽帧，返回 {"video": 文件名, "frames": [3 个帧名]}。

    任一步失败抛 VideoGenerationError（run_pipeline fail closed，不静默降级）。
    """
    own_client = http is None
    # 共享 client：120s 读写超时（覆盖 50MB 下载与慢速轮询），不跟随重定向（SSRF 纵深防御）
    client = http or httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0), follow_redirects=False)
    try:
        task_id = await submit_video(cfg, prompt, http=client)
        status = await poll_video_status(cfg, task_id, http=client, timeout=poll_timeout, interval=poll_interval)
        data = await download_video(status["video_url"], http=client)
        frames = await extract_frames(data, out_dir, run_id, ffmpeg=ffmpeg)
        return {"video": f"run_{run_id}_video.mp4", "frames": frames}
    finally:
        if own_client:
            await client.aclose()
