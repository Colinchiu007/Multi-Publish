"""System health service — 云服务只读健康探针（DB / 业务 API / Logto / 存储 / 自定义目标）。

仅做探测，不修改服务状态（存储探针只测已有目录可写，try/finally 保证临时文件清理）。
未配置的探针返回 skipped；配置非法返回 error（与未配置区分）。
"""
import asyncio
import datetime
import ipaddress
import json
import os
import tempfile
import time
import urllib.parse

import httpx
from sqlalchemy import text

from config import settings

TIMEOUT_MS = 5000
MAX_CONCURRENCY = 10


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z"


def _trim_slash(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _is_loopback(url: str) -> bool:
    try:
        host = urllib.parse.urlsplit(url).hostname
        if host is None:
            return False
        host = host.rstrip(".").lower()
        if host in ("localhost", "localhost."):
            return True
        ip = ipaddress.ip_address(host)
        return ip.is_loopback
    except ValueError:
        return False


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


async def _http_get(url: str, timeout: float = TIMEOUT_MS / 1000) -> tuple[int, int | None, dict | None, str]:
    """GET 并解析 JSON；返回 (ok, status_code, body, detail)。3xx 不跟随重定向 → 视为 degraded。"""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            resp = await client.get(url)
            try:
                body = resp.json()
            except Exception:
                body = None
            if 300 <= resp.status_code < 400:
                location = resp.headers.get("location", "")
                return 0, resp.status_code, body, f"HTTP {resp.status_code} 重定向 → {location}"
            if resp.status_code >= 400:
                return 0, resp.status_code, body, f"HTTP {resp.status_code}"
            return 1, resp.status_code, body, ""
    except httpx.TimeoutException:
        return 0, None, None, "超时"
    except Exception as e:
        return 0, None, None, str(e)[:120]


def _result(name: str, ok: bool, latency_ms: int, detail: str, status: str | None = None) -> dict:
    return {"name": name, "ok": ok, "latency_ms": latency_ms, "status": status or ("ok" if ok else "error"), "detail": detail[:200]}


async def check_db(db) -> dict:
    """真实 DB 存活探针（SELECT 1），避免 DB 故障时误报全绿。"""
    started = time.monotonic()
    try:
        await db.execute(text("SELECT 1"))
        return _result("数据库", True, int((time.monotonic() - started) * 1000), "SELECT 1 ok")
    except Exception as e:
        return _result("数据库", False, int((time.monotonic() - started) * 1000), str(e)[:120])


async def check_self() -> dict:
    return _result("ops-center 自身", True, 0, "")


async def check_api() -> dict:
    configured = _trim_slash(settings.health_api_url)
    if not configured:
        return {"name": "业务 API", "status": "skipped", "detail": "未配置 OPS_HEALTH_API_URL"}
    base = _validate_target(configured)
    if not base:
        return {"name": "业务 API", "ok": False, "latency_ms": 0, "status": "error", "detail": "URL 非法（需 http(s)，非回环强制 https）"}
    started = time.monotonic()
    details = []
    for path in ("/api/v1/health", "/api/v1/ready"):
        ok, code, body, detail = await _http_get(base + path)
        if not ok:
            return _result("业务 API", False, int((time.monotonic() - started) * 1000), f"{path}: {detail}")
        # 2xx 但 payload 自报非 ok → 判为异常（避免假健康）
        payload_ok = (isinstance(body, dict) and body.get("status") in ("ok", "ready", "up", True)) or (isinstance(body, dict) and body.get("ok") in (True, 1))
        details.append(f"{path}=HTTP {code}" + ("" if payload_ok else " (payload 非 ok)"))
        if not payload_ok:
            return _result("业务 API", False, int((time.monotonic() - started) * 1000), f"{path} payload 非 ok")
    return _result("业务 API", True, int((time.monotonic() - started) * 1000), " / ".join(details))


async def check_logto() -> dict:
    configured = _trim_slash(settings.health_logto_url)
    if not configured:
        return {"name": "Logto", "status": "skipped", "detail": "未配置 OPS_HEALTH_LOGTO_URL"}
    base = _validate_target(configured)
    if not base:
        return {"name": "Logto", "ok": False, "latency_ms": 0, "status": "error", "detail": "URL 非法（需 http(s)，非回环强制 https）"}
    discovery = base if base.endswith("/oidc") else base + "/oidc"
    started = time.monotonic()
    ok, code, body, detail = await _http_get(discovery + "/.well-known/openid-configuration")
    ms = int((time.monotonic() - started) * 1000)
    if not ok:
        return _result("Logto", False, ms, detail)
    if not (isinstance(body, dict) and body.get("issuer")):
        return _result("Logto", False, ms, "discovery 缺 issuer")
    return _result("Logto", True, ms, str(body.get("issuer", "")))


async def check_storage() -> dict:
    """只测已有目录可写；不创建新目录（保持只读语义）；try/finally 清理临时文件。"""
    dirs = [settings.config_output_dir, os.path.dirname(settings.db_path) or "."]
    failed = []
    for d in dirs:
        if not d or not os.path.isdir(d):
            continue  # 目录不存在不判失败（可能尚未初始化）
        fd = tmp = None
        try:
            fd, tmp = tempfile.mkstemp(prefix=".health-", dir=d)
            with os.fdopen(fd, "w") as fh:
                fh.write("ok")
                fd = None
        except Exception as e:
            failed.append(f"{d}: {e}")
        finally:
            if fd is not None:
                try:
                    os.close(fd)
                except Exception:
                    pass
            if tmp:
                try:
                    os.remove(tmp)
                except Exception:
                    pass
    if failed:
        return _result("存储可写", False, 0, "; ".join(failed))
    return _result("存储可写", True, 0, "")


def _parse_targets(raw: str) -> list[dict]:
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []
    out = []
    seen = set()
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "").strip()[:50]
        url = _validate_target(str(it.get("url") or "").strip())
        if name and url and name not in seen:
            seen.add(name)
            out.append({"name": name, "url": url})
    return out


async def check_custom_target(item: dict) -> dict:
    started = time.monotonic()
    ok, code, _body, detail = await _http_get(item["url"])
    return _result(item["name"], ok, int((time.monotonic() - started) * 1000), detail or f"HTTP {code}")


async def run_health_checks(db) -> dict:
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _bounded(fn, *args):
        async with sem:
            return await fn(*args)

    probes = [_bounded(check_db, db), _bounded(check_self), _bounded(check_api), _bounded(check_logto), _bounded(check_storage)]
    probes += [_bounded(check_custom_target, t) for t in _parse_targets(settings.health_targets)]
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
