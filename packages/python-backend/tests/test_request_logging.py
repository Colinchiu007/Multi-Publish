"""结构化请求日志 + requestId 透传/回显测试（python-service-logging R2/R3）。"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from loguru import logger

import server


def _request_capture():
    stream = io.StringIO()
    sink_id = logger.add(
        stream,
        format="{message}",
        level="INFO",
        filter=lambda r: True,  # 名称由 InterceptHandler 深度解析，测试按消息前缀匹配
    )
    return stream, sink_id


def _structured_lines(stream: io.StringIO) -> list[str]:
    return [line for line in stream.getvalue().splitlines() if line.startswith("request method=")]


def test_structured_request_log_and_request_id_echo(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", False, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False, raising=False)
    stream, sink_id = _request_capture()
    try:
        resp = TestClient(server.app).get("/api/health", headers={"x-request-id": "py-req-001"})
        assert resp.status_code == 200
        assert resp.headers.get("x-request-id") == "py-req-001"
    finally:
        logger.remove(sink_id)
    lines = _structured_lines(stream)
    assert lines, "缺少结构化请求日志行"
    line = lines[0]
    assert "method=GET" in line
    assert "path=/api/health" in line
    assert "status=200" in line
    assert "duration_ms=" in line
    assert "request_id=py-req-001" in line


def test_missing_request_id_generates_and_echoes(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", False, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False, raising=False)
    stream, sink_id = _request_capture()
    try:
        resp = TestClient(server.app).get("/api/health")
    finally:
        logger.remove(sink_id)
    rid = resp.headers.get("x-request-id")
    assert rid, "响应应回显自生成 request_id"
    lines = _structured_lines(stream)
    assert lines, "缺少结构化请求日志行"
    assert f"request_id={rid}" in lines[0]


def test_invalid_header_falls_back_to_generated(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", False, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False, raising=False)
    stream, sink_id = _request_capture()
    try:
        resp = TestClient(server.app).get("/api/health", headers={"x-request-id": "bad id with space!"})
    finally:
        logger.remove(sink_id)
    rid = resp.headers.get("x-request-id")
    assert rid != "bad id with space!"
    lines = _structured_lines(stream)
    assert lines, "缺少结构化请求日志行"
    assert f"request_id={rid}" in lines[0]


def test_unhandled_500_echoes_request_id_and_logs_structured(monkeypatch):
    """未处理异常（500）也应回显 x-request-id 并输出结构化日志（R2/R3 覆盖错误路径）。"""
    import server as server_module

    monkeypatch.setattr(server_module, "IDENTITY_AUTH_ENABLED", False, raising=False)
    monkeypatch.setattr(server_module, "IDENTITY_AUTH_REQUIRED", False, raising=False)

    def _boom():
        raise RuntimeError("boom-unhandled")

    server_module.app.add_api_route("/api/_boom_unhandled", _boom, methods=["GET"])
    stream, sink_id = _request_capture()
    try:
        resp = TestClient(server_module.app, raise_server_exceptions=False).get(
            "/api/_boom_unhandled", headers={"x-request-id": "rid-boom-1"}
        )
    finally:
        logger.remove(sink_id)
    assert resp.status_code == 500
    assert resp.headers.get("x-request-id") == "rid-boom-1", "500 响应应回显 x-request-id"
    error_lines = [line for line in stream.getvalue().splitlines() if line.startswith("request failed ")]
    assert error_lines, "缺少异常路径结构化日志行"
    line = error_lines[0]
    assert "method=GET" in line
    assert "path=/api/_boom_unhandled" in line
    assert "status=500" in line
    assert "duration_ms=" in line
    assert "request_id=rid-boom-1" in line
    assert "error=RuntimeError: boom-unhandled" in line
