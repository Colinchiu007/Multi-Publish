-- Logto 身份 SQLite 兼容迁移（不删除历史 users 数据）。
-- 生产 PostgreSQL 使用 migrations/postgresql/002_logto_identity.sql。
-- 外部身份唯一键是 Logto sub；业务资源必须引用 identity_users.id。

CREATE TABLE IF NOT EXISTS identity_users (
    id TEXT PRIMARY KEY,
    auth_provider TEXT NOT NULL DEFAULT 'logto',
    auth_subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    display_name TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE IF NOT EXISTS identity_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES identity_users(id),
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    current_period_start TEXT,
    current_period_end TEXT,
    provider_reference TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS identity_entitlement_snapshots (
    user_id TEXT PRIMARY KEY REFERENCES identity_users(id),
    version INTEGER NOT NULL DEFAULT 1,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_identity_users_subject ON identity_users(auth_provider, auth_subject);
CREATE INDEX IF NOT EXISTS idx_identity_subscriptions_user ON identity_subscriptions(user_id);
