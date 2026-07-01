"""
Multi-Publish Python Backend — FastAPI 服务
通过 HTTP 与 Electron 主进程通信

提供：
- 平台账号 CRUD（Cookie 管理）
- 登录流程（RPA 浏览器自动化）
- 发布流程（Playwright RPA / API）
- 健康检查
"""
import json
import os
import platform as platform_module
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from multi_publish.models import PlatformType, PLATFORM_META, PublishPhase
from multi_publish.core.publisher_manager import PublisherManager

app = FastAPI(title="Multi-Publish Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 全局状态 ───────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_DIR = DATA_DIR.parent / 'logs'

from multi_publish.core.logging_setup import setup_logging
setup_logging(log_dir=str(LOG_DIR))

publisher_mgr = PublisherManager(data_dir=str(DATA_DIR))

# 内存中的发布任务记录（重启丢失，正式用 DB）
_publish_tasks: dict[str, dict] = {}

# 发布进度记录（支持前端轮询）
_publish_progress: dict[str, dict] = {}


async def _progress_callback(task_id: str, platform: str, phase: PublishPhase, message: str, percent: int):
    """后端内部进度回调，记录到 _publish_progress"""
    _publish_progress[task_id] = {
        "task_id": task_id,
        "platform": platform,
        "phase": phase.value,
        "percent": percent,
        "message": message,
        "updated_at": datetime.now().isoformat(),
    }


# ─── 数据模型 ───────────────────────────────────────────────

class AccountCreateRequest(BaseModel):
    platform: str
    name: str
    cookies: list[dict] = []
    auth_data: dict | None = None  # {cookies, local_storage, indexed_db} 完整认证数据


class PublishRequest(BaseModel):
    title: str
    content: str = ""
    platform: str = "douyin"
    media_paths: list[str] = []
    cover_path: str | None = None
    tags: list[str] = []
    draft: bool = False
    account_id: str | None = None      # P1-2: Per-Account Session 隔离
    proxy: dict | None = None          # P2-1: SOCKS5 代理配置 {server, username?, password?}


class LoginRequest(BaseModel):
    platform: str


class HealthResponse(BaseModel):
    status: str
    version: str
    platform: str


# ─── 简易 AccountStore（JSON 文件存储）──────────────────────

ACCOUNTS_FILE = DATA_DIR / 'accounts.json'


def _load_accounts() -> dict[str, dict]:
    if ACCOUNTS_FILE.exists():
        return json.loads(ACCOUNTS_FILE.read_text())
    return {}


def _save_accounts(accounts: dict):
    ACCOUNTS_FILE.write_text(json.dumps(accounts, ensure_ascii=False, indent=2))


def _account_to_dict(a: dict) -> dict:
    return {
        "id": a["id"],
        "platform": a["platform"],
        "name": a["name"],
        "is_active": a.get("is_active", True),
        "has_cookies": len(a.get("cookies", [])) > 0,
        "cookie_count": len(a.get("cookies", [])),
        "has_auth_data": a.get("auth_data") is not None,
        "last_validated": a.get("last_validated"),
        "created_at": a.get("created_at"),
    }


# ─── 平台路由 ───────────────────────────────────────────────

@app.get("/api/platforms")
def list_platforms():
    """列出所有支持的平台及状态"""
    results = []
    for ptype, meta in PLATFORM_META.items():
        supported = publisher_mgr.is_supported(ptype)
        results.append({
            "key": ptype.value,
            "name": meta["name"],
            "tech": meta["tech"],
            "publish_type": meta["publish_type"],
            "category": meta.get("category", "unknown"),
            "supported": supported,
        })
    return {"code": 0, "data": results}


# ─── 账号 CRUD 路由 ────────────────────────────────────────

@app.get("/api/accounts")
def list_accounts():
    """返回已配置的账号列表"""
    accounts = _load_accounts()
    return {
        "code": 0,
        "data": [_account_to_dict(a) for a in accounts.values()]
    }


@app.post("/api/accounts")
def create_account(req: AccountCreateRequest):
    """添加新账号（保存 Cookie）"""
    # 验证平台
    try:
        pt = PlatformType(req.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}")

    account_id = str(uuid.uuid4())[:8]
    accounts = _load_accounts()
    accounts[account_id] = {
        "id": account_id,
        "platform": pt.value,
        "name": req.name,
        "cookies": req.cookies,
        "auth_data": req.auth_data,
        "is_active": True,
        "last_validated": datetime.now().isoformat(),
        "created_at": datetime.now().isoformat(),
    }
    _save_accounts(accounts)

    return {"code": 0, "message": "账号添加成功", "data": _account_to_dict(accounts[account_id])}


@app.get("/api/accounts/{account_id}")
def get_account(account_id: str):
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"code": 0, "data": _account_to_dict(a)}


