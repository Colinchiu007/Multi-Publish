"""Tests for multi_publish.video_creation.capture.screen_capture_selector.

覆盖 ScreenCaptureSelector 全部公开方法 + execute() 三种 operation 分支。

测试策略
--------
- 直接 mock ``ScreenCaptureSelector._providers`` 返回伪造的 ffmpeg/cap
  BaseTool 实例，避免触碰 ToolRegistry（registry 的
  ``ensure_discovered`` / ``get_by_capability`` 方法在当前代码中并不存在，
  属于另一个独立 bug，不在 Phase 5.7 范围内）。
- 验证 metadata（name/version/tier/capability/runtime 等）。
- 验证 ``execute`` 的 operation 分发：recommend / record / pick_latest /
  unknown。
- 验证 ``_recommend`` 在不同 provider 可用性下的推荐结果。
- 验证 ``_record`` 在 preferred=cap/ffmpeg/auto 三种偏好下的路由。
- 验证 ``_pick_latest`` 优先尝试 Cap、Cap 无录制时返回失败。
- 验证 ``get_status`` 当任一 provider 可用时返回 AVAILABLE。
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.capture.screen_capture_selector import (
    ScreenCaptureSelector,
)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _make_selector() -> ScreenCaptureSelector:
    return ScreenCaptureSelector()


def _make_mock_tool(
    provider: str,
    name: str,
    status: ToolStatus = ToolStatus.AVAILABLE,
) -> MagicMock:
    """Build a mock BaseTool-like object for the providers dict."""
    tool = MagicMock(spec=BaseTool)
    tool.provider = provider
    tool.name = name
    tool.get_status.return_value = status
    tool.execute.return_value = ToolResult(success=True, data={})
    return tool


def _make_ffmpeg_tool(status: ToolStatus = ToolStatus.AVAILABLE) -> MagicMock:
    return _make_mock_tool("ffmpeg", "screen_recorder", status)


def _make_cap_tool(
    installed: bool = False,
    running: bool = False,
    recordings: list[dict] | None = None,
) -> MagicMock:
    """Cap tool mock — ``execute`` 返回值随 operation 切换。"""
    tool = _make_mock_tool("cap", "cap_recorder", ToolStatus.AVAILABLE if installed else ToolStatus.UNAVAILABLE)

    def _execute(inputs):
        op = inputs.get("operation")
        if op == "detect":
            return ToolResult(success=True, data={"installed": installed, "running": running})
        if op == "pick_latest":
            return ToolResult(success=True, data={"output_path": "/tmp/cap_latest.mp4"})
        if op == "find_recordings":
            recs = recordings or []
            return ToolResult(success=bool(recs), data={"recordings": recs})
        return ToolResult(success=True, data={})

    tool.execute.side_effect = _execute
    return tool


# ──────────────────────────────────────────────
# Metadata
# ──────────────────────────────────────────────


class TestMetadata:
    def test_name_and_version(self):
        sel = _make_selector()
        assert sel.name == "screen_capture_selector"
        assert sel.version == "0.1.0"

    def test_tier_is_source(self):
        assert _make_selector().tier == ToolTier.SOURCE

    def test_capability(self):
        assert _make_selector().capability == "screen_capture"

    def test_provider_is_selector(self):
        assert _make_selector().provider == "selector"

    def test_stability_is_beta(self):
        assert _make_selector().stability == ToolStability.BETA

    def test_execution_mode_is_sync(self):
        assert _make_selector().execution_mode == ExecutionMode.SYNC

    def test_determinism_is_deterministic(self):
        assert _make_selector().determinism == Determinism.DETERMINISTIC

    def test_runtime_is_hybrid(self):
        assert _make_selector().runtime == ToolRuntime.HYBRID

    def test_agent_skills(self):
        assert _make_selector().agent_skills == ["screen-demo"]

    def test_capabilities_list(self):
        caps = _make_selector().capabilities
        assert "screen_recording" in caps
        assert "provider_selection" in caps
        assert "cap_setup_guidance" in caps

    def test_best_for_not_empty(self):
        sel = _make_selector()
        assert isinstance(sel.best_for, list) and len(sel.best_for) >= 1
        assert isinstance(sel.not_good_for, list) and len(sel.not_good_for) >= 1

    def test_resource_profile_low_footprint(self):
        rp = _make_selector().resource_profile
        assert isinstance(rp, ResourceProfile)
        assert rp.cpu_cores == 1
        assert rp.ram_mb == 64
        assert rp.vram_mb == 0
        assert rp.network_required is False

    def test_no_side_effects(self):
        assert _make_selector().side_effects == []

    def test_input_schema_required_operation(self):
        schema = _make_selector().input_schema
        assert schema["required"] == ["operation"]
        assert "operation" in schema["properties"]
        assert set(schema["properties"]["operation"]["enum"]) == {"recommend", "record", "pick_latest"}

    def test_output_schema(self):
        schema = _make_selector().output_schema
        assert "recommended_provider" in schema["properties"]
        assert "options" in schema["properties"]

    def test_inherits_base_tool(self):
        assert issubclass(ScreenCaptureSelector, BaseTool)


# ──────────────────────────────────────────────
# fallback_tools / get_status
# ──────────────────────────────────────────────


class TestFallbackToolsAndStatus:
    def test_fallback_tools_lists_provider_keys(self):
        sel = _make_selector()
        with patch.object(sel, "_providers", return_value={"ffmpeg": MagicMock(), "cap": MagicMock()}):
            tools = sel.fallback_tools
        assert set(tools) == {"ffmpeg", "cap"}

    def test_get_status_available_when_any_provider_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=False)  # unavailable
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            assert sel.get_status() == ToolStatus.AVAILABLE

    def test_get_status_unavailable_when_no_provider_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            assert sel.get_status() == ToolStatus.UNAVAILABLE

    def test_get_status_unavailable_when_no_providers(self):
        sel = _make_selector()
        with patch.object(sel, "_providers", return_value={}):
            assert sel.get_status() == ToolStatus.UNAVAILABLE


# ──────────────────────────────────────────────
# execute (dispatch)
# ──────────────────────────────────────────────


class TestExecuteDispatch:
    def test_unknown_operation_returns_failure(self):
        sel = _make_selector()
        result = sel.execute({"operation": "bogus"})
        assert result.success is False
        assert "Unknown operation" in (result.error or "")
        assert "recommend" in (result.error or "")

    def test_recommend_dispatches(self):
        sel = _make_selector()
        with patch.object(sel, "_recommend", return_value=ToolResult(success=True, data={"r": 1})) as r:
            result = sel.execute({"operation": "recommend"})
        r.assert_called_once()
        assert result.success is True
        assert result.data == {"r": 1}

    def test_record_dispatches(self):
        sel = _make_selector()
        with patch.object(sel, "_record", return_value=ToolResult(success=True, data={"r": 2})) as r:
            result = sel.execute({"operation": "record"})
        r.assert_called_once()
        assert result.success is True

    def test_pick_latest_dispatches(self):
        sel = _make_selector()
        with patch.object(sel, "_pick_latest", return_value=ToolResult(success=True, data={"r": 3})) as r:
            result = sel.execute({"operation": "pick_latest"})
        r.assert_called_once()
        assert result.success is True


# ──────────────────────────────────────────────
# _recommend
# ──────────────────────────────────────────────


class TestRecommend:
    def test_auto_prefers_cap_when_running(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=True, running=True)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "auto"})
        assert result.success is True
        assert result.data["recommended_provider"] == "cap"

    def test_auto_falls_back_to_ffmpeg_when_cap_not_running(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=True, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "auto"})
        assert result.data["recommended_provider"] == "ffmpeg"

    def test_auto_falls_back_to_cap_when_ffmpeg_unavailable(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=True, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "auto"})
        assert result.data["recommended_provider"] == "cap"

    def test_auto_defaults_to_ffmpeg_when_nothing_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=False, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "auto"})
        assert result.data["recommended_provider"] == "ffmpeg"

    def test_preferred_cap_overrides_auto(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=False, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "cap"})
        assert result.data["recommended_provider"] == "cap"

    def test_preferred_ffmpeg_overrides_auto(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=True, running=True)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({"preferred_provider": "ffmpeg"})
        assert result.data["recommended_provider"] == "ffmpeg"

    def test_options_include_both_providers(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=True, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._recommend({})
        providers = {o["provider"] for o in result.data["options"]}
        assert providers == {"ffmpeg", "cap"}

    def test_ffmpeg_option_marked_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg}):
            result = sel._recommend({})
        ffmpeg_option = next(o for o in result.data["options"] if o["provider"] == "ffmpeg")
        assert ffmpeg_option["available"] is True
        assert ffmpeg_option["setup_required"] is False

    def test_cap_option_running_status(self):
        sel = _make_selector()
        cap = _make_cap_tool(installed=True, running=True)
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            result = sel._recommend({})
        cap_option = next(o for o in result.data["options"] if o["provider"] == "cap")
        assert cap_option["running"] is True
        assert cap_option["status"] == "Running"
        assert cap_option["available"] is True

    def test_cap_option_not_installed_status(self):
        sel = _make_selector()
        cap = _make_cap_tool(installed=False, running=False)
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            result = sel._recommend({})
        cap_option = next(o for o in result.data["options"] if o["provider"] == "cap")
        assert cap_option["running"] is False
        assert cap_option["status"] == "Not installed"
        assert cap_option["available"] is False
        assert cap_option["setup_required"] is True
        assert cap_option["setup_time"] == "~2 minutes"

    def test_recommendation_message_includes_recommended(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg}):
            result = sel._recommend({})
        msg = result.data["message"]
        assert "Recommended:" in msg
        assert "ffmpeg" in msg


# ──────────────────────────────────────────────
# _record
# ──────────────────────────────────────────────


class TestRecord:
    def test_preferred_cap_routes_to_cap_pick_latest(self):
        sel = _make_selector()
        cap = _make_cap_tool(installed=True, running=True)
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            result = sel._record({"preferred_provider": "cap", "output_path": "/tmp/out"})
        cap.execute.assert_called_once()
        # 验证调用参数为 pick_latest operation
        call_args = cap.execute.call_args.args[0]
        assert call_args["operation"] == "pick_latest"
        assert result.success is True

    def test_preferred_cap_missing_returns_failure(self):
        sel = _make_selector()
        with patch.object(sel, "_providers", return_value={}):
            result = sel._record({"preferred_provider": "cap"})
        assert result.success is False
        assert "Cap provider not found" in (result.error or "")

    def test_preferred_ffmpeg_routes_to_ffmpeg(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        ffmpeg.execute.return_value = ToolResult(success=True, data={"output_path": "/tmp/r.mp4"})
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg}):
            result = sel._record({"preferred_provider": "ffmpeg", "output_path": "/tmp/r.mp4"})
        ffmpeg.execute.assert_called_once()
        call_args = ffmpeg.execute.call_args.args[0]
        assert call_args["output_path"] == "/tmp/r.mp4"
        assert call_args["duration_seconds"] == 60  # 默认值
        assert call_args["fps"] == 30
        assert call_args["capture_audio"] is True
        assert result.success is True

    def test_auto_prefers_ffmpeg_when_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.AVAILABLE)
        cap = _make_cap_tool(installed=True, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._record({"preferred_provider": "auto", "output_path": "/x"})
        ffmpeg.execute.assert_called_once()
        cap.execute.assert_not_called()
        assert result.success is True

    def test_auto_falls_back_to_cap_when_ffmpeg_unavailable_and_cap_running(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=True, running=True)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._record({"preferred_provider": "auto", "output_path": "/x"})
        # cap.execute 应被调用：第一次 detect，第二次 pick_latest
        assert cap.execute.call_count >= 1
        assert result.success is True

    def test_auto_returns_failure_when_no_provider_available(self):
        sel = _make_selector()
        ffmpeg = _make_ffmpeg_tool(ToolStatus.UNAVAILABLE)
        cap = _make_cap_tool(installed=False, running=False)
        with patch.object(sel, "_providers", return_value={"ffmpeg": ffmpeg, "cap": cap}):
            result = sel._record({"preferred_provider": "auto"})
        assert result.success is False
        assert "No screen capture provider available" in (result.error or "")

    def test_unknown_provider_returns_failure(self):
        sel = _make_selector()
        with patch.object(sel, "_providers", return_value={}):
            result = sel._record({"preferred_provider": "obs"})
        assert result.success is False
        assert "Unknown provider" in (result.error or "")


# ──────────────────────────────────────────────
# _pick_latest
# ──────────────────────────────────────────────


class TestPickLatest:
    def test_returns_latest_from_cap_when_recordings_exist(self):
        sel = _make_selector()
        recordings = [
            {"path": "/tmp/r1.mp4", "size_mb": 12.3, "captured_at": "2026-07-09T10:00:00"},
        ]
        cap = _make_cap_tool(installed=True, running=True, recordings=recordings)
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            result = sel._pick_latest({"since_minutes": 5})
        assert result.success is True
        assert result.data["output_path"] == "/tmp/r1.mp4"
        assert result.data["capture_method"] == "cap"
        assert result.data["source"] == "cap_recordings_dir"
        assert "/tmp/r1.mp4" in result.artifacts

    def test_returns_failure_when_no_recordings(self):
        sel = _make_selector()
        cap = _make_cap_tool(installed=True, running=True, recordings=[])
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            result = sel._pick_latest({"since_minutes": 5})
        assert result.success is False
        assert "No recent recordings" in (result.error or "")

    def test_returns_failure_when_no_cap_provider(self):
        sel = _make_selector()
        with patch.object(sel, "_providers", return_value={}):
            result = sel._pick_latest({"since_minutes": 5})
        assert result.success is False
        assert "No recent recordings" in (result.error or "")

    def test_default_since_minutes_is_5(self):
        """When since_minutes not provided, default 5 should be forwarded to cap."""
        sel = _make_selector()
        cap = _make_cap_tool(installed=True, running=True, recordings=[{"path": "/x", "size_mb": 1}])
        with patch.object(sel, "_providers", return_value={"cap": cap}):
            sel._pick_latest({})
        # 验证 find_recordings 调用参数
        find_call = next(
            c for c in cap.execute.call_args_list if c.args[0].get("operation") == "find_recordings"
        )
        assert find_call.args[0]["since_minutes"] == 5


# ──────────────────────────────────────────────
# _build_recommendation_message
# ──────────────────────────────────────────────


class TestBuildRecommendationMessage:
    def test_includes_ffmpeg_option_when_present(self):
        sel = _make_selector()
        options = [
            {"provider": "ffmpeg", "available": True},
        ]
        msg = sel._build_recommendation_message("ffmpeg", options)
        assert "FFmpeg" in msg
        assert "**Recommended:** ffmpeg" in msg

    def test_includes_cap_option_with_setup_hint_when_not_available(self):
        sel = _make_selector()
        options = [
            {"provider": "cap", "available": False, "status": "Not installed"},
        ]
        msg = sel._build_recommendation_message("cap", options)
        assert "Cap" in msg
        assert "Setup takes" in msg  # setup hint

    def test_skips_setup_hint_when_cap_available(self):
        sel = _make_selector()
        options = [
            {"provider": "cap", "available": True, "status": "Running"},
        ]
        msg = sel._build_recommendation_message("cap", options)
        assert "Setup takes" not in msg

    def test_handles_empty_options(self):
        sel = _make_selector()
        msg = sel._build_recommendation_message("ffmpeg", [])
        assert "**Recommended:** ffmpeg" in msg
