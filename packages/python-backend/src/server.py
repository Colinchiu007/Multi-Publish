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
import logging
import os
import platform as platform_module
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from multi_publish.auth import AuthError, LogtoJwtVerifier, create_fastapi_dependency
from multi_publish.core.logging_setup import setup_logging
from multi_publish.core.publisher_manager import PublisherManager
from multi_publish.models import PLATFORM_META, PlatformType, PublishPhase
from multi_publish.publishers.account_paths import build_account_storage_paths
from multi_publish.video_creation.pipeline.loader import list_pipelines, load_pipeline

app = FastAPI(title="Multi-Publish Backend", version="1.0.0")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} 必须是明确的布尔值（true/false、1/0、yes/no 或 on/off）")


IDENTITY_AUTH_ENABLED = _env_bool("IDENTITY_AUTH_ENABLED")
IDENTITY_AUTH_REQUIRED = _env_bool("IDENTITY_AUTH_REQUIRED")


def _logto_issuer() -> str:
    configured = os.environ.get("LOGTO_ISSUER") or os.environ.get("LOGTO_ENDPOINT", "")
    configured = configured.rstrip("/")
    return configured if configured.endswith("/oidc") else f"{configured}/oidc"


def _build_identity_verifier() -> LogtoJwtVerifier | None:
    if not IDENTITY_AUTH_ENABLED and not IDENTITY_AUTH_REQUIRED:
        return None
    issuer = _logto_issuer()
    audience = os.environ.get("LOGTO_API_RESOURCE", "").strip()
    if not issuer or issuer == "/oidc" or not audience:
        return None
    trusted_hosts = frozenset(
        item.strip().lower()
        for item in os.environ.get("LOGTO_TRUSTED_JWKS_HOSTS", "").split(",")
        if item.strip()
    )
    try:
        return LogtoJwtVerifier(
            issuer=issuer,
            audience=audience,
            cache_ttl_seconds=max(1, int(os.environ.get("LOGTO_JWKS_CACHE_TTL", "300"))),
            trusted_jwks_hosts=trusted_hosts,
        )
    except (AuthError, ValueError):
        return None


IDENTITY_VERIFIER = _build_identity_verifier()


def _identity_dependency(required_scopes: list[str]):
    async def dependency(request: Request) -> dict[str, Any] | None:
        if not IDENTITY_AUTH_ENABLED and not IDENTITY_AUTH_REQUIRED:
            return None
        has_token = bool(request.headers.get("authorization"))
        if not IDENTITY_AUTH_REQUIRED and not has_token:
            return None
        if IDENTITY_VERIFIER is None:
            raise HTTPException(status_code=503, detail="AUTH_CONFIG_INVALID")
        return await create_fastapi_dependency(IDENTITY_VERIFIER, required_scopes)(request)

    return dependency


_require_publish_read = _identity_dependency(["publish:read"])
_require_publish_submit = _identity_dependency(["publish:submit"])
_require_account_manage = _identity_dependency(["account:manage"])

