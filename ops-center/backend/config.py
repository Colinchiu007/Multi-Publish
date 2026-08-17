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
    # 功能开关导入源（可选；缺省探测 orchestrator_feature_gates_path 与开发机默认路径）
    feature_gates_import_source: str = ""
    # 模型目录只读同步端点（桌面端拉取运营配置）API Key；未配置 → 端点 404（fail-closed）
    catalog_api_key: str = ""
    # 云服务健康巡检目标（可选；未配置对应探针跳过）
    health_api_url: str = ""
    health_logto_url: str = ""
    health_targets: str = ""  # JSON 数组 [{name, url}]
    # 兑换码签发密钥：须与桌面端 REDEMPTION_SECRET 一致（未配置 → 签发端点 400 fail-closed）
    redemption_secret: str = ""
    feedback_media_dir: str = "data/feedback-media"
    feedback_max_message_chars: int = 10000
    feedback_max_archive_bytes: int = 25 * 1024 * 1024

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
