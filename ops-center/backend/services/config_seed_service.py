"""Config seed service — 启动种子：注册项目目录 + 导入功能开关（替代手动 scripts/seed.py）。

- ensure_projects_seeded：INSERT OR IGNORE 注册预置项目（含 platform-orchestrator，FeatureFlags 页面依赖）
- ensure_feature_gates_seeded：从 feature_gates.yaml 导入功能开关（幂等，不覆盖已有；源可经 OPS_FEATURE_GATES_SOURCE 配置）
"""
import json
import logging
import os

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import ConfigItem, Project

logger = logging.getLogger("ops-center.seed")

# 与 scripts/seed.py 对齐的预置项目目录
PRESET_PROJECTS = [
    ("platform-orchestrator", "Platform Orchestrator", "薄壳统一入口", "/data/configs/orchestrator/feature_gates.yaml", "yaml"),
    ("trendscope", "TrendScope", "多平台热榜聚合引擎", "/data/configs/trendscope/", "yaml"),
    ("content-aggregator", "Content Aggregator", "内容采集+AI改写", "/data/configs/content-aggregator/.env", "env"),
    ("prompt-engine", "Prompt Engine", "提示词优化引擎", "/data/configs/prompt-engine/config.yaml", "yaml"),
    ("smart-sentence-splitter", "Smart Sentence Splitter", "智能分句器", "/data/configs/sss/config.yaml", "yaml"),
    ("multi-publish", "Multi-Publish", "多平台发布", "/data/configs/multi-publish/platforms.yaml", "yaml"),
]


async def ensure_projects_seeded(db: AsyncSession) -> int:
    """幂等注册预置项目目录（不覆盖已有）。返回新增数量。"""
    added = 0
    for code, name, desc, path, fmt in PRESET_PROJECTS:
        existing = await db.get(Project, code)
        if existing is None:
            db.add(Project(code=code, name=name, description=desc, config_file_path=path, config_format=fmt))
            added += 1
    if added:
        await db.commit()
    logger.info("Projects seeded: %d added", added)
    return added


def _feature_gates_source_candidates() -> list[str]:
    env_src = (getattr(settings, "feature_gates_source", "") or "").strip()
    if env_src:
        # 显式配置了 OPS_FEATURE_GATES_SOURCE 则只用它（文件缺失即跳过，不 fallback 默认路径）
        return [env_src]
    return [
        "D:/Data/projects/platform-orchestrator/feature_gates.yaml",
        os.path.expanduser("~/feature_gates.yaml"),
    ]


async def ensure_feature_gates_seeded(db: AsyncSession) -> int:
    """从 feature_gates.yaml 导入功能开关（INSERT OR IGNORE 语义，不覆盖已有）。

    源文件不存在时跳过（页面可用但列表为空，不报错）。
    """
    source_path = next((p for p in _feature_gates_source_candidates() if p and os.path.exists(p)), None)
    if not source_path:
        logger.warning("Feature gates source not found, skipping")
        return 0

    with open(source_path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    gates = data.get("features") or data.get("gates", {})
    if not isinstance(gates, dict):
        return 0

    count = 0
    for key, gate in gates.items():
        config_id = f"platform-orchestrator.feature_flag.{key}"
        existing = await db.get(ConfigItem, config_id)
        if existing is not None:
            continue
        gate_data = {
            "enabled": gate.get("enabled", False) if isinstance(gate, dict) else bool(gate),
            "tier": gate.get("tier", 1) if isinstance(gate, dict) else 1,
            "description": gate.get("description", "") if isinstance(gate, dict) else "",
        }
        db.add(ConfigItem(
            id=config_id,
            project_code="platform-orchestrator",
            category="feature_flag",
            key=key,
            value=json.dumps(gate_data, ensure_ascii=False),
            value_type="json",
            description=gate_data["description"],
            is_secret=0,
            default_value=json.dumps({"enabled": False, "tier": 1, "description": gate_data["description"]}, ensure_ascii=False),
        ))
        count += 1
    if count:
        await db.commit()
    logger.info("Feature gates seeded: %d from %s", count, source_path)
    return count