"""Story2Video 场景上下文规则管理（运营后台）。

规则 JSON 结构与桌面端 story-context-rules.json 对齐（dynasty/culture/genre/setting/
props/characters/time/visualStyle/tone/negativeAnchors/cooking）。运营后台保存的规则
为「运营配置」，导出后合入桌面仓库随包发布，或经 <userData>/config/story-context-rules.json
覆盖加载（桌面端 validateContextRules 负责最终校验）。
"""
import datetime
import json
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import SceneContextRules

DEFAULT_KEY = "default"
TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "scene_context_rules.template.json")

_REQUIRED_KEYWORD_RULES = {
    "dynasty": ["keywords", "name", "period", "visualStyle", "era"],
    "culture": ["keywords", "culture", "regions"],
    "genre": ["keywords", "genre"],
    "setting": ["keywords", "setting"],
    "visualStyle": ["keywords", "style"],
    "tone": ["keywords", "tone"],
}


class SceneContextRulesError(ValueError):
    """规则校验/存储错误（400）。"""


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _is_str_list(value) -> bool:
    return isinstance(value, list) and len(value) > 0 and all(isinstance(x, str) and x.strip() for x in value)


def validate_rules(rules) -> dict:
    """与桌面端 validateContextRules 对齐的结构校验（fail-fast，逐项 path+message）。"""
    errors = []
    push = lambda p, m: errors.append({"path": p, "message": m})  # noqa: E731
    if not isinstance(rules, dict):
        return {"ok": False, "errors": [{"path": "", "message": "规则必须是对象"}]}
    if not isinstance(rules.get("version"), int) or rules["version"] < 1:
        push("version", "version 必须为正整数")
    for key, required in _REQUIRED_KEYWORD_RULES.items():
        items = rules.get(key)
        if not isinstance(items, list):
            push(key, "必须为数组")
            continue
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                push(f"{key}[{i}]", "项必须是对象")
                continue
            for field in required:
                if field == "keywords":
                    if not _is_str_list(item.get(field)):
                        push(f"{key}[{i}].keywords", "keywords 必须为非空字符串数组")
                elif field == "regions":
                    if not isinstance(item.get(field), list):
                        push(f"{key}[{i}].regions", "regions 必须为数组")
                elif not isinstance(item.get(field), str) or not item[field].strip():
                    push(f"{key}[{i}].{field}", "必须为非空字符串")
            if key == "dynasty" and item.get("era") not in ("ancient", "modern"):
                push(f"dynasty[{i}].era", "era 必须为 ancient 或 modern")
    characters = rules.get("characters")
    if not isinstance(characters, list):
        push("characters", "必须为数组")
    elif any(not isinstance(x, str) or not x.strip() for x in characters):
        push("characters", "每项必须为非空字符串")
    time = rules.get("time")
    if not isinstance(time, dict):
        push("time", "必须为对象")
    else:
        for k in ("timeOfDay", "season"):
            if not isinstance(time.get(k), list):
                push(f"time.{k}", "必须为数组")
    for key in ("props", "negativeAnchors", "cooking"):
        if not isinstance(rules.get(key), dict):
            push(key, "必须为对象")
    props = rules.get("props")
    if isinstance(props, dict):
        for side in ("ancient", "modern"):
            items = props.get(side)
            if not isinstance(items, list):
                push(f"props.{side}", "必须为数组")
            else:
                for i, item in enumerate(items):
                    if not isinstance(item, dict) or not _is_str_list(item.get("keywords")):
                        push(f"props.{side}[{i}].keywords", "keywords 必须为非空字符串数组")
    neg = rules.get("negativeAnchors")
    if isinstance(neg, dict):
        for side in ("ancient", "modern"):
            items = neg.get(side)
            if not isinstance(items, list):
                push(f"negativeAnchors.{side}", "必须为数组")
            elif any(not isinstance(x, str) or not x.strip() for x in items):
                push(f"negativeAnchors.{side}", "每项必须为非空字符串")
    cooking = rules.get("cooking")
    if isinstance(cooking, dict):
        for sub in ("positiveProps", "negativeAnchors"):
            obj = cooking.get(sub)
            if not isinstance(obj, dict):
                push(f"cooking.{sub}", "必须为对象")
                continue
            for side in ("ancient", "modern"):
                if not isinstance(obj.get(side), list):
                    push(f"cooking.{sub}.{side}", "必须为数组")
    return {"ok": len(errors) == 0, "errors": errors}


def load_template() -> dict:
    """内置模板（运营编辑基线）：读取 ops-center 随附 template JSON。"""
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _to_dict(row: SceneContextRules) -> dict:
    try:
        rules = json.loads(row.content or "null")
    except (json.JSONDecodeError, TypeError):
        rules = None
    return {
        "key": row.key,
        "version": row.version or 1,
        "rules": rules,
        "source": "db",
        "updated_at": row.updated_at,
        "updated_by": row.updated_by or "",
    }


async def get_rules(db: AsyncSession) -> dict:
    row = (await db.execute(select(SceneContextRules).where(SceneContextRules.key == DEFAULT_KEY))).scalar_one_or_none()
    if row is None:
        return {
            "key": DEFAULT_KEY,
            "version": 0,
            "rules": load_template(),
            "source": "template",
            "updated_at": None,
            "updated_by": "",
            "note": "未配置：当前使用随包内置规则，可基于模板编辑并保存为运营配置",
        }
    return _to_dict(row)


async def save_rules(db: AsyncSession, body: dict, updated_by: str) -> dict:
    rules = body.get("rules") if isinstance(body, dict) else None
    if not isinstance(rules, dict):
        raise SceneContextRulesError("rules 必须是对象")
    validation = validate_rules(rules)
    if not validation["ok"]:
        raise SceneContextRulesError("规则校验失败: " + "; ".join(f"{e['path']} {e['message']}" for e in validation["errors"][:5]))
    row = (await db.execute(select(SceneContextRules).where(SceneContextRules.key == DEFAULT_KEY))).scalar_one_or_none()
    now = _now()
    if row is None:
        row = SceneContextRules(key=DEFAULT_KEY, version=1, content=json.dumps(rules, ensure_ascii=False), updated_at=now, updated_by=updated_by)
        db.add(row)
    else:
        row.version = (row.version or 0) + 1
        row.content = json.dumps(rules, ensure_ascii=False)
        row.updated_at = now
        row.updated_by = updated_by
    await db.commit()
    return await get_rules(db)


async def export_rules(db: AsyncSession) -> dict:
    current = await get_rules(db)
    return {
        "rules": current["rules"],
        "version": current["version"],
        "source": current["source"],
        "exported_at": _now(),
        "note": "将 rules 导出为 JSON 后：合入桌面仓库 apps/desktop/electron/services/story-context-rules.json（随包）或放置 <userData>/config/story-context-rules.json（配置覆盖，桌面端校验失败回退内置）",
    }

