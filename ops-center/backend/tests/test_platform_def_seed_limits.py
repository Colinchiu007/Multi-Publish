"""平台字数限制体系契约锁（PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F2/§F8）。

锁三条：
  ① SEED_DEFS 的 max_title/max_content ≡ 发布能力注册表 JSON（渲染端校验单一真源）——
     种子与渲染端护栏漂移即红（历史漂移实锤：douyin/xiaohongshu 1000 vs 5000）。
  ② 注册表 JSON 文件缺失时回落内置字面量且不抛错（CI 沙箱/打包环境 fail-open）。
  ③ 存量回填脚本幂等：首跑写差异行、二跑零变更；软删行跳过；note 补调研依据。

注册表 JSON 定位：从本文件位置逐级上溯（ops-center/backend/tests → 仓库根），
找不到即 fail（不允许静默跳过——先例：auth-view-manager.test.js 的 d.ts 上溯锁）。
"""
import asyncio
import json
import os
import sys
import tempfile
import unittest.mock

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ops-center/backend
REPO_ROOT = os.path.dirname(os.path.dirname(BACKEND_DIR))  # 仓库根（backend → ops-center → 根）
REGISTRY_JSON = os.path.join(REPO_ROOT, "packages", "shared-utils", "src", "publish-capabilities.json")

sys.path.insert(0, BACKEND_DIR)


def _load_registry_limits() -> dict:
    with open(REGISTRY_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {pid: dict(meta.get("limits") or {}) for pid, meta in data["platforms"].items()}


def test_registry_json_exists():
    """锁锚点存在：注册表 JSON 必须能从 backend 测试目录定位到（防路径漂移假绿）。"""
    assert os.path.exists(REGISTRY_JSON), f"注册表 JSON 不存在：{REGISTRY_JSON}"


def test_seed_defs_match_registry():
    """① SEED_DEFS 的字数上限 ≡ 注册表 JSON（逐平台逐字段）。"""
    from services.platform_def_service import SEED_DEFS

    registry = _load_registry_limits()
    assert len(SEED_DEFS) >= 12
    for seed in SEED_DEFS:
        pid = seed["id"]
        assert pid in registry, f"种子平台 {pid} 不在注册表（两侧清单漂移）"
        limits = registry[pid]
        # title：注册表 titleMaxBytes（百家号字节口径）优先，否则 titleMax
        expect_title = limits.get("titleMaxBytes") or limits.get("titleMax") or 0
        expect_content = limits.get("contentMax") or 0
        assert seed["max_title"] == int(expect_title or 0), (
            f"{pid} max_title 种子 {seed['max_title']} ≠ 注册表 {expect_title}（漂移即红）"
        )
        assert seed["max_content"] == int(expect_content or 0), (
            f"{pid} max_content 种子 {seed['max_content']} ≠ 注册表 {expect_content}（漂移即红）"
        )


def test_seed_fallback_when_registry_missing():
    """② 注册表 JSON 缺失：回落内置字面量，SEED_DEFS 仍完整可构建（fail-open 不抛错）。"""
    import importlib

    import services.platform_def_service as svc

    with unittest.mock.patch.object(svc, "_REGISTRY_JSON_PATHS", ("../../nonexistent/registry.json",)):
        reloaded = importlib.reload(svc)
        try:
            assert len(reloaded.SEED_DEFS) == 12
            douyin = next(s for s in reloaded.SEED_DEFS if s["id"] == "douyin")
            assert douyin["max_content"] == reloaded._SEED_FALLBACK_LIMITS["douyin"]["contentMax"]
        finally:
            importlib.reload(svc)  # 恢复真实注册表路径


def _make_db(path: str) -> str:
    """最小 platform_defs 表（只含回填脚本触及的列）。"""
    import aiosqlite

    async def _create():
        async with aiosqlite.connect(path) as db:
            await db.execute(
                """
                CREATE TABLE platform_defs (
                    id TEXT PRIMARY KEY,
                    max_title INTEGER,
                    max_content INTEGER,
                    note TEXT,
                    deleted_at TEXT,
                    updated_at TEXT
                )
                """
            )
            await db.execute(
                "INSERT INTO platform_defs (id, max_title, max_content, note, deleted_at) VALUES (?, ?, ?, ?, ?)",
                ("douyin", 1000, 1000, "", None),  # 旧漂移值
            )
            await db.execute(
                "INSERT INTO platform_defs (id, max_title, max_content, note, deleted_at) VALUES (?, ?, ?, ?, ?)",
                ("kuaishou", 0, 480, "", None),  # 已一致
            )
            await db.execute(
                "INSERT INTO platform_defs (id, max_title, max_content, note, deleted_at) VALUES (?, ?, ?, ?, ?)",
                ("weibo", 0, 2000, "", "2026-01-01T00:00:00"),  # 软删 → 跳过
            )
            await db.commit()

    asyncio.run(_create())
    return path


def test_backfill_script_idempotent(tmp_path):
    """③ 回填脚本：首跑写差异行，二跑零变更（幂等）；软删行跳过；note 补依据。"""
    from scripts.backfill_platform_char_limits import load_registry_limits, backfill

    db_path = _make_db(str(tmp_path / "backfill.db"))
    registry = load_registry_limits()

    exit_code = asyncio.run(backfill(db_path, dry_run=False))
    assert exit_code == 0

    import aiosqlite

    async def _rows():
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            return {r["id"]: dict(r) for r in await db.execute_fetchall(
                "SELECT id, max_title, max_content, note, deleted_at FROM platform_defs")}

    rows = asyncio.run(_rows())
    douyin_limits = registry["douyin"]  # 扁平键：{title, content}
    # 首跑：douyin 旧值 1000 → 注册表值
    assert rows["douyin"]["max_content"] == int(douyin_limits["content"])
    assert rows["douyin"]["max_title"] == int(douyin_limits["title"])
    assert "调研" in (rows["douyin"]["note"] or "")
    # kuaishou 已一致：只补 note，不改变数值
    assert rows["kuaishou"]["max_content"] == 480
    assert "调研" in (rows["kuaishou"]["note"] or "")
    # weibo 软删：完全不动
    assert rows["weibo"]["max_content"] == 2000
    assert rows["weibo"]["note"] == ""

    # 二跑：零变更（幂等）
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exit_code2 = asyncio.run(backfill(db_path, dry_run=False))
    assert exit_code2 == 0
    assert "变更 0" in buf.getvalue(), f"二跑应为零变更，输出：{buf.getvalue()}"
