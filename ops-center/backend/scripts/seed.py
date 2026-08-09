"""Seed OpsCenter DB from existing project config files."""
import asyncio
import json
import sys
sys.path.insert(0, "..")

from database import init_db, async_session
from models import Project, ConfigItem
from config import settings
import yaml
import os


async def seed_projects():
    """Register all projects."""
    projects = [
        ("platform-orchestrator", "Platform Orchestrator", "薄壳统一入口", "/data/configs/orchestrator/feature_gates.yaml", "yaml"),
        ("trendscope", "TrendScope", "多平台热榜聚合引擎", "/data/configs/trendscope/", "yaml"),
        ("content-aggregator", "Content Aggregator", "内容采集+AI改写", "/data/configs/content-aggregator/.env", "env"),
        ("prompt-engine", "Prompt Engine", "提示词优化引擎", "/data/configs/prompt-engine/config.yaml", "yaml"),
        ("smart-sentence-splitter", "Smart Sentence Splitter", "智能分句器", "/data/configs/sss/config.yaml", "yaml"),
        ("multi-publish", "Multi-Publish", "多平台发布", "/data/configs/multi-publish/platforms.yaml", "yaml"),
    ]

    async with async_session() as session:
        for code, name, desc, path, fmt in projects:
            existing = await session.get(Project, code)
            if not existing:
                session.add(Project(code=code, name=name, description=desc, config_file_path=path, config_format=fmt))
        await session.commit()
        print(f"Seeded {len(projects)} projects")


async def seed_feature_gates(source_path: str | None = None):
    """Import feature gates from existing feature_gates.yaml."""
    if source_path is None:
        # Try common paths
        candidates = [
            "D:/Data/projects/platform-orchestrator/feature_gates.yaml",
            os.path.expanduser("~/feature_gates.yaml"),
        ]
        source_path = next((p for p in candidates if os.path.exists(p)), None)

    if not source_path or not os.path.exists(source_path):
        print(f"Feature gates source not found: {source_path}")
        return 0

    with open(source_path) as f:
        data = yaml.safe_load(f)

    gates = data.get("features") or data.get("gates", {})
    count = 0

    async with async_session() as session:
        for key, gate in gates.items():
            config_id = f"platform-orchestrator.feature_flag.{key}"
            existing = await session.get(ConfigItem, config_id)
            if not existing:
                # Store full gate info as JSON so tier is preserved
                gate_data = {
                    "enabled": gate.get("enabled", False) if isinstance(gate, dict) else bool(gate),
                    "tier": gate.get("tier", 1) if isinstance(gate, dict) else 1,
                    "description": gate.get("description", "") if isinstance(gate, dict) else "",
                }
                item = ConfigItem(
                    id=config_id,
                    project_code="platform-orchestrator",
                    category="feature_flag",
                    key=key,
                    value=json.dumps(gate_data),
                    value_type="json",
                    description=gate_data["description"],
                    is_secret=0,
                    default_value=json.dumps({"enabled": False, "tier": 1, "description": gate_data["description"]}),
                )
                session.add(item)
                count += 1
        await session.commit()

    print(f"Seeded {count} feature gates from {source_path}")
    return count


async def main():
    print("Initializing database...")
    await init_db()
    print("Seeding projects...")
    await seed_projects()
    print("Seeding feature gates...")
    await seed_feature_gates()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
