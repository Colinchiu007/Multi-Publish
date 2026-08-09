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
    """Cross-project consistency check.

    语义：只对本进程实际可观察的变量做存在性与一致性判断。
    - 变量未配置（empty）→ status=unknown，不计为缺陷（该变量可能属于其他服务进程）。
    - 变量已配置但值不同 → status=mismatch（一致性缺陷）。
    - 变量已配置且一致 → status=ok。
    """
    checks = []
    jwt_vars = ["PO_SECRET_KEY", "TS_SECRET_KEY"]
    configured = {v: os.environ.get(v, "") for v in jwt_vars}
    present = {v: val for v, val in configured.items() if val}
    if not present:
        checks.append({
            "check": "JWT Secret alignment",
            "status": "unknown",
            "passed": None,
            "detail": "No JWT secret configured in this process (expected for ops-center; keys live in orchestrator/trendscope env)",
            "variables": {v: False for v in jwt_vars},
        })
    elif len(present) < len(jwt_vars):
        checks.append({
            "check": "JWT Secret alignment",
            "status": "partial",
            "passed": False,
            "detail": "Partially configured JWT secrets: cross-service alignment cannot be verified",
            "variables": {v: bool(val) for v, val in configured.items()},
        })
    else:
        values = set(present.values())
        checks.append({
            "check": "JWT Secret alignment",
            "status": "ok" if len(values) == 1 else "mismatch",
            "passed": len(values) == 1,
            "detail": (
                "All configured services share the same JWT secret"
                if len(values) == 1
                else f"Configured JWT secrets differ across services ({len(values)} distinct values)"
            ),
            "variables": {v: bool(val) for v, val in configured.items()},
        })
    return {"checks": checks, "timestamp": __import__("datetime").datetime.utcnow().isoformat()}
