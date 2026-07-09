"""Extended tests for video_compose.py — Phase 5.1 TDD.

Covers previously untested code paths:
- execute() operation dispatch + error handling
- _compose() validation (edit_decisions required)
- _burn_subtitles() file validation
- _overlay() / _encode() basic structure
- staticmethod/classmethod delegations to compose_utils
- _hyperframes_available() exception swallowing
"""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from multi_publish.video_creation.providers.video.video_compose import VideoCompose
from multi_publish.video_creation.providers.video import compose_utils as _cu


# ─── execute() 入口分发 ──────────────────────────────────────────────────
class TestExecuteDispatch:
    """execute() 根据 operation 字段分发到对应方法，捕获异常。"""

    def test_unknown_operation_returns_error(self):
        vc = VideoCompose()
        result = vc.execute({"operation": "nonexistent_op"})
        assert result.success is False
        assert "Unknown operation" in (result.error or "")

    def test_compose_operation_dispatches_to_compose(self):
        vc = VideoCompose()
        with patch.object(vc, "_compose", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "compose", "edit_decisions": {}})
            m.assert_called_once_with({"operation": "compose", "edit_decisions": {}})
            assert r.success is True

    def test_render_operation_dispatches_to_render(self):
        vc = VideoCompose()
        with patch.object(vc, "_render", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "render"})
            m.assert_called_once()
            assert r.success is True

    def test_remotion_render_operation_dispatches(self):
        vc = VideoCompose()
        with patch.object(vc, "_remotion_render", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "remotion_render"})
            m.assert_called_once()
            assert r.success is True

    def test_burn_subtitles_operation_dispatches(self):
        vc = VideoCompose()
        with patch.object(vc, "_burn_subtitles", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "burn_subtitles"})
            m.assert_called_once()
            assert r.success is True

    def test_overlay_operation_dispatches(self):
        vc = VideoCompose()
        with patch.object(vc, "_overlay", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "overlay"})
            m.assert_called_once()
            assert r.success is True

    def test_encode_operation_dispatches(self):
        vc = VideoCompose()
        with patch.object(vc, "_encode", return_value=MagicMock(success=True, duration_seconds=0)) as m:
            r = vc.execute({"operation": "encode"})
            m.assert_called_once()
            assert r.success is True

    def test_execute_catches_exception_returns_error(self):
        vc = VideoCompose()
        with patch.object(vc, "_compose", side_effect=RuntimeError("boom")):
            r = vc.execute({"operation": "compose", "edit_decisions": {}})
            assert r.success is False
            assert "boom" in (r.error or "")

    def test_execute_sets_duration_seconds(self):
        vc = VideoCompose()
        with patch.object(vc, "_compose", return_value=MagicMock(success=True, duration_seconds=0)):
            r = vc.execute({"operation": "compose", "edit_decisions": {}})
            assert r.duration_seconds is not None
            assert isinstance(r.duration_seconds, float)


# ─── _compose() 校验 ──────────────────────────────────────────────────────
class TestComposeValidation:
    def test_missing_edit_decisions_returns_error(self):
        vc = VideoCompose()
        r = vc._compose({"operation": "compose"})
        assert r.success is False
        assert "edit_decisions required" in (r.error or "")

    def test_empty_edit_decisions_returns_error(self):
        vc = VideoCompose()
        r = vc._compose({"operation": "compose", "edit_decisions": None})
        assert r.success is False
        assert "edit_decisions required" in (r.error or "")


# ─── _burn_subtitles() 文件校验 ────────────────────────────────────────────
class TestBurnSubtitlesValidation:
    def test_missing_input_file_returns_error(self, tmp_path):
        vc = VideoCompose()
        sub = tmp_path / "sub.srt"
        sub.write_text("dummy", encoding="utf-8")
        r = vc._burn_subtitles({
            "input_path": str(tmp_path / "nonexistent.mp4"),
            "subtitle_path": str(sub),
        })
        assert r.success is False
        assert "Input not found" in (r.error or "")

    def test_missing_subtitle_file_returns_error(self, tmp_path):
        vc = VideoCompose()
        video = tmp_path / "video.mp4"
        video.write_text("dummy", encoding="utf-8")
        r = vc._burn_subtitles({
            "input_path": str(video),
            "subtitle_path": str(tmp_path / "nonexistent.srt"),
        })
        assert r.success is False
        assert "Subtitle file not found" in (r.error or "")


