"""Tests for video_creation config_model."""

from pathlib import Path

import yaml

from multi_publish.video_creation.config_model import (
    BudgetConfig,
    BudgetMode,
    OutputConfig,
    PathsConfig,
    VideoCreationConfig,
)


class TestBudgetMode:
    def test_values(self):
        assert BudgetMode.OBSERVE.value == "observe"
        assert BudgetMode.WARN.value == "warn"
        assert BudgetMode.CAP.value == "cap"


class TestBudgetConfig:
    def test_defaults(self):
        c = BudgetConfig()
        assert c.mode == BudgetMode.WARN
        assert c.total_usd == 10.0
        assert c.reserve_pct == 0.10
        assert c.single_action_approval_usd == 0.50

    def test_custom(self):
        c = BudgetConfig(mode=BudgetMode.CAP, total_usd=5.0)
        assert c.mode == BudgetMode.CAP
        assert c.total_usd == 5.0


class TestOutputConfig:
    def test_defaults(self):
        c = OutputConfig()
        assert c.default_format == "mp4"
        assert c.default_resolution == "1920x1080"
        assert c.default_fps == 30


class TestPathsConfig:
    def test_defaults(self):
        c = PathsConfig()
        assert c.output_dir == "output"
        assert c.cache_dir == "cache"
        assert c.temp_dir == "temp"


class TestVideoCreationConfig:
    def test_defaults(self):
        c = VideoCreationConfig()
        assert c.budget.mode == BudgetMode.WARN
        assert c.output.default_format == "mp4"
        assert c.paths.output_dir == "output"

    def test_load_default_when_no_file(self):
        c = VideoCreationConfig.load(config_path=Path("/nonexistent/path.yaml"))
        assert c.budget.total_usd == 10.0

    def test_load_from_yaml(self, tmp_path):
        cfg = tmp_path / "test_config.yaml"
        cfg.write_text(yaml.dump({"budget": {"mode": "cap", "total_usd": 5.0}}))
        c = VideoCreationConfig.load(config_path=cfg)
        assert c.budget.mode == BudgetMode.CAP
        assert c.budget.total_usd == 5.0
        assert c.output.default_format == "mp4"

    def test_resolve_path(self, tmp_path):
        c = VideoCreationConfig()
        p = c.resolve_path("output_dir", project_root=tmp_path)
        assert p == (tmp_path / "output").resolve()
