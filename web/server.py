"""
多平台一键发布 — FastAPI Web 服务

提供 REST API + Web UI。
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from loguru import logger
import yaml

# 共享认证模块
try:
    from shared.auth.auth_routes import router as auth_router
    from shared.auth.auth_middleware import get_current_user, get_current_user_optional
    from shared.auth.jwt_handler import create_access_token, create_refresh_token, get_user_from_token
    AUTH_ENABLED = True
except ImportError:
    # 如果共享认证模块不可用，使用内置简易认证
    AUTH_ENABLED = False
    logger.warning("共享认证模块未找到，使用内置简易认证模式")

from multi_publish import PublisherManager, PlatformType, TaskStatus, AccountStore
from multi_publish.core import TaskQueue, PublishScheduler
from multi_publish.crypto import get_crypto
from multi_publish.models import PublishTask, PublishResult, PlatformAccount
from multi_publish.publishers import WeChatPublisher


# ========== 配置加载 ==========

def load_config() -> dict:
    """加载配置文件"""
    config_path = Path(__file__).parent.parent / "config" / "config.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    return {}


# ========== 全局状态 ==========

class AppState:
    """应用全局状态"""
    publisher_manager: PublisherManager
    task_queue: TaskQueue
    scheduler: PublishScheduler
    account_store: AccountStore
    ws_connections: set[WebSocket]

    def __init__(self):
        self.publisher_manager = PublisherManager()
        self.ws_connections = set()

    async def init(self, config: dict):
        """初始化"""
        # 获取主密码（从配置或环境变量）
        master_password = config.get("crypto", {}).get("master_password", "")
        if not master_password:
            logger.warning("未配置 master_password，使用开发模式（重启后凭证丢失）")

        # 初始化账号持久化存储
        storage_path = Path(__file__).parent.parent / "data" / "accounts.json"
        self.account_store = AccountStore(
            storage_path=storage_path,
            master_password=master_password,
        )

        # 注册微信公众号发布器
        self.publisher_manager.register(PlatformType.WECHAT_MP, WeChatPublisher)

        # 初始化任务队列和调度器
        self.task_queue = TaskQueue(
            publisher_manager=self.publisher_manager,
            max_concurrent=config.get("queue", {}).get("max_concurrent", 3),
        )
        self.scheduler = PublishScheduler(task_queue=self.task_queue)

        # 启动队列和调度器
        await self.task_queue.start()
        await self.scheduler.start()

        # 从持久化存储加载账号并初始化发布器
        for account in self.account_store.list_accounts():
            if account.is_active:
                try:
                    await self.publisher_manager.ensure_initialized(account.platform, account.config)
                    logger.info(f"已初始化发布器: {account.name} ({account.platform.value})")
                except Exception as e:
                    logger.error(f"初始化发布器失败: {account.name} - {e}")

        logger.info(f"多平台发布服务初始化完成（已加载 {len(self.account_store.list_accounts())} 个账号）")

    async def shutdown(self):
        """关闭"""
        await self.scheduler.stop()
        await self.task_queue.stop()
        await self.publisher_manager.close_all()
        logger.info("多平台发布服务已关闭")


state = AppState()
config = load_config()


# ========== WebSocket 广播 ==========

async def broadcast(message: dict):
    """向所有连接的 WebSocket 客户端广播消息"""
    if state.ws_connections:
        disconnected = set()
        for ws in state.ws_connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add(ws)
        state.ws_connections -= disconnected


# ========== 生命周期 ==========

@asynccontextmanager
async def lifespan(app: FastAPI):
    await state.init(config)
    yield
    await state.shutdown()


# ========== FastAPI 应用 ==========

app = FastAPI(
    title="多平台一键发布",
    version="0.1.2",
    lifespan=lifespan,
)

# 静态文件和模板
app.mount("/static", StaticFiles(directory="web/static"), name="static")
templates = Jinja2Templates(directory="web/templates")

# 认证路由（如果可用）
if AUTH_ENABLED:
    app.include_router(auth_router)
    logger.info("已启用共享认证模块（/api/auth 路由）")

# HTTP Bearer 安全方案（用于需要登录的 API）
security = HTTPBearer() if AUTH_ENABLED else None


# ========== WebSocket ==========

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.ws_connections.add(websocket)
    try:
        while True:
            # 保持连接，接收客户端消息（如心跳）
            data = await websocket.receive_text()
            # 可以处理客户端消息
    except WebSocketDisconnect:
        state.ws_connections.remove(websocket)


# ========== 页面路由 ==========

@app.get("/")
async def index_page(request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/publish")
async def publish_page(request):
    return templates.TemplateResponse("publish.html", {"request": request})


@app.get("/accounts")
async def accounts_page(request):
    return templates.TemplateResponse("accounts.html", {"request": request})


@app.get("/tasks")
async def tasks_page(request):
    return templates.TemplateResponse("tasks.html", {"request": request})


# ========== API：发布（需要登录） ==========

async def get_current_user_or_401(request: Request):
    """获取当前用户，未登录则返回 401"""
    if not AUTH_ENABLED:
        return {"user_id": 1, "username": "anonymous", "role": "user"}
    
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Authorization Bearer Token")
    
    token = auth_header[7:]
    user_info = get_user_from_token(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
    
    return user_info

@app.post("/api/publish")
async def api_publish(data: dict, request: Request):
    """
    发布内容（需要登录）

    请求体：
    {
        "title": "文章标题",
        "content": "文章内容",
        "platforms": ["wechat_mp"],
        "draft": false,
        "scheduled_at": "2026-06-04T10:00:00",  // 可选，定时发布
        "wechat_mp_config": { ... }  // 平台特定配置
    }
    """
    # 认证检查
    user = await get_current_user_or_401(request)
    logger.info(f"用户 {user.get('username')} 发起发布请求")
    title = data.get("title", "").strip()
    content = data.get("content", "").strip()
    platforms = data.get("platforms", [])
    draft = data.get("draft", False)
    scheduled_at_str = data.get("scheduled_at")
    platform_configs = {k: v for k, v in data.items() if k.endswith("_config")}

    if not title or not content:
        raise HTTPException(status_code=400, detail="标题和内容不能为空")

    # 解析平台
    platform_types = []
    for p in platforms:
        try:
            platform_types.append(PlatformType(p))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"未知平台: {p}")

    if not platform_types:
        raise HTTPException(status_code=400, detail="至少选择一个平台")

    # 创建任务
    task = PublishTask(
        id=f"task-{uuid.uuid4().hex[:8]}",
        title=title,
        content=content,
        platforms=platform_types,
        metadata={
            "draft": draft,
            **platform_configs,
        },
    )

    # 定时发布 vs 立即发布
    if scheduled_at_str:
        scheduled_at = datetime.fromisoformat(scheduled_at_str)
        schedule_id = state.scheduler.add_schedule(task, scheduled_at)
        return {
            "success": True,
            "type": "scheduled",
            "schedule_id": schedule_id,
            "task_id": task.id,
            "scheduled_at": scheduled_at.isoformat(),
        }
    else:
        state.task_queue.add_task(task)
        return {
            "success": True,
            "type": "immediate",
            "task_id": task.id,
        }


# ========== API：任务管理 ==========

@app.get("/api/tasks")
async def api_list_tasks(status: str | None = None):
    """列出任务"""
    if status:
        try:
            status_enum = TaskStatus(status)
            tasks = state.task_queue.list_tasks(status=status_enum)
        except ValueError:
            tasks = state.task_queue.list_tasks()
    else:
        tasks = state.task_queue.list_tasks()

    return {
        "tasks": [t.to_dict() for t in tasks],
        "stats": state.task_queue.get_stats().__dict__,
    }


@app.get("/api/tasks/{task_id}")
async def api_get_task(task_id: str):
    """获取单个任务"""
    task = state.task_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task.to_dict()


@app.post("/api/tasks/{task_id}/cancel")
async def api_cancel_task(task_id: str):
    """取消任务"""
    success = await state.task_queue.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="无法取消该任务")
    return {"success": True}


@app.post("/api/tasks/{task_id}/retry")
async def api_retry_task(task_id: str):
    """重试任务"""
    success = await state.task_queue.retry_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="无法重试该任务")
    return {"success": True}


# ========== API：调度管理 ==========

@app.get("/api/schedules")
async def api_list_schedules():
    """列出所有调度"""
    return {"schedules": state.scheduler.list_schedules()}


@app.delete("/api/schedules/{schedule_id}")
async def api_remove_schedule(schedule_id: str):
    """删除调度"""
    success = state.scheduler.remove_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="调度不存在")
    return {"success": True}


@app.post("/api/schedules/{schedule_id}/pause")
async def api_pause_schedule(schedule_id: str):
    """暂停调度"""
    success = state.scheduler.pause_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="调度不存在")
    return {"success": True}


@app.post("/api/schedules/{schedule_id}/resume")
async def api_resume_schedule(schedule_id: str):
    """恢复调度"""
    success = state.scheduler.resume_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="调度不存在")
    return {"success": True}


# ========== API：账号管理（需要登录） ==========

@app.get("/api/accounts")
async def api_list_accounts(request: Request, platform: str | None = None, active: bool = True):
    """列出已配置的账号（需要登录）"""
    user = await get_current_user_or_401(request)
    try:
        platform_type = PlatformType(platform) if platform else None
    except ValueError:
        raise HTTPException(status_code=400, detail=f"未知平台: {platform}")

    accounts = state.account_store.list_accounts(
        platform=platform_type,
        active_only=active,
    )
    
    return {
        "accounts": [
            {
                "id": a.id,
                "platform": a.platform.value,
                "name": a.name,
                "is_active": a.is_active,
                "last_validated": a.last_validated.isoformat() if a.last_validated else None,
                "created_at": a.created_at.isoformat(),
            }
            for a in accounts
        ],
        "count": len(accounts),
    }


@app.post("/api/accounts")
async def api_add_account(data: dict, request: Request):
    """添加账号（需要登录）"""
    user = await get_current_user_or_401(request)
    platform_str = data.get("platform")
    name = data.get("name", "")
    account_config = data.get("config", {})
    is_active = data.get("is_active", True)

    if not platform_str:
        raise HTTPException(status_code=400, detail="platform 必填")
    if not name:
        raise HTTPException(status_code=400, detail="name 必填")

    try:
        platform = PlatformType(platform_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"未知平台: {platform_str}")

    # 创建账号（config 会被加密存储）
    account = PlatformAccount(
        id=f"acc-{uuid.uuid4().hex[:8]}",
        platform=platform,
        name=name,
        config=account_config,
        is_active=is_active,
    )

    # 保存到持久化存储
    state.account_store.add_account(account)

    # 如果账号活跃，尝试初始化发布器
    if is_active:
        try:
            await state.publisher_manager.ensure_initialized(platform, account.config)
            logger.info(f"已初始化发布器: {name}")
        except Exception as e:
            logger.warning(f"初始化发布器失败（可稍后验证）: {e}")

    return {
        "success": True,
        "account": {
            "id": account.id,
            "platform": platform.value,
            "name": name,
            "is_active": is_active,
        },
        "message": "账号已保存（重启后仍存在）",
    }


@app.patch("/api/accounts/{account_id}")
async def api_update_account(account_id: str, data: dict, request: Request):
    """更新账号（需要登录）"""
    user = await get_current_user_or_401(request)
    updates = {}
    if "name" in data:
        updates["name"] = data["name"]
    if "config" in data:
        updates["config"] = data["config"]
    if "is_active" in data:
        updates["is_active"] = data["is_active"]

    if not updates:
        raise HTTPException(status_code=400, detail="至少提供一个更新字段")

    account = state.account_store.update_account(account_id, updates)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    # 如果账号被激活，尝试初始化发布器
    if updates.get("is_active") and account.is_active:
        try:
            await state.publisher_manager.ensure_initialized(account.platform, account.config)
        except Exception as e:
            logger.warning(f"初始化发布器失败: {e}")

    return {"success": True, "account_id": account_id}


@app.delete("/api/accounts/{account_id}")
async def api_delete_account(account_id: str, request: Request):
    """删除账号（需要登录）"""
    user = await get_current_user_or_401(request)
    if not state.account_store.delete_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"success": True, "account_id": account_id}


@app.post("/api/accounts/{account_id}/validate")
async def api_validate_account(account_id: str, request: Request):
    """验证账号配置（测试连接，需要登录）"""
    user = await get_current_user_or_401(request)
    account = state.account_store.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    # 尝试初始化发布器来验证配置
    try:
        publisher = await state.publisher_manager.ensure_initialized(account.platform, account.config)
        # 调用发布器的验证方法（如果存在）
        if hasattr(publisher, "validate"):
            result = await publisher.validate()
        else:
            result = {"valid": True, "message": "配置格式正确"}
        
        # 更新最后验证时间
        state.account_store.update_account(account_id, {"last_validated": datetime.now()})
        
        return {"success": True, "account_id": account_id, "result": result}
    except Exception as e:
        return {"success": False, "account_id": account_id, "error": str(e)}


# ========== API：健康检查 ==========

@app.get("/api/health")
async def api_health():
    """健康检查"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "queue_stats": state.task_queue.get_stats().__dict__,
        "available_platforms": [p.value for p in state.publisher_manager.get_available_platforms()],
        "accounts_count": len(state.account_store.list_accounts()),
    }
