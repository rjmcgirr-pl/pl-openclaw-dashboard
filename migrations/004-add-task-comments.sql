-- Migration: Add Task Comments System
-- Created: 2026-02-08

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  parent_comment_id INTEGER NULL,
  author_type TEXT NOT NULL CHECK(author_type IN ('human', 'agent', 'system')),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_comment_type TEXT NULL CHECK(agent_comment_type IN ('status_update', 'question', 'completion', 'generic')),
  mentions JSON, -- ["richard", "clawdbot"]
  is_edited INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Index for faster task comment lookups
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- Comment reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'human',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  UNIQUE(comment_id, emoji, author_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_comment_id ON comment_reactions(comment_id);

-- Comment notifications table
CREATE TABLE IF NOT EXISTS comment_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('mention', 'reply', 'agent_comment')),
  task_id INTEGER NOT NULL,
  comment_id INTEGER NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON comment_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON comment_notifications(user_id, is_read);

-- Add claim fields to tasks table (if not exists)
-- Note: Run separately if columns don't exist
-- ALTER TABLE tasks ADD COLUMN claimed_by TEXT NULL;
-- ALTER TABLE tasks ADD COLUMN claimed_at TEXT NULL;

-- Add created_by field to track who created the task
-- ALTER TABLE tasks ADD COLUMN created_by TEXT NULL;
-- ALTER TABLE tasks ADD COLUMN created_by_type TEXT NULL; -- 'human' or 'agent'

-- Insert sample data for testing (optional, remove for production)
-- INSERT INTO comments (task_id, author_type, author_id, author_name, content, mentions) 
-- VALUES (1, 'human', 'richard@propertyllama.com', 'Richard McGirr', 'Can you look into this?', '["clawdbot"]');
