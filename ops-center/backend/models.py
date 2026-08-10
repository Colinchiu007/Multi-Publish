"""SQLAlchemy models for OpsCenter config management."""
import datetime
import sqlalchemy as sa
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
    # 配额与告警（2026-08-10 P0-1 第三批）：每分钟配额 / 每日调用上限 / 成本告警阈值(¥) / 备注
    rate_per_minute = Column(Integer, nullable=True)
    daily_limit = Column(Integer, nullable=True)
    alert_threshold_cost = Column(Float, nullable=True)
    note = Column(String, default="")
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class License(Base):
    """官方许可证 — 运营后台签发/吊销，桌面端 Pro 激活凭证（管理面先行，服务端验签待商业模式确认）。"""

    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    license_key = Column(String, nullable=False, unique=True)
    plan = Column(String, nullable=False)  # free/trial/pro
    device_limit = Column(Integer, default=1)
    expires_at = Column(String, default="")  # ISO 或空（永久）
    status = Column(String, default="active")  # active/disabled
    note = Column(String, default="")
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


class Announcement(Base):
    """运营公告 — 桌面端启动时经 runtime/bootstrap 拉取展示。

    severity: info=普通提示 / warning=重要提醒（可关闭） / maintenance=维护通知（常驻强提示）
    active_from/active_until: ISO 时间串，空=不设界；活动条件 enabled=1 且窗口命中。
    """

    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False, default="")
    severity = Column(String, default="info")  # info | warning | maintenance
    active_from = Column(String, default="")  # ISO 或空
    active_until = Column(String, default="")  # ISO 或空
    enabled = Column(Integer, default=1)
    sort_order = Column(Integer, default=0)
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class UpdatePolicy(Base):
    """版本发布策略 — 桌面端自动更新消费（强制版本/灰度比例/最低版本提示）。单条有效行 id=1。"""

    __tablename__ = "update_policy"

    id = Column(Integer, primary_key=True, autoincrement=True)
    min_version = Column(String, default="")  # 低于此版本时提示升级（可空）
    force_version = Column(String, default="")  # 低于此版本时强制升级（可空）
    gray_ratio = Column(Integer, default=100)  # 0-100 灰度比例
    enabled = Column(Integer, default=1)
    note = Column(String, default="")
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class ContentPolicy(Base):
    """内容安全策略 — 敏感词库 + 替换串，桌面端 SensitiveFilter 远程词源。单条有效行 id=1。"""

    __tablename__ = "content_policy"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, default="默认内容安全策略")
    word_list = Column(Text, default="[]")  # JSON array of strings
    replacement = Column(String, default="***")  # 替换串，<=16 字符
    enabled = Column(Integer, default=1)
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class ModelUsageDaily(Base):
    """模型调用用量日聚合 — 桌面端脱敏上报，运营后台看板数据源。

    唯一键 (usage_date, client_id, provider_id, action)：同桶多次上报累加（幂等）。
    latency_buckets: JSON，如 {"lt1s": n, "1to3s": n, "3to10s": n, "gt10s": n}
    """

    __tablename__ = "model_usage_daily"
    __table_args__ = (
        sa.UniqueConstraint("usage_date", "client_id", "provider_id", "action", name="uq_model_usage_daily_bucket"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    usage_date = Column(String, nullable=False)  # YYYY-MM-DD
    client_id = Column(String, default="")  # 桌面端设备稳定哈希（脱敏）
    provider_id = Column(String, nullable=False)
    category = Column(String, default="llm")
    action = Column(String, nullable=False)
    calls = Column(Integer, default=0)
    ok_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    ratelimit_count = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)  # 总耗时
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    latency_buckets = Column(Text, default="{}")  # JSON
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class ModelUsageBatch(Base):
    """用量上报批次去重 — 客户端携带 batch_id（lastId-maxId），服务端唯一约束防超时重试翻倍。"""

    __tablename__ = "model_usage_batches"
    __table_args__ = (
        sa.UniqueConstraint("client_id", "batch_id", name="uq_model_usage_batch"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(String, default="")
    batch_id = Column(String, nullable=False)
    ingested_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class FeatureFlag(Base):
    """功能开关（桌面端运行时下发）— 运营后台维护，bootstrap 下发 typed value。"""

    __tablename__ = "feature_flags"

    key = Column(String(128), primary_key=True)
    value_type = Column(String(20), default="string")  # string | boolean | number
    value = Column(String, default="")
    description = Column(String(200), default="")
    enabled = Column(Integer, default=1)
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_by = Column(String(100), default="")
class PlatformDef(Base):
    """平台发布元数据 — 运营后台管理，桌面端启动拉取覆盖（临时下线/字段上限即时生效）。"""

    __tablename__ = "platform_defs"

    id = Column(String(64), primary_key=True)  # 平台 id（如 wechat_mp）
    name = Column(String(100), nullable=False)
    category = Column(String(20), default="中文")  # 中文 | 海外
    content_category = Column(String(20), default="MIXED")  # VIDEO | IMAGE_TEXT | MIXED
    type = Column(String(20), default="mixed")  # article | mixed 兼容
    max_title = Column(Integer, nullable=True)
    max_content = Column(Integer, nullable=True)
    has_api = Column(Integer, default=0)
    enabled = Column(Integer, default=1)  # 0=临时下线（不下发桌面端）
    note = Column(String(200), default="")
    deleted_at = Column(String, nullable=True)  # 软删除时间（非空=已删除，种子不复活）
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class PublishMetricDaily(Base):
    """发布指标日聚合 — 桌面端上报，运营看板展示。"""

    __tablename__ = "publish_metrics_daily"
    __table_args__ = (
        sa.UniqueConstraint("usage_date", "client_id", "platform", name="uq_publish_metric_day"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    usage_date = Column(String, nullable=False)  # YYYY-MM-DD
    client_id = Column(String, default="")  # 桌面端设备稳定哈希（脱敏）
    platform = Column(String, default="")  # 平台 id（如 wechat_mp）
    publish_count = Column(Integer, default=0)
    ok_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())


class PublishReportBatch(Base):
    """发布指标上报批次去重 — 客户端携带 report_id（minTs-maxTs），服务端唯一约束防网络模糊失败重复计数。"""

    __tablename__ = "publish_report_batches"
    __table_args__ = (
        sa.UniqueConstraint("client_id", "report_id", name="uq_publish_report_batch"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(String, default="")
    report_id = Column(String, nullable=False)
    ingested_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
class ContentTemplate(Base):
    """官方内容模板库（桌面端运行时下发）— 运营后台维护，bootstrap 下发内置模板。"""

    __tablename__ = "content_templates"

    id = Column(String(64), primary_key=True)  # 如 preset-weekly
    name = Column(String(100), nullable=False)
    category = Column(String(40), default="marketing")  # report | marketing | tutorial | event | daily ...
    title = Column(String(200), default="")
    content = Column(Text, default="")  # Markdown 正文
    platforms = Column(Text, default="[]")  # JSON 数组
    tags = Column(Text, default="[]")  # JSON 数组
    enabled = Column(Integer, default=1)
    sort_order = Column(Integer, default=0)
    deleted_at = Column(String, nullable=True)  # 软删除时间（非空=已删除，种子不复活）
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_by = Column(String(100), default="")


class RedemptionCode(Base):
    """兑换码管理 — 运营后台签发（与桌面端 redemption-codes.js HMAC 格式一致），吊销/查询。"""

    __tablename__ = "redemption_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(32), unique=True, nullable=False)  # MP-XXXX-XXXX-XXXX-SIG（列表掩码，操作按 id）
    plan = Column(String(20), default="pro")  # free | trial | pro
    batch_id = Column(String(32), default="")
    status = Column(String(20), default="active")  # active | revoked
    expires_at = Column(String, nullable=True)  # ISO 或空
    note = Column(String(200), default="")
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_by = Column(String(100), default="")

