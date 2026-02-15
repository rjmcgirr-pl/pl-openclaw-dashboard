-- Migration: Admin Panel
-- Creates admin_users and admin_settings tables
-- Date: 2026-02-15

-- Admin users table: controls who has admin access
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  added_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed with the initial admin user
INSERT OR IGNORE INTO admin_users (email, added_by) VALUES ('richard@propertyllama.com', 'system');

-- Admin settings table: key-value store for configurable settings
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

-- Seed default settings
INSERT OR IGNORE INTO admin_settings (key, value, description, updated_by)
VALUES
  ('activity_stream_limit', '50', 'Maximum number of activities/notifications returned per query', 'system'),
  ('cron_run_history_limit', '50', 'Maximum number of cron job runs returned per query', 'system'),
  ('notification_poll_interval_ms', '30000', 'Notification polling interval in milliseconds (fallback for SSE)', 'system'),
  ('auto_refresh_interval_ms', '30000', 'Task auto-refresh interval in milliseconds (fallback for SSE)', 'system');
