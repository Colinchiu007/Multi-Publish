-- Logto webhook SQLite 幂等事件记录。
-- 生产 PostgreSQL 使用 migrations/postgresql/003_logto_webhook_events.sql。
-- 事件登记与 identity_users 状态更新必须由同一事务完成；失败时整笔回滚以便 Logto 重试。

CREATE TABLE IF NOT EXISTS identity_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'logto',
    event TEXT NOT NULL,
    hook_id TEXT NOT NULL,
    auth_subject TEXT NOT NULL,
    created_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processing', 'processed')),
    result TEXT,
    processed_at TEXT,
    UNIQUE (provider, id)
);

CREATE INDEX IF NOT EXISTS idx_identity_webhook_events_subject
    ON identity_webhook_events(provider, auth_subject, created_at);
