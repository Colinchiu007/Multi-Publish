-- PROJECT-003 用户数据库初始化脚本
-- 运行：python -c "import sqlite3; conn=sqlite3.connect('data/user.db'); conn.executescript(open('migrations/001_init_user_db.sql').read()); conn.close()"

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT 1,
    email_verified BOOLEAN DEFAULT 0,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 用户配置文件表
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    website TEXT,
    company TEXT,
    location TEXT,
    subscription_plan TEXT DEFAULT 'free',
    video_quota INTEGER DEFAULT 3,
    preferred_language TEXT DEFAULT 'zh-CN',
    preferred_voice TEXT DEFAULT 'zh-CN-XiaoxiaoNeural',
    preferred_video_ratio TEXT DEFAULT '9:16',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 默认管理员账号（密码: admin123）
-- 注意：生产环境请修改密码！
INSERT OR IGNORE INTO users (uuid, username, email, password_hash, role, is_active)
VALUES (
    'admin-001',
    'admin',
    'admin@example.com',
    '$pbkdf2-sha256$29000$...',  -- 占位，实际运行时会生成正确哈希
    'admin',
    1
);
