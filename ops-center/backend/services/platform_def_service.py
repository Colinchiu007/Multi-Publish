"""Platform def service — 平台发布元数据管理（CRUD/校验/种子/运行时下发）。"""
import datetime
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import PlatformDef

CONTENT_CATEGORIES = ("VIDEO", "IMAGE_TEXT", "MIXED")
CATEGORIES = ("中文", "海外")
PLATFORM_TYPES = ("article", "mixed")
ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
_BOOL_TRUE = ("true", "1")
_BOOL_FALSE = ("false", "0")

# 种子：对齐 config/platforms.yaml 关键平台（已存在即跳过，不覆盖运营修改/软删）
# ⭐ 平台字数限制体系（PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F2）：
#    max_title/max_content 由**发布能力注册表**（packages/shared-utils/src/
#    publish-capabilities.json，渲染端校验单一真源）生成，消除种子与渲染端护栏值的漂移
#    （历史漂移实锤：注册表 douyin/xiaohongshu 5000 vs 本表 1000）。_registry_limits()
#    读不到 JSON 时回落内置字面量（CI 沙箱/打包环境 fail-open + 告警），
#    契约锁见 tests/test_platform_def_seed_limits.py。
_REGISTRY_JSON_PATHS = (
    # ops-center/backend → 仓库根 → packages/...（本仓布局：ops-center 是独立目录）
    "../../packages/shared-utils/src/publish-capabilities.json",
)
_SEED_FALLBACK_LIMITS = {
    # 回落值 = 注册表不可读时的最后快照（2026-10-02），与注册表同步维护
    "wechat_mp": {"titleMax": 64, "contentMax": 20000},
    "zhihu": {"titleMax": 50, "contentMax": 100000},
    "weibo": {"titleMax": 0, "contentMax": 5000},
    "douyin": {"titleMax": 55, "contentMax": 5000},
    "xiaohongshu": {"titleMax": 20, "contentMax": 5000},
    "tencent_video": {"titleMax": 0, "contentMax": 5000},
    "kuaishou": {"titleMax": 0, "contentMax": 480},
    "toutiao": {"titleMax": 30, "contentMax": 100000},
    "bilibili": {"titleMax": 80, "contentMax": 2000},
    "baijiahao": {"titleMaxBytes": 149, "contentMax": 100000},
    "youtube": {"titleMax": 100, "contentMax": 5000},
    "tiktok": {"titleMax": 0, "contentMax": 2200},
    "twitter": {"titleMax": 0, "contentMax": 280},
    "instagram": {"titleMax": 0, "contentMax": 2200},
    "facebook": {"titleMax": 100, "contentMax": 63206},
}


def _registry_limits() -> dict:
    """读发布能力注册表 JSON 的平台字数限制；文件缺失/损坏时回落字面量并打告警。

    返回 {platform_id: {"titleMax": int|0, "titleMaxBytes"?: int, "contentMax": int}}。
    """
    import json
    import os

    for rel in _REGISTRY_JSON_PATHS:
        path = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), rel))
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                pid: dict(meta.get("limits") or {})
                for pid, meta in (data.get("platforms") or {}).items()
            }
        except (OSError, ValueError) as exc:  # 文件损坏/JSON 非法 → 回落
            print(f"[platform_def_service] WARN: 注册表 JSON 解析失败（{path}）：{exc}，回落内置字面量")
            break
    print("[platform_def_service] WARN: 未找到发布能力注册表 JSON，SEED 限制回落内置快照")
    return {k: dict(v) for k, v in _SEED_FALLBACK_LIMITS.items()}


_REGISTRY_LIMITS = _registry_limits()


def _registry_note(pid: str) -> str:
    """平台字数限制的调研依据（PRD §F2：note 记录来源与置信度）。"""
    return "字数上限来源：发布能力注册表+平台调研（01-docs/PLATFORM-CHAR-LIMITS-RESEARCH-2026-10-02.md)"


def _limit(platform_id: str, key: str, default: int | None = None) -> int | None:
    limits = _REGISTRY_LIMITS.get(platform_id) or {}
    value = limits.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return int(value)


