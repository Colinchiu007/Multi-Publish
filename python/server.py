"""
Multi-Publish Python Backend — FastAPI 服务
通过 stdio/HTTP 与 Electron 主进程通信
"""
import os
import sys
import json
import platform
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 确保 shared_modules 可导入
SHARED_MODULES = Path(__file__).parent.parent / '..' / 'shared_modules'
sys.path.insert(0, str(SHARED_MODULES.resolve()))

from wechat_mp.account_store import AccountStore
from wechat_mp.models import PlatformAccount, PlatformType

app = FastAPI(title="Multi-Publish Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 全局 AccountStore ────────────────────────────────────
DATA_DIR = Path(__file__).parent / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_PATH = DATA_DIR / 'accounts.json'

# 使用空密码（开发模式），生产环境应从配置文件读取主密码
account_store = AccountStore(str(STORAGE_PATH), master_password="")

# ─── 数据模型 ─────────────────────────────────────────────

class PublishRequest(BaseModel):
    title: str
    content: str          # HTML 正文
    cover_url: str = ""
    author: str = ""
    platform: str = "wechat_mp"
    account_id: str = ""

class HealthResponse(BaseModel):
    status: str
    version: str
    platform: str

class AccountCreateRequest(BaseModel):
    platform: str
    name: str
    cookies: dict[str, Any] = {}

class AccountUpdateCookiesRequest(BaseModel):
    cookies: dict[str, Any]


# ─── 账号 CRUD 路由 ───────────────────────────────────────

def _account_to_dict(account: PlatformAccount) -> dict:
    """将 PlatformAccount 转换为可序列化的字典"""
    # 安全获取已解密的 config（不包含敏感 cookie 值细节）
    config = account.config or {}
    cookies = config.get("cookies", [])
    return {
        "id": account.id,
        "platform": account.platform.value,
        "name": account.name,
        "is_active": account.is_active,
        "has_cookies": len(cookies) > 0,
        "cookie_count": len(cookies),
        "last_validated": account.last_validated.isoformat() if account.last_validated else None,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        # 不返回完整 cookies 给前端，只返回是否存在
    }


@app.get("/api/accounts")
def list_accounts():
    """返回已配置的账号列表"""
    try:
        accounts = account_store.list_accounts()
        return {
            "code": 0,
            "data": [_account_to_dict(a) for a in accounts]
        }
    except Exception as e:
        return {
            "code": -1,
            "message": str(e),
            "data": []
        }


@app.post("/api/accounts")
def create_account(req: AccountCreateRequest):
    """添加新账号"""
    try:
        # 验证平台类型
        try:
            platform_type = PlatformType(req.platform)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}")

        account_id = str(uuid.uuid4())[:8]
        config = {"cookies": req.cookies} if req.cookies else {}

        account = PlatformAccount(
            id=account_id,
            platform=platform_type,
            name=req.name,
            config=config,
            is_active=True,
            created_at=datetime.now(),
        )

        account_store.add_account(account)

        return {
            "code": 0,
            "message": "账号添加成功",
            "data": _account_to_dict(account)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/accounts/{account_id}")
def get_account(account_id: str):
    """获取单个账号详情"""
    account = account_store.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {
        "code": 0,
        "data": _account_to_dict(account)
    }


@app.put("/api/accounts/{account_id}/cookies")
def update_account_cookies(account_id: str, req: AccountUpdateCookiesRequest):
    """更新账号的 cookies（重新登录后）"""
    account = account_store.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    # 更新配置中的 cookies
    config = account.config or {}
    config["cookies"] = req.cookies
    account_store.update_account(account_id, {"config": config})
    
    updated = account_store.get_account(account_id)
    return {
        "code": 0,
        "message": "Cookies 更新成功",
        "data": _account_to_dict(updated)
    }


@app.get("/api/accounts/{account_id}/cookies")
def get_account_cookies(account_id: str):
    """获取账号的 cookies（用于 Playwright 恢复会话）"""
    account = account_store.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    
    account = account_store.get_account(account_id)  # 重新获取，确保有最新数据
    config = account.config or {}
    cookies = config.get("cookies", [])
    
    return {
        "code": 0,
        "data": {
            "id": account.id,
            "platform": account.platform.value,
            "cookies": cookies
        }
    }


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: str):
    """删除账号"""
    success = account_store.delete_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {
        "code": 0,
        "message": "账号已删除"
    }


# ─── 发布相关路由 ─────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version="0.1.0",
        platform=platform.system()
    )

@app.post("/api/publish/{platform}")
def publish_article(platform: str, req: PublishRequest):
    """
    发布文章到指定平台
    实际 RPA 发布由 Electron Node.js 侧的 Playwright 执行
    此 API 为后续扩展预留（纯 API 发布 + RPA 发布适配）
    """
    return {
        "code": 0,
        "message": f"Publish request received for {platform}",
        "data": {
            "title": req.title,
            "platform": platform
        }
    }


# ─── 主入口 ─────────────────────────────────────────────

def main():
    port = int(os.environ.get("BACKEND_PORT", "8299"))
    print(f"[Backend] Starting on port {port}", flush=True)
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()
