"""Rewrite AI taste service — 去 AI 味词库管理（ai-taste-ops-center，2026-10-03）。

词库条目（word 主键）的 CRUD/toggle/import/runtime 下发；种子 = 引擎内置词表导出（幂等播种）。
设计决策见 openspec/changes/ai-taste-ops-center/design.md（Q1-Q12 定案）：
- Q2 叠加+键覆盖：内置词表是安全底线，本表同键覆盖；
- Q3 单份可编辑表（无版本化），审计字段随行；
- Q7 enabled=0 = 引擎跳过该词替换（含禁用内置词）；
- Q8 校验判据（拒绝控制字符/纯标点/单字符正则元字符词目）。
"""
import datetime
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import RewriteAiTasteEntry

MAX_WORD_LENGTH = 30
MAX_REPLACEMENT_LENGTH = 50
MAX_DESCRIPTION_LENGTH = 200
MAX_IMPORT_BATCH = 500

_SEVERITY_ENUM = ("S1", "S2", "S3")
# 控制字符（含换行）：word/replacement 一律拒绝（校验判据 Q8）
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
# 纯标点 / 单字符正则元字符词目：语义风险（word='.' 会把每字符当替换点），显式拒绝
# （Python re 不支持 \p{P}；用 Unicode 区段枚举：通用标点/补充标点/CJK 标点/全角形态 + ASCII 标点区）
_PUNCT_ONLY_RE = re.compile(r"^[\s\u2000-\u206f\u2e00-\u2e7f\u3000-\u303f\uff00-\uffef!-/:-@\[-`{-~]+$", re.UNICODE)
_REGEX_META_SINGLE = set(".$*+?()[]{}|\\/")


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