app.add_middleware(
    CORSMiddleware,
    # 安全收紧：仅允许本地 Electron 开发服务器跨域（生产走 IPC 不走 HTTP）
    # 原 allow_origins=["*"] + allow_credentials=True 等同于"任意源可携凭证跨域访问"
    # 攻击链：恶意网页 → GET /api/accounts/{id}/cookies → 窃取用户平台 Cookie
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── 全局状态 ───────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_DIR = DATA_DIR.parent / "logs"

setup_logging(log_dir=str(LOG_DIR))
logger = logging.getLogger(__name__)

publisher_mgr = PublisherManager(data_dir=str(DATA_DIR))

# 内存中的发布任务记录（重启丢失，正式用 DB）
_publish_tasks: dict[str, dict] = {}

# 发布进度记录（支持前端轮询）
_publish_progress: dict[str, dict] = {}


async def _progress_callback(task_id: str, platform: str, phase: PublishPhase, message: str, percent: int):
    """后端内部进度回调，记录到 _publish_progress"""
    owner_subject = _publish_progress.get(task_id, {}).get("owner_subject")
    _publish_progress[task_id] = {
        "task_id": task_id,
        "platform": platform,
        "phase": phase.value,
        "percent": percent,
        "message": message,
        "updated_at": datetime.now().isoformat(),
        "owner_subject": owner_subject,
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
    account_id: str | None = None  # P1-2: Per-Account Session 隔离
    proxy: dict | None = None  # P2-1: SOCKS5 代理配置 {server, username?, password?}


class LoginRequest(BaseModel):
    platform: str


class HealthResponse(BaseModel):
    status: str
    version: str
    platform: str


# ─── 简易 AccountStore（JSON 文件存储）──────────────────────

ACCOUNTS_FILE = DATA_DIR / "accounts.json"


def _load_accounts() -> dict[str, dict]:
    if ACCOUNTS_FILE.exists():
        return json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8-sig"))
    return {}


def _save_accounts(accounts: dict):
    _atomic_write_json(ACCOUNTS_FILE, accounts)


def _atomic_write_json(file_path: Path, payload: Any) -> None:
    """先完整写入同目录临时文件，再原子替换目标文件。"""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = file_path.with_name(f".{file_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary_path, file_path)
        try:
            file_path.chmod(0o600)
        except OSError:
            pass
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def _persist_account_storage(account: dict) -> None:
    """同步单账号认证文件，并确保浏览器数据目录存在。"""
    paths = build_account_storage_paths(DATA_DIR, account["platform"], account["id"])
    auth_data = account.get("auth_data")
    auth_payload = dict(auth_data) if isinstance(auth_data, dict) else {}
    auth_payload["cookies"] = list(account.get("cookies", []))
    auth_payload.setdefault("local_storage", {})
    auth_payload.setdefault("indexed_db", {})

    _atomic_write_json(paths.auth_file, auth_payload)
    _atomic_write_json(paths.cookie_file, list(account.get("cookies", [])))
    paths.browser_dir.mkdir(parents=True, exist_ok=True)


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


def _request_subject(request: Request) -> str | None:
    auth = getattr(request.state, "auth", None)
    subject = auth.get("subject") if isinstance(auth, dict) else None
    return subject if isinstance(subject, str) and subject else None


def _require_authenticated_subject(request: Request) -> str | None:
    """身份灰度期开启后，敏感操作也必须绑定真实 subject。"""
    subject = _request_subject(request)
    if subject:
        return subject
    if IDENTITY_AUTH_ENABLED or IDENTITY_AUTH_REQUIRED:
        raise HTTPException(status_code=401, detail="AUTH_TOKEN_REQUIRED")
    return None


def _is_owned_by(resource: dict, subject: str | None) -> bool:
    # 灰度期匿名请求只能访问尚未归属的旧版资源。
    return resource.get("owner_subject") == subject


def _without_owner(resource: dict) -> dict:
    return {key: value for key, value in resource.items() if key != "owner_subject"}


# ─── 平台路由 ───────────────────────────────────────────────


@app.get("/api/platforms", dependencies=[Depends(_require_publish_read)])
def list_platforms():
    """列出所有支持的平台及状态"""
    results = []
    for ptype, meta in PLATFORM_META.items():
        supported = publisher_mgr.is_supported(ptype)
        results.append(
            {
                "key": ptype.value,
                "name": meta["name"],
                "tech": meta["tech"],
                "publish_type": meta["publish_type"],
                "category": meta.get("category", "unknown"),
                "supported": supported,
            }
        )
    return {"code": 0, "data": results}


# ─── 账号 CRUD 路由 ────────────────────────────────────────


@app.get("/api/accounts", dependencies=[Depends(_require_account_manage)])
def list_accounts(request: Request):
    """返回已配置的账号列表"""
    accounts = _load_accounts()
    subject = _request_subject(request)
    return {"code": 0, "data": [_account_to_dict(a) for a in accounts.values() if _is_owned_by(a, subject)]}


@app.post("/api/accounts", dependencies=[Depends(_require_account_manage)])
def create_account(req: AccountCreateRequest, request: Request):
    """添加新账号（保存 Cookie）"""
    owner_subject = _require_authenticated_subject(request)
    # 验证平台
    try:
        pt = PlatformType(req.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}") from None

    account_id = str(uuid.uuid4())[:8]
    accounts = _load_accounts()
    auth_data = dict(req.auth_data) if isinstance(req.auth_data, dict) else None
    if auth_data is not None:
        auth_data["cookies"] = list(req.cookies)
    account = {
        "id": account_id,
        "platform": pt.value,
        "name": req.name,
        "cookies": list(req.cookies),
        "auth_data": auth_data,
        "is_active": True,
        "last_validated": datetime.now().isoformat(),
        "created_at": datetime.now().isoformat(),
        "owner_subject": owner_subject,
    }
    accounts[account_id] = account
    try:
        _persist_account_storage(account)
        _save_accounts(accounts)
    except Exception:
        paths = build_account_storage_paths(DATA_DIR, pt.value, account_id)
        if paths.account_dir.exists():
            shutil.rmtree(paths.account_dir)
        raise

    return {"code": 0, "message": "账号添加成功", "data": _account_to_dict(account)}


@app.get("/api/accounts/{account_id}", dependencies=[Depends(_require_account_manage)])
def get_account(account_id: str, request: Request):
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a or not _is_owned_by(a, _request_subject(request)):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"code": 0, "data": _account_to_dict(a)}


@app.get("/api/accounts/{account_id}/cookies", dependencies=[Depends(_require_account_manage)])
def get_account_cookies(account_id: str, request: Request):
    """获取账号的 Cookie（用于 Playwright 恢复会话）"""
    subject = _require_authenticated_subject(request)
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a or not _is_owned_by(a, subject):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"code": 0, "data": {"id": a["id"], "platform": a["platform"], "cookies": a.get("cookies", [])}}


@app.put("/api/accounts/{account_id}/cookies", dependencies=[Depends(_require_account_manage)])
def update_account_cookies(account_id: str, req: AccountCreateRequest, request: Request):
    """更新账号 Cookie（重新登录后）"""
    subject = _require_authenticated_subject(request)
    accounts = _load_accounts()
    a = accounts.get(account_id)
    if not a or not _is_owned_by(a, subject):
        raise HTTPException(status_code=404, detail="账号不存在")
    a["cookies"] = list(req.cookies)
    if isinstance(a.get("auth_data"), dict):
        a["auth_data"] = {**a["auth_data"], "cookies": list(req.cookies)}
    a["last_validated"] = datetime.now().isoformat()
    _persist_account_storage(a)
    _save_accounts(accounts)
    return {"code": 0, "message": "Cookie 更新成功"}


@app.delete("/api/accounts/{account_id}", dependencies=[Depends(_require_account_manage)])
def delete_account(account_id: str, request: Request):
    subject = _require_authenticated_subject(request)
    accounts = _load_accounts()
    account = accounts.get(account_id)
    if not account or not _is_owned_by(account, subject):
        raise HTTPException(status_code=404, detail="账号不存在")
    paths = build_account_storage_paths(DATA_DIR, account["platform"], account_id)
    if paths.account_dir.exists():
        shutil.rmtree(paths.account_dir)
    del accounts[account_id]
    _save_accounts(accounts)
    return {"code": 0, "message": "账号已删除"}


# ─── 登录路由 ───────────────────────────────────────────────


@app.post("/api/login", dependencies=[Depends(_require_account_manage)])
async def login(req: LoginRequest, request: Request):
    """
    启动平台登录流程（RPA）

    打开浏览器窗口 → 用户手动登录（扫码） → 捕获 Cookie → 返回

    前端应该：
    1. 调用此接口
    2. 收到 200 后显示「请在浏览器中登录」
    3. 轮询 /api/accounts/{id}/cookies 确认登录完成
    """
    owner_subject = _require_authenticated_subject(request)
    try:
        pt = PlatformType(req.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}") from None

    if not publisher_mgr.is_supported(pt):
        raise HTTPException(status_code=400, detail=f"平台 {pt.value} 暂不支持 RPA 登录")

    # 在后台启动登录
    account_id = str(uuid.uuid4())[:8]
    success = await publisher_mgr.login_to_platform(pt, account_id=account_id)

    if not success:
        raise HTTPException(status_code=408, detail="登录超时或失败")

    # 读取刚保存的认证数据
    auth_data = None
    account_paths = build_account_storage_paths(DATA_DIR, pt.value, account_id)
    if account_paths.auth_file.exists():
        auth_data = json.loads(account_paths.auth_file.read_text(encoding="utf-8"))

    # 兼容旧格式：仅 cookies
    cookies = []
    if account_paths.cookie_file.exists():
        cookies = json.loads(account_paths.cookie_file.read_text(encoding="utf-8"))
    elif auth_data and auth_data.get("cookies"):
        cookies = auth_data["cookies"]

    # 自动创建/更新账号记录
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
        "owner_subject": owner_subject,
    }
    _save_accounts(accounts)

    ls_count = len(auth_data.get("local_storage", {})) if auth_data else 0
    idb_count = (
        sum(len(v) for v in auth_data.get("indexed_db", {}).values())
        if auth_data and auth_data.get("indexed_db")
        else 0
    )

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


