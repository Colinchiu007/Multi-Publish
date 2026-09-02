"""pytest 全局配置：在所有测试模块收集前注入 DEV Ed25519 签名私钥。

背景：pytest 按字母序导入测试模块，`config.settings` 是导入期实例化的单例。
test_auth_login.py 等模块先导入时 `OPS_RUNTIME_SIGNING_PRIVATE_KEY` 尚未被
test_runtime_policy_api.py 等后续模块设置，导致 bootstrap 相关测试拿不到签名密钥
而 404。此处用 setdefault 在收集阶段统一注入，保证任何测试模块首次 import config
时 settings 已携带 DEV 私钥（与 .env.example / ops-center-sync.js 内置公钥配对）。
"""
import os

import pytest

# DEV 签名密钥对（2026-09-02 生成）：与 apps/desktop/electron/services/ops-center-sync.js
# 内置默认公钥 / ops-center-sync.test.js DEV 密钥对 / backend/.env.example DEV 私钥完全一致，
# 用于双端交叉验证 canonical JSON + Ed25519 签名。
DEV_RUNTIME_PRIVATE_KEY = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MC4CAQAwBQYDK2VwBCIEIMEaqZBFhrl/hpieWHhYoaG6Dn+Juchfx4/2s0dXok0S\n"
    "-----END PRIVATE KEY-----"
)

os.environ.setdefault("OPS_RUNTIME_SIGNING_PRIVATE_KEY", DEV_RUNTIME_PRIVATE_KEY)
# Catalog API Key 默认值：与各 API 测试模块一致（test_scheduler_api.py 等模块在导入期设 env，
# 但 config.settings 是导入期单例，先导入的模块会让其为 ""。此处 setdefault 统一兜底。）
os.environ.setdefault("OPS_CATALOG_API_KEY", "catalog-test-key")
# Stage -1.8：JWT 密钥独立于 OPS_SECRET_KEY，测试环境默认注入
os.environ.setdefault("OPS_JWT_SECRET", "test-jwt-secret")


@pytest.fixture(autouse=True)
def _inject_runtime_signing_key():
    """每个测试前将签名私钥同步到 settings 单例（与其他模块 catalog_api_key 同模式）。

    测试内对 settings.runtime_signing_private_key 的临时修改（如 404/500 fail-closed
    用例）在其自身 try/finally 中恢复，不受本 fixture 干扰。
    """
    try:
        from config import settings

        settings.runtime_signing_private_key = DEV_RUNTIME_PRIVATE_KEY
    except ImportError:  # conftest 在无 config 的场景（如仅运行非 API 测试）安全降级
        pass
    yield
