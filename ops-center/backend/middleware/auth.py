"""JWT authentication middleware — 验证 ops-center 本地签发的 HS256 JWT（OPS_JWT_SECRET，role=admin）。

自包含登录后不再依赖 orchestrator 签发；token 由 routers/auth.py 的 POST /api/auth/login 签发。
（兼容历史 orchestrator 同格式 token，因 secret/算法/payload 形状一致。）"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from config import settings

security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    """Validate JWT token and return payload. 缺头/非 Bearer 统一返回 401。"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")
    try:
        secret = settings.get_jwt_secret()
        payload = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="认证服务配置不完整",
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌无效")


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict | None:
    """Validate JWT token if present; return None when header is absent (双通道端点用，如 scheduler 上报)。"""
    if credentials is None:
        return None
    try:
        secret = settings.get_jwt_secret()
        return jwt.decode(
            credentials.credentials,
            secret,
            algorithms=[settings.jwt_algorithm],
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="认证服务配置不完整",
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌无效")


async def require_admin(user: dict = Depends(get_current_user)):
    """Require admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user