@app.get("/api/accounts/{account_id}/cookies")
def get_account_cookies(account_id: str):
    """获取账号的 Cookie（用于 Playwright 恢复会话）"""
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"code": 0, "data": {"id": a["id"], "platform": a["platform"], "cookies": a.get("cookies", [])}}


@app.put("/api/accounts/{account_id}/cookies")
def update_account_cookies(account_id: str, req: AccountCreateRequest):
    """更新账号 Cookie（重新登录后）"""
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a:
        raise HTTPException(status_code=404, detail="账号不存在")
    a["cookies"] = req.cookies
    a["last_validated"] = datetime.now().isoformat()
    _save_accounts(accounts)
    return {"code": 0, "message": "Cookie 更新成功"}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: str):
    accounts = _load_accounts()
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="账号不存在")
    del accounts[account_id]
    _save_accounts(accounts)
    return {"code": 0, "message": "账号已删除"}


# ─── 登录路由 ───────────────────────────────────────────────

@app.post("/api/login")
async def login(req: LoginRequest):
    """
    启动平台登录流程（RPA）

    打开浏览器窗口 → 用户手动登录（扫码） → 捕获 Cookie → 返回

    前端应该：
    1. 调用此接口
    2. 收到 200 后显示「请在浏览器中登录」
    3. 轮询 /api/accounts/{id}/cookies 确认登录完成
    """
    try:
        pt = PlatformType(req.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}")

    if not publisher_mgr.is_supported(pt):
        raise HTTPException(status_code=400, detail=f"平台 {pt.value} 暂不支持 RPA 登录")

    # 在后台启动登录
    success = await publisher_mgr.login_to_platform(pt)

    if not success:
        raise HTTPException(status_code=408, detail="登录超时或失败")

    # 读取刚保存的认证数据
    auth_data = None
    auth_file = os.path.join(str(DATA_DIR), f"auth_{pt.value}.json")
    if os.path.exists(auth_file):
        auth_data = json.loads(Path(auth_file).read_text())

    # 兼容旧格式：仅 cookies
    cookie_path = os.path.join(str(DATA_DIR), f"cookies_{pt.value}.json")
    cookies = []
    if os.path.exists(cookie_path):
        cookies = json.loads(Path(cookie_path).read_text())
    elif auth_data and auth_data.get("cookies"):
        cookies = auth_data["cookies"]

    # 自动创建/更新账号记录
    account_id = str(uuid.uuid4())[:8]
    accounts = _load_accounts()
    accounts[account_id] = {
        "id": account_id,
        "platform": pt.value,
        "name": PLATFORM_META[pt]["name"],
        "cookies": cookies,
        "auth_data": auth_data,
        "is_active": True,
        "last_validated": datetime.now().isoformat(),
        "created_at": datetime.now().isoformat(),
    }
    _save_accounts(accounts)

    ls_count = len(auth_data.get("local_storage", {})) if auth_data else 0
    idb_count = sum(len(v) for v in auth_data.get("indexed_db", {}).values()) if auth_data and auth_data.get("indexed_db") else 0

    return {
        "code": 0,
        "message": "登录成功",
        "data": {
            "account_id": account_id,
            "cookie_count": len(cookies),
            "local_storage_count": ls_count,
            "indexed_db_count": idb_count,
            "auth_complete": bool(auth_data and auth_data.get("local_storage")),
        },
    }