SEED_DEFS = [
    {"id": "wechat_mp", "name": "微信公众号", "category": "中文", "content_category": "IMAGE_TEXT", "type": "article", "max_title": _limit("wechat_mp", "titleMax", 64), "max_content": _limit("wechat_mp", "contentMax", 20000), "has_api": 0},
    {"id": "weibo", "name": "微博", "category": "中文", "content_category": "MIXED", "type": "mixed", "max_title": _limit("weibo", "titleMax", 140), "max_content": _limit("weibo", "contentMax", 5000), "has_api": 0},
    {"id": "douyin", "name": "抖音", "category": "中文", "content_category": "VIDEO", "type": "mixed", "max_title": _limit("douyin", "titleMax", 55), "max_content": _limit("douyin", "contentMax", 5000), "has_api": 0},
    {"id": "bilibili", "name": "哔哩哔哩", "category": "中文", "content_category": "VIDEO", "type": "mixed", "max_title": _limit("bilibili", "titleMax", 80), "max_content": _limit("bilibili", "contentMax", 2000), "has_api": 1},
    {"id": "toutiao", "name": "今日头条", "category": "中文", "content_category": "IMAGE_TEXT", "type": "article", "max_title": _limit("toutiao", "titleMax", 30), "max_content": _limit("toutiao", "contentMax", 100000), "has_api": 0},
    {"id": "xiaohongshu", "name": "小红书", "category": "中文", "content_category": "IMAGE_TEXT", "type": "mixed", "max_title": _limit("xiaohongshu", "titleMax", 20), "max_content": _limit("xiaohongshu", "contentMax", 5000), "has_api": 0},
    {"id": "zhihu", "name": "知乎", "category": "中文", "content_category": "IMAGE_TEXT", "type": "article", "max_title": _limit("zhihu", "titleMax", 50), "max_content": _limit("zhihu", "contentMax", 100000), "has_api": 0},
    {"id": "kuaishou", "name": "快手", "category": "中文", "content_category": "VIDEO", "type": "mixed", "max_title": _limit("kuaishou", "titleMax", 55), "max_content": _limit("kuaishou", "contentMax", 480), "has_api": 0},
    {"id": "youtube", "name": "YouTube", "category": "海外", "content_category": "VIDEO", "type": "mixed", "max_title": _limit("youtube", "titleMax", 100), "max_content": _limit("youtube", "contentMax", 5000), "has_api": 1},
    {"id": "tiktok", "name": "TikTok", "category": "海外", "content_category": "VIDEO", "type": "mixed", "max_title": _limit("tiktok", "titleMax", 150), "max_content": _limit("tiktok", "contentMax", 2200), "has_api": 0},
    {"id": "twitter", "name": "X (Twitter)", "category": "海外", "content_category": "IMAGE_TEXT", "type": "mixed", "max_title": _limit("twitter", "titleMax", 280), "max_content": _limit("twitter", "contentMax", 280), "has_api": 1},
    {"id": "facebook", "name": "Facebook", "category": "海外", "content_category": "IMAGE_TEXT", "type": "mixed", "max_title": _limit("facebook", "titleMax", 100), "max_content": _limit("facebook", "contentMax", 63206), "has_api": 1},
]


class PlatformDefError(ValueError):
    """平台元数据校验/业务错误基类（400）。"""


class PlatformDefExists(PlatformDefError):
    """平台 id 已存在（409）。"""


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _to_dict(row: PlatformDef) -> dict:
    return {
        "id": row.id, "name": row.name, "category": row.category or "中文",
        "content_category": row.content_category or "MIXED", "type": row.type or "mixed",
        "max_title": row.max_title, "max_content": row.max_content,
        "has_api": bool(row.has_api), "enabled": bool(row.enabled), "note": row.note or "",
        "updated_at": row.updated_at,
    }


def _str_field(body: dict, key: str, default: str | None, max_len: int, *,
               required: bool = False, choices: tuple | None = None) -> str:
    v = body.get(key, default)
    if v is None or (isinstance(v, str) and v.strip() == ""):
        if required:
            raise PlatformDefError(f"{key} 不能为空")
        return default or ""
    if not isinstance(v, str):
        raise PlatformDefError(f"{key} 必须是字符串")
    v = v.strip()
    if len(v) > max_len:
        raise PlatformDefError(f"{key} 过长（≤{max_len}）")
    if choices and v not in choices:
        raise PlatformDefError(f"{key} 必须是 {'/'.join(choices)} 之一")
    return v


def _parse_bool(body: dict, key: str, default: int) -> int:
    v = body.get(key, default)
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, int) and not isinstance(v, bool) and v in (0, 1):
        return v
    if isinstance(v, str):
        low = v.strip().lower()
        if low in _BOOL_TRUE:
            return 1
        if low in _BOOL_FALSE:
            return 0
    raise PlatformDefError(f"{key} 必须是布尔值（true/false/1/0）")