@app.get("/api/auth-status/{platform}", dependencies=[Depends(_require_account_manage)])
async def auth_status(platform: str, account_id: str, request: Request):
    """检查平台认证状态"""
    try:
        pt = PlatformType(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}") from None

    account = _load_accounts().get(account_id)
    if (
        not account
        or account.get("platform") != pt.value
        or not _is_owned_by(account, _request_subject(request))
    ):
        raise HTTPException(status_code=404, detail="账号不存在")

    ok = await publisher_mgr.get_auth_status(pt, account_id=account_id)
    return {"code": 0, "data": {"platform": platform, "valid": ok}}


# ─── 发布路由 ───────────────────────────────────────────────


@app.post("/api/publish", dependencies=[Depends(_require_publish_submit)])
async def publish(req: PublishRequest, request: Request):
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
        raise HTTPException(status_code=400, detail=f"不支持的平台: {req.platform}") from None

    owner_subject = _request_subject(request)
    if req.account_id:
        owner_subject = _require_authenticated_subject(request)
    if owner_subject and not req.account_id:
        raise HTTPException(status_code=400, detail="ACCOUNT_REQUIRED")
    if owner_subject and req.account_id:
        account = _load_accounts().get(req.account_id)
        if (
            not account
            or not _is_owned_by(account, owner_subject)
            or account.get("platform") != req.platform
        ):
            raise HTTPException(status_code=404, detail="账号不存在")

    if not publisher_mgr.is_supported(pt):
        raise HTTPException(status_code=400, detail=f"平台 {pt.value} 暂不支持发布")

    # 执行发布
    task_id = str(uuid.uuid4())[:8]
    _publish_tasks[task_id] = {"status": "running", "platform": req.platform, "owner_subject": owner_subject}
    _publish_progress[task_id] = {
        "task_id": task_id,
        "platform": req.platform,
        "phase": "preparing",
        "percent": 0,
        "message": "准备中...",
        "owner_subject": owner_subject,
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
                "owner_subject": owner_subject,
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
            "owner_subject": owner_subject,
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
                "owner_subject": owner_subject,
            }
        else:
            _publish_progress[task_id] = {
                "task_id": task_id,
                "platform": req.platform,
                "phase": "failed",
                "percent": 100,
                "message": result.error or "发布失败",
                "owner_subject": owner_subject,
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
        logger.error("发布任务执行失败: %s", type(e).__name__)
        _publish_tasks[task_id] = {
            "status": "failed",
            "platform": req.platform,
            "error": "PUBLISH_FAILED",
            "owner_subject": owner_subject,
        }
        raise HTTPException(status_code=500, detail="PUBLISH_FAILED") from e


@app.get("/api/publish/{task_id}/status", dependencies=[Depends(_require_publish_read)])
def publish_status(task_id: str, request: Request):
    """查询发布任务状态"""
    task = _publish_tasks.get(task_id)
    if not task or not _is_owned_by(task, _request_subject(request)):
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"code": 0, "data": _without_owner(task)}


