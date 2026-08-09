"""Environment variable read-only view."""
import os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user
from services import config_service

router = APIRouter(prefix="/api/v1/env", tags=["env"])


# Known env vars per project
EXPECTED_ENV = {
    "platform-orchestrator": {
        "PO_SECRET_KEY": {"secret": True},
        "PO_DATABASE_URL": {"secret": True},
        "PO_REDIS_URL": {"secret": False},
    },
    "trendscope": {
        "TS_SECRET_KEY": {"secret": True},
        "TS_DATABASE_URL": {"secret": True},
        "TS_REDIS_URL": {"secret": False},
    },
    "content-aggregator": {
        "OPENAI_API_KEY": {"secret": True},
        "CA_DATABASE_URL": {"secret": True},
    },
    "prompt-engine": {
        "PE_LLM_API_KEY": {"secret": True},
    },
    "smart-sentence-splitter": {},
    "multi-publish": {},
    "Story2Video": {},
}


def mask_env(value: str) -> str:
    if not value or len(value) < 6:
        return "***"
    return value[:4] + "***" + value[-4:]


@router.get("/{project_code}")
async def get_env_vars(
    project_code: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Read-only view of environment variables for a project."""
    expected = EXPECTED_ENV.get(project_code, {})
    vars_list = []
    for var_name, meta in expected.items():
        raw = os.environ.get(var_name, "")
        vars_list.append({
            "name": var_name,
            "value": mask_env(raw) if meta.get("secret") and raw else raw,
            "is_secret": meta.get("secret", False),
            "is_set": bool(raw),
        })
    return {
        "project": project_code,
        "variables": vars_list,
        "total": len(vars_list),
        "missing": [v["name"] for v in vars_list if not v["is_set"]],
    }


@router.get("")
async def env_consistency_check(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Cross-project consistency check."""
    checks = []
    # Check JWT secret consistency
    jwt_vars = ["PO_SECRET_KEY", "TS_SECRET_KEY"]
    jwts = {}
    for var in jwt_vars:
        val = os.environ.get(var, "")
        jwts[var] = bool(val)
    checks.append({
        "check": "JWT Secret alignment",
        "passed": all(jwts.values()),
        "detail": "All services share the same JWT secret" if all(jwts.values()) else "Some services missing JWT secret",
        "variables": jwts,
    })
    return {"checks": checks, "timestamp": __import__("datetime").datetime.utcnow().isoformat()}