def validate_platform_def(body: dict) -> dict:
    pid = _str_field(body, "id", None, 64, required=True)
    if not ID_RE.match(pid):
        raise PlatformDefError("id 只能包含小写字母/数字/下划线/短横线（1-64 位）")
    name = _str_field(body, "name", None, 100, required=True)
    category = _str_field(body, "category", "中文", 20, choices=CATEGORIES)
    cc = _str_field(body, "content_category", "MIXED", 20, choices=CONTENT_CATEGORIES)
    ptype = _str_field(body, "type", "mixed", 20, choices=PLATFORM_TYPES)
    note = _str_field(body, "note", "", 200)

    def _nonneg_int(key):
        v = body.get(key)
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        if isinstance(v, bool):
            raise PlatformDefError(f"{key} 必须是整数")
        if isinstance(v, float) and not v.is_integer():
            raise PlatformDefError(f"{key} 必须是整数")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise PlatformDefError(f"{key} 必须是整数")
        if n < 1:
            raise PlatformDefError(f"{key} 必须为正整数或留空")
        return n

    return {
        "id": pid, "name": name, "category": category,
        "content_category": cc, "type": ptype,
        "max_title": _nonneg_int("max_title"), "max_content": _nonneg_int("max_content"),
        "has_api": _parse_bool(body, "has_api", 0),
        "enabled": _parse_bool(body, "enabled", 1),
        "note": note,
    }


async def _get(db: AsyncSession, def_id: str) -> PlatformDef | None:
    return (await db.execute(sa.select(PlatformDef).where(PlatformDef.id == def_id))).scalar_one_or_none()


async def _commit(db: AsyncSession, exists_msg: str | None = None) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise PlatformDefExists(exists_msg or "数据冲突，请重试")


async def ensure_platform_def_seeded(db: AsyncSession) -> None:
    now = _now()
    for s in SEED_DEFS:
        if await _get(db, s["id"]) is not None:
            continue  # 已存在（含软删）→ 不覆盖运营修改/删除
        db.add(PlatformDef(id=s["id"], name=s["name"], category=s["category"],
                           content_category=s["content_category"], type=s["type"],
                           max_title=s.get("max_title"), max_content=s.get("max_content"),
                           has_api=s.get("has_api", 0), enabled=1, note=_registry_note(s["id"]), updated_at=now))
    await db.commit()


async def list_platform_defs(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(PlatformDef).where(PlatformDef.deleted_at.is_(None)).order_by(PlatformDef.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_platform_def(db: AsyncSession, body: dict) -> dict:
    data = validate_platform_def(body)
    now = _now()
    pid = data["id"]
    row = await _get(db, pid)
    if row is not None and row.deleted_at is None:
        raise PlatformDefExists(f"平台 {pid} 已存在")
    if row is None:
        row = PlatformDef(id=pid, **{k: v for k, v in data.items() if k != "id"}, updated_at=now)
        db.add(row)
    else:
        # 软删后重建：恢复并应用新数据
        for k, v in data.items():
            if k != "id":
                setattr(row, k, v)
        row.deleted_at = None
        row.updated_at = now
    await _commit(db, f"平台 {pid} 已存在")
    await db.refresh(row)
    return _to_dict(row)


async def update_platform_def(db: AsyncSession, def_id: str, body: dict) -> dict:
    row = await _get(db, def_id)
    if row is None or row.deleted_at is not None:
        raise KeyError(def_id)  # 404
    # 部分更新：与已存在记录合并后全量校验；null 视为不修改，路径 id 优先
    merged = _to_dict(row)
    merged.update({k: v for k, v in body.items() if v is not None})
    merged["id"] = def_id
    data = validate_platform_def(merged)
    for k, v in data.items():
        if k != "id":
            setattr(row, k, v)
    row.updated_at = _now()
    await _commit(db)
    await db.refresh(row)
    return _to_dict(row)


async def delete_platform_def(db: AsyncSession, def_id: str) -> bool:
    """软删除：置 deleted_at + enabled=0；种子不会在重启后被重新插入。"""
    row = await _get(db, def_id)
    if row is None or row.deleted_at is not None:
        return False
    row.deleted_at = _now()
    row.enabled = 0
    row.updated_at = row.deleted_at
    await _commit(db)
    return True


async def list_runtime_platform_defs(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(PlatformDef)
        .where(PlatformDef.enabled == 1, PlatformDef.deleted_at.is_(None))
        .order_by(PlatformDef.id)
    )).scalars().all()
    return [{
        "id": r.id, "name": r.name, "category": r.category or "中文",
        "content_category": r.content_category or "MIXED",
        "max_title": r.max_title, "max_content": r.max_content, "has_api": bool(r.has_api),
    } for r in rows]
