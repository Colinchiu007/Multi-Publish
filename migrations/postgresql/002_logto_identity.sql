-- Multi-Publish 业务身份 PostgreSQL 迁移。
-- Logto 自身数据库与本业务数据库必须分离；外部身份唯一键始终是 provider + sub。

BEGIN;

CREATE TABLE IF NOT EXISTS identity_users (
    id TEXT PRIMARY KEY,
    auth_provider TEXT NOT NULL DEFAULT 'logto',
    auth_subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    display_name TEXT,
    avatar_url TEXT,
    last_event_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (auth_provider, auth_subject)
);

ALTER TABLE identity_users
    ADD COLUMN IF NOT EXISTS last_event_created_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS identity_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    provider_reference TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_entitlement_snapshots (
    user_id TEXT PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_entitlement_usage (
    user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
    quota_limit INTEGER NOT NULL CHECK (quota_limit >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, feature, period_start),
    CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_identity_entitlement_usage_period
    ON identity_entitlement_usage(user_id, period_end);

CREATE TABLE IF NOT EXISTS identity_user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_identity_user_sessions_active
    ON identity_user_sessions(user_id) WHERE revoked_at IS NULL;

COMMIT;
