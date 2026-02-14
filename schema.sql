-- D1 Schema for Cloudflare Task Board
-- Run: wrangler d1 execute taskboard-db --file=./schema.sql
-- Last applied: 2026-02-07

-- Drop table if exists (for clean setup)
DROP TABLE IF EXISTS cron_job_runs;
DROP TABLE IF EXISTS cron_jobs;
DROP TABLE IF EXISTS tasks;

-- Create tasks table
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',
    priority INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    assigned_to_agent INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create cron_jobs table
CREATE TABLE cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    schedule TEXT NOT NULL,
    skill_md_path TEXT,
    skill_md_content TEXT,
    
    -- OpenClaw configuration
    payload TEXT,
    model TEXT DEFAULT 'google/gemini-3-flash-preview',
    thinking TEXT DEFAULT 'low',
    timeout_seconds INTEGER DEFAULT 300,
    deliver BOOLEAN DEFAULT 1,
    
    -- Execution tracking
    last_run_at DATETIME,
    last_status TEXT DEFAULT 'pending',
    last_output TEXT,
    next_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create cron_job_runs table for history
CREATE TABLE cron_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_job_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    status TEXT NOT NULL,
    output TEXT,
    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id)
);

-- Create index on status for faster filtering
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_to_agent ON tasks(assigned_to_agent);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_archived ON tasks(archived);

-- Create index on cron_jobs
CREATE INDEX idx_cron_jobs_status ON cron_jobs(last_status);
CREATE INDEX idx_cron_jobs_runs_job_id ON cron_job_runs(cron_job_id);
CREATE INDEX idx_cron_jobs_runs_started ON cron_job_runs(started_at);

-- Tags table: stores tag definitions
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#808080',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

-- Task_tags junction table: many-to-many relationship between tasks and tags
CREATE TABLE task_tags (
    task_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, tag_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Indexes for tags
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX idx_task_tags_tag_id ON task_tags(tag_id);
CREATE INDEX idx_tags_deleted_at ON tags(deleted_at);

-- ============================================
-- COMMENT SYSTEM TABLES
-- ============================================

-- Comments table for task discussions
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  parent_comment_id INTEGER NULL,
  author_type TEXT NOT NULL CHECK(author_type IN ('human', 'agent', 'system')),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_comment_type TEXT NULL CHECK(agent_comment_type IN ('status_update', 'question', 'completion', 'generic')),
  mentions JSON,
  is_edited INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

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

-- Indexes for comments
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- Indexes for reactions
CREATE INDEX IF NOT EXISTS idx_reactions_comment_id ON comment_reactions(comment_id);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON comment_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON comment_notifications(user_id, is_read);

-- Insert sample tasks for testing
INSERT INTO tasks (name, description, status, priority, blocked, assigned_to_agent) VALUES
    ('Setup D1 database', 'Initialize the taskboard database schema', 'done', 5, 0, 0),
    ('Build Cloudflare Worker API', 'Create REST API endpoints for CRUD operations', 'in_progress', 4, 0, 1),
    ('Create kanban frontend', 'Build HTML/JS kanban board interface', 'up_next', 3, 0, 0),
    ('Write documentation', 'Create README with deployment instructions', 'inbox', 2, 0, 0),
    ('Deploy to Cloudflare', 'Deploy worker and pages to production', 'inbox', 1, 1, 0);