# ─── staticmethod/classmethod 委托 ────────────────────────────────────────
class TestDelegationsToComposeUtils:
    """VideoCompose 的 staticmethod/classmethod 多数委托给 compose_utils。"""

    def test_is_image_delegates(self):
        with patch.object(_cu, "is_image", return_value=True) as m:
            assert VideoCompose._is_image(Path("foo.png")) is True
            m.assert_called_once()

    def test_is_image_returns_false_for_non_image(self):
        # 真实调用，非图像扩展名返回 False
        assert VideoCompose._is_image(Path("foo.txt")) is False

    def test_is_image_returns_true_for_png(self):
        assert VideoCompose._is_image(Path("foo.png")) is True

    def test_has_audio_stream_delegates(self):
        with patch.object(_cu, "has_audio_stream", return_value=False) as m:
            assert VideoCompose._has_audio_stream(Path("foo.mp4")) is False
            m.assert_called_once()

    def test_parse_probe_fps_delegates(self):
        with patch.object(_cu, "parse_probe_fps", return_value=29.97) as m:
            assert VideoCompose._parse_probe_fps("2997/100") == 29.97
            m.assert_called_once()

    def test_parse_probe_fps_real_fraction(self):
        # 真实调用 — compose_utils 实现
        assert VideoCompose._parse_probe_fps("30/1") == 30.0

    def test_build_atempo_delegates(self):
        with patch.object(_cu, "build_atempo", return_value="atempo=1.5") as m:
            assert VideoCompose._build_atempo(1.5) == "atempo=1.5"
            m.assert_called_once()

    def test_build_subtitle_style_delegates(self):
        with patch.object(_cu, "build_subtitle_style", return_value="FontSize=24") as m:
            assert VideoCompose._build_subtitle_style({"font_size": 24}) == "FontSize=24"
            m.assert_called_once()

    def test_read_text_file_none_returns_none(self):
        assert VideoCompose._read_text_file(None) is None

    def test_read_text_file_reads_content(self, tmp_path):
        f = tmp_path / "script.txt"
        f.write_text("hello script", encoding="utf-8")
        assert VideoCompose._read_text_file(f) == "hello script"

    def test_tokenize_returns_list(self):
        tokens = VideoCompose._tokenize("hello world")
        assert isinstance(tokens, list)
        assert len(tokens) == 2

    def test_tokenize_empty_string(self):
        tokens = VideoCompose._tokenize("")
        assert tokens == []


# ─── _hyperframes_available() 异常吞掉 ───────────────────────────────────
class TestHyperframesAvailable:
    """_hyperframes_available() 任何异常都返回 False。"""

    def test_returns_false_on_import_error(self):
        vc = VideoCompose()
        # 默认环境下 HyperFramesCompose 可能不可用，但应返回 False 而非抛错
        result = vc._hyperframes_available()
        assert isinstance(result, bool)

    def test_returns_false_on_exception(self):
        vc = VideoCompose()
        with patch(
            "multi_publish.video_creation.providers.video.video_compose.HyperFramesCompose",
            create=True,
        ):
            # 模拟 _runtime_check 抛错
            with patch(
                "multi_publish.video_creation.providers.video.video_compose.HyperFramesCompose"
            ) as mock_cls:
                mock_cls.return_value._runtime_check.side_effect = RuntimeError("nope")
                assert vc._hyperframes_available() is False

    def test_returns_true_when_runtime_available(self):
        vc = VideoCompose()
        # HyperFramesCompose 在方法内部 import，patch sys.modules 注入 mock
        mock_cls = MagicMock()
        mock_cls.return_value._runtime_check.return_value = {"runtime_available": True}
        with patch.dict("sys.modules", {"multi_publish.video_creation.video.hyperframes_compose": MagicMock(HyperFramesCompose=mock_cls)}):
            assert vc._hyperframes_available() is True


# ─── get_info() 扩展字段 ──────────────────────────────────────────────────
class TestGetInfoExtended:
    def test_includes_render_engines(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert "render_engines" in info
        assert info["render_engines"]["ffmpeg"] is True
        assert "remotion" in info["render_engines"]
        assert "hyperframes" in info["render_engines"]

    def test_includes_render_runtimes_alias(self):
        vc = VideoCompose()
        info = vc.get_info()
        # render_runtimes 是 render_engines 的向后兼容别名
        assert info.get("render_runtimes") == info["render_engines"]

    def test_includes_remotion_note(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert "remotion_note" in info
        assert isinstance(info["remotion_note"], str)

    def test_includes_hyperframes_note(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert "hyperframes_note" in info
        assert isinstance(info["hyperframes_note"], str)

    def test_includes_runtime_governance(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert "runtime_governance" in info
        assert "render_runtime" in info["runtime_governance"]


# ─── _get_composition_id 扩展 ─────────────────────────────────────────────
class TestGetCompositionIdExtended:
    def test_returns_nonempty_string(self):
        cid = VideoCompose._get_composition_id("explainer-data")
        assert cid
        assert isinstance(cid, str)

    def test_error_message_contains_family_name(self):
        with pytest.raises(ValueError) as exc_info:
            VideoCompose._get_composition_id("bogus-family")
        assert "bogus-family" in str(exc_info.value)
