"""OpsCenter — FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routers import config, sync, secrets, snapshots, env, model_presets

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("ops-center")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB. Shutdown: cleanup."""
    settings.validate_security()
    logger.info("Initializing database...")
    await init_db()
    logger.info("OpsCenter ready")
    yield
    logger.info("OpsCenter shutting down")


app = FastAPI(
    title="OpsCenter",
    description="一站式运营配置中心",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(config.router)
app.include_router(sync.router)
app.include_router(secrets.router)
app.include_router(snapshots.router)
app.include_router(env.router)
app.include_router(model_presets.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ops-center", "version": "0.1.0"}


# Run: uvicorn main:app --reload --port 8010
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
