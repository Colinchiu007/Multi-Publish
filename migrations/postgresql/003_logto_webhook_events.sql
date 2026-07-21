-- Logto webhook 幂等记录 PostgreSQL 迁移。
-- 事件登记、用户状态更新、会话撤销和 processed 标记必须在同一事务内提交。

BEGIN;

CREATE TABLE IF NOT EXISTS identity_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'logto',
    event TEXT NOT NULL,
    hook_id TEXT NOT NULL,
    auth_subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed')),
    result JSONB,
    processed_at TIMESTAMPTZ,
    UNIQUE (provider, id)
);

CREATE INDEX IF NOT EXISTS idx_identity_webhook_events_subject
    ON identity_webhook_events(provider, auth_subject, created_at);

CREATE INDEX IF NOT EXISTS idx_identity_webhook_events_status
    ON identity_webhook_events(status, received_at);

COMMIT;
