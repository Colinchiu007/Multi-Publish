"""Auth service — ops-center 自包含管理员登录（替代 orchestrator 认证依赖）。

- 密码：PBKDF2-SHA256（随机 salt，200000 迭代），存储格式 pbkdf2_sha256$iterations$salt_hex$hash_hex
- JWT：HS256，OPS_JWT_SECRET，payload {sub, username, role: "admin", exp: now + 8h}
- 限流：内存计数（username+IP），5 次失败锁定 60s（单机可接受；多实例/重启后重置，生产可换 Redis）
- fail-closed：未配置管理员且 admins 表为空 → 503（无默认口令）
"""
import datetime
import hashlib
import hmac
import logging
import secrets

from jose import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import AdminUser

logger = logging.getLogger("ops-center.auth")

PBKDF2_ITERATIONS = 200000
TOKEN_TTL_HOURS = 8
MAX_LOGIN_FAILURES = 5
LOGIN_LOCK_SECONDS = 60
USERNAME_MAX_LEN = 64
PASSWORD_MAX_LEN = 128

# 内存限流：key=username|ip -> {"failures": int, "locked_until": float}
_login_attempts: dict = {}

def _now_ts() -> float:
    return datetime.datetime.now().timestamp()


def _sweep_expired_attempts() -> None:
    """清理已过期的限流记录，避免随机用户名爆破导致内存无界增长。"""
    now = _now_ts()
    expired = [k for k, v in _login_attempts.items() if v["locked_until"] <= now and v["failures"] == 0]
    for k in expired:
        _login_attempts.pop(k, None)


def hash_password(password: str, salt: bytes | None = None, iterations: int = PBKDF2_ITERATIONS) -> str:
    """PBKDF2-SHA256 哈希，返回 pbkdf2_sha256$iterations$salt_hex$hash_hex。"""
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """常量时间校验存储的哈希。"""
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# 用户不存在时用于抹平时耗的 dummy 哈希（任意固定值）
_DUMMY_HASH = hash_password("dummy-password-for-timing")


async def ensure_admin_seeded(db: AsyncSession) -> None:
    """启动时若 admins 表为空且配置了 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD 则创建管理员。"""
    existing = (await db.execute(select(AdminUser))).scalars().first()
    if existing is not None:
        return
    username = (settings.admin_username or "").strip()
    password = (settings.admin_password or "").strip()
    if not username or not password:
        return  # 未配置：登录时 fail-closed
    db.add(AdminUser(username=username, password_hash=hash_password(password)))
    try:
        await db.commit()
    except IntegrityError:
        # 并发启动竞态：另一 worker 已创建同一用户名 → 忽略
        await db.rollback()


def _is_locked(key: str) -> bool:
    entry = _login_attempts.get(key)
    if not entry:
        return False
    if entry["locked_until"] and entry["locked_until"] > _now_ts():
        return True
    return False


def _record_failure(key: str) -> None:
    _sweep_expired_attempts()
    now = _now_ts()
    entry = _login_attempts.get(key) or {"failures": 0, "locked_until": 0}
    if entry["locked_until"] and entry["locked_until"] <= now:
        entry = {"failures": 0, "locked_until": 0}
    entry["failures"] += 1
    if entry["failures"] >= MAX_LOGIN_FAILURES:
        entry["locked_until"] = now + LOGIN_LOCK_SECONDS
        entry["failures"] = 0
    _login_attempts[key] = entry


def _clear_failures(key: str) -> None:
    _login_attempts.pop(key, None)


async def authenticate(db: AsyncSession, username: str, password: str, client_ip: str):
    """校验凭据；返回 (user, err_code, err_detail)。

    err_code: "locked"(429) / "not_configured"(503) / "invalid"(401)；成功时 (user, None, None)。
    """
    # 长度限制：防未认证 PBKDF2 CPU DoS / 内存放大
    if len(username) > USERNAME_MAX_LEN or len(password) > PASSWORD_MAX_LEN:
        return None, "invalid", "用户名或密码错误"

    key = f"{username.strip().lower()}|{client_ip}"
    if _is_locked(key):
        return None, "locked", "尝试次数过多，请稍后再试"

    row = (await db.execute(select(AdminUser).where(AdminUser.username == username.strip()))).scalar_one_or_none()
    if row is None:
        # 抹平时间侧信道：无论用户是否存在都执行一次 PBKDF2 校验
        verify_password(password, _DUMMY_HASH)
        if not settings.admin_username and not settings.admin_password:
            # 未配置管理员（fail-closed）：也计数，防探测
            _record_failure(key)
            logger.warning("login blocked: admin not configured (ip=%s)", client_ip)
            return None, "not_configured", "未配置管理员账号，请设置 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD"
        _record_failure(key)
        logger.warning("login failed: unknown user (username=%s, ip=%s)", username.strip(), client_ip)
        return None, "invalid", "用户名或密码错误"

    if not verify_password(password, row.password_hash):
        _record_failure(key)
        logger.warning("login failed: wrong password (username=%s, ip=%s)", username.strip(), client_ip)
        return None, "invalid", "用户名或密码错误"

    _clear_failures(key)
    logger.info("login ok (username=%s, ip=%s)", username.strip(), client_ip)
    return row, None, None


def create_access_token(username: str) -> str:
    """签发 HS256 JWT（与现有验证中间件同 secret/算法，role=admin）。"""
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": username,
        "username": username,
        "role": "admin",
        "iat": now,
        "exp": now + datetime.timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)