@app.get("/api/auth-status/{platform}")
async def auth_status(platform: str):
    """检查平台认证状态"""
    try:
        pt = PlatformType(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")

    ok = await publisher_mgr.get_auth_status(pt)
    return {"code": 0, "data": {"platform": platform, "valid": ok}}


# ─── 发布路由 ───────────────────────────────────────────────

@app.post("/api/publish")
async def publish(req: PublishRequest):
    """
    发布内容到平台

    RPA 流程：
    1. 加载 Cookie（从最近登录的账号）
    2. 打开浏览器到上传页
    3. 上传视频/图片
    4. 填写标题/标签/简介
    5. 点击发布
    """
    try:
        pt = PlatformType(req.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}")

    if not publisher_mgr.is_supported(pt):
        raise HTTPException(status_code=400, detail=f"平台 {pt.value} 暂不支持发布")

    # 执行发布
    task_id = str(uuid.uuid4())[:8]
    _publish_tasks[task_id] = {"status": "running", "platform": req.platform}
    _publish_progress[task_id] = {
        "task_id": task_id,
        "platform": req.platform,
        "phase": "preparing",
        "percent": 0,
        "message": "准备中...",
    }

    try:
        # 创建进度回调（写入 _publish_progress 供前端轮询）
        async def _on_progress(phase: PublishPhase, message: str, percent: int):
            _publish_progress[task_id] = {
                "task_id": task_id,
                "platform": req.platform,
                "phase": phase.value,
                "percent": percent,
                "message": message,
                "updated_at": datetime.now().isoformat(),
            }

        result = await publisher_mgr.publish_to_platform(
            platform=pt,
            title=req.title,
            content=req.content,
            media_paths=req.media_paths,
            cover_path=req.cover_path,
            tags=req.tags,
            draft=req.draft,
            progress_callback=_on_progress,
            account_id=req.account_id,
            proxy=req.proxy,  # P2-1: SOCKS5 代理
        )

        _publish_tasks[task_id] = {
            "status": "done" if result.success else "failed",
            "platform": req.platform,
            "result": {
                "success": result.success,
                "url": result.url,
                "error": result.error,
                "duration": result.duration,
            },
        }
        if result.success:
            _publish_progress[task_id] = {
                "task_id": task_id,
                "platform": req.platform,
                "phase": "done",
                "percent": 100,
                "message": "发布成功",
            }
        else:
            _publish_progress[task_id] = {
                "task_id": task_id,
                "platform": req.platform,
                "phase": "failed",
                "percent": 100,
                "message": result.error or "发布失败",
            }

        return {
            "code": 0 if result.success else -1,
            "message": "发布成功" if result.success else f"发布失败: {result.error}",
            "data": {
                "task_id": task_id,
                "success": result.success,
                "url": result.url,
                "error": result.error,
                "duration": result.duration,
            },
        }

    except Exception as e:
        _publish_tasks[task_id] = {"status": "failed", "platform": req.platform, "error": str(e)}
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/publish/{task_id}/status")
def publish_status(task_id: str):
    """查询发布任务状态"""
    task = _publish_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"code": 0, "data": task}


@app.get("/api/publish/{task_id}/progress")
def publish_progress(task_id: str):
    """查询发布进度（前端轮询用）"""
    progress = _publish_progress.get(task_id)
    if not progress:
        # 查找 task status 作为 fallback
        task = _publish_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        return {"code": 0, "data": {"task_id": task_id, "phase": task.get("status", "unknown"), "percent": 0, "message": ""}}
    return {"code": 0, "data": progress}


# ─── 其他路由 ───────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        platform=platform_module.system(),
    )


# ─── 主入口 ─────────────────────────────────────────────────

def main():
    port = int(os.environ.get("BACKEND_PORT", "8299"))
    print(f"[Multi-Publish] Backend starting on port {port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()