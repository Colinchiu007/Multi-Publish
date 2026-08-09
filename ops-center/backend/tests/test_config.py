"""Tests for OpsCenter config API and file generation."""
import os
import sys
import pytest
import pytest_asyncio
import tempfile

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Override paths for testing
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_test_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

# Import models early so Base.metadata knows about them
import models  # noqa: F401 — registers models with Base


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create fresh test tables and insert base project rows."""
    from database import engine, Base, async_session
    from models import Project

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Insert project rows (required for FK constraints)
    async with async_session() as db:
        for code, name in [("platform-orchestrator", "PO"), ("a", "Proj A"), ("b", "Proj B")]:
            db.add(Project(code=code, name=name))
        await db.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_db_init():
    """DB initializes and tables exist."""
    from database import init_db
    await init_db()


@pytest.mark.asyncio
async def test_upsert_config_creates_new():
    """Creating a new config item works."""
    from database import async_session
    from services.config_service import upsert_config

    async with async_session() as db:
        item = await upsert_config(
            db,
            config_id="orchestrator.feature_flag.test_gate",
            project_code="platform-orchestrator",
            category="feature_flag",
            key="test_gate",
            value="true",
            value_type="boolean",
            description="Test gate",
            updated_by="test-user",
        )
        assert item.id == "orchestrator.feature_flag.test_gate"
        assert item.value == "true"
        assert item.category == "feature_flag"


@pytest.mark.asyncio
async def test_upsert_config_updates_existing():
    """Updating an existing config item changes value and creates audit log."""
    from database import async_session
    from services.config_service import upsert_config, get_audit_logs

    async with async_session() as db:
        await upsert_config(
            db,
            config_id="orchestrator.feature_flag.my_gate",
            project_code="platform-orchestrator",
            category="feature_flag",
            key="my_gate",
            value="false",
            value_type="boolean",
            updated_by="alice",
        )

        updated = await upsert_config(
            db,
            config_id="orchestrator.feature_flag.my_gate",
            project_code="platform-orchestrator",
            category="feature_flag",
            key="my_gate",
            value="true",
            value_type="boolean",
            updated_by="bob",
        )

        assert updated.value == "true"
        assert updated.updated_by == "bob"

        logs = await get_audit_logs(db, config_id="orchestrator.feature_flag.my_gate")
        assert len(logs) == 2
        assert logs[0].change_type == "update"
        assert logs[0].new_value == "true"
        assert logs[0].old_value == "false"


@pytest.mark.asyncio
async def test_get_configs_by_category():
    """Filtering configs by category works."""
    from database import async_session
    from services.config_service import upsert_config, get_configs_by_category

    async with async_session() as db:
        await upsert_config(db, "a.feature_flag.f1", "a", "feature_flag", "f1", "true", updated_by="tester")
        await upsert_config(db, "a.api_key.k1", "a", "api_key", "k1", "sk-secret", is_secret=1, updated_by="tester")
        await upsert_config(db, "b.feature_flag.f2", "b", "feature_flag", "f2", "false", updated_by="tester")

        flags = await get_configs_by_category(db, "feature_flag")
        assert len(flags) == 2
        assert all(f.category == "feature_flag" for f in flags)

        keys = await get_configs_by_category(db, "api_key")
        assert len(keys) == 1
        assert keys[0].is_secret == 1


@pytest.mark.asyncio
async def test_get_configs_by_project():
    """Filtering configs by project works."""
    from database import async_session
    from services.config_service import upsert_config, get_configs_by_project

    async with async_session() as db:
        await upsert_config(db, "a.feature_flag.f1", "a", "feature_flag", "f1", "true", updated_by="tester")
        await upsert_config(db, "b.feature_flag.f2", "b", "feature_flag", "f2", "false", updated_by="tester")

        a_items = await get_configs_by_project(db, "a")
        assert len(a_items) == 1
        assert a_items[0].project_code == "a"


@pytest.mark.asyncio
async def test_write_feature_gates():
    """Generating feature_gates.yaml from DB items produces valid YAML."""
    from database import async_session
    from services.config_service import upsert_config, get_configs_by_category
    import yaml

    async with async_session() as db:
        await upsert_config(db, "orchestrator.feature_flag.gate_a", "platform-orchestrator",
                          "feature_flag", "gate_a", "true", description="Gate A", updated_by="tester")
        await upsert_config(db, "orchestrator.feature_flag.gate_b", "platform-orchestrator",
                          "feature_flag", "gate_b", "false", description="Gate B", updated_by="tester")
        items = await get_configs_by_category(db, "feature_flag")

    import tempfile
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False)
    tmp.close()
    try:
        from services.file_writer import write_feature_gates
        import config as cfg
        old_path = cfg.settings.orchestrator_feature_gates_path
        cfg.settings.orchestrator_feature_gates_path = tmp.name

        write_feature_gates(items)

        with open(tmp.name) as fh:
            data = yaml.safe_load(fh)

        assert data["_generated_by"] == "ops-center"
        assert data["gates"]["gate_a"]["enabled"] is True
        assert data["gates"]["gate_b"]["enabled"] is False

        cfg.settings.orchestrator_feature_gates_path = old_path
    finally:
        os.unlink(tmp.name)


@pytest.mark.asyncio
async def test_api_health():
    """Health endpoint returns OK."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_api_list_projects_returns_data():
    """Config projects endpoint returns data (list_projects is public)."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/config/projects")
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