# 种子数据：引擎内置词表（packages/rewrite-engine/src/ai-taste-remover.js AI_PHRASE_MAP，117 条）
# 的一次性导出（severity 按 _severityOf 的 s1Words 分级）。内置表仍是引擎安全底线（Q2 叠加语义），
# 本表初始 = 内置表内容，管理员此后可改替换方向/停用/新增。
SEED_AI_TASTE_ENTRIES = [
    {"word": "扮演着重要角色", "replacement": "作用不小", "severity": "S2"},
    {"word": "本质是", "replacement": "其实是", "severity": "S2"},
    {"word": "本质在于", "replacement": "其实在", "severity": "S2"},
    {"word": "必游之地", "replacement": "值得去的地方", "severity": "S2"},
    {"word": "不断演变", "replacement": "一直在变", "severity": "S2"},
    {"word": "不断演进", "replacement": "一直在变", "severity": "S2"},
    {"word": "不可否认", "replacement": "说实话", "severity": "S1"},
    {"word": "不言而喻", "replacement": "不用多说", "severity": "S1"},
    {"word": "产生深远影响", "replacement": "影响不小", "severity": "S2"},
    {"word": "充满活力", "replacement": "很有劲头", "severity": "S2"},
    {"word": "除此之外", "replacement": "另外", "severity": "S2"},
    {"word": "此外", "replacement": "还有", "severity": "S2"},
    {"word": "从本质上讲", "replacement": "说到底", "severity": "S2"},
    {"word": "从根本上说", "replacement": "说到底", "severity": "S2"},
    {"word": "从某种意义上说", "replacement": "某种程度上", "severity": "S2"},
    {"word": "带来深远影响", "replacement": "影响不小", "severity": "S2"},
    {"word": "当今时代", "replacement": "现在", "severity": "S1"},
    {"word": "当今世界", "replacement": "现在", "severity": "S1"},
    {"word": "发挥着重要作用", "replacement": "作用不小", "severity": "S2"},
    {"word": "关键在于", "replacement": "关键是", "severity": "S2"},
    {"word": "核心在于", "replacement": "关键是", "severity": "S2"},
    {"word": "焕发出新的生机", "replacement": "有了新气象", "severity": "S2"},
    {"word": "近年来", "replacement": "这几年", "severity": "S1"},
    {"word": "具有深远影响", "replacement": "影响不小", "severity": "S2"},
    {"word": "具有重要意义", "replacement": "意义不小", "severity": "S2"},
    {"word": "开创性", "replacement": "头一回", "severity": "S2"},
    {"word": "另一方面", "replacement": "换个角度", "severity": "S2"},
    {"word": "其次", "replacement": "第二", "severity": "S2"},
    {"word": "起到了重要作用", "replacement": "作用不小", "severity": "S2"},
    {"word": "起着关键作用", "replacement": "作用很关键", "severity": "S2"},
    {"word": "取得丰硕成果", "replacement": "成果不少", "severity": "S2"},
    {"word": "取得显著成果", "replacement": "成果挺明显", "severity": "S2"},
    {"word": "取得显著成效", "replacement": "效果挺明显", "severity": "S2"},
    {"word": "取得重大突破", "replacement": "有了大突破", "severity": "S2"},
    {"word": "深入分析", "replacement": "细看", "severity": "S2"},
    {"word": "深入剖析", "replacement": "拆开看", "severity": "S2"},
    {"word": "深入探讨", "replacement": "细聊", "severity": "S2"},
    {"word": "实现高质量发展", "replacement": "发展得不错", "severity": "S2"},
    {"word": "实现共同发展", "replacement": "一起发展", "severity": "S2"},
    {"word": "实现共同繁荣", "replacement": "一起好起来", "severity": "S2"},
    {"word": "实现共同富裕", "replacement": "一起富起来", "severity": "S2"},
    {"word": "实现合作共赢", "replacement": "一起赚", "severity": "S2"},
    {"word": "实现互利共赢", "replacement": "两边都赚", "severity": "S2"},
    {"word": "实现可持续发展", "replacement": "能长久走下去", "severity": "S2"},
    {"word": "实现跨越式发展", "replacement": "发展很快", "severity": "S2"},
    {"word": "实现重大突破", "replacement": "有了大突破", "severity": "S2"},
    {"word": "实现转型升级", "replacement": "转了型", "severity": "S2"},
    {"word": "首先", "replacement": "第一", "severity": "S2"},
    {"word": "随着互联网的普及", "replacement": "现在上网的人多了", "severity": "S1"},
    {"word": "随着经济的快速发展", "replacement": "这些年", "severity": "S1"},
    {"word": "随着科技的发展", "replacement": "这些年", "severity": "S1"},
    {"word": "随着社会的发展", "replacement": "这些年", "severity": "S1"},
    {"word": "随着时代的进步", "replacement": "这些年", "severity": "S1"},
    {"word": "提供了坚实保障", "replacement": "兜住了底", "severity": "S2"},
    {"word": "提供了强大动力", "replacement": "推了一把", "severity": "S2"},
    {"word": "提供了有力保障", "replacement": "兜住了底", "severity": "S2"},
    {"word": "提供了有力支撑", "replacement": "撑住了", "severity": "S2"},
    {"word": "提供了重要保障", "replacement": "兜住了底", "severity": "S2"},
    {"word": "推动高质量发展", "replacement": "把质量提上去", "severity": "S2"},
    {"word": "推动经济高质量发展", "replacement": "把经济质量提上去", "severity": "S2"},
    {"word": "毋庸置疑", "replacement": "毫无疑问", "severity": "S1"},
    {"word": "显而易见", "replacement": "很明显", "severity": "S1"},
    {"word": "需要强调的是", "replacement": "要强调的是", "severity": "S2"},
    {"word": "需要说明的是", "replacement": "要说的是", "severity": "S2"},
    {"word": "需要指出的是", "replacement": "要说的是", "severity": "S2"},
    {"word": "与此同时", "replacement": "同时", "severity": "S2"},
    {"word": "在当今社会", "replacement": "现在", "severity": "S1"},
    {"word": "在当今这个时代", "replacement": "现在", "severity": "S1"},
    {"word": "在当下", "replacement": "现在", "severity": "S1"},
    {"word": "在当下这个时代", "replacement": "现在", "severity": "S1"},
    {"word": "在很大程度上", "replacement": "很大程度上", "severity": "S2"},
    {"word": "在某种程度上", "replacement": "某种程度上", "severity": "S2"},
    {"word": "在如今", "replacement": "现在", "severity": "S1"},
    {"word": "在一定程度上", "replacement": "某种程度上", "severity": "S2"},
    {"word": "展现出勃勃生机", "replacement": "看着很有劲", "severity": "S2"},
    {"word": "展现出独特价值", "replacement": "挺有价值", "severity": "S2"},
    {"word": "展现出独特魅力", "replacement": "挺有味道", "severity": "S2"},
    {"word": "展现出独特优势", "replacement": "挺有优势", "severity": "S2"},
    {"word": "展现出光明前景", "replacement": "前景不错", "severity": "S2"},
    {"word": "展现出广阔前景", "replacement": "前景不错", "severity": "S2"},
    {"word": "展现出巨大潜力", "replacement": "潜力很大", "severity": "S2"},
    {"word": "展现出美好前景", "replacement": "前景不错", "severity": "S2"},
    {"word": "展现出强大生命力", "replacement": "生命力很强", "severity": "S2"},
    {"word": "展现出无限可能", "replacement": "可能性很大", "severity": "S2"},
    {"word": "展现出显著成效", "replacement": "效果挺明显", "severity": "S2"},
    {"word": "真正的价值在于", "replacement": "价值其实在", "severity": "S2"},
    {"word": "真正的意义在于", "replacement": "意义其实在", "severity": "S2"},
    {"word": "值得注意的是", "replacement": "有个细节很有意思", "severity": "S1"},
    {"word": "至关重要", "replacement": "很关键", "severity": "S2"},
    {"word": "至关重要的一点", "replacement": "很关键的一点", "severity": "S2"},
    {"word": "众所周知", "replacement": "大家都知道", "severity": "S1"},
    {"word": "注入了新的动力", "replacement": "添了新劲", "severity": "S2"},
    {"word": "注入了新的活力", "replacement": "添了新劲", "severity": "S2"},
    {"word": "综上所述", "replacement": "说到底", "severity": "S1"},
    {"word": "总而言之", "replacement": "一句话", "severity": "S1"},
    {"word": "最后", "replacement": "再来说", "severity": "S2"},
    {"word": "做出了巨大贡献", "replacement": "帮了大忙", "severity": "S2"},
    {"word": "做出了重要贡献", "replacement": "帮了大忙", "severity": "S2"},
    {"word": "Additionally", "replacement": "Also", "severity": "S2"},
    {"word": "As a result", "replacement": "So", "severity": "S2"},
    {"word": "Consequently", "replacement": "So", "severity": "S2"},
    {"word": "Due to the fact that", "replacement": "Because", "severity": "S2"},
    {"word": "First and foremost", "replacement": "First off", "severity": "S2"},
    {"word": "Furthermore", "replacement": "Plus", "severity": "S2"},
    {"word": "In addition", "replacement": "Also", "severity": "S2"},
    {"word": "In conclusion", "replacement": "Bottom line", "severity": "S2"},
    {"word": "In order to", "replacement": "To", "severity": "S2"},
    {"word": "In today's society", "replacement": "These days", "severity": "S2"},
    {"word": "It is important to note that", "replacement": "Keep in mind", "severity": "S2"},
    {"word": "It is worth noting that", "replacement": "Here's the thing:", "severity": "S2"},
    {"word": "It should be noted that", "replacement": "Note that", "severity": "S2"},
    {"word": "Last but not least", "replacement": "Finally", "severity": "S2"},
    {"word": "Moreover", "replacement": "Also", "severity": "S2"},
    {"word": "Nevertheless", "replacement": "But", "severity": "S2"},
    {"word": "There is a growing concern", "replacement": "More people are worried", "severity": "S2"},
    {"word": "Therefore", "replacement": "So", "severity": "S2"},
    {"word": "With the development of", "replacement": "As things change", "severity": "S2"},
]


