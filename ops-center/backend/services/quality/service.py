"""QualityEvalService - manages content quality evaluation records (SQLite)."""
from __future__ import annotations

import datetime
import json
import logging
from sqlalchemy import text, select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from database import Base, async_session, engine
import sqlalchemy as sa

logger = logging.getLogger("ops-center.quality-eval")

TABLE_NAME = "quality_eval_records"


def _load_evaluator_module():
    """Load the dependency-free evaluator without importing the full backend."""
    import importlib.util
    import os

    evaluator_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..",
        "packages", "python-backend", "src", "multi_publish",
        "aggregation", "quality", "evaluator.py",
    ))
    spec = importlib.util.spec_from_file_location("cqe_evaluator", evaluator_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"无法加载内容质量评估器: {evaluator_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def ensure_quality_eval_table():
    """Ensure the table exists (called from main.py lifespan)."""
    async with engine.begin() as conn:
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_content TEXT NOT NULL DEFAULT '',
                rewritten_content TEXT NOT NULL DEFAULT '',
                style TEXT NOT NULL DEFAULT '',
                length TEXT NOT NULL DEFAULT '',
                word_count INTEGER NOT NULL DEFAULT 0,
                overall_score REAL NOT NULL DEFAULT 0,
                grade TEXT NOT NULL DEFAULT 'D',
                grade_label TEXT NOT NULL DEFAULT '差',
                dimensions_json TEXT NOT NULL DEFAULT '[]',
                summary TEXT NOT NULL DEFAULT '',
                warnings_json TEXT NOT NULL DEFAULT '[]',
                suggestions_json TEXT NOT NULL DEFAULT '[]',
                platform TEXT NOT NULL DEFAULT '通用',
                title TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        await conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_qe_created_at ON {TABLE_NAME}(created_at DESC)"))
        await conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_qe_score ON {TABLE_NAME}(overall_score)"))
    logger.info("quality_eval_records table ready")


class QualityEvalService:
    """Content quality evaluation service for OpsCenter."""

    @staticmethod
    async def evaluate_and_save(
        db: AsyncSession,
        content: str,
        style: str = "通用",
        length: str = "keep",
        original_content: str = "",
        platform: str = "通用",
        title: str = "",
        created_by: str = "",
        skip_persist: bool = False,
    ) -> dict:
        """Evaluate content quality and optionally persist the record."""
        # Lazy import the evaluator to avoid coupling.
        # 直接按文件路径加载纯标准库的 evaluator.py，绕开 multi_publish 父包。
        # 原因：from multi_publish.aggregation.quality import ... 会触发
        #   multi_publish/__init__.py 顶层导入 core/crypto/account_store，
        #   这些模块依赖 loguru，而 ops-center 运行环境未安装 loguru，导致 500。
        # evaluator.py 仅依赖标准库（re/math/dataclasses/typing/collections），
        # 按路径加载即可，无需引入整个发布栈。
        _module = _load_evaluator_module()
        ContentQualityEvaluator = _module.ContentQualityEvaluator

        evaluator = ContentQualityEvaluator()
        report = evaluator.evaluate(content, original_content=original_content or None, platform=platform, title=title)

        record = QualityEvalService._report_to_dict(
            report, content, original_content, style, length, platform, title, _module
        )

        if not skip_persist:
            await QualityEvalService._insert_record(db, record, created_by)

        return record

    @staticmethod
    def _report_to_dict(report, content, original_content, style, length, platform, title, evaluator_module=None) -> dict:
        module = evaluator_module or _load_evaluator_module()
        serialized = module.serialize_quality_report(report)
        return {
            **serialized,
            "original_content": original_content or "",
            "rewritten_content": content,
            "style": style,
            "length": length,
            "platform": platform,
            "title": title,
        }

    @staticmethod
    async def _insert_record(db: AsyncSession, record: dict, created_by: str):
        await db.execute(
            text(f"""INSERT INTO {TABLE_NAME}
                (original_content, rewritten_content, style, length, word_count, overall_score, grade, grade_label,
                 dimensions_json, summary, warnings_json, suggestions_json, platform, title, created_by)
                VALUES
                (:oc, :rc, :s, :l, :wc, :os, :g, :gl, :dj, :su, :wj, :sj, :p, :t, :cb)"""),
            {
                "oc": record["original_content"][:10000],
                "rc": record["rewritten_content"][:10000],
                "s": record["style"],
                "l": record["length"],
                "wc": record["word_count"],
                "os": record["overall_score"],
                "g": record["grade"],
                "gl": record["grade_label"],
                "dj": json.dumps(record["dimensions"], ensure_ascii=False),
                "su": record["summary"],
                "wj": json.dumps(record["warnings"], ensure_ascii=False),
                "sj": json.dumps(record["suggestions"], ensure_ascii=False),
                "p": record["platform"],
                "t": record["title"][:200],
                "cb": created_by or "ops-center",
            },
        )
        await db.commit()

    @staticmethod
    async def get_recent_records(db: AsyncSession, limit: int = 100) -> list[dict]:
        """Get the most recent evaluation records."""
        result = await db.execute(
            text(f"""SELECT id, overall_score, grade, grade_label, word_count, style, length,
                    summary, warnings_json, suggestions_json, dimensions_json,
                    platform, title, created_by, created_at, original_content, rewritten_content
                    FROM {TABLE_NAME} ORDER BY created_at DESC LIMIT :limit"""),
            {"limit": max(1, min(limit, 200))},
        )
        rows = result.fetchall()
        records = []
        for row in rows:
            r = dict(row._mapping)
            r["dimensions"] = json.loads(r.pop("dimensions_json", "[]"))
            r["warnings"] = json.loads(r.pop("warnings_json", "[]"))
            r["suggestions"] = json.loads(r.pop("suggestions_json", "[]"))
            r["original_content"] = (r.get("original_content") or "")[:200] + "..."
            r["rewritten_content"] = (r.get("rewritten_content") or "")[:200] + "..."
            records.append(r)
        return records

    @staticmethod
    async def get_average_stats(db: AsyncSession, limit: int = 100) -> dict:
        """Get average evaluation stats for the latest N records."""
        result = await db.execute(
            text(f"""SELECT
                COUNT(*) as total,
                ROUND(AVG(overall_score), 1) as avg_score,
                MAX(overall_score) as max_score,
                MIN(overall_score) as min_score,
                ROUND(AVG(word_count), 0) as avg_words
                FROM (SELECT * FROM {TABLE_NAME} ORDER BY created_at DESC LIMIT :limit)"""),
            {"limit": max(1, min(limit, 200))},
        )
        row = result.fetchone()._mapping

        # Get dimension averages
        dim_result = await db.execute(
            text(f"SELECT dimensions_json, original_content FROM {TABLE_NAME} ORDER BY created_at DESC LIMIT :limit"),
            {"limit": max(1, min(limit, 200))},
        )
        dim_rows = dim_result.fetchall()
        dim_avgs = {}
        dim_count = {}
        if dim_rows:
            for dr in dim_rows:
                dimensions_json, original_content = dr[0], dr[1]
                dims = json.loads(dimensions_json) if dimensions_json else []
                for d in dims:
                    # v1.1 records carry explicit applicability. For v1.0
                    # records, only clone divergence can be inferred safely
                    # from the persisted source text; all other dimensions
                    # retain their historic applicable semantics.
                    applicable = d.get("applicable")
                    if applicable is None:
                        applicable = bool((original_content or "").strip()) if d.get("id") == "clone_divergence" else True
                    if not applicable:
                        continue
                    dim_id = d["id"]
                    if dim_id not in dim_avgs:
                        dim_avgs[dim_id] = 0.0
                        dim_count[dim_id] = 0
                    dim_avgs[dim_id] = dim_avgs[dim_id] + d["score"]
                    dim_count[dim_id] = dim_count[dim_id] + 1

        # Get grade distribution
        grade_result = await db.execute(
            text(f"""SELECT grade, COUNT(*) as cnt FROM
                (SELECT grade FROM {TABLE_NAME} ORDER BY created_at DESC LIMIT :limit)
                GROUP BY grade ORDER BY grade"""),
            {"limit": max(1, min(limit, 200))},
        )
        grade_dist = {}
        for gr in grade_result.fetchall():
            gd = gr._mapping
            grade_dist[gd["grade"]] = gd["cnt"]

        evaluator_module = _load_evaluator_module()
        avg_dimensions = []
        for dimension in evaluator_module.QUALITY_DIMENSIONS:
            dim_id = dimension["id"]
            total = dim_avgs.get(dim_id, 0.0)
            count = dim_count.get(dim_id, 0)
            avg_dimensions.append({
                "id": dim_id,
                "avg_score": round(total / count, 1) if count > 0 else 0,
                "count": count,
            })

        return {
            "total": row["total"],
            "avg_score": row["avg_score"] or 0,
            "max_score": row["max_score"] or 0,
            "min_score": row["min_score"] or 0,
            "avg_words": int(row["avg_words"] or 0),
            "avg_dimensions": avg_dimensions,
            "grade_distribution": grade_dist,
            "sample_size": min(limit, row["total"]),
        }
