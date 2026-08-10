"""SQLAlchemy models for OpsCenter config management."""
import datetime
from sqlalchemy import Column, String, Integer, Text, Float, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    code = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    config_file_path = Column(String, default="")
    config_format = Column(String, default="yaml")
    enabled = Column(Integer, default=1)

    config_items = relationship("ConfigItem", back_populates="project")


class ConfigItem(Base):
    __tablename__ = "config_items"

    id = Column(String, primary_key=True)
    project_code = Column(String, ForeignKey("projects.code"), nullable=False)
    category = Column(String, nullable=False)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False, default="")
    value_type = Column(String, default="string")
    description = Column(Text, default="")
    is_secret = Column(Integer, default=0)
    is_required = Column(Integer, default=0)
    default_value = Column(Text, default="")
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_by = Column(String, default="")

    project = relationship("Project", back_populates="config_items")


class ConfigAuditLog(Base):
    __tablename__ = "config_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_id = Column(String, nullable=False)
    old_value = Column(Text, default="")
    new_value = Column(Text, default="")
    changed_by = Column(String, nullable=False)
    changed_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    change_type = Column(String, nullable=False)
    source_ip = Column(String, default="")


class ModelPreset(Base):
    """模型预设目录 — 运营端维护前端【模型设置】的预设服务商与多模态能力。

    字段说明：
      - is_visible: 是否在前端【模型设置】中显示（运营可开关）
      - doc_links: 模型技术文档网页链接（JSON 数组，最多 10 条）
      - is_multimodal: 是否多模态模型
      - capabilities: 多模态模型支持的能力 ID（JSON 数组，如 ["llm","tts","image","video"]）
      - capability_models: 每个能力对应的默认模型 ID（JSON 对象，如 {"llm":"MiniMax-M2.7"})
      - capability_doc_links: 每个能力的技术文档网页链接（JSON 对象，capability -> 链接数组，最多 10 条）
    """

    __tablename__ = "model_presets"

    id = Column(String, primary_key=True)  # 如 minimax-multimodal
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)  # llm/tts/speech_recognition/image/video/audio/multimodal
    base_url = Column(String, default="")  # 端口URL（接口 Base URL）
    models_url = Column(String, default="")  # 获取模型ID URL（允许为空）
    models = Column(Text, default="[]")  # JSON array
    default_model = Column(String, default="")  # 平台预设默认 Model ID（运营可填写/修改）
    rate_per_minute = Column(Integer, nullable=True)  # 每分钟连接次数（允许为空）
    limit_per_5h = Column(Integer, nullable=True)  # 5小时限额次数（允许为空）
    is_multimodal = Column(Integer, default=0)
    capabilities = Column(Text, default="[]")  # JSON array
    capability_models = Column(Text, default="{}")  # JSON object
    doc_links = Column(Text, default="[]")  # JSON array, <= 10
    capability_doc_links = Column(Text, default="{}")  # JSON object
    is_visible = Column(Integer, default=1)
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class OfficialKey(Base):
    __tablename__ = "official_keys"

    id = Column(String, primary_key=True)  # "openai-gpt4o"
    provider = Column(String, nullable=False)  # openai / doubao / minimax / ...
    name = Column(String, nullable=False)  # "OpenAI GPT-4o"
    api_key = Column(Text, nullable=False)  # Fernet encrypted
    base_url = Column(String, default="")
    models = Column(Text, default="[]")  # JSON array
    priority = Column(Integer, default=1)
    is_active = Column(Integer, default=1)
    tier_access = Column(Integer, default=1)  # 1=all tiers, 2=standard+, 3=pro only
    cost_per_1k_tokens = Column(Float, default=0.0)
    expires_at = Column(String, default="")
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class AdminUser(Base):
    """运营后台本地管理员（自包含登录，替代 orchestrator 认证依赖）。"""

    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)  # pbkdf2_sha256$iterations$salt_hex$hash_hex
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
