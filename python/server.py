"""
Multi-Publish Python Backend — FastAPI 服务
通过 stdio/HTTP 与 Electron 主进程通信
"""
import os
import sys
import json
import platform
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 确保 shared_modules 可导入
SHARED_MODULES = Path(__file__).parent.parent / '..' / 'shared_modules'
sys.path.insert(0, str(SHARED_MODULES.resolve()))

app = FastAPI(title="Multi-Publish Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ─── API 路由 ─────────────────────────────────────────────

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
    # TODO: 调用 shared_modules.wechat_mp.publisher 或 RPA 流程
    return {
        "code": 0,
        "message": f"Publish request received for {platform}",
        "data": {
            "title": req.title,
            "platform": platform
        }
    }

@app.get("/api/accounts")
def list_accounts():
    """返回已配置的账号列表"""
    # TODO: 从 shared_modules.wechat_mp.account_store 读取
    return {
        "code": 0,
        "data": []
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