"""Auth router — ops-center 本地管理员登录（自包含，不依赖 orchestrator）。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user
from services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginBody, request: Request, db: AsyncSession = Depends(get_db)):
    """本地管理员登录：成功签发 HS256 JWT（role=admin，8h）。"""
    client_ip = request.client.host if request.client else "unknown"
    row, error = await auth_service.authenticate(db, body.username, body.password, client_ip)
    if error:
        if "429" in error:
            raise HTTPException(429, "尝试次数过多，请稍后再试")
        if "503" in error:
            raise HTTPException(503, "未配置管理员账号，请设置 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD")
        raise HTTPException(401, "用户名或密码错误")
    token = auth_service.create_access_token(row.username)
    return {"token": token, "username": row.username, "role": "admin"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    """返回当前登录用户信息（受保护）。"""
    return {"username": user.get("username", user.get("sub")), "role": user.get("role")}