#!/usr/bin/env python3
"""backfill_platform_char_limits.py — 平台字数限制存量回填（PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F2）

背景：SEED_DEFS 只在「行不存在」时写入，已上线的 ops-center 数据库里 platform_defs
存量行的 max_title/max_content 仍是旧值（历史上与渲染端注册表漂移：
douyin/xiaohongshu 1000 vs 5000、weibo 2000 vs 5000 等）。本脚本把**发布能力注册表**
（packages/shared-utils/src/publish-capabilities.json，渲染端校验单一真源 +
2026-10-02 平台调研）的护栏值幂等回填进存量库，使「数据库 ↔ 注册表」一致。

行为契约：
  - 幂等：值已一致的行不写（updated_at 不动）；值不同才 UPDATE，并打印变更清单。
  - 只更新注册表里存在的平台；软删行（deleted_at 非空）跳过，不复活。
  - note 为空或无调研依据时补写调研依据说明（不覆盖运营已写的 note）。
  - 不引入新依赖：aiosqlite 走 backend 已有的 database/engine；也可用 --dry-run 预览。

用法（在 ops-center/backend 目录）：
  python scripts/backfill_platform_char_limits.py [--db <path>] [--dry-run]
  缺省 --db 取 config.settings.db_path（与 backend 服务同一数据库）。
"""
from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import sys

REPO_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ops-center/backend（scripts 的上级）
REPO_ROOT = os.path.dirname(os.path.dirname(REPO_BACKEND_DIR))  # 仓库根（ops-center 的上级）
REGISTRY_JSON = os.path.join(REPO_ROOT, "packages", "shared-utils", "src", "publish-capabilities.json")
RESEARCH_NOTE = "字数上限来源：发布能力注册表+平台调研（01-docs/PLATFORM-CHAR-LIMITS-RESEARCH-2026-10-02.md）"


def load_registry_limits() -> dict:
    """读注册表 JSON → {platform_id: {"titleMax"?, "titleMaxBytes"?, "contentMax"}}。"""
    if not os.path.exists(REGISTRY_JSON):
        print(f"[backfill] FAIL: 注册表不存在：{REGISTRY_JSON}")
        sys.exit(2)
    with open(REGISTRY_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    limits = {}
    for pid, meta in (data.get("platforms") or {}).items():
        lim = meta.get("limits") or {}
        title = lim.get("titleMaxBytes") or lim.get("titleMax") or 0
        content = lim.get("contentMax") or 0
        limits[pid] = {"title": int(title or 0), "content": int(content or 0)}
    return limits


async def backfill(db_path: str, dry_run: bool) -> int:
    import aiosqlite

    limits = load_registry_limits()
    changes: list[str] = []
    skipped_soft_deleted = 0
    untouched = 0
    now = datetime.datetime.utcnow().isoformat()

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, max_title, max_content, note, deleted_at FROM platform_defs"
        )
        for row in rows:
            pid = row["id"]
            if row["deleted_at"]:
                skipped_soft_deleted += 1
                continue
            limit = limits.get(pid)
            if limit is None:
                print(f"[backfill] SKIP {pid}: 注册表无此平台（保留运营自定义）")
                untouched += 1
                continue
            new_title = limit["title"] if limit["title"] > 0 else None
            new_content = limit["content"] if limit["content"] > 0 else None
            updates: dict = {}
            if row["max_title"] != new_title:
                updates["max_title"] = new_title
            if row["max_content"] != new_content:
                updates["max_content"] = new_content
            note = row["note"] or ""
            if RESEARCH_NOTE not in note:
                updates["note"] = (note + ("；" if note else "") + RESEARCH_NOTE)[:200]
            if not updates:
                untouched += 1
                continue
            title_str = f"max_title {row['max_title']} → {new_title}" if "max_title" in updates else None
            content_str = f"max_content {row['max_content']} → {new_content}" if "max_content" in updates else None
            detail = "；".join(part for part in (title_str, content_str, "note 补调研依据" if "note" in updates else None) if part)
            changes.append(f"{pid}: {detail}")
            if dry_run:
                continue
            sets = ", ".join(f"{key} = ?" for key in updates)
            await db.execute(
                f"UPDATE platform_defs SET {sets}, updated_at = ? WHERE id = ?",
                [*updates.values(), now, pid],
            )
        if not dry_run:
            await db.commit()

    print(f"[backfill] 扫描 {len(rows)} 行：变更 {len(changes)}，一致 {untouched}，软删跳过 {skipped_soft_deleted}")
    for line in changes:
        print(f"[backfill]   {line}")
    if dry_run:
        print("[backfill] dry-run 模式：未写库")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="平台字数限制存量回填（注册表 → platform_defs）")
    parser.add_argument("--db", default=None, help="SQLite 路径（缺省取 config.settings.db_path）")
    parser.add_argument("--dry-run", action="store_true", help="只打印变更清单，不写库")
    args = parser.parse_args()

    db_path = args.db
    if db_path:
        # 独立路径模式：不导入 backend 配置，直接回填
        return asyncio.run(backfill(db_path, args.dry_run))
    # 默认模式：与 backend 服务同一数据库
    sys.path.insert(0, REPO_BACKEND_DIR)
    from config import settings  # noqa: E402

    return asyncio.run(backfill(settings.db_path, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
