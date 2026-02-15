-- Migration: Activity Log
-- Persists all user/agent/system actions for the activity feed
-- Date: 2026-02-15

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('task', 'comment', 'cron_job', 'reaction')),
  resource_id INTEGER NOT NULL,
  task_id INTEGER,
  task_name TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor_id ON activity_log(actor_id);
