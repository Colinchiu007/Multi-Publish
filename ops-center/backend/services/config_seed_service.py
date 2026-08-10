"""Config seed service — 启动种子：注册项目目录 + 导入功能开关（替代手动 scripts/seed.py）。

- ensure_projects_seeded：原子 upsert（ON CONFLICT DO NOTHING），幂等注册预置项目（含 platform-orchestrator）
- ensure_feature_gates_seeded：从 feature_gates.yaml 导入功能开关（原子 upsert，不覆盖已有）
- 源路径：显式配置 OPS_FEATURE_GATES_IMPORT_SOURCE 时只使用该源（文件缺失即跳过）；未配置则探测
  orchestrator_feature_gates_path（sync 输出）与开发机默认路径；生产建议显式配置
"""
import asyncio
import json
import logging
import os

import yaml
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import ConfigItem, Project

logger = logging.getLogger("ops-center.seed")

# 与 scripts/seed.py 对齐的预置项目目录（目录元数据；运营显式删除后下次启动会按目录语义复活）
PRESET_PROJECTS = [
    ("platform-orchestrator", "Platform Orchestrator", "薄壳统一入口", "/data/configs/orchestrator/feature_gates.yaml", "yaml"),
    ("trendscope", "TrendScope", "多平台热榜聚合引擎", "/data/configs/trendscope/", "yaml"),
    ("content-aggregator", "Content Aggregator", "内容采集+AI改写", "/data/configs/content-aggregator/.env", "env"),
    ("prompt-engine", "Prompt Engine", "提示词优化引擎", "/data/configs/prompt-engine/config.yaml", "yaml"),
    ("smart-sentence-splitter", "Smart Sentence Splitter", "智能分句器", "/data/configs/sss/config.yaml", "yaml"),
    ("multi-publish", "Multi-Publish", "多平台发布", "/data/configs/multi-publish/platforms.yaml", "yaml"),
]


async def ensure_projects_seeded(db: AsyncSession) -> int:
    """原子 upsert 注册预置项目目录（ON CONFLICT DO NOTHING），返回新增数量。"""
    stmt = sqlite_insert(Project).values(
        [
            {"code": c, "name": n, "description": d, "config_file_path": p, "config_format": f}
            for c, n, d, p, f in PRESET_PROJECTS
        ]
    ).on_conflict_do_nothing(index_elements=["code"])
    result = await db.execute(stmt)
    await db.commit()
    added = result.rowcount if result.rowcount and result.rowcount > 0 else 0
    logger.info("Projects seeded: %d added", added)
    return added


def _feature_gates_source_candidates() -> list[str]:
    env_src = (getattr(settings, "feature_gates_import_source", "") or "").strip()
    if env_src:
        # 显式配置 OPS_FEATURE_GATES_IMPORT_SOURCE 则只用它（文件缺失即跳过，不 fallback 默认路径）
        return [env_src]
    return [
        (settings.orchestrator_feature_gates_path or "").strip(),
        "D:/Data/projects/platform-orchestrator/feature_gates.yaml",
        os.path.expanduser("~/feature_gates.yaml"),
    ]


def _parse_gate(key: str, gate) -> dict | None:
    """归一化 gate：dict → enabled/tier/description；标量仅信任 bool（其余视为 False）。"""
    if isinstance(gate, dict):
        return {
            "enabled": bool(gate.get("enabled", False)),
            "tier": int(gate.get("tier", 1) or 1),
            "description": str(gate.get("description", "") or ""),
        }
    if isinstance(gate, bool):
        return {"enabled": gate, "tier": 1, "description": ""}
    logger.warning("Feature gate %r has non-boolean scalar value %r, treated as disabled", key, gate)
    return {"enabled": False, "tier": 1, "description": ""}


async def ensure_feature_gates_seeded(db: AsyncSession) -> int:
    """从 feature_gates.yaml 导入功能开关（原子 upsert，不覆盖已有）。

    源文件缺失或 YAML 损坏 → 记录错误并跳过（不拖垮启动）。
    """
    source_path = next((p for p in _feature_gates_source_candidates() if p and os.path.exists(p)), None)
    if not source_path:
        logger.warning("Feature gates source not found, skipping (生产请配置 OPS_FEATURE_GATES_IMPORT_SOURCE)")
        return 0

    try:
        raw = await asyncio.to_thread(lambda: open(source_path, encoding="utf-8").read())
        data = await asyncio.to_thread(lambda: yaml.safe_load(raw)) or {}
    except Exception as exc:  # noqa: BLE001 — 坏文件不应拖垮配置中心启动
        logger.error("Feature gates source unreadable (%s): %s", source_path, exc)
        return 0

    gates = data.get("features") or data.get("gates", {})
    if not isinstance(gates, dict):
        logger.warning("Feature gates file has no features/gates mapping: %s", source_path)
        return 0

    rows = []
    for key, gate in gates.items():
        config_id = f"platform-orchestrator.feature_flag.{key}"
        gate_data = _parse_gate(key, gate)
        rows.append({
            "id": config_id,
            "project_code": "platform-orchestrator",
            "category": "feature_flag",
            "key": key,
            "value": json.dumps(gate_data, ensure_ascii=False),
            "value_type": "json",
            "description": gate_data["description"],
            "is_secret": 0,
            "default_value": json.dumps({"enabled": False, "tier": 1, "description": gate_data["description"]}, ensure_ascii=False),
        })
    if not rows:
        return 0
    stmt = sqlite_insert(ConfigItem).values(rows).on_conflict_do_nothing(index_elements=["id"])
    result = await db.execute(stmt)
    await db.commit()
    added = result.rowcount if result.rowcount and result.rowcount > 0 else 0
    logger.info("Feature gates seeded: %d added from %s", added, source_path)
    return added