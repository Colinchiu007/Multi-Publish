"""License service — 官方许可证签发/吊销/列表（运营后台管理面）。

桌面端 license-manager 为本地激活，本服务仅管理面先行；
服务端验签接入需商业模式确认后另行设计（不触碰现有 entitlement 合同）。
"""
import datetime
import secrets

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import License

_PLANS = ("free", "trial", "pro")
_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去易混淆字符


def generate_key() -> str:
    groups = []
    for _ in range(4):
        groups.append("".join(secrets.choice(_KEY_ALPHABET) for _ in range(4)))
    return "MP-" + "-".join(groups)


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _status_of(row: License) -> str:
    if row.status == "disabled":
        return "disabled"
    if row.expires_at:
        try:
            exp = datetime.datetime.fromisoformat(row.expires_at.replace("Z", "+00:00"))
            if exp.tzinfo is not None:
                exp = exp.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            if exp < datetime.datetime.utcnow():
                return "expired"
        except ValueError:
            pass
    return "active"


def _to_dict(row: License) -> dict:
    return {
        "id": row.id,
        "license_key": row.license_key,
        "plan": row.plan,
        "device_limit": row.device_limit,
        "expires_at": row.expires_at or "",
        "status": _status_of(row),
        "note": row.note or "",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def validate_license_body(body: dict) -> dict:
    plan = str(body.get("plan") or "").strip()
    if not plan:
        raise ValueError("plan 不能为空")
    if plan not in _PLANS:
        raise ValueError("plan 必须是 free/trial/pro 之一")
    raw_limit = body.get("device_limit")
    if raw_limit is None or str(raw_limit).strip() == "":
        device_limit = 1
    else:
        try:
            device_limit = int(raw_limit)
        except (TypeError, ValueError):
            raise ValueError("device_limit 必须是整数")
        if device_limit < 1:
            raise ValueError("device_limit 必须 ≥ 1")
    expires_at = str(body.get("expires_at") or "").strip()
    if expires_at:
        try:
            dt = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if dt.tzinfo is not None:
                expires_at = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None).isoformat()
        except ValueError:
            raise ValueError("expires_at 必须是 ISO 时间或留空（永久）")
    status = str(body.get("status") or "active").strip()
    if status not in ("active", "disabled"):
        raise ValueError("status 必须是 active/disabled")
    return {
        "plan": plan,
        "device_limit": device_limit,
        "expires_at": expires_at,
        "status": status,
        "note": str(body.get("note") or "").strip()[:200],
    }


async def list_licenses(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(sa.select(License).order_by(License.created_at.desc()))).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_license(db: AsyncSession, body: dict) -> dict:
    data = validate_license_body(body)
    now = _now()
    for _attempt in range(5):
        key = generate_key()
        exists = (await db.execute(sa.select(License).where(License.license_key == key))).scalar_one_or_none()
        if not exists:
            break
    else:
        raise ValueError("生成许可证失败，请重试")
    row = License(license_key=key, plan=data["plan"], device_limit=data["device_limit"],
                  expires_at=data["expires_at"], status=data["status"], note=data["note"],
                  created_at=now, updated_at=now)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def update_license(db: AsyncSession, license_id: int, body: dict) -> dict | None:
    row = (await db.execute(sa.select(License).where(License.id == license_id))).scalar_one_or_none()
    if row is None:
        return None
    data = validate_license_body(body)
    row.plan = data["plan"]
    row.device_limit = data["device_limit"]
    row.expires_at = data["expires_at"]
    row.status = data["status"]
    row.note = data["note"]
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def delete_license(db: AsyncSession, license_id: int) -> bool:
    row = (await db.execute(sa.select(License).where(License.id == license_id))).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True