@app.get("/api/publish/{task_id}/progress", dependencies=[Depends(_require_publish_read)])
def publish_progress(task_id: str, request: Request):
    """查询发布进度（前端轮询用）"""
    progress = _publish_progress.get(task_id)
    subject = _request_subject(request)
    if progress and not _is_owned_by(progress, subject):
        raise HTTPException(status_code=404, detail="任务不存在")
    if not progress:
        # 查找 task status 作为 fallback
        task = _publish_tasks.get(task_id)
        if not task or not _is_owned_by(task, subject):
            raise HTTPException(status_code=404, detail="任务不存在")
        return {
            "code": 0,
            "data": {"task_id": task_id, "phase": task.get("status", "unknown"), "percent": 0, "message": ""},
        }
    return {"code": 0, "data": _without_owner(progress)}


# ─── 视频创作流水线路由 ─────────────────────────────────────


@app.get("/api/pipelines", dependencies=[Depends(_require_publish_read)])
def get_pipelines():
    """列出所有可用流水线"""
    try:
        names = list_pipelines()
        pipelines = []
        for name in names:
            try:
                info = load_pipeline(name)
                pipelines.append(
                    {
                        "name": name,
                        "description": info.get("description", ""),
                        "version": info.get("version", ""),
                        "category": info.get("category", ""),
                        "stability": info.get("stability", ""),
                    }
                )
            except Exception:
                pipelines.append({"name": name, "description": "", "version": "", "category": "", "stability": ""})
        return {"code": 0, "data": pipelines}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/pipelines/{name}", dependencies=[Depends(_require_publish_read)])
