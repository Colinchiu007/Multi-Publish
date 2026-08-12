"""OpsCenter — FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routers import config, sync, secrets, snapshots, env, model_presets, auth, runtime, usage, licenses, health, feature_flags, platform_defs, content_templates, publish_metrics, redemption_codes, keyword_watchlist, pipeline_dependencies, diagnostics



from services.model_preset_service import ensure_catalog_seeded, ensure_model_preset_columns
from services.key_service import ensure_official_key_columns
from services.platform_def_service import ensure_platform_def_seeded
from services.content_template_service import ensure_content_templates_seeded
from services.pipeline_dependency_service import ensure_pipeline_deps_seeded
from services.auth_service import ensure_admin_seeded
from services.config_seed_service import ensure_feature_gates_seeded, ensure_projects_seeded
from services.feature_flag_service import ensure_feature_flags_seeded
from database import async_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("ops-center")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB. Shutdown: cleanup."""
    settings.validate_security()
    logger.info("Initializing database...")
    await init_db()
    # 模型预设表：存量库补充新列（models_url/rate_per_minute/limit_per_5h）并补齐种子（不覆盖用户修改）
    async with async_session() as db:
        await ensure_model_preset_columns(db)
        await ensure_official_key_columns(db)
        await ensure_catalog_seeded(db)
        await ensure_platform_def_seeded(db)
        await ensure_content_templates_seeded(db)
        await ensure_pipeline_deps_seeded(db)
        await ensure_admin_seeded(db)
        await ensure_projects_seeded(db)
        await ensure_feature_gates_seeded(db)
        await ensure_feature_flags_seeded(db)
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
app.include_router(runtime.router)
app.include_router(usage.router)
app.include_router(diagnostics.router)
app.include_router(licenses.router)
app.include_router(health.router)
app.include_router(feature_flags.router)
app.include_router(platform_defs.router)
app.include_router(publish_metrics.router)
app.include_router(keyword_watchlist.router)
app.include_router(pipeline_dependencies.router)
app.include_router(redemption_codes.router)

app.include_router(content_templates.router)



app.include_router(auth.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ops-center", "version": "0.1.0"}


# Run: uvicorn main:app --reload --port 8010
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