def _to_dict(row: RewriteAiTasteEntry) -> dict:
    return {
        "word": row.word,
        "replacement": row.replacement,
        "severity": row.severity,
        "enabled": bool(row.enabled),
        "description": row.description or "",
        "createdAt": row.created_at or "",
        "updatedAt": row.updated_at or "",
        "updatedBy": row.updated_by or "",
    }


# 引擎内置词表（供校验与种子对齐核对；与 packages/rewrite-engine/src/ai-taste-remover.js 同源导出）
BUILTIN_AI_TASTE_SEED = [{"word": e["word"], "replacement": e["replacement"], "severity": e["severity"]} for e in SEED_AI_TASTE_ENTRIES]


def validate_payload(data: dict, *, partial: bool = False) -> tuple[dict | None, str]:
    """创建/更新载荷校验（Q8 判据；控制字符在 strip 前检测，防尾部换行逃过）。partial=True 时允许缺省字段。"""
    if not isinstance(data, dict):
        return None, "请求体必须是 JSON 对象"
    out: dict = {}

    if "word" in data or not partial:
        raw = str(data.get("word") or "")
        # 控制字符在 strip 前检测（strip 会剥掉尾部换行，导致含换行的 word 逃过判据，S6 实测）
        if _CONTROL_RE.search(raw):
            return None, "word 不能包含换行或控制字符"
        word = raw.strip()
        if not word:
            return None, "word 不能为空"
        if len(word) > MAX_WORD_LENGTH:
            return None, f"word 不能超过 {MAX_WORD_LENGTH} 字"
        if _PUNCT_ONLY_RE.match(word) or (len(word) == 1 and word in _REGEX_META_SINGLE):
            return None, f"word 不能是纯标点或单字符正则元字符：{word!r}"
        out["word"] = word

    if "replacement" in data or not partial:
        raw_rep = str(data.get("replacement") or "")
        if _CONTROL_RE.search(raw_rep):
            return None, "replacement 不能包含换行或控制字符"
        rep = raw_rep.strip()
        if not rep:
            return None, "replacement 不能为空"
        if len(rep) > MAX_REPLACEMENT_LENGTH:
            return None, f"replacement 不能超过 {MAX_REPLACEMENT_LENGTH} 字"
        if _CONTROL_RE.search(rep):
            return None, "replacement 不能包含换行或控制字符"
        out["replacement"] = rep

    if "severity" in data or not partial:
        sev = str(data.get("severity") or "")
        if sev not in _SEVERITY_ENUM:
            return None, f"severity 必须是 {'/'.join(_SEVERITY_ENUM)}"
        out["severity"] = sev

    if "enabled" in data:
        out["enabled"] = 1 if data.get("enabled") else 0

    if "description" in data:
        desc = str(data.get("description") or "").strip()
        if len(desc) > MAX_DESCRIPTION_LENGTH:
            return None, f"description 不能超过 {MAX_DESCRIPTION_LENGTH} 字"
        out["description"] = desc

    return out, ""