def get_pipeline_detail(name: str):
    """获取单个流水线详情"""
    try:
        info = load_pipeline(name)
        return {"code": 0, "data": info}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"流水线未找到: {name}") from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ─── 其他路由 ───────────────────────────────────────────────


@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        platform=platform_module.system(),
    )


# ─── 主入口 ─────────────────────────────────────────────────




# --- AI ?? API (Phase 2) ---

@app.post('/api/ai/generate', dependencies=[Depends(_require_publish_submit)])
async def ai_generate(data: dict):
    return {'success': True, 'message': 'AI generation queued'}

@app.get('/api/ai/providers', dependencies=[Depends(_require_publish_read)])
async def list_ai_providers():
    return {'success': True, 'providers': []}

# --- ???? API (Phase 2) ---

@app.post('/api/video/process', dependencies=[Depends(_require_publish_submit)])
async def video_process(data: dict):
    return {'success': True, 'message': 'Processing ' + data.get('type', 'unknown')}

@app.post('/api/video/analyze', dependencies=[Depends(_require_publish_submit)])
async def video_analyze(data: dict):
    return {'success': True, 'message': 'Analyzing ' + data.get('type', 'unknown')}

@app.post('/api/video/mix-audio', dependencies=[Depends(_require_publish_submit)])
async def video_mix_audio(data: dict):
    return {'success': True, 'message': 'Audio mixing queued'}

@app.post('/api/video/search-stock', dependencies=[Depends(_require_publish_read)])
async def video_search_stock(data: dict):
    return {'success': True, 'message': 'Searching ' + data.get('source', '')}

@app.post('/api/video/generate-subtitle', dependencies=[Depends(_require_publish_submit)])
async def video_generate_subtitle(data: dict):
    return {'success': True, 'message': 'Subtitle generation'}

@app.get('/api/video/status', dependencies=[Depends(_require_publish_read)])
async def video_status():
    import shutil
    return {'ffmpegAvailable': shutil.which('ffmpeg') is not None, 'success': True}
def main():
    port = int(os.environ.get("BACKEND_PORT", "8299"))
    print(f"[Multi-Publish] Backend starting on port {port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
