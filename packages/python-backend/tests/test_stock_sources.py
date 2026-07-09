"""Tests for stock video sources (Phase 5.5).

Covers 16 stock source adapters: archive_org/coverr/dareful/esa/jaxa/loc/
mixkit/nara/nasa/noaa/pexels/pixabay_video/pond5_pd/unsplash/videvo/wikimedia.

Each adapter inherits from StockSourceTool and must expose:
  - name / provider / capabilities metadata
  - get_status() returning ToolStatus
  - dry_run() returning a dict with tool + would_execute
  - estimate_cost() returning a non-negative number
"""

from __future__ import annotations

import pytest

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.providers.video import (
    ArchiveOrgVideo,
    CoverrVideo,
    DarefulVideo,
    EsaVideo,
    JaxaVideo,
    LocVideo,
    MixkitVideo,
    NaraVideo,
    NasaVideo,
    NoaaVideo,
    PexelsVideo,
    PixabayVideo,
    Pond5PdVideo,
    UnsplashVideo,
    VidevoVideo,
    WikimediaVideo,
)

# ──────────────────────────────────────────────
# Shared validation helpers
# ──────────────────────────────────────────────


def _check_stock_metadata(tool: BaseTool):
    assert isinstance(tool.name, str) and tool.name
    assert isinstance(tool.provider, str) and tool.provider
    assert isinstance(tool.tier, ToolTier)
    assert isinstance(tool.stability, ToolStability)
    assert isinstance(tool.execution_mode, ExecutionMode)
    assert isinstance(tool.determinism, Determinism)
    assert tool.version
    assert isinstance(tool.dependencies, list)
    assert isinstance(tool.capabilities, list)
    assert isinstance(tool.best_for, list)
    assert isinstance(tool.resource_profile, ResourceProfile)


def _check_stock_get_info(tool: BaseTool):
    info = tool.get_info()
    assert info["name"] == tool.name
    assert info["provider"] == tool.provider
    assert "resource_profile" in info


def _check_stock_get_status(tool: BaseTool):
    assert isinstance(tool.get_status(), ToolStatus)


def _check_stock_dry_run(tool: BaseTool):
    result = tool.dry_run({"query": "test"})
    assert isinstance(result, dict)
    assert result["tool"] == tool.name


def _check_stock_cost_zero(tool: BaseTool):
    """Stock sources are free — cost should be 0."""
    assert tool.estimate_cost({"query": "test"}) == 0.0


def _check_stock_search_capability(tool: BaseTool):
    """All stock sources advertise search + download capabilities."""
    assert "search" in tool.capabilities
    assert "download" in tool.capabilities


STOCK_CLASSES = [
    ArchiveOrgVideo,
    CoverrVideo,
    DarefulVideo,
    EsaVideo,
    JaxaVideo,
    LocVideo,
    MixkitVideo,
    NaraVideo,
    NasaVideo,
    NoaaVideo,
    PexelsVideo,
    PixabayVideo,
    Pond5PdVideo,
    UnsplashVideo,
    VidevoVideo,
    WikimediaVideo,
]


@pytest.mark.parametrize("cls", STOCK_CLASSES, ids=lambda c: c.__name__)
class TestStockSourceMetadata:
    def test_metadata(self, cls):
        _check_stock_metadata(cls())

    def test_get_info(self, cls):
        _check_stock_get_info(cls())

    def test_get_status(self, cls):
        _check_stock_get_status(cls())

    def test_dry_run(self, cls):
        _check_stock_dry_run(cls())

    def test_cost_is_zero(self, cls):
        _check_stock_cost_zero(cls())

    def test_search_capability(self, cls):
        _check_stock_search_capability(cls())

    def test_api_runtime(self, cls):
        assert cls().runtime == ToolRuntime.API

    def test_tier_is_source(self, cls):
        """Stock sources use ToolTier.SOURCE."""
        assert cls().tier == ToolTier.SOURCE

    def test_capability_is_stock_video(self, cls):
        assert cls().capability == "stock_video"


# ──────────────────────────────────────────────
# Per-source spot checks
# ──────────────────────────────────────────────


class TestArchiveOrgVideo:
    def test_provider(self):
        assert ArchiveOrgVideo().provider == "archive_org"

    def test_no_api_key_required(self):
        """Archive.org is open — no API key needed."""
        # is_available should not require env vars
        tool = ArchiveOrgVideo()
        # Just verify it doesn't crash
        assert isinstance(tool.get_status(), ToolStatus)


class TestPexelsVideo:
    def test_provider(self):
        assert PexelsVideo().provider == "pexels"


class TestNasaVideo:
    def test_provider(self):
        assert NasaVideo().provider == "nasa"


class TestWikimediaVideo:
    def test_provider(self):
        assert WikimediaVideo().provider == "wikimedia"


class TestCoverrVideo:
    def test_provider(self):
        assert CoverrVideo().provider == "coverr"


class TestMixkitVideo:
    def test_provider(self):
        assert MixkitVideo().provider == "mixkit"


class TestPixabayVideo:
    def test_provider(self):
        assert PixabayVideo().provider == "pixabay"


class TestDarefulVideo:
    def test_provider(self):
        assert DarefulVideo().provider == "dareful"


class TestEsaVideo:
    def test_provider(self):
        assert EsaVideo().provider == "esa"


class TestJaxaVideo:
    def test_provider(self):
        assert JaxaVideo().provider == "jaxa"


class TestLocVideo:
    def test_provider(self):
        assert LocVideo().provider == "loc"


class TestNaraVideo:
    def test_provider(self):
        assert NaraVideo().provider == "nara"


class TestNoaaVideo:
    def test_provider(self):
        assert NoaaVideo().provider == "noaa"


class TestPond5PdVideo:
    def test_provider(self):
        assert Pond5PdVideo().provider == "pond5_pd"


class TestUnsplashVideo:
    def test_provider(self):
        assert UnsplashVideo().provider == "unsplash"


class TestVidevoVideo:
    def test_provider(self):
        assert VidevoVideo().provider == "videvo"
