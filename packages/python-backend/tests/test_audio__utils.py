"""Tests for audio/_utils.py -- ffprobe, GCP auth utilities."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from multi_publish.video_creation.providers.audio._utils import (
    get_access_token,
    probe_duration,
    resolve_project_id,
    service_account_configured,
)


class TestProbeDuration:
    """probe_duration() -- ffprobe audio duration extraction."""

    def test_file_not_exists(self):
        assert probe_duration(Path("/nonexistent/audio.mp3")) is None

    def test_ffprobe_returns_value(self, tmp_path):
        audio = tmp_path / "test.mp3"
        audio.write_text("fake audio")

        with patch("multi_publish.video_creation.providers.audio._utils.subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.stdout = "123.45\n"
            mock_proc.returncode = 0
            mock_run.return_value = mock_proc

            result = probe_duration(audio)
            assert result == 123.45

    def test_ffprobe_empty_stdout(self, tmp_path):
        audio = tmp_path / "test.mp3"
        audio.write_text("fake audio")

        with patch("multi_publish.video_creation.providers.audio._utils.subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.stdout = ""
            mock_proc.returncode = 0
            mock_run.return_value = mock_proc

            assert probe_duration(audio) is None

    def test_ffprobe_error_returns_none(self, tmp_path):
        audio = tmp_path / "test.mp3"
        audio.write_text("fake audio")

        with patch("multi_publish.video_creation.providers.audio._utils.subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="ffprobe", timeout=30)

            assert probe_duration(audio) is None


class TestServiceAccountConfigured:
    """service_account_configured() -- GCP credential detection."""

    def test_no_env_var(self):
        with patch.dict("os.environ", {}, clear=True):
            assert service_account_configured() is False

    def test_env_var_set_not_exists(self):
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": "/tmp/fake.json"}, clear=True):
            assert service_account_configured() is False

    def test_env_var_set_exists(self, tmp_path):
        creds_file = tmp_path / "creds.json"
        creds_file.write_text("{}")
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": str(creds_file)}, clear=True):
            assert service_account_configured() is True


class TestGetAccessToken:
    """get_access_token() -- OAuth token minting."""

    def test_no_google_auth_import(self, tmp_path):
        creds_file = tmp_path / "creds.json"
        creds_file.write_text("{}")
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": str(creds_file)}):
            with patch("builtins.__import__", side_effect=ImportError("no google.auth")):
                with pytest.raises(RuntimeError, match="google-auth"):
                    get_access_token()

    def test_no_creds_env(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(RuntimeError, match="GOOGLE_APPLICATION_CREDENTIALS"):
                get_access_token()

    def test_creds_not_exists(self):
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": "/tmp/nonexistent.json"}):
            with pytest.raises(RuntimeError, match="does not point"):
                get_access_token()

    def test_successful_token(self, tmp_path):
        creds_file = tmp_path / "service-account.json"
        creds_file.write_text(json.dumps({"type": "service_account"}))

        mock_creds = MagicMock()
        mock_creds.token = "ya29.fake-token"
        mock_creds.project_id = "my-gcp-project"

        mock_service_account = MagicMock()
        mock_service_account.Credentials.from_service_account_file.return_value = mock_creds

        mock_request = MagicMock()

        orig_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

        def mock_import(name, *args, **kwargs):
            if name == "google.auth.transport.requests":
                mock_mod = MagicMock()
                mock_mod.Request = mock_request
                return mock_mod
            if name == "google.oauth2":
                mock_mod = MagicMock()
                mock_mod.service_account = mock_service_account
                return mock_mod
            if name == "google.oauth2.service_account":
                return mock_service_account
            return orig_import(name, *args, **kwargs)

        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": str(creds_file)}, clear=True):
            with patch("builtins.__import__", side_effect=mock_import):
                token, project_id = get_access_token()

        assert token == "ya29.fake-token"
        assert project_id == "my-gcp-project"


class TestResolveProjectId:
    """resolve_project_id() -- GCP project id resolution."""

    def test_from_env_var(self):
        with patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "env-project"}, clear=True):
            assert resolve_project_id() == "env-project"

    def test_from_alt_env_var(self):
        with patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT_ID": "alt-project"}, clear=True):
            assert resolve_project_id() == "alt-project"

    def test_from_gcloud_env(self):
        with patch.dict("os.environ", {"GCLOUD_PROJECT": "gcloud-project"}, clear=True):
            assert resolve_project_id() == "gcloud-project"

    def test_env_priority(self):
        with patch.dict("os.environ", {
            "GOOGLE_CLOUD_PROJECT": "first",
            "GOOGLE_CLOUD_PROJECT_ID": "second",
            "GCLOUD_PROJECT": "third",
        }, clear=True):
            assert resolve_project_id() == "first"

    def test_from_key_file(self, tmp_path):
        creds_file = tmp_path / "creds.json"
        creds_file.write_text(json.dumps({"project_id": "key-file-project"}))
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": str(creds_file)}, clear=True):
            assert resolve_project_id() == "key-file-project"

    def test_no_env_no_key(self):
        with patch.dict("os.environ", {}, clear=True):
            assert resolve_project_id() is None

    def test_key_file_missing(self):
        with patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": "/tmp/missing.json"}, clear=True):
            assert resolve_project_id() is None
