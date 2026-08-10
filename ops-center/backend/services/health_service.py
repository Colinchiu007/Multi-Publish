"""System health service — 云服务只读健康探针（业务 API / Logto / 存储 / 自定义目标）。

仅做 HTTP GET + 短超时探测，不修改任何服务状态；未配置的探针返回 skipped。
"""
import asyncio
import datetime
import json
import os
import tempfile

import httpx

from config import settings

TIMEOUT_MS = 5000


def _now() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


def _trim_slash(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _is_loopback(url: str) -> bool:
    try:
        host = url.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0].strip("[]").lower()
    except Exception:
        return False
    return host in ("localhost", "127.0.0.1", "::1")


def _validate_target(url: str) -> str | None:
    """http(s) 校验；非本机回环强制 https（与 production-smoke 一致）。"""
    text = _trim_slash(url)
    if not text:
        return None
    if not (text.startswith("http://") or text.startswith("https://")):
        return None
    if text.startswith("http://") and not _is_loopback(text):
        return None
    return text


async def _http_get(url: str, timeout: float = TIMEOUT_MS / 1000) -> tuple[int, dict | None, str]:
    """GET 并解析 JSON；返回 (ok, body, detail)。"""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            resp = await client.get(url)
            if resp.status_code >= 300:
                return 0, None, f"HTTP {resp.status_code}"
            try:
                body = resp.json()
            except Exception:
                body = None
            return 1, body, ""
    except httpx.TimeoutException:
        return 0, None, "超时"
    except Exception as e:
        return 0, None, str(e)[:120]


async def check_self() -> dict:
    return {"name": "ops-center 自身", "ok": True, "latency_ms": 0, "status": "ok", "detail": ""}


async def check_api() -> dict:
    base = _validate_target(settings.health_api_url)
    if not base:
        return {"name": "业务 API", "status": "skipped", "detail": "未配置 OPS_HEALTH_API_URL"}
    import time as _t
    started = _t.monotonic()
    results = []
    for path in ("/api/v1/health", "/api/v1/ready"):
        ok, body, detail = await _http_get(base + path)
        if not ok:
            return {"name": "业务 API", "ok": False, "latency_ms": int((_t.monotonic() - started) * 1000),
                    "status": "error", "detail": f"{path}: {detail}"}
        results.append(detail)
    return {"name": "业务 API", "ok": True, "latency_ms": int((_t.monotonic() - started) * 1000),
            "status": "ok", "detail": " / ".join(results) or "ok"}


async def check_logto() -> dict:
    base = _trim_slash(settings.health_logto_url)
    if not base:
        return {"name": "Logto", "status": "skipped", "detail": "未配置 OPS_HEALTH_LOGTO_URL"}
    if not _validate_target(base):
        return {"name": "Logto", "ok": False, "latency_ms": 0, "status": "error", "detail": "URL 非法（需 http(s)，非回环强制 https）"}
    discovery = base if base.endswith("/oidc") else base + "/oidc"
    import time as _t
    started = _t.monotonic()
    ok, body, detail = await _http_get(discovery + "/.well-known/openid-configuration")
    ms = int((_t.monotonic() - started) * 1000)
    if not ok:
        return {"name": "Logto", "ok": False, "latency_ms": ms, "status": "error", "detail": detail}
    if not (isinstance(body, dict) and body.get("issuer")):
        return {"name": "Logto", "ok": False, "latency_ms": ms, "status": "error", "detail": "discovery 缺 issuer"}
    return {"name": "Logto", "ok": True, "latency_ms": ms, "status": "ok", "detail": body.get("issuer", "")}


async def check_storage() -> dict:
    dirs = [settings.config_output_dir, os.path.dirname(settings.db_path) or "."]
    failed = []
    for d in dirs:
        if not d:
            continue
        try:
            os.makedirs(d, exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix=".health-", dir=d)
            with os.fdopen(fd, "w") as fh:
                fh.write("ok")
            os.remove(tmp)
        except Exception as e:
            failed.append(f"{d}: {e}")
    if failed:
        return {"name": "存储可写", "ok": False, "latency_ms": 0, "status": "error", "detail": "; ".join(failed)[:200]}
    return {"name": "存储可写", "ok": True, "latency_ms": 0, "status": "ok", "detail": ""}


def _parse_targets(raw: str) -> list[dict]:
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "")[:50]
        url = _validate_target(str(it.get("url") or ""))
        if name and url:
            out.append({"name": name, "url": url})
    return out


async def check_custom_target(item: dict) -> dict:
    import time as _t
    started = _t.monotonic()
    ok, _body, detail = await _http_get(item["url"])
    return {
        "name": item["name"], "ok": ok, "latency_ms": int((_t.monotonic() - started) * 1000),
        "status": "ok" if ok else "error", "detail": detail,
    }


async def run_health_checks() -> dict:
    probes = [check_self(), check_api(), check_logto(), check_storage()]
    probes += [check_custom_target(t) for t in _parse_targets(settings.health_targets)]
    results = await asyncio.gather(*probes, return_exceptions=True)
    checks = []
    for r in results:
        if isinstance(r, Exception):
            checks.append({"name": "未知", "ok": False, "latency_ms": 0, "status": "error", "detail": str(r)[:120]})
        else:
            checks.append(r)
    errors = [c for c in checks if c.get("status") == "error"]
    overall = "error" if errors else "ok"
    return {"overall": overall, "checks": checks, "generated_at": _now()}
