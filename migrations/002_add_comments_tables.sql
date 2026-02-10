-- Migration: Add Comments System Tables
-- Run: wrangler d1 execute openclaw-taskboard-db --file=./migrations/002_add_comments_tables.sql
-- Date: 2026-02-09

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    parent_comment_id INTEGER,
    author_type TEXT NOT NULL DEFAULT 'human',
    author_id TEXT NOT NULL,
    author_name TEXT,
    content TEXT NOT NULL,
    agent_comment_type TEXT,
    mentions TEXT,
    is_edited INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Comment reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_type TEXT DEFAULT 'human',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Comment notifications table
CREATE TABLE IF NOT EXISTS comment_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    task_id INTEGER,
    comment_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for reactions (one reaction per user per comment per emoji)
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reactions_unique ON comment_reactions(comment_id, emoji, author_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON comment_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON comment_notifications(user_id, is_read);
