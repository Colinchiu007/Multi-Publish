"""Redemption code service — 兑换码签发/吊销/查询（与桌面端 redemption-codes.js HMAC 格式一致）。"""
import datetime
import hashlib
import hmac as _hmac
import secrets

import re

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import RedemptionCode

CODE_PREFIX = "MP"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去易混淆 I/O/0/1（与桌面端一致）
PLANS = ("free", "trial", "pro")
MAX_BATCH = 200
_ISO_RE = re.compile(r"^" + chr(92) + "d{4}-" + chr(92) + "d{2}-" + chr(92) + "d{2}(T" + chr(92) + "d{2}:" + chr(92) + "d{2}(:" + chr(92) + "d{2}(\." + chr(92) + "d+)?)?([+-]" + chr(92) + "d{2}:" + chr(92) + "d{2}|Z)?)?$")


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _random_segment() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(4))


def _signature(payload: str, secret: str) -> str:
    return _hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest().upper()[:4]


def generate_code(secret: str) -> str:
    """生成桌面端可验证的兑换码：MP-RAND-RAND-SIG（HMAC-SHA256 首 4 位大写 hex）。"""
    payload = f"{CODE_PREFIX}-{_random_segment()}-{_random_segment()}"
    return f"{payload}-{_signature(payload, secret)}"


def _mask(code: str) -> str:
    """列表掩码：MP-****-****-ABCD（仅末组可见，完整码不泄露）。"""
    parts = code.split("-")
    if len(parts) != 4:
        return "***"
    return f"{CODE_PREFIX}-" + "-".join(["****"] * 2 + [parts[3]])


def _to_dict(row: RedemptionCode, mask: bool = True) -> dict:
    return {
        "id": row.id,
        "code": _mask(row.code) if mask else row.code,
        "plan": row.plan or "pro",
        "batch_id": row.batch_id or "",
        "status": row.status or "active",
        "expires_at": row.expires_at or "",
        "note": row.note or "",
        "created_at": row.created_at,
        "updated_by": row.updated_by or "",
    }


async def generate_batch(db: AsyncSession, body: dict, updated_by: str, secret: str) -> dict:
    """批量签发兑换码（桌面端格式）；未配置密钥 → 400 fail-closed。"""
    if not secret:
        raise ValueError("未配置 OPS_REDEMPTION_SECRET，无法签发兑换码")
    count = body.get("count", 1)
    if isinstance(count, bool) or not isinstance(count, int) or count < 1 or count > MAX_BATCH:
        raise ValueError(f"count 必须是 1-{MAX_BATCH} 的整数")
    plan = str(body.get("plan") or "pro").strip()
    if plan not in PLANS:
        raise ValueError(f"plan 必须是 {'/'.join(PLANS)} 之一")
    expires_at = str(body.get("expires_at") or "").strip()
    if expires_at:
        if not _ISO_RE.match(expires_at):
            raise ValueError("expires_at 必须是 ISO 时间（如 2027-01-01T00:00:00Z）或留空")
        try:
            parsed = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            raise ValueError("expires_at 必须是 ISO 时间或留空")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        expires_at = parsed.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    note = str(body.get("note") or "").strip()
    if len(note) > 200:
        raise ValueError("note 过长（≤200）")
    batch_id = "rc_" + secrets.token_hex(6)
    now = _now()
    codes = []
    for _ in range(count):
        code = generate_code(secret)
        codes.append(code)
        db.add(RedemptionCode(code=code, plan=plan, batch_id=batch_id, status="active",
                              expires_at=expires_at or None, note=note, created_at=now, updated_by=updated_by))
    await db.commit()
    return {
        "batch_id": batch_id,
        "count": count,
        "codes": codes,  # 签发响应（admin）返回明文，列表端点仍掩码
        "plan": plan, "expires_at": expires_at, "note": note,
    }


async def list_codes(db: AsyncSession, plan: str | None = None, status: str | None = None,
                     limit: int = 100, offset: int = 0) -> dict:
    stmt = sa.select(RedemptionCode).order_by(RedemptionCode.created_at.desc(), RedemptionCode.code)
    count_stmt = sa.select(sa.func.count()).select_from(RedemptionCode)
    if plan:
        stmt = stmt.where(RedemptionCode.plan == plan)
        count_stmt = count_stmt.where(RedemptionCode.plan == plan)
    if status:
        stmt = stmt.where(RedemptionCode.status == status)
        count_stmt = count_stmt.where(RedemptionCode.status == status)
    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return {"items": [_to_dict(r) for r in rows], "count": len(rows), "total": total}


async def revoke_code(db: AsyncSession, code_id: int, updated_by: str) -> bool:
    row = (await db.execute(sa.select(RedemptionCode).where(RedemptionCode.id == code_id))).scalar_one_or_none()
    if row is None:
        return False
    row.status = "revoked"
    row.updated_by = updated_by
    await db.commit()
    return True


async def delete_code(db: AsyncSession, code_id: int, updated_by: str) -> bool:
    row = (await db.execute(sa.select(RedemptionCode).where(RedemptionCode.id == code_id))).scalar_one_or_none()
    if row is None:
        return False
    row.updated_by = updated_by
    await db.delete(row)
    await db.commit()
    return True
