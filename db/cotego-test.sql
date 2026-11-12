-- COTEGO Plus — D1 sandbox only, never use production customer information.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 iterations INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 stripe_customer_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS subscriptions (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL,
 subscription_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL,
 period_end INTEGER NOT NULL DEFAULT 0,
 last_event_created INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS billing_events (
 event_id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_limits (
 email TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 window_start INTEGER NOT NULL
);
