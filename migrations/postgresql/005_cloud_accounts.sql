-- 账号云镜像（换设备免扫码恢复）：云端账号镜像表 + 合并键墓碑表。
-- 真源：01-docs/PRD-CLOUD-ACCOUNT-SYNC-2026-09-27.md §6.1；决策依据 docs/adr/0003（信封加密）、
-- docs/adr/0004（合并键 = platform + platform_uid）、docs/adr/0005（墓碑只阻止复活）。
-- 术语见 CONTEXT.md「账号域 / 加密域」。要点：
--   * 归属只到单个登录身份（user_id → identity_users），不做多人共享。
--   * 云端不存 status/last_validated 作真源；last_reported_status 只是展示用只读快照（PRD §6.1 注）。
--   * 凭证以信封加密的四列 BYTEA 存库，库内任何列都不得出现 cookie 明文（PRD 验收标准 7）。

BEGIN;

CREATE TABLE IF NOT EXISTS cloud_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    platform_uid TEXT NOT NULL,
    display_name TEXT NOT NULL CHECK (display_name <> '' AND char_length(display_name) <= 200),
    account_name TEXT CHECK (account_name IS NULL OR char_length(account_name) <= 200),
    -- avatar 只接受 https:// 前缀（或 NULL），与应用层 validate-account.js 的 https 门禁同口径。
    -- 库里这一道不是装饰：头像 URL 会被渲染层直接塞进 <img src>，而 `file:` / `javascript:` / `data:`
    -- 三种形态在 Electron 里都不是「显示不出来」这么简单 —— file: 会探测本地磁盘、
    -- data: 让任意字节穿过 CSP 变成图片内容。云端镜像行是可被写入的数据，不是受信输入，
    -- 所以协议约束必须同时存在于校验层与存储层（少存储层那一半，任何绕过 handlers 的写入都能塞进来）。
    avatar TEXT CHECK (avatar IS NULL OR (char_length(avatar) <= 1024 AND avatar LIKE 'https://%')),
    followers BIGINT CHECK (followers IS NULL OR followers >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    credential_ciphertext BYTEA NOT NULL,
    credential_iv BYTEA NOT NULL,
    credential_auth_tag BYTEA NOT NULL,
    encrypted_data_key BYTEA NOT NULL,
    credential_digest TEXT NOT NULL,
    last_reported_status TEXT CHECK (last_reported_status IS NULL OR last_reported_status IN ('active', 'expired', 'unverified')),
    credential_updated_at TIMESTAMPTZ NOT NULL,
    metadata_updated_at TIMESTAMPTZ NOT NULL,
    last_sync_device_label TEXT CHECK (last_sync_device_label IS NULL OR char_length(last_sync_device_label) <= 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 合并键：(platform, platform_uid) 在一个归属身份内唯一（ADR-0004）。
    CONSTRAINT cloud_accounts_user_platform_uid_key UNIQUE (user_id, platform, platform_uid),
    -- uid 是身份判定的唯一来源，空串会把「取不到 uid」静默变成一个可合并的账号（PRD §5.1 uid-unavailable 必须整体跳过上行）。
    CONSTRAINT cloud_accounts_platform_uid_present CHECK (platform_uid <> '')
);

CREATE INDEX IF NOT EXISTS idx_cloud_accounts_user_platform
    ON cloud_accounts(user_id, platform);

CREATE TABLE IF NOT EXISTS cloud_account_tombstones (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    platform_uid TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cloud_account_tombstones_user_platform_uid_key UNIQUE (user_id, platform, platform_uid),
    CONSTRAINT cloud_account_tombstones_platform_uid_present CHECK (platform_uid <> '')
);

CREATE INDEX IF NOT EXISTS idx_cloud_account_tombstones_user
    ON cloud_account_tombstones(user_id, platform, platform_uid);

COMMIT;
