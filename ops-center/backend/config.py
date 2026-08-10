"""OpsCenter configuration — pydantic-settings, reads OPS_ prefixed env vars."""
from typing import Literal

from pydantic_settings import BaseSettings


INSECURE_DEFAULT_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = {"env_prefix": "OPS_", "env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    secret_key: str = ""
    encryption_key: str = ""  # Fernet key for encrypting secret config values
    db_path: str = "data/config.db"
    config_output_dir: str = "data/configs"
    orchestrator_feature_gates_path: str = "data/configs/orchestrator/feature_gates.yaml"
    # JWT: share secret with orchestrator
    jwt_secret: str = ""  # Empty = fall back to secret_key
    jwt_algorithm: Literal["HS256"] = "HS256"
    # 本地管理员登录（自包含，替代 orchestrator 认证）：未配置且无管理员时登录 fail-closed
    admin_username: str = ""
    admin_password: str = ""
    # 功能开关导入源（可选；缺省探测 D:/Data/projects/platform-orchestrator/feature_gates.yaml 等）
    feature_gates_source: str = ""

    def get_jwt_secret(self) -> str:
        """返回经过安全校验的 JWT 密钥。"""
        secret = (self.jwt_secret or self.secret_key).strip()
        if not secret or secret == INSECURE_DEFAULT_SECRET:
            raise RuntimeError("未配置安全的 OpsCenter JWT 密钥")
        return secret

    def validate_security(self) -> None:
        """启动前验证认证配置，缺失时拒绝启动。"""
        self.get_jwt_secret()

    cors_origins: str = "*"


settings = Settings()