async def list_entries(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(
            sa.select(RewriteAiTasteEntry)
            .where(RewriteAiTasteEntry.deleted_at.is_(None))
            .order_by(RewriteAiTasteEntry.severity.asc(), RewriteAiTasteEntry.word.asc())
        )
    ).scalars().all()
    return [_to_dict(r) for r in rows]


async def list_runtime_entries(db: AsyncSession) -> list[dict]:
    """runtime 下发形态：全量未删条目（含 enabled=0 —— 桌面端需要知道哪些内置词被禁用，Q9/S7）。"""
    rows = (
        await db.execute(
            sa.select(RewriteAiTasteEntry)
            .where(RewriteAiTasteEntry.deleted_at.is_(None))
            .order_by(RewriteAiTasteEntry.word.asc())
        )
    ).scalars().all()
    return [
        {"word": r.word, "replacement": r.replacement, "severity": r.severity, "enabled": bool(r.enabled)}
        for r in rows
    ]


async def create_entry(db: AsyncSession, payload: dict, updated_by: str = "") -> tuple[dict | None, str]:
    safe, err = validate_payload(payload, partial=False)
    if err:
        return None, err
    existing = await db.get(RewriteAiTasteEntry, safe["word"])
    if existing and existing.deleted_at is None:
        return None, f"词目 {safe['word']} 已存在"
    if existing and existing.deleted_at is not None:
        existing.deleted_at = None
        existing.replacement = safe["replacement"]
        existing.severity = safe["severity"]
        existing.enabled = safe.get("enabled", 1)
        existing.description = safe.get("description", "")
        existing.updated_at = _now()
        existing.updated_by = updated_by
        await db.commit()
        await db.refresh(existing)
        return _to_dict(existing), ""
    row = RewriteAiTasteEntry(
        word=safe["word"],
        replacement=safe["replacement"],
        severity=safe["severity"],
        enabled=safe.get("enabled", 1),
        description=safe.get("description", ""),
        created_at=_now(),
        updated_at=_now(),
        updated_by=updated_by,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return None, f"词目 {safe['word']} 已存在"
    await db.refresh(row)
    return _to_dict(row), ""


async def update_entry(db: AsyncSession, word: str, payload: dict, updated_by: str = "") -> tuple[dict | None, str]:
    row = await db.get(RewriteAiTasteEntry, word)
    if not row or row.deleted_at is not None:
        return None, "词目不存在"
    safe, err = validate_payload(payload, partial=True)
    if err:
        return None, err
    for k in ("replacement", "severity", "description"):
        if k in safe:
            setattr(row, k, safe[k])
    if "enabled" in safe:
        row.enabled = safe["enabled"]
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return _to_dict(row), ""


async def delete_entry(db: AsyncSession, word: str, updated_by: str = "") -> tuple[bool, str]:
    row = await db.get(RewriteAiTasteEntry, word)
    if not row or row.deleted_at is not None:
        return False, "词目不存在"
    row.deleted_at = _now()
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    return True, ""


async def toggle_entry(db: AsyncSession, word: str, updated_by: str = "") -> tuple[dict | None, str]:
    """启停切换（Q7 主操作）：enabled 1↔0。"""
    row = await db.get(RewriteAiTasteEntry, word)
    if not row or row.deleted_at is not None:
        return None, "词目不存在"
    row.enabled = 0 if row.enabled else 1
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return _to_dict(row), ""


async def import_entries(db: AsyncSession, entries: list, updated_by: str = "") -> tuple[int | None, str]:
    """批量导入（Q 决策：整批原子——任一非法整批拒绝；单批 ≤500）。返回导入条数。"""
    if not isinstance(entries, list):
        return None, "entries 必须是数组"
    if len(entries) == 0:
        return None, "entries 不能为空"
    if len(entries) > MAX_IMPORT_BATCH:
        return None, f"单批不能超过 {MAX_IMPORT_BATCH} 条"
    safe_list = []
    seen_words = set()
    for i, e in enumerate(entries):
        safe, err = validate_payload(e if isinstance(e, dict) else {}, partial=False)
        if err:
            return None, f"第 {i + 1} 条非法：{err}"
        if safe["word"] in seen_words:
            return None, f"第 {i + 1} 条非法：word 重复（{safe['word']}）"
        seen_words.add(safe["word"])
        safe_list.append(safe)
    # 覆盖既有（word 幂等键：同键更新替换方向），软删行恢复
    for safe in safe_list:
        existing = await db.get(RewriteAiTasteEntry, safe["word"])
        if existing:
            existing.deleted_at = None
            existing.replacement = safe["replacement"]
            existing.severity = safe["severity"]
            existing.enabled = safe.get("enabled", 1)
            existing.description = safe.get("description", "")
            existing.updated_at = _now()
            existing.updated_by = updated_by
        else:
            db.add(RewriteAiTasteEntry(
                word=safe["word"],
                replacement=safe["replacement"],
                severity=safe["severity"],
                enabled=safe.get("enabled", 1),
                description=safe.get("description", ""),
                created_at=_now(),
                updated_at=_now(),
                updated_by=updated_by,
            ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return None, "导入冲突，请重试"
    return len(safe_list), ""


async def ensure_rewrite_ai_taste_seeded(db: AsyncSession) -> None:
    """启动时幂等播种：按 word 存在即跳过（不覆盖管理员修改）。"""
    for seed in SEED_AI_TASTE_ENTRIES:
        existing = await db.get(RewriteAiTasteEntry, seed["word"])
        if existing is not None:
            continue
        db.add(RewriteAiTasteEntry(
            word=seed["word"],
            replacement=seed["replacement"],
            severity=seed["severity"],
            enabled=1,
            description="",
            created_at=_now(),
            updated_at=_now(),
            updated_by="seed",
        ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()